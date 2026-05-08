"""Send push notifications via Expo Push API.

Free, no Firebase/FCM credentials required for development APK builds.
Tokens look like `ExponentPushToken[xxx]` and are created by the mobile app
via `Notifications.getExpoPushTokenAsync()`.
"""
from __future__ import annotations

import asyncio
import logging
from typing import Iterable

import httpx
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.push_device import PushDevice

logger = logging.getLogger(__name__)

EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send"
_TIMEOUT = httpx.Timeout(10.0)


async def send_push(
    db: AsyncSession,
    *,
    title: str,
    body: str,
    data: dict | None = None,
    priority: str = "high",
) -> dict:
    """Fan out a single push to every active device for every user.

    Returns {sent: int, devices: int, errors: list[str]}.
    """
    tokens = (
        await db.execute(
            select(PushDevice.expo_push_token, PushDevice.id).where(PushDevice.is_active.is_(True))
        )
    ).all()
    if not tokens:
        return {"sent": 0, "devices": 0, "errors": ["no active devices"]}

    messages = [
        {
            "to": tok,
            "title": title,
            "body": body,
            "sound": "default",
            "priority": priority,
            "data": data or {},
        }
        for tok, _ in tokens
    ]

    errors: list[str] = []
    sent = 0
    invalid_token_ids: list = []

    try:
        async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
            r = await client.post(
                EXPO_PUSH_URL,
                json=messages,
                headers={"accept": "application/json", "content-type": "application/json"},
            )
            r.raise_for_status()
            payload = r.json()
            results = payload.get("data", [])
            for (tok, dev_id), result in zip(tokens, results):
                if isinstance(result, dict) and result.get("status") == "ok":
                    sent += 1
                else:
                    err = (result or {}).get("message") if isinstance(result, dict) else str(result)
                    errors.append(f"{tok[:24]}…: {err}")
                    if isinstance(result, dict) and result.get("details", {}).get(
                        "error"
                    ) == "DeviceNotRegistered":
                        invalid_token_ids.append(dev_id)
    except Exception as e:  # noqa: BLE001
        logger.exception("Expo push fan-out failed")
        errors.append(f"transport: {e!s}")

    if invalid_token_ids:
        await db.execute(
            update(PushDevice)
            .where(PushDevice.id.in_(invalid_token_ids))
            .values(is_active=False)
        )
        await db.commit()

    return {"sent": sent, "devices": len(tokens), "errors": errors}


async def send_push_to_tokens(tokens: Iterable[str], *, title: str, body: str, data: dict | None = None) -> dict:
    """Lower-level: send to specific tokens. Used in tests and ad-hoc scripts."""
    messages = [
        {"to": tok, "title": title, "body": body, "sound": "default", "priority": "high", "data": data or {}}
        for tok in tokens
    ]
    if not messages:
        return {"sent": 0, "errors": []}
    async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
        r = await client.post(EXPO_PUSH_URL, json=messages)
        r.raise_for_status()
        payload = r.json()
        results = payload.get("data", [])
        sent = sum(1 for x in results if isinstance(x, dict) and x.get("status") == "ok")
        return {"sent": sent, "errors": [x for x in results if not (isinstance(x, dict) and x.get("status") == "ok")]}
