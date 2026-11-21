from datetime import datetime, date
from sqlalchemy import String, Integer, Date, DateTime, Text, ForeignKey, func
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


class Base(DeclarativeBase):
    pass


class Employee(Base):
    __tablename__ = "employees"

    employee_id: Mapped[str] = mapped_column(String(20), primary_key=True)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    email: Mapped[str] = mapped_column(String(160), unique=True, nullable=False)
    department: Mapped[str] = mapped_column(String(80), nullable=False)
    designation: Mapped[str] = mapped_column(String(100), nullable=False)
    role: Mapped[str] = mapped_column(String(30), nullable=False, default="Employee")
    joining_date: Mapped[date] = mapped_column(Date, nullable=False)
    employment_status: Mapped[str] = mapped_column(String(30), nullable=False, default="Active")

    leave_balance: Mapped["LeaveBalance | None"] = relationship(back_populates="employee")
    tickets: Mapped[list["ITTicket"]] = relationship(back_populates="employee")


class LeaveBalance(Base):
    __tablename__ = "leave_balance"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    employee_id: Mapped[str] = mapped_column(
        String(20), ForeignKey("employees.employee_id", ondelete="CASCADE"), unique=True, nullable=False
    )
    annual_leave: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    sick_leave: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    casual_leave: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    used_leave: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    employee: Mapped["Employee"] = relationship(back_populates="leave_balance")


class ITTicket(Base):
    __tablename__ = "it_tickets"

    ticket_id: Mapped[str] = mapped_column(String(30), primary_key=True)
    employee_id: Mapped[str] = mapped_column(
        String(20), ForeignKey("employees.employee_id", ondelete="CASCADE"), nullable=False
    )
    issue_category: Mapped[str] = mapped_column(String(80), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[str] = mapped_column(String(30), nullable=False, default="Open")
    priority: Mapped[str] = mapped_column(String(20), nullable=False, default="Medium")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    employee: Mapped["Employee"] = relationship(back_populates="tickets")


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    event_type: Mapped[str] = mapped_column(String(60), nullable=False)
    actor_id: Mapped[str | None] = mapped_column(String(20), nullable=True)
    actor_role: Mapped[str | None] = mapped_column(String(30), nullable=True)
    tool_or_route: Mapped[str | None] = mapped_column(String(120), nullable=True)
    outcome: Mapped[str] = mapped_column(String(40), nullable=False)
    details: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())