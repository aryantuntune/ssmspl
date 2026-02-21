from datetime import datetime

from pydantic import BaseModel, Field


class BoatBase(BaseModel):
    name: str = Field(..., min_length=5, max_length=30, description="Boat/ferry name", examples=["SHANTADURGA"])
    no: str = Field(..., min_length=10, max_length=30, description="Registration / boat number", examples=["RTN-IV-03-00001"])


class BoatCreate(BoatBase):
    model_config = {
        "json_schema_extra": {
            "examples": [
                {
                    "name": "DEVYANSHI",
                    "no": "RTN-IV-200",
                }
            ]
        }
    }


class BoatUpdate(BaseModel):
    name: str | None = Field(None, min_length=5, max_length=30, description="Updated boat name")
    no: str | None = Field(None, min_length=10, max_length=30, description="Updated registration number")
    is_active: bool | None = Field(None, description="Set false to soft-delete (deactivate) the boat")

    model_config = {
        "json_schema_extra": {
            "examples": [
                {"name": "DEVYANSHI II", "is_active": False}
            ]
        }
    }


class BoatRead(BoatBase):
    id: int = Field(..., description="Unique boat identifier")
    is_active: bool | None = Field(None, description="Whether the boat is active (soft-delete flag)")
    created_at: datetime | None = Field(None, description="Record creation timestamp")
    updated_at: datetime | None = Field(None, description="Record last update timestamp")

    model_config = {"from_attributes": True}
