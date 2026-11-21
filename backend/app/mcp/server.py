from mcp.server.mcpserver import MCPServer
from app.database.session import SessionLocal
from app.services.helpdesk_db_service import (
    fetch_employee_profile,
    fetch_leave_balance,
    create_new_it_ticket,
    fetch_ticket_status,
    fetch_employee_tickets,
)

mcp_server = MCPServer("HR-IT Helpdesk PostgreSQL MCP Server")


@mcp_server.tool()
def get_employee_profile(employee_id: str) -> dict:
    """Retrieve profile details for a given employee ID (e.g., E101, HR01, IT01)."""
    db = SessionLocal()
    try:
        profile = fetch_employee_profile(db, employee_id)
        if not profile:
            return {"error": f"Employee '{employee_id}' not found."}
        return profile
    finally:
        db.close()


@mcp_server.tool()
def get_leave_balance(employee_id: str) -> dict:
    """Retrieve leave allocation and usage summary for a given employee ID."""
    db = SessionLocal()
    try:
        balance = fetch_leave_balance(db, employee_id)
        if not balance:
            return {"error": f"Leave balance not found for employee '{employee_id}'."}
        return balance
    finally:
        db.close()


@mcp_server.tool()
def create_it_ticket(
    employee_id: str,
    issue_category: str,
    description: str,
    priority: str = "Medium",
) -> dict:
    """Create a new IT support ticket in PostgreSQL and return the created ticket record."""
    db = SessionLocal()
    try:
        return create_new_it_ticket(
            db=db,
            employee_id=employee_id,
            issue_category=issue_category,
            description=description,
            priority=priority,
        )
    except ValueError as exc:
        return {"error": str(exc)}
    finally:
        db.close()


@mcp_server.tool()
def get_ticket_status(ticket_id: str) -> dict:
    """Check the current status and details of an IT ticket by ticket_id (e.g., TKT-1001)."""
    db = SessionLocal()
    try:
        ticket = fetch_ticket_status(db, ticket_id)
        if not ticket:
            return {"error": f"Ticket '{ticket_id}' not found."}
        return ticket
    finally:
        db.close()


@mcp_server.tool()
def list_employee_tickets(employee_id: str) -> dict:
    """List all IT support tickets associated with a specific employee ID."""
    db = SessionLocal()
    try:
        tickets = fetch_employee_tickets(db, employee_id)
        if tickets is None:
            return {"error": f"Employee '{employee_id}' not found."}
        return {"employee_id": employee_id.strip().upper(), "tickets": tickets, "count": len(tickets)}
    finally:
        db.close()


if __name__ == "__main__":
    mcp_server.run(transport="stdio")