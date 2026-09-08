"""Single-user authentication: Argon2 password hashing over signed session cookies."""

import os
import secrets
from datetime import timedelta

from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerifyMismatchError, VerificationError
from fastapi import Cookie, Depends, HTTPException, Response
from itsdangerous import BadSignature, SignatureExpired, URLSafeTimedSerializer
from sqlalchemy import select
from sqlalchemy.orm import Session

from .db import get_db
from .models import User

SESSION_COOKIE = "nam_session"
SESSION_MAX_AGE = int(timedelta(days=30).total_seconds())
_hasher = PasswordHasher()


def _secret_key() -> str:
    secret = os.getenv("SESSION_SECRET")
    if not secret:
        # Without a stable secret every restart would silently invalidate logins.
        raise RuntimeError("SESSION_SECRET is not set. Generate one with: python -c \"import secrets;print(secrets.token_urlsafe(48))\"")
    return secret


def _serializer() -> URLSafeTimedSerializer:
    return URLSafeTimedSerializer(_secret_key(), salt="nam-session")


def hash_password(password: str) -> str:
    return _hasher.hash(password)


def verify_password(password_hash: str, password: str) -> bool:
    try:
        _hasher.verify(password_hash, password)
        return True
    except (InvalidHashError, VerifyMismatchError, VerificationError):
        return False


def is_secure_cookie() -> bool:
    return os.getenv("COOKIE_SECURE", "true").lower() != "false"


def set_session_cookie(response: Response, user_id: int) -> None:
    response.set_cookie(
        key=SESSION_COOKIE,
        value=_serializer().dumps({"uid": user_id, "csrf": secrets.token_urlsafe(16)}),
        max_age=SESSION_MAX_AGE,
        httponly=True,
        secure=is_secure_cookie(),
        samesite=os.getenv("COOKIE_SAMESITE", "lax"),
        path="/",
    )


def clear_session_cookie(response: Response) -> None:
    response.delete_cookie(SESSION_COOKIE, path="/")


def current_user(
    nam_session: str | None = Cookie(default=None, alias=SESSION_COOKIE),
    db: Session = Depends(get_db),
) -> User:
    if not nam_session:
        raise HTTPException(status_code=401, detail="Not signed in.")
    try:
        payload = _serializer().loads(nam_session, max_age=SESSION_MAX_AGE)
    except SignatureExpired as error:
        raise HTTPException(status_code=401, detail="Session expired. Sign in again.") from error
    except BadSignature as error:
        raise HTTPException(status_code=401, detail="Invalid session.") from error

    user = db.scalar(select(User).where(User.id == payload.get("uid")))
    if not user:
        raise HTTPException(status_code=401, detail="Not signed in.")
    return user
