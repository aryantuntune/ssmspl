from pydantic import BaseModel, EmailStr, Field


class LoginRequest(BaseModel):
    email: EmailStr = Field(..., description="The user's login email", examples=["superadmin@ssmspl.com"])
    password: str = Field(..., description="The user's password", examples=["Password@123"])

    model_config = {
        "json_schema_extra": {
            "examples": [
                {"email": "superadmin@ssmspl.com", "password": "Password@123"}
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
    new_password: str = Field(..., min_length=8, description="New password (min 8 characters)")
