from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.routers import auth, users

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


@app.get("/health", tags=["Health"])
async def health():
    return {"status": "ok", "app": settings.APP_NAME, "env": settings.APP_ENV}
