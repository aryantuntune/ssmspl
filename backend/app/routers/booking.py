from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_portal_user
from app.models.portal_user import PortalUser
from app.services import booking_service

router = APIRouter(prefix="/api/booking", tags=["Booking Data"])


@router.get(
    "/branches",
    summary="Get all active departure branches",
    description="Returns all active branches for the booking form departure selection.",
)
async def departure_branches(
    db: AsyncSession = Depends(get_db),
    _: PortalUser = Depends(get_current_portal_user),
):
    return await booking_service.get_departure_branches(db)


@router.get(
    "/to-branches/{branch_id}",
    summary="Get destination branches for a departure branch",
    description="Returns branches connected via active routes to the given departure branch.",
)
async def to_branches(
    branch_id: int,
    db: AsyncSession = Depends(get_db),
    _: PortalUser = Depends(get_current_portal_user),
):
    return await booking_service.get_to_branches(db, branch_id)


@router.get(
    "/items/{from_branch_id}/{to_branch_id}",
    summary="Get bookable items with rates for a route",
    description="Returns items with online_visibility=true and their current rates for the route between two branches.",
)
async def items(
    from_branch_id: int,
    to_branch_id: int,
    db: AsyncSession = Depends(get_db),
    _: PortalUser = Depends(get_current_portal_user),
):
    return await booking_service.get_online_items(db, from_branch_id, to_branch_id)


@router.get(
    "/schedules/{branch_id}",
    summary="Get ferry schedules for a branch",
    description="Returns departure times for the given branch.",
)
async def schedules(
    branch_id: int,
    db: AsyncSession = Depends(get_db),
    _: PortalUser = Depends(get_current_portal_user),
):
    return await booking_service.get_schedules(db, branch_id)


@router.get(
    "/item-rate/{item_id}/{route_id}",
    summary="Get current rate for an item on a route",
    description="Returns the current rate and levy for the given item and route combination.",
)
async def item_rate(
    item_id: int,
    route_id: int,
    db: AsyncSession = Depends(get_db),
    _: PortalUser = Depends(get_current_portal_user),
):
    return await booking_service.get_item_rate(db, item_id, route_id)
