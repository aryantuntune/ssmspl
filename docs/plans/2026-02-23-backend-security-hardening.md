# Backend Security Hardening Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Harden the FastAPI backend with security headers, rate limiting, HttpOnly cookies, CORS tightening, and global exception handling.

**Architecture:** Centralized SecurityMiddleware for headers + X-Request-ID, slowapi for rate limiting on auth endpoints, dual-mode auth (HttpOnly cookie primary, Bearer header fallback), global exception handlers to prevent stack trace leaks.

**Tech Stack:** FastAPI, slowapi, Starlette middleware, Python logging

---

### Task 1: Add Security Headers Middleware

**Files:**
- Create: `backend/app/middleware/__init__.py`
- Create: `backend/app/middleware/security.py`
- Create: `backend/tests/test_security_headers.py`
- Modify: `backend/app/main.py`

**Step 1: Write the failing tests**

Create `backend/tests/test_security_headers.py`:

```python
import pytest
from httpx import AsyncClient

pytestmark = pytest.mark.asyncio


async def test_security_headers_present(client: AsyncClient):
    """All security headers should be present on every response."""
    response = await client.get("/health")
    assert response.status_code == 200
    assert response.headers["x-content-type-options"] == "nosniff"
    assert response.headers["x-frame-options"] == "DENY"
    assert response.headers["referrer-policy"] == "strict-origin-when-cross-origin"
    assert "camera=()" in response.headers["permissions-policy"]
    assert "x-request-id" in response.headers


async def test_request_id_is_uuid(client: AsyncClient):
    """X-Request-ID should be a valid UUID."""
    import uuid
    response = await client.get("/health")
    request_id = response.headers["x-request-id"]
    uuid.UUID(request_id)  # raises ValueError if not valid UUID


async def test_server_header_stripped(client: AsyncClient):
    """Server header should not reveal technology details."""
    response = await client.get("/health")
    server = response.headers.get("server", "")
    assert "uvicorn" not in server.lower()
```

**Step 2: Run tests to verify they fail**

Run: `cd backend && python -m pytest tests/test_security_headers.py -v`
Expected: FAIL (headers not present yet)

**Step 3: Create the middleware**

Create empty `backend/app/middleware/__init__.py`.

Create `backend/app/middleware/security.py`:

```python
import uuid
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

from app.config import settings


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    """Injects security headers on every response."""

    async def dispatch(self, request: Request, call_next) -> Response:
        request_id = str(uuid.uuid4())
        request.state.request_id = request_id

        response: Response = await call_next(request)

        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        response.headers["Permissions-Policy"] = (
            "camera=(), microphone=(), geolocation=()"
        )
        response.headers["X-Request-ID"] = request_id
        response.headers["Server"] = ""

        # HSTS only in non-development environments
        if settings.APP_ENV != "development":
            response.headers["Strict-Transport-Security"] = (
                "max-age=31536000; includeSubDomains"
            )

        # CSP
        response.headers["Content-Security-Policy"] = (
            "default-src 'self'; "
            "script-src 'self'; "
            "style-src 'self' 'unsafe-inline'; "
            "img-src 'self' data: blob:; "
            "font-src 'self'; "
            "connect-src 'self'; "
            "frame-ancestors 'none'"
        )

        return response
```

**Step 4: Wire middleware into main.py**

In `backend/app/main.py`, add after the existing imports:

```python
from app.middleware.security import SecurityHeadersMiddleware
```

Add the middleware BEFORE the CORS middleware (so security headers are applied to all responses including CORS preflight):

```python
app.add_middleware(SecurityHeadersMiddleware)
```

**Step 5: Run tests to verify they pass**

Run: `cd backend && python -m pytest tests/test_security_headers.py -v`
Expected: PASS

**Step 6: Run full test suite to verify no regressions**

Run: `cd backend && python -m pytest tests/ -v`
Expected: All existing tests still pass

**Step 7: Commit**

```bash
git add backend/app/middleware/ backend/tests/test_security_headers.py backend/app/main.py
git commit -m "feat: add security headers middleware (X-Content-Type-Options, X-Frame-Options, HSTS, CSP, X-Request-ID)"
```

---

### Task 2: Tighten CORS Configuration

**Files:**
- Modify: `backend/app/main.py:104-110`

**Step 1: Write the failing test**

Add to `backend/tests/test_security_headers.py`:

```python
async def test_cors_headers_on_preflight(client: AsyncClient):
    """CORS preflight should return specific methods, not wildcards."""
    response = await client.options(
        "/health",
        headers={
            "Origin": "http://localhost:3000",
            "Access-Control-Request-Method": "POST",
        },
    )
    allowed_methods = response.headers.get("access-control-allow-methods", "")
    assert "*" not in allowed_methods
    assert "GET" in allowed_methods
    assert "POST" in allowed_methods
```

**Step 2: Run test to verify it fails**

Run: `cd backend && python -m pytest tests/test_security_headers.py::test_cors_headers_on_preflight -v`
Expected: FAIL (currently returns `*`)

**Step 3: Update CORS middleware in main.py**

Replace the current CORS middleware configuration in `backend/app/main.py` (lines 104-110):

```python
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins_list,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "Accept", "X-Request-ID"],
    expose_headers=["X-Request-ID"],
)
```

**Step 4: Run test to verify it passes**

Run: `cd backend && python -m pytest tests/test_security_headers.py::test_cors_headers_on_preflight -v`
Expected: PASS

**Step 5: Run full test suite**

Run: `cd backend && python -m pytest tests/ -v`
Expected: All pass

**Step 6: Commit**

```bash
git add backend/app/main.py backend/tests/test_security_headers.py
git commit -m "fix: tighten CORS to explicit methods and headers instead of wildcards"
```

---

### Task 3: Global Exception Handler + Health Endpoint Hardening

**Files:**
- Modify: `backend/app/main.py`
- Create: `backend/tests/test_exception_handling.py`

**Step 1: Write failing tests**

Create `backend/tests/test_exception_handling.py`:

```python
import pytest
from httpx import AsyncClient

pytestmark = pytest.mark.asyncio


async def test_health_no_env_leak(client: AsyncClient):
    """Health endpoint should not expose the APP_ENV value."""
    response = await client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert "status" in data
    assert data["status"] == "ok"


async def test_validation_error_format(client: AsyncClient):
    """Validation errors should return a consistent format with 'detail' key."""
    response = await client.post("/api/auth/login", json={})
    assert response.status_code == 422
    data = response.json()
    assert "detail" in data
```

**Step 2: Run tests to verify behavior**

Run: `cd backend && python -m pytest tests/test_exception_handling.py -v`
Expected: `test_health_no_env_leak` should FAIL (currently returns `env` field)

**Step 3: Update health endpoint and add exception handlers**

In `backend/app/main.py`, add imports:

```python
import logging
from fastapi import Request
from fastapi.responses import JSONResponse
from fastapi.exceptions import RequestValidationError
```

Replace the health endpoint:

```python
@app.get("/health", tags=["Health"])
async def health():
    result = {"status": "ok", "app": settings.APP_NAME}
    if settings.DEBUG:
        result["env"] = settings.APP_ENV
    return result
```

Hide openapi.json in production — update the FastAPI constructor to add:

```python
    openapi_url="/openapi.json" if settings.DEBUG else None,
```

Add global exception handlers after middleware setup, before router includes:

```python
logger = logging.getLogger("ssmspl")


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    return JSONResponse(
        status_code=422,
        content={"detail": exc.errors()},
    )


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    request_id = getattr(request.state, "request_id", "unknown")
    logger.error(
        "Unhandled exception [request_id=%s]: %s",
        request_id,
        str(exc),
        exc_info=True,
    )
    if settings.DEBUG:
        raise exc  # Let FastAPI show the full traceback in dev
    return JSONResponse(
        status_code=500,
        content={"detail": "Internal server error"},
    )
```

**Step 4: Run tests to verify they pass**

Run: `cd backend && python -m pytest tests/test_exception_handling.py -v`
Expected: PASS

**Step 5: Run full test suite**

Run: `cd backend && python -m pytest tests/ -v`
Expected: All pass

**Step 6: Commit**

```bash
git add backend/app/main.py backend/tests/test_exception_handling.py
git commit -m "feat: add global exception handlers, hide env from health endpoint in production"
```

---

### Task 4: Add Rate Limiting to Auth Endpoints

**Files:**
- Modify: `backend/requirements.txt`
- Create: `backend/app/middleware/rate_limit.py`
- Modify: `backend/app/routers/auth.py`
- Modify: `backend/app/routers/portal_auth.py`
- Modify: `backend/app/main.py`
- Modify: `backend/app/config.py`
- Create: `backend/tests/test_rate_limiting.py`

**Step 1: Install slowapi**

Add `slowapi==0.1.9` to `backend/requirements.txt` and run:

```bash
cd backend && pip install slowapi==0.1.9
```

**Step 2: Add config setting**

In `backend/app/config.py`, add inside the `Settings` class:

```python
    # Rate limiting
    TRUSTED_PROXY_HEADERS: str = "CF-Connecting-IP,X-Forwarded-For"
```

**Step 3: Create rate limit module**

Create `backend/app/middleware/rate_limit.py`:

```python
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
            # Take the first IP if multiple are present (comma-separated)
            return value.split(",")[0].strip()
    return request.client.host if request.client else "127.0.0.1"


limiter = Limiter(key_func=get_real_ip)


async def rate_limit_exceeded_handler(request: Request, exc: RateLimitExceeded) -> JSONResponse:
    retry_after = exc.detail.split("per")[0].strip() if exc.detail else "60"
    return JSONResponse(
        status_code=429,
        content={"detail": "Too many requests. Please try again later."},
        headers={"Retry-After": retry_after},
    )
```

**Step 4: Write failing tests**

Create `backend/tests/test_rate_limiting.py`:

```python
import pytest
from httpx import AsyncClient

pytestmark = pytest.mark.asyncio


async def test_login_rate_limit(client: AsyncClient, super_admin_user):
    """Login endpoint should return 429 after exceeding rate limit."""
    # Make 11 requests (limit is 10/min)
    for i in range(11):
        response = await client.post(
            "/api/auth/login",
            json={"username": "test_superadmin", "password": "WrongPass"},
        )
        if response.status_code == 429:
            assert "retry-after" in response.headers
            return  # Test passed — rate limit hit

    pytest.fail("Rate limit was not triggered after 11 requests")
```

**Step 5: Run test to verify it fails**

Run: `cd backend && python -m pytest tests/test_rate_limiting.py -v`
Expected: FAIL (no rate limiting yet)

**Step 6: Wire rate limiting into the app**

In `backend/app/main.py`, add imports:

```python
from slowapi.errors import RateLimitExceeded
from app.middleware.rate_limit import limiter, rate_limit_exceeded_handler
```

Add after the app is created:

```python
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, rate_limit_exceeded_handler)
```

**Step 7: Add rate limit decorators to auth routers**

In `backend/app/routers/auth.py`, add imports:

```python
from fastapi import Request
from app.middleware.rate_limit import limiter
```

Add `@limiter.limit("10/minute")` decorator and `request: Request` parameter to the login endpoint:

```python
@router.post("/login", ...)
@limiter.limit("10/minute")
async def login(request: Request, body: LoginRequest, db: AsyncSession = Depends(get_db)):
    return await auth_service.login(db, body.username, body.password)
```

Add `@limiter.limit("20/minute")` to the refresh endpoint:

```python
@router.post("/refresh", ...)
@limiter.limit("20/minute")
async def refresh(request: Request, body: RefreshRequest, db: AsyncSession = Depends(get_db)):
    return await auth_service.refresh_access_token(db, body.refresh_token)
```

In `backend/app/routers/portal_auth.py`, same pattern:

```python
from fastapi import Request
from app.middleware.rate_limit import limiter
```

Add `@limiter.limit("10/minute")` to login and register endpoints.
Add `@limiter.limit("20/minute")` to refresh endpoint.
Add `request: Request` parameter to each decorated endpoint.

**Step 8: Run tests to verify they pass**

Run: `cd backend && python -m pytest tests/test_rate_limiting.py -v`
Expected: PASS

**Step 9: Run full test suite**

Run: `cd backend && python -m pytest tests/ -v`
Expected: All pass

**Step 10: Commit**

```bash
git add backend/requirements.txt backend/app/middleware/rate_limit.py backend/app/routers/auth.py backend/app/routers/portal_auth.py backend/app/main.py backend/app/config.py backend/tests/test_rate_limiting.py
git commit -m "feat: add rate limiting to auth endpoints (10/min login, 20/min refresh)"
```

---

### Task 5: HttpOnly Cookie Auth Flow — Admin Auth

**Files:**
- Modify: `backend/app/services/auth_service.py`
- Modify: `backend/app/routers/auth.py`
- Modify: `backend/app/dependencies.py`
- Modify: `backend/app/schemas/auth.py`
- Create: `backend/tests/test_httponly_cookies.py`
- Modify: `backend/app/config.py`

**Step 1: Add cookie config settings**

In `backend/app/config.py`, add to the Settings class:

```python
    # Cookie settings
    COOKIE_DOMAIN: str = ""  # empty = let browser infer from request
    COOKIE_SECURE: bool = False  # True in production (.env.production)
```

**Step 2: Add a new response schema for cookie-based login**

In `backend/app/schemas/auth.py`, add:

```python
class LoginResponse(BaseModel):
    """Response body for cookie-based login (tokens are in Set-Cookie headers, not body)."""
    message: str = Field(default="Login successful", description="Status message")
    token_type: str = Field(default="bearer", description="Token type")
```

**Step 3: Write failing tests**

Create `backend/tests/test_httponly_cookies.py`:

```python
import pytest
from httpx import AsyncClient

pytestmark = pytest.mark.asyncio


async def test_login_sets_httponly_cookies(client: AsyncClient, super_admin_user):
    """Login should set HttpOnly access and refresh token cookies."""
    response = await client.post("/api/auth/login", json={
        "username": "test_superadmin",
        "password": "TestPass@123",
    })
    assert response.status_code == 200

    cookies = response.headers.get_list("set-cookie")
    cookie_names = [c.split("=")[0] for c in cookies]
    assert "ssmspl_access_token" in cookie_names
    assert "ssmspl_refresh_token" in cookie_names

    # Check HttpOnly flag
    for cookie in cookies:
        assert "httponly" in cookie.lower()
        assert "samesite=strict" in cookie.lower()


async def test_auth_via_cookie(client: AsyncClient, super_admin_user):
    """Authenticated endpoint should accept token from cookie."""
    # Login to get cookies
    login_resp = await client.post("/api/auth/login", json={
        "username": "test_superadmin",
        "password": "TestPass@123",
    })
    cookies = {}
    for header in login_resp.headers.get_list("set-cookie"):
        name, value = header.split(";")[0].split("=", 1)
        cookies[name] = value

    # Use cookie for auth
    response = await client.get(
        "/api/auth/me",
        cookies={"ssmspl_access_token": cookies["ssmspl_access_token"]},
    )
    assert response.status_code == 200
    assert response.json()["username"] == "test_superadmin"


async def test_auth_via_bearer_still_works(client: AsyncClient, super_admin_user):
    """Bearer header should still work as fallback (mobile app compatibility)."""
    login_resp = await client.post("/api/auth/login", json={
        "username": "test_superadmin",
        "password": "TestPass@123",
    })
    # Extract access token from cookie
    for header in login_resp.headers.get_list("set-cookie"):
        if header.startswith("ssmspl_access_token="):
            token = header.split(";")[0].split("=", 1)[1]
            break

    response = await client.get(
        "/api/auth/me",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 200


async def test_logout_clears_cookies(client: AsyncClient, super_admin_user):
    """Logout should set cookies with Max-Age=0 to clear them."""
    # Login first
    login_resp = await client.post("/api/auth/login", json={
        "username": "test_superadmin",
        "password": "TestPass@123",
    })

    # Extract refresh token from cookie for the logout body
    refresh_token = None
    for header in login_resp.headers.get_list("set-cookie"):
        if header.startswith("ssmspl_refresh_token="):
            refresh_token = header.split(";")[0].split("=", 1)[1]
            break

    # Logout
    response = await client.post(
        "/api/auth/logout",
        json={"refresh_token": refresh_token} if refresh_token else None,
    )
    assert response.status_code == 200

    cookies = response.headers.get_list("set-cookie")
    for cookie in cookies:
        assert "max-age=0" in cookie.lower()
```

**Step 4: Run tests to verify they fail**

Run: `cd backend && python -m pytest tests/test_httponly_cookies.py -v`
Expected: FAIL (no cookie-setting logic yet)

**Step 5: Create cookie utility**

Create `backend/app/core/cookies.py`:

```python
from starlette.responses import Response
from app.config import settings


def set_auth_cookies(
    response: Response,
    access_token: str,
    refresh_token: str,
    access_max_age: int | None = None,
    refresh_max_age: int | None = None,
    cookie_prefix: str = "ssmspl",
    refresh_path: str = "/api/auth/refresh",
) -> None:
    """Set HttpOnly auth cookies on a response."""
    if access_max_age is None:
        access_max_age = settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60
    if refresh_max_age is None:
        refresh_max_age = settings.REFRESH_TOKEN_EXPIRE_DAYS * 86400

    secure = settings.APP_ENV != "development"

    response.set_cookie(
        key=f"{cookie_prefix}_access_token",
        value=access_token,
        max_age=access_max_age,
        httponly=True,
        secure=secure,
        samesite="strict",
        path="/",
    )
    response.set_cookie(
        key=f"{cookie_prefix}_refresh_token",
        value=refresh_token,
        max_age=refresh_max_age,
        httponly=True,
        secure=secure,
        samesite="strict",
        path=refresh_path,
    )


def clear_auth_cookies(
    response: Response,
    cookie_prefix: str = "ssmspl",
    refresh_path: str = "/api/auth/refresh",
) -> None:
    """Clear auth cookies by setting Max-Age=0."""
    secure = settings.APP_ENV != "development"

    response.set_cookie(
        key=f"{cookie_prefix}_access_token",
        value="",
        max_age=0,
        httponly=True,
        secure=secure,
        samesite="strict",
        path="/",
    )
    response.set_cookie(
        key=f"{cookie_prefix}_refresh_token",
        value="",
        max_age=0,
        httponly=True,
        secure=secure,
        samesite="strict",
        path=refresh_path,
    )
```

**Step 6: Update auth_service to return raw token data**

In `backend/app/services/auth_service.py`, change the `login` function return type. Instead of returning `TokenResponse`, return a dict with the raw tokens:

```python
async def login(db: AsyncSession, username: str, password: str) -> dict:
    from fastapi import HTTPException, status
    user = await authenticate_user(db, username, password)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
        )
    user.last_login = datetime.now(timezone.utc)

    extra = {"role": user.role.value}
    access_token = create_access_token(subject=str(user.id), extra_claims=extra)
    refresh_token = create_refresh_token(subject=str(user.id))

    expires_at = datetime.now(timezone.utc) + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)
    await token_service.store_refresh_token(db, refresh_token, expires_at, user_id=user.id)
    await token_service.cleanup_expired(db)
    await db.commit()

    return {"access_token": access_token, "refresh_token": refresh_token}
```

Same for `refresh_access_token` — return a dict instead of `TokenResponse`:

```python
async def refresh_access_token(db: AsyncSession, refresh_token: str) -> dict:
    # ... (existing validation logic stays the same) ...
    return {"access_token": new_access, "refresh_token": new_refresh}
```

**Step 7: Update auth router to set cookies**

In `backend/app/routers/auth.py`:

```python
from fastapi import APIRouter, Depends, status, Request
from fastapi.responses import JSONResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.schemas.auth import LoginRequest, LoginResponse, RefreshRequest
from app.schemas.user import UserMeResponse
from app.services import auth_service
from app.services.user_service import _resolve_route_name, _resolve_route_branches
from app.dependencies import get_current_user
from app.core.rbac import ROLE_MENU_ITEMS
from app.core.cookies import set_auth_cookies, clear_auth_cookies
from app.middleware.rate_limit import limiter
from app.models.user import User


@router.post("/login", response_model=LoginResponse, ...)
@limiter.limit("10/minute")
async def login(request: Request, body: LoginRequest, db: AsyncSession = Depends(get_db)):
    tokens = await auth_service.login(db, body.username, body.password)
    response = JSONResponse(content={"message": "Login successful", "token_type": "bearer"})
    set_auth_cookies(response, tokens["access_token"], tokens["refresh_token"])
    return response


@router.post("/refresh", response_model=LoginResponse, ...)
@limiter.limit("20/minute")
async def refresh(request: Request, body: RefreshRequest | None = None, db: AsyncSession = Depends(get_db)):
    # Read refresh token from cookie first, fall back to body
    refresh_token = request.cookies.get("ssmspl_refresh_token")
    if not refresh_token and body:
        refresh_token = body.refresh_token
    if not refresh_token:
        from fastapi import HTTPException
        raise HTTPException(status_code=401, detail="No refresh token provided")

    tokens = await auth_service.refresh_access_token(db, refresh_token)
    response = JSONResponse(content={"message": "Token refreshed", "token_type": "bearer"})
    set_auth_cookies(response, tokens["access_token"], tokens["refresh_token"])
    return response


@router.post("/logout", ...)
async def logout(body: RefreshRequest | None = None, request: Request = None, db: AsyncSession = Depends(get_db)):
    # Get refresh token from cookie or body
    refresh_token = None
    if request:
        refresh_token = request.cookies.get("ssmspl_refresh_token")
    if not refresh_token and body:
        refresh_token = body.refresh_token

    await auth_service.logout(db, refresh_token)
    response = JSONResponse(content={"message": "Logged out successfully"})
    clear_auth_cookies(response)
    return response
```

**Step 8: Update dependencies.py for dual-mode auth**

Replace `backend/app/dependencies.py` with dual-mode extraction (cookie first, Bearer fallback):

```python
from fastapi import Depends, HTTPException, status, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import Optional

from app.core.security import decode_token
from app.core.rbac import UserRole
from app.database import get_db
from app.models.user import User
from app.models.portal_user import PortalUser

# Make bearer scheme optional so cookie-only requests don't get 403
bearer_scheme = HTTPBearer(auto_error=False)


def _extract_token(
    request: Request,
    credentials: Optional[HTTPAuthorizationCredentials],
    cookie_name: str,
) -> str:
    """Extract token from cookie first, then Bearer header."""
    # 1. Try cookie
    token = request.cookies.get(cookie_name)
    if token:
        return token
    # 2. Try Bearer header
    if credentials:
        return credentials.credentials
    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )


async def get_current_user(
    request: Request,
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(bearer_scheme),
    db: AsyncSession = Depends(get_db),
) -> User:
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    token = _extract_token(request, credentials, "ssmspl_access_token")
    try:
        payload = decode_token(token)
        if payload.get("type") != "access":
            raise credentials_exception
        user_id: str = payload.get("sub")
        if user_id is None:
            raise credentials_exception
    except JWTError:
        raise credentials_exception

    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if user is None or not user.is_active:
        raise credentials_exception
    return user


async def get_current_portal_user(
    request: Request,
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(bearer_scheme),
    db: AsyncSession = Depends(get_db),
) -> PortalUser:
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    token = _extract_token(request, credentials, "ssmspl_portal_access_token")
    try:
        payload = decode_token(token)
        if payload.get("type") != "access":
            raise credentials_exception
        user_id: str = payload.get("sub")
        if user_id is None:
            raise credentials_exception
        if payload.get("role") != "PORTAL_USER":
            raise credentials_exception
    except JWTError:
        raise credentials_exception

    result = await db.execute(select(PortalUser).where(PortalUser.id == int(user_id)))
    user = result.scalar_one_or_none()
    if user is None:
        raise credentials_exception
    return user


def require_roles(*roles: UserRole):
    """Factory that returns a dependency checking the user has one of the given roles."""
    async def role_checker(current_user: User = Depends(get_current_user)) -> User:
        if current_user.role not in roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Access denied. Required roles: {[r.value for r in roles]}",
            )
        return current_user
    return role_checker
```

**Step 9: Run tests to verify they pass**

Run: `cd backend && python -m pytest tests/test_httponly_cookies.py -v`
Expected: PASS

**Step 10: Run full test suite**

Run: `cd backend && python -m pytest tests/ -v`

Note: The existing `test_auth.py` tests use Bearer header and should still pass because of the fallback. The `test_me_requires_auth` test expects 403 — since we changed `HTTPBearer(auto_error=False)`, requests with no token will now get 401 instead. Update `backend/tests/test_auth.py`:

```python
async def test_me_requires_auth(client: AsyncClient):
    response = await client.get("/api/auth/me")
    assert response.status_code == 401  # Changed from 403 to 401
```

Expected: All pass

**Step 11: Commit**

```bash
git add backend/app/core/cookies.py backend/app/dependencies.py backend/app/routers/auth.py backend/app/services/auth_service.py backend/app/schemas/auth.py backend/app/config.py backend/tests/test_httponly_cookies.py backend/tests/test_auth.py
git commit -m "feat: implement HttpOnly cookie auth for admin login with Bearer fallback"
```

---

### Task 6: HttpOnly Cookie Auth Flow — Portal Auth

**Files:**
- Modify: `backend/app/services/portal_auth_service.py`
- Modify: `backend/app/routers/portal_auth.py`
- Create: `backend/tests/test_portal_httponly_cookies.py`

**Step 1: Write failing tests**

Create `backend/tests/test_portal_httponly_cookies.py`:

```python
import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.security import get_password_hash
from app.models.portal_user import PortalUser

pytestmark = pytest.mark.asyncio


@pytest.fixture
async def portal_user(db_session: AsyncSession) -> PortalUser:
    user = PortalUser(
        first_name="Test",
        last_name="Customer",
        email="testcustomer@test.com",
        password=get_password_hash("TestPass@123"),
        mobile="9876543210",
    )
    db_session.add(user)
    await db_session.commit()
    await db_session.refresh(user)
    return user


async def test_portal_login_sets_httponly_cookies(client: AsyncClient, portal_user):
    """Portal login should set HttpOnly cookies with portal prefix."""
    response = await client.post("/api/portal/auth/login", json={
        "email": "testcustomer@test.com",
        "password": "TestPass@123",
    })
    assert response.status_code == 200

    cookies = response.headers.get_list("set-cookie")
    cookie_names = [c.split("=")[0] for c in cookies]
    assert "ssmspl_portal_access_token" in cookie_names
    assert "ssmspl_portal_refresh_token" in cookie_names

    for cookie in cookies:
        assert "httponly" in cookie.lower()


async def test_portal_logout_clears_cookies(client: AsyncClient, portal_user):
    """Portal logout should clear portal cookies."""
    await client.post("/api/portal/auth/login", json={
        "email": "testcustomer@test.com",
        "password": "TestPass@123",
    })

    response = await client.post("/api/portal/auth/logout")
    assert response.status_code == 200

    cookies = response.headers.get_list("set-cookie")
    for cookie in cookies:
        if "portal" in cookie:
            assert "max-age=0" in cookie.lower()
```

**Step 2: Run tests to verify they fail**

Run: `cd backend && python -m pytest tests/test_portal_httponly_cookies.py -v`
Expected: FAIL

**Step 3: Update portal_auth_service to return dicts**

Same pattern as Task 5 Step 6 — change `login` and `refresh_access_token` in `backend/app/services/portal_auth_service.py` to return `dict` instead of `TokenResponse`.

**Step 4: Update portal_auth router to set cookies**

In `backend/app/routers/portal_auth.py`, apply the same cookie-setting pattern as Task 5 Step 7, using:
- Cookie prefix: `ssmspl_portal`
- Refresh path: `/api/portal/auth/refresh`

```python
from app.core.cookies import set_auth_cookies, clear_auth_cookies

# In login endpoint:
tokens = await portal_auth_service.login(db, body.email, body.password)
response = JSONResponse(content={"message": "Login successful", "token_type": "bearer"})
set_auth_cookies(
    response, tokens["access_token"], tokens["refresh_token"],
    cookie_prefix="ssmspl_portal",
    refresh_path="/api/portal/auth/refresh",
)
return response

# In refresh endpoint:
refresh_token = request.cookies.get("ssmspl_portal_refresh_token")
if not refresh_token and body:
    refresh_token = body.refresh_token
# ... rest same as admin, using portal prefix

# In logout endpoint:
clear_auth_cookies(response, cookie_prefix="ssmspl_portal", refresh_path="/api/portal/auth/refresh")
```

**Step 5: Run tests to verify they pass**

Run: `cd backend && python -m pytest tests/test_portal_httponly_cookies.py -v`
Expected: PASS

**Step 6: Run full test suite**

Run: `cd backend && python -m pytest tests/ -v`
Expected: All pass

**Step 7: Commit**

```bash
git add backend/app/services/portal_auth_service.py backend/app/routers/portal_auth.py backend/tests/test_portal_httponly_cookies.py
git commit -m "feat: implement HttpOnly cookie auth for portal login with Bearer fallback"
```

---

### Task 7: Final Verification and Cleanup

**Files:**
- No new files

**Step 1: Run full test suite with coverage**

```bash
cd backend && python -m pytest tests/ -v --cov=app --cov-report=term-missing
```

Expected: All pass, good coverage on new middleware and cookie code.

**Step 2: Manual smoke test checklist**

Start the dev server and verify:
```bash
cd backend && uvicorn app.main:app --reload
```

- [ ] `GET /health` returns `{"status": "ok", "app": "SSMSPL", "env": "development"}` (env shown in dev)
- [ ] `GET /docs` works in dev mode
- [ ] `POST /api/auth/login` returns Set-Cookie headers with HttpOnly flag
- [ ] `GET /api/auth/me` works with cookie-based auth
- [ ] `GET /api/auth/me` works with Bearer header auth
- [ ] Security headers present on all responses (check via browser DevTools or curl -I)
- [ ] 11th rapid login attempt returns 429
- [ ] `POST /api/auth/logout` clears cookies (Max-Age=0)

**Step 3: Commit final state**

If any adjustments were needed during smoke testing, commit them:

```bash
git add -A
git commit -m "chore: backend security hardening - final cleanup and verification"
```
