"""Authentication and account setup routes."""

from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..auth import clear_session_cookie, current_user, hash_password, set_session_cookie, verify_password
from ..db import get_db
from ..models import User, utcnow

router = APIRouter(prefix="/api/auth", tags=["auth"])


class Credentials(BaseModel):
    username: str = Field(min_length=1, max_length=64)
    password: str = Field(min_length=8, max_length=256)


class PasswordReset(BaseModel):
    username: str = Field(min_length=1, max_length=64)
    security_answer: str = Field(min_length=1, max_length=256)
    new_password: str = Field(min_length=8, max_length=256)


SECURITY_ANSWER = "double"


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
        security_answer_hash=hash_password(SECURITY_ANSWER),
        last_login_at=utcnow(),
    )
    db.add(user)
    db.commit()
    set_session_cookie(response, user.id)
    return {"username": user.username}


@router.post("/login")
async def login(credentials: Credentials, response: Response, db: Session = Depends(get_db)) -> dict:
    try:
        user = db.scalar(select(User).where(User.username == credentials.username.strip()))
        # Same message either way so the response cannot probe for valid usernames.
        if not user or not verify_password(user.password_hash, credentials.password):
            raise HTTPException(status_code=401, detail="Incorrect username or password.")

        user.last_login_at = utcnow()
        db.commit()
        set_session_cookie(response, user.id)
        return {"username": user.username}
    except HTTPException:
        raise
    except Exception as error:
        db.rollback()
        raise HTTPException(status_code=503, detail="Login service is temporarily unavailable.") from error


@router.post("/reset-password")
async def reset_password(request: PasswordReset, db: Session = Depends(get_db)) -> dict:
    user = db.scalar(select(User).where(User.username == request.username.strip()))
    answer_matches = request.security_answer.strip().lower() == SECURITY_ANSWER
    if user and user.security_answer_hash:
        answer_matches = verify_password(user.security_answer_hash, request.security_answer.strip())
    if not user or not answer_matches:
        raise HTTPException(status_code=401, detail="Incorrect username or security answer.")

    user.password_hash = hash_password(request.new_password)
    user.security_answer_hash = hash_password(SECURITY_ANSWER)
    db.commit()
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
