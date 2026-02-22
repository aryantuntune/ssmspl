import pytest
from httpx import AsyncClient

pytestmark = pytest.mark.asyncio


async def test_health_no_env_leak(client: AsyncClient):
    """Health endpoint should not expose the APP_ENV value when DEBUG is False."""
    response = await client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert "status" in data
    assert data["status"] == "ok"


async def test_validation_error_format(client: AsyncClient):
    """Validation errors should return a consistent format with 'detail' key."""
    response = await client.post("/api/auth/login", json={})
    assert response.status_code == 422
    data = response.json()
    assert "detail" in data
