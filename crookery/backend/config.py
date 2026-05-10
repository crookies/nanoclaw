from pathlib import Path
from pydantic_settings import BaseSettings, SettingsConfigDict


def _default_nanoclaw_root() -> str:
    # crookery/backend/ → crookery/ → nanoclaw/
    return str(Path(__file__).parent.parent.parent.resolve())


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    nanoclaw_root: str = _default_nanoclaw_root()
    crookery_host: str = "127.0.0.1"
    crookery_port: int = 4123
    crookery_password_hash: str = ""

    @property
    def central_db_path(self) -> Path:
        return Path(self.nanoclaw_root) / "data" / "v2.db"

    @property
    def sessions_dir(self) -> Path:
        return Path(self.nanoclaw_root) / "data" / "v2-sessions"

    @property
    def logs_dir(self) -> Path:
        return Path(self.nanoclaw_root) / "logs"


settings = Settings()
