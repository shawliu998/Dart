from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.auth.dependencies import Principal, get_principal, require_write
from app.db.session import get_db
from app.schemas.settings import (
    AIConnectionTest,
    AIConnectionTestResult,
    AISettingsRead,
    AISettingsWrite,
)
from app.services import ai_settings


router = APIRouter(prefix="/api/settings", tags=["settings"])


@router.get("/ai-model", response_model=AISettingsRead)
def get_ai_model_settings(
    db: Session = Depends(get_db),
    principal: Principal = Depends(get_principal),
):
    return ai_settings.read_settings(db, principal)


@router.patch("/ai-model", response_model=AISettingsRead)
def patch_ai_model_settings(
    data: AISettingsWrite,
    db: Session = Depends(get_db),
    principal: Principal = Depends(get_principal),
):
    require_write(principal)
    try:
        return ai_settings.save_settings(db, principal, data)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/ai-model/test", response_model=AIConnectionTestResult)
async def test_ai_model_settings(
    data: AIConnectionTest,
    db: Session = Depends(get_db),
    principal: Principal = Depends(get_principal),
):
    require_write(principal)
    result = await ai_settings.test_connection(db, principal, data)
    if result.status == "failed":
        raise HTTPException(
            status_code=422,
            detail={
                "code": result.error_code,
                "message": "The provider did not satisfy the structured extraction contract.",
            },
        )
    return result
