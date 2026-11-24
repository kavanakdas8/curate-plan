
import os
from pymongo import AsyncMongoClient
from pymongo.errors import ServerSelectionTimeoutError

class MongoDB:
    client: AsyncMongoClient | None = None
    database = None

mongodb = MongoDB()


async def connect_to_mongodb():
    mongodb_url = os.getenv("MONGODB_URL")
    database_name = os.getenv("DATABASE_NAME", "curateplan")

    if not mongodb_url:
        raise ValueError("MONGODB_URL is missing from .env")

    mongodb.client = AsyncMongoClient(
        mongodb_url,
        serverSelectionTimeoutMS=10000,
    )

    mongodb.database = mongodb.client[database_name]

    try:
        await mongodb.client.admin.command("ping")
        print("MongoDB connected successfully!")
    except ServerSelectionTimeoutError:
        await mongodb.client.close()
        mongodb.client = None
        mongodb.database = None
        raise


async def close_mongodb_connection():
    if mongodb.client is not None:
        await mongodb.client.close()
        mongodb.client = None
        mongodb.database = None
        print("MongoDB connection closed.")


def get_database():
    if mongodb.database is None:
        raise RuntimeError("MongoDB is not connected")

    return mongodb.database
