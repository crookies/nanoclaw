from fastapi import APIRouter, HTTPException, Request, Response
from pydantic import BaseModel

from auth import create_session, is_valid_session, revoke_session, verify_password
from config import settings

router = APIRouter(prefix="/auth", tags=["auth"])


class LoginRequest(BaseModel):
    password: str


@router.post("/login")
async def login(body: LoginRequest, response: Response):
    if not settings.crookery_password_hash:
        raise HTTPException(503, "No password configured")
    if not verify_password(body.password, settings.crookery_password_hash):
        raise HTTPException(401, "Invalid password")
    token = create_session()
    response.set_cookie("crookery_session", token, httponly=True, samesite="strict")
    return {"ok": True}


@router.post("/logout")
async def logout(request: Request, response: Response):
    token = request.cookies.get("crookery_session", "")
    revoke_session(token)
    response.delete_cookie("crookery_session")
    return {"ok": True}


@router.get("/me")
async def me(request: Request):
    if not settings.crookery_password_hash:
        return {"authenticated": True}
    token = request.cookies.get("crookery_session", "")
    if not is_valid_session(token):
        raise HTTPException(401, "Not authenticated")
    return {"authenticated": True}
