from datetime import datetime

from pydantic import BaseModel, Field


class CompanyUpdate(BaseModel):
    name: str | None = Field(None, description="Company name")
    short_name: str | None = Field(None, description="Company short name")
    reg_address: str | None = Field(None, description="Registered address")
    gst_no: str | None = Field(None, description="GST number")
    pan_no: str | None = Field(None, description="PAN number")
    tan_no: str | None = Field(None, description="TAN number")
    cin_no: str | None = Field(None, description="CIN number")
    contact: str | None = Field(None, description="Contact number(s)")
    email: str | None = Field(None, description="Contact email")
    sf_item_id: int | None = Field(None, description="Special fare item ID")


class CompanyRead(BaseModel):
    id: int = Field(..., description="Unique company identifier")
    name: str = Field(..., description="Company name")
    short_name: str | None = Field(None, description="Company short name")
    reg_address: str | None = Field(None, description="Registered address")
    gst_no: str | None = Field(None, description="GST number")
    pan_no: str | None = Field(None, description="PAN number")
    tan_no: str | None = Field(None, description="TAN number")
    cin_no: str | None = Field(None, description="CIN number")
    contact: str | None = Field(None, description="Contact number(s)")
    email: str | None = Field(None, description="Contact email")
    sf_item_id: int | None = Field(None, description="Special fare item ID")
    created_at: datetime | None = Field(None, description="Record creation timestamp")
    updated_at: datetime | None = Field(None, description="Record last update timestamp")

    model_config = {"from_attributes": True}
