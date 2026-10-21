// lib/types/domain.ts — Nguồn duy nhất cho các type domain của GazeEdu.
// Khớp với schema DB (db/migrations/*.sql): courses / modules / lessons /
// lesson_contents / enrollments / learning_sessions / gaze_events.
// Khi nối backend, các type này được dùng làm contract — không sửa tên để UI ổn định.

export type CourseStatus = 'draft' | 'published' | 'archived';
export type EnrollStatus = 'active' | 'completed' | 'dropped';
export type LessonKind = 'lesson' | 'quiz';

export interface TeacherCourse {
  id: string;
  title: string;
  description: string;
  gradient: string;          // thumbnail giả (prod: courses.thumbnail_url)
  status: CourseStatus;      // courses.status_id -> course_statuses.code
  students: number;          // count(enrollments)
  attention: number | null;  // điểm tập trung TB; null = chưa đủ dữ liệu gaze
  sessions: number;          // count(learning_sessions)
  updatedAt: string;
  isOwner?: boolean;          // admin hoặc chủ khóa học (quyền quản lý); false = GV được phân công
  lessonCount?: number;       // số bài giảng (item) trong khóa
  showGazeDot?: boolean;      // true khi MỌI bài giảng của khóa đều bật hiển thị điểm nhìn
}

export interface LessonNode {
  id: string;
  title: string;
  kind: LessonKind;          // 'lesson' (slide) hoặc 'quiz' (trắc nghiệm)
  slides: number;            // count(lesson_contents)
  attention: number | null;
  mastery?: number | null;   // điểm hoàn thành TB (độ bao phủ nội dung)
  quizId?: string | null;
  quizStatus?: QuizAssignmentStatus | null;
  questionCount?: number;
  durationMinutes?: number | null;
  dueAt?: string | null;
  showGazeDot?: boolean;     // cho SV thấy chấm điểm nhìn của mình (để test)
}

export interface ModuleNode {
  id: string;
  title: string;
  lessons: LessonNode[];
}

export interface StudentLesson {
  lessonId: string;
  attention: number | null;
  mastery?: number | null;   // điểm hoàn thành (độ bao phủ nội dung)
  keyDone?: number;          // số trang trọng tâm đã hoàn thành
  keyTotal?: number;         // tổng số trang trọng tâm
}

export interface StudentRow {
  id: string;
  name: string;              // user_profiles.full_name
  code: string;              // student_profiles.student_code
  color: string;             // avatar giả
  avatarUrl?: string | null;  // user_profiles.avatar_url
  attention: number | null;  // null ⇔ learning_sessions.tracking_consent = false
  lastActive: string;
  status: EnrollStatus;
  lessons: StudentLesson[];
}

export interface Hotspot { x: number; y: number; r: number; w: number } // x,y,r chuẩn hóa [0,1] theo slide — khớp gaze_events
export interface HeatmapAoi {
  id: string;
  name: string;
  xMin: number;
  yMin: number;
  xMax: number;
  yMax: number;
  source: string;
}
export interface SlideStat {
  idx: number;               // lesson_contents.order_index
  onSlide: number;           // on-slide ratio %
  fixations: number;
  viewSec: number;           // thời gian xem TB (giây)
  hotspots: Hotspot[];
  points?: [number, number][]; // gaze thô (chuẩn hóa [0,1]), dùng để vẽ scatter khi thiếu hotspot
  aois: HeatmapAoi[];         // vùng nội dung chuẩn hóa [0,1], độc lập với scope heatmap
}

// ---- Dashboard mở rộng (teacher) ----

export interface WeekDelta { value: number; delta: number | null; note: string }

export interface ActivityPoint { day: string; sessions: number; attention: number }

export interface CourseHealthRow {
  id: string;
  title: string;
  gradient: string;
  students: number;
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
  course: {
    id: string;
    title: string;
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

// ---- Slide trọng tâm + điểm hoàn thành theo độ bao phủ nội dung (teacher) ----

export interface SlideAdmin {
  id: string;
  orderIndex: number;
  title: string;
  imageUrl: string | null;
  isKey: boolean;
  aoiCount: number;
  aoiSource: string;
}

export interface Aoi {
  id: string;
  name: string;
  xMin: number;
  yMin: number;
  xMax: number;
  yMax: number;
  weight: number;
  charCount: number;
  source: string;
  covered: boolean;
  dwellMs: number;
}

export interface SlideCoverage {
  contentId: string;
  orderIndex: number;
  isKey: boolean;
  coverage: number;          // 0..1
  dwellMs: number;
  isComplete: boolean;
  aoiCount: number;
  aoiSource: string;
  aois: Aoi[];
}

export interface LessonMastery {
  lessonId: string;
  score: number;             // 0..100 (85% trọng tâm / 15% thường)
  keyScore: number;
  normalScore: number;
  keyDone: number;
  keyTotal: number;
  slidesDone: number;
  slidesTotal: number;
  slides: SlideCoverage[];
}

export interface LessonItem {
  id: string;
  title: string;
  kind: LessonKind;
  slideCount: number;
  quizId?: string | null;
  quizStatus?: QuizAssignmentStatus | null;
  questionCount?: number;
  durationMinutes?: number | null;
  dueAt?: string | null;
  showGazeDot?: boolean;     // cho SV thấy chấm điểm nhìn của mình (để test)
}

export interface ModuleItem {
  id: string;
  orderIndex: number;
  title: string;
  lessons: LessonItem[];
}

export interface ModuleItemRef {
  kind: LessonKind;
  id: string;
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

// ---- Quiz assignment prototype (replace local adapter with backend API later) ----

export type QuizAssignmentStatus = 'draft' | 'published' | 'closed';

export interface QuizOption {
  id: string;
  text: string;
}

export interface QuizQuestion {
  id: string;
  prompt: string;
  options: QuizOption[];
  correctOptionIds: string[];   // một hoặc nhiều đáp án đúng (chấm tất cả-hoặc-không)
  allowMultiple: boolean;       // cho phép chọn nhiều đáp án
  explanation: string;
  points: number;
}

export interface QuizAssignment {
  id: string;
  courseId: string;
  courseTitle: string;
  lessonId?: string;
  lessonTitle?: string;
  title: string;
  instructions: string;
  dueAt: string | null;
  durationMinutes: number;
  status: QuizAssignmentStatus;
  createdAt: string;
  expiresAt?: string;
  allowRetry?: boolean;   // giáo viên cho phép học viên làm lại
  questions: QuizQuestion[];
}

export interface QuizAttempt {
  id: string;
  assignmentId: string;
  answers: Record<string, string[]>;
  submittedAt: string;
  score: number;
  maxScore: number;
}
