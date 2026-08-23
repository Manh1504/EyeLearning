# GazeEdu — Frontend (Next.js 16 App Router)

## Chạy

```bash
npm install
npm run dev
# http://localhost:3000
```

## Cấu trúc

```
app/                  # Router — page mỏng, không chứa logic
  account/            # login, signup
  student/            # học viên: (dashboard) có navbar, (viewer) fullscreen
  teacher/            # giảng viên: (dashboard) có navbar, (viewer) fullscreen
components/
  ui/                 # primitives dùng chung (button, card, icon, ...)
  landing/            # landing page
  account/            # form đăng nhập / đăng ký
  student/            # my-courses, course-learning, student-shell
  teacher/            # courses-list, heatmap-viewer, teacher-shell
    workspace/        # course-workspace (shell) + overview/content/students tab
lib/
  types/domain.ts     # NGUỒN DUY NHẤT cho type domain (khớp schema DB)
  mock/               # dữ liệu giả (teacher, student)
  api/                # hàm API — HIỆN TRẢ MOCK, đây là nơi duy nhất cần sửa khi nối backend
hooks/                # TanStack Query hooks (use-teacher, use-student)
app/providers.tsx     # QueryClientProvider
```

## Nối backend (FastAPI) khi sẵn sàng

1. Copy `.env.example` → `.env.local`, đặt `NEXT_PUBLIC_API_URL` (mặc định `api.nmhieu.online`).
2. Sửa thân hàm trong `lib/api/*.ts` (đang trả mock từ `lib/mock/*`) sang `apiFetch(...)` với endpoint tương ứng — **giữ nguyên chữ ký hàm và type** để UI không phải đổi.
3. Type trong `lib/types/domain.ts` là contract duy nhất, bám theo `db/migrations/*.sql`.

## Quy ước

- Icons: dùng `@remixicon/react` (qua `components/ui/icon.tsx` với tên kiểu `ri-*`). Không dùng `<i className="ri-...">` trực tiếp.
- Mọi component dùng dữ liệu → gọi qua `hooks/use-*.ts` (đã bọc TanStack Query).
