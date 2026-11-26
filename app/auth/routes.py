import os
from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from pydantic import BaseModel, EmailStr, Field
from jwt import PyJWTError

from auth.security import (
    hash_password,
    verify_password,
    create_access_token,
    create_refresh_token,
    decode_token,
)
from auth.dependencies import get_current_user
from database.users import (
    create_user,
    get_user_by_email,
    get_user_by_id,
    serialize_user,
    create_session,
    get_session_by_token,
    rotate_session,
    delete_session,
)

router = APIRouter(prefix="/api/auth", tags=["Authentication"])

REFRESH_COOKIE_NAME = "curateplan_refresh"
REFRESH_COOKIE_MAX_AGE = 30 * 24 * 60 * 60

# Keep false for local HTTP development.
# Set COOKIE_SECURE=true when deployed behind HTTPS.
COOKIE_SECURE = os.getenv("COOKIE_SECURE", "false").lower() == "true"


class RegisterRequest(BaseModel):
    name: str = Field(min_length=2, max_length=60)
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)


class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=128)


def set_refresh_cookie(response: Response, token: str):
    response.set_cookie(
        key=REFRESH_COOKIE_NAME,
        value=token,
        httponly=True,
        secure=COOKIE_SECURE,
        samesite="lax",
        max_age=REFRESH_COOKIE_MAX_AGE,
        path="/api/auth",
    )


def clear_refresh_cookie(response: Response):
    response.delete_cookie(
        key=REFRESH_COOKIE_NAME,
        path="/api/auth",
        httponly=True,
        secure=COOKIE_SECURE,
        samesite="lax",
    )


@router.post("/register", status_code=status.HTTP_201_CREATED)
async def register(data: RegisterRequest, response: Response):
    try:
        user = await create_user(
            name=data.name,
            email=str(data.email),
            password=data.password,
        )
    except ValueError as error:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=str(error),
        )

    access_token = create_access_token(user["id"])
    refresh_token = create_refresh_token(user["id"])

    await create_session(user["id"], refresh_token)
    set_refresh_cookie(response, refresh_token)

    return {
        "user": user,
        "access_token": access_token,
        "token_type": "bearer",
    }


@router.post("/login")
async def login(data: LoginRequest, response: Response):
    user_document = await get_user_by_email(str(data.email))

    if (
        user_document is None
        or not verify_password(
            data.password,
            user_document["password_hash"],
        )
    ):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
        )

    user = serialize_user(user_document)

    access_token = create_access_token(user["id"])
    refresh_token = create_refresh_token(user["id"])

    await create_session(user["id"], refresh_token)
    set_refresh_cookie(response, refresh_token)

    return {
        "user": user,
        "access_token": access_token,
        "token_type": "bearer",
    }


@router.post("/refresh")
async def refresh(request: Request, response: Response):
    refresh_token = request.cookies.get(REFRESH_COOKIE_NAME)

    if not refresh_token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Refresh token missing",
        )

    try:
        payload = decode_token(refresh_token)

        if payload.get("type") != "refresh":
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid refresh token",
            )

        user_id = payload.get("sub")
        if not user_id:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid refresh token",
            )

    except PyJWTError:
        clear_refresh_cookie(response)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired refresh token",
        )

    session = await get_session_by_token(refresh_token)

    if session is None or str(session["user_id"]) != user_id:
        clear_refresh_cookie(response)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Session expired or invalid",
        )

    user_document = await get_user_by_id(user_id)

    if user_document is None:
        await delete_session(refresh_token)
        clear_refresh_cookie(response)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found",
        )

    new_refresh_token = create_refresh_token(user_id)

    rotated = await rotate_session(refresh_token, new_refresh_token)

    if not rotated:
        clear_refresh_cookie(response)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Session could not be refreshed",
        )

    new_access_token = create_access_token(user_id)
    set_refresh_cookie(response, new_refresh_token)

    return {
        "access_token": new_access_token,
        "token_type": "bearer",
    }


@router.post("/logout")
async def logout(request: Request, response: Response):
    refresh_token = request.cookies.get(REFRESH_COOKIE_NAME)

    if refresh_token:
        await delete_session(refresh_token)

    clear_refresh_cookie(response)

    return {"message": "Logged out successfully"}


@router.get("/me")
async def get_me(current_user: dict = Depends(get_current_user)):
    return {"user": current_user}