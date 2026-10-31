"""Authentication and account setup routes."""

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..auth import clear_session_cookie, current_user, hash_password, set_session_cookie, verify_password
from ..db import get_db
from ..rate_limit import check_request_rate
from ..models import User, utcnow

router = APIRouter(prefix="/api/auth", tags=["auth"])


class Credentials(BaseModel):
    username: str = Field(min_length=1, max_length=64)
    password: str = Field(min_length=8, max_length=256)


class PasswordReset(BaseModel):
    username: str = Field(min_length=1, max_length=64)
    security_answer: str = Field(min_length=1, max_length=256)
    new_password: str = Field(min_length=8, max_length=256)





@router.get("/status")
async def auth_status(db: Session = Depends(get_db)) -> dict:
    return {"needs_setup": db.scalar(select(func.count(User.id))) == 0}


@router.post("/setup")
async def setup(credentials: Credentials, response: Response, db: Session = Depends(get_db)) -> dict:
    """Creates the single account. Only available while no user exists."""
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
