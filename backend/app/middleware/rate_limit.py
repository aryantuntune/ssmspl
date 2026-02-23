import logging

from starlette.requests import Request
from starlette.responses import JSONResponse

logger = logging.getLogger("ssmspl")

try:
    from slowapi import Limiter
    from slowapi.errors import RateLimitExceeded as _RateLimitExceeded

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
    RateLimitExceeded = _RateLimitExceeded

    async def rate_limit_exceeded_handler(request: Request, exc) -> JSONResponse:
        return JSONResponse(
            status_code=429,
            content={"detail": "Too many requests. Please try again later."},
            headers={"Retry-After": "60"},
        )

    SLOWAPI_AVAILABLE = True

except ImportError:
    logger.warning("slowapi not installed — rate limiting disabled")

    class _NoOpLimiter:
        """Stub limiter that provides a no-op .limit() decorator."""
        def limit(self, *args, **kwargs):
            def decorator(func):
                return func
            return decorator

    limiter = _NoOpLimiter()
    RateLimitExceeded = None

    async def rate_limit_exceeded_handler(request, exc):
        pass

    SLOWAPI_AVAILABLE = False
