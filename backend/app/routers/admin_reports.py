"""
Admin Reports router — registered on both main domain and admin portal.

POS-only statutory reports. On the admin portal, the subdomain gate
(AdminUserAccess.is_granted) is enforced upstream in ``get_current_user``.
On the main domain, only the endpoint-level RBAC applies.
Either way, endpoint-level RBAC here restricts to SUPER_ADMIN and ADMIN.
"""
from __future__ import annotations

import datetime

from fastapi import APIRouter, BackgroundTasks, Depends, Query, Request
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.rbac import UserRole
from app.database import get_db
from app.dependencies import require_roles
from app.middleware.rate_limit import limiter
from app.models.user import User
from app.schemas.admin_report import (
    DateBranchSummaryReport,
    ItemwiseDailyChargesReport,
    ItemwiseLevyReport,
    MonthBranchSummaryReport,
)
from app.services import admin_pdf_service, admin_report_service, admin_xlsx_service
from app.services.activity_log_service import ActivityAction, log_activity

router = APIRouter(prefix="/api/reports/admin", tags=["Admin Reports"])

_admin_roles = require_roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)


_ACTION_BY_FORMAT = {
    "json": ActivityAction.REPORT_VIEW,
    "pdf": ActivityAction.REPORT_PDF,
    "xlsx": ActivityAction.REPORT_XLSX,
}


def _log(bg: BackgroundTasks, user: User, report_type: str, fmt: str, **filters):
    bg.add_task(
        log_activity,
        session_id=user.active_session_id,
        user_id=user.id,
        action_type=_ACTION_BY_FORMAT[fmt],
        metadata={
            "report_type": f"admin_{report_type}",
            "format": fmt,
            **{k: str(v) for k, v in filters.items() if v is not None},
        },
    )


# ── Report A ──────────────────────────────────────────────────────────────────


@limiter.limit("10/minute")
@router.get(
    "/itemwise-levy-summary",
    response_model=ItemwiseLevyReport,
    summary="Itemwise Levy Summary (admin)",
)
async def itemwise_levy_summary(
    request: Request,
    background_tasks: BackgroundTasks,
    date_from: datetime.date = Query(...),
    date_to: datetime.date = Query(...),
    route_id: int = Query(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(_admin_roles),
):
    _log(background_tasks, current_user, "itemwise_levy_summary", "json",
         date_from=date_from, date_to=date_to, route_id=route_id)
    return await admin_report_service.run_itemwise_levy_summary(
        db, date_from, date_to, route_id
    )


@limiter.limit("10/minute")
@router.get(
    "/itemwise-levy-summary/pdf",
    summary="Itemwise Levy Summary (PDF)",
)
async def itemwise_levy_summary_pdf(
    request: Request,
    background_tasks: BackgroundTasks,
    date_from: datetime.date = Query(...),
    date_to: datetime.date = Query(...),
    route_id: int = Query(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(_admin_roles),
):
    data = await admin_report_service.run_itemwise_levy_summary(
        db, date_from, date_to, route_id
    )
    _log(background_tasks, current_user, "itemwise_levy_summary", "pdf",
         date_from=date_from, date_to=date_to, route_id=route_id)
    return StreamingResponse(
        admin_pdf_service.generate_itemwise_levy_pdf(data),
        media_type="application/pdf",
        headers={
            "Content-Disposition": (
                f"attachment; filename=itemwise_levy_summary_{date_from}_{date_to}.pdf"
            )
        },
    )


@limiter.limit("10/minute")
@router.get(
    "/itemwise-levy-summary/xlsx",
    summary="Itemwise Levy Summary (Excel)",
)
async def itemwise_levy_summary_xlsx(
    request: Request,
    background_tasks: BackgroundTasks,
    date_from: datetime.date = Query(...),
    date_to: datetime.date = Query(...),
    route_id: int = Query(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(_admin_roles),
):
    data = await admin_report_service.run_itemwise_levy_summary(
        db, date_from, date_to, route_id
    )
    _log(background_tasks, current_user, "itemwise_levy_summary", "xlsx",
         date_from=date_from, date_to=date_to, route_id=route_id)
    return StreamingResponse(
        admin_xlsx_service.generate_itemwise_levy_xlsx(data),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={
            "Content-Disposition": (
                f"attachment; filename=itemwise_levy_summary_{date_from}_{date_to}.xlsx"
            )
        },
    )


# ── Report B ──────────────────────────────────────────────────────────────────


@limiter.limit("10/minute")
@router.get(
    "/date-branch-summary",
    response_model=DateBranchSummaryReport,
    summary="Date-Wise Branch Summary (Cash & UPI)",
)
async def date_branch_summary(
    request: Request,
    background_tasks: BackgroundTasks,
    date_from: datetime.date = Query(...),
    date_to: datetime.date = Query(...),
    route_id: int = Query(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(_admin_roles),
):
    _log(background_tasks, current_user, "date_branch_summary", "json",
         date_from=date_from, date_to=date_to, route_id=route_id)
    return await admin_report_service.run_date_branch_summary(
        db, date_from, date_to, route_id
    )


@limiter.limit("10/minute")
@router.get(
    "/date-branch-summary/pdf",
    summary="Date-Wise Branch Summary (PDF)",
)
async def date_branch_summary_pdf(
    request: Request,
    background_tasks: BackgroundTasks,
    date_from: datetime.date = Query(...),
    date_to: datetime.date = Query(...),
    route_id: int = Query(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(_admin_roles),
):
    data = await admin_report_service.run_date_branch_summary(
        db, date_from, date_to, route_id
    )
    _log(background_tasks, current_user, "date_branch_summary", "pdf",
         date_from=date_from, date_to=date_to, route_id=route_id)
    return StreamingResponse(
        admin_pdf_service.generate_date_branch_summary_pdf(data),
        media_type="application/pdf",
        headers={
            "Content-Disposition": (
                f"attachment; filename=date_branch_summary_{date_from}_{date_to}.pdf"
            )
        },
    )


@limiter.limit("10/minute")
@router.get(
    "/date-branch-summary/xlsx",
    summary="Date-Wise Branch Summary (Excel)",
)
async def date_branch_summary_xlsx(
    request: Request,
    background_tasks: BackgroundTasks,
    date_from: datetime.date = Query(...),
    date_to: datetime.date = Query(...),
    route_id: int = Query(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(_admin_roles),
):
    data = await admin_report_service.run_date_branch_summary(
        db, date_from, date_to, route_id
    )
    _log(background_tasks, current_user, "date_branch_summary", "xlsx",
         date_from=date_from, date_to=date_to, route_id=route_id)
    return StreamingResponse(
        admin_xlsx_service.generate_date_branch_summary_xlsx(data),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={
            "Content-Disposition": (
                f"attachment; filename=date_branch_summary_{date_from}_{date_to}.xlsx"
            )
        },
    )


# ── Report C ──────────────────────────────────────────────────────────────────


@limiter.limit("10/minute")
@router.get(
    "/itemwise-daily-charges",
    response_model=ItemwiseDailyChargesReport,
    summary="Itemwise Daily Collection Charges Summary",
)
async def itemwise_daily_charges(
    request: Request,
    background_tasks: BackgroundTasks,
    date_from: datetime.date = Query(...),
    date_to: datetime.date = Query(...),
    route_id: int = Query(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(_admin_roles),
):
    _log(background_tasks, current_user, "itemwise_daily_charges", "json",
         date_from=date_from, date_to=date_to, route_id=route_id)
    return await admin_report_service.run_itemwise_daily_charges(
        db, date_from, date_to, route_id
    )


@limiter.limit("10/minute")
@router.get(
    "/itemwise-daily-charges/pdf",
    summary="Itemwise Daily Collection Charges (PDF)",
)
async def itemwise_daily_charges_pdf(
    request: Request,
    background_tasks: BackgroundTasks,
    date_from: datetime.date = Query(...),
    date_to: datetime.date = Query(...),
    route_id: int = Query(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(_admin_roles),
):
    data = await admin_report_service.run_itemwise_daily_charges(
        db, date_from, date_to, route_id
    )
    _log(background_tasks, current_user, "itemwise_daily_charges", "pdf",
         date_from=date_from, date_to=date_to, route_id=route_id)
    return StreamingResponse(
        admin_pdf_service.generate_itemwise_daily_charges_pdf(data),
        media_type="application/pdf",
        headers={
            "Content-Disposition": (
                f"attachment; filename=itemwise_daily_charges_{date_from}_{date_to}.pdf"
            )
        },
    )


@limiter.limit("10/minute")
@router.get(
    "/itemwise-daily-charges/xlsx",
    summary="Itemwise Daily Collection Charges (Excel)",
)
async def itemwise_daily_charges_xlsx(
    request: Request,
    background_tasks: BackgroundTasks,
    date_from: datetime.date = Query(...),
    date_to: datetime.date = Query(...),
    route_id: int = Query(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(_admin_roles),
):
    data = await admin_report_service.run_itemwise_daily_charges(
        db, date_from, date_to, route_id
    )
    _log(background_tasks, current_user, "itemwise_daily_charges", "xlsx",
         date_from=date_from, date_to=date_to, route_id=route_id)
    return StreamingResponse(
        admin_xlsx_service.generate_itemwise_daily_charges_xlsx(data),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={
            "Content-Disposition": (
                f"attachment; filename=itemwise_daily_charges_{date_from}_{date_to}.xlsx"
            )
        },
    )


# ── Report D: Month-Wise Branch Summary (cross-route) ─────────────────────────


@limiter.limit("10/minute")
@router.get(
    "/month-branch-summary",
    response_model=MonthBranchSummaryReport,
    summary="Month-Wise Branch Summary (Cash + UPI)",
)
async def month_branch_summary(
    request: Request,
    background_tasks: BackgroundTasks,
    date_from: datetime.date = Query(...),
    date_to: datetime.date = Query(...),
    branch_ids: list[int] | None = Query(None,
        description="Filter to a subset of branches. Omit to include all active branches."),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(_admin_roles),
):
    _log(background_tasks, current_user, "month_branch_summary", "json",
         date_from=date_from, date_to=date_to,
         branch_ids=",".join(str(i) for i in (branch_ids or [])))
    return await admin_report_service.run_month_branch_summary(
        db, date_from, date_to, branch_ids
    )


@limiter.limit("10/minute")
@router.get(
    "/month-branch-summary/pdf",
    summary="Month-Wise Branch Summary (PDF)",
)
async def month_branch_summary_pdf(
    request: Request,
    background_tasks: BackgroundTasks,
    date_from: datetime.date = Query(...),
    date_to: datetime.date = Query(...),
    branch_ids: list[int] | None = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(_admin_roles),
):
    data = await admin_report_service.run_month_branch_summary(
        db, date_from, date_to, branch_ids
    )
    _log(background_tasks, current_user, "month_branch_summary", "pdf",
         date_from=date_from, date_to=date_to,
         branch_ids=",".join(str(i) for i in (branch_ids or [])))
    return StreamingResponse(
        admin_pdf_service.generate_month_branch_summary_pdf(data),
        media_type="application/pdf",
        headers={
            "Content-Disposition": (
                f"attachment; filename=month_branch_summary_{date_from}_{date_to}.pdf"
            )
        },
    )


@limiter.limit("10/minute")
@router.get(
    "/month-branch-summary/xlsx",
    summary="Month-Wise Branch Summary (Excel)",
)
async def month_branch_summary_xlsx(
    request: Request,
    background_tasks: BackgroundTasks,
    date_from: datetime.date = Query(...),
    date_to: datetime.date = Query(...),
    branch_ids: list[int] | None = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(_admin_roles),
):
    data = await admin_report_service.run_month_branch_summary(
        db, date_from, date_to, branch_ids
    )
    _log(background_tasks, current_user, "month_branch_summary", "xlsx",
         date_from=date_from, date_to=date_to,
         branch_ids=",".join(str(i) for i in (branch_ids or [])))
    return StreamingResponse(
        admin_xlsx_service.generate_month_branch_summary_xlsx(data),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={
            "Content-Disposition": (
                f"attachment; filename=month_branch_summary_{date_from}_{date_to}.xlsx"
            )
        },
    )
