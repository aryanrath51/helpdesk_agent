from pydantic import BaseModel, Field


class LoginRequest(BaseModel):
    employee_id: str = Field(..., min_length=2, max_length=20)


class LoginResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    employee_id: str
    name: str
    role: str
    department: str


class ChatRequest(BaseModel):
    message: str = Field(..., min_length=1, max_length=3000)


class ChatResponse(BaseModel):
    reply: str
    citations: list[str] = []
    tools_used: list[str] = []
    blocked: bool = False


class TicketCreateRequest(BaseModel):
    issue_category: str = Field(..., min_length=2, max_length=80)
    description: str = Field(..., min_length=5, max_length=1000)
    priority: str = Field(default="Medium")
    employee_id: str | None = None