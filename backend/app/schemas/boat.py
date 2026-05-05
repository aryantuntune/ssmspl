from datetime import datetime

from pydantic import BaseModel, Field


class BoatBase(BaseModel):
    name: str = Field(..., min_length=5, max_length=30, description="Boat/ferry name", examples=["SHANTADURGA"])
    no: str = Field(..., min_length=10, max_length=30, description="Registration / boat number", examples=["RTN-IV-03-00001"])
    route_id: int | None = Field(
        None,
        description="Operating route ID. A ferry runs between two ports (a route corridor); leave null for unassigned vessels.",
        examples=[2],
    )


class BoatCreate(BoatBase):

    model_config = {
        "json_schema_extra": {
            "examples": [
                {
                    "name": "DEVYANSHI",
                    "no": "RTN-IV-200",
                    "route_id": 2,
                }
            ]
        }
    }


class BoatUpdate(BaseModel):
    name: str | None = Field(None, min_length=5, max_length=30, description="Updated boat name")
    no: str | None = Field(None, min_length=10, max_length=30, description="Updated registration number")
    is_active: bool | None = Field(None, description="Set false to soft-delete (deactivate) the boat")
    route_id: int | None = Field(None, description="Updated operating route ID (set to null to unassign)")

    model_config = {
        "json_schema_extra": {
            "examples": [
                {"route_id": 5, "is_active": True}
            ]
        }
    }


class BoatRead(BoatBase):
    id: int = Field(..., description="Unique boat identifier")
    is_active: bool | None = Field(None, description="Whether the boat is active (soft-delete flag)")
    route_name: str | None = Field(
        None,
        description="Display name of the operating route (e.g. 'VESHVI - BAGMANDALE'). Null if unassigned.",
    )
    created_at: datetime | None = Field(None, description="Record creation timestamp")
    updated_at: datetime | None = Field(None, description="Record last update timestamp")

    model_config = {"from_attributes": True}
