// lib/mock/teacher.ts — Dữ liệu giả cho khu vực giảng viên.
// Khi nối FastAPI: thay bằng lib/api/teacher.ts (đã có sẵn), GIỮ NGUYÊN tên type
// (lib/types/domain.ts) để UI không phải sửa.

import type {
  CourseStatus, Level, EnrollStatus,
  TeacherCourse, ModuleNode, StudentLesson, StudentRow,
  SlideStat, Hotspot, WeekDelta, ActivityPoint, CourseHealthRow,
  LessonAlert, StudentAlert, RecentSession, TeacherProfile,
} from '@/lib/types/domain';

export const TEACHER_NAME = 'ThS. Nguyễn Văn Minh';

// Hồ sơ người dùng đang đăng nhập (users + user_profiles + teacher_profiles).
// Prod: GET /api/me/profile từ auth.
export const TEACHER_PROFILE: TeacherProfile = {
  role: 'teacher',
  email: 'minh.nguyen@gaze.edu.vn',
  fullName: TEACHER_NAME,
  dateOfBirth: '1985-06-15',
  gender: 'male',
  phone: '0901234567',
  avatarUrl: null,
  teacherCode: 'GV001',
  department: 'Khoa Công nghệ thông tin',
  createdAt: '2024-01-15',
};

// 12 khóa — đủ để dashboard không bị "vài cái"
export const COURSES: TeacherCourse[] = [
  { id: 'c1', title: 'Thị giác máy tính nâng cao', description: 'Từ đặc trưng ảnh kinh điển đến CNN, object detection và ứng dụng gaze tracking.', level: 'advanced', gradient: 'from-cyan-500 to-blue-600', status: 'published', students: 23, completion: 64, attention: 58, sessions: 187, updatedAt: '14/08/2026' },
  { id: 'c2', title: 'Nhập môn Trí tuệ nhân tạo', description: 'Tổng quan AI: tìm kiếm, suy diễn, học máy cơ bản và đạo đức AI.', level: 'beginner', gradient: 'from-emerald-500 to-teal-600', status: 'published', students: 41, completion: 72, attention: 81, sessions: 356, updatedAt: '12/08/2026' },
  { id: 'c3', title: 'Học sâu cho Xử lý ngôn ngữ', description: 'RNN, attention, transformer và fine-tuning mô hình ngôn ngữ.', level: 'intermediate', gradient: 'from-violet-500 to-purple-600', status: 'published', students: 17, completion: 45, attention: 66, sessions: 122, updatedAt: '09/08/2026' },
  { id: 'c4', title: 'Python cho Khoa học dữ liệu', description: 'NumPy, pandas, trực quan hóa và pipeline dữ liệu cơ bản.', level: 'beginner', gradient: 'from-amber-500 to-orange-600', status: 'draft', students: 0, completion: 0, attention: null, sessions: 0, updatedAt: '10/08/2026' },
  { id: 'c5', title: 'Hệ thống khuyến nghị', description: 'Collaborative filtering, content-based và học sâu cho recommender.', level: 'intermediate', gradient: 'from-rose-500 to-pink-600', status: 'draft', students: 0, completion: 0, attention: null, sessions: 0, updatedAt: '05/08/2026' },
  { id: 'c6', title: 'Đồ án Eye-tracking 2025', description: 'Khóa đồ án năm trước — dữ liệu tham khảo.', level: 'advanced', gradient: 'from-slate-500 to-slate-700', status: 'archived', students: 35, completion: 88, attention: 74, sessions: 402, updatedAt: '20/05/2026' },
  { id: 'c7', title: 'Machine Learning cơ bản', description: 'Hồi quy, phân loại, đánh giá mô hình và scikit-learn.', level: 'beginner', gradient: 'from-sky-500 to-indigo-600', status: 'published', students: 52, completion: 69, attention: 77, sessions: 481, updatedAt: '13/08/2026' },
  { id: 'c8', title: 'Xử lý ảnh y tế', description: 'Phân đoạn ảnh X-quang, MRI bằng U-Net và biến thể.', level: 'advanced', gradient: 'from-teal-500 to-emerald-600', status: 'published', students: 12, completion: 38, attention: 52, sessions: 64, updatedAt: '11/08/2026' },
  { id: 'c9', title: 'Tối ưu hóa cho Học máy', description: 'Gradient descent, hàm lồi, regularization và các biến thể.', level: 'intermediate', gradient: 'from-fuchsia-500 to-purple-600', status: 'published', students: 19, completion: 57, attention: 71, sessions: 98, updatedAt: '08/08/2026' },
  { id: 'c10', title: 'Đạo đức & An toàn AI', description: 'Thiên lệch dữ liệu, giải thích mô hình và quyền riêng tư.', level: 'beginner', gradient: 'from-lime-500 to-green-600', status: 'published', students: 33, completion: 81, attention: 84, sessions: 210, updatedAt: '07/08/2026' },
  { id: 'c11', title: 'MLOps & Triển khai mô hình', description: 'Docker, CI/CD cho ML, giám sát drift và serving.', level: 'advanced', gradient: 'from-orange-500 to-red-600', status: 'draft', students: 0, completion: 0, attention: null, sessions: 0, updatedAt: '02/08/2026' },
  { id: 'c12', title: 'Toán cho AI 2024', description: 'Đại số tuyến tính, xác suất — khóa cũ đã lưu trữ.', level: 'beginner', gradient: 'from-slate-400 to-slate-600', status: 'archived', students: 47, completion: 79, attention: 68, sessions: 388, updatedAt: '15/04/2026' },
];

export const MODULES_C1: ModuleNode[] = [
  {
    id: 'm1', title: 'Chương 1: Tổng quan thị giác máy tính',
    lessons: [
      { id: 'l1', title: 'Giới thiệu & lịch sử CV', slides: 12, completion: 91, attention: 74 },
      { id: 'l2', title: 'Ảnh số & phép biến đổi', slides: 18, completion: 83, attention: 69 },
    ],
  },
  {
    id: 'm2', title: 'Chương 2: Đặc trưng ảnh',
    lessons: [
      { id: 'l3', title: 'Phát hiện biên & góc', slides: 15, completion: 70, attention: 61 },
      { id: 'l4', title: 'SIFT, ORB & matching', slides: 20, completion: 61, attention: 47 },
      { id: 'l5', title: 'Bài tập thực hành 1', slides: 8, completion: 57, attention: 63 },
    ],
  },
  {
    id: 'm3', title: 'Chương 3: Deep learning cho CV',
    lessons: [
      { id: 'l6', title: 'CNN từ con số 0', slides: 24, completion: 52, attention: 55 },
      { id: 'l7', title: 'Transfer learning & fine-tune', slides: 16, completion: 43, attention: 68 },
      { id: 'l8', title: 'Object detection: YOLO', slides: 22, completion: 39, attention: 44 },
    ],
  },
  {
    id: 'm4', title: 'Chương 4: Ứng dụng gaze tracking',
    lessons: [
      { id: 'l9', title: 'Face landmark & head pose', slides: 14, completion: 26, attention: 59 },
      { id: 'l10', title: 'Ước lượng gaze & hiệu chuẩn', slides: 18, completion: 17, attention: null },
    ],
  },
];

export const WEEKLY_ATTENTION = [72, 68, 74, 70, 63, 61, 58, 55, 57, 52, 54, 58];

export const PROGRESS_BUCKETS = [
  { label: '0–25%', count: 3 },
  { label: '25–50%', count: 4 },
  { label: '50–75%', count: 9 },
  { label: '75–99%', count: 5 },
  { label: '100%', count: 2 },
];

export const WEEK_KPIS = {
  sessions: { value: 47, delta: 12, note: 'phiên học tuần này' } as WeekDelta,
  studyHours: { value: 18.5, delta: 2.3, note: 'giờ học toàn bộ khóa' } as WeekDelta,
  activeStudents: { value: 61, delta: -4, note: 'học viên hoạt động' } as WeekDelta,
  completions: { value: 9, delta: 3, note: 'lượt hoàn thành bài' } as WeekDelta,
};

export const WEEK_ACTIVITY: ActivityPoint[] = [
  { day: 'T2', sessions: 18, attention: 71 },
  { day: 'T3', sessions: 24, attention: 68 },
  { day: 'T4', sessions: 15, attention: 74 },
  { day: 'T5', sessions: 31, attention: 66 },
  { day: 'T6', sessions: 27, attention: 62 },
  { day: 'T7', sessions: 9, attention: 78 },
  { day: 'CN', sessions: 6, attention: 80 },
];

export const COURSE_HEALTH: CourseHealthRow[] = [
  { id: 'c1', title: 'Thị giác máy tính nâng cao', gradient: 'from-cyan-500 to-blue-600', students: 23, completion: 64, attention: 58, active7d: 14, bottleneck: 'Object detection: YOLO', bottleneckScore: 44 },
  { id: 'c2', title: 'Nhập môn Trí tuệ nhân tạo', gradient: 'from-emerald-500 to-teal-600', students: 41, completion: 72, attention: 81, active7d: 29, bottleneck: 'Suy diễn logic mệnh đề', bottleneckScore: 71 },
  { id: 'c3', title: 'Học sâu cho Xử lý ngôn ngữ', gradient: 'from-violet-500 to-purple-600', students: 17, completion: 45, attention: 66, active7d: 8, bottleneck: 'Cơ chế self-attention', bottleneckScore: 55 },
  { id: 'c7', title: 'Machine Learning cơ bản', gradient: 'from-sky-500 to-indigo-600', students: 52, completion: 69, attention: 77, active7d: 35, bottleneck: 'Regularization L1/L2', bottleneckScore: 63 },
  { id: 'c8', title: 'Xử lý ảnh y tế', gradient: 'from-teal-500 to-emerald-600', students: 12, completion: 38, attention: 52, active7d: 5, bottleneck: 'U-Net skip connection', bottleneckScore: 41 },
  { id: 'c9', title: 'Tối ưu hóa cho Học máy', gradient: 'from-fuchsia-500 to-purple-600', students: 19, completion: 57, attention: 71, active7d: 11, bottleneck: 'Momentum & Adam', bottleneckScore: 60 },
  { id: 'c10', title: 'Đạo đức & An toàn AI', gradient: 'from-lime-500 to-green-600', students: 33, completion: 81, attention: 84, active7d: 22, bottleneck: 'Differential privacy', bottleneckScore: 72 },
];

// Bài có điểm tập trung thấp nhất toàn hệ thống
export const LESSON_ALERTS: LessonAlert[] = [
  { courseId: 'c8', courseTitle: 'Xử lý ảnh y tế', gradient: 'from-teal-500 to-emerald-600', lessonTitle: 'U-Net skip connection', attention: 41, onSlide: 38, affected: 9, total: 12 },
  { courseId: 'c1', courseTitle: 'Thị giác máy tính nâng cao', gradient: 'from-cyan-500 to-blue-600', lessonTitle: 'Object detection: YOLO', attention: 44, onSlide: 47, affected: 15, total: 23 },
  { courseId: 'c1', courseTitle: 'Thị giác máy tính nâng cao', gradient: 'from-cyan-500 to-blue-600', lessonTitle: 'SIFT, ORB & matching', attention: 47, onSlide: 52, affected: 19, total: 23 },
  { courseId: 'c8', courseTitle: 'Xử lý ảnh y tế', gradient: 'from-teal-500 to-emerald-600', lessonTitle: 'Tiền xử lý ảnh MRI', attention: 49, onSlide: 55, affected: 10, total: 12 },
  { courseId: 'c3', courseTitle: 'Học sâu cho Xử lý ngôn ngữ', gradient: 'from-violet-500 to-purple-600', lessonTitle: 'Cơ chế self-attention', attention: 55, onSlide: 58, affected: 12, total: 17 },
  { courseId: 'c9', courseTitle: 'Tối ưu hóa cho Học máy', gradient: 'from-fuchsia-500 to-purple-600', lessonTitle: 'Momentum & Adam', attention: 60, onSlide: 64, affected: 14, total: 19 },
];

export const STUDENT_ALERTS: StudentAlert[] = [
  { id: 's5', name: 'Vũ Đức Long', code: 'SV2024005', color: 'from-rose-500 to-pink-500', courseId: 'c1', courseTitle: 'Thị giác máy tính nâng cao', progress: 31, attention: 42, lastActive: '1 tuần trước', reason: 'low_attention' },
  { id: 's3', name: 'Phạm Minh Đức', code: 'SV2024003', color: 'from-amber-500 to-orange-500', courseId: 'c1', courseTitle: 'Thị giác máy tính nâng cao', progress: 45, attention: 48, lastActive: '3 ngày trước', reason: 'low_attention' },
  { id: 's9', name: 'Lý Thanh Sơn', code: 'SV2024102', color: 'from-indigo-500 to-violet-500', courseId: 'c8', courseTitle: 'Xử lý ảnh y tế', progress: 22, attention: 51, lastActive: '2 tuần trước', reason: 'inactive' },
  { id: 's10', name: 'Trịnh Ngọc Anh', code: 'SV2024118', color: 'from-cyan-500 to-teal-500', courseId: 'c3', courseTitle: 'Học sâu cho Xử lý ngôn ngữ', progress: 28, attention: 57, lastActive: '5 ngày trước', reason: 'stuck' },
  { id: 's11', name: 'Đặng Quốc Huy', code: 'SV2024131', color: 'from-blue-500 to-indigo-500', courseId: 'c8', courseTitle: 'Xử lý ảnh y tế', progress: 35, attention: 44, lastActive: '4 ngày trước', reason: 'low_attention' },
  { id: 's12', name: 'Ngô Phương Thảo', code: 'SV2024145', color: 'from-emerald-500 to-green-500', courseId: 'c1', courseTitle: 'Thị giác máy tính nâng cao', progress: 52, attention: 63, lastActive: '9 ngày trước', reason: 'inactive' },
  { id: 's13', name: 'Huỳnh Tấn Phát', code: 'SV2024152', color: 'from-orange-500 to-amber-500', courseId: 'c9', courseTitle: 'Tối ưu hóa cho Học máy', progress: 19, attention: 55, lastActive: '2 ngày trước', reason: 'stuck' },
];

// Phiên học gần đây — "ai vừa học gì"
export const RECENT_SESSIONS: RecentSession[] = [
  { id: 'ss1', studentName: 'Hoàng Mai Linh', color: 'from-teal-500 to-cyan-500', courseTitle: 'Thị giác máy tính NC', lessonTitle: 'CNN từ con số 0', durationMin: 34, attention: 79, when: '12 phút trước' },
  { id: 'ss2', studentName: 'Trần Thu Hà', color: 'from-cyan-500 to-blue-500', courseTitle: 'Thị giác máy tính NC', lessonTitle: 'Object detection: YOLO', durationMin: 41, attention: 68, when: '48 phút trước' },
  { id: 'ss3', studentName: 'Nguyễn Anh Thy', color: 'from-emerald-500 to-teal-500', courseTitle: 'Nhập môn AI', lessonTitle: 'Đạo đức AI', durationMin: 22, attention: 91, when: '1 giờ trước' },
  { id: 'ss4', studentName: 'Lê Quốc Bảo', color: 'from-violet-500 to-purple-500', courseTitle: 'Thị giác máy tính NC', lessonTitle: 'SIFT, ORB & matching', durationMin: 18, attention: 45, when: '2 giờ trước' },
  { id: 'ss5', studentName: 'Đỗ Hải Yến', color: 'from-indigo-500 to-blue-500', courseTitle: 'Thị giác máy tính NC', lessonTitle: 'CNN từ con số 0', durationMin: 27, attention: null, when: '3 giờ trước' },
  { id: 'ss6', studentName: 'Trịnh Ngọc Anh', color: 'from-cyan-500 to-teal-500', courseTitle: 'Học sâu cho NLP', lessonTitle: 'Cơ chế self-attention', durationMin: 15, attention: 52, when: '5 giờ trước' },
  { id: 'ss7', studentName: 'Phạm Minh Đức', color: 'from-amber-500 to-orange-500', courseTitle: 'Thị giác máy tính NC', lessonTitle: 'Transfer learning', durationMin: 9, attention: 38, when: '6 giờ trước' },
  { id: 'ss8', studentName: 'Bùi Thành Trung', color: 'from-slate-500 to-slate-600', courseTitle: 'Thị giác máy tính NC', lessonTitle: 'Phát hiện biên & góc', durationMin: 31, attention: 61, when: '8 giờ trước' },
];

// ---- Label helpers ----

export const STATUS_LABEL: Record<CourseStatus, string> = {
  draft: 'Nháp', published: 'Đã xuất bản', archived: 'Lưu trữ',
};

export const LEVEL_LABEL: Record<Level, string> = {
  beginner: 'Cơ bản', intermediate: 'Trung cấp', advanced: 'Nâng cao',
};

export const ENROLL_LABEL: Record<EnrollStatus, string> = {
  active: 'Đang học', completed: 'Hoàn thành', dropped: 'Đã bỏ',
};

export function attentionTone(a: number | null) {
  if (a === null) return { text: 'text-slate-400', bg: 'bg-slate-100', bar: 'bg-slate-300' };
  if (a >= 70) return { text: 'text-emerald-600', bg: 'bg-emerald-50', bar: 'bg-emerald-500' };
  if (a >= 50) return { text: 'text-amber-600', bg: 'bg-amber-50', bar: 'bg-amber-500' };
  return { text: 'text-rose-600', bg: 'bg-rose-50', bar: 'bg-rose-500' };
}

// Pseudo-random có seed → mock ổn định giữa các lần render
function hashSeed(s: string) {
  let h = 2166136261;
  for (const c of s) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

function mulberry(seed: number) {
  let a = seed;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Sinh dữ liệu gaze giả cho 1 lesson; scope khác nhau ('class' | studentId) → dữ liệu khác nhau
export function slideStats(lessonId: string, slideCount: number, scope = 'class'): SlideStat[] {
  const rand = mulberry(hashSeed(`${lessonId}:${scope}`));
  const base = 0.5 + rand() * 0.3;
  return Array.from({ length: slideCount }, (_, idx) => {
    const q = Math.min(1, Math.max(0.15, base + (rand() - 0.5) * 0.55));
    const n = 3 + Math.floor(rand() * 4);
    const cx = 0.3 + rand() * 0.4;
    const cy = 0.3 + rand() * 0.4;
    const hotspots: Hotspot[] = Array.from({ length: n }, () => ({
      x: Math.min(0.95, Math.max(0.05, cx + (rand() - 0.5) * 0.5)),
      y: Math.min(0.9, Math.max(0.08, cy + (rand() - 0.5) * 0.45)),
      r: 0.08 + rand() * 0.14,
      w: q * (0.5 + rand() * 0.5),
    }));
    return {
      idx,
      onSlide: Math.round(q * 100),
      fixations: Math.round(q * (30 + rand() * 40)),
      viewSec: Math.round(20 + q * 40 + rand() * 20),
      hotspots,
    };
  });
}

// Danh sách học viên của khóa c1 (mock enrollments + lesson_progress)
function buildStudentLessons(studentId: string, progress: number, consent: boolean): StudentLesson[] {
  const rand = mulberry(hashSeed(studentId));
  const all = MODULES_C1.flatMap((m) => m.lessons);
  return all.map((l) => {
    const p = Math.min(1, Math.max(0, progress / 100 + (rand() - 0.5) * 0.5));
    const viewed = Math.round(p * l.slides);
    return {
      lessonId: l.id,
      viewed,
      total: l.slides,
      attention: !consent || viewed === 0 ? null : Math.round(45 + rand() * 45),
    };
  });
}

export const STUDENTS_C1: StudentRow[] = [
  { id: 's1', name: 'Trần Thu Hà', code: 'SV2024001', color: 'from-cyan-500 to-blue-500', progress: 78, attention: 82, lastActive: '2 giờ trước', status: 'active', lessons: buildStudentLessons('s1', 78, true) },
  { id: 's2', name: 'Lê Quốc Bảo', code: 'SV2024002', color: 'from-violet-500 to-purple-500', progress: 64, attention: 71, lastActive: '1 ngày trước', status: 'active', lessons: buildStudentLessons('s2', 64, true) },
  { id: 's3', name: 'Phạm Minh Đức', code: 'SV2024003', color: 'from-amber-500 to-orange-500', progress: 45, attention: 48, lastActive: '3 ngày trước', status: 'active', lessons: buildStudentLessons('s3', 45, true) },
  { id: 's4', name: 'Nguyễn Anh Thy', code: 'SV2024004', color: 'from-emerald-500 to-teal-500', progress: 92, attention: 88, lastActive: '5 giờ trước', status: 'completed', lessons: buildStudentLessons('s4', 92, true) },
  { id: 's5', name: 'Vũ Đức Long', code: 'SV2024005', color: 'from-rose-500 to-pink-500', progress: 31, attention: 42, lastActive: '1 tuần trước', status: 'active', lessons: buildStudentLessons('s5', 31, true) },
  { id: 's6', name: 'Đỗ Hải Yến', code: 'SV2024006', color: 'from-indigo-500 to-blue-500', progress: 57, attention: null, lastActive: '12 giờ trước', status: 'active', lessons: buildStudentLessons('s6', 57, false) },
  { id: 's7', name: 'Bùi Thành Trung', code: 'SV2024007', color: 'from-slate-500 to-slate-600', progress: 12, attention: 38, lastActive: '3 tuần trước', status: 'dropped', lessons: buildStudentLessons('s7', 12, true) },
  { id: 's8', name: 'Hoàng Mai Linh', code: 'SV2024008', color: 'from-teal-500 to-cyan-500', progress: 68, attention: 76, lastActive: '30 phút trước', status: 'active', lessons: buildStudentLessons('s8', 68, true) },
];
