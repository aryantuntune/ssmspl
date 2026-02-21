from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import require_roles
from app.core.rbac import UserRole
from app.schemas.company import CompanyRead, CompanyUpdate
from app.services import company_service

router = APIRouter(prefix="/api/company", tags=["Company"])

_admin_or_above = require_roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)


@router.get(
    "/",
    response_model=CompanyRead,
    summary="Get company settings",
    description="Fetch the single company record. Requires **Super Admin** or **Admin** role.",
    responses={
        200: {"description": "Company details returned"},
        401: {"description": "Not authenticated"},
        403: {"description": "Insufficient role permissions"},
        404: {"description": "Company record not found"},
    },
)
async def get_company(
    db: AsyncSession = Depends(get_db),
    _=Depends(_admin_or_above),
):
    return await company_service.get_company(db)


@router.patch(
    "/",
    response_model=CompanyRead,
    summary="Update company settings",
    description="Partially update the company record. Requires **Super Admin** or **Admin** role.",
    responses={
        200: {"description": "Company updated successfully"},
        401: {"description": "Not authenticated"},
        403: {"description": "Insufficient role permissions"},
        404: {"description": "Company record not found"},
    },
)
async def update_company(
    body: CompanyUpdate,
    db: AsyncSession = Depends(get_db),
    _=Depends(_admin_or_above),
):
    return await company_service.update_company(db, body)
