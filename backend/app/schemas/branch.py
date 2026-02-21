from datetime import datetime, time

from pydantic import BaseModel, Field


class BranchBase(BaseModel):
    name: str = Field(..., max_length=15, description="Branch name", examples=["Old Goa"])
    address: str = Field(..., max_length=255, description="Branch address", examples=["Old Goa Jetty, Goa 403402"])
    contact_nos: str | None = Field(None, max_length=255, description="Contact numbers", examples=["0832-2456789"])
    latitude: float | None = Field(None, description="Latitude coordinate", examples=[15.501330000000000])
    longitude: float | None = Field(None, description="Longitude coordinate", examples=[73.911090000000000])
    sf_after: time | None = Field(None, description="Sailing forbidden after this time", examples=["18:00:00"])
    sf_before: time | None = Field(None, description="Sailing forbidden before this time", examples=["06:00:00"])


class BranchCreate(BranchBase):
    model_config = {
        "json_schema_extra": {
            "examples": [
                {
                    "name": "Old Goa",
                    "address": "Old Goa Jetty, Goa 403402",
                    "contact_nos": "0832-2456789",
                    "latitude": 15.50133,
                    "longitude": 73.91109,
                    "sf_after": "18:00:00",
                    "sf_before": "06:00:00",
                }
            ]
        }
    }


class BranchUpdate(BaseModel):
    name: str | None = Field(None, max_length=15, description="Updated branch name")
    address: str | None = Field(None, max_length=255, description="Updated branch address")
    contact_nos: str | None = Field(None, max_length=255, description="Updated contact numbers")
    latitude: float | None = Field(None, description="Updated latitude")
    longitude: float | None = Field(None, description="Updated longitude")
    sf_after: time | None = Field(None, description="Updated sailing forbidden after time")
    sf_before: time | None = Field(None, description="Updated sailing forbidden before time")
    is_active: bool | None = Field(None, description="Set false to soft-delete (deactivate) the branch")

    model_config = {
        "json_schema_extra": {
            "examples": [
                {"name": "Old Goa", "is_active": False}
            ]
        }
    }


class BranchRead(BranchBase):
    id: int = Field(..., description="Unique branch identifier")
    sf_after: time | None = Field(None, description="Sailing forbidden after this time")
    sf_before: time | None = Field(None, description="Sailing forbidden before this time")
    is_active: bool | None = Field(None, description="Whether the branch is active (soft-delete flag)")
    last_booking_no: int = Field(0, description="Last booking number issued by this branch")
    created_at: datetime | None = Field(None, description="Record creation timestamp")
    updated_at: datetime | None = Field(None, description="Record last update timestamp")

    model_config = {"from_attributes": True}
