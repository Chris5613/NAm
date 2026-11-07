"""Authentication and account setup routes."""

import os
import secrets

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel, Field
from sqlalchemy import func, select, text
from sqlalchemy.orm import Session

from ..auth import clear_session_cookie, current_user, hash_password, set_session_cookie, verify_password
from ..db import get_db
from ..rate_limit import check_request_rate
from ..models import User, utcnow

router = APIRouter(prefix="/api/auth", tags=["auth"])


class Credentials(BaseModel):
    username: str = Field(min_length=1, max_length=64)
    password: str = Field(min_length=8, max_length=256)


class SetupCredentials(Credentials):
    setup_token: str = Field(min_length=1, max_length=512)


class PasswordReset(BaseModel):
    username: str = Field(min_length=1, max_length=64)
    security_answer: str = Field(min_length=1, max_length=256)
    new_password: str = Field(min_length=8, max_length=256)





@router.get("/status")
async def auth_status(db: Session = Depends(get_db)) -> dict:
    needs_setup = db.scalar(select(func.count(User.id))) == 0
    return {
        "needs_setup": needs_setup,
        "setup_token_required": needs_setup,
        "setup_configured": bool(os.getenv("APP_SETUP_TOKEN")),
    }


@router.post("/setup")
async def setup(
    credentials: SetupCredentials,
    response: Response,
    request: Request,
    db: Session = Depends(get_db),
) -> dict:
    """Create the single account only with the deployment bootstrap token."""
    check_request_rate(
        "setup",
        request.client.host if request.client else "unknown",
        max_attempts=12,
        seconds=3600,
    )

    expected = os.getenv("APP_SETUP_TOKEN", "")
    if not expected:
        raise HTTPException(
            status_code=503,
            detail="Account setup is not configured on the backend.",
        )
    if not secrets.compare_digest(credentials.setup_token, expected):
        raise HTTPException(status_code=403, detail="Invalid setup token.")

    # Empty-table row locks do not prevent two concurrent first-user creates.
    # PostgreSQL advisory locking serializes this one-time bootstrap transaction.
    if db.bind is not None and db.bind.dialect.name == "postgresql":
        db.execute(text("SELECT pg_advisory_xact_lock(563241911)"))

    if db.scalar(select(func.count(User.id))) > 0:
        raise HTTPException(status_code=409, detail="An account already exists. Sign in instead.")

    user = User(
        username=credentials.username.strip(),
        password_hash=hash_password(credentials.password),
        security_answer_hash=None,
        last_login_at=utcnow(),
    )
    db.add(user)
    db.commit()
    set_session_cookie(response, user.id, user.password_hash)
    return {"username": user.username}


@router.post("/login")
async def login(credentials: Credentials, response: Response, request: Request,
                db: Session = Depends(get_db)) -> dict:
    check_request_rate("login", credentials.username.strip(), max_attempts=20, seconds=600)
    try:
        user = db.scalar(select(User).where(User.username == credentials.username.strip()))
        # Same message either way so the response cannot probe for valid usernames.
        if not user or not verify_password(user.password_hash, credentials.password):
            raise HTTPException(status_code=401, detail="Incorrect username or password.")

        user.last_login_at = utcnow()
        db.commit()
        set_session_cookie(response, user.id, user.password_hash)
        return {"username": user.username}
    except HTTPException:
        raise
    except Exception as error:
        db.rollback()
        raise HTTPException(status_code=503, detail="Login service is temporarily unavailable.") from error


@router.post("/reset-password")
async def reset_password(request: PasswordReset) -> dict:
    # Old recovery answer was public. Fail closed until secure recovery is installed.
    raise HTTPException(410, "Self-service password recovery is disabled for account security.")


class PasswordChange(BaseModel):
    current_password: str = Field(min_length=1, max_length=256)
    new_password: str = Field(min_length=12, max_length=256)


@router.post("/change-password")
async def change_password(request: PasswordChange, response: Response,
                          user: User = Depends(current_user), db: Session = Depends(get_db)) -> dict:
    if not verify_password(user.password_hash, request.current_password):
        raise HTTPException(401, "Current password is incorrect.")
    if request.current_password == request.new_password:
        raise HTTPException(422, "Choose a different password.")
    user.password_hash = hash_password(request.new_password)
    db.commit()
    set_session_cookie(response, user.id, user.password_hash)
    return {"ok": True}


@router.post("/logout")
async def logout(response: Response) -> dict:
    clear_session_cookie(response)
    return {"ok": True}


@router.get("/me")
async def me(user: User = Depends(current_user)) -> dict:
    return {"username": user.username, "id": user.id}


@router.get("/config")
async def config() -> dict:
    """Non-sensitive flags the frontend needs before sign-in."""
    return {"bank_provider": "simplefin"}
