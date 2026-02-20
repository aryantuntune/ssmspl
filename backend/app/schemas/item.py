from pydantic import BaseModel, Field


class ItemBase(BaseModel):
    name: str = Field(..., max_length=60, description="Item name", examples=["Adult Passenger"])
    short_name: str = Field(..., max_length=30, description="Short name", examples=["Adult"])
    online_visibility: bool | None = Field(None, description="Whether the item is visible online", examples=[True])
    is_vehicle: bool | None = Field(None, description="Whether this item is a vehicle type", examples=[False])


class ItemCreate(ItemBase):
    model_config = {
        "json_schema_extra": {
            "examples": [
                {
                    "name": "Adult Passenger",
                    "short_name": "Adult",
                    "online_visibility": True,
                    "is_vehicle": False,
                }
            ]
        }
    }


class ItemUpdate(BaseModel):
    name: str | None = Field(None, max_length=60, description="Updated item name")
    short_name: str | None = Field(None, max_length=30, description="Updated short name")
    online_visibility: bool | None = Field(None, description="Updated online visibility")
    is_vehicle: bool | None = Field(None, description="Updated vehicle type flag")
    is_active: bool | None = Field(None, description="Set false to soft-delete (deactivate) the item")

    model_config = {
        "json_schema_extra": {
            "examples": [
                {"name": "Adult Passenger", "is_active": False}
            ]
        }
    }


class ItemRead(ItemBase):
    id: int = Field(..., description="Unique item identifier")
    is_active: bool | None = Field(None, description="Whether the item is active (soft-delete flag)")

    model_config = {"from_attributes": True}
