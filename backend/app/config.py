from pathlib import Path
from pydantic_settings import BaseSettings, SettingsConfigDict

ROOT_DIR = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=ROOT_DIR / ".env", extra="ignore")

    google_api_key: str
    gemini_chat_model: str = "gemini-3.8-flash"
    gemini_embedding_model: str = "gemini-embedding-001"

    database_url: str
    chroma_persist_dir: str = str(ROOT_DIR / "chroma_data")
    jwt_secret_key: str = "dev-secret"


settings = Settings()