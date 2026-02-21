from datetime import date, datetime

from pydantic import BaseModel, Field


class ItemRateBase(BaseModel):
    applicable_from_date: date | None = Field(None, description="Date from which this rate applies", examples=["2025-01-01"])
    levy: float | None = Field(None, ge=0, description="Levy amount", examples=[10.00])
    rate: float | None = Field(None, gt=1, description="Rate amount (must be > 1)", examples=[150.00])
    item_id: int = Field(..., description="Item ID", examples=[1])
    route_id: int = Field(..., description="Route ID", examples=[1])


class ItemRateCreate(ItemRateBase):
    model_config = {
        "json_schema_extra": {
            "examples": [
                {
                    "applicable_from_date": "2025-01-01",
                    "levy": 10.00,
                    "rate": 150.00,
                    "item_id": 1,
                    "route_id": 1,
                }
            ]
        }
    }


class ItemRateUpdate(BaseModel):
    applicable_from_date: date | None = Field(None, description="Updated applicable from date")
    levy: float | None = Field(None, ge=0, description="Updated levy amount")
    rate: float | None = Field(None, gt=1, description="Updated rate amount (must be > 1)")
    item_id: int | None = Field(None, description="Updated item ID")
    route_id: int | None = Field(None, description="Updated route ID")
    is_active: bool | None = Field(None, description="Set false to soft-delete (deactivate) the item rate")

    model_config = {
        "json_schema_extra": {
            "examples": [
                {"rate": 200.00, "is_active": False}
            ]
        }
    }


class BulkUpcomingRequest(BaseModel):
    applicable_from_date: date = Field(..., description="The new applicable from date for duplicated rates", examples=["2025-06-01"])


class ItemRateRead(BaseModel):
    id: int = Field(..., description="Unique item rate identifier")
    applicable_from_date: date | None = Field(None, description="Date from which this rate applies")
    levy: float | None = Field(None, description="Levy amount")
    rate: float | None = Field(None, description="Rate amount")
    item_id: int | None = Field(None, description="Item ID")
    route_id: int | None = Field(None, description="Route ID")
    is_active: bool | None = Field(None, description="Whether the item rate is active")
    item_name: str | None = Field(None, description="Name of the item")
    route_name: str | None = Field(None, description="Display name of the route (Branch One - Branch Two)")
    created_at: datetime | None = Field(None, description="Record creation timestamp")
    updated_at: datetime | None = Field(None, description="Record last update timestamp")

    model_config = {"from_attributes": True}
