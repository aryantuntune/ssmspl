# SSMSPL Ferry Boat Ticketing System - Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a full-stack ferry boat ticketing system for Suvarnadurga Shipping & Marine Services Pvt. Ltd. with FastAPI backend, Next.js frontend, PostgreSQL database, JWT/RBAC authentication, and Razorpay payment integration.

**Architecture:** Monorepo with `backend/` (FastAPI async Python) and `frontend/` (Next.js) directories. The backend uses SQLAlchemy 2.0 async ORM with PostgreSQL. Auth is JWT-based with role-based access control. Four isolated environments (dev, test, staging, prod) each use their own database.

**Tech Stack:** Python 3.12, FastAPI, SQLAlchemy 2.0 async, PostgreSQL 16, Alembic, Uvicorn, Gunicorn, JWT (python-jose), bcrypt, Next.js 14, TypeScript, Tailwind CSS, Razorpay.

---

## Project Layout (Target)

```
ssmspl/
├── backend/
│   ├── app/
│   │   ├── __init__.py
│   │   ├── main.py
│   │   ├── config.py
│   │   ├── database.py
│   │   ├── dependencies.py
│   │   ├── core/
│   │   │   ├── __init__.py
│   │   │   ├── security.py       # JWT encode/decode, password hashing
│   │   │   └── rbac.py           # Role definitions and permission checks
│   │   ├── models/
│   │   │   ├── __init__.py
│   │   │   └── user.py           # SQLAlchemy User model
│   │   ├── schemas/
│   │   │   ├── __init__.py
│   │   │   ├── auth.py           # Login request/response schemas
│   │   │   └── user.py           # User CRUD schemas
│   │   ├── routers/
│   │   │   ├── __init__.py
│   │   │   ├── auth.py           # /api/auth/login, /logout, /refresh
│   │   │   └── users.py          # /api/users CRUD
│   │   └── services/
│   │       ├── __init__.py
│   │       ├── auth_service.py
│   │       └── user_service.py
│   ├── scripts/
│   │   ├── ddl.sql               # Table DDL for all modules
│   │   └── seed_data.sql         # Sample users for all roles
│   ├── tests/
│   │   ├── __init__.py
│   │   ├── conftest.py
│   │   ├── test_auth.py
│   │   └── test_users.py
│   ├── alembic/
│   │   ├── env.py
│   │   └── versions/
│   ├── alembic.ini
│   ├── requirements.txt
│   ├── requirements-dev.txt
│   ├── gunicorn.conf.py
│   ├── .env.example
│   ├── .env.development
│   ├── .env.test
│   ├── .env.staging
│   └── .env.production
├── frontend/
│   ├── src/
│   │   ├── app/
│   │   │   ├── layout.tsx
│   │   │   ├── page.tsx          # redirects to /login
│   │   │   ├── login/
│   │   │   │   └── page.tsx      # Login form
│   │   │   └── dashboard/
│   │   │       └── page.tsx      # Landing page with role-based menu
│   │   ├── components/
│   │   │   ├── LoginForm.tsx
│   │   │   ├── Navbar.tsx
│   │   │   └── Sidebar.tsx
│   │   ├── lib/
│   │   │   ├── api.ts            # Axios/fetch wrappers
│   │   │   └── auth.ts           # Token storage helpers
│   │   └── types/
│   │       └── index.ts
│   ├── public/
│   ├── package.json
│   ├── tsconfig.json
│   ├── tailwind.config.ts
│   ├── next.config.ts
│   └── .env.local.example
├── docker-compose.yml            # Full stack (backend + frontend + db)
├── docker-compose.dev.yml        # Dev overrides
├── .gitignore
└── README.md
```

---

## Task 1: Repository Scaffolding & Git Init

**Files:**
- Create: `.gitignore`
- Create: `README.md`

**Step 1: Initialize git repo**

```bash
cd D:/workspace/ssmspl
git init
```

**Step 2: Create `.gitignore`**

```
# Python
__pycache__/
*.py[cod]
*.egg-info/
.venv/
venv/
dist/
build/
*.egg
.pytest_cache/
.mypy_cache/
htmlcov/
.coverage

# Environment files (keep examples, ignore actuals)
.env.development
.env.test
.env.staging
.env.production
.env.local
!.env.example
!.env.*.example

# Node / Next.js
node_modules/
.next/
out/
.vercel/
*.tsbuildinfo

# IDE
.vscode/
.idea/
*.swp

# OS
.DS_Store
Thumbs.db

# Alembic
alembic/versions/*.pyc
```

**Step 3: Create `README.md`**

```markdown
# SSMSPL – Ferry Boat Ticketing System
Suvarnadurga Shipping & Marine Services Pvt. Ltd.

## Quick Start
See `docs/plans/` for implementation details.

### Backend
```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env.development
uvicorn app.main:app --reload --env-file .env.development
```

### Frontend
```bash
cd frontend
npm install
cp .env.local.example .env.local
npm run dev
```
```

**Step 4: Commit**

```bash
git add .gitignore README.md
git commit -m "chore: init repo with gitignore and readme"
```

---

## Task 2: Backend – Python Environment & Dependencies

**Files:**
- Create: `backend/requirements.txt`
- Create: `backend/requirements-dev.txt`

**Step 1: Create `backend/requirements.txt`**

```
fastapi==0.115.5
uvicorn[standard]==0.32.1
gunicorn==23.0.0
sqlalchemy[asyncio]==2.0.36
asyncpg==0.30.0
alembic==1.14.0
pydantic==2.10.3
pydantic-settings==2.6.1
python-jose[cryptography]==3.3.0
passlib[bcrypt]==1.7.4
python-multipart==0.0.18
python-dotenv==1.0.1
razorpay==1.4.1
email-validator==2.2.0
```

**Step 2: Create `backend/requirements-dev.txt`**

```
-r requirements.txt
pytest==8.3.4
pytest-asyncio==0.24.0
httpx==0.28.1
pytest-cov==6.0.0
factory-boy==3.3.1
faker==33.1.0
```

**Step 3: Create virtual environment and install**

```bash
cd backend
python -m venv .venv
# Windows:
.venv/Scripts/activate
# Linux/Mac:
source .venv/bin/activate
pip install -r requirements-dev.txt
```

**Step 4: Commit**

```bash
git add backend/requirements.txt backend/requirements-dev.txt
git commit -m "chore(backend): add Python dependencies"
```

---

## Task 3: Backend – Environment Configuration

**Files:**
- Create: `backend/.env.example`
- Create: `backend/.env.development`
- Create: `backend/.env.test`
- Create: `backend/.env.staging`
- Create: `backend/.env.production`
- Create: `backend/app/config.py`

**Step 1: Create `backend/.env.example`**

```env
# Application
APP_ENV=development
APP_NAME=SSMSPL
APP_VERSION=1.0.0
DEBUG=true
SECRET_KEY=CHANGE_ME_IN_PRODUCTION_USE_openssl_rand_hex_32
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=30
REFRESH_TOKEN_EXPIRE_DAYS=7

# Database
DATABASE_URL=postgresql+asyncpg://ssmspl_user:ssmspl_pass@localhost:5432/ssmspl_db_dev

# CORS
ALLOWED_ORIGINS=http://localhost:3000

# Razorpay
RAZORPAY_KEY_ID=your_key_id
RAZORPAY_KEY_SECRET=your_key_secret
```

**Step 2: Create `.env.development`** (copy of example with dev values)

```env
APP_ENV=development
APP_NAME=SSMSPL
APP_VERSION=1.0.0
DEBUG=true
SECRET_KEY=dev_secret_key_replace_in_production
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=60
REFRESH_TOKEN_EXPIRE_DAYS=7
DATABASE_URL=postgresql+asyncpg://ssmspl_user:ssmspl_pass@localhost:5432/ssmspl_db_dev
ALLOWED_ORIGINS=http://localhost:3000
RAZORPAY_KEY_ID=rzp_test_placeholder
RAZORPAY_KEY_SECRET=placeholder_secret
```

**Step 3: Create `.env.test`**

```env
APP_ENV=test
APP_NAME=SSMSPL
APP_VERSION=1.0.0
DEBUG=true
SECRET_KEY=test_secret_key_not_for_production
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=60
REFRESH_TOKEN_EXPIRE_DAYS=7
DATABASE_URL=postgresql+asyncpg://ssmspl_user:ssmspl_pass@localhost:5432/ssmspl_db_test
ALLOWED_ORIGINS=http://localhost:3000
RAZORPAY_KEY_ID=rzp_test_placeholder
RAZORPAY_KEY_SECRET=placeholder_secret
```

**Step 4: Create `.env.staging`**

```env
APP_ENV=staging
APP_NAME=SSMSPL
APP_VERSION=1.0.0
DEBUG=false
SECRET_KEY=REPLACE_WITH_SECURE_KEY
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=30
REFRESH_TOKEN_EXPIRE_DAYS=7
DATABASE_URL=postgresql+asyncpg://ssmspl_user:REPLACE_PASS@staging-db-host:5432/ssmspl_db_staging
ALLOWED_ORIGINS=https://staging.ssmspl.com
RAZORPAY_KEY_ID=rzp_test_placeholder
RAZORPAY_KEY_SECRET=placeholder_secret
```

**Step 5: Create `.env.production`**

```env
APP_ENV=production
APP_NAME=SSMSPL
APP_VERSION=1.0.0
DEBUG=false
SECRET_KEY=REPLACE_WITH_SECURE_KEY
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=15
REFRESH_TOKEN_EXPIRE_DAYS=7
DATABASE_URL=postgresql+asyncpg://ssmspl_user:REPLACE_PASS@prod-db-host:5432/ssmspl_db_prod
ALLOWED_ORIGINS=https://app.ssmspl.com
RAZORPAY_KEY_ID=rzp_live_placeholder
RAZORPAY_KEY_SECRET=placeholder_secret
```

**Step 6: Create `backend/app/config.py`**

```python
from pydantic_settings import BaseSettings, SettingsConfigDict
from functools import lru_cache


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env.development", extra="ignore")

    # App
    APP_ENV: str = "development"
    APP_NAME: str = "SSMSPL"
    APP_VERSION: str = "1.0.0"
    DEBUG: bool = True

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

    # Razorpay
    RAZORPAY_KEY_ID: str = ""
    RAZORPAY_KEY_SECRET: str = ""


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
```

**Step 7: Commit**

```bash
git add backend/.env.example backend/app/config.py
git commit -m "feat(backend): add multi-environment configuration"
```

---

## Task 4: Backend – Database Setup & SQLAlchemy Async Engine

**Files:**
- Create: `backend/app/database.py`
- Create: `backend/app/__init__.py`
- Create: `backend/app/models/__init__.py`

**Step 1: Create `backend/app/__init__.py`** (empty)

**Step 2: Create `backend/app/database.py`**

```python
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase

from app.config import settings

engine = create_async_engine(
    settings.DATABASE_URL,
    echo=settings.DEBUG,
    pool_pre_ping=True,
    pool_size=10,
    max_overflow=20,
)

AsyncSessionLocal = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
)


class Base(DeclarativeBase):
    """Base class for all SQLAlchemy models."""
    pass


async def get_db() -> AsyncSession:
    async with AsyncSessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()
```

**Step 3: Create `backend/app/models/__init__.py`**

```python
from app.models.user import User

__all__ = ["User"]
```

**Step 4: Commit**

```bash
git add backend/app/
git commit -m "feat(backend): add async SQLAlchemy engine and session factory"
```

---

## Task 5: Backend – User Model & RBAC Roles

**Files:**
- Create: `backend/app/core/__init__.py`
- Create: `backend/app/core/rbac.py`
- Create: `backend/app/models/user.py`

**Step 1: Create `backend/app/core/rbac.py`**

```python
from enum import Enum


class UserRole(str, Enum):
    SUPER_ADMIN = "super_admin"
    ADMIN = "admin"
    MANAGER = "manager"
    BILLING_OPERATOR = "billing_operator"
    TICKET_CHECKER = "ticket_checker"


# Menu items visible per role (used by frontend navigation)
ROLE_MENU_ITEMS: dict[UserRole, list[str]] = {
    UserRole.SUPER_ADMIN: [
        "Dashboard",
        "User Management",
        "Ferry Management",
        "Route Management",
        "Ticketing",
        "Payments",
        "Reports",
        "System Settings",
    ],
    UserRole.ADMIN: [
        "Dashboard",
        "User Management",
        "Ferry Management",
        "Route Management",
        "Ticketing",
        "Payments",
        "Reports",
    ],
    UserRole.MANAGER: [
        "Dashboard",
        "Ferry Management",
        "Route Management",
        "Ticketing",
        "Reports",
    ],
    UserRole.BILLING_OPERATOR: [
        "Dashboard",
        "Ticketing",
        "Payments",
    ],
    UserRole.TICKET_CHECKER: [
        "Dashboard",
        "Ticket Verification",
    ],
}
```

**Step 2: Create `backend/app/models/user.py`**

```python
import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, Enum as SAEnum, String, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base
from app.core.rbac import UserRole


class User(Base):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False, index=True)
    username: Mapped[str] = mapped_column(String(100), unique=True, nullable=False, index=True)
    full_name: Mapped[str] = mapped_column(String(255), nullable=False)
    hashed_password: Mapped[str] = mapped_column(String(255), nullable=False)
    role: Mapped[UserRole] = mapped_column(
        SAEnum(UserRole, name="user_role_enum"), nullable=False, default=UserRole.TICKET_CHECKER
    )
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    is_verified: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    last_login: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    def __repr__(self) -> str:
        return f"<User id={self.id} username={self.username} role={self.role}>"
```

**Step 3: Commit**

```bash
git add backend/app/core/ backend/app/models/
git commit -m "feat(backend): add User model and RBAC roles"
```

---

## Task 6: Backend – Security (JWT + Password Hashing)

**Files:**
- Create: `backend/app/core/security.py`

**Step 1: Create `backend/app/core/security.py`**

```python
from datetime import datetime, timedelta, timezone
from typing import Any

from jose import JWTError, jwt
from passlib.context import CryptContext

from app.config import settings

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)


def get_password_hash(password: str) -> str:
    return pwd_context.hash(password)


def create_access_token(subject: str | Any, extra_claims: dict | None = None) -> str:
    expire = datetime.now(timezone.utc) + timedelta(
        minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES
    )
    payload = {"sub": str(subject), "exp": expire, "type": "access"}
    if extra_claims:
        payload.update(extra_claims)
    return jwt.encode(payload, settings.SECRET_KEY, algorithm=settings.ALGORITHM)


def create_refresh_token(subject: str | Any) -> str:
    expire = datetime.now(timezone.utc) + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)
    payload = {"sub": str(subject), "exp": expire, "type": "refresh"}
    return jwt.encode(payload, settings.SECRET_KEY, algorithm=settings.ALGORITHM)


def decode_token(token: str) -> dict:
    """
    Decode and validate a JWT token.
    Raises JWTError on invalid/expired tokens.
    """
    return jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
```

**Step 2: Commit**

```bash
git add backend/app/core/security.py
git commit -m "feat(backend): add JWT token creation/decode and bcrypt password hashing"
```

---

## Task 7: Backend – Pydantic Schemas

**Files:**
- Create: `backend/app/schemas/__init__.py`
- Create: `backend/app/schemas/auth.py`
- Create: `backend/app/schemas/user.py`

**Step 1: Create `backend/app/schemas/__init__.py`** (empty)

**Step 2: Create `backend/app/schemas/auth.py`**

```python
from pydantic import BaseModel


class LoginRequest(BaseModel):
    username: str
    password: str


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"


class RefreshRequest(BaseModel):
    refresh_token: str


class TokenPayload(BaseModel):
    sub: str
    type: str
```

**Step 3: Create `backend/app/schemas/user.py`**

```python
import uuid
from datetime import datetime

from pydantic import BaseModel, EmailStr

from app.core.rbac import UserRole


class UserBase(BaseModel):
    email: EmailStr
    username: str
    full_name: str
    role: UserRole = UserRole.TICKET_CHECKER


class UserCreate(UserBase):
    password: str


class UserUpdate(BaseModel):
    full_name: str | None = None
    email: EmailStr | None = None
    role: UserRole | None = None
    is_active: bool | None = None


class UserRead(UserBase):
    id: uuid.UUID
    is_active: bool
    is_verified: bool
    last_login: datetime | None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class UserMeResponse(UserRead):
    menu_items: list[str] = []
```

**Step 4: Commit**

```bash
git add backend/app/schemas/
git commit -m "feat(backend): add Pydantic schemas for auth and users"
```

---

## Task 8: Backend – Dependencies (Auth Middleware)

**Files:**
- Create: `backend/app/dependencies.py`

**Step 1: Create `backend/app/dependencies.py`**

```python
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.security import decode_token
from app.core.rbac import UserRole
from app.database import get_db
from app.models.user import User

bearer_scheme = HTTPBearer()


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
    db: AsyncSession = Depends(get_db),
) -> User:
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = decode_token(credentials.credentials)
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

**Step 2: Commit**

```bash
git add backend/app/dependencies.py
git commit -m "feat(backend): add JWT bearer dependency and role-based access guards"
```

---

## Task 9: Backend – Services (Auth & User)

**Files:**
- Create: `backend/app/services/__init__.py`
- Create: `backend/app/services/auth_service.py`
- Create: `backend/app/services/user_service.py`

**Step 1: Create `backend/app/services/__init__.py`** (empty)

**Step 2: Create `backend/app/services/auth_service.py`**

```python
from datetime import datetime, timezone

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.security import verify_password, create_access_token, create_refresh_token, decode_token
from app.core.rbac import ROLE_MENU_ITEMS
from app.models.user import User
from app.schemas.auth import TokenResponse


async def authenticate_user(db: AsyncSession, username: str, password: str) -> User | None:
    result = await db.execute(select(User).where(User.username == username, User.is_active == True))
    user = result.scalar_one_or_none()
    if not user or not verify_password(password, user.hashed_password):
        return None
    return user


async def login(db: AsyncSession, username: str, password: str) -> TokenResponse:
    from fastapi import HTTPException, status
    user = await authenticate_user(db, username, password)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
        )
    # Update last_login
    user.last_login = datetime.now(timezone.utc)
    await db.commit()

    extra = {"role": user.role.value}
    access_token = create_access_token(subject=str(user.id), extra_claims=extra)
    refresh_token = create_refresh_token(subject=str(user.id))
    return TokenResponse(access_token=access_token, refresh_token=refresh_token)


async def refresh_access_token(db: AsyncSession, refresh_token: str) -> TokenResponse:
    from fastapi import HTTPException, status
    from jose import JWTError
    try:
        payload = decode_token(refresh_token)
        if payload.get("type") != "refresh":
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token type")
        user_id = payload.get("sub")
    except JWTError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid refresh token")

    result = await db.execute(select(User).where(User.id == user_id, User.is_active == True))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")

    extra = {"role": user.role.value}
    new_access = create_access_token(subject=str(user.id), extra_claims=extra)
    new_refresh = create_refresh_token(subject=str(user.id))
    return TokenResponse(access_token=new_access, refresh_token=new_refresh)
```

**Step 3: Create `backend/app/services/user_service.py`**

```python
import uuid

from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func

from app.core.security import get_password_hash
from app.models.user import User
from app.schemas.user import UserCreate, UserUpdate


async def get_user_by_id(db: AsyncSession, user_id: uuid.UUID) -> User:
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    return user


async def get_all_users(db: AsyncSession, skip: int = 0, limit: int = 50) -> list[User]:
    result = await db.execute(select(User).offset(skip).limit(limit))
    return list(result.scalars().all())


async def create_user(db: AsyncSession, user_in: UserCreate) -> User:
    # Check uniqueness
    existing = await db.execute(
        select(User).where((User.email == user_in.email) | (User.username == user_in.username))
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email or username already registered")

    user = User(
        email=user_in.email,
        username=user_in.username,
        full_name=user_in.full_name,
        hashed_password=get_password_hash(user_in.password),
        role=user_in.role,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user


async def update_user(db: AsyncSession, user_id: uuid.UUID, user_in: UserUpdate) -> User:
    user = await get_user_by_id(db, user_id)
    update_data = user_in.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(user, field, value)
    await db.commit()
    await db.refresh(user)
    return user


async def deactivate_user(db: AsyncSession, user_id: uuid.UUID) -> User:
    user = await get_user_by_id(db, user_id)
    user.is_active = False
    await db.commit()
    await db.refresh(user)
    return user
```

**Step 4: Commit**

```bash
git add backend/app/services/
git commit -m "feat(backend): add auth and user service layer"
```

---

## Task 10: Backend – Routers (Auth & Users)

**Files:**
- Create: `backend/app/routers/__init__.py`
- Create: `backend/app/routers/auth.py`
- Create: `backend/app/routers/users.py`

**Step 1: Create `backend/app/routers/__init__.py`** (empty)

**Step 2: Create `backend/app/routers/auth.py`**

```python
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.schemas.auth import LoginRequest, TokenResponse, RefreshRequest
from app.schemas.user import UserMeResponse
from app.services import auth_service
from app.dependencies import get_current_user
from app.core.rbac import ROLE_MENU_ITEMS
from app.models.user import User

router = APIRouter(prefix="/api/auth", tags=["Authentication"])


@router.post("/login", response_model=TokenResponse)
async def login(body: LoginRequest, db: AsyncSession = Depends(get_db)):
    return await auth_service.login(db, body.username, body.password)


@router.post("/refresh", response_model=TokenResponse)
async def refresh(body: RefreshRequest, db: AsyncSession = Depends(get_db)):
    return await auth_service.refresh_access_token(db, body.refresh_token)


@router.get("/me", response_model=UserMeResponse)
async def me(current_user: User = Depends(get_current_user)):
    menu = ROLE_MENU_ITEMS.get(current_user.role, [])
    data = UserMeResponse.model_validate(current_user)
    data.menu_items = menu
    return data


@router.post("/logout")
async def logout():
    # JWT is stateless; client should discard the token.
    return {"message": "Logged out successfully"}
```

**Step 3: Create `backend/app/routers/users.py`**

```python
import uuid

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import require_roles
from app.core.rbac import UserRole
from app.schemas.user import UserCreate, UserRead, UserUpdate
from app.services import user_service

router = APIRouter(prefix="/api/users", tags=["Users"])

# Only Super Admin and Admin can manage users
_admin_roles = require_roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)


@router.get("/", response_model=list[UserRead])
async def list_users(
    skip: int = 0,
    limit: int = 50,
    db: AsyncSession = Depends(get_db),
    _=Depends(_admin_roles),
):
    return await user_service.get_all_users(db, skip, limit)


@router.post("/", response_model=UserRead, status_code=201)
async def create_user(
    body: UserCreate,
    db: AsyncSession = Depends(get_db),
    _=Depends(_admin_roles),
):
    return await user_service.create_user(db, body)


@router.get("/{user_id}", response_model=UserRead)
async def get_user(
    user_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _=Depends(_admin_roles),
):
    return await user_service.get_user_by_id(db, user_id)


@router.patch("/{user_id}", response_model=UserRead)
async def update_user(
    user_id: uuid.UUID,
    body: UserUpdate,
    db: AsyncSession = Depends(get_db),
    _=Depends(_admin_roles),
):
    return await user_service.update_user(db, user_id, body)


@router.delete("/{user_id}", response_model=UserRead)
async def deactivate_user(
    user_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _=Depends(require_roles(UserRole.SUPER_ADMIN)),
):
    return await user_service.deactivate_user(db, user_id)
```

**Step 4: Commit**

```bash
git add backend/app/routers/
git commit -m "feat(backend): add auth and user API routers"
```

---

## Task 11: Backend – FastAPI Application Entry Point

**Files:**
- Create: `backend/app/main.py`
- Create: `backend/gunicorn.conf.py`

**Step 1: Create `backend/app/main.py`**

```python
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.routers import auth, users

app = FastAPI(
    title=settings.APP_NAME,
    version=settings.APP_VERSION,
    description="Ferry Boat Ticketing System – Suvarnadurga Shipping & Marine Services Pvt. Ltd.",
    docs_url="/docs" if settings.DEBUG else None,
    redoc_url="/redoc" if settings.DEBUG else None,
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
```

**Step 2: Create `backend/gunicorn.conf.py`**

```python
import multiprocessing

# Worker class for async FastAPI
worker_class = "uvicorn.workers.UvicornWorker"

# Number of workers: 2 * CPU cores + 1 (standard formula)
workers = multiprocessing.cpu_count() * 2 + 1

# Bind address
bind = "0.0.0.0:8000"

# Timeouts
timeout = 120
keepalive = 5

# Logging
accesslog = "-"
errorlog = "-"
loglevel = "info"

# Graceful restart timeout
graceful_timeout = 30
```

**Step 3: Smoke test the app (no DB needed)**

```bash
cd backend
uvicorn app.main:app --reload --env-file .env.development
# Open http://localhost:8000/health → should return {"status":"ok"}
# Open http://localhost:8000/docs  → should show Swagger UI
```

**Step 4: Commit**

```bash
git add backend/app/main.py backend/gunicorn.conf.py
git commit -m "feat(backend): add FastAPI app with CORS, routers, and gunicorn config"
```

---

## Task 12: Database – Alembic Migration Setup

**Files:**
- Create: `backend/alembic.ini`
- Create: `backend/alembic/env.py`

**Step 1: Initialize Alembic**

```bash
cd backend
alembic init alembic
```

**Step 2: Edit `backend/alembic/env.py`** – replace generated content with:

```python
import asyncio
from logging.config import fileConfig

from sqlalchemy.ext.asyncio import async_engine_from_config
from sqlalchemy import pool

from alembic import context

# Import all models so Alembic detects them
from app.models import *  # noqa: F401, F403
from app.database import Base
from app.config import settings

config = context.config
config.set_main_option("sqlalchemy.url", settings.DATABASE_URL)

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata


def run_migrations_offline() -> None:
    url = config.get_main_option("sqlalchemy.url")
    context.configure(url=url, target_metadata=target_metadata, literal_binds=True)
    with context.begin_transaction():
        context.run_migrations()


def do_run_migrations(connection):
    context.configure(connection=connection, target_metadata=target_metadata)
    with context.begin_transaction():
        context.run_migrations()


async def run_async_migrations() -> None:
    connectable = async_engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )
    async with connectable.connect() as connection:
        await connection.run_sync(do_run_migrations)
    await connectable.dispose()


def run_migrations_online() -> None:
    asyncio.run(run_async_migrations())


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
```

**Step 3: Generate initial migration**

```bash
cd backend
alembic revision --autogenerate -m "create_users_table"
alembic upgrade head
```

**Step 4: Commit**

```bash
git add backend/alembic/ backend/alembic.ini
git commit -m "feat(db): add Alembic migrations with async engine"
```

---

## Task 13: Database – SQL DDL Script

**Files:**
- Create: `backend/scripts/ddl.sql`

**Step 1: Create `backend/scripts/ddl.sql`**

```sql
-- ============================================================
-- SSMSPL Ferry Boat Ticketing System
-- DDL Script – User Management & Authentication
-- Compatible with PostgreSQL 14+
-- ============================================================

-- Run this script against:
--   ssmspl_db_dev  (development)
--   ssmspl_db_test (testing)
--   ssmspl_db_prod (production)

-- ============================================================
-- EXTENSIONS
-- ============================================================
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- ENUMS
-- ============================================================
DO $$ BEGIN
    CREATE TYPE user_role_enum AS ENUM (
        'super_admin',
        'admin',
        'manager',
        'billing_operator',
        'ticket_checker'
    );
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- ============================================================
-- TABLES
-- ============================================================

-- Users table (authentication + RBAC)
CREATE TABLE IF NOT EXISTS users (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email           VARCHAR(255) NOT NULL UNIQUE,
    username        VARCHAR(100) NOT NULL UNIQUE,
    full_name       VARCHAR(255) NOT NULL,
    hashed_password VARCHAR(255) NOT NULL,
    role            user_role_enum NOT NULL DEFAULT 'ticket_checker',
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    is_verified     BOOLEAN NOT NULL DEFAULT FALSE,
    last_login      TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Refresh tokens (optional persistent refresh token store)
CREATE TABLE IF NOT EXISTS refresh_tokens (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash  VARCHAR(255) NOT NULL UNIQUE,  -- store hashed token
    expires_at  TIMESTAMPTZ NOT NULL,
    revoked     BOOLEAN NOT NULL DEFAULT FALSE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- INDEXES
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_users_email    ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_users_role     ON users(role);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user_id ON refresh_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_token_hash ON refresh_tokens(token_hash);

-- ============================================================
-- FUNCTIONS & TRIGGERS
-- ============================================================

-- Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_users_updated_at ON users;
CREATE TRIGGER set_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- END OF DDL
-- ============================================================
```

**Step 2: Commit**

```bash
git add backend/scripts/ddl.sql
git commit -m "feat(db): add DDL script for user management and auth tables"
```

---

## Task 14: Database – Seed Data Script

**Files:**
- Create: `backend/scripts/seed_data.sql`

**Step 1: Create `backend/scripts/seed_data.sql`**

Note: Passwords below are bcrypt hashes of `Password@123` (cost factor 12). **Change all passwords before staging/production.**

```sql
-- ============================================================
-- SSMSPL – Seed Data Script
-- User Management & Authentication
-- ============================================================
-- Default password for ALL seed users: Password@123
-- IMPORTANT: Change all passwords before deploying to staging/production!
-- ============================================================

-- Truncate for idempotent re-seeding (dev/test only)
-- TRUNCATE TABLE refresh_tokens, users RESTART IDENTITY CASCADE;

INSERT INTO users (id, email, username, full_name, hashed_password, role, is_active, is_verified)
VALUES
    -- Super Admin
    (
        uuid_generate_v4(),
        'superadmin@ssmspl.com',
        'superadmin',
        'Super Administrator',
        '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewFg/L8Qv1QK6Ny2',  -- Password@123
        'super_admin',
        TRUE,
        TRUE
    ),
    -- Admin
    (
        uuid_generate_v4(),
        'admin@ssmspl.com',
        'admin',
        'System Administrator',
        '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewFg/L8Qv1QK6Ny2',
        'admin',
        TRUE,
        TRUE
    ),
    -- Manager
    (
        uuid_generate_v4(),
        'manager@ssmspl.com',
        'manager',
        'Operations Manager',
        '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewFg/L8Qv1QK6Ny2',
        'manager',
        TRUE,
        TRUE
    ),
    -- Billing Operator
    (
        uuid_generate_v4(),
        'billing@ssmspl.com',
        'billing_op',
        'Billing Operator',
        '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewFg/L8Qv1QK6Ny2',
        'billing_operator',
        TRUE,
        TRUE
    ),
    -- Ticket Checker
    (
        uuid_generate_v4(),
        'checker@ssmspl.com',
        'ticket_checker',
        'Ticket Checker',
        '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewFg/L8Qv1QK6Ny2',
        'ticket_checker',
        TRUE,
        TRUE
    )
ON CONFLICT (username) DO NOTHING;

-- ============================================================
-- VERIFICATION QUERY
-- ============================================================
SELECT id, username, email, role, is_active FROM users ORDER BY role;
```

**Step 2: Apply seed to dev DB**

```bash
psql -U ssmspl_user -d ssmspl_db_dev -f backend/scripts/seed_data.sql
```

**Step 3: Commit**

```bash
git add backend/scripts/seed_data.sql
git commit -m "feat(db): add seed data for all RBAC roles with hashed passwords"
```

---

## Task 15: Backend – Tests (Auth & Users)

**Files:**
- Create: `backend/tests/__init__.py`
- Create: `backend/tests/conftest.py`
- Create: `backend/tests/test_auth.py`
- Create: `backend/tests/test_users.py`

**Step 1: Create `backend/tests/conftest.py`**

```python
import asyncio
import pytest
from httpx import AsyncClient, ASGITransport
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from sqlalchemy.pool import NullPool

from app.main import app
from app.database import Base, get_db
from app.core.security import get_password_hash
from app.models.user import User
from app.core.rbac import UserRole

TEST_DATABASE_URL = "postgresql+asyncpg://ssmspl_user:ssmspl_pass@localhost:5432/ssmspl_db_test"

engine_test = create_async_engine(TEST_DATABASE_URL, poolclass=NullPool)
TestSessionLocal = async_sessionmaker(engine_test, class_=AsyncSession, expire_on_commit=False)


async def override_get_db():
    async with TestSessionLocal() as session:
        yield session


app.dependency_overrides[get_db] = override_get_db


@pytest.fixture(scope="session")
def event_loop():
    loop = asyncio.get_event_loop_policy().new_event_loop()
    yield loop
    loop.close()


@pytest.fixture(scope="session", autouse=True)
async def setup_db():
    async with engine_test.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield
    async with engine_test.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)


@pytest.fixture
async def db_session() -> AsyncSession:
    async with TestSessionLocal() as session:
        yield session


@pytest.fixture
async def client() -> AsyncClient:
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        yield ac


@pytest.fixture
async def super_admin_user(db_session: AsyncSession) -> User:
    user = User(
        email="superadmin@test.com",
        username="test_superadmin",
        full_name="Test Super Admin",
        hashed_password=get_password_hash("TestPass@123"),
        role=UserRole.SUPER_ADMIN,
        is_active=True,
        is_verified=True,
    )
    db_session.add(user)
    await db_session.commit()
    await db_session.refresh(user)
    return user
```

**Step 2: Create `backend/tests/test_auth.py`**

```python
import pytest
from httpx import AsyncClient

pytestmark = pytest.mark.asyncio


async def test_health(client: AsyncClient):
    response = await client.get("/health")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"


async def test_login_success(client: AsyncClient, super_admin_user):
    response = await client.post("/api/auth/login", json={
        "username": "test_superadmin",
        "password": "TestPass@123",
    })
    assert response.status_code == 200
    data = response.json()
    assert "access_token" in data
    assert "refresh_token" in data
    assert data["token_type"] == "bearer"


async def test_login_wrong_password(client: AsyncClient, super_admin_user):
    response = await client.post("/api/auth/login", json={
        "username": "test_superadmin",
        "password": "WrongPassword",
    })
    assert response.status_code == 401


async def test_me_requires_auth(client: AsyncClient):
    response = await client.get("/api/auth/me")
    assert response.status_code == 403  # HTTPBearer returns 403 without credentials


async def test_me_with_token(client: AsyncClient, super_admin_user):
    login_resp = await client.post("/api/auth/login", json={
        "username": "test_superadmin", "password": "TestPass@123"
    })
    token = login_resp.json()["access_token"]
    response = await client.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert response.status_code == 200
    data = response.json()
    assert data["username"] == "test_superadmin"
    assert "menu_items" in data
    assert len(data["menu_items"]) > 0
```

**Step 3: Create `backend/tests/test_users.py`**

```python
import pytest
from httpx import AsyncClient

pytestmark = pytest.mark.asyncio


async def _get_token(client: AsyncClient, username: str, password: str) -> str:
    resp = await client.post("/api/auth/login", json={"username": username, "password": password})
    return resp.json()["access_token"]


async def test_list_users_requires_admin(client: AsyncClient, super_admin_user):
    token = await _get_token(client, "test_superadmin", "TestPass@123")
    response = await client.get("/api/users/", headers={"Authorization": f"Bearer {token}"})
    assert response.status_code == 200
    assert isinstance(response.json(), list)


async def test_create_user(client: AsyncClient, super_admin_user):
    token = await _get_token(client, "test_superadmin", "TestPass@123")
    response = await client.post(
        "/api/users/",
        json={
            "email": "newuser@test.com",
            "username": "newuser",
            "full_name": "New User",
            "password": "NewPass@123",
            "role": "ticket_checker",
        },
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 201
    data = response.json()
    assert data["username"] == "newuser"
    assert data["role"] == "ticket_checker"
```

**Step 4: Run the tests**

```bash
cd backend
pytest tests/ -v --cov=app --cov-report=term-missing
```

Expected: All tests PASS.

**Step 5: Commit**

```bash
git add backend/tests/
git commit -m "test(backend): add integration tests for auth and user management"
```

---

## Task 16: Frontend – Next.js Project Setup

**Files:**
- Create: `frontend/` (Next.js 14 project with TypeScript + Tailwind)

**Step 1: Scaffold Next.js app**

```bash
cd D:/workspace/ssmspl
npx create-next-app@latest frontend \
  --typescript \
  --tailwind \
  --eslint \
  --app \
  --src-dir \
  --import-alias "@/*" \
  --no-git
```

**Step 2: Install additional dependencies**

```bash
cd frontend
npm install axios js-cookie
npm install -D @types/js-cookie
```

**Step 3: Create `frontend/.env.local.example`**

```env
NEXT_PUBLIC_API_URL=http://localhost:8000
NEXT_PUBLIC_APP_NAME=SSMSPL
NEXT_PUBLIC_RAZORPAY_KEY_ID=your_razorpay_key_id
```

**Step 4: Copy to `.env.local`**

```bash
cp frontend/.env.local.example frontend/.env.local
```

**Step 5: Commit**

```bash
git add frontend/
git commit -m "feat(frontend): scaffold Next.js 14 app with TypeScript and Tailwind"
```

---

## Task 17: Frontend – Types & API Client

**Files:**
- Create: `frontend/src/types/index.ts`
- Create: `frontend/src/lib/api.ts`
- Create: `frontend/src/lib/auth.ts`

**Step 1: Create `frontend/src/types/index.ts`**

```typescript
export type UserRole =
  | "super_admin"
  | "admin"
  | "manager"
  | "billing_operator"
  | "ticket_checker";

export interface User {
  id: string;
  email: string;
  username: string;
  full_name: string;
  role: UserRole;
  is_active: boolean;
  is_verified: boolean;
  last_login: string | null;
  created_at: string;
  updated_at: string;
  menu_items: string[];
}

export interface TokenResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
}

export interface LoginRequest {
  username: string;
  password: string;
}
```

**Step 2: Create `frontend/src/lib/api.ts`**

```typescript
import axios from "axios";
import { getAccessToken, clearTokens } from "./auth";

const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000",
  headers: { "Content-Type": "application/json" },
});

// Attach Bearer token to every request
api.interceptors.request.use((config) => {
  const token = getAccessToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// On 401, clear tokens and redirect to login
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      clearTokens();
      window.location.href = "/login";
    }
    return Promise.reject(error);
  }
);

export default api;
```

**Step 3: Create `frontend/src/lib/auth.ts`**

```typescript
import Cookies from "js-cookie";

const ACCESS_TOKEN_KEY = "ssmspl_access_token";
const REFRESH_TOKEN_KEY = "ssmspl_refresh_token";

export function setTokens(accessToken: string, refreshToken: string): void {
  Cookies.set(ACCESS_TOKEN_KEY, accessToken, { secure: true, sameSite: "strict" });
  Cookies.set(REFRESH_TOKEN_KEY, refreshToken, { secure: true, sameSite: "strict", expires: 7 });
}

export function getAccessToken(): string | undefined {
  return Cookies.get(ACCESS_TOKEN_KEY);
}

export function getRefreshToken(): string | undefined {
  return Cookies.get(REFRESH_TOKEN_KEY);
}

export function clearTokens(): void {
  Cookies.remove(ACCESS_TOKEN_KEY);
  Cookies.remove(REFRESH_TOKEN_KEY);
}

export function isAuthenticated(): boolean {
  return !!getAccessToken();
}
```

**Step 4: Commit**

```bash
git add frontend/src/types/ frontend/src/lib/
git commit -m "feat(frontend): add types, axios API client, and auth token helpers"
```

---

## Task 18: Frontend – Login Page

**Files:**
- Create: `frontend/src/components/LoginForm.tsx`
- Modify: `frontend/src/app/login/page.tsx`
- Modify: `frontend/src/app/page.tsx`

**Step 1: Create `frontend/src/app/login/page.tsx`**

```typescript
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import api from "@/lib/api";
import { setTokens } from "@/lib/auth";
import { TokenResponse, LoginRequest } from "@/types";

export default function LoginPage() {
  const router = useRouter();
  const [form, setForm] = useState<LoginRequest>({ username: "", password: "" });
  const [error, setError] = useState<string>("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const { data } = await api.post<TokenResponse>("/api/auth/login", form);
      setTokens(data.access_token, data.refresh_token);
      router.push("/dashboard");
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ||
        "Login failed. Please check your credentials.";
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-blue-50">
      <div className="bg-white rounded-2xl shadow-lg p-10 w-full max-w-md">
        {/* Logo / Brand */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-blue-800">SSMSPL</h1>
          <p className="text-sm text-gray-500 mt-1">
            Suvarnadurga Shipping & Marine Services Pvt. Ltd.
          </p>
          <p className="text-xs text-gray-400 mt-1">Ferry Boat Ticketing System</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Username</label>
            <input
              type="text"
              required
              value={form.username}
              onChange={(e) => setForm({ ...form, username: e.target.value })}
              className="w-full border border-gray-300 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Enter your username"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
            <input
              type="password"
              required
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              className="w-full border border-gray-300 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Enter your password"
            />
          </div>

          {error && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded p-2">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-700 hover:bg-blue-800 text-white font-semibold py-2.5 rounded-lg transition disabled:opacity-60"
          >
            {loading ? "Signing in…" : "Sign In"}
          </button>
        </form>

        <p className="text-center text-xs text-gray-400 mt-6">
          &copy; {new Date().getFullYear()} SSMSPL. All rights reserved.
        </p>
      </div>
    </div>
  );
}
```

**Step 2: Modify `frontend/src/app/page.tsx`** – redirect root to login

```typescript
import { redirect } from "next/navigation";

export default function RootPage() {
  redirect("/login");
}
```

**Step 3: Commit**

```bash
git add frontend/src/app/login/ frontend/src/app/page.tsx
git commit -m "feat(frontend): add login page with SSMSPL branding"
```

---

## Task 19: Frontend – Dashboard / Landing Page with Role-Based Menu

**Files:**
- Create: `frontend/src/components/Sidebar.tsx`
- Create: `frontend/src/components/Navbar.tsx`
- Create: `frontend/src/app/dashboard/page.tsx`

**Step 1: Create `frontend/src/components/Navbar.tsx`**

```typescript
"use client";

import { useRouter } from "next/navigation";
import { clearTokens } from "@/lib/auth";
import { User } from "@/types";

interface NavbarProps {
  user: User;
}

const ROLE_LABELS: Record<string, string> = {
  super_admin: "Super Admin",
  admin: "Admin",
  manager: "Manager",
  billing_operator: "Billing Operator",
  ticket_checker: "Ticket Checker",
};

export default function Navbar({ user }: NavbarProps) {
  const router = useRouter();

  const handleLogout = () => {
    clearTokens();
    router.push("/login");
  };

  return (
    <header className="bg-blue-800 text-white px-6 py-3 flex items-center justify-between shadow-md">
      <div>
        <span className="text-xl font-bold tracking-wide">SSMSPL</span>
        <span className="ml-3 text-blue-300 text-sm">Ferry Ticketing System</span>
      </div>
      <div className="flex items-center gap-4">
        <div className="text-right">
          <p className="text-sm font-semibold">{user.full_name}</p>
          <p className="text-xs text-blue-300">{ROLE_LABELS[user.role] || user.role}</p>
        </div>
        <button
          onClick={handleLogout}
          className="bg-blue-600 hover:bg-blue-500 text-white text-sm px-4 py-1.5 rounded-lg transition"
        >
          Logout
        </button>
      </div>
    </header>
  );
}
```

**Step 2: Create `frontend/src/components/Sidebar.tsx`**

```typescript
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

interface SidebarProps {
  menuItems: string[];
}

// Map menu item names to routes
const MENU_ROUTES: Record<string, string> = {
  Dashboard: "/dashboard",
  "User Management": "/dashboard/users",
  "Ferry Management": "/dashboard/ferries",
  "Route Management": "/dashboard/routes",
  Ticketing: "/dashboard/ticketing",
  Payments: "/dashboard/payments",
  Reports: "/dashboard/reports",
  "System Settings": "/dashboard/settings",
  "Ticket Verification": "/dashboard/verify",
};

export default function Sidebar({ menuItems }: SidebarProps) {
  const pathname = usePathname();

  return (
    <aside className="w-56 bg-white border-r border-gray-200 min-h-full flex flex-col py-6 px-3">
      <nav className="space-y-1">
        {menuItems.map((item) => {
          const href = MENU_ROUTES[item] || "/dashboard";
          const active = pathname === href;
          return (
            <Link
              key={item}
              href={href}
              className={`flex items-center px-4 py-2.5 rounded-lg text-sm font-medium transition ${
                active
                  ? "bg-blue-50 text-blue-700 font-semibold"
                  : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
              }`}
            >
              {item}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
```

**Step 3: Create `frontend/src/app/dashboard/page.tsx`**

```typescript
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import api from "@/lib/api";
import { isAuthenticated } from "@/lib/auth";
import { User } from "@/types";
import Navbar from "@/components/Navbar";
import Sidebar from "@/components/Sidebar";

export default function DashboardPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isAuthenticated()) {
      router.push("/login");
      return;
    }
    api
      .get<User>("/api/auth/me")
      .then(({ data }) => setUser(data))
      .catch(() => router.push("/login"))
      .finally(() => setLoading(false));
  }, [router]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-gray-500">
        Loading…
      </div>
    );
  }

  if (!user) return null;

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      <Navbar user={user} />
      <div className="flex flex-1">
        <Sidebar menuItems={user.menu_items} />
        <main className="flex-1 p-8">
          <h2 className="text-2xl font-bold text-gray-800 mb-2">
            Welcome, {user.full_name}!
          </h2>
          <p className="text-gray-500 mb-6">
            You are logged in as <span className="font-semibold text-blue-700">{user.role.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}</span>.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {user.menu_items.map((item) => (
              <div
                key={item}
                className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 hover:shadow-md transition cursor-pointer"
              >
                <h3 className="text-lg font-semibold text-gray-700">{item}</h3>
                <p className="text-sm text-gray-400 mt-1">Click to navigate</p>
              </div>
            ))}
          </div>
        </main>
      </div>
    </div>
  );
}
```

**Step 4: Commit**

```bash
git add frontend/src/components/ frontend/src/app/dashboard/
git commit -m "feat(frontend): add dashboard with role-based sidebar and navbar"
```

---

## Task 20: Docker Compose Setup

**Files:**
- Create: `docker-compose.yml`
- Create: `docker-compose.dev.yml`

**Step 1: Create `docker-compose.yml`**

```yaml
version: "3.9"

services:
  db:
    image: postgres:16-alpine
    restart: unless-stopped
    environment:
      POSTGRES_USER: ssmspl_user
      POSTGRES_PASSWORD: ssmspl_pass
      POSTGRES_MULTIPLE_DATABASES: ssmspl_db_dev,ssmspl_db_test,ssmspl_db_prod
    volumes:
      - pg_data:/var/lib/postgresql/data
      - ./backend/scripts/ddl.sql:/docker-entrypoint-initdb.d/01_ddl.sql
      - ./backend/scripts/seed_data.sql:/docker-entrypoint-initdb.d/02_seed.sql
    ports:
      - "5432:5432"
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ssmspl_user"]
      interval: 10s
      timeout: 5s
      retries: 5

  backend:
    build:
      context: ./backend
      dockerfile: Dockerfile
    restart: unless-stopped
    env_file: ./backend/.env.development
    ports:
      - "8000:8000"
    depends_on:
      db:
        condition: service_healthy

  frontend:
    build:
      context: ./frontend
      dockerfile: Dockerfile
    restart: unless-stopped
    env_file: ./frontend/.env.local
    ports:
      - "3000:3000"
    depends_on:
      - backend

volumes:
  pg_data:
```

**Step 2: Create `docker-compose.dev.yml`** (dev overrides with hot-reload)

```yaml
version: "3.9"

services:
  backend:
    command: uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
    volumes:
      - ./backend:/app

  frontend:
    command: npm run dev
    volumes:
      - ./frontend:/app
      - /app/node_modules
```

**Step 3: Create `backend/Dockerfile`**

```dockerfile
FROM python:3.12-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

CMD ["gunicorn", "-c", "gunicorn.conf.py", "app.main:app"]
```

**Step 4: Create `frontend/Dockerfile`**

```dockerfile
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
EXPOSE 3000
CMD ["node", "server.js"]
```

**Step 5: Update `frontend/next.config.ts`** to enable standalone output:

```typescript
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
};

export default nextConfig;
```

**Step 6: Commit**

```bash
git add docker-compose.yml docker-compose.dev.yml backend/Dockerfile frontend/Dockerfile frontend/next.config.ts
git commit -m "feat: add Docker Compose for full-stack dev and production setup"
```

---

## Task 21: Final Integration Test & Smoke Test

**Step 1: Start the stack**

```bash
docker compose up -d db
# Wait for DB to be healthy, then:
cd backend
alembic upgrade head
python -m pytest tests/ -v
```

**Step 2: Start backend**

```bash
uvicorn app.main:app --reload --env-file .env.development
```

**Step 3: Start frontend**

```bash
cd frontend
npm run dev
```

**Step 4: Smoke test checklist**
- [ ] `GET http://localhost:8000/health` → `{"status":"ok"}`
- [ ] `GET http://localhost:8000/docs` → Swagger UI loads
- [ ] `POST http://localhost:8000/api/auth/login` with `{"username":"superadmin","password":"Password@123"}` → returns tokens
- [ ] `GET http://localhost:3000/login` → Login page renders
- [ ] Login with superadmin → redirected to dashboard with full menu (8 items)
- [ ] Login with ticket_checker → dashboard shows only 2 menu items
- [ ] Logout → redirected back to login

**Step 5: Final commit**

```bash
git add .
git commit -m "feat: complete SSMSPL v1.0 – user management, auth, RBAC, frontend"
```

---

## Summary

| Task | Component | Status |
|------|-----------|--------|
| 1 | Repo scaffolding | pending |
| 2 | Python dependencies | pending |
| 3 | Environment config | pending |
| 4 | Database setup | pending |
| 5 | User model + RBAC | pending |
| 6 | JWT security | pending |
| 7 | Pydantic schemas | pending |
| 8 | Auth dependencies | pending |
| 9 | Services layer | pending |
| 10 | API routers | pending |
| 11 | FastAPI app entry | pending |
| 12 | Alembic migrations | pending |
| 13 | SQL DDL script | pending |
| 14 | Seed data script | pending |
| 15 | Backend tests | pending |
| 16 | Next.js setup | pending |
| 17 | API client + types | pending |
| 18 | Login page | pending |
| 19 | Dashboard + menu | pending |
| 20 | Docker Compose | pending |
| 21 | Integration test | pending |
