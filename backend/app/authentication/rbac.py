from sqlalchemy.orm import Session
from app.authentication.auth import TokenUser
from app.services.helpdesk_db_service import record_audit_log


TOOL_ALLOWED_ROLES: dict[str, set[str]] = {
    "get_employee_profile": {"Employee", "HR Administrator", "IT Support Administrator"},
    "get_leave_balance": {"Employee", "HR Administrator", "IT Support Administrator"},
    "create_it_ticket": {"Employee", "HR Administrator", "IT Support Administrator"},
    "get_ticket_status": {"Employee", "HR Administrator", "IT Support Administrator"},
    "list_employee_tickets": {"Employee", "HR Administrator", "IT Support Administrator"},
}


def authorize_tool_access(
    user: TokenUser,
    tool_name: str,
    target_employee_id: str | None = None,
    db: Session | None = None,
) -> tuple[bool, str]:
    allowed_roles = TOOL_ALLOWED_ROLES.get(tool_name, set())
    if user.role not in allowed_roles:
        reason = f"Role '{user.role}' is not permitted to invoke tool '{tool_name}'."
        if db is not None:
            record_audit_log(
                db=db,
                event_type="rbac_check",
                actor_id=user.employee_id,
                actor_role=user.role,
                tool_or_route=tool_name,
                outcome="denied",
                details=reason,
            )
        return False, reason

    normalized_target = target_employee_id.strip().upper() if target_employee_id else None

    if user.role == "Employee":
        if tool_name in {"get_employee_profile", "get_leave_balance", "list_employee_tickets"}:
            if normalized_target and normalized_target != user.employee_id:
                reason = (
                    f"Access denied: Employee '{user.employee_id}' cannot access "
                    f"'{tool_name}' data belonging to '{normalized_target}'."
                )
                if db is not None:
                    record_audit_log(
                        db=db,
                        event_type="rbac_check",
                        actor_id=user.employee_id,
                        actor_role=user.role,
                        tool_or_route=tool_name,
                        outcome="denied",
                        details=reason,
                    )
                return False, reason

    if db is not None:
        record_audit_log(
            db=db,
            event_type="rbac_check",
            actor_id=user.employee_id,
            actor_role=user.role,
            tool_or_route=tool_name,
            outcome="allowed",
            details=f"Target={normalized_target or 'self'}",
        )

    return True, "Authorized"