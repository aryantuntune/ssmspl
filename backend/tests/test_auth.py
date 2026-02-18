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
    assert "access_token" in data
    assert "refresh_token" in data
    assert data["token_type"] == "bearer"


async def test_login_wrong_password(client: AsyncClient, super_admin_user):
    response = await client.post("/api/auth/login", json={
        "username": "test_superadmin",
        "password": "WrongPassword",
    })
    assert response.status_code == 401


async def test_me_requires_auth(client: AsyncClient):
    response = await client.get("/api/auth/me")
    assert response.status_code == 403  # HTTPBearer returns 403 without credentials


async def test_me_with_token(client: AsyncClient, super_admin_user):
    login_resp = await client.post("/api/auth/login", json={
        "username": "test_superadmin", "password": "TestPass@123"
    })
    token = login_resp.json()["access_token"]
    response = await client.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert response.status_code == 200
    data = response.json()
    assert data["username"] == "test_superadmin"
    assert "menu_items" in data
    assert len(data["menu_items"]) > 0
