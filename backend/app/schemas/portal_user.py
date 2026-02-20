from datetime import datetime

from pydantic import BaseModel, EmailStr, Field


class PortalUserRegister(BaseModel):
    first_name: str = Field(..., max_length=60, description="Customer's first name", examples=["Rajesh"])
    last_name: str = Field(..., max_length=60, description="Customer's last name", examples=["Naik"])
    email: EmailStr = Field(..., description="Customer's email address", examples=["rajesh@example.com"])
    password: str = Field(..., min_length=8, description="Password (min 8 characters)", examples=["Password@123"])
    mobile: str = Field(..., max_length=60, description="Customer's mobile number", examples=["+919876543210"])


class PortalUserLogin(BaseModel):
    email: EmailStr = Field(..., description="Registered email address", examples=["rajesh@example.com"])
    password: str = Field(..., description="Account password", examples=["Password@123"])


class PortalUserRead(BaseModel):
    id: int = Field(..., description="Portal user ID")
    first_name: str = Field(..., description="First name")
    last_name: str = Field(..., description="Last name")
    email: str = Field(..., description="Email address")
    mobile: str = Field(..., description="Mobile number")
    created_at: datetime = Field(..., description="Account creation timestamp")

    model_config = {"from_attributes": True}


class PortalUserMeResponse(PortalUserRead):
    full_name: str = Field(..., description="Concatenated full name")
