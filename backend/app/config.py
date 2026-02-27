import os

from pydantic_settings import BaseSettings, SettingsConfigDict
from functools import lru_cache

_env = os.getenv("APP_ENV", "development")
_env_file = f".env.{_env}" if _env != "development" else ".env.development"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=_env_file, extra="ignore")

    # App
    APP_ENV: str = "development"
    APP_NAME: str = "SSMSPL"
    APP_VERSION: str = "1.0.0"
    DEBUG: bool = False

    # Security
    SECRET_KEY: str
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7

    # Database
    DATABASE_URL: str

    # CORS
    ALLOWED_ORIGINS: str = "http://localhost:3000"

    @property
    def allowed_origins_list(self) -> list[str]:
        return [o.strip() for o in self.ALLOWED_ORIGINS.split(",")]

    # Rate limiting
    TRUSTED_PROXY_HEADERS: str = "CF-Connecting-IP,X-Forwarded-For"
    RATE_LIMIT_STORAGE_URI: str = "memory://"

    # Frontend
    FRONTEND_URL: str = "http://localhost:3000"

    # Razorpay
    RAZORPAY_KEY_ID: str = ""
    RAZORPAY_KEY_SECRET: str = ""

    # Email (SMTP)
    SMTP_HOST: str = ""
    SMTP_PORT: int = 587
    SMTP_USER: str = ""
    SMTP_PASSWORD: str = ""
    SMTP_FROM_EMAIL: str = "noreply@ssmspl.com"
    CONTACT_FORM_RECIPIENT: str = "ssmsdapoli@rediffmail.com"


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
