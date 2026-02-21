from datetime import datetime

from pydantic import BaseModel, Field


class RefreshTokenRead(BaseModel):
    id: str = Field(..., description="Unique token identifier (UUID)")
    user_id: str = Field(..., description="User ID (UUID)")
    token_hash: str = Field(..., description="Hashed token value")
    expires_at: datetime = Field(..., description="Token expiration timestamp")
    revoked: bool = Field(..., description="Whether the token has been revoked")
    created_at: datetime | None = Field(None, description="Record creation timestamp")
    updated_at: datetime | None = Field(None, description="Record last update timestamp")

    model_config = {"from_attributes": True}
