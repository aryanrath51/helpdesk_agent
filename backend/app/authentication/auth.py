from datetime import datetime, timedelta, timezone
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
import jwt
from pydantic import BaseModel
from sqlalchemy.orm import Session
from app.config import settings
from app.database.session import get_db
from app.database.models import Employee
from app.services.helpdesk_db_service import record_audit_log

security = HTTPBearer(auto_error=False)

ALGORITHM = "HS256"
TOKEN_EXPIRE_HOURS = 12


class TokenUser(BaseModel):
    employee_id: str
    name: str
    email: str
    role: str
    department: str


def create_access_token(employee: Employee) -> str:
    payload = {
        "sub": employee.employee_id,
        "name": employee.name,
        "email": employee.email,
        "role": employee.role,
        "department": employee.department,
        "exp": datetime.now(timezone.utc) + timedelta(hours=TOKEN_EXPIRE_HOURS),
    }
    return jwt.encode(payload, settings.jwt_secret_key, algorithm=ALGORITHM)


def decode_access_token(token: str) -> dict:
    return jwt.decode(token, settings.jwt_secret_key, algorithms=[ALGORITHM])


def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(security),
    db: Session = Depends(get_db),
) -> TokenUser:
    if credentials is None or not credentials.credentials:
        record_audit_log(
            db=db,
            event_type="auth_check",
            outcome="denied",
            details="Missing Bearer token",
        )
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required. Provide a valid Bearer token.",
        )

    try:
        payload = decode_access_token(credentials.credentials)
        emp_id = payload.get("sub")
        if not emp_id:
            raise ValueError("Missing subject in token")
    except Exception:
        record_audit_log(
            db=db,
            event_type="auth_check",
            outcome="denied",
            details="Invalid or expired token",
        )
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired authentication token.",
        )

    emp = db.query(Employee).filter(Employee.employee_id == emp_id).first()
    if not emp or emp.employment_status != "Active":
        record_audit_log(
            db=db,
            event_type="auth_check",
            actor_id=emp_id,
            outcome="denied",
            details="Employee not found or inactive",
        )
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Employee account is inactive or does not exist.",
        )

    return TokenUser(
        employee_id=emp.employee_id,
        name=emp.name,
        email=emp.email,
        role=emp.role,
        department=emp.department,
    )