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
