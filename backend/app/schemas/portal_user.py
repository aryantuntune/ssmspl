import re
from datetime import datetime

from pydantic import BaseModel, EmailStr, Field, field_validator


def _validate_password_complexity(v: str) -> str:
    if not re.search(r"[A-Z]", v):
        raise ValueError("Password must contain at least one uppercase letter")
    if not re.search(r"[a-z]", v):
        raise ValueError("Password must contain at least one lowercase letter")
    if not re.search(r"\d", v):
        raise ValueError("Password must contain at least one digit")
    if not re.search(r"[^A-Za-z0-9]", v):
        raise ValueError("Password must contain at least one special character")
    return v


class PortalUserRegister(BaseModel):
    first_name: str = Field(..., max_length=60, description="Customer's first name", examples=["Rajesh"])
    last_name: str = Field(..., max_length=60, description="Customer's last name", examples=["Naik"])
    email: EmailStr = Field(..., description="Customer's email address", examples=["rajesh@example.com"])
    password: str = Field(..., min_length=8, description="Password (min 8 chars, must include uppercase, lowercase, digit, special char)", examples=["Password@123"])
    mobile: str = Field(..., max_length=60, description="Customer's mobile number", examples=["+919876543210"])

    @field_validator("password")
    @classmethod
    def validate_password(cls, v: str) -> str:
        return _validate_password_complexity(v)


class PortalUserLogin(BaseModel):
    email: EmailStr = Field(..., description="Registered email address", examples=["rajesh@example.com"])
    password: str = Field(..., description="Account password", examples=["Password@123"])


class PortalUserRead(BaseModel):
    id: int = Field(..., description="Portal user ID")
    first_name: str = Field(..., description="First name")
    last_name: str = Field(..., description="Last name")
    email: str = Field(..., description="Email address")
    mobile: str = Field(..., description="Mobile number")
    is_verified: bool = Field(..., description="Whether email is verified")
    created_at: datetime = Field(..., description="Account creation timestamp")

    model_config = {"from_attributes": True}


class PortalUserMeResponse(PortalUserRead):
    full_name: str = Field(..., description="Concatenated full name")


class VerifyOtpRequest(BaseModel):
    email: EmailStr = Field(..., description="Email address to verify")
    otp: str = Field(..., description="6-digit OTP code")

    @field_validator("otp")
    @classmethod
    def validate_otp(cls, v: str) -> str:
        import re
        if not re.match(r"^\d{6}$", v):
            raise ValueError("OTP must be exactly 6 digits")
        return v


class ResendOtpRequest(BaseModel):
    email: EmailStr = Field(..., description="Email address to resend OTP to")


class ResetPasswordOtpRequest(BaseModel):
    email: EmailStr = Field(..., description="Email address")
    otp: str = Field(..., description="6-digit OTP code")
    new_password: str = Field(..., min_length=8, description="New password (min 8 chars, must include uppercase, lowercase, digit, special char)")

    @field_validator("new_password")
    @classmethod
    def validate_password(cls, v: str) -> str:
        return _validate_password_complexity(v)

    @field_validator("otp")
    @classmethod
    def validate_otp(cls, v: str) -> str:
        import re
        if not re.match(r"^\d{6}$", v):
            raise ValueError("OTP must be exactly 6 digits")
        return v
