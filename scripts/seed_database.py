import sys
from pathlib import Path
from datetime import date

sys.path.append(str(Path(__file__).resolve().parents[1] / "backend"))

from app.database.session import engine, SessionLocal
from app.database.models import Base, Employee, LeaveBalance, ITTicket


def seed():
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()

    if db.query(Employee).count() > 0:
        print("Database already seeded.")
        db.close()
        return

    employees = [
        Employee(
            employee_id="E101",
            name="Aarav Sharma",
            email="aarav.sharma@novacorp-demo.com",
            department="Engineering",
            designation="Software Engineer",
            role="Employee",
            joining_date=date(2024, 3, 15),
            employment_status="Active",
        ),
        Employee(
            employee_id="E102",
            name="Meera Nair",
            email="meera.nair@novacorp-demo.com",
            department="Product",
            designation="Product Analyst",
            role="Employee",
            joining_date=date(2023, 7, 1),
            employment_status="Active",
        ),
        Employee(
            employee_id="E103",
            name="Rohan Verma",
            email="rohan.verma@novacorp-demo.com",
            department="Finance",
            designation="Senior Accountant",
            role="Employee",
            joining_date=date(2022, 11, 10),
            employment_status="Active",
        ),
        Employee(
            employee_id="HR01",
            name="Kavita Menon",
            email="kavita.menon@novacorp-demo.com",
            department="Human Resources",
            designation="HR Operations Lead",
            role="HR Administrator",
            joining_date=date(2021, 5, 20),
            employment_status="Active",
        ),
        Employee(
            employee_id="IT01",
            name="Vikram Rao",
            email="vikram.rao@novacorp-demo.com",
            department="IT Infrastructure",
            designation="Senior Systems Engineer",
            role="IT Support Administrator",
            joining_date=date(2022, 1, 12),
            employment_status="Active",
        ),
    ]
    db.add_all(employees)
    db.flush()

    balances = [
        LeaveBalance(employee_id="E101", annual_leave=14, sick_leave=8, casual_leave=5, used_leave=6),
        LeaveBalance(employee_id="E102", annual_leave=12, sick_leave=10, casual_leave=4, used_leave=8),
        LeaveBalance(employee_id="E103", annual_leave=18, sick_leave=9, casual_leave=6, used_leave=3),
        LeaveBalance(employee_id="HR01", annual_leave=20, sick_leave=10, casual_leave=6, used_leave=2),
        LeaveBalance(employee_id="IT01", annual_leave=16, sick_leave=8, casual_leave=5, used_leave=4),
    ]
    db.add_all(balances)

    tickets = [
        ITTicket(
            ticket_id="TKT-1001",
            employee_id="E101",
            issue_category="VPN & Network",
            description="Corporate VPN disconnects every 15 minutes on home Wi-Fi.",
            status="In Progress",
            priority="High",
        ),
        ITTicket(
            ticket_id="TKT-1002",
            employee_id="E102",
            issue_category="Software Access",
            description="Requesting license access to Figma Enterprise for Q4 sprint.",
            status="Open",
            priority="Medium",
        ),
    ]
    db.add_all(tickets)

    db.commit()
    db.close()
    print("Seeded 5 synthetic employees, leave balances, and IT tickets successfully!")


if __name__ == "__main__":
    seed()