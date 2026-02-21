from datetime import datetime

from pydantic import BaseModel, Field


class RouteBase(BaseModel):
    branch_id_one: int = Field(..., description="First branch ID", examples=[1])
    branch_id_two: int = Field(..., description="Second branch ID", examples=[2])


class RouteCreate(RouteBase):
    model_config = {
        "json_schema_extra": {
            "examples": [
                {
                    "branch_id_one": 1,
                    "branch_id_two": 2,
                }
            ]
        }
    }


class RouteUpdate(BaseModel):
    branch_id_one: int | None = Field(None, description="Updated first branch ID")
    branch_id_two: int | None = Field(None, description="Updated second branch ID")
    is_active: bool | None = Field(None, description="Set false to soft-delete (deactivate) the route")

    model_config = {
        "json_schema_extra": {
            "examples": [
                {"is_active": False}
            ]
        }
    }


class RouteRead(RouteBase):
    id: int = Field(..., description="Unique route identifier")
    is_active: bool | None = Field(None, description="Whether the route is active")
    branch_one_name: str | None = Field(None, description="Name of the first branch")
    branch_two_name: str | None = Field(None, description="Name of the second branch")
    created_at: datetime | None = Field(None, description="Record creation timestamp")
    updated_at: datetime | None = Field(None, description="Record last update timestamp")

    model_config = {"from_attributes": True}
