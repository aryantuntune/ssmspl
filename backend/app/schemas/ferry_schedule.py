from datetime import datetime

from pydantic import BaseModel, Field


class FerryScheduleBase(BaseModel):
    branch_id: int = Field(..., description="Branch ID", examples=[1])
    departure: str = Field(..., description="Departure time in HH:MM format", examples=["07:00"])
    boat_id: int | None = Field(
        None,
        description="Ferry assigned to this slot. Tickets booked for this branch+departure auto-stamp this boat_id.",
        examples=[3],
    )


class FerryScheduleCreate(FerryScheduleBase):
    model_config = {
        "json_schema_extra": {
            "examples": [
                {
                    "branch_id": 1,
                    "departure": "07:00",
                    "boat_id": 3,
                }
            ]
        }
    }


class FerryScheduleUpdate(BaseModel):
    branch_id: int | None = Field(None, description="Updated branch ID")
    departure: str | None = Field(None, description="Updated departure time in HH:MM format")
    boat_id: int | None = Field(None, description="Updated ferry assignment (set to null to unassign)")

    model_config = {
        "json_schema_extra": {
            "examples": [
                {"boat_id": 5}
            ]
        }
    }


class FerryScheduleRead(FerryScheduleBase):
    id: int = Field(..., description="Unique schedule identifier")
    branch_name: str | None = Field(None, description="Name of the branch")
    boat_name: str | None = Field(None, description="Name of the ferry assigned to this slot (e.g. SHANTADURGA)")
    created_at: datetime | None = Field(None, description="Record creation timestamp")
    updated_at: datetime | None = Field(None, description="Record last update timestamp")

    model_config = {"from_attributes": True}
