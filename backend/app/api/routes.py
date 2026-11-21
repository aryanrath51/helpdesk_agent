from pathlib import Path
from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from sqlalchemy.orm import Session

from app.authentication.auth import TokenUser, create_access_token, get_current_user
from app.authentication.rbac import authorize_tool_access
from app.database.models import AuditLog, Employee, ITTicket, LeaveBalance
from app.database.session import get_db
from app.guardrails.input_guard import check_input_guardrails
from app.graph.workflow import run_helpdesk_agent
from app.rag.chunker import chunk_records
from app.rag.loader import load_policy_document
from app.rag.vectorstore import get_chroma_collection, ingest_chunks
from app.schemas.api_schemas import (
    ChatRequest,
    ChatResponse,
    LoginRequest,
    LoginResponse,
    TicketCreateRequest,
)
from app.services.helpdesk_db_service import (
    create_new_it_ticket,
    fetch_leave_balance,
    fetch_ticket_status,
    record_audit_log,
)

router = APIRouter(prefix="/api")

UPLOAD_DIR = Path(__file__).resolve().parents[3] / "documents" / "sample_policies"


@router.post("/auth/login", response_model=LoginResponse)
def login(payload: LoginRequest, db: Session = Depends(get_db)):
    emp_id = payload.employee_id.strip().upper()
    emp = db.query(Employee).filter(Employee.employee_id == emp_id).first()
    if not emp or emp.employment_status != "Active":
        record_audit_log(
            db=db,
            event_type="auth_login",
            actor_id=emp_id,
            tool_or_route="/api/auth/login",
            outcome="denied",
            details="Invalid or inactive employee_id",
        )
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Active employee '{emp_id}' not found.",
        )

    token = create_access_token(emp)
    record_audit_log(
        db=db,
        event_type="auth_login",
        actor_id=emp.employee_id,
        actor_role=emp.role,
        tool_or_route="/api/auth/login",
        outcome="success",
        details="Issued JWT access token",
    )
    return LoginResponse(
        access_token=token,
        employee_id=emp.employee_id,
        name=emp.name,
        role=emp.role,
        department=emp.department,
    )


@router.post("/chat", response_model=ChatResponse)
def chat(
    payload: ChatRequest,
    current_user: TokenUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    allowed, block_message = check_input_guardrails(
        message=payload.message,
        actor_id=current_user.employee_id,
        actor_role=current_user.role,
        db=db,
    )
    if not allowed:
        return ChatResponse(
            reply=block_message or "Request blocked by security guardrails.",
            citations=[],
            tools_used=[],
            blocked=True,
        )

    result = run_helpdesk_agent(user=current_user, message=payload.message, db=db)
    return ChatResponse(
        reply=result["reply"],
        citations=result["citations"],
        tools_used=result["tools_used"],
        blocked=False,
    )


@router.get("/employees/{employee_id}/leave-balance")
def leave_balance_endpoint(
    employee_id: str,
    current_user: TokenUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    target_id = employee_id.strip().upper()
    allowed, reason = authorize_tool_access(
        user=current_user,
        tool_name="get_leave_balance",
        target_employee_id=target_id,
        db=db,
    )
    if not allowed:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=reason)

    balance = fetch_leave_balance(db, target_id)
    if not balance:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Leave balance not found.")
    return balance


@router.post("/tickets", status_code=status.HTTP_201_CREATED)
def create_ticket_endpoint(
    payload: TicketCreateRequest,
    current_user: TokenUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    target_id = (payload.employee_id or current_user.employee_id).strip().upper()
    allowed, reason = authorize_tool_access(
        user=current_user,
        tool_name="create_it_ticket",
        target_employee_id=target_id,
        db=db,
    )
    if not allowed:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=reason)

    try:
        return create_new_it_ticket(
            db=db,
            employee_id=target_id,
            issue_category=payload.issue_category,
            description=payload.description,
            priority=payload.priority,
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))


@router.get("/tickets/{ticket_id}")
def ticket_status_endpoint(
    ticket_id: str,
    current_user: TokenUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    allowed, reason = authorize_tool_access(
        user=current_user,
        tool_name="get_ticket_status",
        db=db,
    )
    if not allowed:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=reason)

    ticket = fetch_ticket_status(db, ticket_id)
    if not ticket:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Ticket not found.")

    if current_user.role == "Employee" and ticket["employee_id"] != current_user.employee_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied: You can only view your own IT tickets.",
        )
    return ticket


@router.post("/documents/upload")
async def upload_policy_document(
    file: UploadFile = File(...),
    current_user: TokenUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if current_user.role not in {"HR Administrator", "IT Support Administrator"}:
        record_audit_log(
            db=db,
            event_type="document_upload",
            actor_id=current_user.employee_id,
            actor_role=current_user.role,
            tool_or_route="/api/documents/upload",
            outcome="denied",
            details="Insufficient role to upload policy documents",
        )
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only HR or IT Administrators can upload policy documents.",
        )

    suffix = Path(file.filename or "").suffix.lower()
    if suffix not in {".txt", ".pdf", ".docx"}:
        raise HTTPException(status_code=400, detail="Unsupported file format. Use .txt, .pdf, or .docx.")

    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    safe_name = Path(file.filename).name
    dest_path = UPLOAD_DIR / safe_name
    content = await file.read()
    dest_path.write_bytes(content)

    records = load_policy_document(dest_path)
    chunks = chunk_records(records)
    chunk_count = ingest_chunks(safe_name, chunks)

    record_audit_log(
        db=db,
        event_type="document_upload",
        actor_id=current_user.employee_id,
        actor_role=current_user.role,
        tool_or_route="/api/documents/upload",
        outcome="success",
        details=f"Ingested {chunk_count} chunks from {safe_name}",
    )
    return {"filename": safe_name, "chunks_ingested": chunk_count, "status": "indexed"}


@router.get("/documents")
def list_indexed_documents(current_user: TokenUser = Depends(get_current_user)):
    collection = get_chroma_collection()
    data = collection.get(include=["metadatas"])
    sources: dict[str, int] = {}
    for meta in data.get("metadatas") or []:
        src = (meta or {}).get("source") or "unknown"
        sources[src] = sources.get(src, 0) + 1
    return {
        "total_chunks": collection.count(),
        "documents": [{"filename": k, "chunks": v} for k, v in sorted(sources.items())],
    }


@router.get("/audit-logs")
def get_audit_logs(
    limit: int = 30,
    current_user: TokenUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if current_user.role not in {"HR Administrator", "IT Support Administrator"}:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Audit logs are restricted to HR or IT Administrators.",
        )
    logs = db.query(AuditLog).order_by(AuditLog.id.desc()).limit(min(limit, 100)).all()
    return [
        {
            "id": l.id,
            "event_type": l.event_type,
            "actor_id": l.actor_id,
            "actor_role": l.actor_role,
            "tool_or_route": l.tool_or_route,
            "outcome": l.outcome,
            "details": l.details,
            "created_at": l.created_at.isoformat() if l.created_at else None,
        }
        for l in logs
    ]
    
    
@router.get("/dashboard")
def get_dashboard(
    current_user: TokenUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    is_admin = current_user.role in {"HR Administrator", "IT Support Administrator"}
    emp = db.query(Employee).filter(Employee.employee_id == current_user.employee_id).first()
    lb = db.query(LeaveBalance).filter(LeaveBalance.employee_id == current_user.employee_id).first()

    ticket_query = db.query(ITTicket).order_by(ITTicket.created_at.desc())
    if not is_admin:
        ticket_query = ticket_query.filter(ITTicket.employee_id == current_user.employee_id)
    tickets = ticket_query.limit(25).all()

    return {
        "is_admin": is_admin,
        "profile": {
            "employee_id": current_user.employee_id,
            "name": emp.name if emp else current_user.employee_id,
            "email": emp.email if emp else None,
            "department": emp.department if emp else None,
            "designation": emp.designation if emp else None,
            "role": current_user.role,
        },
        "leave_balance": (
            {
                "annual_leave": lb.annual_leave,
                "sick_leave": lb.sick_leave,
                "casual_leave": lb.casual_leave,
                "used_leave": lb.used_leave,
                "total_remaining": lb.annual_leave + lb.sick_leave + lb.casual_leave,
            }
            if lb
            else None
        ),
        "tickets": [
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
        ],
    }


@router.patch("/tickets/{ticket_id}/status")
def update_ticket_status(
    ticket_id: str,
    payload: dict,
    current_user: TokenUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if current_user.role not in {"HR Administrator", "IT Support Administrator"}:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only HR or IT Administrators can update ticket status.",
        )

    new_status = str(payload.get("status", "")).strip()
    if new_status not in {"Open", "In Progress", "Resolved", "Closed"}:
        raise HTTPException(status_code=400, detail="Invalid ticket status.")

    ticket = db.query(ITTicket).filter(ITTicket.ticket_id == ticket_id.strip().upper()).first()
    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket not found.")

    ticket.status = new_status
    db.commit()
    record_audit_log(
        db=db,
        event_type="ticket_status_update",
        actor_id=current_user.employee_id,
        actor_role=current_user.role,
        tool_or_route=f"/api/tickets/{ticket.ticket_id}/status",
        outcome="success",
        details=f"Updated {ticket.ticket_id} to {new_status}",
    )
    return {"ticket_id": ticket.ticket_id, "status": ticket.status}