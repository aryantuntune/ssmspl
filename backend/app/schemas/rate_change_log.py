from datetime import date as DateType, time as TimeType, datetime

from pydantic import BaseModel, Field


class RateChangeLogRead(BaseModel):
    id: int = Field(..., description="Log entry ID")
    date: DateType = Field(..., description="Date of the rate change")
    time: TimeType = Field(..., description="Time of the rate change")
    route_id: int = Field(..., description="Route ID")
    item_id: int = Field(..., description="Item ID")
    old_rate: float | None = Field(None, description="Previous rate value")
    new_rate: float | None = Field(None, description="New rate value")
    updated_by_user: str = Field(..., description="User ID who made the change")
    updated_by_name: str | None = Field(None, description="Full name of the user who made the change")
    item_name: str | None = Field(None, description="Name of the item")
    route_name: str | None = Field(None, description="Display name of the route")
    created_at: datetime | None = Field(None, description="Record creation timestamp")

    model_config = {"from_attributes": True}
