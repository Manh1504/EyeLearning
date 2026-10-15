# GazeEdu Frontend

Ung dung Next.js 16 App Router chinh cua GazeEdu, su dung giao dien redesign.

## Chay local

```bash
npm install
npm run dev
# http://localhost:3000
```

Bien moi truong duoc doc tu `.env.local`:

```env
NEXT_PUBLIC_API_URL=https://server.nmhieu.online
NEXT_PUBLIC_GAZE_URL=http://localhost:8000
NEXT_PUBLIC_DEMO=0
```

Dat `NEXT_PUBLIC_DEMO=1` de xem cac man hinh voi du lieu demo ma khong can
backend. Che do nay chi dung cho phat trien va trinh dien.

## Lenh

| Lenh | Mo ta |
|---|---|
| `npm run dev` | Chay development server tai port 3000 |
| `npm run build` | Tao production build |
| `npm run start` | Chay production server tai port 3000 |
| `npm run lint` | Kiem tra ESLint |
| `npm run typecheck` | Kiem tra TypeScript |
| `npm test` | Chay unit test bang Vitest |
| `npm run test:e2e` | Chay Playwright E2E |
| `npm run test:e2e:demo` | Chay Playwright E2E trong demo mode |

## Cau truc

```text
app/                    # Routes va layouts
components/
  account/              # Dang nhap
  admin/                # Phan cong va cau hinh calibration
  calibration/          # Calibration dung chung
  layout/               # App shell, sidebar, topbar
  quiz/                 # Assignment prototype
  student/              # Dashboard, preflight, learning reader
  teacher/              # Danh sach khoa hoc, workspace, heatmap
  ui/                   # Radix UI primitives
hooks/                  # TanStack Query, gaze va calibration hooks
lib/                    # API client, types, constants va utilities
tests/                  # Vitest unit tests
e2e/                    # Playwright tests
```

## Routes chinh

| Route | Khu vuc |
|---|---|
| `/` | Landing page |
| `/account/login` | Dang nhap |
| `/student` | Trang chu hoc vien |
| `/student/courses/[courseId]` | Learning reader |
| `/teacher` | Danh sach khoa hoc |
| `/teacher/courses/[courseId]` | Course workspace |
| `/admin` | Quan tri va phan cong |
| `/try` | Trai nghiem khach |
| `/demo` | Danh sach man hinh demo |

Nhung URL cu `/student/my-courses`, `/teacher/courses` va `/admin/courses`
duoc redirect sang route moi tuong ung.
