import pytest
from httpx import AsyncClient

pytestmark = pytest.mark.asyncio


async def _get_token(client: AsyncClient, username: str, password: str) -> str:
    resp = await client.post("/api/auth/login", json={"username": username, "password": password})
    return resp.json()["access_token"]


async def _auth_header(client: AsyncClient, username: str = "test_superadmin", password: str = "TestPass@123") -> dict:
    token = await _get_token(client, username, password)
    return {"Authorization": f"Bearer {token}"}


# ---------- CREATE ----------

async def test_create_boat(client: AsyncClient, super_admin_user):
    headers = await _auth_header(client)
    response = await client.post(
        "/api/boats/",
        json={"name": "TEST FERRY", "no": "TST-001"},
        headers=headers,
    )
    assert response.status_code == 201
    data = response.json()
    assert data["name"] == "TEST FERRY"
    assert data["no"] == "TST-001"
    assert data["is_active"] is True
    assert "id" in data


async def test_create_boat_duplicate_name(client: AsyncClient, super_admin_user):
    headers = await _auth_header(client)
    await client.post(
        "/api/boats/",
        json={"name": "DUPLICATE", "no": "DUP-001"},
        headers=headers,
    )
    response = await client.post(
        "/api/boats/",
        json={"name": "DUPLICATE", "no": "DUP-002"},
        headers=headers,
    )
    assert response.status_code == 409


# ---------- READ ----------

async def test_list_boats(client: AsyncClient, super_admin_user):
    headers = await _auth_header(client)
    response = await client.get("/api/boats/", headers=headers)
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, list)


async def test_get_boat_by_id(client: AsyncClient, super_admin_user):
    headers = await _auth_header(client)
    create_resp = await client.post(
        "/api/boats/",
        json={"name": "GET BY ID", "no": "GBI-001"},
        headers=headers,
    )
    boat_id = create_resp.json()["id"]
    response = await client.get(f"/api/boats/{boat_id}", headers=headers)
    assert response.status_code == 200
    assert response.json()["name"] == "GET BY ID"


async def test_get_boat_not_found(client: AsyncClient, super_admin_user):
    headers = await _auth_header(client)
    response = await client.get("/api/boats/99999", headers=headers)
    assert response.status_code == 404


# ---------- UPDATE ----------

async def test_update_boat(client: AsyncClient, super_admin_user):
    headers = await _auth_header(client)
    create_resp = await client.post(
        "/api/boats/",
        json={"name": "TO UPDATE", "no": "UPD-001"},
        headers=headers,
    )
    boat_id = create_resp.json()["id"]

    response = await client.patch(
        f"/api/boats/{boat_id}",
        json={"name": "UPDATED"},
        headers=headers,
    )
    assert response.status_code == 200
    assert response.json()["name"] == "UPDATED"
    assert response.json()["no"] == "UPD-001"  # unchanged


# ---------- SOFT DELETE VIA UPDATE ----------

async def test_soft_delete_via_update(client: AsyncClient, super_admin_user):
    headers = await _auth_header(client)
    create_resp = await client.post(
        "/api/boats/",
        json={"name": "TO DEACTIVATE", "no": "DEACT-001"},
        headers=headers,
    )
    boat_id = create_resp.json()["id"]

    # Soft delete by setting is_active=false via PATCH
    response = await client.patch(
        f"/api/boats/{boat_id}",
        json={"is_active": False},
        headers=headers,
    )
    assert response.status_code == 200
    assert response.json()["is_active"] is False

    # Boat should still be accessible by ID (for reactivation)
    get_resp = await client.get(f"/api/boats/{boat_id}", headers=headers)
    assert get_resp.status_code == 200
    assert get_resp.json()["is_active"] is False


async def test_reactivate_boat(client: AsyncClient, super_admin_user):
    headers = await _auth_header(client)
    create_resp = await client.post(
        "/api/boats/",
        json={"name": "TO REACTIVATE", "no": "REACT-001"},
        headers=headers,
    )
    boat_id = create_resp.json()["id"]

    # Deactivate
    await client.patch(
        f"/api/boats/{boat_id}",
        json={"is_active": False},
        headers=headers,
    )

    # Reactivate
    response = await client.patch(
        f"/api/boats/{boat_id}",
        json={"is_active": True},
        headers=headers,
    )
    assert response.status_code == 200
    assert response.json()["is_active"] is True


# ---------- AUTH ----------

async def test_boats_requires_auth(client: AsyncClient):
    response = await client.get("/api/boats/")
    assert response.status_code == 403
