import pytest
import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.security import get_password_hash, create_password_reset_token, decode_token
from app.models.user import User
from app.models.portal_user import PortalUser
from app.core.rbac import UserRole

pytestmark = pytest.mark.asyncio


# ── Fixtures ──


@pytest_asyncio.fixture
async def admin_user_for_reset(db_session: AsyncSession) -> User:
    user = User(
        email="resetadmin@test.com",
        username="test_resetadmin",
        full_name="Reset Admin",
        hashed_password=get_password_hash("OldPass@123"),
        role=UserRole.ADMIN,
        is_active=True,
        is_verified=True,
    )
    db_session.add(user)
    await db_session.commit()
    await db_session.refresh(user)
    return user


@pytest_asyncio.fixture
async def portal_user_for_reset(db_session: AsyncSession) -> PortalUser:
    user = PortalUser(
        first_name="Reset",
        last_name="Customer",
        email="resetcustomer@test.com",
        password=get_password_hash("OldPass@123"),
        mobile="9876543211",
    )
    db_session.add(user)
    await db_session.commit()
    await db_session.refresh(user)
    return user


# ── Admin Forgot Password Tests ──


async def test_admin_forgot_password_returns_success_for_valid_email(
    client: AsyncClient, admin_user_for_reset,
):
    """Forgot password should return 200 for a valid admin email."""
    response = await client.post("/api/auth/forgot-password", json={
        "email": "resetadmin@test.com",
    })
    assert response.status_code == 200
    assert "reset link" in response.json()["message"].lower()


async def test_admin_forgot_password_returns_success_for_unknown_email(
    client: AsyncClient,
):
    """Forgot password should return 200 even for unknown emails (prevents enumeration)."""
    response = await client.post("/api/auth/forgot-password", json={
        "email": "nonexistent@test.com",
    })
    assert response.status_code == 200
    assert "reset link" in response.json()["message"].lower()


async def test_admin_reset_password_with_valid_token(
    client: AsyncClient, admin_user_for_reset,
):
    """Reset password with a valid token should succeed."""
    token = create_password_reset_token(
        subject=str(admin_user_for_reset.id), user_type="admin"
    )
    response = await client.post("/api/auth/reset-password", json={
        "token": token,
        "new_password": "NewPass@123",
    })
    assert response.status_code == 200
    assert "reset successfully" in response.json()["message"].lower()

    # Verify login works with new password
    login_resp = await client.post("/api/auth/login", json={
        "username": "test_resetadmin",
        "password": "NewPass@123",
    })
    assert login_resp.status_code == 200


async def test_admin_reset_password_old_password_no_longer_works(
    client: AsyncClient, admin_user_for_reset,
):
    """After reset, old password should no longer work."""
    token = create_password_reset_token(
        subject=str(admin_user_for_reset.id), user_type="admin"
    )
    await client.post("/api/auth/reset-password", json={
        "token": token,
        "new_password": "BrandNew@123",
    })
    login_resp = await client.post("/api/auth/login", json={
        "username": "test_resetadmin",
        "password": "OldPass@123",
    })
    assert login_resp.status_code == 401


async def test_admin_reset_password_invalid_token(client: AsyncClient):
    """Reset password with an invalid token should fail."""
    response = await client.post("/api/auth/reset-password", json={
        "token": "invalid.token.here",
        "new_password": "NewPass@123",
    })
    assert response.status_code == 400


async def test_admin_reset_password_rejects_portal_token(
    client: AsyncClient, portal_user_for_reset,
):
    """Admin reset endpoint should reject a token with user_type=portal."""
    token = create_password_reset_token(
        subject=str(portal_user_for_reset.id), user_type="portal"
    )
    response = await client.post("/api/auth/reset-password", json={
        "token": token,
        "new_password": "NewPass@123",
    })
    assert response.status_code == 400


async def test_admin_reset_password_short_password_rejected(
    client: AsyncClient, admin_user_for_reset,
):
    """Password shorter than 8 chars should be rejected by schema validation."""
    token = create_password_reset_token(
        subject=str(admin_user_for_reset.id), user_type="admin"
    )
    response = await client.post("/api/auth/reset-password", json={
        "token": token,
        "new_password": "short",
    })
    assert response.status_code == 422  # Validation error


# ── Portal Forgot Password Tests ──


async def test_portal_forgot_password_returns_success_for_valid_email(
    client: AsyncClient, portal_user_for_reset,
):
    """Portal forgot password should return 200 for a valid customer email."""
    response = await client.post("/api/portal/auth/forgot-password", json={
        "email": "resetcustomer@test.com",
    })
    assert response.status_code == 200
    assert "reset link" in response.json()["message"].lower()


async def test_portal_forgot_password_returns_success_for_unknown_email(
    client: AsyncClient,
):
    """Portal forgot password should return 200 for unknown emails (prevents enumeration)."""
    response = await client.post("/api/portal/auth/forgot-password", json={
        "email": "ghost@test.com",
    })
    assert response.status_code == 200


async def test_portal_reset_password_with_valid_token(
    client: AsyncClient, portal_user_for_reset,
):
    """Portal reset password with a valid token should succeed."""
    token = create_password_reset_token(
        subject=str(portal_user_for_reset.id), user_type="portal"
    )
    response = await client.post("/api/portal/auth/reset-password", json={
        "token": token,
        "new_password": "NewPass@123",
    })
    assert response.status_code == 200

    # Verify login works with new password
    login_resp = await client.post("/api/portal/auth/login", json={
        "email": "resetcustomer@test.com",
        "password": "NewPass@123",
    })
    assert login_resp.status_code == 200


async def test_portal_reset_password_rejects_admin_token(
    client: AsyncClient, admin_user_for_reset,
):
    """Portal reset endpoint should reject a token with user_type=admin."""
    token = create_password_reset_token(
        subject=str(admin_user_for_reset.id), user_type="admin"
    )
    response = await client.post("/api/portal/auth/reset-password", json={
        "token": token,
        "new_password": "NewPass@123",
    })
    assert response.status_code == 400


async def test_portal_reset_password_invalid_token(client: AsyncClient):
    """Portal reset with invalid token should fail."""
    response = await client.post("/api/portal/auth/reset-password", json={
        "token": "garbage.token.value",
        "new_password": "NewPass@123",
    })
    assert response.status_code == 400


# ── Token Verification Tests ──


def test_password_reset_token_has_correct_claims():
    """Password reset token should have correct type and user_type claims."""
    token = create_password_reset_token(subject="123", user_type="admin")
    payload = decode_token(token)
    assert payload["type"] == "password_reset"
    assert payload["user_type"] == "admin"
    assert payload["sub"] == "123"


def test_password_reset_token_portal_type():
    """Portal reset token should have user_type=portal."""
    token = create_password_reset_token(subject="456", user_type="portal")
    payload = decode_token(token)
    assert payload["type"] == "password_reset"
    assert payload["user_type"] == "portal"
