from pydantic import BaseModel, Field


class LoginRequest(BaseModel):
    username: str = Field(..., description="The user's login username", examples=["superadmin"])
    password: str = Field(..., description="The user's password", examples=["Password@123"])

    model_config = {
        "json_schema_extra": {
            "examples": [
                {"username": "superadmin", "password": "Password@123"}
            ]
        }
    }


class TokenResponse(BaseModel):
    access_token: str = Field(..., description="JWT access token for API authorization")
    refresh_token: str = Field(..., description="JWT refresh token — use to obtain a new access token")
    token_type: str = Field(default="bearer", description="Token type (always 'bearer')")


class LoginResponse(BaseModel):
    """Response body for cookie-based login (tokens are in Set-Cookie headers, not body)."""
    message: str = Field(default="Login successful", description="Status message")
    token_type: str = Field(default="bearer", description="Token type")


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
