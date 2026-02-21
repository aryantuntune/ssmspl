import datetime

import pytest
import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

pytestmark = pytest.mark.asyncio


# ── Fixtures ────────────────────────────────────────────────────────────────


@pytest_asyncio.fixture
async def portal_user(db_session: AsyncSession):
    from app.models.portal_user import PortalUser
    from app.core.security import get_password_hash

    user = PortalUser(
        first_name="Test",
        last_name="Customer",
        email="customer@test.com",
        password=get_password_hash("TestPass@123"),
        mobile="9876543210",
    )
    db_session.add(user)
    await db_session.commit()
    await db_session.refresh(user)
    return user


@pytest_asyncio.fixture
async def portal_token(client: AsyncClient, portal_user):
    response = await client.post(
        "/api/portal/auth/login",
        json={
            "email": "customer@test.com",
            "password": "TestPass@123",
        },
    )
    return response.json()["access_token"]


@pytest_asyncio.fixture
async def auth_headers(portal_token: str):
    return {"Authorization": f"Bearer {portal_token}"}


@pytest_asyncio.fixture
async def seed_data(db_session: AsyncSession):
    from app.models.branch import Branch
    from app.models.route import Route
    from app.models.item import Item
    from app.models.item_rate import ItemRate
    from app.models.ferry_schedule import FerrySchedule
    from app.models.payment_mode import PaymentMode

    # Create branches
    b1 = Branch(
        id=101,
        name="TestBranch1",
        address="Addr1",
        last_ticket_no=0,
        last_booking_no=0,
        is_active=True,
    )
    b2 = Branch(
        id=102,
        name="TestBranch2",
        address="Addr2",
        last_ticket_no=0,
        last_booking_no=0,
        is_active=True,
    )
    db_session.add_all([b1, b2])
    await db_session.flush()

    # Create route connecting them
    route = Route(id=101, branch_id_one=101, branch_id_two=102, is_active=True)
    db_session.add(route)
    await db_session.flush()

    # Create items
    item1 = Item(
        id=101,
        name="TestPassenger",
        short_name="TP",
        online_visibility=True,
        is_vehicle=False,
        is_active=True,
    )
    item2 = Item(
        id=102,
        name="TestVehicle",
        short_name="TV",
        online_visibility=True,
        is_vehicle=True,
        is_active=True,
    )
    item3 = Item(
        id=103,
        name="OfflineItem",
        short_name="OI",
        online_visibility=False,
        is_vehicle=False,
        is_active=True,
    )
    db_session.add_all([item1, item2, item3])
    await db_session.flush()

    # Create item rates
    rate1 = ItemRate(
        id=101,
        item_id=101,
        route_id=101,
        rate=50.00,
        levy=10.00,
        applicable_from_date=datetime.date(2020, 1, 1),
        is_active=True,
    )
    rate2 = ItemRate(
        id=102,
        item_id=102,
        route_id=101,
        rate=200.00,
        levy=20.00,
        applicable_from_date=datetime.date(2020, 1, 1),
        is_active=True,
    )
    db_session.add_all([rate1, rate2])
    await db_session.flush()

    # Create ferry schedule
    sched = FerrySchedule(
        id=101, branch_id=101, departure=datetime.time(9, 30), capacity=0
    )
    db_session.add(sched)
    await db_session.flush()

    # Create payment mode
    pm = PaymentMode(id=101, description="Online", is_active=True)
    db_session.add(pm)
    await db_session.commit()

    return {
        "branch1": b1,
        "branch2": b2,
        "route": route,
        "item1": item1,
        "item2": item2,
    }


# ── Booking Data Endpoints ──────────────────────────────────────────────────


class TestBookingDataEndpoints:
    """Tests for /api/booking/ data lookup endpoints."""

    async def test_get_to_branches(
        self, client: AsyncClient, auth_headers: dict, seed_data
    ):
        res = await client.get("/api/booking/to-branches/101", headers=auth_headers)
        assert res.status_code == 200
        data = res.json()
        assert len(data) >= 1
        assert any(b["id"] == 102 for b in data)

    async def test_get_online_items(
        self, client: AsyncClient, auth_headers: dict, seed_data
    ):
        res = await client.get("/api/booking/items/101/102", headers=auth_headers)
        assert res.status_code == 200
        data = res.json()
        # Should include online-visible items with rates
        names = [i["name"] for i in data]
        assert "TestPassenger" in names
        assert "TestVehicle" in names
        assert "OfflineItem" not in names  # online_visibility=False

    async def test_get_schedules(
        self, client: AsyncClient, auth_headers: dict, seed_data
    ):
        res = await client.get("/api/booking/schedules/101", headers=auth_headers)
        assert res.status_code == 200
        data = res.json()
        assert len(data) >= 1
        assert data[0]["schedule_time"] == "09:30"

    async def test_get_item_rate(
        self, client: AsyncClient, auth_headers: dict, seed_data
    ):
        res = await client.get("/api/booking/item-rate/101/101", headers=auth_headers)
        assert res.status_code == 200
        data = res.json()
        assert data["rate"] == 50.0
        assert data["levy"] == 10.0

    async def test_endpoints_require_auth(self, client: AsyncClient, seed_data):
        """All booking data endpoints should require portal auth."""
        res = await client.get("/api/booking/to-branches/101")
        assert res.status_code == 403  # HTTPBearer returns 403 when no credentials


# ── Portal Bookings CRUD ────────────────────────────────────────────────────


class TestPortalBookings:
    """Tests for /api/portal/bookings/ CRUD endpoints."""

    async def test_create_booking_success(
        self, client: AsyncClient, auth_headers: dict, seed_data
    ):
        tomorrow = (datetime.date.today() + datetime.timedelta(days=1)).isoformat()
        res = await client.post(
            "/api/portal/bookings",
            headers=auth_headers,
            json={
                "from_branch_id": 101,
                "to_branch_id": 102,
                "travel_date": tomorrow,
                "departure": "09:30",
                "items": [{"item_id": 101, "quantity": 2}],
            },
        )
        assert res.status_code == 201
        data = res.json()
        assert data["status"] == "CONFIRMED"
        assert data["booking_no"] == 1
        assert data["net_amount"] == 120.0  # 2 * (50 + 10)
        assert data["discount"] == 0
        assert data["verification_code"] is not None
        assert len(data["items"]) == 1
        assert data["items"][0]["item_name"] == "TestPassenger"

    async def test_create_booking_invalid_branch(
        self, client: AsyncClient, auth_headers: dict, seed_data
    ):
        tomorrow = (datetime.date.today() + datetime.timedelta(days=1)).isoformat()
        res = await client.post(
            "/api/portal/bookings",
            headers=auth_headers,
            json={
                "from_branch_id": 999,
                "to_branch_id": 102,
                "travel_date": tomorrow,
                "departure": "09:30",
                "items": [{"item_id": 101, "quantity": 1}],
            },
        )
        assert res.status_code == 404

    async def test_create_booking_past_date(
        self, client: AsyncClient, auth_headers: dict, seed_data
    ):
        res = await client.post(
            "/api/portal/bookings",
            headers=auth_headers,
            json={
                "from_branch_id": 101,
                "to_branch_id": 102,
                "travel_date": "2020-01-01",
                "departure": "09:30",
                "items": [{"item_id": 101, "quantity": 1}],
            },
        )
        assert res.status_code == 400

    async def test_create_booking_invalid_departure(
        self, client: AsyncClient, auth_headers: dict, seed_data
    ):
        tomorrow = (datetime.date.today() + datetime.timedelta(days=1)).isoformat()
        res = await client.post(
            "/api/portal/bookings",
            headers=auth_headers,
            json={
                "from_branch_id": 101,
                "to_branch_id": 102,
                "travel_date": tomorrow,
                "departure": "23:59",
                "items": [{"item_id": 101, "quantity": 1}],
            },
        )
        assert res.status_code == 400

    async def test_create_booking_offline_item_rejected(
        self, client: AsyncClient, auth_headers: dict, seed_data
    ):
        tomorrow = (datetime.date.today() + datetime.timedelta(days=1)).isoformat()
        res = await client.post(
            "/api/portal/bookings",
            headers=auth_headers,
            json={
                "from_branch_id": 101,
                "to_branch_id": 102,
                "travel_date": tomorrow,
                "departure": "09:30",
                "items": [{"item_id": 103, "quantity": 1}],  # offline item
            },
        )
        assert res.status_code == 400

    async def test_list_bookings(
        self, client: AsyncClient, auth_headers: dict, seed_data
    ):
        # Create a booking first
        tomorrow = (datetime.date.today() + datetime.timedelta(days=1)).isoformat()
        await client.post(
            "/api/portal/bookings",
            headers=auth_headers,
            json={
                "from_branch_id": 101,
                "to_branch_id": 102,
                "travel_date": tomorrow,
                "departure": "09:30",
                "items": [{"item_id": 101, "quantity": 1}],
            },
        )
        # List
        res = await client.get(
            "/api/portal/bookings?page=1&page_size=10", headers=auth_headers
        )
        assert res.status_code == 200
        data = res.json()
        assert data["total"] >= 1
        assert data["page"] == 1
        assert len(data["data"]) >= 1

    async def test_get_booking_detail(
        self, client: AsyncClient, auth_headers: dict, seed_data
    ):
        tomorrow = (datetime.date.today() + datetime.timedelta(days=1)).isoformat()
        create_res = await client.post(
            "/api/portal/bookings",
            headers=auth_headers,
            json={
                "from_branch_id": 101,
                "to_branch_id": 102,
                "travel_date": tomorrow,
                "departure": "09:30",
                "items": [{"item_id": 101, "quantity": 3}],
            },
        )
        booking_id = create_res.json()["id"]

        res = await client.get(
            f"/api/portal/bookings/{booking_id}", headers=auth_headers
        )
        assert res.status_code == 200
        data = res.json()
        assert data["id"] == booking_id
        assert len(data["items"]) == 1
        assert data["items"][0]["quantity"] == 3

    async def test_cancel_booking(
        self, client: AsyncClient, auth_headers: dict, seed_data
    ):
        tomorrow = (datetime.date.today() + datetime.timedelta(days=1)).isoformat()
        create_res = await client.post(
            "/api/portal/bookings",
            headers=auth_headers,
            json={
                "from_branch_id": 101,
                "to_branch_id": 102,
                "travel_date": tomorrow,
                "departure": "09:30",
                "items": [{"item_id": 101, "quantity": 1}],
            },
        )
        booking_id = create_res.json()["id"]

        res = await client.post(
            f"/api/portal/bookings/{booking_id}/cancel", headers=auth_headers
        )
        assert res.status_code == 200
        data = res.json()
        assert data["status"] == "CANCELLED"
        assert data["is_cancelled"] is True

    async def test_cancel_already_cancelled(
        self, client: AsyncClient, auth_headers: dict, seed_data
    ):
        tomorrow = (datetime.date.today() + datetime.timedelta(days=1)).isoformat()
        create_res = await client.post(
            "/api/portal/bookings",
            headers=auth_headers,
            json={
                "from_branch_id": 101,
                "to_branch_id": 102,
                "travel_date": tomorrow,
                "departure": "09:30",
                "items": [{"item_id": 101, "quantity": 1}],
            },
        )
        booking_id = create_res.json()["id"]

        await client.post(
            f"/api/portal/bookings/{booking_id}/cancel", headers=auth_headers
        )
        res = await client.post(
            f"/api/portal/bookings/{booking_id}/cancel", headers=auth_headers
        )
        assert res.status_code == 400

    async def test_get_nonexistent_booking(
        self, client: AsyncClient, auth_headers: dict, seed_data
    ):
        res = await client.get(
            "/api/portal/bookings/99999", headers=auth_headers
        )
        assert res.status_code == 404

    async def test_get_qr_code(
        self, client: AsyncClient, auth_headers: dict, seed_data
    ):
        tomorrow = (datetime.date.today() + datetime.timedelta(days=1)).isoformat()
        create_res = await client.post(
            "/api/portal/bookings",
            headers=auth_headers,
            json={
                "from_branch_id": 101,
                "to_branch_id": 102,
                "travel_date": tomorrow,
                "departure": "09:30",
                "items": [{"item_id": 101, "quantity": 1}],
            },
        )
        booking_id = create_res.json()["id"]

        res = await client.get(
            f"/api/portal/bookings/{booking_id}/qr", headers=auth_headers
        )
        assert res.status_code == 200
        assert res.headers["content-type"] == "image/png"
        assert len(res.content) > 0
