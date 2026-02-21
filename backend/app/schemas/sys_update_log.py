from datetime import datetime

from pydantic import BaseModel, Field


class SysUpdateLogRead(BaseModel):
    id: int = Field(..., description="Unique log identifier")
    entity_name: str = Field(..., description="Name of the entity that was updated")
    old_data: dict | None = Field(None, description="Previous state (JSONB)")
    new_data: dict | None = Field(None, description="New state (JSONB)")
    updated_by: str | None = Field(None, description="UUID of user who made the change")
    updated_at: datetime = Field(..., description="Timestamp of the update")

    model_config = {"from_attributes": True}
