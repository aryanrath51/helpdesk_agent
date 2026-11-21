from langchain_core.tools import tool
from sqlalchemy.orm import Session
from app.authentication.auth import TokenUser
from app.authentication.rbac import authorize_tool_access
from app.rag.vectorstore import search_policies
from app.services.helpdesk_db_service import (
    fetch_employee_profile,
    fetch_leave_balance,
    create_new_it_ticket,
    fetch_ticket_status,
    fetch_employee_tickets,
    record_audit_log,
)


def build_agent_tools(user: TokenUser, db: Session):
    @tool
    def search_hr_it_policies(query: str) -> dict:
        """Search indexed HR and IT policy documents (leave, WFH, reimbursement, IT security, hardware/software support) and return grounded excerpts with citations."""
        matches = search_policies(query=query, top_k=4, max_distance=0.70)
        record_audit_log(
            db=db,
            event_type="rag_retrieval",
            actor_id=user.employee_id,
            actor_role=user.role,
            tool_or_route="search_hr_it_policies",
            outcome="success" if matches else "no_match",
            details=f"Query='{query[:120]}', matches={len(matches)}",
        )
        if not matches:
            return {
                "found": False,
                "message": "No matching policy sections were found in the indexed HR/IT policy documents.",
                "results": [],
            }
        return {
            "found": True,
            "results": [
                {
                    "citation": m["citation"],
                    "source": m["metadata"].get("source"),
                    "section": m["metadata"].get("section"),
                    "content": m["content"],
                }
                for m in matches
            ],
        }

    @tool
    def get_employee_profile_tool(employee_id: str | None = None) -> dict:
        """Retrieve an employee's profile details (department, designation, role, joining date, status). Defaults to the current user if employee_id is omitted."""
        target_id = (employee_id or user.employee_id).strip().upper()
        allowed, reason = authorize_tool_access(user, "get_employee_profile", target_employee_id=target_id, db=db)
        if not allowed:
            return {"error": reason}

        profile = fetch_employee_profile(db, target_id)
        if not profile:
            return {"error": f"Employee '{target_id}' was not found."}
        return profile

    @tool
    def get_leave_balance_tool(employee_id: str | None = None) -> dict:
        """Retrieve leave balance (annual, sick, casual, used, remaining) for an employee. Defaults to the current user if employee_id is omitted."""
        target_id = (employee_id or user.employee_id).strip().upper()
        allowed, reason = authorize_tool_access(user, "get_leave_balance", target_employee_id=target_id, db=db)
        if not allowed:
            return {"error": reason}

        balance = fetch_leave_balance(db, target_id)
        if not balance:
            return {"error": f"Leave balance for '{target_id}' was not found."}
        return balance

    @tool
    def create_it_ticket_tool(
        issue_category: str,
        description: str,
        priority: str = "Medium",
        employee_id: str | None = None,
    ) -> dict:
        """Create a new IT support ticket in PostgreSQL and return the generated ticket ID and details."""
        target_id = (employee_id or user.employee_id).strip().upper()
        allowed, reason = authorize_tool_access(user, "create_it_ticket", target_employee_id=target_id, db=db)
        if not allowed:
            return {"error": reason}

        try:
            created = create_new_it_ticket(
                db=db,
                employee_id=target_id,
                issue_category=issue_category,
                description=description,
                priority=priority,
            )
            record_audit_log(
                db=db,
                event_type="tool_execution",
                actor_id=user.employee_id,
                actor_role=user.role,
                tool_or_route="create_it_ticket",
                outcome="success",
                details=f"Created ticket {created['ticket_id']} for {target_id}",
            )
            return created
        except ValueError as exc:
            return {"error": str(exc)}

    @tool
    def get_ticket_status_tool(ticket_id: str) -> dict:
        """Check the status, category, priority, and description of an existing IT ticket by ticket_id (e.g., TKT-1001)."""
        allowed, reason = authorize_tool_access(user, "get_ticket_status", db=db)
        if not allowed:
            return {"error": reason}

        ticket = fetch_ticket_status(db, ticket_id)
        if not ticket:
            return {"error": f"IT ticket '{ticket_id}' was not found."}

        if user.role == "Employee" and ticket["employee_id"] != user.employee_id:
            deny_msg = f"Access denied: Employee '{user.employee_id}' cannot view ticket '{ticket['ticket_id']}'."
            record_audit_log(
                db=db,
                event_type="rbac_check",
                actor_id=user.employee_id,
                actor_role=user.role,
                tool_or_route="get_ticket_status",
                outcome="denied",
                details=deny_msg,
            )
            return {"error": deny_msg}

        return ticket

    @tool
    def list_employee_tickets_tool(employee_id: str | None = None) -> dict:
        """List IT support tickets for an employee. Defaults to the current user if employee_id is omitted."""
        target_id = (employee_id or user.employee_id).strip().upper()
        allowed, reason = authorize_tool_access(user, "list_employee_tickets", target_employee_id=target_id, db=db)
        if not allowed:
            return {"error": reason}

        tickets = fetch_employee_tickets(db, target_id)
        if tickets is None:
            return {"error": f"Employee '{target_id}' was not found."}
        return {"employee_id": target_id, "tickets": tickets, "count": len(tickets)}

    return [
        search_hr_it_policies,
        get_employee_profile_tool,
        get_leave_balance_tool,
        create_it_ticket_tool,
        get_ticket_status_tool,
        list_employee_tickets_tool,
    ]