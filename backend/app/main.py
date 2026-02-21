from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.routers import auth, users, boats, branches, routes, items, item_rates, ferry_schedules, payment_modes, tickets, portal_auth, company, booking, portal_bookings

app = FastAPI(
    title=settings.APP_NAME,
    version=settings.APP_VERSION,
    description=(
        "## SSMSPL Ferry Boat Ticketing System\n\n"
        "REST API for **Suvarnadurga Shipping & Marine Services Pvt. Ltd.**\n\n"
        "### Features\n"
        "- JWT-based authentication with access & refresh tokens\n"
        "- Role-Based Access Control (RBAC) with 5 roles: Super Admin, Admin, Manager, Billing Operator, Ticket Checker\n"
        "- User management (CRUD) restricted to admin roles\n"
        "- Razorpay payment integration (upcoming)\n\n"
        "### Authentication\n"
        "1. Call `POST /api/auth/login` with username & password to get tokens\n"
        "2. Include the access token as `Authorization: Bearer <token>` header\n"
        "3. Use `POST /api/auth/refresh` to rotate tokens before expiry\n"
    ),
    docs_url="/docs" if settings.DEBUG else None,
    redoc_url="/redoc" if settings.DEBUG else None,
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
            "description": "User management — requires **Super Admin** or **Admin** role.",
        },
        {
            "name": "Boats",
            "description": "Ferry/boat management — requires **Super Admin**, **Admin**, or **Manager** role.",
        },
        {
            "name": "Branches",
            "description": "Branch management — requires **Super Admin**, **Admin**, or **Manager** role.",
        },
        {
            "name": "Routes",
            "description": "Route management — requires **Super Admin**, **Admin**, or **Manager** role.",
        },
        {
            "name": "Items",
            "description": "Item management — requires **Super Admin**, **Admin**, or **Manager** role.",
        },
        {
            "name": "Item Rates",
            "description": "Item rate management — requires **Super Admin**, **Admin**, or **Manager** role.",
        },
        {
            "name": "Ferry Schedules",
            "description": "Ferry schedule management — requires **Super Admin**, **Admin**, or **Manager** role.",
        },
        {
            "name": "Payment Modes",
            "description": "Payment mode management — requires **Super Admin**, **Admin**, or **Manager** role.",
        },
        {
            "name": "Tickets",
            "description": "Ticket creation, lookup, and management — requires **Super Admin**, **Admin**, **Manager**, or **Billing Operator** role.",
        },
        {
            "name": "Portal Authentication",
            "description": "Customer-facing authentication — login, register, token refresh, and profile.",
        },
        {
            "name": "Company",
            "description": "Company settings — requires **Super Admin** role.",
        },
        {
            "name": "Booking Data",
            "description": "Public booking form data -- routes, items, schedules, rates for portal users.",
        },
        {
            "name": "Portal Bookings",
            "description": "Customer booking management -- create, list, view, cancel, QR codes.",
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

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
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


@app.get("/health", tags=["Health"])
async def health():
    return {"status": "ok", "app": settings.APP_NAME, "env": settings.APP_ENV}
