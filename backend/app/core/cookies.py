from starlette.responses import Response
from app.config import settings


def set_auth_cookies(
    response: Response,
    access_token: str,
    refresh_token: str,
    access_max_age: int | None = None,
    refresh_max_age: int | None = None,
    cookie_prefix: str = "ssmspl",
    refresh_path: str = "/api/auth/refresh",
) -> None:
    """Set HttpOnly auth cookies on a response."""
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
        samesite="strict",
        path="/",
    )
    response.set_cookie(
        key=f"{cookie_prefix}_refresh_token",
        value=refresh_token,
        max_age=refresh_max_age,
        httponly=True,
        secure=secure,
        samesite="strict",
        path=refresh_path,
    )


def clear_auth_cookies(
    response: Response,
    cookie_prefix: str = "ssmspl",
    refresh_path: str = "/api/auth/refresh",
) -> None:
    """Clear auth cookies by setting Max-Age=0."""
    secure = settings.APP_ENV != "development"

    response.set_cookie(
        key=f"{cookie_prefix}_access_token",
        value="",
        max_age=0,
        httponly=True,
        secure=secure,
        samesite="strict",
        path="/",
    )
    response.set_cookie(
        key=f"{cookie_prefix}_refresh_token",
        value="",
        max_age=0,
        httponly=True,
        secure=secure,
        samesite="strict",
        path=refresh_path,
    )
