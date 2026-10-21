# Kiểm thử bài tập và chatbot trước production

Không push/merge vào `main` trước khi hoàn tất checklist cuối tài liệu này. Workflow hiện tại tự build và gọi Portainer khi CI của `main` thành công.

## 1. Cấu hình local

Điền các biến sau vào `.env` (không commit file này):

```env
CHATBOT_URL=http://127.0.0.1:8002
CHATBOT_TIMEOUT_SECONDS=90
CHATBOT_INGEST_TIMEOUT_SECONDS=600
CHATBOT_INGEST_ATTEMPTS=3
CHATBOT_INGEST_BACKOFF_SECONDS=5
CHATBOT_INTERNAL_TOKEN=<chuoi-ngau-nhien-dai>
CHATBOT_DATABASE_URL=postgresql://postgres:<password>@localhost:5435/eyetracking
CHATBOT_DATABASE_URL_DOCKER=postgresql://postgres:<password>@postgres:5432/eyetracking

# Embedding local Qwen3-Embedding-0.6B (1024 chiều, chạy GPU). Deps + torch cu124
# đã có trong base image dùng chung (docker/ai-base) của image chatbot; weights
# tải về volume /app/weights lúc khởi động.
EMBEDDING_NAME=local
EMBEDDING_DIM=1024
EMBEDDING_MODEL_PATH=/app/weights/Qwen3-Embedding-0.6B
EMBEDDING_DEVICE=cuda
# ---------- LLM + VLM: River AI (OpenAI-compatible, không tốn VRAM local) ----------
LLM_NAME=river
VLM_NAME=river
RIVER_API_KEY=<key>
RIVER_BASE_URL=https://api.river.ai/v1
RIVER_LLM_MODEL=deepseek-ai/DeepSeek-V4.1-Flash-1017
RIVER_VLM_MODEL=deepseek-ai/DeepSeek-V4.1-Flash-1017
RAG_SCORE_THRESHOLD=0.3
```

Chú ý về LLM/VLM: cả LLM (sinh câu trả lời) và VLM (mô tả slide lúc ingest) đều chạy qua **River AI** — API OpenAI-compatible, **không tốn VRAM local**, **không cần service `ollama`**. Bắt buộc có `RIVER_API_KEY`. Embedding chạy local trong image chatbot.

Chú ý khác: `RAG_SCORE_THRESHOLD` phải đủ thấp (mặc định `0.3`). Nếu đặt quá cao (ví dụ `0.7`), retrieval sẽ rỗng nên chatbot không có tài liệu và dễ trả lời sai, thiếu citation.

Khi chạy chatbot trực tiếp ngoài Docker, dùng `CHATBOT_DATABASE_URL` và đặt `DATABASE_URL` cho tiến trình chatbot (chatbot đọc `DATABASE_URL`): `$env:DATABASE_URL = $env:CHATBOT_DATABASE_URL`.

```powershell
docker compose up -d postgres redis
docker compose run --rm --build migrate
```

Migration `011_quiz_and_embeddings.sql` tạo bảng vector; `012_embedding_index.sql` đặt cột về 1024 chiều (Qwen3-Embedding-0.6B) và tạo **index HNSW cosine** cho pgvector (`EMBEDDING_DIM=1024`). Đổi sang model embedding số chiều khác phải viết migration đổi cột tương ứng và re-ingest toàn bộ slide — nếu không chatbot fail-fast lúc khởi động (dim lệch cột vector).

## 2. Chạy service

Chạy chatbot local:

```powershell
Set-Location services\chatbot
python -m venv .venv
# Embedding local cần thêm stack torch/sentence-transformers (requirements-embedding.txt).
.\.venv\Scripts\python.exe -m pip install -r requirements.txt -r requirements-embedding.txt
.\.venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8002
```

Chạy backend và frontend ở hai terminal khác:

```powershell
Set-Location backend
python -m uvicorn app.main:app --host 127.0.0.1 --port 8001 --reload
```

```powershell
Set-Location frontend
npm.cmd ci
npm.cmd run dev
```

Nếu dùng toàn bộ Docker stack, đặt `CHATBOT_URL=http://chatbot:8000` cho backend và chạy:

```powershell
docker compose up -d --build postgres migrate redis chatbot backend frontend
```

Lần đầu chatbot tải weights embedding (~vài trăm MB) vào volume `chatbot-weights`; theo dõi bằng `docker compose logs -f chatbot`. Service one-shot `ingest-bootstrap` sau đó tự chạy ingest lần đầu nếu chưa có vector.

Lưu ý image cũ: `docker-compose.yml` đặt `pull_policy: always` cho chatbot (đúng cho production). Ở local, `docker-compose.override.yml` đã hạ xuống `pull_policy: missing` để `--build` dùng bản build tại chỗ thay vì bị image GHCR cũ ghi đè. Nếu vẫn nghi ngờ, rebuild tường minh:

```powershell
docker compose build --no-cache chatbot
docker compose up -d --force-recreate chatbot ingest-bootstrap
```

## 3. Test embedding & VLM

Kiểm tra nhanh VLM River AI (OpenAI-compatible):

```powershell
$body = @{
  model = $env:RIVER_VLM_MODEL
  messages = @(@{ role = "user"; content = "Say hello in one short sentence." })
  max_tokens = 64
} | ConvertTo-Json -Depth 6

Invoke-RestMethod -Method Post `
  -Uri "$env:RIVER_BASE_URL/chat/completions" `
  -Headers @{ Authorization = "Bearer $env:RIVER_API_KEY" } `
  -ContentType "application/json" `
  -Body $body
```

Embedding local (`EMBEDDING_NAME=local`) chạy trong tiến trình chatbot; kiểm tra gián tiếp qua ingest slide bên dưới — vector phải có đúng **1024 chiều** (khớp `EMBEDDING_DIM` và cột `vector(1024)`).

Upload một PDF từ màn giáo viên. Backend tự gọi `/ingest/slide` (kèm header `X-Chatbot-Token`) trong background và cập nhật `lesson_contents.embedding_status` (`pending` → `ready`/`failed`).

**Ảnh slide lấy từ đâu:** backend render PDF thành JPEG rồi lưu vào
`lesson_contents.image_url` qua `media_storage`:

- `R2_*` đầy đủ (`r2_enabled`) → **object storage Cloudflare R2**, URL dạng
  `https://<R2_PUBLIC_URL>/lessons/{lesson_id}/{version}/slide_00N.jpg`.
- Ngược lại → **volume local** (`backend-media:/app/media`), URL dạng
  `/media/lessons/{lesson_id}/{version}/slide_00N.jpg`.

Chatbot đọc lại bằng `FileStorage`: `/media/...` + `STORAGE_PROVIDER=local` → strip
`/media/` rồi join `LOCAL_MEDIA_DIR` (compose mount `backend-media:/app/media:ro`);
URL `https://` phải thuộc `STORAGE_HTTP_ALLOWED_HOSTS` (host của `R2_PUBLIC_URL` được
thêm tự động). **Không có ảnh nào lưu base64** — base64 chỉ là dạng tạm trong RAM khi
gửi ảnh cho VLM (ảnh PNG render ở native pixel; PDF nguồn render ở 150 dpi).

Backfill / reindex slide cũ (bắt buộc sau khi bật tính năng hoặc đổi model embedding).

Cách 0 — **tự động khi khởi động stack (khuyến nghị)**: service one-shot `ingest-bootstrap` trong `docker-compose.yml` chạy sau khi backend + chatbot `healthy`. Nó đọc `GET /internal/embeddings/status`:
- Nếu **chưa có vector** (`vectors == 0`) và **đã có slide** (`slides > 0`) → gọi `POST /internal/embeddings/reindex-all` để ingest toàn bộ slide hiện có.
- Nếu **đã có vector** → bỏ qua (log "Đã có vector — bỏ qua ingest lần đầu").

Nhờ vậy chỉ cần tạo container là hệ thống tự bật RAG cho dữ liệu sẵn có. Extension `vector` do migration `009` tạo, bảng `lesson_content_embedding` do `011`, index HNSW do `012` — không phải bootstrap. Lưu ý: `012` **xoá toàn bộ** embedding cũ khi đổi số chiều (4096 → 1024), nên sau lần deploy đầu tiên có `012` thì `vectors` sẽ về 0 và phải re-ingest (xem cách 0/1 bên dưới).

Cách 1 — pipeline tự động (tùy chọn, không cần SSH): sau deploy backend gọi endpoint nội bộ xác thực bằng `CHATBOT_INTERNAL_TOKEN`. Cần đặt trong GitHub repo:
- `vars.CHATBOT_API_URL` = URL backend công khai (vd `https://api.eyelearning.id.vn`)
- `secrets.CHATBOT_INTERNAL_TOKEN` = cùng giá trị `CHATBOT_INTERNAL_TOKEN` của stack

Pipeline sẽ chạy:
```bash
curl -X POST "$CHATBOT_API_URL/internal/embeddings/reindex-all" -H "X-Chatbot-Token: $CHATBOT_INTERNAL_TOKEN"
curl "$CHATBOT_API_URL/internal/embeddings/status" -H "X-Chatbot-Token: $CHATBOT_INTERNAL_TOKEN"
```
Nếu chưa đặt biến, pipeline bỏ qua (không fail).

Cách 2 — thủ công qua API (JWT giáo viên/admin):
```powershell
Invoke-RestMethod -Method Post -Uri "https://<domain>/api/teacher/courses/<courseId>/reindex" -Headers @{ Authorization = "Bearer <teacherAccessToken>" }
Invoke-RestMethod -Method Post -Uri "https://<domain>/api/teacher/lessons/<lessonId>/reindex" -Headers @{ Authorization = "Bearer <teacherAccessToken>" }
```

Kiểm tra trạng thái và coverage:

```sql
SELECT c.id, COUNT(lc.id) AS slides, COUNT(e.lesson_content_id) AS embedded
FROM courses c
JOIN modules m ON m.course_id = c.id
JOIN lessons l ON l.module_id = m.id
JOIN lesson_contents lc ON lc.lesson_id = l.id
LEFT JOIN lesson_content_embedding e ON e.lesson_content_id = lc.id
GROUP BY c.id;
```

`embedded` phải bằng `slides` trước khi test citation.

**Phạm vi truy hồi:** backend gửi kèm `lesson_id` (bài học chứa bài tập) mỗi khi
gọi `/chat`, nên slide của **đúng bài đang học** được ưu tiên trong citation.
Nếu bài đó chưa có slide nào vượt `RAG_SCORE_THRESHOLD`, retriever tự nới ra toàn
khóa học để câu trả lời không rỗng — vì vậy citation vẫn có thể thuộc bài khác khi
bài hiện tại chưa được embed.

Trạng thái embedding từng slide:

```sql
SELECT embedding_status, count(*) FROM lesson_contents GROUP BY embedding_status;
SELECT id, image_url, embedding_error FROM lesson_contents WHERE embedding_status = 'failed';
```

Slide `failed` thường do ảnh không đọc được (URL sai, file thiếu, host bị chặn). Sửa nguyên nhân rồi gọi lại `reindex`.

### 3.1 Nguồn sự thật & đối chiếu lệch

`lesson_contents.embedding_status` **do backend ghi** và là nguồn sự thật duy nhất
(chatbot chỉ đọc bảng nghiệp vụ, chỉ ghi `lesson_content_embedding`). Hai chỗ có thể
lệch nếu vector bị ghi/xoá trực tiếp hoặc DB khôi phục không đồng bộ:

- Slide `ready` nhưng **không có** dòng vector → chatbot không truy hồi được.
- Có dòng vector nhưng slide **không** `ready` → backend sẽ ingest lại (tạo lại vector).

`GET /internal/embeddings/status` trả thêm `drift` để phát hiện; cả hai phải bằng 0:

```json
{"counts": {"ready": 120, "failed": 1, "none": 3},
 "drift": {"ready_without_vector": 0, "vector_not_marked_ready": 0},
 "job": {"running": false, "processed": 121, "ready": 120, "failed": 1}}
```

Truy vấn tương đương bằng SQL:

```sql
-- Slide 'ready' nhưng thiếu vector
SELECT lc.id, lc.image_url
FROM lesson_contents lc
WHERE lc.embedding_status = 'ready'
  AND NOT EXISTS (SELECT 1 FROM lesson_content_embedding e WHERE e.lesson_content_id = lc.id);

-- Có vector nhưng chưa đánh dấu 'ready'
SELECT lc.id, lc.embedding_status
FROM lesson_content_embedding e
JOIN lesson_contents lc ON lc.id = e.lesson_content_id
WHERE lc.embedding_status <> 'ready';
```

Gặp lệch: gọi `POST /teacher/courses/{id}/reindex` (hoặc `/internal/embeddings/reindex-all`)
để đưa về trạng thái nhất quán.

### 3.2 Số chiều vector

`EMBEDDING_DIM` phải khớp `VECTOR(n)` của `lesson_content_embedding.embedding` (1024).
Chatbot kiểm tra lúc khởi động và **fail-fast** kèm hướng dẫn nếu lệch — không đợi
tới lần ingest đầu tiên mới báo lỗi.

## 4. Test chức năng

1. Đăng nhập giáo viên, mở khóa học (`/teacher/courses/{id}`) và soạn một bài tập
   (`kind='quiz'`) đã `published` cho khóa học có học viên.
2. Đăng nhập học viên, mở khóa học trong reader (`/student/courses/{id}?lesson=<lesson-quiz-id>`).
3. Kiểm tra `GET /api/assignments/{id}` **không** chứa đáp án đúng trước khi nộp, và
   **không có** nút "Trợ lý học tập" trên trang bài tập.
4. Nộp bài. Kiểm tra điểm được chấm đúng, trang kết quả hiện đáp án/giải thích — và
   **lúc này mới** hiện "Trợ lý học tập".
5. Mở "Trợ lý học tập" ở trang **đọc slide** (không cần nộp bài) và hỏi một câu kiến
   thức: câu trả lời bám tài liệu, citation mở đúng slide (ưu tiên slide của bài học
   đang học — xem mục 3). Kiểm tra phiên được **lưu lại** (thu gọn rồi mở lại vẫn còn
   lịch sử; "Chat mới", đổi tên và xoá phiên đều hoạt động).
6. Gọi `POST /api/courses/{id}/chat` kèm `assignmentId` **trước khi nộp** phải trả
   `403` ("Hãy nộp bài trước khi dùng trợ lý học tập").
7. Bật công tắc "Cho phép học viên làm lại" ở **đầu phần soạn bài tập** (bật là lưu
   ngay), rồi bấm "Làm lại" ở trang kết quả của học viên: kết quả cũ bị xoá, đồng hồ
   làm bài chạy lại, đáp án + trợ lý học tập ẩn lại cho tới lần nộp kế tiếp.
8. Thử nộp lần hai khi giáo viên **chưa** bật làm lại, dùng học viên ngoài khóa học
   và bài quá hạn; API phải từ chối.

Các lệnh kiểm tra code:

```powershell
Set-Location backend
python -m pytest tests/test_assignments.py tests/test_chat.py -vv

Set-Location ..\services\chatbot
python -m pytest -q

Set-Location ..\frontend
npm.cmd run lint
npm.cmd run typecheck
npm.cmd test -- --run
npm.cmd run build
```

## 5. Checklist production

- Chọn LLM đạt kiểm thử chất lượng. `qwen3.5:2b` chỉ dùng smoke test và đã cho câu trả lời sai/lộ đáp án, không được dùng production. Cấu hình production hiện dùng River AI (`deepseek-ai/DeepSeek-V4.1-Flash-1017`) cho cả LLM và VLM.
- Sau khi deploy lần đầu (hoặc đổi model embedding), việc backfill đã **tự chạy** nhờ service `ingest-bootstrap` (và có thể chạy tay `POST /teacher/courses/{id}/reindex` cho mọi khóa); theo dõi `embedding_status='failed'`.
- VLM chạy qua **River AI API** (`RIVER_API_KEY`/`RIVER_BASE_URL`/`RIVER_VLM_MODEL`) — không tốn VRAM local, không cần service `ollama`. Chatbot (embedding local) vẫn cần GPU (`gpus: all`). Máy cần NVIDIA driver + nvidia-container-toolkit.
- Dùng cùng embedding model/dimension 1024 (Qwen3-Embedding-0.6B) ở ingest và retrieval; dimension phải khớp `VECTOR(1024)` của migration 012.
- Giữ `RAG_SCORE_THRESHOLD` thấp (0.3). Ngưỡng cao làm retrieval rỗng, chatbot trả lời sai và không có citation.
- Đặt `CHATBOT_INTERNAL_TOKEN` khác rỗng và giống nhau giữa backend và chatbot; chatbot từ chối mọi request thiếu/sai token.
- Đảm bảo R2 có thể được chatbot đọc; local media volume chỉ phù hợp single-host Docker.
- Chạy migration và backup DB trước deploy.
- Chạy ingest, xác nhận coverage vector và citation trên dữ liệu staging.
- Load test timeout/concurrency; một câu RAG có thể gọi LLM nhiều lần.
- Không expose port chatbot ra Internet. Frontend chỉ gọi backend gateway có JWT/enrollment check.
- Kiểm tra secret provider chỉ nằm trong Portainer/GitHub secrets, không nằm trong Git.
- Chỉ sau khi toàn bộ mục trên pass mới merge/push `main` để pipeline production chạy.
