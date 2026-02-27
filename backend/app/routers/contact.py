from fastapi import APIRouter, BackgroundTasks, Request
from pydantic import BaseModel, EmailStr, Field

from app.middleware.rate_limit import limiter
from app.services.email_service import send_contact_form_email

router = APIRouter(prefix="/api/contact", tags=["Contact"])


class ContactFormRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    email: EmailStr
    phone: str = Field(default="", max_length=20)
    message: str = Field(..., min_length=10, max_length=2000)


@router.post(
    "",
    summary="Submit contact form",
    description="Send a contact form message. Rate limited to 3 per minute.",
    responses={
        200: {"description": "Message sent successfully"},
        429: {"description": "Too many requests"},
    },
)
@limiter.limit("3/minute")
async def submit_contact_form(request: Request, body: ContactFormRequest, background_tasks: BackgroundTasks):
    background_tasks.add_task(
        send_contact_form_email,
        sender_name=body.name,
        sender_email=body.email,
        sender_phone=body.phone,
        message=body.message,
    )
    return {"message": "Your message has been sent. We will get back to you shortly."}
