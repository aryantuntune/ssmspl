from datetime import datetime

from pydantic import BaseModel, Field


class PaymentModeBase(BaseModel):
    description: str = Field(..., description="Payment mode description", examples=["Cash"])


class PaymentModeCreate(PaymentModeBase):
    model_config = {
        "json_schema_extra": {
            "examples": [
                {
                    "description": "Cash",
                }
            ]
        }
    }


class PaymentModeUpdate(BaseModel):
    description: str | None = Field(None, description="Updated payment mode description")
    is_active: bool | None = Field(None, description="Set false to soft-delete (deactivate) the payment mode")

    model_config = {
        "json_schema_extra": {
            "examples": [
                {"description": "Cash", "is_active": False}
            ]
        }
    }


class PaymentModeRead(PaymentModeBase):
    id: int = Field(..., description="Unique payment mode identifier")
    is_active: bool = Field(..., description="Whether the payment mode is active")
    created_at: datetime | None = Field(None, description="Record creation timestamp")
    updated_at: datetime | None = Field(None, description="Record last update timestamp")

    model_config = {"from_attributes": True}
