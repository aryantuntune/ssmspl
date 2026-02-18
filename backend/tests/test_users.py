import pytest
from httpx import AsyncClient

pytestmark = pytest.mark.asyncio


async def _get_token(client: AsyncClient, username: str, password: str) -> str:
    resp = await client.post("/api/auth/login", json={"username": username, "password": password})
    return resp.json()["access_token"]


async def test_list_users_requires_admin(client: AsyncClient, super_admin_user):
    token = await _get_token(client, "test_superadmin", "TestPass@123")
    response = await client.get("/api/users/", headers={"Authorization": f"Bearer {token}"})
    assert response.status_code == 200
    assert isinstance(response.json(), list)


async def test_create_user(client: AsyncClient, super_admin_user):
    token = await _get_token(client, "test_superadmin", "TestPass@123")
    response = await client.post(
        "/api/users/",
        json={
            "email": "newuser@test.com",
            "username": "newuser",
            "full_name": "New User",
            "password": "NewPass@123",
            "role": "ticket_checker",
        },
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 201
    data = response.json()
    assert data["username"] == "newuser"
    assert data["role"] == "ticket_checker"
