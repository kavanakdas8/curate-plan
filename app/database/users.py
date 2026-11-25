from datetime import datetime, timezone, timedelta
from typing import Any

from bson import ObjectId
from pymongo.errors import DuplicateKeyError

from database.db import get_database
from auth.security import hash_password, hash_token


USERS_COLLECTION = "users"
SESSIONS_COLLECTION = "sessions"


def get_users_collection():
    return get_database()[USERS_COLLECTION]


def get_sessions_collection():
    return get_database()[SESSIONS_COLLECTION]


def serialize_user(user: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": str(user["_id"]),
        "name": user["name"],
        "email": user["email"],
        "created_at": user["created_at"],
    }


async def create_user(
    name: str,
    email: str,
    password: str,
) -> dict[str, Any]:

    normalized_email = email.strip().lower()

    user = {
        "name": name.strip(),
        "email": normalized_email,
        "password_hash": hash_password(password),
        "created_at": datetime.now(timezone.utc),
    }

    try:
        result = await get_users_collection().insert_one(user)

    except DuplicateKeyError:
        raise ValueError("An account with this email already exists")

    saved_user = await get_users_collection().find_one({
        "_id": result.inserted_id
    })

    return serialize_user(saved_user)


async def get_user_by_email(email: str):
    return await get_users_collection().find_one({
        "email": email.strip().lower()
    })


async def get_user_by_id(user_id: str):
    if not ObjectId.is_valid(user_id):
        return None

    return await get_users_collection().find_one({
        "_id": ObjectId(user_id)
    })


async def create_session(user_id: str, refresh_token: str):
    now = datetime.now(timezone.utc)

    session = {
        "user_id": ObjectId(user_id),
        "token_hash": hash_token(refresh_token),
        "created_at": now,
        "expires_at": now + timedelta(days=7),
    }

    await get_sessions_collection().insert_one(session)


async def get_session_by_token(refresh_token: str):
    return await get_sessions_collection().find_one({
        "token_hash": hash_token(refresh_token),
        "expires_at": {"$gt": datetime.now(timezone.utc)},
    })


async def rotate_session(old_token: str, new_token: str) -> bool:
    now = datetime.now(timezone.utc)

    result = await get_sessions_collection().update_one(
        {
            "token_hash": hash_token(old_token),
            "expires_at": {"$gt": now},
        },
        {
            "$set": {
                "token_hash": hash_token(new_token),
                "created_at": now,
                "expires_at": now + timedelta(days=7),
            }
        },
    )

    return result.modified_count == 1


async def delete_session(refresh_token: str):
    await get_sessions_collection().delete_one({
        "token_hash": hash_token(refresh_token)
    })


async def delete_all_user_sessions(user_id: str):
    if not ObjectId.is_valid(user_id):
        return

    await get_sessions_collection().delete_many({
        "user_id": ObjectId(user_id)
    })


async def create_user_indexes():
    await get_users_collection().create_index(
        "email",
        unique=True,
    )

    await get_sessions_collection().create_index(
        "token_hash",
        unique=True,
    )

    await get_sessions_collection().create_index(
        "expires_at",
        expireAfterSeconds=0,
    )
