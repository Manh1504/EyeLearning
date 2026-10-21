BEGIN;

-- Phiên chat của sinh viên với trợ lý học tập. Mỗi phiên gắn với một môn
-- (course_id) và tùy chọn bài học đang học / bài tập đang chữa.
--
-- Bảng này là NGUỒN SỰ THẬT cho lịch sử hiển thị ở frontend. Chatbot (LangGraph)
-- vẫn giữ bộ nhớ hội thoại riêng, nhưng định danh bằng `thread_id` = chat_sessions.id
-- nên hai bên luôn khớp: xoá phiên là xoá luôn thread tương ứng.
CREATE TABLE IF NOT EXISTS chat_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    lesson_id UUID REFERENCES lessons(id) ON DELETE SET NULL,
    assignment_id UUID REFERENCES quiz_assignments(id) ON DELETE SET NULL,
    title VARCHAR(255) NOT NULL DEFAULT 'Phiên mới',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    archived_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_chat_sessions_student_course
    ON chat_sessions (student_id, course_id, updated_at DESC);

-- Từng lượt tin nhắn hiển thị cho sinh viên. `citations` là nguồn slide mà trợ
-- lý đã trích dẫn ở lượt trả lời ([] với lượt của sinh viên).
CREATE TABLE IF NOT EXISTS chat_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
    role VARCHAR(10) NOT NULL CHECK (role IN ('student', 'assistant')),
    content TEXT NOT NULL,
    citations JSONB NOT NULL DEFAULT '[]'::jsonb,
    intent VARCHAR(20),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT chat_messages_citations_array CHECK (jsonb_typeof(citations) = 'array')
);

CREATE INDEX IF NOT EXISTS idx_chat_messages_session
    ON chat_messages (session_id, created_at);

COMMIT;
