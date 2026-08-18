// lib/mock/student.ts — Dữ liệu giả cho khu vực học viên.
// Khi nối FastAPI: thay bằng lib/api/student.ts (đã có sẵn).

import type { EnrolledCourse, CourseOutline, StudentProfile } from '@/lib/types/domain';

export const STUDENT_NAME = 'Nguyễn Văn An'; // prod: user_profiles.full_name từ auth

// Hồ sơ người dùng đang đăng nhập (users + user_profiles + student_profiles).
// Prod: GET /api/me/profile từ auth.
export const STUDENT_PROFILE: StudentProfile = {
  role: 'student',
  email: 'an.nguyen@gaze.edu.vn',
  fullName: STUDENT_NAME,
  dateOfBirth: '2005-03-20',
  gender: 'male',
  phone: '0912345678',
  avatarUrl: null,
  studentCode: 'SV2025001',
  program: 'Công nghệ thông tin K46',
  createdAt: '2026-01-10',
};

// Mock: enrollments JOIN courses JOIN teacher_profiles.
// Prod: GET /api/me/enrollments?include=course.teacher,stats
export const MOCK_ENROLLMENTS: EnrolledCourse[] = [
  {
    enrollmentId: 'e1',
    enrolledAt: '02/07/2026',
    status: 'active',
    progress: 62,
    course: {
      id: 'c1',
      title: 'Machine Learning cơ bản',
      level: 'beginner',
      thumbnailUrl: null,
      teacherName: 'TS. Nguyễn Minh Anh',
      moduleCount: 5,
      lessonCount: 18,
      gradient: 'from-cyan-500 to-blue-600',
    },
  },
  {
    enrollmentId: 'e2',
    enrolledAt: '18/06/2026',
    status: 'active',
    progress: 15,
    course: {
      id: 'c2',
      title: 'Deep Learning nâng cao',
      level: 'advanced',
      thumbnailUrl: null,
      teacherName: 'PGS.TS. Trần Thu Hà',
      moduleCount: 7,
      lessonCount: 24,
      gradient: 'from-violet-500 to-purple-700',
    },
  },
  {
    enrollmentId: 'e3',
    enrolledAt: '12/03/2026',
    status: 'completed',
    progress: 100,
    course: {
      id: 'c3',
      title: 'Nhập môn Lập trình Python',
      level: 'beginner',
      thumbnailUrl: null,
      teacherName: 'ThS. Lê Quốc Bảo',
      moduleCount: 6,
      lessonCount: 22,
      gradient: 'from-emerald-500 to-teal-600',
    },
  },
  {
    enrollmentId: 'e4',
    enrolledAt: '25/07/2026',
    status: 'active',
    progress: 38,
    course: {
      id: 'c4',
      title: 'Xử lý ngôn ngữ tự nhiên ứng dụng',
      level: 'intermediate',
      thumbnailUrl: null,
      teacherName: 'TS. Phạm Đức Long',
      moduleCount: 6,
      lessonCount: 20,
      gradient: 'from-amber-500 to-orange-600',
    },
  },
  {
    enrollmentId: 'e5',
    enrolledAt: '05/05/2026',
    status: 'active',
    progress: 84,
    course: {
      id: 'c5',
      title: 'Thị giác máy tính ứng dụng',
      level: 'intermediate',
      thumbnailUrl: null,
      teacherName: 'TS. Nguyễn Minh Anh',
      moduleCount: 8,
      lessonCount: 26,
      gradient: 'from-sky-500 to-indigo-600',
    },
  },
  {
    enrollmentId: 'e6',
    enrolledAt: '20/04/2026',
    status: 'dropped',
    progress: 12,
    course: {
      id: 'c6',
      title: 'Toán cho AI',
      level: 'beginner',
      thumbnailUrl: null,
      teacherName: 'ThS. Lê Quốc Bảo',
      moduleCount: 4,
      lessonCount: 14,
      gradient: 'from-rose-500 to-pink-600',
    },
  },
];

// Mock: thống kê hoạt động của chính học viên.
// Prod: SELECT count(DISTINCT date), sum(duration) FROM learning_sessions ...
export const MOCK_STREAK_DAYS = 5;          // số ngày học liên tiếp tính đến hôm nay
export const MOCK_WEEK_STUDY_MINUTES = 200; // tổng phút học 7 ngày qua

// Mock: outline khóa học đang học.
// Prod: GET /api/courses/:id?include=modules.lessons
export const MOCK_COURSE: CourseOutline = {
  id: 'c1',
  title: 'Machine Learning cơ bản',
  modules: [
    {
      id: 'm1',
      orderIndex: 1,
      title: 'Giới thiệu & tổng quan',
      lessons: [
        { id: 'l1', title: 'Làm quen với Machine Learning', slideCount: 8, completed: true },
        { id: 'l2', title: 'Các loại bài toán học máy', slideCount: 10, completed: true },
        { id: 'l3', title: 'Cài đặt môi trường & công cụ', slideCount: 6, completed: true },
      ],
    },
    {
      id: 'm2',
      orderIndex: 2,
      title: 'Hồi quy tuyến tính',
      lessons: [
        { id: 'l4', title: 'Linear Regression', slideCount: 12, completed: true },
        { id: 'l5', title: 'Hàm mất mát & Gradient Descent', slideCount: 14, completed: false },
        { id: 'l6', title: 'Regularization: Ridge & Lasso', slideCount: 9, completed: false },
      ],
    },
    {
      id: 'm3',
      orderIndex: 3,
      title: 'Phân loại cơ bản',
      lessons: [
        { id: 'l7', title: 'Logistic Regression', slideCount: 11, completed: false },
        { id: 'l8', title: 'Decision Tree & Random Forest', slideCount: 10, completed: false },
        { id: 'l9', title: 'Đánh giá mô hình phân loại', slideCount: 8, completed: false },
      ],
    },
    {
      id: 'm4',
      orderIndex: 4,
      title: 'Dự án cuối khóa',
      lessons: [
        { id: 'l10', title: 'Xây dựng pipeline hoàn chỉnh', slideCount: 15, completed: false },
      ],
    },
  ],
};

// Mock: tiêu đề slide (prod: lesson_contents nội dung thật)
export const MOCK_SLIDE_TITLES = [
  'Mở đầu & mục tiêu bài học',
  'Nhắc lại Linear Regression',
  'Hàm mất mát là gì?',
  'Mean Squared Error (MSE)',
  'Trực quan hóa mặt hàm mất mát',
  'Ý tưởng Gradient Descent',
  'Đạo hàm & hướng giảm',
  'Learning rate',
  'Gradient Descent từng bước',
  'Ví dụ minh họa bằng số',
  'Batch vs Stochastic GD',
  'Các vấn đề thường gặp',
  'Tổng kết',
  'Câu hỏi ôn tập',
];

export const SLIDE_THEMES = [
  'from-cyan-600 to-blue-700',
  'from-teal-600 to-cyan-700',
  'from-sky-600 to-indigo-700',
  'from-cyan-700 to-teal-800',
];

export const LEVEL_LABEL: Record<string, string> = {
  beginner: 'Cơ bản',
  intermediate: 'Trung cấp',
  advanced: 'Nâng cao',
};

export const LEVEL_STYLE: Record<string, string> = {
  beginner: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  intermediate: 'bg-amber-50 text-amber-700 border-amber-200',
  advanced: 'bg-rose-50 text-rose-700 border-rose-200',
};

export function fmtMinutes(min: number) {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h > 0 ? `${h} giờ ${m > 0 ? `${m} phút` : ''}`.trim() : `${m} phút`;
}
