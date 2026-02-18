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
