from pydantic import BaseModel, Field


class BoatBase(BaseModel):
    name: str = Field(..., description="Boat/ferry name", examples=["SHANTADURGA"])
    no: str = Field(..., description="Registration / boat number", examples=["RTN-IV-03-00001"])


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
    name: str | None = Field(None, description="Updated boat name")
    no: str | None = Field(None, description="Updated registration number")
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

    model_config = {"from_attributes": True}
