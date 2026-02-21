from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.models.company import Company
from app.schemas.company import CompanyUpdate


async def get_company(db: AsyncSession) -> Company:
    result = await db.execute(select(Company).where(Company.id == 1))
    company = result.scalar_one_or_none()
    if not company:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Company record not found")
    return company


async def update_company(db: AsyncSession, company_in: CompanyUpdate) -> Company:
    company = await get_company(db)
    update_data = company_in.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(company, field, value)
    await db.commit()
    await db.refresh(company)
    return company
