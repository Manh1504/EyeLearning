// lib/demo.ts — Chế độ xem giao diện không cần backend.
// Bật duy nhất bằng NEXT_PUBLIC_DEMO=1.
// Khi bật: mọi apiFetch trả dữ liệu giả, không gọi backend thật.

import type { AuthUser, Role } from "./api/auth";
export { isDemoMode } from "./demo-mode";

export const DEMO_USERS: Record<Role, AuthUser> = {
  student: {
    id: "student@school.edu.vn",
    email: "student@school.edu.vn",
    roles: ["student"],
    fullName: "Nguyễn Văn An",
    avatarUrl: null,
  },
  teacher: {
    id: "teacher@school.edu.vn",
    email: "teacher@school.edu.vn",
    roles: ["teacher"],
    fullName: "ThS. Nguyễn Văn Minh",
    avatarUrl: null,
  },
  admin: {
    id: "admin@school.edu.vn",
    email: "admin@school.edu.vn",
    roles: ["admin"],
    fullName: "Quản trị viên",
    avatarUrl: null,
  },
};

export function demoUserForEmail(email: string): AuthUser {
  const lower = email.toLowerCase();
  if (lower.includes("teacher")) return DEMO_USERS.teacher;
  if (lower.includes("admin")) return DEMO_USERS.admin;
  return DEMO_USERS.student;
}

const TEACHER_COURSE = {
  id: "course-1",
  title: "Lập trình Python cơ bản",
  description: "Khóa nhập môn dành cho sinh viên năm nhất.",
  gradient: "",
  status: "published",
  students: 2,
  attention: 72,
  sessions: 5,
  updatedAt: "01/10/2026",
  isOwner: true,
  lessonCount: 3,
  showGazeDot: false,
};

const MODULES = [
  {
    id: "mod-1",
    title: "Chương 1: Nhập môn",
    lessons: [
      { id: "lesson-1", title: "Bài 1: Giới thiệu", kind: "lesson", slides: 3, attention: 70 },
      { id: "lesson-2", title: "Bài 2: Biến và kiểu dữ liệu", kind: "lesson", slides: 2, attention: 60 },
      {
        id: "lesson-quiz-1",
        title: "Bài tập: Kiểm tra nhập môn",
        kind: "quiz",
        slides: 0,
        attention: null,
        mastery: null,
        quizId: "quiz-python-1",
        quizStatus: "published",
        questionCount: 3,
        durationMinutes: 15,
        dueAt: null,
      },
    ],
  },
  {
    id: "mod-2",
    title: "Chương 2: Cấu trúc điều khiển",
    lessons: [
      { id: "lesson-3", title: "Bài 3: Vòng lặp", kind: "lesson", slides: 4, attention: 55 },
    ],
  },
];

const STUDENTS = [
  {
    id: "stu-1",
    name: "Nguyễn Văn An",
    code: "SV001",
    color: "#000",
    attention: 72,
    lastActive: "2 giờ trước",
    status: "active",
    lessons: [
      { lessonId: "lesson-1", attention: 70 },
      { lessonId: "lesson-2", attention: 65 },
    ],
  },
  {
    id: "stu-2",
    name: "Trần Thị Bình",
    code: "SV002",
    color: "#000",
    attention: null,
    lastActive: "1 ngày trước",
    status: "completed",
    lessons: [{ lessonId: "lesson-1", attention: null }],
  },
  {
    id: "stu-3",
    name: "Phạm Văn Cường",
    code: "SV003",
    color: "#000",
    attention: 48,
    lastActive: "3 ngày trước",
    status: "active",
    lessons: [{ lessonId: "lesson-1", attention: 48 }],
  },
];

const ENROLLMENTS = [
  {
    enrollmentId: "enr-1",
    enrolledAt: "2026-09-01T00:00:00Z",
    status: "active",
    course: {
      id: "course-1",
      title: "Lập trình Python cơ bản",
      thumbnailUrl: null,
      teacherName: "ThS. Nguyễn Văn Minh",
      moduleCount: 2,
      lessonCount: 3,
      gradient: "",
    },
  },
  {
    enrollmentId: "enr-2",
    enrolledAt: "2026-08-20T00:00:00Z",
    status: "completed",
    course: {
      id: "course-2",
      title: "Cấu trúc dữ liệu và giải thuật",
      thumbnailUrl: null,
      teacherName: "TS. Lê Thị Hoa",
      moduleCount: 3,
      lessonCount: 8,
      gradient: "",
    },
  },
];

const OUTLINE = {
  id: "course-1",
  title: "Lập trình Python cơ bản",
  showGazeDot: false,
  modules: [
    {
      id: "mod-1",
      orderIndex: 1,
      title: "Chương 1: Nhập môn",
      lessons: [
        { id: "lesson-1", title: "Bài 1: Giới thiệu", kind: "lesson", slideCount: 3 },
        { id: "lesson-2", title: "Bài 2: Biến và kiểu dữ liệu", kind: "lesson", slideCount: 2 },
        {
          id: "lesson-quiz-1",
          title: "Bài tập: Kiểm tra nhập môn",
          kind: "quiz",
          slideCount: 0,
          quizId: "quiz-python-1",
          quizStatus: "published",
          questionCount: 3,
          durationMinutes: 15,
          dueAt: null,
        },
      ],
    },
    {
      id: "mod-2",
      orderIndex: 2,
      title: "Chương 2: Cấu trúc điều khiển",
      lessons: [{ id: "lesson-3", title: "Bài 3: Vòng lặp", kind: "lesson", slideCount: 4 }],
    },
  ],
};

const SLIDES = [
  { id: "c1", title: "Trang 1", imageUrl: null },
  { id: "c2", title: "Trang 2", imageUrl: null },
  { id: "c3", title: "Trang 3", imageUrl: null },
];

const HEATMAP_STATS = [
  { idx: 0, onSlide: 82, fixations: 10, viewSec: 30, hotspots: [], points: [[0.4, 0.4], [0.5, 0.45], [0.42, 0.5]], aois: [] },
  { idx: 1, onSlide: 64, fixations: 8, viewSec: 22, hotspots: [], points: [[0.5, 0.5], [0.55, 0.52]], aois: [] },
  { idx: 2, onSlide: 40, fixations: 5, viewSec: 15, hotspots: [], points: [[0.6, 0.6]], aois: [] },
];

const TEACHER_DIRECTORY = [
  { id: "t-1", name: "ThS. Nguyễn Văn Minh", code: "GV001", email: "gv1@school.edu.vn" },
  { id: "t-2", name: "TS. Lê Thị Hoa", code: "GV002", email: "gv2@school.edu.vn" },
  { id: "t-3", name: "ThS. Trần Quốc Bảo", code: "GV003", email: "gv3@school.edu.vn" },
];

const COURSE_TEACHERS = [
  { teacherId: "t-1", name: "ThS. Nguyễn Văn Minh", code: "GV001", email: "gv1@school.edu.vn", isOwner: true },
];

function demoProfile(email: string) {
  const user = demoUserForEmail(email);
  return {
    email: user.email,
    fullName: user.fullName,
    dateOfBirth: "2003-01-01",
    gender: "male",
    phone: "0900000000",
    avatarUrl: null,
    createdAt: "2026-01-01T00:00:00Z",
    role: user.roles[0],
    ...(user.roles[0] === "student" ? { studentCode: "SV001", program: "CNTT K46" } : {}),
    ...(user.roles[0] === "teacher" ? { teacherCode: "GV001", department: "Khoa CNTT" } : {}),
  };
}

/** Trả dữ liệu giả theo path. Trả undefined nếu không khớp (để rơi về fetch thật). */
export function demoResponse(path: string, method: string, body?: unknown): unknown | undefined {
  const clean = path.split("?")[0];

  // Auth
  if (clean === "/api/auth/login" && method === "POST") {
    const email = (body as { email?: string })?.email ?? "student@school.edu.vn";
    const user = demoUserForEmail(email);
    return { accessToken: "demo-token", refreshToken: "demo-refresh", user };
  }
  if (clean === "/api/auth/logout") return { ok: true };
  if (clean === "/api/auth/refresh") return { accessToken: "demo-token" };

  // Profile
  if (clean === "/api/me/profile") return demoProfile(getDemoEmail());
  if (clean === "/api/me/enrollments") return ENROLLMENTS;
  if (clean === "/api/me/stats") return { streakDays: 5, weekStudyMinutes: 200 };

  // Student course
  if (clean.startsWith("/api/courses/")) return OUTLINE;
  if (/^\/api\/lessons\/[^/]+\/contents$/.test(clean)) return SLIDES;
  if (clean.startsWith("/api/learning-sessions")) {
    if (method === "PATCH") return {};
    return {
      id: "sess-1",
      enrollmentId: "enr-1",
      lessonId: "lesson-1",
      deviceId: "dev-1",
      calibrated: true,
      status: "active",
      trackingConsent: true,
    };
  }
  if (/\/gaze-samples$/.test(clean)) return { ok: true, inserted: 1 };

  // Calibration
  if (clean === "/api/calibrations" && method === "POST") return { ok: true };
  if (clean === "/api/calibrations/active") return { calibrated: true, calibratedAt: new Date().toISOString() };
  if (clean === "/api/calibrations/config") return { enabled: true, threshold: 0.12 };

  // Teacher
  if (clean === "/api/teacher/courses" && method === "GET") return [TEACHER_COURSE];
  if (clean === "/api/teacher/courses" && method === "POST") return TEACHER_COURSE;
  if (/^\/api\/teacher\/courses\/[^/]+$/.test(clean)) return MODULES;
  if (/^\/api\/teacher\/courses\/[^/]+\/students$/.test(clean)) {
    if (method === "POST") return { ok: true, added: 1 };
    return STUDENTS;
  }
  if (/^\/api\/teacher\/courses\/[^/]+\/students\/[^/]+$/.test(clean)) return { ok: true };
  if (/^\/api\/teacher\/courses\/[^/]+\/gaze-dot$/.test(clean)) return { ok: true, updated: 3 };
  if (clean.startsWith("/api/teacher/students")) {
    return [{ id: "stu-9", name: "Hoàng Văn Dũng", code: "SV009", color: "#000" }];
  }
  if (/^\/api\/teacher\/lessons\/[^/]+\/heatmap$/.test(clean)) return HEATMAP_STATS;
  if (/^\/api\/teacher\/lessons\/[^/]+\/slides$/.test(clean)) return [];
  if (/^\/api\/teacher\/lessons\/[^/]+\/mastery$/.test(clean)) {
    return {
      lessonId: "lesson-1",
      score: 80,
      keyScore: 80,
      normalScore: 80,
      keyDone: 1,
      keyTotal: 1,
      slidesDone: 3,
      slidesTotal: 3,
      slides: [],
    };
  }
  if (/^\/api\/teacher\/modules\/[^/]+\/quizzes$/.test(clean) && method === "POST") {
    return {
      id: "lesson-quiz-new",
      title: "Bài tập mới",
      kind: "quiz",
      slides: 0,
      quizId: "quiz-new",
      quizStatus: "draft",
      questionCount: 0,
      durationMinutes: 30,
      dueAt: null,
    };
  }
  if (/^\/api\/teacher\/modules\/[^/]+\/items\/reorder$/.test(clean)) {
    // Demo không có backend: sắp xếp lại ngay trong bộ nhớ để thấy kết quả kéo thả.
    const moduleId = clean.split("/")[4];
    const items = (body as { items?: { id: string }[] } | undefined)?.items ?? [];
    const mod = MODULES.find((item) => item.id === moduleId);
    if (mod) {
      const position = (lesson: { id: string }) => {
        const index = items.findIndex((item) => item.id === lesson.id);
        return index < 0 ? Number.MAX_SAFE_INTEGER : index;
      };
      mod.lessons.sort((a, b) => position(a) - position(b));
    }
    return { ok: true };
  }
  if (clean.startsWith("/api/teacher/lessons/") || clean.startsWith("/api/teacher/modules/") || clean.startsWith("/api/teacher/slides/")) {
    return { ok: true, id: "demo" };
  }

  // Admin
  if (clean === "/api/admin/teachers") return TEACHER_DIRECTORY;
  if (/^\/api\/admin\/courses\/[^/]+\/teachers$/.test(clean)) {
    if (method === "POST") return { ok: true, assigned: ["t-2"], added: 1 };
    return COURSE_TEACHERS;
  }
  if (/^\/api\/admin\/courses\/[^/]+\/teachers\/[^/]+$/.test(clean)) return { ok: true };
  if (clean === "/api/admin/calibration-settings") {
    if (method === "PUT") return { enabled: true, threshold: 0.1 };
    return { enabled: true, threshold: 0.12, updatedAt: null };
  }

  return undefined;
}

function getDemoEmail(): string {
  if (typeof window === "undefined") return "student@school.edu.vn";
  return globalThis.localStorage?.getItem("demo_email") ?? "student@school.edu.vn";
}

export function setDemoEmail(email: string): void {
  globalThis.localStorage?.setItem("demo_email", email);
}

/** Ghi cookie demo để middleware (proxy.ts) cho qua protected routes. */
export function setDemoCookies(): void {
  if (typeof document === "undefined") return;
  document.cookie = "access_token=demo-token; path=/; SameSite=Lax";
  document.cookie = "refresh_token=demo-refresh; path=/; SameSite=Lax";
}
