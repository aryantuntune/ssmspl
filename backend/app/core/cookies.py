from starlette.responses import Response
from app.config import settings


def set_auth_cookies(
    response: Response,
    access_token: str,
    refresh_token: str,
    access_max_age: int | None = None,
    refresh_max_age: int | None = None,
    cookie_prefix: str = "ssmspl",
    refresh_path: str = "/api/auth",
    samesite: str = "lax",
) -> None:
    """Set HttpOnly auth cookies on a response.

    SameSite defaults to "lax" (NOT "strict"): the customer portal redirects out
    to the Airpay payment page and back, and a Strict cookie is withheld by the
    browser on that cross-site return navigation — which logged the customer out
    on every payment. Lax still sends the cookie on top-level GET navigations
    (the Airpay return) while withholding it on cross-site POST/subresource
    requests, so CSRF protection on our POST mutations is preserved.
    """
    if access_max_age is None:
        access_max_age = settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60
    if refresh_max_age is None:
        refresh_max_age = settings.REFRESH_TOKEN_EXPIRE_DAYS * 86400

    secure = settings.APP_ENV != "development"

    response.set_cookie(
        key=f"{cookie_prefix}_access_token",
        value=access_token,
        max_age=access_max_age,
        httponly=True,
        secure=secure,
        samesite=samesite,
        path="/",
    )
    response.set_cookie(
        key=f"{cookie_prefix}_refresh_token",
        value=refresh_token,
        max_age=refresh_max_age,
        httponly=True,
        secure=secure,
        samesite=samesite,
        path=refresh_path,
    )


def clear_auth_cookies(
    response: Response,
    cookie_prefix: str = "ssmspl",
    refresh_path: str = "/api/auth",
    samesite: str = "lax",
) -> None:
    """Clear auth cookies by setting Max-Age=0.

    SameSite must match the attributes used in set_auth_cookies so the browser
    targets the same cookie when clearing it.
    """
    secure = settings.APP_ENV != "development"

    response.set_cookie(
        key=f"{cookie_prefix}_access_token",
        value="",
        max_age=0,
        httponly=True,
        secure=secure,
        samesite=samesite,
        path="/",
    )
    response.set_cookie(
        key=f"{cookie_prefix}_refresh_token",
        value="",
        max_age=0,
        httponly=True,
        secure=secure,
        samesite=samesite,
        path=refresh_path,
    )
