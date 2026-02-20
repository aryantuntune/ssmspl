from pydantic import BaseModel, Field


class FerryScheduleBase(BaseModel):
    branch_id: int = Field(..., description="Branch ID", examples=[1])
    departure: str = Field(..., description="Departure time in HH:MM format", examples=["07:00"])


class FerryScheduleCreate(FerryScheduleBase):
    model_config = {
        "json_schema_extra": {
            "examples": [
                {
                    "branch_id": 1,
                    "departure": "07:00",
                }
            ]
        }
    }


class FerryScheduleUpdate(BaseModel):
    branch_id: int | None = Field(None, description="Updated branch ID")
    departure: str | None = Field(None, description="Updated departure time in HH:MM format")

    model_config = {
        "json_schema_extra": {
            "examples": [
                {"departure": "08:30"}
            ]
        }
    }


class FerryScheduleRead(FerryScheduleBase):
    id: int = Field(..., description="Unique schedule identifier")
    branch_name: str | None = Field(None, description="Name of the branch")

    model_config = {"from_attributes": True}
