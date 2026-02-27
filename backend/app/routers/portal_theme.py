from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.company import Company

router = APIRouter(prefix="/api/portal", tags=["Portal Theme"])


@router.get(
    "/theme",
    summary="Get active app theme (public)",
    description="Returns the active theme identifier. No authentication required.",
)
async def get_theme(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Company).where(Company.id == 1))
    company = result.scalar_one_or_none()
    themes = {
        "ocean": {
            "primary": "#006994",
            "primaryDark": "#004A6B",
            "primaryLight": "#00A8E8",
            "accent": "#00D4FF",
            "gradient": ["#006994", "#00A8E8"],
        },
    }
    active = company.active_theme if company and company.active_theme else "ocean"
    return {"theme_name": active, "colors": themes.get(active, themes["ocean"])}
