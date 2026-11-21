import time
from typing import Annotated, TypedDict
from langchain_core.messages import (
    AIMessage,
    BaseMessage,
    HumanMessage,
    SystemMessage,
    ToolMessage,
)
from langchain_google_genai import ChatGoogleGenerativeAI
from langgraph.graph import StateGraph, START, END
from langgraph.graph.message import add_messages
from sqlalchemy.orm import Session

from app.authentication.auth import TokenUser
from app.agents.helpdesk_agent import SYSTEM_PROMPT, get_chat_model
from app.agents.tools import build_agent_tools
from app.config import settings
from app.guardrails.output_guard import sanitize_output

CANDIDATE_MODELS = [
    "gemini-3.1-flash-lite",
    "gemini-3.5-flash",
    "gemini-3.6-flash",
    "gemini-3.7-flash",
]


class AgentState(TypedDict):
    messages: Annotated[list[BaseMessage], add_messages]
    citations: list[str]
    tools_used: list[str]


def _make_bound_model(model_name: str, tools: list):
    kwargs = {
        "model": model_name,
        "google_api_key": settings.google_api_key,
        "max_retries": 0,
        "timeout": 10,
    }
    if not model_name.startswith(("gemini-3.6", "gemini-3.7")):
        kwargs["temperature"] = 0.1
    return ChatGoogleGenerativeAI(**kwargs).bind_tools(tools)


def build_helpdesk_graph(user: TokenUser, db: Session):
    tools = build_agent_tools(user=user, db=db)
    tool_map = {t.name: t for t in tools}
    llm_with_tools = get_chat_model(tools)

    fallback_llms = [
        _make_bound_model(model_name, tools)
        for model_name in CANDIDATE_MODELS
        if model_name != settings.gemini_chat_model
    ]

    def agent_node(state: AgentState) -> dict:
        msgs = list(state["messages"])
        if not any(isinstance(m, SystemMessage) for m in msgs):
            msgs = [SystemMessage(content=SYSTEM_PROMPT)] + msgs

        try:
            response = llm_with_tools.invoke(msgs)
            return {"messages": [response]}
        except Exception as exc:
            err_str = str(exc)
            if any(
                code in err_str
                for code in ("503", "504", "DEADLINE_EXCEEDED", "UNAVAILABLE", "Timed out")
            ):
                for fb_llm in fallback_llms:
                    time.sleep(0.5)
                    try:
                        fb_response = fb_llm.invoke(msgs)
                        return {"messages": [fb_response]}
                    except Exception as fb_exc:
                        exc = fb_exc
                        continue

            tool_outputs = [
                f"- {m.name}: {m.content}"
                for m in msgs
                if isinstance(m, ToolMessage)
            ]
            if tool_outputs:
                summary = (
                    "Retrieved helpdesk data (model synthesis temporarily unavailable):\n"
                    + "\n".join(tool_outputs)
                )
                return {"messages": [AIMessage(content=summary)]}

            return {
                "messages": [
                    AIMessage(
                        content=f"Gemini service error ({type(exc).__name__}): {exc}"
                    )
                ]
            }

    def tool_node(state: AgentState) -> dict:
        last_msg = state["messages"][-1]
        tool_messages: list[ToolMessage] = []
        used = list(state.get("tools_used") or [])
        citations = list(state.get("citations") or [])

        for call in getattr(last_msg, "tool_calls", []) or []:
            name = call["name"]
            args = call.get("args") or {}
            call_id = call["id"]
            used.append(name)

            tool_fn = tool_map.get(name)
            if not tool_fn:
                result = {"error": f"Unknown tool '{name}'"}
            else:
                result = tool_fn.invoke(args)

            if isinstance(result, dict) and result.get("found"):
                for item in result.get("results") or []:
                    cit = item.get("citation")
                    if cit and cit not in citations:
                        citations.append(cit)

            tool_messages.append(
                ToolMessage(content=str(result), tool_call_id=call_id, name=name)
            )

        return {
            "messages": tool_messages,
            "tools_used": used,
            "citations": citations,
        }

    def should_continue(state: AgentState) -> str:
        last_msg = state["messages"][-1]
        if getattr(last_msg, "tool_calls", None):
            return "tools"
        return END

    graph = StateGraph(AgentState)
    graph.add_node("agent", agent_node)
    graph.add_node("tools", tool_node)
    graph.add_edge(START, "agent")
    graph.add_conditional_edges("agent", should_continue, {"tools": "tools", END: END})
    graph.add_edge("tools", "agent")

    return graph.compile()


def run_helpdesk_agent(user: TokenUser, message: str, db: Session) -> dict:
    compiled = build_helpdesk_graph(user=user, db=db)
    initial_state: AgentState = {
        "messages": [HumanMessage(content=message)],
        "citations": [],
        "tools_used": [],
    }
    final_state = compiled.invoke(initial_state)

    raw_reply = ""
    for msg in reversed(final_state["messages"]):
        if getattr(msg, "type", None) == "ai" and not getattr(msg, "tool_calls", None):
            content = msg.content
            if isinstance(content, list):
                raw_reply = "".join(
                    part.get("text", "") if isinstance(part, dict) else str(part)
                    for part in content
                )
            else:
                raw_reply = str(content)
            break

    clean_reply = sanitize_output(
        response_text=raw_reply or "I could not generate a response for that request.",
        actor_id=user.employee_id,
        actor_role=user.role,
        db=db,
    )

    return {
        "reply": clean_reply,
        "citations": final_state.get("citations") or [],
        "tools_used": list(dict.fromkeys(final_state.get("tools_used") or [])),
    }