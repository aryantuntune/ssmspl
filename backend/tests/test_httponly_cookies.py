import pytest
from httpx import AsyncClient

pytestmark = pytest.mark.asyncio


async def test_login_sets_httponly_cookies(client: AsyncClient, super_admin_user):
    """Login should set HttpOnly access and refresh token cookies."""
    response = await client.post("/api/auth/login", json={
        "username": "test_superadmin",
        "password": "TestPass@123",
    })
    assert response.status_code == 200

    cookies = response.headers.get_list("set-cookie")
    cookie_names = [c.split("=")[0] for c in cookies]
    assert "ssmspl_access_token" in cookie_names
    assert "ssmspl_refresh_token" in cookie_names

    for cookie in cookies:
        assert "httponly" in cookie.lower()
        assert "samesite=strict" in cookie.lower()


async def test_auth_via_cookie(client: AsyncClient, super_admin_user):
    """Authenticated endpoint should accept token from cookie."""
    login_resp = await client.post("/api/auth/login", json={
        "username": "test_superadmin",
        "password": "TestPass@123",
    })
    cookies = {}
    for header in login_resp.headers.get_list("set-cookie"):
        name, value = header.split(";")[0].split("=", 1)
        cookies[name] = value

    response = await client.get(
        "/api/auth/me",
        cookies={"ssmspl_access_token": cookies["ssmspl_access_token"]},
    )
    assert response.status_code == 200
    assert response.json()["username"] == "test_superadmin"


async def test_auth_via_bearer_still_works(client: AsyncClient, super_admin_user):
    """Bearer header should still work as fallback (mobile app compatibility)."""
    login_resp = await client.post("/api/auth/login", json={
        "username": "test_superadmin",
        "password": "TestPass@123",
    })
    token = None
    for header in login_resp.headers.get_list("set-cookie"):
        if header.startswith("ssmspl_access_token="):
            token = header.split(";")[0].split("=", 1)[1]
            break

    response = await client.get(
        "/api/auth/me",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 200


async def test_logout_clears_cookies(client: AsyncClient, super_admin_user):
    """Logout should set cookies with Max-Age=0 to clear them."""
    login_resp = await client.post("/api/auth/login", json={
        "username": "test_superadmin",
        "password": "TestPass@123",
    })

    refresh_token = None
    for header in login_resp.headers.get_list("set-cookie"):
        if header.startswith("ssmspl_refresh_token="):
            refresh_token = header.split(";")[0].split("=", 1)[1]
            break

    response = await client.post(
        "/api/auth/logout",
        json={"refresh_token": refresh_token} if refresh_token else None,
    )
    assert response.status_code == 200

    cookies = response.headers.get_list("set-cookie")
    for cookie in cookies:
        assert "max-age=0" in cookie.lower()
