// lib/types/domain.ts — Nguồn duy nhất cho các type domain của GazeEdu.
// Khớp với schema DB (db/migrations/*.sql): courses / modules / lessons /
// lesson_contents / enrollments / lesson_progress / learning_sessions / gaze_events.
// Khi nối backend, các type này được dùng làm contract — không sửa tên để UI ổn định.

export type CourseStatus = 'draft' | 'published' | 'archived';
export type Level = 'beginner' | 'intermediate' | 'advanced';
export type EnrollStatus = 'active' | 'completed' | 'dropped';

export interface TeacherCourse {
  id: string;
  title: string;
  description: string;
  level: Level;
  gradient: string;          // thumbnail giả (prod: courses.thumbnail_url)
  status: CourseStatus;      // courses.status_id -> course_statuses.code
  students: number;          // count(enrollments)
  completion: number;        // % hoàn thành TB
  attention: number | null;  // điểm tập trung TB; null = chưa đủ dữ liệu gaze
  sessions: number;          // count(learning_sessions)
  updatedAt: string;
  isOwner?: boolean;          // admin hoặc chủ khóa học (quyền quản lý); false = GV được phân công
}

export interface LessonNode {
  id: string;
  title: string;
  slides: number;            // count(lesson_contents)
  completion: number;        // % học viên completed bài này
  attention: number | null;
}

export interface ModuleNode {
  id: string;
  title: string;
  lessons: LessonNode[];
}

export interface StudentLesson {
  lessonId: string;
  viewed: number;            // cardinality(lesson_progress.viewed_slides)
  total: number;
  attention: number | null;
}

export interface StudentRow {
  id: string;
  name: string;              // user_profiles.full_name
  code: string;              // student_profiles.student_code
  color: string;             // avatar giả
  avatarUrl?: string | null;  // user_profiles.avatar_url
  progress: number;
  attention: number | null;  // null ⇔ learning_sessions.tracking_consent = false
  lastActive: string;
  status: EnrollStatus;
  lessons: StudentLesson[];
}

export interface Hotspot { x: number; y: number; r: number; w: number } // x,y,r chuẩn hóa [0,1] theo slide — khớp gaze_events
export interface SlideStat {
  idx: number;               // lesson_contents.order_index
  onSlide: number;           // on-slide ratio %
  fixations: number;
  viewSec: number;           // thời gian xem TB (giây)
  hotspots: Hotspot[];
  points?: [number, number][]; // gaze thô (chuẩn hóa [0,1]), dùng để vẽ scatter khi thiếu hotspot
}

// ---- Dashboard mở rộng (teacher) ----

export interface WeekDelta { value: number; delta: number | null; note: string }

export interface ActivityPoint { day: string; sessions: number; attention: number }

export interface CourseHealthRow {
  id: string;
  title: string;
  gradient: string;
  students: number;
  completion: number;
  attention: number | null;
  active7d: number;         // học viên hoạt động 7 ngày qua
  bottleneck: string | null; // bài có attention thấp nhất
  bottleneckScore: number | null;
}

export interface LessonAlert {
  courseId: string;
  courseTitle: string;
  gradient: string;
  lessonTitle: string;
  attention: number;
  onSlide: number;      // on-slide ratio TB của bài
  affected: number;     // số học viên đã học bài này
  total: number;
}

export interface StudentAlert {
  id: string;
  name: string;
  code: string;
  color: string;
  courseId: string;
  courseTitle: string;
  progress: number;
  attention: number | null;
  lastActive: string;
  reason: 'stuck' | 'low_attention' | 'inactive'; // tụt tiến độ | mất tập trung | lâu không vào
}

export interface RecentSession {
  id: string;
  studentName: string;
  color: string;
  courseTitle: string;
  lessonTitle: string;
  durationMin: number;
  attention: number | null;
  when: string;
}

// ---- Student (my-courses) ----

export interface EnrolledCourse {
  enrollmentId: string;
  enrolledAt: string;
  status: EnrollStatus;
  progress: number; // 0–100
  course: {
    id: string;
    title: string;
    level: Level;
    thumbnailUrl: string | null;
    teacherName: string;
    moduleCount: number;
    lessonCount: number;
    gradient: string; // placeholder khi thumbnailUrl = null
  };
}

// ---- Student (course-learning) ----

export interface Slide {
  id: string;
  title: string;
  imageUrl: string | null;
}

export interface LessonItem {
  id: string;
  title: string;
  slideCount: number;
  completed: boolean;
}

export interface ModuleItem {
  id: string;
  orderIndex: number;
  title: string;
  lessons: LessonItem[];
}

export interface CourseOutline {
  id: string;
  title: string;
  modules: ModuleItem[];
}

// ---- Profile (users / user_profiles / student_profiles / teacher_profiles) ----

export type GenderCode = 'male' | 'female' | 'other';

export interface ProfileBase {
  email: string;               // users.email — email đăng nhập, read-only
  fullName: string;            // user_profiles.full_name
  dateOfBirth: string | null;  // user_profiles.date_of_birth (yyyy-mm-dd)
  gender: GenderCode | null;   // user_profiles.gender_id -> genders.code
  phone: string | null;        // user_profiles.phone
  avatarUrl: string | null;    // user_profiles.avatar_url
  createdAt: string;           // users.created_at
}

export interface StudentProfile extends ProfileBase {
  role: 'student';
  studentCode: string;         // student_profiles.student_code — read-only
  program: string | null;      // student_profiles.program
}

export interface TeacherProfile extends ProfileBase {
  role: 'teacher';
  teacherCode: string;         // teacher_profiles.teacher_code — read-only
  department: string | null;   // teacher_profiles.department
}

export type MyProfile = StudentProfile | TeacherProfile;

// Payload chỉnh sửa hồ sơ — email + mật khẩu cố tình không nằm trong đây.
export interface ProfileUpdate {
  fullName: string;
  dateOfBirth: string | null;
  gender: GenderCode | null;
  phone: string | null;
  avatarUrl: string | null;
  program?: string | null;     // chỉ student
  department?: string | null;  // chỉ teacher
}
