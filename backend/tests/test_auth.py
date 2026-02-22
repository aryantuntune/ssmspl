import pytest
from httpx import AsyncClient

pytestmark = pytest.mark.asyncio


async def test_health(client: AsyncClient):
    response = await client.get("/health")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"


async def test_login_success(client: AsyncClient, super_admin_user):
    response = await client.post("/api/auth/login", json={
        "username": "test_superadmin",
        "password": "TestPass@123",
    })
    assert response.status_code == 200
    data = response.json()
    assert data["message"] == "Login successful"
    assert data["token_type"] == "bearer"
    # Tokens are now in cookies, not body
    cookies = response.headers.get_list("set-cookie")
    cookie_names = [c.split("=")[0] for c in cookies]
    assert "ssmspl_access_token" in cookie_names
    assert "ssmspl_refresh_token" in cookie_names


async def test_login_wrong_password(client: AsyncClient, super_admin_user):
    response = await client.post("/api/auth/login", json={
        "username": "test_superadmin",
        "password": "WrongPassword",
    })
    assert response.status_code == 401


async def test_me_requires_auth(client: AsyncClient):
    response = await client.get("/api/auth/me")
    assert response.status_code == 401  # Changed from 403 to 401 (auto_error=False)


async def test_me_with_token(client: AsyncClient, super_admin_user):
    login_resp = await client.post("/api/auth/login", json={
        "username": "test_superadmin", "password": "TestPass@123"
    })
    # Extract token from cookie
    token = None
    for header in login_resp.headers.get_list("set-cookie"):
        if header.startswith("ssmspl_access_token="):
            token = header.split(";")[0].split("=", 1)[1]
            break
    response = await client.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert response.status_code == 200
    data = response.json()
    assert data["username"] == "test_superadmin"
    assert "menu_items" in data
    assert len(data["menu_items"]) > 0
