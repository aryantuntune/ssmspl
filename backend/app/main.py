import asyncio
import html
import json
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from app.config import settings
from app.database import engine
from app.middleware.rate_limit import limiter, rate_limit_exceeded_handler, RateLimitExceeded, SLOWAPI_AVAILABLE
from app.middleware.security import SecurityHeadersMiddleware
from app.routers import auth, users, boats, branches, routes, items, item_rates, ferry_schedules, payment_modes, tickets, portal_auth, company, booking, portal_bookings, reports, verification, contact, dashboard, portal_payment, portal_theme, settings as settings_router, rate_change_logs

logger = logging.getLogger("ssmspl")


@asynccontextmanager
async def lifespan(app: FastAPI):
    # --- Startup ---
    from app.services.booking_expiry_service import expiry_loop
    from app.services.daily_report_service import daily_report_loop

    task = asyncio.create_task(expiry_loop())
    report_task = asyncio.create_task(daily_report_loop())
    logger.info("Booking expiry background task started")
    logger.info("Daily report scheduler started")

    yield

    # --- Shutdown: clean up connections ---
    task.cancel()
    report_task.cancel()
    try:
        await task
    except asyncio.CancelledError:
        pass
    try:
        await report_task
    except asyncio.CancelledError:
        pass
    await engine.dispose()
    logger.info("Database connections disposed")


app = FastAPI(
    title=settings.APP_NAME,
    lifespan=lifespan,
    redirect_slashes=False,
    version=settings.APP_VERSION,
    description=(
        "## SSMSPL Ferry Boat Ticketing System\n\n"
        "REST API for **Suvarnadurga Shipping & Marine Services Pvt. Ltd.**\n\n"
        "### Features\n"
        "- JWT-based authentication with access & refresh tokens\n"
        "- Role-Based Access Control (RBAC) with 4 roles: Admin, Manager, Billing Operator, Ticket Checker\n"
        "- User management (CRUD) restricted to admin roles\n"
        "- Online payment integration via CCAvenue\n\n"
        "### Authentication\n"
        "1. Call `POST /api/auth/login` with username & password to get tokens\n"
        "2. Include the access token as `Authorization: Bearer <token>` header\n"
        "3. Use `POST /api/auth/refresh` to rotate tokens before expiry\n"
    ),
    docs_url="/docs" if settings.DEBUG else None,
    redoc_url="/redoc" if settings.DEBUG else None,
    openapi_url="/openapi.json" if settings.DEBUG else None,
    openapi_tags=[
        {
            "name": "Health",
            "description": "Service health check endpoints.",
        },
        {
            "name": "Authentication",
            "description": "Login, logout, token refresh, and current user info.",
        },
        {
            "name": "Users",
            "description": "User management — requires **Admin** role.",
        },
        {
            "name": "Boats",
            "description": "Ferry/boat management — requires **Admin** or **Manager** role.",
        },
        {
            "name": "Branches",
            "description": "Branch management — requires **Admin** or **Manager** role.",
        },
        {
            "name": "Routes",
            "description": "Route management — requires **Admin** or **Manager** role.",
        },
        {
            "name": "Items",
            "description": "Item management — requires **Admin** or **Manager** role.",
        },
        {
            "name": "Item Rates",
            "description": "Item rate management — requires **Admin** or **Manager** role.",
        },
        {
            "name": "Ferry Schedules",
            "description": "Ferry schedule management — requires **Admin** or **Manager** role.",
        },
        {
            "name": "Payment Modes",
            "description": "Payment mode management — requires **Admin** or **Manager** role.",
        },
        {
            "name": "Tickets",
            "description": "Ticket creation, lookup, and management — requires **Admin**, **Manager**, or **Billing Operator** role.",
        },
        {
            "name": "Portal Authentication",
            "description": "Customer-facing authentication — login, register, token refresh, and profile.",
        },
        {
            "name": "Company",
            "description": "Company settings — requires **Admin** role.",
        },
        {
            "name": "Booking Data",
            "description": "Public booking form data -- routes, items, schedules, rates for portal users.",
        },
        {
            "name": "Portal Bookings",
            "description": "Customer booking management -- create, list, view, cancel, QR codes.",
        },
        {
            "name": "Reports",
            "description": "Revenue, ticket count, item breakdown, branch summary, and payment mode reports — requires **Admin** or **Manager** role.",
        },
        {
            "name": "Ticket Verification",
            "description": "Booking/ticket lookup and check-in for ferry boarding — requires **Ticket Checker**, **Manager**, or **Admin** role.",
        },
        {
            "name": "Dashboard",
            "description": "Real-time dashboard statistics via HTTP and WebSocket.",
        },
    ],
    contact={
        "name": "SSMSPL Engineering",
        "email": "engineering@ssmspl.com",
    },
    license_info={
        "name": "Proprietary",
    },
)

if SLOWAPI_AVAILABLE:
    app.state.limiter = limiter
    app.add_exception_handler(RateLimitExceeded, rate_limit_exceeded_handler)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins_list,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "Accept", "X-Request-ID"],
    expose_headers=["X-Request-ID"],
)

app.add_middleware(SecurityHeadersMiddleware)


def _sanitize_errors(errors: list[dict]) -> list[dict]:
    """Strip raw user input and HTML-escape error messages to prevent XSS."""
    sanitized = []
    for err in errors:
        clean = {k: v for k, v in err.items() if k not in ("input", "ctx")}
        if "msg" in clean:
            clean["msg"] = html.escape(str(clean["msg"]))
        sanitized.append(clean)
    return sanitized


@app.exception_handler(json.JSONDecodeError)
async def json_decode_exception_handler(request: Request, exc: json.JSONDecodeError):
    return JSONResponse(
        status_code=422,
        content={"detail": "Invalid JSON in request body"},
    )


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    return JSONResponse(
        status_code=422,
        content={"detail": _sanitize_errors(exc.errors())},
    )


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    # Let FastAPI handle its own HTTPExceptions normally
    from fastapi import HTTPException as FastAPIHTTPException
    if isinstance(exc, FastAPIHTTPException):
        raise exc

    # Catch malformed request bodies that slip through
    if isinstance(exc, (json.JSONDecodeError, UnicodeDecodeError)):
        return JSONResponse(
            status_code=422,
            content={"detail": "Malformed request body"},
        )

    request_id = getattr(request.state, "request_id", "unknown")
    logger.error(
        "Unhandled exception [request_id=%s]: %s",
        request_id,
        str(exc),
        exc_info=True,
    )
    if settings.DEBUG:
        raise exc
    return JSONResponse(
        status_code=500,
        content={"detail": "Internal server error"},
    )


app.include_router(auth.router)
app.include_router(users.router)
app.include_router(boats.router)
app.include_router(branches.router)
app.include_router(routes.router)
app.include_router(items.router)
app.include_router(item_rates.router)
app.include_router(ferry_schedules.router)
app.include_router(payment_modes.router)
app.include_router(tickets.router)
app.include_router(portal_auth.router)
app.include_router(company.router)
app.include_router(booking.router)
app.include_router(portal_bookings.router)
app.include_router(reports.router)
app.include_router(verification.router)
app.include_router(contact.router)
app.include_router(dashboard.router)
app.include_router(portal_payment.router)
app.include_router(portal_theme.router)
app.include_router(settings_router.router)
app.include_router(rate_change_logs.router)


@app.get("/health", tags=["Health"])
async def health():
    return {"status": "ok"}
