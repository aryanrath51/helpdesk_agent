from datetime import datetime, timezone
from sqlalchemy.orm import Session
from app.database.models import Employee, LeaveBalance, ITTicket, AuditLog


def record_audit_log(
    db: Session,
    event_type: str,
    outcome: str,
    actor_id: str | None = None,
    actor_role: str | None = None,
    tool_or_route: str | None = None,
    details: str | None = None,
) -> None:
    log_entry = AuditLog(
        event_type=event_type,
        actor_id=actor_id,
        actor_role=actor_role,
        tool_or_route=tool_or_route,
        outcome=outcome,
        details=details,
    )
    db.add(log_entry)
    db.commit()


def fetch_employee_profile(db: Session, employee_id: str) -> dict | None:
    emp = db.query(Employee).filter(Employee.employee_id == employee_id.strip().upper()).first()
    if not emp:
        return None
    return {
        "employee_id": emp.employee_id,
        "name": emp.name,
        "email": emp.email,
        "department": emp.department,
        "designation": emp.designation,
        "role": emp.role,
        "joining_date": emp.joining_date.isoformat(),
        "employment_status": emp.employment_status,
    }


def fetch_leave_balance(db: Session, employee_id: str) -> dict | None:
    emp_id = employee_id.strip().upper()
    emp = db.query(Employee).filter(Employee.employee_id == emp_id).first()
    if not emp:
        return None

    lb = db.query(LeaveBalance).filter(LeaveBalance.employee_id == emp_id).first()
    if not lb:
        return {
            "employee_id": emp_id,
            "employee_name": emp.name,
            "annual_leave": 0,
            "sick_leave": 0,
            "casual_leave": 0,
            "used_leave": 0,
            "remaining_total_leave": 0,
        }

    total_allocated = lb.annual_leave + lb.sick_leave + lb.casual_leave
    remaining_total = max(total_allocated - lb.used_leave, 0)
    return {
        "employee_id": emp_id,
        "employee_name": emp.name,
        "annual_leave": lb.annual_leave,
        "sick_leave": lb.sick_leave,
        "casual_leave": lb.casual_leave,
        "used_leave": lb.used_leave,
        "remaining_total_leave": remaining_total,
    }


def create_new_it_ticket(
    db: Session,
    employee_id: str,
    issue_category: str,
    description: str,
    priority: str = "Medium",
) -> dict:
    emp_id = employee_id.strip().upper()
    emp = db.query(Employee).filter(Employee.employee_id == emp_id).first()
    if not emp:
        raise ValueError(f"Employee '{emp_id}' does not exist.")

    allowed_priorities = {"Low", "Medium", "High", "Critical"}
    normalized_priority = priority.strip().capitalize()
    if normalized_priority not in allowed_priorities:
        normalized_priority = "Medium"

    clean_category = issue_category.strip()
    clean_desc = description.strip()
    if not clean_category or not clean_desc:
        raise ValueError("Both issue_category and description are required to create an IT ticket.")

    existing_count = db.query(ITTicket).count()
    suffix = 1001 + existing_count
    ticket_id = f"TKT-{suffix}"
    while db.query(ITTicket).filter(ITTicket.ticket_id == ticket_id).first() is not None:
        suffix += 1
        ticket_id = f"TKT-{suffix}"

    ticket = ITTicket(
        ticket_id=ticket_id,
        employee_id=emp_id,
        issue_category=clean_category,
        description=clean_desc,
        status="Open",
        priority=normalized_priority,
        created_at=datetime.now(timezone.utc),
    )
    db.add(ticket)
    db.commit()
    db.refresh(ticket)

    return {
        "ticket_id": ticket.ticket_id,
        "employee_id": ticket.employee_id,
        "employee_name": emp.name,
        "issue_category": ticket.issue_category,
        "description": ticket.description,
        "status": ticket.status,
        "priority": ticket.priority,
        "created_at": ticket.created_at.isoformat() if ticket.created_at else None,
    }


def fetch_ticket_status(db: Session, ticket_id: str) -> dict | None:
    tkt_id = ticket_id.strip().upper()
    tkt = db.query(ITTicket).filter(ITTicket.ticket_id == tkt_id).first()
    if not tkt:
        return None
    return {
        "ticket_id": tkt.ticket_id,
        "employee_id": tkt.employee_id,
        "issue_category": tkt.issue_category,
        "description": tkt.description,
        "status": tkt.status,
        "priority": tkt.priority,
        "created_at": tkt.created_at.isoformat() if tkt.created_at else None,
    }


def fetch_employee_tickets(db: Session, employee_id: str) -> list[dict] | None:
    emp_id = employee_id.strip().upper()
    emp = db.query(Employee).filter(Employee.employee_id == emp_id).first()
    if not emp:
        return None

    tickets = (
        db.query(ITTicket)
        .filter(ITTicket.employee_id == emp_id)
        .order_by(ITTicket.created_at.desc())
        .all()
    )
    return [
        {
            "ticket_id": t.ticket_id,
            "employee_id": t.employee_id,
            "issue_category": t.issue_category,
            "description": t.description,
            "status": t.status,
            "priority": t.priority,
            "created_at": t.created_at.isoformat() if t.created_at else None,
        }
        for t in tickets
    ]