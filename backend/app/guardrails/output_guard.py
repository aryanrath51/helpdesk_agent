import re
from sqlalchemy.orm import Session
from app.services.helpdesk_db_service import record_audit_log

SENSITIVE_PATTERNS: list[tuple[str, re.Pattern[str]]] = [
    ("openai_or_google_key", re.compile(r"\b(sk-[A-Za-z0-9_-]{15,}|AIza[0-9A-Za-z\-_]{20,})\b")),
    ("jwt_like_token", re.compile(r"\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b")),
    ("ssn_pattern", re.compile(r"\b\d{3}-\d{2}-\d{4}\b")),
]


def sanitize_output(
    response_text: str,
    actor_id: str | None = None,
    actor_role: str | None = None,
    db: Session | None = None,
) -> str:
    redacted = response_text
    triggered: list[str] = []

    for label, pattern in SENSITIVE_PATTERNS:
        if pattern.search(redacted):
            triggered.append(label)
            redacted = pattern.sub("[REDACTED_SENSITIVE_DATA]", redacted)

    if triggered and db is not None:
        record_audit_log(
            db=db,
            event_type="output_guardrail",
            actor_id=actor_id,
            actor_role=actor_role,
            tool_or_route="output_guard",
            outcome="redacted",
            details=f"Redacted patterns: {', '.join(triggered)}",
        )

    return redacted