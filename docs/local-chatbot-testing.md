# Kiểm thử bài tập và chatbot trước production

Không push/merge vào `main` trước khi hoàn tất checklist cuối tài liệu này. Workflow hiện tại tự build và gọi Portainer khi CI của `main` thành công.

## 1. Cấu hình local

Điền các biến sau vào `.env` (không commit file này):

```env
CHATBOT_URL=http://127.0.0.1:8002
CHATBOT_TIMEOUT_SECONDS=90
CHATBOT_INGEST_TIMEOUT_SECONDS=600
CHATBOT_INTERNAL_TOKEN=<chuoi-ngau-nhien-dai>
CHATBOT_DATABASE_URL=postgresql://postgres:<password>@localhost:5435/eyetracking
CHATBOT_DATABASE_URL_DOCKER=postgresql://postgres:<password>@postgres:5432/eyetracking

LLM_NAME=gemini
GEMINI_API_KEY=<key>
GEMINI_LLM_MODEL=gemini-flash-lite-latest
GEMINI_TIMEOUT=45

EMBEDDING_NAME=api
EMBEDDING_MODEL=qwen3-embedding:8b-ctx16k
EMBEDDING_DIM=4096
OLLAMA_API_URL=<endpoint-embed-day-du>/api/embed
OLLAMA_SECKEY=<secret>
VLM_NAME=local
OLLAMA_VLM_MODEL=qwen3-vl:8b-instruct
RAG_SCORE_THRESHOLD=0.3
```

Chú ý: `RAG_SCORE_THRESHOLD` phải đủ thấp (mặc định `0.3`). Nếu đặt quá cao (ví dụ `0.7`), retrieval sẽ rỗng nên chatbot không có tài liệu và dễ trả lời sai, thiếu citation.

Khi chạy chatbot trực tiếp ngoài Docker, dùng `CHATBOT_DATABASE_URL` và đặt `DATABASE_URL` cho tiến trình chatbot (chatbot đọc `DATABASE_URL`): `$env:DATABASE_URL = $env:CHATBOT_DATABASE_URL`.

```powershell
ollama pull qwen3-vl:8b-instruct
docker compose up -d postgres redis
docker compose run --rm --build migrate
```

Migration `011_quiz_and_embeddings.sql` cố định vector ở 4096 chiều (`qwen3-embedding:8b-ctx16k`). Không đổi embedding model sang model có dimension khác nếu chưa có migration rebuild bảng và re-ingest toàn bộ slide. Vì 4096 > 2000, pgvector không dùng được HNSW/IVFFlat cho `vector`; bảng dùng quét tuần tự (đủ nhanh ở quy mô slide của một khóa học).

## 2. Chạy service

Chạy chatbot local:

```powershell
Set-Location services\chatbot
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.docker.txt
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

## 3. Test embedding

Test provider trực tiếp:

```powershell
$body = @{
  model = "qwen3-embedding:8b-ctx16k"
  input = @("Python dùng def để khai báo hàm", "Cách định nghĩa hàm Python")
} | ConvertTo-Json

$result = Invoke-RestMethod -Method Post `
  -Uri $env:OLLAMA_API_URL `
  -Headers @{ "x-ollama-seckey" = $env:OLLAMA_SECKEY } `
  -ContentType "application/json" `
  -Body $body

$result.embeddings.Count
$result.embeddings[0].Count
```

Kết quả bắt buộc là 2 vector và mỗi vector có 4096 phần tử.

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

Cách 1 — pipeline tự động (không cần SSH): sau deploy backend gọi endpoint nội bộ xác thực bằng `CHATBOT_INTERNAL_TOKEN`. Cần đặt trong GitHub repo:
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

`EMBEDDING_DIM` phải khớp `VECTOR(n)` của `lesson_content_embedding.embedding` (4096).
Chatbot kiểm tra lúc khởi động và **fail-fast** kèm hướng dẫn nếu lệch — không đợi
tới lần ingest đầu tiên mới báo lỗi.

## 4. Test chức năng

1. Đăng nhập giáo viên, mở `/teacher/assignments`, tạo một bài `published` cho khóa học có học viên.
2. Đăng nhập học viên, mở `/student/assignments`; xác nhận bài vừa tạo xuất hiện.
3. Mở bài và kiểm tra response `GET /api/assignments/{id}` không chứa đáp án đúng trước khi nộp.
4. Hỏi chatbot. Kiểm tra trạng thái chờ, câu trả lời và link citation mở đúng slide.
5. Nộp bài. Kiểm tra điểm được chấm đúng, trang kết quả hiện đáp án/giải thích và chatbot hỗ trợ chữa câu sai.
6. Thử nộp lần hai, dùng học viên ngoài khóa học và bài quá hạn; API phải từ chối.

Các lệnh kiểm tra code:

```powershell
Set-Location backend
python -m pytest tests/test_assignments.py -vv

Set-Location ..\services\chatbot
python -m pytest -q

Set-Location ..\frontend
npm.cmd run lint
npm.cmd run typecheck
npm.cmd test -- --run
npm.cmd run build
```

## 5. Checklist production

- Chọn LLM đạt kiểm thử chất lượng. `qwen3.5:2b` chỉ dùng smoke test và đã cho câu trả lời sai/lộ đáp án, không được dùng production. Cấu hình production hiện dùng Gemini (`gemini-flash-lite-latest`).
- Model Gemini phải nằm trong danh sách khả dụng của key (`GET /v1beta/models`). Model không tồn tại sẽ treo/timeout. `gemini-2.5-flash` đã ngừng cấp cho key mới.
- Sau khi deploy lần đầu (hoặc đổi model embedding), chạy backfill `/teacher/courses/{id}/reindex` cho mọi khóa; theo dõi `embedding_status='failed'`.
- Dùng cùng embedding model/dimension 4096 (`qwen3-embedding:8b-ctx16k`) ở ingest và retrieval; dimension phải khớp `VECTOR(4096)` của migration 011.
- Giữ `RAG_SCORE_THRESHOLD` thấp (0.3). Ngưỡng cao làm retrieval rỗng, chatbot trả lời sai và không có citation.
- Đặt `CHATBOT_INTERNAL_TOKEN` khác rỗng và giống nhau giữa backend và chatbot; chatbot từ chối mọi request thiếu/sai token.
- Đảm bảo R2 có thể được chatbot đọc; local media volume chỉ phù hợp single-host Docker.
- Chạy migration và backup DB trước deploy.
- Chạy ingest, xác nhận coverage vector và citation trên dữ liệu staging.
- Load test timeout/concurrency; một câu RAG có thể gọi LLM nhiều lần.
- Không expose port chatbot ra Internet. Frontend chỉ gọi backend gateway có JWT/enrollment check.
- Kiểm tra secret provider chỉ nằm trong Portainer/GitHub secrets, không nằm trong Git.
- Chỉ sau khi toàn bộ mục trên pass mới merge/push `main` để pipeline production chạy.
