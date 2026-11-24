
from datetime import datetime, timezone
from typing import Any

from bson import ObjectId
from pymongo import ReturnDocument

from database.db import get_database


COLLECTION_NAME = "curricula"


def serialize_curriculum(document: dict[str, Any]) -> dict[str, Any]:
    """Convert MongoDB document into a JSON-friendly curriculum."""
    result = {
        key: value
        for key, value in document.items()
        if key not in ("_id",)
    }
    result["id"] = str(document["_id"])
    return result


def get_collection():
    return get_database()[COLLECTION_NAME]


async def create_curriculum(data: dict[str, Any]) -> dict[str, Any]:
    collection = get_collection()

    now = datetime.now(timezone.utc)

    # Never allow the client to supply MongoDB's internal ID or timestamps.
    curriculum_data = {
        key: value
        for key, value in data.items()
        if key not in ("id", "_id", "created_at", "updated_at")
    }

    document = {
        **curriculum_data,
        "created_at": now,
        "updated_at": now,
    }

    result = await collection.insert_one(document)
    saved_document = await collection.find_one({"_id": result.inserted_id})

    return serialize_curriculum(saved_document)


async def get_all_curricula() -> list[dict[str, Any]]:
    collection = get_collection()

    cursor = collection.find().sort("updated_at", -1)
    documents = await cursor.to_list(length=1000)

    return [serialize_curriculum(doc) for doc in documents]


async def get_curriculum_by_id(curriculum_id: str):
    if not ObjectId.is_valid(curriculum_id):
        return None

    collection = get_collection()

    document = await collection.find_one({
        "_id": ObjectId(curriculum_id)
    })

    if document is None:
        return None

    return serialize_curriculum(document)


async def update_curriculum(
    curriculum_id: str,
    data: dict[str, Any],
):
    if not ObjectId.is_valid(curriculum_id):
        return None

    collection = get_collection()

    curriculum_data = {
        key: value
        for key, value in data.items()
        if key not in ("id", "_id", "created_at", "updated_at")
    }

    curriculum_data["updated_at"] = datetime.now(timezone.utc)

    document = await collection.find_one_and_update(
        {"_id": ObjectId(curriculum_id)},
        {"$set": curriculum_data},
        return_document=ReturnDocument.AFTER,
    )

    if document is None:
        return None

    return serialize_curriculum(document)


async def delete_curriculum(curriculum_id: str) -> bool:
    if not ObjectId.is_valid(curriculum_id):
        return False

    collection = get_collection()

    result = await collection.delete_one({
        "_id": ObjectId(curriculum_id)
    })

    return result.deleted_count > 0
