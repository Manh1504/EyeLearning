-- =====================================================================
-- EYETRACKING LEARNING ANALYTICS — SCHEMA KHỞI TẠO
-- Yêu cầu: PostgreSQL 13+ (gen_random_uuid(), native partitioning)
-- Chạy:    psql -d eyetracking -f 001_init.sql
-- Idempotent: chạy lại an toàn (IF NOT EXISTS)
-- =====================================================================

BEGIN;
-- =====================================================================
-- 1) AUTH & PHÂN QUYỀN
-- =====================================================================

CREATE TABLE IF NOT EXISTS user_statuses (
    id      SMALLSERIAL PRIMARY KEY,
    code    VARCHAR(30) UNIQUE NOT NULL,
    label   VARCHAR(100)
);

CREATE TABLE IF NOT EXISTS users (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email               VARCHAR(255) UNIQUE NOT NULL,
    phone               VARCHAR(20)  UNIQUE,
    password_hash       VARCHAR(255),           -- NULL nếu login OAuth-only
    status_id           SMALLINT NOT NULL REFERENCES user_statuses(id),
    last_login_at       TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at          TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS roles (
    id      SMALLSERIAL PRIMARY KEY,
    code    VARCHAR(30) UNIQUE NOT NULL,   -- 'admin' | 'teacher' | 'student'
    label   VARCHAR(100)
);

CREATE TABLE IF NOT EXISTS permissions (
    id      SMALLSERIAL PRIMARY KEY,
    code    VARCHAR(60) UNIQUE NOT NULL,   -- 'course.create' | 'heatmap.view.class'...
    label   VARCHAR(100)
);

CREATE TABLE IF NOT EXISTS role_permissions (
    role_id       SMALLINT NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    permission_id SMALLINT NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
    PRIMARY KEY (role_id, permission_id)
);

-- Một user có thể giữ nhiều role cùng lúc
CREATE TABLE IF NOT EXISTS user_roles (
    user_id    UUID     NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role_id    SMALLINT NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    granted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, role_id)
);

-- Đăng nhập qua Google/Facebook... không đụng bảng users
CREATE TABLE IF NOT EXISTS oauth_accounts (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    provider        VARCHAR(30) NOT NULL,      -- 'google' | 'facebook'
    provider_uid    VARCHAR(255) NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (provider, provider_uid)
);

-- Session / refresh token, hỗ trợ đăng nhập nhiều thiết bị
CREATE TABLE IF NOT EXISTS auth_sessions (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id            UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    refresh_token_hash VARCHAR(255) NOT NULL,
    user_agent         TEXT,
    ip_address         INET,
    expires_at         TIMESTAMPTZ NOT NULL,
    revoked_at         TIMESTAMPTZ,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =====================================================================
-- 2) THÔNG TIN CÁ NHÂN (tách khỏi users để users chỉ lo auth)
-- =====================================================================

CREATE TABLE IF NOT EXISTS genders (
    id    SMALLSERIAL PRIMARY KEY,
    code  VARCHAR(20) UNIQUE NOT NULL,
    label VARCHAR(50)
);

-- Thông tin cá nhân chung (dùng chung cho cả sinh viên và giáo viên)
CREATE TABLE IF NOT EXISTS user_profiles (
    user_id        UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    full_name      VARCHAR(150) NOT NULL,   -- họ tên
    date_of_birth  DATE,                    -- ngày tháng năm sinh
    gender_id      SMALLINT REFERENCES genders(id),
    email          VARCHAR(255),            -- email liên hệ
    phone          VARCHAR(20),             -- số điện thoại
    avatar_url     TEXT,
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Thông tin đặc thù sinh viên
CREATE TABLE IF NOT EXISTS student_profiles (
    user_id       UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    student_code  VARCHAR(30) UNIQUE NOT NULL,   -- mã sinh viên
    program       VARCHAR(200),                  -- chương trình đào tạo / lớp học
    extra         JSONB NOT NULL DEFAULT '{}'
);

-- Thông tin đặc thù giáo viên
CREATE TABLE IF NOT EXISTS teacher_profiles (
    user_id       UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    teacher_code  VARCHAR(30) UNIQUE NOT NULL,   -- mã giảng viên
    department    VARCHAR(150),                  -- khoa
    extra         JSONB NOT NULL DEFAULT '{}'
);

-- =====================================================================
-- 3) KHÓA HỌC & BÀI GIẢNG
-- =====================================================================
CREATE TABLE IF NOT EXISTS course_statuses (
    id    SMALLSERIAL PRIMARY KEY,
    code  VARCHAR(30) UNIQUE NOT NULL,   -- draft, published, archived
    label VARCHAR(100)
);

CREATE TABLE IF NOT EXISTS courses (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title         VARCHAR(255) NOT NULL,
    description   TEXT,
    level         VARCHAR(30),           -- beginner/intermediate/advanced
    thumbnail_url TEXT,
    status_id     SMALLINT NOT NULL REFERENCES course_statuses(id),
    teacher_id    UUID NOT NULL REFERENCES teacher_profiles(user_id), -- giảng viên phụ trách
    created_by    UUID NOT NULL REFERENCES users(id),
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at    TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS modules (           -- chương/section trong khóa học
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    course_id   UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    title       VARCHAR(255) NOT NULL,
    order_index INT NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (course_id, order_index)
);

-- Toàn bộ bài học đều dạng SLIDE (một bài = một deck ảnh slide).
CREATE TABLE IF NOT EXISTS lessons (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    module_id     UUID NOT NULL REFERENCES modules(id) ON DELETE CASCADE,
    title         VARCHAR(255) NOT NULL,
    order_index   INT NOT NULL,
    content_url   TEXT,                 -- file nguồn slide đã upload: pdf/pptx
    metadata      JSONB NOT NULL DEFAULT '{}',
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (module_id, order_index)
);

-- Từng SLIDE trong bài học -> "đối tượng" để gắn AOI/heatmap.
-- image_url: ảnh render của slide (nền để vẽ heatmap / định AOI).
CREATE TABLE IF NOT EXISTS lesson_contents (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lesson_id    UUID NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
    order_index  INT NOT NULL,
    image_url    TEXT NOT NULL,         -- ảnh slide, vẽ heatmap lên đây
    content_json JSONB NOT NULL DEFAULT '{}',
    UNIQUE (lesson_id, order_index)
);

CREATE TABLE IF NOT EXISTS enrollments (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    course_id        UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    student_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    enrolled_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    status           VARCHAR(30) NOT NULL DEFAULT 'active'
                     CHECK (status IN ('active', 'completed', 'dropped')),
    UNIQUE (course_id, student_id)
);

CREATE TABLE IF NOT EXISTS lesson_progress (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    enrollment_id UUID NOT NULL REFERENCES enrollments(id) ON DELETE CASCADE,
    lesson_id     UUID NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
    status        VARCHAR(20) NOT NULL DEFAULT 'in_progress'
                  CHECK (status IN ('in_progress', 'completed')),
    viewed_slides INT[] NOT NULL DEFAULT '{}',    -- các slide đã xem (học viên hay nhảy cóc)
    started_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    completed_at  TIMESTAMPTZ,
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (enrollment_id, lesson_id)             -- 1 lượt đăng ký chỉ có 1 tiến độ / bài
);

-- =====================================================================
-- 4) CALIBRATION (kappa 6 tham số)
-- =====================================================================

-- Một user có thể học trên nhiều máy (laptop nhà, PC lab...)
CREATE TABLE IF NOT EXISTS devices (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id            UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    device_fingerprint VARCHAR(255) NOT NULL,   -- hash từ browser/OS/camera id
    screen_width_px    INT,
    screen_height_px   INT,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (user_id, device_fingerprint)
);

CREATE TABLE IF NOT EXISTS calibration_sessions (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    device_id     UUID NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
    num_points    SMALLINT NOT NULL,          -- 16-25
    status        VARCHAR(20) NOT NULL DEFAULT 'completed'
                  CHECK (status IN ('in_progress', 'completed', 'failed')),
    started_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    finished_at   TIMESTAMPTZ
);

-- Kết quả calibration: lưu 6 tham số kappa; ACTIVE duy nhất cho mỗi (user, device)
CREATE TABLE IF NOT EXISTS calibration_params (
    id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    calibration_session_id UUID NOT NULL REFERENCES calibration_sessions(id) ON DELETE CASCADE,
    user_id                UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    device_id              UUID NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
    params                 NUMERIC[6] NOT NULL,   -- [a1, a2, b1, a3, a4, b2]
    mapping_model_version  VARCHAR(30) NOT NULL,  -- version model (pitch,yaw,rvec,tvec)->(x,y)
    is_active              BOOLEAN NOT NULL DEFAULT TRUE,
    valid_from             TIMESTAMPTZ NOT NULL DEFAULT now(),
    valid_to               TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_calibration_active
    ON calibration_params (user_id, device_id) WHERE is_active;

-- =====================================================================
-- 5) DỮ LIỆU HÀNH VI HỌC (GAZE)
-- =====================================================================
CREATE TABLE IF NOT EXISTS learning_sessions (
    id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    enrollment_id        UUID NOT NULL REFERENCES enrollments(id) ON DELETE CASCADE,
    lesson_id            UUID NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
    device_id            UUID NOT NULL REFERENCES devices(id),
    calibration_param_id UUID REFERENCES calibration_params(id),
    status               VARCHAR(20) NOT NULL DEFAULT 'in_progress'
                         CHECK (status IN ('in_progress', 'completed', 'aborted')),
    started_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    ended_at             TIMESTAMPTZ,
    tracking_consent     BOOLEAN NOT NULL DEFAULT TRUE  -- học viên có thể tắt tracking
);

-- Từng frame gaze (≈20fps), mỗi frame = 1 điểm (x,y).
-- gaze_x/gaze_y CHUẨN HÓA [0,1] theo slide (image_url) — backend quy đổi viewport -> slide
-- trước khi ghi. Partition theo tháng vì khối lượng rất lớn (~20 dòng/giây/học viên).
-- id BIGSERIAL + PK (id, event_time): partition key bắt buộc nằm trong PK.
CREATE TABLE IF NOT EXISTS gaze_events (
    id                  BIGSERIAL,
    learning_session_id UUID NOT NULL REFERENCES learning_sessions(id) ON DELETE CASCADE,
    lesson_content_id   UUID NOT NULL REFERENCES lesson_contents(id),
    event_time          TIMESTAMPTZ NOT NULL DEFAULT now(),
    gaze_x              REAL NOT NULL CHECK (gaze_x >= 0 AND gaze_x <= 1),
    gaze_y              REAL NOT NULL CHECK (gaze_y >= 0 AND gaze_y <= 1),
    PRIMARY KEY (id, event_time)
) PARTITION BY RANGE (event_time);

-- Partition con khởi tạo: bắt buộc phải tồn tại một partition chứa thời điểm insert,
-- nếu không PostgreSQL sẽ báo "no partition of relation found for row".
-- Có DEFAULT partition bắt mọi khoảng thời gian ngoài các partition tháng đã tạo,
-- nên insert luôn thành công kể cả trước/sau các tháng khởi tạo.
-- Lưu ý: nên có job đổi data tháng rời khỏi DEFAULT sang partition tháng khi cần
-- purge/vacuum, và đuổi data cũ trong DEFAULT về partition đúng tháng định kỳ.
CREATE TABLE IF NOT EXISTS gaze_events_2026_08 PARTITION OF gaze_events
    FOR VALUES FROM ('2026-08-01') TO ('2026-09-01');
CREATE TABLE IF NOT EXISTS gaze_events_2026_09 PARTITION OF gaze_events
    FOR VALUES FROM ('2026-09-01') TO ('2026-10-01');
CREATE TABLE IF NOT EXISTS gaze_events_2026_10 PARTITION OF gaze_events
    FOR VALUES FROM ('2026-10-01') TO ('2026-11-01');
    CREATE TABLE IF NOT EXISTS gaze_events_2026_11 PARTITION OF gaze_events
    FOR VALUES FROM ('2026-11-01') TO ('2026-12-01');
CREATE TABLE IF NOT EXISTS gaze_events_default PARTITION OF gaze_events DEFAULT;


-- =====================================================================
-- INDEX (bổ sung cho các FK/join nóng không được PK/UNIQUE che phủ)
-- =====================================================================


CREATE INDEX IF NOT EXISTS idx_enrollments_student        ON enrollments (student_id);
CREATE INDEX IF NOT EXISTS idx_user_roles_role            ON user_roles (role_id);
CREATE INDEX IF NOT EXISTS idx_role_permissions_perm      ON role_permissions (permission_id);
CREATE INDEX IF NOT EXISTS idx_oauth_accounts_user        ON oauth_accounts (user_id);
CREATE INDEX IF NOT EXISTS idx_auth_sessions_user         ON auth_sessions (user_id);
CREATE INDEX IF NOT EXISTS idx_courses_creator            ON courses (created_by);
CREATE INDEX IF NOT EXISTS idx_courses_teacher            ON courses (teacher_id);
CREATE INDEX IF NOT EXISTS idx_calibration_sessions_user_device
    ON calibration_sessions (user_id, device_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_calibration_params_session ON calibration_params (calibration_session_id);
CREATE INDEX IF NOT EXISTS idx_learning_sessions_enrollment ON learning_sessions (enrollment_id);
CREATE INDEX IF NOT EXISTS idx_learning_sessions_lesson     ON learning_sessions (lesson_id);
CREATE INDEX IF NOT EXISTS idx_learning_sessions_device     ON learning_sessions (device_id);
CREATE INDEX IF NOT EXISTS idx_gaze_events_session          ON gaze_events (learning_session_id, event_time);
CREATE INDEX IF NOT EXISTS idx_gaze_events_content          ON gaze_events (lesson_content_id, event_time);
CREATE INDEX IF NOT EXISTS idx_lesson_progress_enrollment   ON lesson_progress(enrollment_id);
COMMIT;
