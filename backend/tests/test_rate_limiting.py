import pytest
from httpx import AsyncClient

pytestmark = pytest.mark.asyncio


async def test_login_rate_limit(client: AsyncClient, super_admin_user):
    """Login endpoint should return 429 after exceeding rate limit."""
    for i in range(11):
        response = await client.post(
            "/api/auth/login",
            json={"username": "test_superadmin", "password": "WrongPass"},
        )
        if response.status_code == 429:
            assert "retry-after" in response.headers
            return

    pytest.fail("Rate limit was not triggered after 11 requests")
