import os

from pydantic import field_validator
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
    ADMIN_PORTAL_MODE: bool = False

    # Shared secret for the host-side health_check.sh to POST events to
    # /api/system-health/events. Must match X-Health-Token header. If unset,
    # event ingestion is disabled (returns 503).
    HEALTH_INGEST_SECRET: str | None = None

    # Shared secret for the laptop-side backup collector to POST events to
    # /api/backups/events. Must match X-Backup-Ingest-Secret header. If
    # unset, ingestion is disabled (returns 503). One value shared between
    # admin + prod backends so the same laptop script can target either.
    BACKUP_INGEST_SECRET: str | None = None

    # Security
    SECRET_KEY: str
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 5  # Short-lived — refresh tokens handle session continuity
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7
    SESSION_IDLE_TIMEOUT_MINUTES: int = 10  # Force-logout after this many minutes of inactivity

    # Database
    DATABASE_URL: str
    # Optional secondary DB for sync-check diagnostics. Points to ssmspl_sync (mirrors prod).
    # When unset, the sync-check endpoint is disabled.
    SYNC_DATABASE_URL: str | None = None

    # CORS
    ALLOWED_ORIGINS: str = "http://localhost:3000"

    @property
    def allowed_origins_list(self) -> list[str]:
        return [o.strip() for o in self.ALLOWED_ORIGINS.split(",")]

    # Redis (token blacklist — DB 0; rate limiting uses DB 1 separately)
    REDIS_URL: str = ""  # Empty = blacklist disabled (dev without Redis)

    # Rate limiting
    TRUSTED_PROXY_HEADERS: str = "CF-Connecting-IP,X-Forwarded-For"
    RATE_LIMIT_STORAGE_URI: str = "memory://"

    # Frontend
    FRONTEND_URL: str = "http://localhost:3000"

    # Backend URL (used for payment callbacks, etc.)
    BACKEND_URL: str = "http://localhost:8000"

    # Airpay Payment Gateway (classic redirect kit)
    AIRPAY_MERCHANT_ID: str = ""
    AIRPAY_USERNAME: str = ""
    AIRPAY_PASSWORD: str = ""
    AIRPAY_SECRET_KEY: str = ""
    # client_id + client_secret drive the v4 OAuth2 token exchange.
    # AIRPAY_API_KEY is the most likely value for client_secret (confirm at test).
    AIRPAY_API_KEY: str = ""
    AIRPAY_CLIENT_ID: str = ""
    AIRPAY_CLIENT_SECRET: str = ""
    # The pay/v4 step needs the MID with an "M" prefix (e.g. M335854), while the
    # OAuth2 step uses the plain numeric MID. If left blank, derived as "M"+MID.
    AIRPAY_PAY_MERCHANT_ID: str = ""
    AIRPAY_BASE_URL: str = "https://payments.airpay.co.in"
    # OAuth2 token endpoint for the v4 server-side SDK flow.
    AIRPAY_OAUTH_URL: str = "https://kraken.airpay.co.in/airpay/pay/v4/api/oauth2/"
    # Domain registered with Airpay (sent base64 as mer_dom in the v4 payload).
    AIRPAY_MERCHANT_DOMAIN: str = "https://carferry.online"
    # Sandbox vs live decision for the payment-confirmation gate. When TRUE, the
    # (already hash-verified) callback is trusted directly and the booking is
    # confirmed — Airpay's server-side verify.php only works on LIVE MIDs, so it
    # cannot validate sandbox transactions. When FALSE (production/live), a
    # SUCCESS callback confirms the booking ONLY if verify.php also returns 200
    # (fail closed). Decided HERE in server config, NEVER from the gateway
    # payload's TXN_MODE field (which is attacker-forgeable). MUST be false for
    # real-money go-live.
    AIRPAY_TEST_MODE: bool = False

    @field_validator("SECRET_KEY")
    @classmethod
    def secret_key_must_be_strong(cls, v: str) -> str:
        if len(v) < 32:
            raise ValueError("SECRET_KEY must be at least 32 characters")
        return v

    # QZ Tray signing key (PEM-encoded private key for QZ Tray certificate)
    QZ_PRIVATE_KEY_PEM: str = ""

    # Payment simulation — hard override toggle.
    # When true, ALL payments use the simulator regardless of Airpay credentials.
    # Use as a fallback if Airpay is down. Set back to false to resume real payments.
    PAYMENT_SIMULATION: bool = False

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
