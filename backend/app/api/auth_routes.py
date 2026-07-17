from __future__ import annotations

from pydantic import BaseModel, Field
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth.dependencies import Principal, get_principal
from app.auth.tokens import create_token, verify_password
from app.core.config import get_settings
from app.db.session import get_db
from app.models.entities import User

router = APIRouter(prefix="/api/auth")


class LoginRequest(BaseModel):
    email: str = Field(min_length=3, max_length=320)
    password: str = Field(min_length=8, max_length=200)


@router.post("/login")
def login(data: LoginRequest, db: Session = Depends(get_db)):
    if get_settings().desktop_mode:
        raise HTTPException(status_code=404, detail="desktop mode does not use login")
    user = db.scalar(select(User).where(User.email == data.email, User.status == "active"))
    if user is None or not verify_password(data.password, user.password_hash):
        raise HTTPException(status_code=401, detail="invalid credentials")
    token = create_token(
        {"tenant_id": str(user.organization_id), "user_id": str(user.id), "role": user.role}
    )
    return {
        "id": str(user.id),
        "user_id": str(user.id),
        "tenant_id": str(user.organization_id),
        "name": user.name,
        "email": user.email,
        "role": user.role,
        "access_token": token,
        "token_type": "bearer",
        "expires_in": 1800,
    }


@router.get("/me")
def me(principal: Principal = Depends(get_principal), db: Session = Depends(get_db)):
    user = db.scalar(
        select(User).where(
            User.id == principal.user_id,
            User.organization_id == principal.tenant_id,
            User.status == "active",
        )
    )
    if user is None:
        raise HTTPException(status_code=404, detail="user not found")
    return {
        "id": str(user.id),
        "tenant_id": str(user.organization_id),
        "name": user.name,
        "email": user.email,
        "role": user.role,
    }
