from slowapi import Limiter
from slowapi.errors import RateLimitExceeded
from starlette.requests import Request
from starlette.responses import JSONResponse

from app.config import settings


def get_real_ip(request: Request) -> str:
    """Extract real client IP, checking trusted proxy headers first.

    WARNING: This trusts proxy headers unconditionally. The app MUST be deployed
    behind Cloudflare or a trusted reverse proxy that sets these headers.
    Without a proxy, clients can spoof IP via CF-Connecting-IP header.
    """
    for header_name in settings.TRUSTED_PROXY_HEADERS.split(","):
        header_name = header_name.strip()
        value = request.headers.get(header_name)
        if value:
            return value.split(",")[0].strip()
    return request.client.host if request.client else "127.0.0.1"


# NOTE: Uses in-memory storage (default). Rate limits are per-worker, not shared.
# For multi-worker deployments, consider Redis-backed storage via slowapi.
limiter = Limiter(key_func=get_real_ip)


async def rate_limit_exceeded_handler(request: Request, exc: RateLimitExceeded) -> JSONResponse:
    return JSONResponse(
        status_code=429,
        content={"detail": "Too many requests. Please try again later."},
        headers={"Retry-After": "60"},
    )
