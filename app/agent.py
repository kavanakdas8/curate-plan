import os
import json
from pathlib import Path
from typing import List, Optional, Dict, Any, Type

from dotenv import load_dotenv
from google import genai
from google.genai import types
from groq import Groq
from pydantic import BaseModel, Field

env_path = Path(__file__).resolve().parent / ".env"
load_dotenv(dotenv_path=env_path)

MODELS_TO_TRY = [
    "gemini-flash-lite-latest",
    "gemini-3.1-flash-lite",
    "gemini-3.5-flash-lite",
    "gemini-3.6-flash",
]

def get_api_keys() -> List[str]:
    """Load configured Gemini API keys in priority order."""

    possible_keys = [
        os.getenv("GEMINI_API_KEY"),
        os.getenv("GEMINI_API_KEY_BACKUP_1"),
        os.getenv("GEMINI_API_KEY_BACKUP_2"),
    ]

    keys = []

    for key in possible_keys:
        if key and key.strip() and key.strip() not in keys:
            keys.append(key.strip())

    if not keys:
        raise ValueError(
            "No Gemini API keys configured. "
            "Please configure GEMINI_API_KEY in your .env file."
        )

    return keys


def get_client(api_key: str) -> genai.Client:
    """Create a Gemini client using a specific API key."""
    return genai.Client(api_key=api_key)


def is_key_level_error(error: Exception) -> bool:
    """
    Identify quota and authentication errors that should
    trigger an immediate switch to the next API key.
    """

    status_code = (
        getattr(error, "code", None)
        or getattr(error, "status_code", None)
    )

    try:
        status_code = int(status_code)
    except (TypeError, ValueError):
        status_code = None

    error_text = str(error).lower()

    indicators = [
        "resource_exhausted",
        "quota exceeded",
        "quota limit",
        "rate limit",
        "too many requests",
        "api_key_invalid",
        "invalid api key",
        "api key not valid",
        "unauthenticated",
        "permission denied",
    ]

    if status_code in (401, 403, 429):
        return True

    return any(item in error_text for item in indicators)


def generate_structured_response(
    prompt: str,
    response_schema: Type[BaseModel],
    temperature: float = 0.3,
) -> BaseModel:
    """
    Shared Gemini execution engine.

    Fallback order:
    1. Primary key: try every model.
    2. Backup key 1: try every model.
    3. Backup key 2: try every model.

    Quota/authentication errors skip the remaining models
    for that key and move directly to the next key.
    """

    api_keys = get_api_keys()
    last_error = None

    for key_index, api_key in enumerate(api_keys, start=1):

        print(
            f"[Backend] Trying Gemini API key "
            f"{key_index}/{len(api_keys)}"
        )

        client = get_client(api_key)

        for model_name in MODELS_TO_TRY:

            try:
                print(f"[Backend] Trying model: {model_name}")

                response = client.models.generate_content(
                    model=model_name,
                    contents=prompt,
                    config=types.GenerateContentConfig(
                        response_mime_type="application/json",
                        response_schema=response_schema,
                        temperature=temperature,
                    ),
                )

                if not response.text:
                    raise RuntimeError(
                        f"Gemini returned an empty response "
                        f"for model {model_name}."
                    )

                result = response_schema.model_validate_json(
                    response.text
                )

                print(
                    f"[Backend] Success: key {key_index}, "
                    f"model {model_name}"
                )

                return result

            except Exception as error:
                last_error = error

                print(
                    f"[Backend] {model_name} failed: "
                    f"{type(error).__name__}: {error}"
                )

                if is_key_level_error(error):
                    print(
                        f"[Backend] Quota/authentication error. "
                        f"Switching from API key {key_index}."
                    )
                    break

                print("[Backend] Trying the next model.")

    raise last_error or RuntimeError(
        "All Gemini API keys and models failed."
    )

class Task(BaseModel):
    title: str = Field(
        description="Actionable title for the study task"
    )
    duration_minutes: int = Field(
        description="Estimated minutes to complete"
    )
    description: str = Field(
        description="Detailed instructions on what to read, code, or practice"
    )
    resource_type: str = Field(
        description="e.g. Documentation, Exercise, Video, Reading"
    )


class PeriodSchedule(BaseModel):
    period_label: str = Field(
        description="e.g. 'Day 1', 'Day 2', or 'Week 1'"
    )
    topic_summary: str = Field(
        description="Core objective of this period"
    )
    tasks: List[Task]


class StudyPlan(BaseModel):
    subject: str
    target_timeframe: str
    overview: str = Field(
        description="High-level strategy to master the topic within the timeframe"
    )
    schedule: List[PeriodSchedule]


class ChatMessage(BaseModel):
    role: str
    content: str


class ConversationTurn(BaseModel):
    reply: str = Field(
        description="Conversational response to the user. Warm, encouraging, concise."
    )

    suggested_replies: List[str] = Field(
        default_factory=list,
        description="3-4 short suggested response options/chips for the user"
    )

    extracted_topic: Optional[str] = Field(
        None,
        description="Learning topic/subject if identified"
    )

    extracted_timeframe: Optional[str] = Field(
        None,
        description="Timeframe e.g. '2 weeks', '1 month', '8 weeks'"
    )

    extracted_daily_hours: Optional[float] = Field(
        None,
        description="Daily hours commitment e.g. 1.0, 2.0"
    )

    extracted_experience_level: Optional[str] = Field(
        None,
        description="Experience level e.g. 'Beginner', 'Intermediate', 'Advanced'"
    )

    extracted_goal: Optional[str] = Field(
        None,
        description="Goal focus e.g. 'Build practical projects', 'Exam prep', 'Fundamentals'"
    )

    ready_to_generate: bool = Field(
        False,
        description="True if enough information is available to generate the study plan"
    )

def generate_plan(
    topic: str,
    timeframe: str,
    daily_hours: float,
    experience_level: str,
    goal: Optional[str] = None,
) -> StudyPlan:
    """Generate a structured study plan for CuratePlan."""

    goal_prompt = (
        f"\nSpecific Student Focus: {goal}"
        if goal else ""
    )

    print(
        f"[Backend] Subject used in Gemini prompt: '{topic}'"
    )

    prompt = f"""
    You are an expert pedagogical study coach and agentic curriculum designer for CuratePlan.

    Student Goal: Learn '{topic}'
    Available Timeframe: {timeframe}
    Commitment: {daily_hours} hours per day
    Prior Experience: {experience_level}{goal_prompt}

    Requirements:
    1. If timeframe is under 14 days, break it down by individual days ('Day 1', 'Day 2', etc.).
    2. If timeframe is longer (e.g. 1 month, 6 weeks, 8 weeks), break it down by weeks ('Week 1', 'Week 2', etc.).
    3. Ensure daily tasks strictly do not exceed the stated daily hours limit ({daily_hours} hours = {int(daily_hours * 60)} minutes total per period).
    4. Balance theory (30%) with active, hands-on building/practice (70%).
    5. Each task must have an informative description with concrete instructions and realistic duration_minutes.
    6. Include practical milestone projects or exercises that test mastery.
    """

    return generate_structured_response(
        prompt=prompt,
        response_schema=StudyPlan,
        temperature=0.3,
    )

def handle_chat_turn(
    message: str,
    history: List[ChatMessage],
    collected_info: Optional[Dict[str, Any]] = None,
    current_plan: Optional[Dict[str, Any]] = None,
    mode: str = "onboarding",
) -> Dict[str, Any]:
    """
    Process an onboarding conversation.

    Collects learning preferences and generates a study plan
    once the required information is available.
    """

    collected = dict(collected_info or {})

    formatted_history = "\n".join(
        [f"{m.role}: {m.content}" for m in history[-8:]]
    )

    known_str = json.dumps(collected)

    prompt = f"""
    You are CuratePlan's expert AI pedagogical advisor and learning companion.

    Your objective is to have a natural, ChatGPT-inspired conversation with the student to understand what they want to learn and collect enough details to generate a personalized study roadmap.

    Key information needed for a great roadmap:
    1. Topic / Subject (e.g. "Machine Learning", "Python from scratch", "Data Structures & Algorithms")
    2. Prior Experience (e.g. "Complete beginner", "Know the basics", "Intermediate", "Advanced")
    3. Daily study commitment (e.g. 0.5, 1.0, 2.0, 3.0 hours)
    4. Target timeframe (e.g. "2 weeks", "4 weeks", "8 weeks", "2 months")
    5. Main goal (e.g. "Build practical projects", "Exam preparation", "Career transition", "Master fundamentals")

    Already Known Information:
    {known_str}

    Recent Conversation History:
    {formatted_history}

    Latest User Message:
    "{message}"

    Guidelines:
    - If the user provides multiple details in one message, extract ALL of them immediately.
    - DO NOT ask redundant questions for information already provided.
    - If key information is missing, ask ONLY 1 friendly, focused question.
    - Provide 3-4 short, clickable suggested replies/chips.
    - When you have the Topic, Experience Level, Daily Hours, and Timeframe:
      Set ready_to_generate = True.
      Make your reply enthusiastic and confirm what is being built.
    - If the user asks to adapt, change pace, or make it more project-focused before generating, update the extracted parameters accordingly.
    """

    turn = generate_structured_response(
        prompt=prompt,
        response_schema=ConversationTurn,
        temperature=0.3,
    )

    # Update collected information
    if turn.extracted_topic:
        collected["topic"] = turn.extracted_topic

    if turn.extracted_timeframe:
        collected["timeframe"] = turn.extracted_timeframe

    if turn.extracted_daily_hours is not None:
        collected["daily_hours"] = turn.extracted_daily_hours

    if turn.extracted_experience_level:
        collected["experience_level"] = (
            turn.extracted_experience_level
        )

    if turn.extracted_goal:
        collected["goal"] = turn.extracted_goal

    # Check whether all essential information is available
    has_essentials = bool(
        collected.get("topic")
        and collected.get("timeframe")
        and collected.get("daily_hours") is not None
        and collected.get("experience_level")
    )

    is_ready = turn.ready_to_generate or has_essentials
    generated_plan = None

    if is_ready:
        topic = collected.get("topic") or message
        timeframe = collected.get("timeframe") or "4 Weeks"

        daily_hours = float(
            collected.get("daily_hours")
            if collected.get("daily_hours") is not None
            else 1.5
        )

        experience = (
            collected.get("experience_level") or "Beginner"
        )

        goal = collected.get("goal")

        generated_plan = generate_plan(
            topic=topic,
            timeframe=timeframe,
            daily_hours=daily_hours,
            experience_level=experience,
            goal=goal,
        )

    return {
        "reply": turn.reply,
        "suggested_replies": (
            turn.suggested_replies if not is_ready else []
        ),
        "ready_to_generate": is_ready,
        "collected_info": collected,
        "plan": (
            generated_plan.model_dump()
            if generated_plan else None
        ),
    }


def answer_study_question(
    message: str,
    history: List[ChatMessage],
    current_plan: Optional[Dict[str, Any]] = None,
) -> str:
    """Answer study questions using Groq, with optional study-plan context."""

    api_key = os.getenv("GROQ_API_KEY")

    if not api_key:
        raise ValueError("GROQ_API_KEY is not configured.")

    model = os.getenv("GROQ_MODEL", "openai/gpt-oss-20b")

    client = Groq(api_key=api_key)

    plan_context = "No study plan has been provided."

    if current_plan:
        plan_context = json.dumps(
            current_plan,
            ensure_ascii=False,
            default=str,
        )[:12000]

    system_prompt = f"""
You are CuratePlan's AI Study Assistant.

Your job is to help students understand concepts, solve doubts,
learn programming, debug code, prepare for exams, and explore
topics beyond their current study plan.

CURRENT STUDY PLAN:
{plan_context}

TEACHING STYLE — ADAPTIVE:

1. For simple factual questions, answer directly and concisely.
2. For difficult concepts, explain step by step using simple language.
3. Use practical examples and analogies when they improve understanding.
4. For programming questions, explain the approach, provide code,
   and explain important lines.
5. When a student is solving a problem, guide them with hints
   rather than immediately revealing the full solution when appropriate.
6. For exam preparation, structure answers in a clear,
   exam-friendly format when requested.
7. If a question relates to the current study plan, connect your
   explanation to the relevant topic or learning stage.
8. If a question is unrelated to the study plan, answer it normally.
9. Never pretend that information is in the study plan if it is not.
10. If you are unsure, be transparent instead of inventing facts.

Be friendly, clear, encouraging, and avoid unnecessary verbosity.
Use Markdown formatting for readability.
"""

    messages = [
        {
            "role": "system",
            "content": system_prompt,
        }
    ]

    # Include recent conversation context.
    for item in history[-10:]:
        if item.role not in ("user", "assistant"):
            continue

        if not item.content.strip():
            continue

        messages.append({
            "role": item.role,
            "content": item.content,
        })

    messages.append({
        "role": "user",
        "content": message,
    })

    completion = client.chat.completions.create(
        model=model,
        messages=messages,
        max_completion_tokens=1200,
        include_reasoning=False,
    )

    reply = completion.choices[0].message.content

    if not reply:
        raise RuntimeError("Groq returned an empty response.")

    return reply.strip()

