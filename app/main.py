import os
from pathlib import Path

from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent
load_dotenv(dotenv_path=BASE_DIR / ".env")

from typing import List, Optional, Dict, Any
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from agent import (
    generate_plan,
    handle_chat_turn,
    answer_study_question,
    StudyPlan,
    ChatMessage,
)

from database.db import (
    connect_to_mongodb,
    close_mongodb_connection,
)

from database.curriculum import (
    create_curriculum,
    get_all_curricula,
    get_curriculum_by_id,
    update_curriculum,
    delete_curriculum,
)

from database.users import create_user_indexes
from auth.routes import router as auth_router

@asynccontextmanager
async def lifespan(app: FastAPI):
    print("[Backend] Starting CuratePlan API...")

    await connect_to_mongodb()

    try:
        await create_user_indexes()
        print("[MongoDB] User indexes created successfully")

    except Exception as e:
        print(f"[MongoDB] User index setup failed: {e}")
        raise

    print("[Backend] CuratePlan API started successfully")

    yield

    print("[Backend] Shutting down...")

    await close_mongodb_connection()

app = FastAPI(
    title="CuratePlan AI Study Planner API",
    version="2.1.0",
    lifespan=lifespan,
)

app.include_router(auth_router)


app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "https://curate-plan.vercel.app",
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class PlanRequest(BaseModel):
    topic: str
    timeframe: str
    daily_hours: float
    experience_level: str
    goal: Optional[str] = None


class ChatRequest(BaseModel):
    message: str
    history: List[ChatMessage] = Field(default_factory=list)
    collected_info: Optional[Dict[str, Any]] = None
    current_plan: Optional[Dict[str, Any]] = None
    mode: str = "onboarding"


class ChatResponse(BaseModel):
    reply: str
    suggested_replies: List[str] = Field(default_factory=list)
    ready_to_generate: bool = False
    collected_info: Optional[Dict[str, Any]] = None
    plan: Optional[StudyPlan] = None
    has_curriculum_change: bool = False
    change_summary: Optional[str] = None
    updated_plan: Optional[StudyPlan] = None


class AssistantChatRequest(BaseModel):
    message: str
    history: List[ChatMessage] = Field(default_factory=list)
    current_plan: Optional[Dict[str, Any]] = None


class AssistantChatResponse(BaseModel):
    reply: str


@app.get("/api/health")
@app.get("/health")
def health_check():
    return {
        "status": "ok",
        "app": "CuratePlan AI Backend",
    }

@app.post("/api/generate-plan", response_model=StudyPlan)
@app.post("/generate-plan", response_model=StudyPlan)
def make_plan(payload: PlanRequest):
    try:
        print(f"[Backend] Received subject: '{payload.topic}'")

        print(
            f"[Backend] Received study preferences: "
            f"timeframe='{payload.timeframe}', "
            f"daily_hours={payload.daily_hours}, "
            f"level='{payload.experience_level}'"
        )

        plan = generate_plan(
            topic=payload.topic,
            timeframe=payload.timeframe,
            daily_hours=payload.daily_hours,
            experience_level=payload.experience_level,
            goal=payload.goal,
        )

        print(
            f"[Backend] Generated curriculum subject: "
            f"'{plan.subject}' with {len(plan.schedule)} periods"
        )

        return plan

    except Exception as e:
        print(f"[Backend] Error generating plan: {e}")
        raise HTTPException(
            status_code=500,
            detail="Failed to generate curriculum",
        )

@app.post("/api/chat", response_model=ChatResponse)
@app.post("/chat", response_model=ChatResponse)
def chat_turn(payload: ChatRequest):
    try:
        result = handle_chat_turn(
            message=payload.message,
            history=payload.history,
            collected_info=payload.collected_info,
            current_plan=payload.current_plan,
            mode=payload.mode,
        )

        return ChatResponse(**result)

    except Exception as e:
        print(f"[Backend] Chat error: {e}")
        raise HTTPException(
            status_code=500,
            detail="Failed to process chat message",
        )


@app.post(
    "/api/assistant/chat",
    response_model=AssistantChatResponse,
)
def assistant_chat(payload: AssistantChatRequest):
    if not payload.message.strip():
        raise HTTPException(
            status_code=422,
            detail="Message cannot be empty.",
        )

    try:
        reply = answer_study_question(
            message=payload.message,
            history=payload.history,
            current_plan=payload.current_plan,
        )

        return AssistantChatResponse(reply=reply)

    except Exception as e:
        print(f"[Backend] Groq assistant error: {e}")

        raise HTTPException(
            status_code=500,
            detail="Failed to process assistant message.",
        )


@app.get("/api/curricula")
async def list_curricula():
    try:
        return await get_all_curricula()

    except Exception as e:
        print(f"[Backend] Error retrieving curricula: {e}")

        raise HTTPException(
            status_code=500,
            detail="Failed to retrieve curricula",
        )


@app.post("/api/curricula", status_code=201)
async def save_curriculum(payload: Dict[str, Any]):
    try:
        if not payload.get("subject"):
            raise HTTPException(
                status_code=422,
                detail="Curriculum subject is required",
            )

        if not isinstance(payload.get("schedule"), list):
            raise HTTPException(
                status_code=422,
                detail="Curriculum schedule must be a list",
            )

        return await create_curriculum(payload)

    except HTTPException:
        raise

    except Exception as e:
        print(f"[Backend] Error saving curriculum: {e}")

        raise HTTPException(
            status_code=500,
            detail="Failed to save curriculum",
        )


@app.get("/api/curricula/{curriculum_id}")
async def retrieve_curriculum(curriculum_id: str):
    try:
        curriculum = await get_curriculum_by_id(curriculum_id)

        if curriculum is None:
            raise HTTPException(
                status_code=404,
                detail="Curriculum not found",
            )

        return curriculum

    except HTTPException:
        raise

    except Exception as e:
        print(f"[Backend] Error retrieving curriculum: {e}")

        raise HTTPException(
            status_code=500,
            detail="Failed to retrieve curriculum",
        )


@app.put("/api/curricula/{curriculum_id}")
async def edit_curriculum(
    curriculum_id: str,
    payload: Dict[str, Any],
):
    try:
        if not payload.get("subject"):
            raise HTTPException(
                status_code=422,
                detail="Curriculum subject is required",
            )

        if not isinstance(payload.get("schedule"), list):
            raise HTTPException(
                status_code=422,
                detail="Curriculum schedule must be a list",
            )

        curriculum = await update_curriculum(
            curriculum_id,
            payload,
        )

        if curriculum is None:
            raise HTTPException(
                status_code=404,
                detail="Curriculum not found",
            )

        return curriculum

    except HTTPException:
        raise

    except Exception as e:
        print(f"[Backend] Error updating curriculum: {e}")

        raise HTTPException(
            status_code=500,
            detail="Failed to update curriculum",
        )


@app.delete("/api/curricula/{curriculum_id}")
async def remove_curriculum(curriculum_id: str):
    try:
        deleted = await delete_curriculum(curriculum_id)

        if not deleted:
            raise HTTPException(
                status_code=404,
                detail="Curriculum not found",
            )

        return {
            "message": "Curriculum deleted successfully"
        }

    except HTTPException:
        raise

    except Exception as e:
        print(f"[Backend] Error deleting curriculum: {e}")

        raise HTTPException(
            status_code=500,
            detail="Failed to delete curriculum",
        )

if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "main:app",
        host="127.0.0.1",
        port=8000,
        reload=True,
    )
