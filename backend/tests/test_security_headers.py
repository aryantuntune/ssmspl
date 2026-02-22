import pytest
from httpx import AsyncClient

pytestmark = pytest.mark.asyncio


async def test_security_headers_present(client: AsyncClient):
    """All security headers should be present on every response."""
    response = await client.get("/health")
    assert response.status_code == 200
    assert response.headers["x-content-type-options"] == "nosniff"
    assert response.headers["x-frame-options"] == "DENY"
    assert response.headers["referrer-policy"] == "strict-origin-when-cross-origin"
    assert "camera=()" in response.headers["permissions-policy"]
    assert "x-request-id" in response.headers


async def test_request_id_is_uuid(client: AsyncClient):
    """X-Request-ID should be a valid UUID."""
    import uuid
    response = await client.get("/health")
    request_id = response.headers["x-request-id"]
    uuid.UUID(request_id)  # raises ValueError if not valid UUID


async def test_server_header_stripped(client: AsyncClient):
    """Server header should not reveal technology details."""
    response = await client.get("/health")
    server = response.headers.get("server", "")
    assert "uvicorn" not in server.lower()


async def test_cors_headers_on_preflight(client: AsyncClient):
    """CORS preflight should return specific methods, not wildcards."""
    response = await client.options(
        "/health",
        headers={
            "Origin": "http://localhost:3000",
            "Access-Control-Request-Method": "POST",
        },
    )
    allowed_methods = response.headers.get("access-control-allow-methods", "")
    assert "*" not in allowed_methods
    assert "GET" in allowed_methods
    assert "POST" in allowed_methods
