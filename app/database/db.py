import os
import certifi
from pymongo import AsyncMongoClient
from pymongo.errors import PyMongoError

class MongoDB:
    client: AsyncMongoClient | None = None
    database = None

mongodb = MongoDB()


async def connect_to_mongodb():
    mongodb_url = os.getenv("MONGODB_URL")
    database_name = os.getenv("DATABASE_NAME", "curateplan")

    if not mongodb_url:
        print("[MongoDB] Warning: MONGODB_URL is missing from .env")
        return

    try:
        mongodb.client = AsyncMongoClient(
            mongodb_url,
            serverSelectionTimeoutMS=5000,
            tlsCAFile=certifi.where(),
        )
        mongodb.database = mongodb.client[database_name]
        await mongodb.client.admin.command("ping")
        print("MongoDB connected successfully!")
    except PyMongoError as e:
        print(f"[MongoDB] Connection error: {e}")
        print("[MongoDB] TIP: If this is an SSL/TLS handshake error, your current IP address is likely not whitelisted in MongoDB Atlas.")
        print("[MongoDB] Go to MongoDB Atlas -> Network Access -> Add IP Address (or 0.0.0.0/0 for anywhere).")
        if mongodb.client is not None:
            await mongodb.client.close()
        mongodb.client = None
        mongodb.database = None
    except Exception as e:
        print(f"[MongoDB] Unexpected error connecting to database: {e}")
        if mongodb.client is not None:
            await mongodb.client.close()
        mongodb.client = None
        mongodb.database = None


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
