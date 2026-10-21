"""Chat học tập: dựng ngữ cảnh LMS, gọi chatbot và lưu phiên/tin nhắn.

Backend là nơi dựng ngữ cảnh (khóa > chương > bài > bài tập) và là **nguồn sự
thật** cho lịch sử hiển thị (`chat_sessions`/`chat_messages`). Chatbot LangGraph
giữ bộ nhớ hội thoại theo `thread_id` = id phiên, nên hai bên luôn khớp nhau:
xoá phiên là xoá luôn thread tương ứng.
"""

import logging
from datetime import datetime, timezone

import httpx
from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models.chat import ChatMessage, ChatSession
from app.models.course import Course, Lesson, Module
from app.models.quiz import QuizAssignment, QuizAttempt

logger = logging.getLogger(__name__)

# Độ dài tiêu đề phiên tự sinh từ câu hỏi đầu tiên.
TITLE_MAX = 60

# Trần ngữ cảnh bài tập gửi kèm (khớp giới hạn phía chatbot).
CONTEXT_MAX = 30000


def question_correct_ids(question: dict) -> list[str]:
    """Chuẩn hóa đáp án đúng: hỗ trợ cả dữ liệu cũ (correctOptionId) lẫn mới."""
    ids = question.get("correctOptionIds")
    if ids is None:
        single = question.get("correctOptionId")
        ids = [single] if single else []
    return [str(item) for item in ids]


def build_assignment_context(
    course: Course,
    module: Module | None,
    lesson: Lesson | None,
    assignment: QuizAssignment,
    attempt: QuizAttempt,
) -> str:
    """Chuỗi ngữ cảnh bài tập gửi kèm (kèm đáp án đúng + giải thích để chữa bài)."""
    lines = [
        f"Khóa học: {course.title}",
        f"Chương: {module.title}" if module is not None else "",
        f"Bài học: {lesson.title}" if lesson is not None else "",
        f"Bài tập: {assignment.title}",
    ]
    lines = [line for line in lines if line]
    if assignment.instructions.strip():
        lines.append(f"Hướng dẫn: {assignment.instructions.strip()}")
    for index, question in enumerate(assignment.questions, start=1):
        lines.append(f"Câu {index}: {question['prompt']}")
        for option in question["options"]:
            lines.append(f"- {option['id']}: {option['text']}")
        selected = attempt.answers.get(question["id"]) or []
        if isinstance(selected, str):
            selected = [selected]
        lines.append(f"Học viên chọn: {', '.join(selected) if selected else 'chưa trả lời'}")
        lines.append(f"Đáp án đúng: {', '.join(question_correct_ids(question))}")
        lines.append(f"Giải thích: {question['explanation']}")
    return "\n".join(lines)[:CONTEXT_MAX]


def _title_from(message: str) -> str:
    """Tiêu đề phiên lấy từ câu hỏi đầu tiên (cắt gọn theo từ)."""
    text = " ".join(message.split())
    if len(text) <= TITLE_MAX:
        return text or "Phiên mới"
    return text[: TITLE_MAX - 1].rstrip() + "…"


def _chatbot_ready() -> bool:
    return bool(settings.chatbot_url and settings.chatbot_internal_token)


async def _ask_chatbot(payload: dict) -> dict:
    async with httpx.AsyncClient(
        timeout=settings.chatbot_timeout_seconds,
        headers={"X-Chatbot-Token": settings.chatbot_internal_token},
    ) as client:
        response = await client.post(f"{settings.chatbot_url.rstrip('/')}/chat", json=payload)
        response.raise_for_status()
        return response.json()


async def purge_thread(thread_id: str) -> None:
    """Xoá bộ nhớ hội thoại của phiên bên chatbot (best-effort, không chặn xoá)."""
    if not _chatbot_ready():
        return
    url = f"{settings.chatbot_url.rstrip('/')}/threads/{thread_id}"
    try:
        async with httpx.AsyncClient(
            timeout=settings.chatbot_timeout_seconds,
            headers={"X-Chatbot-Token": settings.chatbot_internal_token},
        ) as client:
            await client.delete(url)
    except httpx.HTTPError:
        logger.warning("Không xoá được thread %s bên chatbot", thread_id, exc_info=True)


async def answer_in_session(
    db: AsyncSession,
    *,
    course: Course,
    session: ChatSession,
    message: str,
    lesson: Lesson | None,
    assignment: QuizAssignment | None,
    attempt: QuizAttempt | None,
) -> tuple[str, list[dict], str | None]:
    """Gọi chatbot cho một lượt hỏi rồi lưu cả câu hỏi lẫn câu trả lời.

    Chỉ gửi `assignment_context` (kèm đáp án đúng) khi đang chữa một bài tập đã
    nộp; chat kiến thức thường để trống nên không lộ đáp án.
    """
    if not _chatbot_ready():
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE, detail="Trợ lý học tập chưa được cấu hình"
        )

    module = await db.get(Module, lesson.module_id) if lesson is not None else None
    if assignment is not None and attempt is not None:
        context = build_assignment_context(course, module, lesson, assignment, attempt)
    else:
        context = ""

    payload = {
        "message": message,
        "course_id": course.id,
        "thread_id": session.id,
        "assignment_context": context,
        "support_mode": "review" if assignment is not None else "hint",
        "assignment_id": assignment.id if assignment is not None else None,
        "assignment_title": assignment.title if assignment is not None else "",
        "lesson_id": lesson.id if lesson is not None else None,
        "lesson_title": lesson.title if lesson is not None else "",
        "module_title": module.title if module is not None else "",
    }

    db.add(
        ChatMessage(
            session_id=session.id, role="student", content=message, citations=[], intent=None
        )
    )

    try:
        data = await _ask_chatbot(payload)
    except (httpx.HTTPError, ValueError):
        raise HTTPException(
            status.HTTP_502_BAD_GATEWAY, detail="Trợ lý học tập tạm thời không phản hồi"
        )

    answer = data.get("answer") or ""
    citations = data.get("citations") or []
    intent = data.get("intent")

    db.add(
        ChatMessage(
            session_id=session.id,
            role="assistant",
            content=answer,
            citations=citations,
            intent=intent,
        )
    )
    if session.title in ("", "Phiên mới"):
        session.title = _title_from(message)
    session.updated_at = datetime.now(timezone.utc)
    await db.commit()
    return answer, citations, intent
