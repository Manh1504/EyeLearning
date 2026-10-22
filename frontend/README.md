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
  layout/               # App shell, topbar (nav + user), sidebar drawer mobile
  quiz/                 # Bài tập trắc nghiệm: soạn, làm bài, chữa bài, chatbot
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
| `/student/courses/[courseId]` | Learning reader (bài học slide hoặc bài tập trắc nghiệm) |
| `/teacher` | Danh sach khoa hoc |
| `/teacher/courses/[courseId]` | Course workspace |
| `/admin` | Quan tri va phan cong |
| `/try` | Trai nghiem khach |
| `/demo` | Danh sach man hinh demo |

Nhung URL cu `/student/my-courses`, `/teacher/courses` va `/admin/courses`
duoc redirect sang route moi tuong ung.

## Bài tập trắc nghiệm

Bài tập là một **item trong chương**, cùng cấp với bài học slide:

- Dữ liệu: `lessons.kind` = `lesson` (slide) hoặc `quiz`; item `quiz` có đúng một
  `quiz_assignments` (1:1) chứa câu hỏi, thời lượng, hạn nộp (tùy chọn).
- Giáo viên soạn ngay trong workspace khóa học (tab **Nội dung**) qua nút
  "Thêm trắc nghiệm"; câu hỏi hỗ trợ một hoặc nhiều đáp án đúng (chấm tất cả-hoặc-không).
- Học viên gặp bài tập như một bước trong learning reader; làm bài, được chấm và có
  nút "Bài tiếp theo" ngay trong luồng học. Bài tập **cũng ghi dữ liệu gaze** (toạ độ
  theo viewport, `gaze_events.surface = 'quiz'`, không có slide/heatmap).
- **Làm lại**: giáo viên bật công tắc **Cho phép học viên làm lại** ngay đầu phần
  soạn bài tập (bật là lưu ngay, không cần bấm Lưu); học viên thấy nút **Làm lại** ở
  trang kết quả → xoá lượt làm cũ, đồng hồ chạy lại, đáp án ẩn lại cho tới khi nộp
  lần mới (mỗi học viên vẫn chỉ giữ 1 lượt).
- **Trợ lý học tập** (`components/assistant/study-assistant-chat.tsx`) là widget nổi ở
  trang **đọc slide** và (sau khi nộp) ở trang **bài tập**. Chat theo **môn**, ưu tiên
  truy hồi slide của bài đang học; hỗ trợ **nhiều phiên chat** (Chat mới, lịch sử, đổi
  tên, xoá) lưu ở backend. Chat trong bài tập chỉ mở **sau khi nộp** (backend trả 403
  nếu chưa nộp) nên trợ lý không thể tiết lộ đáp án trước khi học viên làm bài.

## Workspace soạn nội dung của giáo viên

`/teacher/courses/{courseId}` có **4 tab** (`?tab=`, xem
`components/teacher/course-workspace.tsx`):

| Tab | Nội dung |
|---|---|
| **Nội dung** | Soạn chương/bài giảng/bài tập (mặc định) |
| **Thông tin khóa học** | Tên, mô tả, xuất bản / thu hồi / lưu trữ, xoá khóa học |
| **Cài đặt** | Thiết lập ít dùng áp cho cả khóa (hiện có "Hiển thị điểm nhìn cho sinh viên") |
| **Học viên** | Ghi danh, danh sách, drawer heatmap từng học viên |

Tab **Nội dung** là **master–detail**: mục lục bên trái (`content-outline.tsx` — chương,
bài giảng, bài tập, badge trạng thái thiếu/đủ nội dung, dòng đang chọn có viền đậm) và
trình soạn bên phải (`item-editor.tsx` → `lesson-editor.tsx` hoặc
`lesson-quiz-editor.tsx`). Không còn accordion lồng nhau; màn hình nhỏ thì mục lục thu
gọn sau nút **Mục lục** nhưng thanh trên vẫn hiện tên mục đang sửa.

- Thêm mục: nút có chữ **Thêm bài giảng** / **Thêm trắc nghiệm** trong từng chương; mục
  mới được tạo ở dạng nháp rồi **mở ngay** để giáo viên nhập tiếp.
- Đổi tên / xoá nằm trong menu phụ **Thao tác** của mỗi mục (kèm link **Xem heatmap**
  cho bài giảng). Tên bài giảng sửa trực tiếp ở tiêu đề trình soạn (lưu khi rời ô /
  Enter); tên bài tập sửa ở ô **Tên bài tập** trong phần soạn câu hỏi.

### Lưu và xuất bản

| Thao tác | Lưu khi nào |
|---|---|
| Tên/mô tả khóa học, trạng thái | bấm **Lưu thay đổi** / **Xuất bản khóa học** (tab Thông tin khóa học) |
| Công tắc điểm nhìn (cấp khóa) | bấm là lưu ngay |
| Tên chương | Enter/rời ô trong menu **Đổi tên chương** |
| Tên bài giảng | Enter/rời ô ở tiêu đề trình soạn |
| Tải PDF | chọn file là tải ngay; **bài đã có slide phải xác nhận** (thay PDF xoá toàn bộ slide + AOI cũ, và bị từ chối nếu bài đã có dữ liệu điểm nhìn) |
| Bài tập trắc nghiệm (câu hỏi, thời lượng, hạn, hướng dẫn) | **Lưu bài tập nháp** / **Giao bài cho học viên** |
| Cho phép làm lại | bấm là lưu ngay |

- **Lưu nháp không bắt câu hỏi hoàn thiện**: câu còn dở vẫn nằm trên màn hình và được
  đánh dấu, nhưng do schema `PATCH /api/assignments/{id}` từ chối lựa chọn rỗng nên
  **chỉ những câu hợp lệ được gửi lên** (thông báo ghi rõ "N câu chưa hoàn thiện…").
  Chỉ **Giao bài cho học viên** mới bắt buộc mọi câu hợp lệ.
- Ràng buộc câu hỏi tập trung ở `lib/quiz-validation.ts` (khớp `schemas/quiz.py`), dùng
  chung cho việc báo lỗi tại chỗ và luồng lưu nháp; có unit test ở
  `tests/quiz-validation.test.ts`.
- Trước khi xuất bản, **Kiểm tra nội dung** (tab Nội dung) hoặc danh sách ngay trong tab
  Thông tin khóa học liệt kê mục còn thiếu; vấn đề bắt buộc giữ nguyên quy tắc cũ
  (cần tên + có chương + có ít nhất một mục), phần còn lại chỉ là cảnh báo.
- Đổi mục/tab/rời trang khi còn dữ liệu chưa lưu → hộp thoại
  **Còn thay đổi chưa lưu** (Ở lại / Bỏ thay đổi / Lưu & tiếp tục), xem
  `components/teacher/unsaved-guard.tsx`.

## Sắp xếp nội dung chương (kéo thả)

Trong tab **Nội dung**, mỗi dòng bài học/bài tập có **tay kéo** ở đầu dòng
(`components/teacher/content-editor/sortable-row.tsx`, dùng `@dnd-kit`):

- Kéo thả đổi thứ tự item **trong cùng một chương**; bài học và bài tập dùng chung
  `lessons.order_index` nên trộn lẫn nhau được.
- Thao tác bằng bàn phím: nhấn `Space` để nhặt, `↑`/`↓` để di chuyển, `Space` để thả,
  `Esc` để huỷ (có thông báo qua `aria-live`).
- Thứ tự được cập nhật lạc quan (hiện ngay), rồi gửi
  `POST /teacher/modules/{id}/items/reorder` với **toàn bộ** danh sách item của chương;
  lỗi thì khôi phục thứ tự cũ và báo đỏ.
