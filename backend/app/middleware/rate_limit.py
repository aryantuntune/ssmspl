from slowapi import Limiter
from slowapi.errors import RateLimitExceeded
from starlette.requests import Request
from starlette.responses import JSONResponse

from app.config import settings


def get_real_ip(request: Request) -> str:
    """Extract real client IP, checking trusted proxy headers first."""
    for header_name in settings.TRUSTED_PROXY_HEADERS.split(","):
        header_name = header_name.strip()
        value = request.headers.get(header_name)
        if value:
            return value.split(",")[0].strip()
    return request.client.host if request.client else "127.0.0.1"


limiter = Limiter(key_func=get_real_ip)


async def rate_limit_exceeded_handler(request: Request, exc: RateLimitExceeded) -> JSONResponse:
    return JSONResponse(
        status_code=429,
        content={"detail": "Too many requests. Please try again later."},
        headers={"Retry-After": "60"},
    )
