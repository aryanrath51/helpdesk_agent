import re
from sqlalchemy.orm import Session
from app.services.helpdesk_db_service import record_audit_log

INJECTION_PATTERNS: list[tuple[str, re.Pattern[str]]] = [
    ("ignore_instructions", re.compile(r"\b(ignore|disregard|forget|bypass)\b.{0,40}\b(previous|prior|above|system)\b.{0,20}\b(instructions?|rules?|prompt)\b", re.IGNORECASE)),
    ("reveal_system_prompt", re.compile(r"\b(reveal|show|print|dump|expose)\b.{0,30}\b(system prompt|hidden instructions?|developer message|api key|jwt)\b", re.IGNORECASE)),
    ("jailbreak_persona", re.compile(r"\b(dan mode|developer mode|act as an unrestricted|jailbreak)\b", re.IGNORECASE)),
    ("mass_data_exfiltration", re.compile(r"\b(dump|export|list all|show all)\b.{0,30}\b(employees?|salaries?|passwords?|credentials?|records?|users?)\b", re.IGNORECASE)),
]


def check_input_guardrails(
    message: str,
    actor_id: str | None = None,
    actor_role: str | None = None,
    db: Session | None = None,
) -> tuple[bool, str | None]:
    cleaned = (message or "").strip()
    if not cleaned:
        return False, "Please enter a valid HR or IT helpdesk question."

    if len(cleaned) > 2500:
        if db is not None:
            record_audit_log(
                db=db,
                event_type="input_guardrail",
                actor_id=actor_id,
                actor_role=actor_role,
                tool_or_route="input_guard",
                outcome="blocked",
                details="Input exceeded maximum allowed length (2500 chars)",
            )
        return False, "Your message exceeds the maximum allowed length of 2,500 characters."

    for rule_name, pattern in INJECTION_PATTERNS:
        if pattern.search(cleaned):
            if db is not None:
                record_audit_log(
                    db=db,
                    event_type="input_guardrail",
                    actor_id=actor_id,
                    actor_role=actor_role,
                    tool_or_route="input_guard",
                    outcome="blocked",
                    details=f"Matched pattern: {rule_name}",
                )
            return (
                False,
                "I cannot process requests that attempt to override system instructions, "
                "expose internal prompts/credentials, or bulk-extract employee records. "
                "Please ask a legitimate HR policy, leave balance, or IT support question.",
            )

    return True, None