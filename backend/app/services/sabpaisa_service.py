"""
SabPaisa payment gateway integration.
Placeholder until API keys are provisioned.
"""
from app.config import settings


def is_configured() -> bool:
    return bool(settings.SABPAISA_CLIENT_CODE and settings.SABPAISA_AUTH_KEY)


async def create_order(amount: float, booking_id: int, customer_email: str) -> dict:
    if not is_configured():
        return {
            "order_id": f"SIM_{booking_id}",
            "amount": amount,
            "status": "simulated",
            "payment_url": None,
            "message": "SabPaisa not configured. Using simulated payment.",
        }
    raise NotImplementedError("SabPaisa integration pending API keys")


async def verify_payment(transaction_id: str, order_id: str) -> dict:
    if not is_configured():
        return {"verified": True, "status": "simulated"}
    raise NotImplementedError("SabPaisa integration pending API keys")
