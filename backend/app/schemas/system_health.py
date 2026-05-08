from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field


class PushDeviceCreate(BaseModel):
    expo_push_token: str = Field(..., min_length=10, max_length=255)
    device_label: str | None = Field(None, max_length=120)
    platform: str = Field("android", max_length=20)


class PushDeviceRead(BaseModel):
    id: UUID
    expo_push_token: str
    device_label: str | None
    platform: str
    is_active: bool
    created_at: datetime
    last_seen_at: datetime
    model_config = {"from_attributes": True}


class HealthEventCreate(BaseModel):
    """Sent by health_check.sh from the host. Auth via shared secret header."""

    server_name: str = Field(..., max_length=40)
    severity: str = Field(..., pattern=r"^(INFO|WARN|CRIT)$")
    check_name: str = Field(..., max_length=80)
    message: str = Field(..., max_length=2000)
    details: dict | None = None


class HealthEventRead(BaseModel):
    id: int
    server_name: str
    severity: str
    check_name: str
    message: str
    details: dict | None
    created_at: datetime
    model_config = {"from_attributes": True}


class HealthEventIngestResponse(BaseModel):
    event_id: int
    push_sent: int
    push_devices: int
    push_errors: list[str]
