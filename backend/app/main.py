from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.api.routes import router

app = FastAPI(
    title="NovaCorp HR & IT Helpdesk AI Agent",
    version="1.0.0",
    description="RAG + MCP + LangGraph + RBAC/Guardrails HR & IT Helpdesk Backend",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(router)


@app.get("/health")
def health_check():
    return {"status": "ok", "service": "hr-it-helpdesk-backend"}