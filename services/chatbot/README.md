# Chatbot service (RAG hỗ trợ học tập)

FastAPI bọc một graph LangGraph: phân loại intent → truy hồi pgvector → sinh câu
trả lời → kiểm duyệt (không "giải bài hộ"). Lịch sử hội thoại lưu trong
PostgreSQL nên ngữ cảnh còn sau khi restart.

## Endpoints

| Method | Path | Auth | Mục đích |
|---|---|---|---|
| GET | `/health` | – | Liveness, luôn 200 |
| GET | `/ready` | – | Readiness, 503 khi DB không truy cập được |
| POST | `/chat` | `X-Chatbot-Token` | Hỏi đáp, trả `{answer, citations, intent}` |
| POST | `/ingest/slide` | `X-Chatbot-Token` | Embed 1 slide vào pgvector |
| DELETE | `/threads/{thread_id}` | `X-Chatbot-Token` | Xoá bộ nhớ hội thoại của một phiên (khi sinh viên xoá phiên) |

## Ngữ cảnh gửi kèm (`POST /chat`)

Ngoài `message`/`thread_id`, backend gửi thêm ngữ cảnh LMS để trợ lý biết **học
viên đang hỏi trong môn/bài nào**:

| Trường | Ý nghĩa |
|---|---|
| `course_id` | Phạm vi khóa học được phép truy hồi |
| `lesson_id` | **Ưu tiên truy hồi slide của đúng bài học này** (nếu bài chưa có slide vượt ngưỡng thì tự nới ra toàn khóa học) |
| `assignment_id`, `assignment_title` | Bài tập đang chữa (chỉ khi đã nộp) |
| `module_title`, `lesson_title` | Nhãn chương/bài để LLM trả lời đúng ngữ cảnh |
| `assignment_context` | Nội dung câu hỏi, đáp án đã chọn, đáp án đúng, giải thích (rỗng với chat kiến thức) |
| `support_mode` | `hint` (gợi ý, không lộ đáp án) hoặc `review` (chữa bài) |

`POST /chat` được gọi qua backend (`/api/courses/{course_id}/chat`), với
`thread_id` = id phiên chat (`chat_sessions.id` — backend lưu lịch sử hiển thị ở
bảng này). Hỏi kiến thức trong môn (không kèm `assignment_id`) thì
`assignment_context` để trống nên không lộ đáp án; chỉ khi chữa một bài tập **đã
nộp** (backend trả 403 nếu chưa nộp) mới gửi kèm đáp án đúng + giải thích.

## Luồng xử lý (`/chat`)

```
router ─┬─ hints ─┐
        └─ qa ────┴─▶ retrieve ─▶ answer ─▶ [validate nếu hints | qa+assignment]
                                        └─ fail & hết lượt ─▶ sanitize ─▶ END
        fallback ─▶ answer ─▶ END
```

- **validate** chỉ chạy khi có nguy cơ lộ đáp án: intent `hints`, hoặc `qa` khi
  `assignment_context` không rỗng. Câu hỏi khái niệm thuần bỏ qua để tiết kiệm 1
  LLM call.
- **sanitize** thay bản nháp vi phạm bằng câu trả lời an toàn — guardrail không
  bao giờ trả đáp án/lời giải, kể cả khi hết lượt sinh lại (`MAX_ATTEMPTS = 2`).
- Nếu bước chấm lỗi (provider/parse), coi như **không đạt** (fail-closed) chứ
  không làm hỏng request.

## Cấu hình (biến môi trường)

| Biến | Mặc định | Ý nghĩa |
|---|---|---|
| `DATABASE_URL` | – | DSN psycopg (fallback `DATABASE_URL_DOCKER`) |
| `CHATBOT_INTERNAL_TOKEN` | – | Token nội bộ (bắt buộc) |
| `LLM_NAME` | `river` | LLM qua River AI (chỉ `river`) |
| `EMBEDDING_NAME` | `local` | Embedding (chỉ `local`) |
| `EMBEDDING_DIM` | `1024` | Phải khớp `vector(N)` của bảng embedding (migration 012) |
| `EMBEDDING_MODEL_PATH` | `app/workflow/weights/Qwen3-Embedding-0.6B` | Đường dẫn weights embedding local |
| `EMBEDDING_DEVICE` | `cuda` | `cuda` \| `cpu` — embedding local mặc định chạy GPU |
| `EMBEDDING_LOCAL_FILES_ONLY` | `true` | Chỉ đọc weights đã tải (không tự gọi mạng) |
| `EMBEDDING_HF_REPO` | `Qwen/Qwen3-Embedding-0.6B` | Repo HuggingFace để tải weights |
| `VLM_NAME` | `river` | VLM cho ingest slide (chỉ `river`) |
| `RIVER_API_KEY` | – | API key River AI (bắt buộc) |
| `RIVER_BASE_URL` | `https://api.river.ai/v1` | Endpoint OpenAI-compatible của River |
| `RIVER_LLM_MODEL` | `deepseek-ai/DeepSeek-V4.1-Flash-1017` | Model LLM gọi qua River AI |
| `RIVER_VLM_MODEL` | `deepseek-ai/DeepSeek-V4.1-Flash-1017` | Model VLM gọi qua River AI |
| `RAG_TOP_K` | `5` | Số slide truy hồi |
| `RAG_SCORE_THRESHOLD` | `0.3` | Ngưỡng cosine |
| `DB_POOL_MIN` / `DB_POOL_MAX` | `1` / `10` | Kích thước ConnectionPool |

`app/settings.py` cung cấp `validate()` để fail-fast lúc khởi động nếu cấu hình
thiếu/sai.

## Tải model theo cấu hình

`entrypoint.sh` gọi `scripts/prepare_models.py` — **chỉ tải đúng thứ được chọn**:

- `EMBEDDING_NAME=local` → tải weights `Qwen3-Embedding-0.6B` vào `EMBEDDING_MODEL_PATH`
  (volume `chatbot-weights`); chạy trên **GPU** bằng torch cu124 có sẵn trong base
  image dùng chung `docker/ai-base`.

LLM và VLM (**River AI**) đều gọi API → **không tải model local, không tốn VRAM**.
Thiếu weights embedding thì thoát để container restart.

## Kiến trúc mã

```
app/
├── main.py                 FastAPI, lifespan (pool + checkpointer + graph), /health, /ready, /chat, /threads
├── settings.py             đọc & validate biến môi trường
├── db.py                   ConnectionPool dùng chung (checkpointer + retriever + ingestion)
├── schemas.py              request/response của API
├── api/ingest.py           POST /ingest/slide (singleton Ingestion + job lock)
├── services/
│   ├── ingest.py           slide -> VLM -> embedding -> pgvector (mỗi slide độc lập)
│   └── storage.py          đọc file từ local/S3/R2/URL (chống SSRF)
└── workflow/
    ├── graph.py            graph chính
    ├── router.py           phân loại intent
    ├── state.py            GraphState
    ├── subgraph/           qa / hints / fallback + khung RAG chung (common.py)
    └── shared/             providers (LLM/embedding registry), prompts, retrieval, guardrails
```

## Chạy test (dev-only)

```bash
cd services/chatbot
pip install -r requirements.txt -r requirements-dev.txt
python -m pytest -q
```

Test không cần DB/LLM thật: các node được cắm fake (RunnableLambda / mock).
