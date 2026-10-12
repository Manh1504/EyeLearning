# Luồng hoạt động và tuần tự UML cho Backend EyeLearning

Tài liệu mô tả 54 REST operation do FastAPI chính sở hữu tại thời điểm khảo sát. Phạm vi loại trừ endpoint dựng sẵn của FastAPI và endpoint trong `API/server.py`.

Quy ước: các bước hỏi điều kiện kết thúc bằng dấu hỏi. Bước kế tiếp thể hiện nhánh Có; nhánh Không được ghi tại luồng rẽ nhánh.

## 1. Tên chức năng: Đăng nhập
**Endpoint:** `POST /api/auth/login`
**Tệp định tuyến:** `backend/app/api/routes/auth.py`

### 2. Tác nhân và thành phần tham gia
Tác nhân: User. Thành phần: Client, Backend, CSDL, Redis.

### 3. Tiền điều kiện
User có tài khoản và gửi thông tin đăng nhập.

### 4. Luồng chính
1. Client gửi thông tin đăng nhập đến Backend.
2. Backend kiểm tra yêu cầu còn trong giới hạn qua Redis?
3. Backend kiểm tra dữ liệu đầu vào hợp lệ?
4. Backend yêu cầu CSDL tìm tài khoản.
5. Backend kiểm tra tài khoản và mật khẩu hợp lệ?
6. Backend tạo thông tin xác thực mới.
7. CSDL lưu phiên đăng nhập và thời điểm truy cập.
8. Backend trả HTTP 200 cùng thông tin xác thực và người dùng.

### 5. Luồng rẽ nhánh
2a. Nếu Redis không khả dụng, Backend dùng bộ nhớ tiến trình rồi tiếp tục bước 3.
2b. Nếu vượt giới hạn, Backend trả HTTP 429, nghĩa là quá nhiều yêu cầu; yêu cầu kết thúc.
3a. Nếu dữ liệu sai, Backend trả HTTP 422, nghĩa là không hợp lệ; yêu cầu kết thúc.
5a. Nếu tài khoản thiếu, ngừng hoạt động hoặc mật khẩu sai, Backend trả HTTP 401; yêu cầu kết thúc.

### 6. Hậu điều kiện
CSDL lưu phiên mới và Client nhận thông tin xác thực hợp lệ.

### Thông điệp tuần tự
Client → Backend: Gửi thông tin đăng nhập
Backend → Redis: Kiểm tra giới hạn
Backend → CSDL: Tìm tài khoản
CSDL → Backend: Trả tài khoản
Backend → CSDL: Lưu phiên mới
Backend → Client: Trả thông tin xác thực

## 1. Tên chức năng: Làm mới phiên đăng nhập
**Endpoint:** `POST /api/auth/refresh`
**Tệp định tuyến:** `backend/app/api/routes/auth.py`

### 2. Tác nhân và thành phần tham gia
Tác nhân: User. Thành phần: Client, Backend, CSDL, Redis.

### 3. Tiền điều kiện
Client có thông tin làm mới phiên từ nội dung yêu cầu hoặc cơ chế trình duyệt.

### 4. Luồng chính
1. Client gửi yêu cầu làm mới phiên.
2. Backend kiểm tra yêu cầu còn trong giới hạn qua Redis?
3. Backend kiểm tra dữ liệu đầu vào hợp lệ?
4. Backend kiểm tra thông tin làm mới hiện diện?
5. Backend yêu cầu CSDL tìm phiên còn hiệu lực.
6. Backend kiểm tra phiên còn hiệu lực?
7. Backend yêu cầu CSDL tìm tài khoản.
8. Backend kiểm tra tài khoản còn hoạt động?
9. Backend thu hồi phiên cũ.
10. Backend tạo thông tin xác thực mới.
11. CSDL lưu thay đổi phiên.
12. Backend trả HTTP 200 cùng thông tin xác thực mới.

### 5. Luồng rẽ nhánh
2a. Nếu Redis không khả dụng, Backend dùng bộ nhớ tiến trình rồi tiếp tục bước 3.
2b. Nếu vượt giới hạn, Backend trả HTTP 429, nghĩa là quá nhiều yêu cầu; yêu cầu kết thúc.
3a. Nếu dữ liệu sai, Backend trả HTTP 422, nghĩa là không hợp lệ; yêu cầu kết thúc.
4a. Nếu thiếu thông tin làm mới, Backend trả HTTP 401, nghĩa là phiên không hợp lệ; yêu cầu kết thúc.
6a. Nếu phiên thiếu, hết hạn hoặc đã thu hồi, Backend trả HTTP 401; yêu cầu kết thúc.
8a. Nếu tài khoản thiếu hoặc ngừng hoạt động, Backend trả HTTP 401; yêu cầu kết thúc.

### 6. Hậu điều kiện
Phiên cũ bị thu hồi và Client nhận phiên mới.

### Thông điệp tuần tự
Client → Backend: Yêu cầu làm mới phiên
Backend → Redis: Kiểm tra giới hạn
Backend → CSDL: Tìm phiên hợp lệ
CSDL → Backend: Trả phiên và tài khoản
Backend → CSDL: Đổi phiên đăng nhập
Backend → Client: Trả thông tin xác thực mới

## 1. Tên chức năng: Đăng xuất
**Endpoint:** `POST /api/auth/logout`
**Tệp định tuyến:** `backend/app/api/routes/auth.py`

### 2. Tác nhân và thành phần tham gia
Tác nhân: User. Thành phần: Client, Backend, CSDL.

### 3. Tiền điều kiện
Client có thể gửi thông tin làm mới phiên; endpoint không yêu cầu đăng nhập hiện hành.

### 4. Luồng chính
1. Client gửi yêu cầu đăng xuất.
2. Backend kiểm tra dữ liệu đầu vào hợp lệ?
3. Backend kiểm tra thông tin làm mới hiện diện?
4. Backend yêu cầu CSDL tìm phiên còn hiệu lực.
5. Backend kiểm tra phiên được tìm thấy?
6. CSDL thu hồi phiên.
7. CSDL lưu thay đổi phiên.
8. Backend xóa thông tin xác thực phía trình duyệt.
9. Backend trả HTTP 200 với kết quả thành công.

### 5. Luồng rẽ nhánh
2a. Nếu dữ liệu sai, Backend trả HTTP 422, nghĩa là không hợp lệ; yêu cầu kết thúc.
3a. Nếu thiếu thông tin làm mới, Backend bỏ qua CSDL và tiếp tục bước 8.
5a. Nếu không tìm thấy phiên hợp lệ, Backend bỏ qua thu hồi và tiếp tục bước 8.

### 6. Hậu điều kiện
Phiên tìm thấy bị thu hồi và thông tin xác thực trình duyệt bị xóa.

### Thông điệp tuần tự
Client → Backend: Yêu cầu đăng xuất
Backend → CSDL: Tìm phiên hợp lệ
CSDL → Backend: Trả kết quả phiên
Backend → CSDL: Thu hồi phiên
Backend → Client: Xóa xác thực và báo thành công

## 1. Tên chức năng: Xem hồ sơ cá nhân
**Endpoint:** `GET /api/me/profile`
**Tệp định tuyến:** `backend/app/api/routes/users.py`

### 2. Tác nhân và thành phần tham gia
Tác nhân: User. Thành phần: Client, Backend, CSDL.

### 3. Tiền điều kiện
User gửi yêu cầu có thông tin xác thực.

### 4. Luồng chính
1. Client yêu cầu hồ sơ cá nhân.
2. Backend kiểm tra xác thực yêu cầu hợp lệ?
3. Backend kiểm tra hồ sơ tồn tại?
4. Backend yêu cầu CSDL đọc thông tin theo vai trò.
5. Backend trả HTTP 200 cùng hồ sơ.

### 5. Luồng rẽ nhánh
2a. Nếu thiếu hoặc sai thông tin xác thực, Backend trả HTTP 401; yêu cầu kết thúc.
2b. Nếu tài khoản thiếu hoặc ngừng hoạt động, Backend trả HTTP 401; yêu cầu kết thúc.
3a. Nếu chưa có hồ sơ, Backend trả HTTP 404, nghĩa là không tìm thấy hồ sơ; yêu cầu kết thúc.
4a. Nếu không có hồ sơ vai trò, Backend trả phần thông tin chung rồi tiếp tục bước 5.

### 6. Hậu điều kiện
Client nhận hồ sơ hiện tại; CSDL không thay đổi.

### Thông điệp tuần tự
Client → Backend: Yêu cầu hồ sơ
Backend → CSDL: Xác thực tài khoản
Backend → CSDL: Đọc hồ sơ vai trò
CSDL → Backend: Trả dữ liệu hồ sơ
Backend → Client: Trả hồ sơ

## 1. Tên chức năng: Cập nhật hồ sơ cá nhân
**Endpoint:** `PATCH /api/me/profile`
**Tệp định tuyến:** `backend/app/api/routes/users.py`

### 2. Tác nhân và thành phần tham gia
Tác nhân: User. Thành phần: Client, Backend, CSDL.

### 3. Tiền điều kiện
User đã đăng nhập và gửi dữ liệu hồ sơ cần lưu.

### 4. Luồng chính
1. Client gửi dữ liệu cập nhật hồ sơ.
2. Backend kiểm tra xác thực yêu cầu hợp lệ?
3. Backend kiểm tra dữ liệu đầu vào hợp lệ?
4. Backend kiểm tra giá trị giới tính được hỗ trợ?
5. CSDL lưu hồ sơ chung.
6. Backend cập nhật thông tin riêng theo vai trò khi có.
7. CSDL lưu thay đổi.
8. Backend trả HTTP 200 cùng hồ sơ mới.

### 5. Luồng rẽ nhánh
2a. Nếu thiếu hoặc sai thông tin xác thực, Backend trả HTTP 401; yêu cầu kết thúc.
2b. Nếu tài khoản thiếu hoặc ngừng hoạt động, Backend trả HTTP 401; yêu cầu kết thúc.
2c. Nếu xác thực yêu cầu ghi không hợp lệ, Backend trả HTTP 403; yêu cầu kết thúc.
3a. Nếu dữ liệu sai, Backend trả HTTP 422, nghĩa là không hợp lệ; yêu cầu kết thúc.
4a. Nếu giới tính không được hỗ trợ, Backend trả HTTP 400; yêu cầu kết thúc.
4b. Nếu không gửi giới tính, Backend bỏ tra cứu liên quan rồi tiếp tục bước 5.
6a. Nếu thiếu hồ sơ vai trò, Backend bỏ qua thông tin riêng rồi tiếp tục bước 7.

### 6. Hậu điều kiện
CSDL lưu hồ sơ mới của User.

### Thông điệp tuần tự
Client → Backend: Gửi hồ sơ mới
Backend → CSDL: Xác thực tài khoản
Backend → CSDL: Kiểm tra dữ liệu liên quan
Backend → CSDL: Lưu hồ sơ
CSDL → Backend: Trả hồ sơ mới
Backend → Client: Trả hồ sơ mới

## 1. Tên chức năng: Liệt kê khóa học của giáo viên
**Endpoint:** `GET /teacher/courses`
**Tệp định tuyến:** `backend/app/api/routes/courses.py`

### 2. Tác nhân và thành phần tham gia
Tác nhân: Teacher hoặc Admin. Thành phần: Client, Backend, CSDL.

### 3. Tiền điều kiện
Teacher hoặc Admin đã đăng nhập; bộ lọc có thể được cung cấp.

### 4. Luồng chính
1. Client yêu cầu danh sách khóa học.
2. Backend kiểm tra xác thực yêu cầu hợp lệ?
3. Backend kiểm tra vai trò phù hợp?
4. Backend kiểm tra bộ lọc trạng thái có được cung cấp?
5. Backend kiểm tra trạng thái hợp lệ?
6. Backend kiểm tra từ khóa có được cung cấp?
7. CSDL truy vấn khóa học theo quyền và bộ lọc.
8. CSDL tổng hợp số liệu khóa học.
9. Backend trả HTTP 200 cùng danh sách.

### 5. Luồng rẽ nhánh
2a. Nếu thiếu hoặc sai thông tin xác thực, Backend trả HTTP 401; yêu cầu kết thúc.
2b. Nếu tài khoản thiếu hoặc ngừng hoạt động, Backend trả HTTP 401; yêu cầu kết thúc.
3a. Nếu sai vai trò, Backend trả HTTP 403, nghĩa là không có quyền; yêu cầu kết thúc.
4a. Nếu không có bộ lọc trạng thái, Backend bỏ lọc trạng thái và tiếp tục bước 6.
5a. Nếu trạng thái không tồn tại, Backend trả HTTP 400; yêu cầu kết thúc.
6a. Nếu không có từ khóa, Backend bỏ lọc từ khóa và tiếp tục bước 7.
7a. Nếu là Admin, CSDL lấy mọi khóa học chưa xóa.
7b. Nếu là Teacher, CSDL lấy khóa học sở hữu hoặc được phân công; các nhánh gặp bước 8.

### 6. Hậu điều kiện
Client nhận danh sách và số liệu khóa học được phép xem.

### Thông điệp tuần tự
Client → Backend: Yêu cầu danh sách khóa học
Backend → CSDL: Xác thực và kiểm tra vai trò
Backend → CSDL: Kiểm tra trạng thái
Backend → CSDL: Truy vấn khóa học
Backend → CSDL: Tổng hợp số liệu
CSDL → Backend: Trả danh sách
Backend → Client: Trả danh sách khóa học

## 1. Tên chức năng: Tạo khóa học
**Endpoint:** `POST /teacher/courses`
**Tệp định tuyến:** `backend/app/api/routes/courses.py`

### 2. Tác nhân và thành phần tham gia
Tác nhân: Teacher hoặc Admin. Thành phần: Client, Backend, CSDL.

### 3. Tiền điều kiện
Teacher hoặc Admin đã đăng nhập và chuẩn bị thông tin khóa học.

### 4. Luồng chính
1. Client gửi thông tin khóa học.
2. Backend kiểm tra xác thực yêu cầu hợp lệ?
3. Backend kiểm tra vai trò phù hợp?
4. Backend kiểm tra dữ liệu đầu vào hợp lệ?
5. Backend kiểm tra hồ sơ giáo viên tồn tại?
6. Backend kiểm tra trạng thái khóa học tồn tại?
7. CSDL tạo khóa học mới.
8. CSDL lưu thay đổi.
9. Backend trả HTTP 201 cùng khóa học.

### 5. Luồng rẽ nhánh
2a. Nếu thiếu hoặc sai thông tin xác thực, Backend trả HTTP 401; yêu cầu kết thúc.
2b. Nếu tài khoản thiếu hoặc ngừng hoạt động, Backend trả HTTP 401; yêu cầu kết thúc.
2c. Nếu xác thực yêu cầu ghi không hợp lệ, Backend trả HTTP 403; yêu cầu kết thúc.
3a. Nếu sai vai trò, Backend trả HTTP 403, nghĩa là không có quyền; yêu cầu kết thúc.
4a. Nếu dữ liệu sai, Backend trả HTTP 422, nghĩa là không hợp lệ; yêu cầu kết thúc.
5a. Nếu Teacher thiếu hồ sơ giáo viên, Backend trả HTTP 400; yêu cầu kết thúc.
5b. Nếu Admin thiếu hồ sơ giáo viên, CSDL tạo hồ sơ tương ứng rồi tiếp tục bước 6.
6a. Nếu trạng thái không tồn tại, Backend trả HTTP 400; yêu cầu kết thúc.

### 6. Hậu điều kiện
CSDL lưu khóa học mới thuộc người tạo.

### Thông điệp tuần tự
Client → Backend: Gửi thông tin khóa học
Backend → CSDL: Xác thực và kiểm tra vai trò
Backend → CSDL: Kiểm tra hồ sơ và trạng thái
Backend → CSDL: Tạo khóa học
CSDL → Backend: Trả khóa học
Backend → Client: Trả HTTP 201

## 1. Tên chức năng: Cập nhật khóa học
**Endpoint:** `PATCH /teacher/courses/{course_id}`
**Tệp định tuyến:** `backend/app/api/routes/courses.py`

### 2. Tác nhân và thành phần tham gia
Tác nhân: Teacher hoặc Admin. Thành phần: Client, Backend, CSDL.

### 3. Tiền điều kiện
Teacher hoặc Admin đã đăng nhập và gửi thay đổi khóa học.

### 4. Luồng chính
1. Client gửi thay đổi khóa học.
2. Backend kiểm tra xác thực yêu cầu hợp lệ?
3. Backend kiểm tra vai trò phù hợp?
4. Backend kiểm tra khóa học tồn tại?
5. Backend kiểm tra quyền quản lý khóa học?
6. Backend kiểm tra dữ liệu đầu vào hợp lệ?
7. Backend kiểm tra trạng thái mới tồn tại?
8. CSDL cập nhật khóa học.
9. CSDL tổng hợp số liệu khóa học.
10. Backend trả HTTP 200 cùng khóa học mới.

### 5. Luồng rẽ nhánh
2a. Nếu xác thực sai hoặc tài khoản không hoạt động, Backend trả HTTP 401; yêu cầu kết thúc.
2b. Nếu xác thực yêu cầu ghi không hợp lệ, Backend trả HTTP 403; yêu cầu kết thúc.
3a. Nếu sai vai trò, Backend trả HTTP 403; yêu cầu kết thúc.
4a. Nếu khóa học thiếu hoặc đã xóa, Backend trả HTTP 404; yêu cầu kết thúc.
5a. Nếu không phải Admin hoặc chủ sở hữu, Backend trả HTTP 403; yêu cầu kết thúc.
6a. Nếu dữ liệu sai định dạng, Backend trả HTTP 422; yêu cầu kết thúc.
7a. Nếu không đổi trạng thái, Backend giữ trạng thái cũ rồi tiếp tục bước 8.
7b. Nếu trạng thái mới không tồn tại, Backend trả HTTP 400; yêu cầu kết thúc.

### 6. Hậu điều kiện
CSDL lưu thuộc tính được cung cấp; thuộc tính nhận giá trị null giữ nguyên.

### Thông điệp tuần tự
Client → Backend: Gửi thay đổi khóa học
Backend → CSDL: Xác thực và tìm khóa học
Backend → CSDL: Kiểm tra quyền quản lý
Backend → CSDL: Cập nhật khóa học
Backend → CSDL: Tổng hợp số liệu
Backend → Client: Trả khóa học mới

## 1. Tên chức năng: Xóa khóa học
**Endpoint:** `DELETE /teacher/courses/{course_id}`
**Tệp định tuyến:** `backend/app/api/routes/courses.py`

### 2. Tác nhân và thành phần tham gia
Tác nhân: Teacher hoặc Admin. Thành phần: Client, Backend, CSDL.

### 3. Tiền điều kiện
Teacher hoặc Admin đã đăng nhập và xác định khóa học cần xóa.

### 4. Luồng chính
1. Client yêu cầu xóa khóa học.
2. Backend kiểm tra xác thực yêu cầu hợp lệ?
3. Backend kiểm tra vai trò phù hợp?
4. Backend kiểm tra khóa học tồn tại?
5. Backend kiểm tra quyền quản lý khóa học?
6. CSDL đánh dấu khóa học đã xóa.
7. Backend trả HTTP 200 với kết quả thành công.

### 5. Luồng rẽ nhánh
2a. Nếu xác thực sai hoặc tài khoản không hoạt động, Backend trả HTTP 401; yêu cầu kết thúc.
2b. Nếu xác thực yêu cầu ghi không hợp lệ, Backend trả HTTP 403; yêu cầu kết thúc.
3a. Nếu sai vai trò, Backend trả HTTP 403; yêu cầu kết thúc.
4a. Nếu khóa học thiếu hoặc đã xóa, Backend trả HTTP 404; yêu cầu kết thúc.
5a. Nếu không phải Admin hoặc chủ sở hữu, Backend trả HTTP 403; yêu cầu kết thúc.

### 6. Hậu điều kiện
Khóa học được đánh dấu đã xóa trong CSDL.

### Thông điệp tuần tự
Client → Backend: Yêu cầu xóa khóa học
Backend → CSDL: Xác thực và tìm khóa học
Backend → CSDL: Kiểm tra quyền quản lý
Backend → CSDL: Đánh dấu đã xóa
Backend → Client: Báo thành công

## 1. Tên chức năng: Thêm một slide
**Endpoint:** `POST /teacher/lessons/{lesson_id}/slides`
**Tệp định tuyến:** `backend/app/api/routes/lessons.py`

### 2. Tác nhân và thành phần tham gia
Tác nhân: Teacher hoặc Admin. Thành phần: Client, Backend, CSDL.

### 3. Tiền điều kiện
Teacher hoặc Admin đã đăng nhập và chuẩn bị thông tin slide.

### 4. Luồng chính
1. Client gửi thông tin slide mới.
2. Backend kiểm tra xác thực yêu cầu hợp lệ?
3. Backend kiểm tra vai trò phù hợp?
4. Backend kiểm tra bài học tồn tại?
5. Backend kiểm tra quyền truy cập khóa học?
6. Backend kiểm tra dữ liệu đầu vào hợp lệ?
7. CSDL xác định thứ tự tiếp theo.
8. CSDL tạo slide.
9. CSDL lưu thay đổi.
10. Backend trả HTTP 201 cùng slide mới.

### 5. Luồng rẽ nhánh
2a. Nếu xác thực sai hoặc tài khoản không hoạt động, Backend trả HTTP 401; yêu cầu kết thúc.
2b. Nếu xác thực yêu cầu ghi không hợp lệ, Backend trả HTTP 403; yêu cầu kết thúc.
3a. Nếu sai vai trò, Backend trả HTTP 403; yêu cầu kết thúc.
4a. Nếu định danh sai hoặc bài học không tồn tại, Backend trả HTTP 404; yêu cầu kết thúc.
5a. Nếu không sở hữu, quản trị hoặc được phân công, Backend trả HTTP 403; yêu cầu kết thúc.
6a. Nếu dữ liệu sai định dạng, Backend trả HTTP 422; yêu cầu kết thúc.

### 6. Hậu điều kiện
CSDL lưu slide mới ở cuối bài học.

### Thông điệp tuần tự
Client → Backend: Gửi slide mới
Backend → CSDL: Xác thực và tìm bài học
Backend → CSDL: Kiểm tra quyền truy cập
Backend → CSDL: Xác định thứ tự
Backend → CSDL: Lưu slide
Backend → Client: Trả HTTP 201

## 1. Tên chức năng: Tải PDF và thay thế slide
**Endpoint:** `POST /teacher/lessons/{lesson_id}/slides/upload`
**Tệp định tuyến:** `backend/app/api/routes/lessons.py`

### 2. Tác nhân và thành phần tham gia
Tác nhân: Teacher hoặc Admin. Thành phần: Client, Backend, CSDL, Redis.

### 3. Tiền điều kiện
Teacher hoặc Admin đã đăng nhập và chọn tệp PDF.

### 4. Luồng chính
1. Client gửi tệp PDF cho bài học.
2. Backend kiểm tra yêu cầu còn trong giới hạn qua Redis?
3. Backend kiểm tra xác thực yêu cầu hợp lệ?
4. Backend kiểm tra vai trò phù hợp?
5. Backend kiểm tra bài học tồn tại?
6. Backend kiểm tra quyền truy cập khóa học?
7. Backend kiểm tra tệp đầu vào hợp lệ?
8. Backend chuẩn bị phiên bản slide mới từ PDF.
9. CSDL xóa các bản ghi slide cũ.
10. CSDL ghi các slide và vùng nội dung mới.
11. Backend hoàn tất phiên bản slide mới.
12. Backend trả HTTP 201 cùng số slide.

### 5. Luồng rẽ nhánh
2a. Nếu Redis không khả dụng, Backend dùng bộ nhớ tiến trình rồi tiếp tục bước 3.
2b. Nếu vượt giới hạn, Backend trả HTTP 429, nghĩa là quá nhiều yêu cầu; yêu cầu kết thúc.
3a. Nếu xác thực sai hoặc tài khoản không hoạt động, Backend trả HTTP 401; yêu cầu kết thúc.
3b. Nếu xác thực yêu cầu ghi không hợp lệ, Backend trả HTTP 403; yêu cầu kết thúc.
4a. Nếu sai vai trò, Backend trả HTTP 403; yêu cầu kết thúc.
5a. Nếu định danh sai hoặc bài học không tồn tại, Backend trả HTTP 404; yêu cầu kết thúc.
6a. Nếu không sở hữu, quản trị hoặc được phân công, Backend trả HTTP 403; yêu cầu kết thúc.
7a. Nếu thiếu tệp, Backend trả HTTP 422, nghĩa là dữ liệu không hợp lệ; yêu cầu kết thúc.
7b. Nếu tệp quá lớn, sai loại, rỗng, hỏng hoặc được bảo vệ, Backend trả HTTP 400; yêu cầu kết thúc.
8a. Nếu trang không có vùng trích xuất, Backend tạo vùng lưới rồi tiếp tục bước 9.
9a. Nếu xóa bản ghi cũ lỗi, Backend trả HTTP 500; tệp mới không được dọn; yêu cầu kết thúc.
10a. Nếu lưu dữ liệu mới lỗi, Backend dọn tệp mới và báo không thể thay slide (409); yêu cầu kết thúc.

### 6. Hậu điều kiện
Slide, vùng nội dung và tệp mới thay thế phiên bản cũ thành công.

### Thông điệp tuần tự
Client → Backend: Gửi tệp PDF
Backend → Redis: Kiểm tra giới hạn
Backend → CSDL: Xác thực và kiểm tra quyền
Backend → Backend: Chuẩn bị phiên bản slide mới
Backend → CSDL: Xóa bản ghi slide cũ
Backend → CSDL: Ghi slide và vùng nội dung mới
Backend → Backend: Hoàn tất phiên bản slide mới
Backend → Client: Trả số slide

## 1. Tên chức năng: Xóa slide
**Endpoint:** `DELETE /teacher/slides/{slide_id}`
**Tệp định tuyến:** `backend/app/api/routes/lessons.py`

### 2. Tác nhân và thành phần tham gia
Tác nhân: Teacher hoặc Admin. Thành phần: Client, Backend, CSDL.

### 3. Tiền điều kiện
Teacher hoặc Admin đã đăng nhập và xác định slide.

### 4. Luồng chính
1. Client yêu cầu xóa slide.
2. Backend kiểm tra xác thực yêu cầu hợp lệ?
3. Backend kiểm tra vai trò phù hợp?
4. Backend kiểm tra slide tồn tại?
5. Backend kiểm tra quyền quản lý khóa học?
6. CSDL xóa slide.
7. CSDL lưu thay đổi.
8. Backend trả HTTP 200 với kết quả thành công.

### 5. Luồng rẽ nhánh
2a. Nếu xác thực sai hoặc tài khoản không hoạt động, Backend trả HTTP 401; yêu cầu kết thúc.
2b. Nếu xác thực yêu cầu ghi không hợp lệ, Backend trả HTTP 403; yêu cầu kết thúc.
3a. Nếu sai vai trò, Backend trả HTTP 403; yêu cầu kết thúc.
4a. Nếu slide không tồn tại, Backend trả HTTP 404; yêu cầu kết thúc.
5a. Nếu không phải Admin hoặc chủ sở hữu, Backend trả HTTP 403; yêu cầu kết thúc.
6a. Nếu dữ liệu liên quan chặn xóa, Backend trả HTTP 500; yêu cầu kết thúc.

### 6. Hậu điều kiện
Slide bị xóa khỏi CSDL khi thao tác lưu thành công.

### Thông điệp tuần tự
Client → Backend: Yêu cầu xóa slide
Backend → CSDL: Xác thực và tìm slide
Backend → CSDL: Kiểm tra quyền quản lý
Backend → CSDL: Xóa slide
Backend → Client: Báo thành công

## 1. Tên chức năng: Liệt kê slide quản trị
**Endpoint:** `GET /teacher/lessons/{lesson_id}/slides`
**Tệp định tuyến:** `backend/app/api/routes/lessons.py`

### 2. Tác nhân và thành phần tham gia
Tác nhân: Teacher hoặc Admin. Thành phần: Client, Backend, CSDL.

### 3. Tiền điều kiện
Teacher hoặc Admin đã đăng nhập và xác định bài học.

### 4. Luồng chính
1. Client yêu cầu danh sách slide quản trị.
2. Backend kiểm tra xác thực yêu cầu hợp lệ?
3. Backend kiểm tra vai trò phù hợp?
4. Backend kiểm tra bài học tồn tại?
5. Backend kiểm tra quyền truy cập khóa học?
6. CSDL đọc các slide.
7. CSDL đếm vùng nội dung từng slide.
8. Backend trả HTTP 200 cùng danh sách.

### 5. Luồng rẽ nhánh
2a. Nếu xác thực sai hoặc tài khoản không hoạt động, Backend trả HTTP 401; yêu cầu kết thúc.
3a. Nếu sai vai trò, Backend trả HTTP 403; yêu cầu kết thúc.
4a. Nếu định danh sai hoặc bài học không tồn tại, Backend trả HTTP 404; yêu cầu kết thúc.
5a. Nếu không sở hữu, quản trị hoặc được phân công, Backend trả HTTP 403; yêu cầu kết thúc.
6a. Nếu chưa có slide, Backend trả HTTP 200 với danh sách rỗng.

### 6. Hậu điều kiện
Client nhận slide, trạng thái trọng tâm và số vùng nội dung.

### Thông điệp tuần tự
Client → Backend: Yêu cầu slide quản trị
Backend → CSDL: Xác thực và tìm bài học
Backend → CSDL: Kiểm tra quyền truy cập
Backend → CSDL: Đọc slide và vùng nội dung
CSDL → Backend: Trả danh sách
Backend → Client: Trả danh sách

## 1. Tên chức năng: Đánh dấu trọng tâm một slide
**Endpoint:** `PATCH /teacher/slides/{slide_id}`
**Tệp định tuyến:** `backend/app/api/routes/lessons.py`

### 2. Tác nhân và thành phần tham gia
Tác nhân: Teacher hoặc Admin. Thành phần: Client, Backend, CSDL.

### 3. Tiền điều kiện
Teacher hoặc Admin đã đăng nhập và xác định slide.

### 4. Luồng chính
1. Client gửi trạng thái trọng tâm mới.
2. Backend kiểm tra xác thực yêu cầu hợp lệ?
3. Backend kiểm tra vai trò phù hợp?
4. Backend kiểm tra slide tồn tại?
5. Backend kiểm tra quyền truy cập khóa học?
6. Backend kiểm tra dữ liệu đầu vào hợp lệ?
7. CSDL cập nhật trạng thái trọng tâm.
8. CSDL lưu thay đổi.
9. Backend trả HTTP 200 với kết quả thành công.

### 5. Luồng rẽ nhánh
2a. Nếu xác thực sai hoặc tài khoản không hoạt động, Backend trả HTTP 401; yêu cầu kết thúc.
2b. Nếu xác thực yêu cầu ghi không hợp lệ, Backend trả HTTP 403; yêu cầu kết thúc.
3a. Nếu sai vai trò, Backend trả HTTP 403; yêu cầu kết thúc.
4a. Nếu slide không tồn tại, Backend trả HTTP 404; yêu cầu kết thúc.
5a. Nếu không sở hữu, quản trị hoặc được phân công, Backend trả HTTP 403; yêu cầu kết thúc.
6a. Nếu dữ liệu sai định dạng, Backend trả HTTP 422; yêu cầu kết thúc.

### 6. Hậu điều kiện
CSDL lưu trạng thái trọng tâm mới của slide.

### Thông điệp tuần tự
Client → Backend: Gửi trạng thái trọng tâm
Backend → CSDL: Xác thực và tìm slide
Backend → CSDL: Kiểm tra quyền truy cập
Backend → CSDL: Lưu trạng thái
Backend → Client: Báo thành công

## 1. Tên chức năng: Đặt danh sách slide trọng tâm
**Endpoint:** `POST /teacher/lessons/{lesson_id}/slides/key`
**Tệp định tuyến:** `backend/app/api/routes/lessons.py`

### 2. Tác nhân và thành phần tham gia
Tác nhân: Teacher hoặc Admin. Thành phần: Client, Backend, CSDL.

### 3. Tiền điều kiện
Teacher hoặc Admin đã đăng nhập và chuẩn bị danh sách vị trí slide.

### 4. Luồng chính
1. Client gửi danh sách vị trí trọng tâm.
2. Backend kiểm tra xác thực yêu cầu hợp lệ?
3. Backend kiểm tra vai trò phù hợp?
4. Backend kiểm tra bài học tồn tại?
5. Backend kiểm tra quyền truy cập khóa học?
6. Backend kiểm tra dữ liệu đầu vào hợp lệ?
7. CSDL đọc toàn bộ slide của bài học.
8. Backend đồng bộ trạng thái trọng tâm theo danh sách.
9. CSDL lưu thay đổi.
10. Backend trả HTTP 200 với kết quả thành công.

### 5. Luồng rẽ nhánh
2a. Nếu xác thực sai hoặc tài khoản không hoạt động, Backend trả HTTP 401; yêu cầu kết thúc.
2b. Nếu xác thực yêu cầu ghi không hợp lệ, Backend trả HTTP 403; yêu cầu kết thúc.
3a. Nếu sai vai trò, Backend trả HTTP 403; yêu cầu kết thúc.
4a. Nếu định danh sai hoặc bài học không tồn tại, Backend trả HTTP 404; yêu cầu kết thúc.
5a. Nếu không sở hữu, quản trị hoặc được phân công, Backend trả HTTP 403; yêu cầu kết thúc.
6a. Nếu dữ liệu sai định dạng, Backend trả HTTP 422; yêu cầu kết thúc.
7a. Nếu bài học chưa có slide, CSDL không cập nhật và tiếp tục bước 10.

### 6. Hậu điều kiện
Chỉ các slide có vị trí được gửi giữ trạng thái trọng tâm.

### Thông điệp tuần tự
Client → Backend: Gửi danh sách trọng tâm
Backend → CSDL: Xác thực và tìm bài học
Backend → CSDL: Kiểm tra quyền truy cập
Backend → CSDL: Đọc và cập nhật slide
Backend → Client: Báo thành công

## 1. Tên chức năng: Xây dựng lại vùng nội dung
**Endpoint:** `POST /teacher/lessons/{lesson_id}/aoi/rebuild`
**Tệp định tuyến:** `backend/app/api/routes/lessons.py`

### 2. Tác nhân và thành phần tham gia
Tác nhân: Teacher hoặc Admin. Thành phần: Client, Backend, CSDL.

### 3. Tiền điều kiện
Teacher hoặc Admin đã đăng nhập; bài học có thể còn tệp PDF nguồn.

### 4. Luồng chính
1. Client yêu cầu xây dựng lại vùng nội dung.
2. Backend kiểm tra xác thực yêu cầu hợp lệ?
3. Backend kiểm tra vai trò phù hợp?
4. Backend kiểm tra bài học tồn tại?
5. Backend kiểm tra quyền truy cập khóa học?
6. Backend kiểm tra còn tệp PDF nguồn?
7. Backend trích vùng nội dung cho từng slide.
8. CSDL thay các vùng nội dung.
9. CSDL lưu thay đổi.
10. Backend làm mới dữ liệu đệm liên quan.
11. Backend trả HTTP 200 cùng số slide đã cập nhật.

### 5. Luồng rẽ nhánh
2a. Nếu xác thực sai hoặc tài khoản không hoạt động, Backend trả HTTP 401; yêu cầu kết thúc.
2b. Nếu xác thực yêu cầu ghi không hợp lệ, Backend trả HTTP 403; yêu cầu kết thúc.
3a. Nếu sai vai trò, Backend trả HTTP 403; yêu cầu kết thúc.
4a. Nếu định danh sai hoặc bài học không tồn tại, Backend trả HTTP 404; yêu cầu kết thúc.
5a. Nếu không sở hữu, quản trị hoặc được phân công, Backend trả HTTP 403; yêu cầu kết thúc.
6a. Nếu thiếu tệp nguồn, Backend bỏ xây vùng và tiếp tục bước 9 với số lượng bằng không.
7a. Nếu slide không có vùng trích xuất, Backend tạo vùng lưới rồi tiếp tục bước 8.

### 6. Hậu điều kiện
CSDL lưu vùng nội dung mới khi tệp nguồn tồn tại.

### Thông điệp tuần tự
Client → Backend: Yêu cầu xây dựng lại
Backend → CSDL: Xác thực và kiểm tra quyền
Backend → Backend: Tìm tệp PDF nguồn
Backend → Backend: Trích vùng nội dung
Backend → CSDL: Lưu vùng mới
Backend → Client: Trả số slide cập nhật

## 1. Tên chức năng: Xem nội dung bài học
**Endpoint:** `GET /api/lessons/{lesson_id}/contents`
**Tệp định tuyến:** `backend/app/api/routes/lessons.py`

### 2. Tác nhân và thành phần tham gia
Tác nhân: User. Thành phần: Client, Backend, CSDL.

### 3. Tiền điều kiện
User đã đăng nhập và xác định bài học.

### 4. Luồng chính
1. Client yêu cầu nội dung bài học.
2. Backend kiểm tra xác thực yêu cầu hợp lệ?
3. Backend kiểm tra bài học tồn tại?
4. CSDL tìm lượt đăng ký và khóa học liên quan.
5. Backend kiểm tra User có quyền truy cập?
6. CSDL đọc slide theo thứ tự.
7. Backend trả HTTP 200 cùng danh sách slide.

### 5. Luồng rẽ nhánh
2a. Nếu thiếu hoặc sai thông tin xác thực, Backend trả HTTP 401; yêu cầu kết thúc.
2b. Nếu tài khoản thiếu hoặc ngừng hoạt động, Backend trả HTTP 401; yêu cầu kết thúc.
3a. Nếu định danh sai hoặc bài học không tồn tại, Backend trả HTTP 404; yêu cầu kết thúc.
5a. Nếu không có quyền khóa học và chưa đăng ký, Backend trả HTTP 403; yêu cầu kết thúc.
6a. Nếu bài học chưa có slide, Backend trả HTTP 200 với danh sách rỗng.

### 6. Hậu điều kiện
Client nhận các slide mà User được phép xem.

### Thông điệp tuần tự
Client → Backend: Yêu cầu nội dung bài học
Backend → CSDL: Xác thực và tìm bài học
Backend → CSDL: Kiểm tra quyền hoặc đăng ký
Backend → CSDL: Đọc slide
CSDL → Backend: Trả slide
Backend → Client: Trả nội dung

## 1. Tên chức năng: Xem tiến độ bài học
**Endpoint:** `GET /api/lessons/{lesson_id}/progress`
**Tệp định tuyến:** `backend/app/api/routes/lessons.py`

### 2. Tác nhân và thành phần tham gia
Tác nhân: User. Thành phần: Client, Backend, CSDL.

### 3. Tiền điều kiện
User đã đăng nhập và xác định bài học.

### 4. Luồng chính
1. Client yêu cầu tiến độ bài học.
2. Backend kiểm tra xác thực yêu cầu hợp lệ?
3. Backend kiểm tra bài học tồn tại?
4. CSDL tìm lượt đăng ký liên quan.
5. Backend kiểm tra User đã đăng ký?
6. CSDL tìm tiến độ bài học.
7. Backend kiểm tra tiến độ tồn tại?
8. Backend trả HTTP 200 cùng tiến độ.

### 5. Luồng rẽ nhánh
2a. Nếu thiếu hoặc sai thông tin xác thực, Backend trả HTTP 401; yêu cầu kết thúc.
2b. Nếu tài khoản thiếu hoặc ngừng hoạt động, Backend trả HTTP 401; yêu cầu kết thúc.
3a. Nếu định danh sai hoặc bài học không tồn tại, Backend trả HTTP 404; yêu cầu kết thúc.
5a. Nếu chưa đăng ký, Backend trả HTTP 403; yêu cầu kết thúc.
7a. Nếu chưa có tiến độ, Backend trả HTTP 200 với tiến độ ban đầu; yêu cầu kết thúc.

### 6. Hậu điều kiện
Client nhận vị trí xem, danh sách đã xem và trạng thái hoàn thành.

### Thông điệp tuần tự
Client → Backend: Yêu cầu tiến độ
Backend → CSDL: Xác thực và tìm bài học
Backend → CSDL: Tìm lượt đăng ký
Backend → CSDL: Tìm tiến độ
CSDL → Backend: Trả tiến độ
Backend → Client: Trả tiến độ

## 1. Tên chức năng: Cập nhật tiến độ bài học
**Endpoint:** `PATCH /api/lessons/{lesson_id}/progress`
**Tệp định tuyến:** `backend/app/api/routes/lessons.py`

### 2. Tác nhân và thành phần tham gia
Tác nhân: User. Thành phần: Client, Backend, CSDL.

### 3. Tiền điều kiện
User đã đăng nhập, đã đăng ký khóa học và gửi vị trí xem.

### 4. Luồng chính
1. Client gửi tiến độ bài học.
2. Backend kiểm tra xác thực yêu cầu hợp lệ?
3. Backend kiểm tra bài học tồn tại?
4. CSDL tìm lượt đăng ký liên quan.
5. Backend kiểm tra User đã đăng ký?
6. Backend kiểm tra dữ liệu đầu vào hợp lệ?
7. CSDL tìm tiến độ hiện có.
8. Backend kiểm tra tiến độ tồn tại?
9. Backend bổ sung slide đã xem và thời điểm xem.
10. CSDL đồng bộ trạng thái hoàn thành theo số slide.
11. CSDL lưu thay đổi.
12. Backend trả HTTP 200 với kết quả thành công.

### 5. Luồng rẽ nhánh
2a. Nếu xác thực sai hoặc tài khoản không hoạt động, Backend trả HTTP 401; yêu cầu kết thúc.
2b. Nếu xác thực yêu cầu ghi không hợp lệ, Backend trả HTTP 403; yêu cầu kết thúc.
3a. Nếu định danh sai hoặc bài học không tồn tại, Backend trả HTTP 404; yêu cầu kết thúc.
5a. Nếu chưa đăng ký, Backend trả HTTP 403; yêu cầu kết thúc.
6a. Nếu dữ liệu sai định dạng, Backend trả HTTP 422; yêu cầu kết thúc.
8a. Nếu chưa có tiến độ, Backend tạo tiến độ mới rồi tiếp tục bước 9.
10a. Nếu Client báo hoàn thành hoặc đã xem đủ slide, Backend đánh dấu hoàn thành rồi tiếp tục bước 11.
10b. Nếu chưa đủ điều kiện, Backend giữ trạng thái hiện tại rồi tiếp tục bước 11.

### 6. Hậu điều kiện
CSDL lưu tiến độ và trạng thái hoàn thành mới nhất.

### Thông điệp tuần tự
Client → Backend: Gửi tiến độ
Backend → CSDL: Xác thực và tìm bài học
Backend → CSDL: Kiểm tra lượt đăng ký
Backend → CSDL: Đọc hoặc tạo tiến độ
Backend → CSDL: Lưu tiến độ
Backend → Client: Báo thành công

## 1. Tên chức năng: Xem các khóa học đã đăng ký
**Endpoint:** `GET /api/me/enrollments`
**Tệp định tuyến:** `backend/app/api/routes/enrollments.py`

### 2. Tác nhân và thành phần tham gia
Tác nhân: User. Thành phần: Client, Backend, CSDL.

### 3. Tiền điều kiện
User đã đăng nhập.

### 4. Luồng chính
1. Client yêu cầu các khóa học đã đăng ký.
2. Backend kiểm tra xác thực yêu cầu hợp lệ?
3. CSDL đọc lượt đăng ký và khóa học chưa xóa.
4. Backend kiểm tra có lượt đăng ký?
5. CSDL đếm chương, bài học và bài đã hoàn thành.
6. Backend tính tiến độ từng khóa học.
7. Backend trả HTTP 200 cùng danh sách.

### 5. Luồng rẽ nhánh
2a. Nếu thiếu hoặc sai thông tin xác thực, Backend trả HTTP 401; yêu cầu kết thúc.
2b. Nếu tài khoản thiếu hoặc ngừng hoạt động, Backend trả HTTP 401; yêu cầu kết thúc.
4a. Nếu không có lượt đăng ký, Backend trả HTTP 200 với danh sách rỗng; yêu cầu kết thúc.

### 6. Hậu điều kiện
Client nhận danh sách khóa học và tiến độ hiện tại.

### Thông điệp tuần tự
Client → Backend: Yêu cầu khóa học đã đăng ký
Backend → CSDL: Xác thực tài khoản
Backend → CSDL: Đọc lượt đăng ký
Backend → CSDL: Tổng hợp nội dung và tiến độ
CSDL → Backend: Trả dữ liệu
Backend → Client: Trả danh sách

## 1. Tên chức năng: Đăng ký khóa học
**Endpoint:** `POST /api/courses/{course_id}/enroll`
**Tệp định tuyến:** `backend/app/api/routes/enrollments.py`

### 2. Tác nhân và thành phần tham gia
Tác nhân: User. Thành phần: Client, Backend, CSDL, Redis.

### 3. Tiền điều kiện
User đã đăng nhập và xác định khóa học muốn đăng ký.

### 4. Luồng chính
1. Client gửi yêu cầu đăng ký khóa học.
2. Backend kiểm tra yêu cầu còn trong giới hạn qua Redis?
3. Backend kiểm tra xác thực yêu cầu hợp lệ?
4. Backend kiểm tra khóa học tồn tại?
5. Backend kiểm tra khóa học đã công bố?
6. CSDL tìm lượt đăng ký hiện có.
7. Backend kiểm tra chưa có lượt đăng ký?
8. CSDL tạo lượt đăng ký.
9. CSDL lưu thay đổi.
10. Backend kiểm tra lưu dữ liệu thành công?
11. Backend trả HTTP 201 cùng kết quả đăng ký.

### 5. Luồng rẽ nhánh
2a. Nếu Redis không khả dụng, Backend dùng bộ nhớ tiến trình rồi tiếp tục bước 3.
2b. Nếu vượt giới hạn, Backend trả HTTP 429, nghĩa là quá nhiều yêu cầu; yêu cầu kết thúc.
3a. Nếu xác thực sai hoặc tài khoản không hoạt động, Backend trả HTTP 401; yêu cầu kết thúc.
3b. Nếu xác thực yêu cầu ghi không hợp lệ, Backend trả HTTP 403; yêu cầu kết thúc.
4a. Nếu khóa học thiếu hoặc đã xóa, Backend trả HTTP 404; yêu cầu kết thúc.
5a. Nếu khóa học chưa công bố, Backend trả HTTP 400; yêu cầu kết thúc.
7a. Nếu đã có lượt đăng ký, Backend trả HTTP 409, nghĩa là bị trùng; yêu cầu kết thúc.
10a. Nếu phát sinh đăng ký trùng đồng thời, Backend hoàn tác và trả HTTP 409; yêu cầu kết thúc.

### 6. Hậu điều kiện
CSDL lưu một lượt đăng ký mới cho User.

### Thông điệp tuần tự
Client → Backend: Yêu cầu đăng ký
Backend → Redis: Kiểm tra giới hạn
Backend → CSDL: Xác thực và tìm khóa học
Backend → CSDL: Tìm lượt đăng ký
Backend → CSDL: Lưu lượt đăng ký
Backend → Client: Trả HTTP 201

## 1. Tên chức năng: Xem thống kê học tập cá nhân
**Endpoint:** `GET /api/me/stats`
**Tệp định tuyến:** `backend/app/api/routes/enrollments.py`

### 2. Tác nhân và thành phần tham gia
Tác nhân: User. Thành phần: Client, Backend, CSDL.

### 3. Tiền điều kiện
User đã đăng nhập.

### 4. Luồng chính
1. Client yêu cầu thống kê học tập.
2. Backend kiểm tra xác thực yêu cầu hợp lệ?
3. CSDL đọc các lượt đăng ký.
4. Backend kiểm tra có lượt đăng ký?
5. CSDL tổng hợp thời lượng gần đây và ngày học.
6. Backend tính chuỗi ngày học liên tục.
7. Backend trả HTTP 200 cùng thống kê.

### 5. Luồng rẽ nhánh
2a. Nếu thiếu hoặc sai thông tin xác thực, Backend trả HTTP 401; yêu cầu kết thúc.
2b. Nếu tài khoản thiếu hoặc ngừng hoạt động, Backend trả HTTP 401; yêu cầu kết thúc.
4a. Nếu chưa đăng ký khóa học, Backend trả HTTP 200 với thống kê bằng không; yêu cầu kết thúc.
6a. Nếu hôm nay chưa học, Backend bắt đầu tính chuỗi từ ngày trước rồi tiếp tục bước 7.

### 6. Hậu điều kiện
Client nhận thời lượng học gần đây và chuỗi ngày học.

### Thông điệp tuần tự
Client → Backend: Yêu cầu thống kê
Backend → CSDL: Xác thực tài khoản
Backend → CSDL: Đọc lượt đăng ký
Backend → CSDL: Tổng hợp phiên học
CSDL → Backend: Trả dữ liệu
Backend → Client: Trả thống kê

## 1. Tên chức năng: Tạo phiên học
**Endpoint:** `POST /api/learning-sessions`
**Tệp định tuyến:** `backend/app/api/routes/gaze.py`

### 2. Tác nhân và thành phần tham gia
Tác nhân: User. Thành phần: Client, Backend, CSDL.

### 3. Tiền điều kiện
User đã đăng nhập và gửi lượt đăng ký, bài học, thiết bị, sự đồng ý theo dõi.

### 4. Luồng chính
1. Client gửi thông tin phiên học.
2. Backend kiểm tra xác thực yêu cầu hợp lệ?
3. Backend kiểm tra lượt đăng ký thuộc User?
4. Backend kiểm tra bài học tồn tại?
5. Backend kiểm tra dữ liệu đầu vào hợp lệ?
6. CSDL đồng bộ thiết bị của User.
7. CSDL tìm thông tin hiệu chỉnh đang hoạt động.
8. CSDL tạo phiên học.
9. CSDL lưu thay đổi.
10. Backend trả HTTP 201 cùng phiên học.

### 5. Luồng rẽ nhánh
2a. Nếu xác thực sai hoặc tài khoản không hoạt động, Backend trả HTTP 401; yêu cầu kết thúc.
2b. Nếu xác thực yêu cầu ghi không hợp lệ, Backend trả HTTP 403; yêu cầu kết thúc.
3a. Nếu lượt đăng ký thiếu hoặc thuộc User khác, Backend trả HTTP 404; yêu cầu kết thúc.
4a. Nếu bài học không tồn tại, Backend trả HTTP 404; yêu cầu kết thúc.
5a. Nếu dữ liệu sai định dạng, Backend trả HTTP 422; yêu cầu kết thúc.
6a. Nếu thiết bị đã tồn tại, CSDL cập nhật thông tin được cung cấp rồi tiếp tục bước 7.
6b. Nếu thiết bị chưa tồn tại, CSDL tạo thiết bị rồi tiếp tục bước 7.
7a. Nếu chưa hiệu chỉnh, Backend tạo phiên không gắn hiệu chỉnh rồi tiếp tục bước 8.

### 6. Hậu điều kiện
CSDL lưu phiên học gắn với User, bài học và thiết bị.

### Thông điệp tuần tự
Client → Backend: Gửi thông tin phiên học
Backend → CSDL: Xác thực và kiểm tra đăng ký
Backend → CSDL: Tìm bài học
Backend → CSDL: Tìm hoặc tạo thiết bị
Backend → CSDL: Tạo phiên học
Backend → Client: Trả HTTP 201

## 1. Tên chức năng: Kết thúc phiên học
**Endpoint:** `PATCH /api/learning-sessions/{session_id}`
**Tệp định tuyến:** `backend/app/api/routes/gaze.py`

### 2. Tác nhân và thành phần tham gia
Tác nhân: User. Thành phần: Client, Backend, CSDL.

### 3. Tiền điều kiện
User đã đăng nhập và sở hữu phiên học.

### 4. Luồng chính
1. Client gửi trạng thái kết thúc phiên.
2. Backend kiểm tra xác thực yêu cầu hợp lệ?
3. Backend kiểm tra phiên học tồn tại?
4. CSDL đọc lượt đăng ký của phiên.
5. Backend kiểm tra phiên thuộc User?
6. Backend kiểm tra dữ liệu đầu vào hợp lệ?
7. CSDL lưu kết quả kết thúc phiên học.
8. Backend trả HTTP 200 cùng phiên học.

### 5. Luồng rẽ nhánh
2a. Nếu xác thực sai hoặc tài khoản không hoạt động, Backend trả HTTP 401; yêu cầu kết thúc.
2b. Nếu xác thực yêu cầu ghi không hợp lệ, Backend trả HTTP 403; yêu cầu kết thúc.
3a. Nếu phiên học không tồn tại, Backend trả HTTP 404; yêu cầu kết thúc.
5a. Nếu lượt đăng ký thiếu hoặc thuộc User khác, Backend trả HTTP 403; yêu cầu kết thúc.
6a. Nếu dữ liệu sai định dạng, Backend trả HTTP 422; yêu cầu kết thúc.

### 6. Hậu điều kiện
CSDL lưu trạng thái và thời điểm kết thúc phiên học.

### Thông điệp tuần tự
Client → Backend: Gửi trạng thái kết thúc
Backend → CSDL: Xác thực và tìm phiên
Backend → CSDL: Kiểm tra chủ sở hữu
Backend → CSDL: Lưu trạng thái kết thúc
Backend → Client: Trả phiên học

## 1. Tên chức năng: Ghi mẫu hướng nhìn
**Endpoint:** `POST /api/lessons/{lesson_id}/gaze-samples`
**Tệp định tuyến:** `backend/app/api/routes/gaze.py`

### 2. Tác nhân và thành phần tham gia
Tác nhân: User. Thành phần: Client, Backend, CSDL, Redis.

### 3. Tiền điều kiện
User đã đăng nhập và gửi ít nhất một mẫu hướng nhìn.

### 4. Luồng chính
1. Client gửi lô mẫu hướng nhìn.
2. Backend kiểm tra yêu cầu còn trong giới hạn qua Redis?
3. Backend kiểm tra xác thực yêu cầu hợp lệ?
4. Backend kiểm tra bài học tồn tại?
5. Backend kiểm tra dữ liệu đầu vào hợp lệ?
6. Backend kiểm tra dữ liệu đến từ theo dõi thật?
7. Backend xác định phiên học hợp lệ của User.
8. Backend kiểm tra User đã đồng ý theo dõi?
9. Backend phân loại mẫu theo slide và vùng hiển thị.
10. CSDL lưu dữ liệu hướng nhìn và số liệu thống kê.
11. Backend đồng bộ trạng thái phân tích.
12. Backend trả HTTP 200 cùng số mẫu trong vùng đã lưu.

### 5. Luồng rẽ nhánh
2a. Nếu Redis không khả dụng, Backend dùng bộ nhớ tiến trình rồi tiếp tục bước 3.
2b. Nếu vượt giới hạn, Backend trả HTTP 429, nghĩa là quá nhiều yêu cầu; yêu cầu kết thúc.
3a. Nếu xác thực sai hoặc tài khoản không hoạt động, Backend trả HTTP 401; yêu cầu kết thúc.
3b. Nếu xác thực yêu cầu ghi không hợp lệ, Backend trả HTTP 403; yêu cầu kết thúc.
4a. Nếu bài học không tồn tại, Backend trả HTTP 404; yêu cầu kết thúc.
5a. Nếu dữ liệu sai định dạng, Backend trả HTTP 422, nghĩa là không hợp lệ; yêu cầu kết thúc.
6a. Nếu dữ liệu mô phỏng, Backend trả HTTP 200 với số mẫu bằng không; yêu cầu kết thúc.
6b. Nếu dữ liệu thật vượt kích thước cho phép, Backend trả HTTP 422; yêu cầu kết thúc.
7a. Nếu phiên được chỉ định thiếu hoặc sai bài học, Backend trả HTTP 404; yêu cầu kết thúc.
7b. Nếu phiên được chỉ định thuộc User khác, Backend trả HTTP 403; yêu cầu kết thúc.
7c. Nếu không chỉ định phiên, Backend dùng phiên đang học gần nhất rồi tiếp tục bước 8.
7d. Nếu chưa có phiên nhưng đã đăng ký, Backend tạo phiên và gặp bước 8.
7e. Nếu chưa có phiên và chưa đăng ký, Backend trả HTTP 403; yêu cầu kết thúc.
8a. Nếu User chưa đồng ý, Backend trả HTTP 200 với số mẫu bằng không; yêu cầu kết thúc.
9a. Nếu mẫu thuộc slide khác, Backend bỏ mẫu đó rồi tiếp tục bước 10.
9b. Nếu mẫu ngoài vùng, Backend chỉ tính mẫu vào thống kê rồi tiếp tục bước 10.
9c. Nếu thời điểm mẫu bất thường, Backend dùng thời điểm hiện tại rồi tiếp tục bước 10.
11a. Nếu Redis giữ khóa, Backend bỏ cập nhật tổng hợp. Backend làm mới bộ đệm rồi tiếp tục bước 12.
11b. Nếu Redis lỗi, Backend cập nhật tổng hợp. Backend làm mới bộ đệm rồi tiếp tục bước 12.
11c. Nếu cập nhật tổng hợp lỗi, Backend trả HTTP 500. Dữ liệu bước 10 còn nguyên; yêu cầu kết thúc.

### 6. Hậu điều kiện
CSDL lưu thống kê mọi mẫu thuộc slide và chỉ lưu điểm trong vùng; phân tích được đồng bộ theo điều kiện.

### Thông điệp tuần tự
Client → Backend: Gửi lô mẫu
Backend → Redis: Kiểm tra giới hạn
Backend → CSDL: Xác thực và xác định phiên
Backend → CSDL: Kiểm tra slide
Backend → CSDL: Lưu mẫu và số liệu
Backend → Redis: Xin quyền cập nhật tổng hợp
Backend → CSDL: Cập nhật tổng hợp
Backend → Client: Trả số mẫu đã lưu

## 1. Tên chức năng: Lưu kết quả hiệu chỉnh
**Endpoint:** `POST /api/calibrations`
**Tệp định tuyến:** `backend/app/api/routes/calibration.py`

### 2. Tác nhân và thành phần tham gia
Tác nhân: User. Thành phần: Client, Backend, CSDL.

### 3. Tiền điều kiện
User đã đăng nhập và có kết quả hiệu chỉnh hợp lệ từ quy trình bên ngoài.

### 4. Luồng chính
1. Client gửi kết quả hiệu chỉnh.
2. Backend kiểm tra xác thực yêu cầu hợp lệ?
3. Backend kiểm tra dữ liệu đầu vào hợp lệ?
4. CSDL đồng bộ thiết bị của User.
5. CSDL tạo lần hiệu chỉnh hoàn tất.
6. CSDL vô hiệu hóa kết quả cũ của User trên thiết bị.
7. CSDL lưu kết quả mới đang hoạt động.
8. Backend trả HTTP 201 cùng thông tin hiệu chỉnh.

### 5. Luồng rẽ nhánh
2a. Nếu xác thực sai hoặc tài khoản không hoạt động, Backend trả HTTP 401; yêu cầu kết thúc.
2b. Nếu xác thực yêu cầu ghi không hợp lệ, Backend trả HTTP 403; yêu cầu kết thúc.
3a. Nếu dữ liệu sai định dạng, Backend trả HTTP 422; yêu cầu kết thúc.
4a. Nếu thiết bị đã tồn tại, CSDL cập nhật thông tin được cung cấp rồi tiếp tục bước 5.
4b. Nếu thiết bị chưa tồn tại, CSDL tạo thiết bị rồi tiếp tục bước 5.
6a. Nếu không có kết quả cũ, CSDL không vô hiệu hóa bản nào rồi tiếp tục bước 7.

### 6. Hậu điều kiện
CSDL chỉ giữ kết quả mới ở trạng thái hoạt động cho thiết bị.

### Thông điệp tuần tự
Client → Backend: Gửi kết quả hiệu chỉnh
Backend → CSDL: Xác thực tài khoản
Backend → CSDL: Tìm hoặc tạo thiết bị
Backend → CSDL: Tạo lần hiệu chỉnh
Backend → CSDL: Đổi kết quả đang hoạt động
Backend → Client: Trả HTTP 201

## 1. Tên chức năng: Xem trạng thái hiệu chỉnh đang hoạt động
**Endpoint:** `GET /api/calibrations/active`
**Tệp định tuyến:** `backend/app/api/routes/calibration.py`

### 2. Tác nhân và thành phần tham gia
Tác nhân: User. Thành phần: Client, Backend, CSDL.

### 3. Tiền điều kiện
User đã đăng nhập và gửi dấu nhận diện thiết bị.

### 4. Luồng chính
1. Client yêu cầu trạng thái hiệu chỉnh của thiết bị.
2. Backend kiểm tra xác thực yêu cầu hợp lệ?
3. Backend kiểm tra dữ liệu truy vấn hợp lệ?
4. CSDL tìm thiết bị của User.
5. Backend kiểm tra thiết bị tồn tại?
6. CSDL tìm kết quả hiệu chỉnh đang hoạt động.
7. Backend kiểm tra kết quả tồn tại?
8. Backend trả HTTP 200 cùng trạng thái hiệu chỉnh.

### 5. Luồng rẽ nhánh
2a. Nếu thiếu hoặc sai thông tin xác thực, Backend trả HTTP 401; yêu cầu kết thúc.
2b. Nếu tài khoản thiếu hoặc ngừng hoạt động, Backend trả HTTP 401; yêu cầu kết thúc.
3a. Nếu thiếu hoặc sai dữ liệu truy vấn, Backend trả HTTP 422; yêu cầu kết thúc.
5a. Nếu thiết bị không tồn tại, Backend trả HTTP 404; yêu cầu kết thúc.
7a. Nếu chưa có kết quả đang hoạt động, Backend trả HTTP 404; yêu cầu kết thúc.

### 6. Hậu điều kiện
Client nhận trạng thái hiệu chỉnh hiện hành của thiết bị.

### Thông điệp tuần tự
Client → Backend: Yêu cầu trạng thái hiệu chỉnh
Backend → CSDL: Xác thực tài khoản
Backend → CSDL: Tìm thiết bị
Backend → CSDL: Tìm kết quả hoạt động
CSDL → Backend: Trả kết quả
Backend → Client: Trả trạng thái

## 1. Tên chức năng: Lấy tham số hiệu chỉnh đang hoạt động
**Endpoint:** `GET /api/calibrations/active/params`
**Tệp định tuyến:** `backend/app/api/routes/calibration.py`

### 2. Tác nhân và thành phần tham gia
Tác nhân: User. Thành phần: Client, Backend, CSDL.

### 3. Tiền điều kiện
User đã đăng nhập và gửi dấu nhận diện thiết bị.

### 4. Luồng chính
1. Client yêu cầu dữ liệu hiệu chỉnh của thiết bị.
2. Backend kiểm tra xác thực yêu cầu hợp lệ?
3. Backend kiểm tra dữ liệu truy vấn hợp lệ?
4. CSDL tìm thiết bị của User.
5. Backend kiểm tra thiết bị tồn tại?
6. CSDL tìm kết quả hiệu chỉnh đang hoạt động.
7. Backend kiểm tra kết quả có dữ liệu đầy đủ?
8. Backend trả HTTP 200 cùng dữ liệu hiệu chỉnh.

### 5. Luồng rẽ nhánh
2a. Nếu thiếu hoặc sai thông tin xác thực, Backend trả HTTP 401; yêu cầu kết thúc.
2b. Nếu tài khoản thiếu hoặc ngừng hoạt động, Backend trả HTTP 401; yêu cầu kết thúc.
3a. Nếu thiếu hoặc sai dữ liệu truy vấn, Backend trả HTTP 422; yêu cầu kết thúc.
5a. Nếu thiết bị không tồn tại, Backend trả HTTP 404; yêu cầu kết thúc.
7a. Nếu thiếu kết quả hoặc dữ liệu hiệu chỉnh, Backend trả HTTP 404; yêu cầu kết thúc.

### 6. Hậu điều kiện
Client nhận dữ liệu hiệu chỉnh đang hoạt động của thiết bị.

### Thông điệp tuần tự
Client → Backend: Yêu cầu dữ liệu hiệu chỉnh
Backend → CSDL: Xác thực tài khoản
Backend → CSDL: Tìm thiết bị
Backend → CSDL: Tìm kết quả hoạt động
CSDL → Backend: Trả dữ liệu
Backend → Client: Trả dữ liệu hiệu chỉnh

## 1. Tên chức năng: Xem cấu hình hiệu chỉnh công khai nội bộ
**Endpoint:** `GET /api/calibrations/config`
**Tệp định tuyến:** `backend/app/api/routes/calibration.py`

### 2. Tác nhân và thành phần tham gia
Tác nhân: User. Thành phần: Client, Backend, CSDL.

### 3. Tiền điều kiện
User đã đăng nhập.

### 4. Luồng chính
1. Client yêu cầu cấu hình hiệu chỉnh.
2. Backend kiểm tra xác thực yêu cầu hợp lệ?
3. CSDL tìm cấu hình hiện hành.
4. Backend kiểm tra cấu hình tồn tại?
5. Backend trả HTTP 200 cùng cấu hình.

### 5. Luồng rẽ nhánh
2a. Nếu thiếu hoặc sai thông tin xác thực, Backend trả HTTP 401; yêu cầu kết thúc.
2b. Nếu tài khoản thiếu hoặc ngừng hoạt động, Backend trả HTTP 401; yêu cầu kết thúc.
4a. Nếu chưa có cấu hình, Backend trả HTTP 200 cùng cấu hình mặc định; yêu cầu kết thúc.

### 6. Hậu điều kiện
Client nhận cấu hình hiệu chỉnh hiện hành hoặc mặc định.

### Thông điệp tuần tự
Client → Backend: Yêu cầu cấu hình
Backend → CSDL: Xác thực tài khoản
Backend → CSDL: Tìm cấu hình
CSDL → Backend: Trả kết quả
Backend → Client: Trả cấu hình

## 1. Tên chức năng: Xem heatmap bài học
**Endpoint:** `GET /teacher/lessons/{lesson_id}/heatmap`
**Tệp định tuyến:** `backend/app/api/routes/analytics.py`

### 2. Tác nhân và thành phần tham gia
Tác nhân: Teacher hoặc Admin. Thành phần: Client, Backend, CSDL, Redis.

### 3. Tiền điều kiện
Teacher hoặc Admin đã đăng nhập; bộ lọc học viên và slide là tùy chọn.

### 4. Luồng chính
1. Client yêu cầu heatmap bài học.
2. Backend kiểm tra xác thực yêu cầu hợp lệ?
3. Backend kiểm tra vai trò phù hợp?
4. Backend kiểm tra bài học tồn tại?
5. Backend kiểm tra quyền truy cập khóa học?
6. Backend yêu cầu Redis tìm dữ liệu đã lưu?
7. Backend kiểm tra có bộ lọc slide?
8. Backend lọc slide tương ứng khi tìm thấy.
9. Backend trả HTTP 200 cùng thống kê slide.

### 5. Luồng rẽ nhánh
2a. Nếu xác thực sai hoặc tài khoản không hoạt động, Backend trả HTTP 401; yêu cầu kết thúc.
3a. Nếu sai vai trò, Backend trả HTTP 403; yêu cầu kết thúc.
4a. Nếu bài học không tồn tại, Backend trả HTTP 404; yêu cầu kết thúc.
5a. Nếu không sở hữu, quản trị hoặc được phân công, Backend trả HTTP 403; yêu cầu kết thúc.
6a. Nếu Redis có dữ liệu, Backend dùng dữ liệu đó rồi gặp bước 7.
6b. Nếu Redis thiếu hoặc lỗi, CSDL tính thống kê; Backend thử lưu Redis rồi gặp bước 7.
7a. Nếu không có bộ lọc slide, Backend giữ toàn bộ thống kê rồi tiếp tục bước 9.
8a. Nếu không tìm thấy slide lọc, Backend giữ toàn bộ thống kê rồi tiếp tục bước 9.

### 6. Hậu điều kiện
Client nhận thống kê heatmap; Redis có thể lưu kết quả để tái sử dụng.

### Thông điệp tuần tự
Client → Backend: Yêu cầu heatmap
Backend → CSDL: Xác thực và kiểm tra quyền
Backend → Redis: Tìm thống kê đã lưu
Backend → CSDL: Tính thống kê khi thiếu
Backend → Redis: Lưu thống kê mới
Backend → Client: Trả thống kê slide

## 1. Tên chức năng: Xem mức độ nắm vững bài học
**Endpoint:** `GET /teacher/lessons/{lesson_id}/mastery`
**Tệp định tuyến:** `backend/app/api/routes/analytics.py`

### 2. Tác nhân và thành phần tham gia
Tác nhân: Teacher hoặc Admin. Thành phần: Client, Backend, CSDL.

### 3. Tiền điều kiện
Teacher hoặc Admin đã đăng nhập và chỉ định học viên.

### 4. Luồng chính
1. Client yêu cầu mức độ nắm vững bài học.
2. Backend kiểm tra xác thực yêu cầu hợp lệ?
3. Backend kiểm tra vai trò phù hợp?
4. Backend kiểm tra bài học tồn tại?
5. Backend kiểm tra quyền truy cập khóa học?
6. Backend kiểm tra dữ liệu truy vấn hợp lệ?
7. CSDL tìm lượt đăng ký của học viên.
8. Backend kiểm tra lượt đăng ký tồn tại?
9. CSDL đọc slide, vùng nội dung và dữ liệu quan sát.
10. Backend kiểm tra bài học có slide?
11. Backend tính mức độ nắm vững.
12. Backend trả HTTP 200 cùng kết quả chi tiết.

### 5. Luồng rẽ nhánh
2a. Nếu xác thực sai hoặc tài khoản không hoạt động, Backend trả HTTP 401; yêu cầu kết thúc.
3a. Nếu sai vai trò, Backend trả HTTP 403; yêu cầu kết thúc.
4a. Nếu bài học không tồn tại, Backend trả HTTP 404; yêu cầu kết thúc.
5a. Nếu không sở hữu, quản trị hoặc được phân công, Backend trả HTTP 403; yêu cầu kết thúc.
6a. Nếu thiếu hoặc sai dữ liệu truy vấn, Backend trả HTTP 422; yêu cầu kết thúc.
8a. Nếu học viên chưa đăng ký khóa học, Backend trả HTTP 404; yêu cầu kết thúc.
10a. Nếu bài học chưa có slide, Backend trả HTTP 404; yêu cầu kết thúc.
11a. Nếu chưa có phiên quan sát, Backend tính kết quả từ dữ liệu trống rồi tiếp tục bước 12.
11b. Nếu slide thiếu vùng nội dung, Backend dùng tỷ lệ nhìn trên slide rồi tiếp tục bước 12.

### 6. Hậu điều kiện
Client nhận điểm và độ bao phủ từng slide của học viên.

### Thông điệp tuần tự
Client → Backend: Yêu cầu mức độ nắm vững
Backend → CSDL: Xác thực và kiểm tra quyền
Backend → CSDL: Tìm lượt đăng ký
Backend → CSDL: Đọc slide và quan sát
CSDL → Backend: Trả dữ liệu
Backend → Backend: Tính kết quả
Backend → Client: Trả kết quả chi tiết

## 1. Tên chức năng: Tính lại phân tích khóa học
**Endpoint:** `POST /teacher/courses/{course_id}/recompute`
**Tệp định tuyến:** `backend/app/api/routes/analytics.py`

### 2. Tác nhân và thành phần tham gia
Tác nhân: Teacher hoặc Admin. Thành phần: Client, Backend, CSDL, Redis.

### 3. Tiền điều kiện
Teacher hoặc Admin đã đăng nhập và xác định khóa học.

### 4. Luồng chính
1. Client yêu cầu tính lại phân tích.
2. Backend kiểm tra yêu cầu còn trong giới hạn qua Redis?
3. Backend kiểm tra xác thực yêu cầu hợp lệ?
4. Backend kiểm tra vai trò phù hợp?
5. Backend kiểm tra khóa học tồn tại?
6. Backend kiểm tra quyền quản lý khóa học?
7. CSDL đọc các bài học của khóa học.
8. Backend tính lại thống kê và mức độ nắm vững từng bài.
9. CSDL lưu toàn bộ kết quả.
10. Backend làm mới dữ liệu đệm từng bài.
11. Backend trả HTTP 200 cùng số kết quả tổng hợp.

### 5. Luồng rẽ nhánh
2a. Nếu Redis không khả dụng, Backend dùng bộ nhớ tiến trình rồi tiếp tục bước 3.
2b. Nếu vượt giới hạn, Backend trả HTTP 429, nghĩa là quá nhiều yêu cầu; yêu cầu kết thúc.
3a. Nếu xác thực sai hoặc tài khoản không hoạt động, Backend trả HTTP 401; yêu cầu kết thúc.
3b. Nếu xác thực yêu cầu ghi không hợp lệ, Backend trả HTTP 403; yêu cầu kết thúc.
4a. Nếu sai vai trò, Backend trả HTTP 403; yêu cầu kết thúc.
5a. Nếu khóa học thiếu hoặc đã xóa, Backend trả HTTP 404; yêu cầu kết thúc.
6a. Nếu không phải Admin hoặc chủ sở hữu, Backend trả HTTP 403; yêu cầu kết thúc.
7a. Nếu khóa học chưa có bài học, CSDL không tạo kết quả và tiếp tục bước 9.

### 6. Hậu điều kiện
CSDL chứa phân tích được tính lại; dữ liệu đệm cũ mất hiệu lực khi Redis khả dụng.

### Thông điệp tuần tự
Client → Backend: Yêu cầu tính lại
Backend → Redis: Kiểm tra giới hạn
Backend → CSDL: Xác thực và kiểm tra quyền
Backend → CSDL: Đọc bài học và dữ liệu
Backend → CSDL: Lưu kết quả mới
Backend → Redis: Làm mới dữ liệu đệm
Backend → Client: Trả số kết quả

## 1. Tên chức năng: Kiểm tra sức khỏe dịch vụ AI
**Endpoint:** `GET /ai/health`
**Tệp định tuyến:** `backend/app/api/routes/proxy.py`

### 2. Tác nhân và thành phần tham gia
Tác nhân: User. Thành phần: Client, Backend, Dịch vụ AI.

### 3. Tiền điều kiện
Backend có địa chỉ kết nối Dịch vụ AI; endpoint không yêu cầu đăng nhập.

### 4. Luồng chính
1. Client yêu cầu kiểm tra Dịch vụ AI.
2. Backend gửi yêu cầu sức khỏe đến Dịch vụ AI.
3. Backend kiểm tra Dịch vụ AI có phản hồi?
4. Backend kiểm tra trạng thái phản hồi thành công?
5. Backend trả HTTP 200 cùng kết quả và trạng thái nhận được.

### 5. Luồng rẽ nhánh
3a. Nếu kết nối lỗi, Backend trả HTTP 200 báo dịch vụ không khả dụng; yêu cầu kết thúc.
4a. Nếu trạng thái không thành công, Backend trả kết quả không khỏe cùng trạng thái rồi tiếp tục bước 5.

### 6. Hậu điều kiện
Client nhận tình trạng kết nối Dịch vụ AI tại thời điểm kiểm tra.

### Thông điệp tuần tự
Client → Backend: Yêu cầu kiểm tra AI
Backend → Dịch vụ AI: Yêu cầu sức khỏe
Dịch vụ AI → Backend: Trả trạng thái
Backend → Client: Trả kết quả kiểm tra

## 1. Tên chức năng: Tải ảnh slide có phiên bản
**Endpoint:** `GET /media/lessons/{lesson_id}/{version}/{filename}`
**Tệp định tuyến:** `backend/app/api/routes/media.py`

### 2. Tác nhân và thành phần tham gia
Tác nhân: User. Thành phần: Client, Backend, CSDL.

### 3. Tiền điều kiện
User đã đăng nhập và có đường dẫn ảnh slide.

### 4. Luồng chính
1. Client yêu cầu ảnh slide có phiên bản.
2. Backend kiểm tra xác thực yêu cầu hợp lệ?
3. Backend kiểm tra định dạng đường dẫn hợp lệ?
4. Backend kiểm tra bài học, chương và khóa học tồn tại?
5. Backend kiểm tra User có quyền truy cập khóa học?
6. Backend kiểm tra đường dẫn tệp nằm trong vùng lưu trữ?
7. Backend kiểm tra tệp tồn tại?
8. Backend trả HTTP 200 cùng ảnh slide.

### 5. Luồng rẽ nhánh
2a. Nếu thiếu hoặc sai thông tin xác thực, Backend trả HTTP 401; yêu cầu kết thúc.
2b. Nếu tài khoản thiếu hoặc ngừng hoạt động, Backend trả HTTP 401; yêu cầu kết thúc.
3a. Nếu định dạng đường dẫn sai, Backend trả HTTP 404; yêu cầu kết thúc.
4a. Nếu bài học, chương hoặc khóa học không tồn tại, Backend trả HTTP 404; yêu cầu kết thúc.
5a. Nếu không có quyền và chưa đăng ký hoạt động, Backend trả HTTP 403; yêu cầu kết thúc.
6a. Nếu đường dẫn vượt vùng lưu trữ, Backend trả HTTP 404; yêu cầu kết thúc.
7a. Nếu tệp không tồn tại, Backend trả HTTP 404; yêu cầu kết thúc.

### 6. Hậu điều kiện
Client nhận ảnh slide được phép truy cập; CSDL không thay đổi.

### Thông điệp tuần tự
Client → Backend: Yêu cầu ảnh slide
Backend → CSDL: Xác thực tài khoản
Backend → CSDL: Tìm bài học và khóa học
Backend → CSDL: Kiểm tra quyền hoặc đăng ký
Backend → Backend: Kiểm tra tệp
Backend → Client: Trả ảnh slide

## 1. Tên chức năng: Tải ảnh slide theo đường dẫn cũ
**Endpoint:** `GET /media/lessons/{lesson_id}/{filename}`
**Tệp định tuyến:** `backend/app/api/routes/media.py`

### 2. Tác nhân và thành phần tham gia
Tác nhân: User. Thành phần: Client, Backend, CSDL.

### 3. Tiền điều kiện
User đã đăng nhập và dùng đường dẫn ảnh không có phiên bản.

### 4. Luồng chính
1. Client yêu cầu ảnh slide theo đường dẫn cũ.
2. Backend kiểm tra xác thực yêu cầu hợp lệ?
3. Backend kiểm tra định dạng đường dẫn hợp lệ?
4. Backend kiểm tra bài học, chương và khóa học tồn tại?
5. Backend kiểm tra User có quyền truy cập khóa học?
6. Backend kiểm tra tệp cũ tồn tại?
7. Backend tìm tệp mới nhất trong các phiên bản.
8. Backend kiểm tra tìm thấy tệp thay thế?
9. Backend trả HTTP 200 cùng ảnh slide.

### 5. Luồng rẽ nhánh
2a. Nếu thiếu hoặc sai thông tin xác thực, Backend trả HTTP 401; yêu cầu kết thúc.
2b. Nếu tài khoản thiếu hoặc ngừng hoạt động, Backend trả HTTP 401; yêu cầu kết thúc.
3a. Nếu định dạng đường dẫn sai, Backend trả HTTP 404; yêu cầu kết thúc.
4a. Nếu bài học, chương hoặc khóa học không tồn tại, Backend trả HTTP 404; yêu cầu kết thúc.
5a. Nếu không có quyền và chưa đăng ký hoạt động, Backend trả HTTP 403; yêu cầu kết thúc.
6a. Nếu tệp cũ tồn tại, Backend trả tệp đó tại bước 9.
6b. Nếu tệp cũ không tồn tại, Backend tiếp tục bước 7.
8a. Nếu không tìm thấy tệp thay thế, Backend trả HTTP 404; yêu cầu kết thúc.

### 6. Hậu điều kiện
Client nhận ảnh cũ hoặc phiên bản mới nhất được tìm thấy.

### Thông điệp tuần tự
Client → Backend: Yêu cầu ảnh theo đường dẫn cũ
Backend → CSDL: Xác thực tài khoản
Backend → CSDL: Kiểm tra quyền hoặc đăng ký
Backend → Backend: Tìm tệp cũ
Backend → Backend: Tìm phiên bản mới nhất
Backend → Client: Trả ảnh slide

## 1. Tên chức năng: Kiểm tra sức khỏe Backend
**Endpoint:** `GET /health`
**Tệp định tuyến:** `backend/app/main.py`

### 2. Tác nhân và thành phần tham gia
Tác nhân: User. Thành phần: Client, Backend.

### 3. Tiền điều kiện
Backend đang nhận yêu cầu; endpoint không yêu cầu đăng nhập.

### 4. Luồng chính
1. Client yêu cầu kiểm tra sức khỏe Backend.
2. Backend tạo trạng thái hoạt động và tên ứng dụng.
3. Backend trả HTTP 200 cùng trạng thái.

### 5. Luồng rẽ nhánh
3a. Mã endpoint không định nghĩa nhánh rẽ; Backend luôn kết thúc tại bước 3.

### 6. Hậu điều kiện
Client nhận xác nhận Backend đang phục vụ yêu cầu.

### Thông điệp tuần tự
Client → Backend: Yêu cầu kiểm tra sức khỏe
Backend → Client: Trả trạng thái hoạt động

## 1. Tên chức năng: Xem cây nội dung khóa học
**Endpoint:** `GET /teacher/courses/{course_id}`
**Tệp định tuyến:** `backend/app/api/routes/courses.py`

### 2. Tác nhân và thành phần tham gia
Tác nhân: Teacher hoặc Admin. Thành phần: Client, Backend, CSDL.

### 3. Tiền điều kiện
Teacher hoặc Admin đã đăng nhập và xác định khóa học.

### 4. Luồng chính
1. Client yêu cầu cây nội dung khóa học.
2. Backend kiểm tra xác thực yêu cầu hợp lệ?
3. Backend kiểm tra vai trò phù hợp?
4. Backend kiểm tra khóa học tồn tại?
5. Backend kiểm tra quyền truy cập khóa học?
6. CSDL đọc chương, bài học và số học viên.
7. CSDL tổng hợp tiến độ, chú ý và mức độ nắm vững.
8. Backend trả HTTP 200 cùng cây nội dung.

### 5. Luồng rẽ nhánh
2a. Nếu xác thực sai hoặc tài khoản không hoạt động, Backend trả HTTP 401; yêu cầu kết thúc.
3a. Nếu sai vai trò, Backend trả HTTP 403; yêu cầu kết thúc.
4a. Nếu khóa học thiếu hoặc đã xóa, Backend trả HTTP 404; yêu cầu kết thúc.
5a. Nếu không sở hữu, quản trị hoặc được phân công, Backend trả HTTP 403; yêu cầu kết thúc.
6a. Nếu khóa học chưa có nội dung, Backend trả danh sách rỗng tại bước 8.

### 6. Hậu điều kiện
Client nhận cấu trúc khóa học và số liệu tổng hợp hiện tại.

### Thông điệp tuần tự
Client → Backend: Yêu cầu cây nội dung
Backend → CSDL: Xác thực và tìm khóa học
Backend → CSDL: Kiểm tra quyền truy cập
Backend → CSDL: Đọc nội dung và số liệu
CSDL → Backend: Trả dữ liệu tổng hợp
Backend → Client: Trả cây nội dung

## 1. Tên chức năng: Xem học viên của khóa học
**Endpoint:** `GET /teacher/courses/{course_id}/students`
**Tệp định tuyến:** `backend/app/api/routes/courses.py`

### 2. Tác nhân và thành phần tham gia
Tác nhân: Teacher hoặc Admin. Thành phần: Client, Backend, CSDL.

### 3. Tiền điều kiện
Teacher hoặc Admin đã đăng nhập và có quyền xem khóa học.

### 4. Luồng chính
1. Client yêu cầu danh sách học viên khóa học.
2. Backend kiểm tra xác thực yêu cầu hợp lệ?
3. Backend kiểm tra vai trò phù hợp?
4. Backend kiểm tra khóa học tồn tại?
5. Backend kiểm tra quyền truy cập khóa học?
6. CSDL đọc bài học và các lượt đăng ký.
7. Backend kiểm tra khóa học có học viên?
8. CSDL đọc tiến độ, chú ý, mức độ nắm vững và hoạt động.
9. Backend tổng hợp số liệu từng học viên.
10. Backend trả HTTP 200 cùng danh sách.

### 5. Luồng rẽ nhánh
2a. Nếu xác thực sai hoặc tài khoản không hoạt động, Backend trả HTTP 401; yêu cầu kết thúc.
3a. Nếu sai vai trò, Backend trả HTTP 403; yêu cầu kết thúc.
4a. Nếu khóa học thiếu hoặc đã xóa, Backend trả HTTP 404; yêu cầu kết thúc.
5a. Nếu không sở hữu, quản trị hoặc được phân công, Backend trả HTTP 403; yêu cầu kết thúc.
7a. Nếu không có học viên, Backend trả HTTP 200 với danh sách rỗng; yêu cầu kết thúc.

### 6. Hậu điều kiện
Client nhận danh sách học viên và số liệu học tập hiện tại.

### Thông điệp tuần tự
Client → Backend: Yêu cầu học viên khóa học
Backend → CSDL: Xác thực và kiểm tra quyền
Backend → CSDL: Đọc học viên và bài học
Backend → CSDL: Đọc số liệu học tập
CSDL → Backend: Trả dữ liệu
Backend → Client: Trả danh sách học viên

## 1. Tên chức năng: Tra cứu danh mục học viên
**Endpoint:** `GET /teacher/students`
**Tệp định tuyến:** `backend/app/api/routes/courses.py`

### 2. Tác nhân và thành phần tham gia
Tác nhân: Teacher hoặc Admin. Thành phần: Client, Backend, CSDL.

### 3. Tiền điều kiện
Teacher hoặc Admin đã đăng nhập; từ khóa tìm kiếm là tùy chọn.

### 4. Luồng chính
1. Client yêu cầu danh mục học viên.
2. Backend kiểm tra xác thực yêu cầu hợp lệ?
3. Backend kiểm tra vai trò phù hợp?
4. Backend kiểm tra dữ liệu truy vấn hợp lệ?
5. Backend kiểm tra từ khóa có nội dung?
6. CSDL tìm các học viên đang hoạt động.
7. Backend trả HTTP 200 cùng danh mục.

### 5. Luồng rẽ nhánh
2a. Nếu xác thực sai hoặc tài khoản không hoạt động, Backend trả HTTP 401; yêu cầu kết thúc.
3a. Nếu sai vai trò, Backend trả HTTP 403; yêu cầu kết thúc.
4a. Nếu dữ liệu truy vấn sai định dạng, Backend trả HTTP 422; yêu cầu kết thúc.
5a. Nếu không có từ khóa, CSDL bỏ điều kiện tìm kiếm rồi tiếp tục bước 6.
6a. Nếu không có kết quả, Backend trả HTTP 200 với danh sách rỗng.

### 6. Hậu điều kiện
Client nhận danh mục học viên phù hợp từ khóa.

### Thông điệp tuần tự
Client → Backend: Yêu cầu danh mục học viên
Backend → CSDL: Xác thực và kiểm tra vai trò
Backend → CSDL: Tìm học viên hoạt động
CSDL → Backend: Trả kết quả
Backend → Client: Trả danh mục học viên

## 1. Tên chức năng: Thêm học viên vào khóa học
**Endpoint:** `POST /teacher/courses/{course_id}/students`
**Tệp định tuyến:** `backend/app/api/routes/courses.py`

### 2. Tác nhân và thành phần tham gia
Tác nhân: Teacher hoặc Admin. Thành phần: Client, Backend, CSDL.

### 3. Tiền điều kiện
Teacher hoặc Admin đã đăng nhập và chọn học viên.

### 4. Luồng chính
1. Client gửi danh sách học viên cần thêm.
2. Backend kiểm tra xác thực yêu cầu hợp lệ?
3. Backend kiểm tra vai trò phù hợp?
4. Backend kiểm tra khóa học tồn tại?
5. Backend kiểm tra quyền quản lý khóa học?
6. Backend kiểm tra dữ liệu đầu vào hợp lệ?
7. Backend kiểm tra danh sách còn phần tử sau loại trùng?
8. CSDL xác định học viên hợp lệ và lượt đăng ký hiện có.
9. Backend đồng bộ lượt đăng ký cho học viên hợp lệ.
10. CSDL lưu thay đổi.
11. Backend trả HTTP 201 cùng số lượng đã thêm.

### 5. Luồng rẽ nhánh
2a. Nếu xác thực sai hoặc tài khoản không hoạt động, Backend trả HTTP 401; yêu cầu kết thúc.
2b. Nếu xác thực yêu cầu ghi không hợp lệ, Backend trả HTTP 403; yêu cầu kết thúc.
3a. Nếu sai vai trò, Backend trả HTTP 403; yêu cầu kết thúc.
4a. Nếu khóa học thiếu hoặc đã xóa, Backend trả HTTP 404; yêu cầu kết thúc.
5a. Nếu không phải Admin hoặc chủ sở hữu, Backend trả HTTP 403; yêu cầu kết thúc.
6a. Nếu dữ liệu sai định dạng, Backend trả HTTP 422; yêu cầu kết thúc.
7a. Nếu danh sách rỗng, Backend trả HTTP 400, nghĩa là chưa chọn học viên; yêu cầu kết thúc.
8a. Nếu định danh không thuộc học viên hợp lệ, Backend bỏ qua mục đó rồi tiếp tục bước 9.
9a. Nếu lượt đăng ký đang hoạt động, Backend giữ nguyên rồi xử lý học viên tiếp theo.
9b. Nếu lượt đăng ký ngừng hoạt động, Backend kích hoạt lại rồi xử lý học viên tiếp theo.
9c. Nếu chưa có lượt đăng ký, Backend tạo mới; mọi nhánh gặp bước 10.

### 6. Hậu điều kiện
CSDL lưu các lượt đăng ký mới hoặc được kích hoạt lại.

### Thông điệp tuần tự
Client → Backend: Gửi danh sách học viên
Backend → CSDL: Xác thực và kiểm tra quyền
Backend → CSDL: Xác minh học viên
Backend → CSDL: Đọc lượt đăng ký
Backend → CSDL: Lưu lượt đăng ký
Backend → Client: Trả số lượng đã thêm

## 1. Tên chức năng: Gỡ học viên khỏi khóa học
**Endpoint:** `DELETE /teacher/courses/{course_id}/students/{student_id}`
**Tệp định tuyến:** `backend/app/api/routes/courses.py`

### 2. Tác nhân và thành phần tham gia
Tác nhân: Teacher hoặc Admin. Thành phần: Client, Backend, CSDL.

### 3. Tiền điều kiện
Teacher hoặc Admin đã đăng nhập và xác định học viên trong khóa học.

### 4. Luồng chính
1. Client yêu cầu gỡ học viên.
2. Backend kiểm tra xác thực yêu cầu hợp lệ?
3. Backend kiểm tra vai trò phù hợp?
4. Backend kiểm tra khóa học tồn tại?
5. Backend kiểm tra quyền truy cập khóa học?
6. CSDL tìm lượt đăng ký của học viên.
7. Backend kiểm tra lượt đăng ký tồn tại?
8. CSDL chuyển lượt đăng ký sang trạng thái đã rời.
9. Backend trả HTTP 200 với kết quả thành công.

### 5. Luồng rẽ nhánh
2a. Nếu xác thực sai hoặc tài khoản không hoạt động, Backend trả HTTP 401; yêu cầu kết thúc.
2b. Nếu xác thực yêu cầu ghi không hợp lệ, Backend trả HTTP 403; yêu cầu kết thúc.
3a. Nếu sai vai trò, Backend trả HTTP 403; yêu cầu kết thúc.
4a. Nếu khóa học thiếu hoặc đã xóa, Backend trả HTTP 404; yêu cầu kết thúc.
5a. Nếu không sở hữu, quản trị hoặc được phân công, Backend trả HTTP 403; yêu cầu kết thúc.
7a. Nếu lượt đăng ký không tồn tại, Backend trả HTTP 404; yêu cầu kết thúc.

### 6. Hậu điều kiện
Lượt đăng ký của học viên được đánh dấu đã rời.

### Thông điệp tuần tự
Client → Backend: Yêu cầu gỡ học viên
Backend → CSDL: Xác thực và kiểm tra quyền
Backend → CSDL: Tìm lượt đăng ký
Backend → CSDL: Cập nhật trạng thái
Backend → Client: Báo thành công

## 1. Tên chức năng: Xem đề cương khóa học
**Endpoint:** `GET /api/courses/{course_id}`
**Tệp định tuyến:** `backend/app/api/routes/courses.py`

### 2. Tác nhân và thành phần tham gia
Tác nhân: User. Thành phần: Client, Backend, CSDL.

### 3. Tiền điều kiện
User đã đăng nhập và xác định khóa học cần xem.

### 4. Luồng chính
1. Client yêu cầu đề cương khóa học.
2. Backend kiểm tra xác thực yêu cầu hợp lệ?
3. Backend kiểm tra khóa học tồn tại?
4. Backend kiểm tra User được phép xem khóa học?
5. Backend kiểm tra User đã đăng ký khóa học?
6. CSDL đọc các bài đã hoàn thành.
7. Backend dựng đề cương cùng trạng thái hoàn thành.
8. Backend trả HTTP 200 cùng đề cương.

### 5. Luồng rẽ nhánh
2a. Nếu thiếu hoặc sai thông tin xác thực, Backend trả HTTP 401; yêu cầu kết thúc.
2b. Nếu tài khoản thiếu hoặc ngừng hoạt động, Backend trả HTTP 401; yêu cầu kết thúc.
3a. Nếu khóa học thiếu hoặc đã xóa, Backend trả HTTP 404; yêu cầu kết thúc.
4a. Nếu khóa học riêng tư và User không có quyền, Backend trả HTTP 403; yêu cầu kết thúc.
5a. Nếu chưa đăng ký nhưng được xem, Backend bỏ dữ liệu hoàn thành và tiếp tục bước 7.

### 6. Hậu điều kiện
Client nhận đề cương khóa học theo quyền hiện tại.

### Thông điệp tuần tự
Client → Backend: Yêu cầu đề cương
Backend → CSDL: Xác thực và tìm khóa học
Backend → CSDL: Kiểm tra lượt đăng ký
Backend → CSDL: Đọc tiến độ
CSDL → Backend: Trả nội dung
Backend → Client: Trả đề cương

## 1. Tên chức năng: Liệt kê giáo viên
**Endpoint:** `GET /admin/teachers`
**Tệp định tuyến:** `backend/app/api/routes/admin.py`

### 2. Tác nhân và thành phần tham gia
Tác nhân: Admin. Thành phần: Client, Backend, CSDL.

### 3. Tiền điều kiện
Admin đã đăng nhập; từ khóa tìm kiếm là tùy chọn.

### 4. Luồng chính
1. Client yêu cầu danh mục giáo viên.
2. Backend kiểm tra xác thực yêu cầu hợp lệ?
3. Backend kiểm tra vai trò Admin?
4. Backend kiểm tra từ khóa có nội dung?
5. CSDL tìm giáo viên đang hoạt động.
6. Backend trả HTTP 200 cùng danh mục.

### 5. Luồng rẽ nhánh
2a. Nếu xác thực sai hoặc tài khoản không hoạt động, Backend trả HTTP 401; yêu cầu kết thúc.
3a. Nếu không phải Admin, Backend trả HTTP 403; yêu cầu kết thúc.
4a. Nếu không có từ khóa, CSDL bỏ điều kiện tìm kiếm rồi tiếp tục bước 5.
5a. Nếu không có kết quả, Backend trả HTTP 200 với danh sách rỗng.

### 6. Hậu điều kiện
Client nhận danh mục giáo viên phù hợp từ khóa.

### Thông điệp tuần tự
Client → Backend: Yêu cầu danh mục giáo viên
Backend → CSDL: Xác thực Admin
Backend → CSDL: Tìm giáo viên
CSDL → Backend: Trả kết quả
Backend → Client: Trả danh mục

## 1. Tên chức năng: Xem giáo viên của khóa học
**Endpoint:** `GET /admin/courses/{course_id}/teachers`
**Tệp định tuyến:** `backend/app/api/routes/admin.py`

### 2. Tác nhân và thành phần tham gia
Tác nhân: Admin. Thành phần: Client, Backend, CSDL.

### 3. Tiền điều kiện
Admin đã đăng nhập và xác định khóa học.

### 4. Luồng chính
1. Client yêu cầu danh sách giáo viên khóa học.
2. Backend kiểm tra xác thực yêu cầu hợp lệ?
3. Backend kiểm tra vai trò Admin?
4. Backend kiểm tra khóa học tồn tại?
5. CSDL đọc chủ sở hữu và giáo viên được phân công.
6. Backend kiểm tra có giáo viên liên quan?
7. CSDL đọc thông tin các giáo viên.
8. Backend trả HTTP 200 cùng danh sách phân vai.

### 5. Luồng rẽ nhánh
2a. Nếu xác thực sai hoặc tài khoản không hoạt động, Backend trả HTTP 401; yêu cầu kết thúc.
3a. Nếu không phải Admin, Backend trả HTTP 403; yêu cầu kết thúc.
4a. Nếu khóa học thiếu hoặc đã xóa, Backend trả HTTP 404; yêu cầu kết thúc.
6a. Nếu không có giáo viên liên quan, Backend trả HTTP 200 với danh sách rỗng; yêu cầu kết thúc.
8a. Nếu thiếu hồ sơ liên quan, Backend bỏ mục đó và vẫn trả các mục còn lại.

### 6. Hậu điều kiện
Client nhận chủ sở hữu và giáo viên được phân công.

### Thông điệp tuần tự
Client → Backend: Yêu cầu giáo viên khóa học
Backend → CSDL: Xác thực Admin
Backend → CSDL: Tìm khóa học
Backend → CSDL: Đọc phân công và hồ sơ
CSDL → Backend: Trả danh sách
Backend → Client: Trả danh sách phân vai

## 1. Tên chức năng: Phân công giáo viên
**Endpoint:** `POST /admin/courses/{course_id}/teachers`
**Tệp định tuyến:** `backend/app/api/routes/admin.py`

### 2. Tác nhân và thành phần tham gia
Tác nhân: Admin. Thành phần: Client, Backend, CSDL, Redis.

### 3. Tiền điều kiện
Admin đã đăng nhập và chọn giáo viên cho khóa học.

### 4. Luồng chính
1. Client gửi danh sách giáo viên.
2. Backend kiểm tra yêu cầu còn trong giới hạn qua Redis?
3. Backend kiểm tra xác thực yêu cầu hợp lệ?
4. Backend kiểm tra vai trò Admin?
5. Backend kiểm tra khóa học tồn tại?
6. Backend kiểm tra dữ liệu đầu vào hợp lệ?
7. Backend kiểm tra danh sách còn phần tử sau loại trùng?
8. CSDL đọc các phân công hiện có.
9. Backend kiểm tra từng giáo viên mới có hồ sơ phù hợp?
10. CSDL tạo các phân công mới.
11. CSDL lưu thay đổi.
12. Backend trả HTTP 201 cùng kết quả.

### 5. Luồng rẽ nhánh
2a. Nếu Redis không khả dụng, Backend dùng bộ nhớ tiến trình rồi tiếp tục bước 3.
2b. Nếu vượt giới hạn, Backend trả HTTP 429, nghĩa là quá nhiều yêu cầu; yêu cầu kết thúc.
3a. Nếu xác thực sai hoặc tài khoản không hoạt động, Backend trả HTTP 401; yêu cầu kết thúc.
3b. Nếu xác thực yêu cầu ghi không hợp lệ, Backend trả HTTP 403; yêu cầu kết thúc.
4a. Nếu không phải Admin, Backend trả HTTP 403; yêu cầu kết thúc.
5a. Nếu khóa học thiếu hoặc đã xóa, Backend trả HTTP 404; yêu cầu kết thúc.
6a. Nếu dữ liệu sai định dạng, Backend trả HTTP 422; yêu cầu kết thúc.
7a. Nếu danh sách rỗng, Backend trả HTTP 400; yêu cầu kết thúc.
9a. Nếu là chủ sở hữu hoặc đã được phân công, Backend bỏ qua mục đó rồi tiếp tục.
9b. Nếu thiếu hồ sơ giáo viên, Backend trả HTTP 400; yêu cầu kết thúc.

### 6. Hậu điều kiện
CSDL lưu các phân công giáo viên chưa tồn tại.

### Thông điệp tuần tự
Client → Backend: Gửi danh sách giáo viên
Backend → Redis: Kiểm tra giới hạn
Backend → CSDL: Xác thực Admin
Backend → CSDL: Tìm khóa học và phân công
Backend → CSDL: Xác minh giáo viên
Backend → CSDL: Lưu phân công
Backend → Client: Trả HTTP 201

## 1. Tên chức năng: Gỡ phân công giáo viên
**Endpoint:** `DELETE /admin/courses/{course_id}/teachers/{teacher_id}`
**Tệp định tuyến:** `backend/app/api/routes/admin.py`

### 2. Tác nhân và thành phần tham gia
Tác nhân: Admin. Thành phần: Client, Backend, CSDL.

### 3. Tiền điều kiện
Admin đã đăng nhập và xác định giáo viên cần gỡ.

### 4. Luồng chính
1. Client yêu cầu gỡ phân công giáo viên.
2. Backend kiểm tra xác thực yêu cầu hợp lệ?
3. Backend kiểm tra vai trò Admin?
4. Backend kiểm tra khóa học tồn tại?
5. Backend kiểm tra giáo viên không phải chủ sở hữu?
6. CSDL tìm phân công giáo viên.
7. Backend kiểm tra phân công tồn tại?
8. CSDL xóa phân công.
9. CSDL lưu thay đổi.
10. Backend trả HTTP 200 với kết quả thành công.

### 5. Luồng rẽ nhánh
2a. Nếu xác thực sai hoặc tài khoản không hoạt động, Backend trả HTTP 401; yêu cầu kết thúc.
2b. Nếu xác thực yêu cầu ghi không hợp lệ, Backend trả HTTP 403; yêu cầu kết thúc.
3a. Nếu không phải Admin, Backend trả HTTP 403; yêu cầu kết thúc.
4a. Nếu khóa học thiếu hoặc đã xóa, Backend trả HTTP 404; yêu cầu kết thúc.
5a. Nếu là chủ sở hữu, Backend trả HTTP 400, nghĩa là không thể gỡ; yêu cầu kết thúc.
7a. Nếu phân công không tồn tại, Backend trả HTTP 404; yêu cầu kết thúc.

### 6. Hậu điều kiện
Phân công giáo viên được xóa khỏi CSDL.

### Thông điệp tuần tự
Client → Backend: Yêu cầu gỡ phân công
Backend → CSDL: Xác thực Admin
Backend → CSDL: Tìm khóa học
Backend → CSDL: Tìm và xóa phân công
Backend → Client: Báo thành công

## 1. Tên chức năng: Xem cấu hình hiệu chỉnh
**Endpoint:** `GET /admin/calibration-settings`
**Tệp định tuyến:** `backend/app/api/routes/admin.py`

### 2. Tác nhân và thành phần tham gia
Tác nhân: Admin. Thành phần: Client, Backend, CSDL.

### 3. Tiền điều kiện
Admin đã đăng nhập.

### 4. Luồng chính
1. Client yêu cầu cấu hình hiệu chỉnh.
2. Backend kiểm tra xác thực yêu cầu hợp lệ?
3. Backend kiểm tra vai trò Admin?
4. CSDL tìm cấu hình hiện hành.
5. Backend kiểm tra cấu hình tồn tại?
6. Backend trả HTTP 200 cùng cấu hình.

### 5. Luồng rẽ nhánh
2a. Nếu xác thực sai hoặc tài khoản không hoạt động, Backend trả HTTP 401; yêu cầu kết thúc.
3a. Nếu không phải Admin, Backend trả HTTP 403; yêu cầu kết thúc.
5a. Nếu chưa có cấu hình, Backend tạo giá trị mặc định tạm thời rồi tiếp tục bước 6.

### 6. Hậu điều kiện
Client nhận cấu hình; CSDL không lưu cấu hình mặc định khi bản ghi chưa tồn tại.

### Thông điệp tuần tự
Client → Backend: Yêu cầu cấu hình
Backend → CSDL: Xác thực Admin
Backend → CSDL: Tìm cấu hình
CSDL → Backend: Trả cấu hình
Backend → Client: Trả cấu hình

## 1. Tên chức năng: Cập nhật cấu hình hiệu chỉnh
**Endpoint:** `PUT /admin/calibration-settings`
**Tệp định tuyến:** `backend/app/api/routes/admin.py`

### 2. Tác nhân và thành phần tham gia
Tác nhân: Admin. Thành phần: Client, Backend, CSDL.

### 3. Tiền điều kiện
Admin đã đăng nhập và chuẩn bị cấu hình mới.

### 4. Luồng chính
1. Client gửi cấu hình hiệu chỉnh mới.
2. Backend kiểm tra xác thực yêu cầu hợp lệ?
3. Backend kiểm tra vai trò Admin?
4. Backend kiểm tra dữ liệu đầu vào hợp lệ?
5. CSDL tìm cấu hình hiện hành.
6. Backend kiểm tra cấu hình tồn tại?
7. CSDL cập nhật cấu hình, người sửa và thời điểm.
8. Backend trả HTTP 200 cùng cấu hình mới.

### 5. Luồng rẽ nhánh
2a. Nếu xác thực sai hoặc tài khoản không hoạt động, Backend trả HTTP 401; yêu cầu kết thúc.
2b. Nếu xác thực yêu cầu ghi không hợp lệ, Backend trả HTTP 403; yêu cầu kết thúc.
3a. Nếu không phải Admin, Backend trả HTTP 403; yêu cầu kết thúc.
4a. Nếu dữ liệu sai định dạng, Backend trả HTTP 422; yêu cầu kết thúc.
6a. Nếu chưa có cấu hình, Backend tạo cấu hình mặc định rồi tiếp tục bước 7.

### 6. Hậu điều kiện
CSDL lưu cấu hình hiệu chỉnh mới và thông tin cập nhật.

### Thông điệp tuần tự
Client → Backend: Gửi cấu hình mới
Backend → CSDL: Xác thực Admin
Backend → CSDL: Tìm cấu hình
Backend → CSDL: Lưu cấu hình mới
CSDL → Backend: Trả cấu hình
Backend → Client: Trả cấu hình mới

## 1. Tên chức năng: Tạo chương
**Endpoint:** `POST /teacher/courses/{course_id}/modules`
**Tệp định tuyến:** `backend/app/api/routes/modules.py`

### 2. Tác nhân và thành phần tham gia
Tác nhân: Teacher hoặc Admin. Thành phần: Client, Backend, CSDL.

### 3. Tiền điều kiện
Teacher hoặc Admin đã đăng nhập và chuẩn bị tên chương.

### 4. Luồng chính
1. Client gửi thông tin chương mới.
2. Backend kiểm tra xác thực yêu cầu hợp lệ?
3. Backend kiểm tra vai trò phù hợp?
4. Backend kiểm tra khóa học tồn tại?
5. Backend kiểm tra quyền quản lý khóa học?
6. Backend kiểm tra dữ liệu đầu vào hợp lệ?
7. CSDL xác định thứ tự tiếp theo.
8. CSDL tạo chương.
9. CSDL lưu thay đổi.
10. Backend trả HTTP 201 cùng chương mới.

### 5. Luồng rẽ nhánh
2a. Nếu xác thực sai hoặc tài khoản không hoạt động, Backend trả HTTP 401; yêu cầu kết thúc.
2b. Nếu xác thực yêu cầu ghi không hợp lệ, Backend trả HTTP 403; yêu cầu kết thúc.
3a. Nếu sai vai trò, Backend trả HTTP 403; yêu cầu kết thúc.
4a. Nếu khóa học thiếu hoặc đã xóa, Backend trả HTTP 404; yêu cầu kết thúc.
5a. Nếu không phải Admin hoặc chủ sở hữu, Backend trả HTTP 403; yêu cầu kết thúc.
6a. Nếu dữ liệu sai định dạng, Backend trả HTTP 422; yêu cầu kết thúc.

### 6. Hậu điều kiện
CSDL lưu chương mới ở cuối khóa học.

### Thông điệp tuần tự
Client → Backend: Gửi chương mới
Backend → CSDL: Xác thực và tìm khóa học
Backend → CSDL: Kiểm tra quyền quản lý
Backend → CSDL: Xác định thứ tự
Backend → CSDL: Lưu chương
Backend → Client: Trả HTTP 201

## 1. Tên chức năng: Cập nhật chương
**Endpoint:** `PATCH /teacher/modules/{module_id}`
**Tệp định tuyến:** `backend/app/api/routes/modules.py`

### 2. Tác nhân và thành phần tham gia
Tác nhân: Teacher hoặc Admin. Thành phần: Client, Backend, CSDL.

### 3. Tiền điều kiện
Teacher hoặc Admin đã đăng nhập và xác định chương.

### 4. Luồng chính
1. Client gửi thay đổi chương.
2. Backend kiểm tra xác thực yêu cầu hợp lệ?
3. Backend kiểm tra vai trò phù hợp?
4. Backend kiểm tra chương tồn tại?
5. Backend kiểm tra khóa học tồn tại?
6. Backend kiểm tra quyền quản lý khóa học?
7. Backend kiểm tra dữ liệu đầu vào hợp lệ?
8. CSDL cập nhật chương.
9. CSDL lưu thay đổi.
10. Backend trả HTTP 200 cùng chương mới.

### 5. Luồng rẽ nhánh
2a. Nếu xác thực sai hoặc tài khoản không hoạt động, Backend trả HTTP 401; yêu cầu kết thúc.
2b. Nếu xác thực yêu cầu ghi không hợp lệ, Backend trả HTTP 403; yêu cầu kết thúc.
3a. Nếu sai vai trò, Backend trả HTTP 403; yêu cầu kết thúc.
4a. Nếu chương không tồn tại, Backend trả HTTP 404; yêu cầu kết thúc.
5a. Nếu khóa học thiếu hoặc đã xóa, Backend trả HTTP 404; yêu cầu kết thúc.
6a. Nếu không phải Admin hoặc chủ sở hữu, Backend trả HTTP 403; yêu cầu kết thúc.
7a. Nếu dữ liệu sai định dạng, Backend trả HTTP 422; yêu cầu kết thúc.

### 6. Hậu điều kiện
CSDL lưu tên chương mới khi được cung cấp.

### Thông điệp tuần tự
Client → Backend: Gửi thay đổi chương
Backend → CSDL: Xác thực và tìm chương
Backend → CSDL: Tìm khóa học
Backend → CSDL: Kiểm tra quyền quản lý
Backend → CSDL: Lưu thay đổi
Backend → Client: Trả chương mới

## 1. Tên chức năng: Xóa chương
**Endpoint:** `DELETE /teacher/modules/{module_id}`
**Tệp định tuyến:** `backend/app/api/routes/modules.py`

### 2. Tác nhân và thành phần tham gia
Tác nhân: Teacher hoặc Admin. Thành phần: Client, Backend, CSDL.

### 3. Tiền điều kiện
Teacher hoặc Admin đã đăng nhập và xác định chương cần xóa.

### 4. Luồng chính
1. Client yêu cầu xóa chương.
2. Backend kiểm tra xác thực yêu cầu hợp lệ?
3. Backend kiểm tra vai trò phù hợp?
4. Backend kiểm tra chương tồn tại?
5. Backend kiểm tra khóa học tồn tại?
6. Backend kiểm tra quyền quản lý khóa học?
7. CSDL xóa chương.
8. CSDL lưu thay đổi.
9. Backend trả HTTP 200 với kết quả thành công.

### 5. Luồng rẽ nhánh
2a. Nếu xác thực sai hoặc tài khoản không hoạt động, Backend trả HTTP 401; yêu cầu kết thúc.
2b. Nếu xác thực yêu cầu ghi không hợp lệ, Backend trả HTTP 403; yêu cầu kết thúc.
3a. Nếu sai vai trò, Backend trả HTTP 403; yêu cầu kết thúc.
4a. Nếu chương không tồn tại, Backend trả HTTP 404; yêu cầu kết thúc.
5a. Nếu khóa học thiếu hoặc đã xóa, Backend trả HTTP 404; yêu cầu kết thúc.
6a. Nếu không phải Admin hoặc chủ sở hữu, Backend trả HTTP 403; yêu cầu kết thúc.

### 6. Hậu điều kiện
Chương và dữ liệu phụ thuộc bị xóa khỏi CSDL.

### Thông điệp tuần tự
Client → Backend: Yêu cầu xóa chương
Backend → CSDL: Xác thực và tìm chương
Backend → CSDL: Kiểm tra quyền quản lý
Backend → CSDL: Xóa chương
Backend → Client: Báo thành công

## 1. Tên chức năng: Tạo bài học
**Endpoint:** `POST /teacher/modules/{module_id}/lessons`
**Tệp định tuyến:** `backend/app/api/routes/lessons.py`

### 2. Tác nhân và thành phần tham gia
Tác nhân: Teacher hoặc Admin. Thành phần: Client, Backend, CSDL.

### 3. Tiền điều kiện
Teacher hoặc Admin đã đăng nhập và chuẩn bị thông tin bài học.

### 4. Luồng chính
1. Client gửi thông tin bài học mới.
2. Backend kiểm tra xác thực yêu cầu hợp lệ?
3. Backend kiểm tra vai trò phù hợp?
4. Backend kiểm tra chương tồn tại?
5. Backend kiểm tra quyền quản lý khóa học?
6. Backend kiểm tra dữ liệu đầu vào hợp lệ?
7. CSDL xác định thứ tự tiếp theo.
8. CSDL tạo bài học.
9. CSDL lưu thay đổi.
10. Backend trả HTTP 201 cùng bài học mới.

### 5. Luồng rẽ nhánh
2a. Nếu xác thực sai hoặc tài khoản không hoạt động, Backend trả HTTP 401; yêu cầu kết thúc.
2b. Nếu xác thực yêu cầu ghi không hợp lệ, Backend trả HTTP 403; yêu cầu kết thúc.
3a. Nếu sai vai trò, Backend trả HTTP 403; yêu cầu kết thúc.
4a. Nếu chương không tồn tại, Backend trả HTTP 404; yêu cầu kết thúc.
5a. Nếu khóa học thiếu hoặc không được quản lý, Backend trả HTTP 403; yêu cầu kết thúc.
6a. Nếu dữ liệu sai định dạng, Backend trả HTTP 422; yêu cầu kết thúc.

### 6. Hậu điều kiện
CSDL lưu bài học mới ở cuối chương.

### Thông điệp tuần tự
Client → Backend: Gửi bài học mới
Backend → CSDL: Xác thực và tìm chương
Backend → CSDL: Kiểm tra quyền quản lý
Backend → CSDL: Xác định thứ tự
Backend → CSDL: Lưu bài học
Backend → Client: Trả HTTP 201

## 1. Tên chức năng: Cập nhật bài học
**Endpoint:** `PATCH /teacher/lessons/{lesson_id}`
**Tệp định tuyến:** `backend/app/api/routes/lessons.py`

### 2. Tác nhân và thành phần tham gia
Tác nhân: Teacher hoặc Admin. Thành phần: Client, Backend, CSDL.

### 3. Tiền điều kiện
Teacher hoặc Admin đã đăng nhập và xác định bài học.

### 4. Luồng chính
1. Client gửi thay đổi bài học.
2. Backend kiểm tra xác thực yêu cầu hợp lệ?
3. Backend kiểm tra vai trò phù hợp?
4. Backend kiểm tra bài học tồn tại?
5. Backend kiểm tra quyền quản lý khóa học?
6. Backend kiểm tra dữ liệu đầu vào hợp lệ?
7. CSDL cập nhật bài học.
8. CSDL lưu thay đổi.
9. Backend trả HTTP 200 với kết quả thành công.

### 5. Luồng rẽ nhánh
2a. Nếu xác thực sai hoặc tài khoản không hoạt động, Backend trả HTTP 401; yêu cầu kết thúc.
2b. Nếu xác thực yêu cầu ghi không hợp lệ, Backend trả HTTP 403; yêu cầu kết thúc.
3a. Nếu sai vai trò, Backend trả HTTP 403; yêu cầu kết thúc.
4a. Nếu định danh sai hoặc bài học không tồn tại, Backend trả HTTP 404; yêu cầu kết thúc.
5a. Nếu không phải Admin hoặc chủ sở hữu, Backend trả HTTP 403; yêu cầu kết thúc.
6a. Nếu dữ liệu sai định dạng, Backend trả HTTP 422; yêu cầu kết thúc.

### 6. Hậu điều kiện
CSDL lưu tiêu đề và liên kết nội dung mới của bài học.

### Thông điệp tuần tự
Client → Backend: Gửi thay đổi bài học
Backend → CSDL: Xác thực và tìm bài học
Backend → CSDL: Kiểm tra quyền quản lý
Backend → CSDL: Lưu thay đổi
Backend → Client: Báo thành công

## 1. Tên chức năng: Xóa bài học
**Endpoint:** `DELETE /teacher/lessons/{lesson_id}`
**Tệp định tuyến:** `backend/app/api/routes/lessons.py`

### 2. Tác nhân và thành phần tham gia
Tác nhân: Teacher hoặc Admin. Thành phần: Client, Backend, CSDL.

### 3. Tiền điều kiện
Teacher hoặc Admin đã đăng nhập và xác định bài học cần xóa.

### 4. Luồng chính
1. Client yêu cầu xóa bài học.
2. Backend kiểm tra xác thực yêu cầu hợp lệ?
3. Backend kiểm tra vai trò phù hợp?
4. Backend kiểm tra bài học tồn tại?
5. Backend kiểm tra quyền quản lý khóa học?
6. CSDL xóa bài học.
7. CSDL lưu thay đổi.
8. Backend xóa các tệp trình chiếu liên quan.
9. Backend trả HTTP 200 với kết quả thành công.

### 5. Luồng rẽ nhánh
2a. Nếu xác thực sai hoặc tài khoản không hoạt động, Backend trả HTTP 401; yêu cầu kết thúc.
2b. Nếu xác thực yêu cầu ghi không hợp lệ, Backend trả HTTP 403; yêu cầu kết thúc.
3a. Nếu sai vai trò, Backend trả HTTP 403; yêu cầu kết thúc.
4a. Nếu định danh sai hoặc bài học không tồn tại, Backend trả HTTP 404; yêu cầu kết thúc.
5a. Nếu không phải Admin hoặc chủ sở hữu, Backend trả HTTP 403; yêu cầu kết thúc.
8a. Nếu không xóa được tệp, Backend bỏ qua lỗi và tiếp tục bước 9.

### 6. Hậu điều kiện
Bài học và dữ liệu phụ thuộc bị xóa; Backend đã thử xóa tệp trình chiếu.

### Thông điệp tuần tự
Client → Backend: Yêu cầu xóa bài học
Backend → CSDL: Xác thực và tìm bài học
Backend → CSDL: Kiểm tra quyền quản lý
Backend → CSDL: Xóa bài học
Backend → Backend: Xóa tệp trình chiếu
Backend → Client: Báo thành công
