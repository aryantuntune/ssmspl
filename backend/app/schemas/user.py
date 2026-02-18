import uuid
from datetime import datetime

from pydantic import BaseModel, EmailStr, Field

from app.core.rbac import UserRole


class UserBase(BaseModel):
    email: EmailStr = Field(..., description="User's email address", examples=["admin@ssmspl.com"])
    username: str = Field(..., description="Unique login username", examples=["admin"])
    full_name: str = Field(..., description="User's full display name", examples=["System Administrator"])
    role: UserRole = Field(
        default=UserRole.TICKET_CHECKER,
        description="RBAC role — determines menu access and permissions",
    )


class UserCreate(UserBase):
    password: str = Field(
        ...,
        min_length=8,
        description="Password (min 8 characters)",
        examples=["Password@123"],
    )

    model_config = {
        "json_schema_extra": {
            "examples": [
                {
                    "email": "newuser@ssmspl.com",
                    "username": "newuser",
                    "full_name": "New User",
                    "password": "Password@123",
                    "role": "ticket_checker",
                }
            ]
        }
    }


class UserUpdate(BaseModel):
    full_name: str | None = Field(None, description="Updated display name")
    email: EmailStr | None = Field(None, description="Updated email address")
    role: UserRole | None = Field(None, description="Updated RBAC role")
    is_active: bool | None = Field(None, description="Set false to deactivate the user")

    model_config = {
        "json_schema_extra": {
            "examples": [
                {"full_name": "Updated Name", "role": "manager"}
            ]
        }
    }


class UserRead(UserBase):
    id: uuid.UUID = Field(..., description="Unique user identifier (UUID v4)")
    is_active: bool = Field(..., description="Whether the user account is active")
    is_verified: bool = Field(..., description="Whether the user's email is verified")
    last_login: datetime | None = Field(None, description="Timestamp of last successful login")
    created_at: datetime = Field(..., description="Account creation timestamp")
    updated_at: datetime = Field(..., description="Last profile update timestamp")

    model_config = {"from_attributes": True}


class UserMeResponse(UserRead):
    menu_items: list[str] = Field(
        default=[],
        description="Role-based navigation menu items for the frontend sidebar",
        examples=[["Dashboard", "User Management", "Ferry Management"]],
    )
