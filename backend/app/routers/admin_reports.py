"""
Admin Reports router — registered only when ADMIN_PORTAL_MODE=true.

Three POS-only statutory reports. The subdomain gate
(AdminUserAccess.is_granted) is enforced upstream in ``get_current_user``.
Endpoint-level RBAC here restricts to SUPER_ADMIN and ADMIN.
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


import re

# Characters that are illegal or ugly in HTTP filenames.
_FILENAME_STRIP_RE = re.compile(r'[\s+/\\:?*"<>|]+')


def _build_filename(report_label: str, route_label: str,
                    date_from: datetime.date, date_to: datetime.date,
                    ext: str) -> str:
    """Human-readable, ASCII-safe download name.

    Example:
        "VIRAR + SAFALE"  ->  Itemwise-Levy_VIRAR-SAFALE_01-Apr-2026_to_25-Apr-2026.pdf

    RFC 6266 requires the ``filename`` parameter in Content-Disposition
    to be ASCII. If the route label contains non-ASCII characters (e.g.
    Devanagari for translated branch names), they're stripped here so the
    HTTP header parses cleanly across browsers. Falls back to a date-only
    stem if the route label is missing or strips to nothing.
    """
    # Strip non-ASCII first so we don't preserve garbage codepoints.
    ascii_only = (route_label or "").encode("ascii", errors="ignore").decode("ascii")
    # Collapse any run of whitespace / + / / / \ / : / ? / * / " / < / > / |
    # into a single hyphen — turns "VIRAR + SAFALE" into "VIRAR-SAFALE".
    route = _FILENAME_STRIP_RE.sub("-", ascii_only).strip("-_")
    df = date_from.strftime("%d-%b-%Y")
    dt = date_to.strftime("%d-%b-%Y")
    parts = [report_label, route, f"{df}_to_{dt}"] if route else [report_label, f"{df}_to_{dt}"]
    return "_".join(parts) + f".{ext}"


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
    fname = _build_filename("Itemwise-Levy", data.get("route_label", ""), date_from, date_to, "pdf")
    return StreamingResponse(
        admin_pdf_service.generate_itemwise_levy_pdf(data),
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{fname}"'},
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
    fname = _build_filename("Itemwise-Levy", data.get("route_label", ""), date_from, date_to, "xlsx")
    return StreamingResponse(
        admin_xlsx_service.generate_itemwise_levy_xlsx(data),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{fname}"'},
    )


# ── Report B ──────────────────────────────────────────────────────────────────


@limiter.limit("10/minute")
@router.get(
    "/date-branch-summary",
    response_model=DateBranchSummaryReport,
    summary="Date-Wise Branch Summary (Cash + GPay)",
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
    fname = _build_filename("Date-Branch-Summary", data.get("route_label", ""), date_from, date_to, "pdf")
    return StreamingResponse(
        admin_pdf_service.generate_date_branch_summary_pdf(data),
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{fname}"'},
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
    fname = _build_filename("Date-Branch-Summary", data.get("route_label", ""), date_from, date_to, "xlsx")
    return StreamingResponse(
        admin_xlsx_service.generate_date_branch_summary_xlsx(data),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{fname}"'},
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
    fname = _build_filename("Daily-Charges", data.get("route_label", ""), date_from, date_to, "pdf")
    return StreamingResponse(
        admin_pdf_service.generate_itemwise_daily_charges_pdf(data),
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{fname}"'},
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
    fname = _build_filename("Daily-Charges", data.get("route_label", ""), date_from, date_to, "xlsx")
    return StreamingResponse(
        admin_xlsx_service.generate_itemwise_daily_charges_xlsx(data),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{fname}"'},
    )
