import pytest
import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.security import get_password_hash
from app.models.portal_user import PortalUser

pytestmark = pytest.mark.asyncio


@pytest_asyncio.fixture
async def portal_user(db_session: AsyncSession) -> PortalUser:
    user = PortalUser(
        first_name="Test",
        last_name="Customer",
        email="testcustomer@test.com",
        password=get_password_hash("TestPass@123"),
        mobile="9876543210",
    )
    db_session.add(user)
    await db_session.commit()
    await db_session.refresh(user)
    return user


async def test_portal_login_sets_httponly_cookies(client: AsyncClient, portal_user):
    """Portal login should set HttpOnly cookies with portal prefix."""
    response = await client.post("/api/portal/auth/login", json={
        "email": "testcustomer@test.com",
        "password": "TestPass@123",
    })
    assert response.status_code == 200

    cookies = response.headers.get_list("set-cookie")
    cookie_names = [c.split("=")[0] for c in cookies]
    assert "ssmspl_portal_access_token" in cookie_names
    assert "ssmspl_portal_refresh_token" in cookie_names

    for cookie in cookies:
        assert "httponly" in cookie.lower()


async def test_portal_logout_clears_cookies(client: AsyncClient, portal_user):
    """Portal logout should clear portal cookies."""
    await client.post("/api/portal/auth/login", json={
        "email": "testcustomer@test.com",
        "password": "TestPass@123",
    })

    response = await client.post("/api/portal/auth/logout")
    assert response.status_code == 200

    cookies = response.headers.get_list("set-cookie")
    for cookie in cookies:
        if "portal" in cookie:
            assert "max-age=0" in cookie.lower()
