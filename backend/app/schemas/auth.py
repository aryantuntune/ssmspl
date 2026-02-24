import re

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


class LoginRequest(BaseModel):
    email: EmailStr = Field(..., description="The user's login email", examples=["admin@ssmspl.com"])
    password: str = Field(..., description="The user's password", examples=["Password@123"])

    model_config = {
        "json_schema_extra": {
            "examples": [
                {"email": "admin@ssmspl.com", "password": "Password@123"}
            ]
        }
    }


class RefreshRequest(BaseModel):
    refresh_token: str = Field(..., description="A valid refresh token from a previous login or refresh")

    model_config = {
        "json_schema_extra": {
            "examples": [
                {"refresh_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."}
            ]
        }
    }


class TokenPayload(BaseModel):
    sub: str = Field(..., description="Subject — the user's UUID")
    type: str = Field(..., description="Token type: 'access' or 'refresh'")


class ForgotPasswordRequest(BaseModel):
    email: EmailStr = Field(..., description="Email address associated with the account")


class ResetPasswordRequest(BaseModel):
    token: str = Field(..., description="Password reset token from the email link")
    new_password: str = Field(..., min_length=8, description="New password (min 8 chars, must include uppercase, lowercase, digit, special char)")

    @field_validator("new_password")
    @classmethod
    def validate_password(cls, v: str) -> str:
        return _validate_password_complexity(v)
