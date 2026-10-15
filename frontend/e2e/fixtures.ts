import type { Page, Route } from "@playwright/test";

export interface MockUser {
  email: string;
  fullName: string;
  role: "student" | "teacher" | "admin";
  avatarUrl?: string | null;
}

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({
    status,
    contentType: "application/json",
    body: JSON.stringify(body),
  });
}

export const TEACHER_COURSE = {
  id: "course-1",
  title: "Lập trình Python cơ bản",
  description: "Khóa nhập môn",
  level: "beginner",
  gradient: "",
  status: "published",
  students: 2,
  completion: 68,
  attention: 72,
  sessions: 5,
  updatedAt: "01/10/2026",
  isOwner: true,
};

export const MODULES = [
  {
    id: "mod-1",
    title: "Chương 1: Nhập môn",
    lessons: [
      { id: "lesson-1", title: "Bài 1: Giới thiệu", slides: 3, completion: 80, attention: 70 },
      { id: "lesson-2", title: "Bài 2: Biến", slides: 2, completion: 40, attention: 60 },
    ],
  },
];

export const STUDENTS = [
  {
    id: "stu-1",
    name: "Nguyễn Văn An",
    code: "SV001",
    color: "#000",
    progress: 80,
    attention: 72,
    lastActive: "2 giờ trước",
    status: "active",
    lessons: [{ lessonId: "lesson-1", viewed: 3, total: 3, attention: 70 }],
  },
  {
    id: "stu-2",
    name: "Trần Thị Bình",
    code: "SV002",
    color: "#000",
    progress: 100,
    attention: null,
    lastActive: "1 ngày trước",
    status: "completed",
    lessons: [{ lessonId: "lesson-1", viewed: 3, total: 3, attention: null }],
  },
];

export const ENROLLMENTS = [
  {
    enrollmentId: "enr-1",
    enrolledAt: "2026-09-01T00:00:00Z",
    status: "active",
    progress: 45,
    course: {
      id: "course-1",
      title: "Lập trình Python cơ bản",
      level: "beginner",
      thumbnailUrl: null,
      teacherName: "ThS. Nguyễn Văn Minh",
      moduleCount: 1,
      lessonCount: 2,
      gradient: "",
    },
  },
];

export const OUTLINE = {
  id: "course-1",
  title: "Lập trình Python cơ bản",
  modules: [
    {
      id: "mod-1",
      orderIndex: 1,
      title: "Chương 1: Nhập môn",
      lessons: [
        { id: "lesson-1", title: "Bài 1: Giới thiệu", slideCount: 3, completed: true },
        { id: "lesson-2", title: "Bài 2: Biến", slideCount: 2, completed: false },
      ],
    },
  ],
};

export const SLIDES = [
  { id: "c1", title: "Trang 1", imageUrl: null },
  { id: "c2", title: "Trang 2", imageUrl: null },
  { id: "c3", title: "Trang 3", imageUrl: null },
];

export const HEATMAP_STATS = [
  { idx: 0, onSlide: 82, fixations: 10, viewSec: 30, hotspots: [], points: [[0.4, 0.4]], aois: [] },
  { idx: 1, onSlide: 64, fixations: 8, viewSec: 22, hotspots: [], points: [[0.5, 0.5]], aois: [] },
  { idx: 2, onSlide: 40, fixations: 5, viewSec: 15, hotspots: [], points: [[0.6, 0.6]], aois: [] },
];

export const TEACHER_DIRECTORY = [
  { id: "t-1", name: "ThS. Nguyễn Văn Minh", code: "GV001", email: "gv1@school.edu.vn" },
  { id: "t-2", name: "TS. Lê Thị Hoa", code: "GV002", email: "gv2@school.edu.vn" },
];

export const COURSE_TEACHERS = [
  { teacherId: "t-1", name: "ThS. Nguyễn Văn Minh", code: "GV001", email: "gv1@school.edu.vn", isOwner: true },
];

/**
 * Chặn toàn bộ API của backend + ML. Mọi route chưa khai báo sẽ trả 404 JSON
 * để test phát hiện rõ thay vì treo.
 */
export async function mockApi(page: Page, opts: { user?: MockUser } = {}) {
  const user: MockUser = opts.user ?? {
    email: "student@school.edu.vn",
    fullName: "Nguyễn Văn An",
    role: "student",
  };

  const profile = {
    email: user.email,
    fullName: user.fullName,
    dateOfBirth: "2003-01-01",
    gender: "male",
    phone: "0900000000",
    avatarUrl: user.avatarUrl ?? null,
    createdAt: "2026-01-01T00:00:00Z",
    role: user.role,
    ...(user.role === "student" ? { studentCode: "SV001", program: "CNTT K46" } : {}),
    ...(user.role === "teacher" ? { teacherCode: "GV001", department: "Khoa CNTT" } : {}),
  };

  // Auth
  await page.route("**/api/auth/login", async (r) => {
    // Set cookie httpOnly giả để middleware cho qua protected routes.
    await r.fulfill({
      status: 200,
      contentType: "application/json",
      headers: {
        "set-cookie": "access_token=fake-token; Path=/; SameSite=Lax",
      },
      body: JSON.stringify({
        accessToken: "fake-token",
        refreshToken: "fake-refresh",
        user: { id: user.email, email: user.email, roles: [user.role], fullName: user.fullName },
      }),
    });
  });
  await page.route("**/api/auth/logout", (r) => json(r, { ok: true }));
  await page.route("**/api/auth/refresh", (r) => json(r, { accessToken: "fake-token" }));

  // Profile
  await page.route("**/api/me/profile", (r) => json(r, profile));

  // Student
  await page.route("**/api/me/enrollments", (r) => json(r, ENROLLMENTS));
  await page.route("**/api/me/stats", (r) => json(r, { streakDays: 5, weekStudyMinutes: 200 }));
  await page.route("**/api/courses/**", (r) => json(r, OUTLINE));
  await page.route("**/api/lessons/**/contents", (r) => json(r, SLIDES));
  await page.route("**/api/lessons/**/progress", (r) => {
    if (r.request().method() === "PATCH") return json(r, { ok: true });
    return json(r, { lastSlide: 1, viewed: [0, 1, 2], completed: false, updatedAt: null });
  });
  await page.route("**/api/learning-sessions**", (r) => {
    if (r.request().method() === "PATCH") return json(r, {});
    return json(r, {
      id: "sess-1",
      enrollmentId: "enr-1",
      lessonId: "lesson-1",
      deviceId: "dev-1",
      calibrated: true,
      status: "active",
      trackingConsent: true,
    });
  });
  await page.route("**/api/lessons/**/gaze-samples", (r) => json(r, { ok: true, inserted: 1 }));

  // Calibrations
  await page.route("**/api/calibrations", (r) => json(r, { ok: true }));
  await page.route("**/api/calibrations/active**", (r) =>
    json(r, { calibrated: true, calibratedAt: new Date().toISOString() }),
  );
  await page.route("**/api/calibrations/config", (r) =>
    json(r, { enabled: true, threshold: 0.12 }),
  );

  // Teacher
  await page.route("**/api/teacher/courses/**", (r) => json(r, MODULES));
  await page.route("**/api/teacher/courses", (r) => {
    if (r.request().method() === "POST") return json(r, TEACHER_COURSE);
    return json(r, [TEACHER_COURSE]);
  });
  await page.route("**/api/teacher/courses/*/students", (r) => {
    if (r.request().method() === "POST") return json(r, { ok: true, added: 1 });
    return json(r, STUDENTS);
  });
  await page.route("**/api/teacher/courses/*/students/*", (r) => json(r, { ok: true }));
  await page.route("**/api/teacher/students**", (r) => {
    const q = new URL(r.request().url()).searchParams.get("q");
    return json(
      r,
      q
        ? [{ id: "stu-3", name: "Phạm Văn Cường", code: "SV003", color: "#000" }]
        : [],
    );
  });
  await page.route("**/api/teacher/lessons/*", (r) => json(r, { ok: true }));
  await page.route("**/api/teacher/lessons/*/heatmap**", (r) => json(r, HEATMAP_STATS));
  await page.route("**/api/teacher/lessons/*/slides", (r) => json(r, []));
  await page.route("**/api/teacher/lessons/*/mastery**", (r) =>
    json(r, { lessonId: "lesson-1", score: 80, keyScore: 80, normalScore: 80, keyDone: 1, keyTotal: 1, slidesDone: 3, slidesTotal: 3, slides: [] }),
  );

  // Admin
  await page.route("**/api/admin/teachers", (r) => json(r, TEACHER_DIRECTORY));
  await page.route("**/api/admin/courses/*/teachers", (r) => {
    if (r.request().method() === "POST") return json(r, { ok: true, assigned: ["t-2"], added: 1 });
    return json(r, COURSE_TEACHERS);
  });
  await page.route("**/api/admin/courses/*/teachers/*", (r) => json(r, { ok: true }));
  await page.route("**/api/admin/calibration-settings", (r) => {
    if (r.request().method() === "PUT") return json(r, { enabled: true, threshold: 0.1 });
    return json(r, { enabled: true, threshold: 0.12, updatedAt: null });
  });

  // Gaze ML service
  await page.route("**/gaze/session**", (r) => {
    const url = r.request().url();
    if (url.endsWith("/session") && r.request().method() === "POST") {
      return json(r, { session_id: "gaze-sess-1" });
    }
    if (url.includes("/train")) return json(r, { status: "ok", mae_px: 0.05 });
    if (url.includes("/calibrate")) return json(r, { status: "accepted", count: 2 });
    return json(r, { state: "ready", calibrated: true });
  });

  // Catch-all: tránh request thật ra ngoài
  await page.route("**/media/**", (r) => r.fulfill({ status: 404, body: "" }));
}

/** Đặt cookie đăng nhập để qua middleware + useAuthState. */
export async function seedAuth(page: Page, user: MockUser) {
  await page.context().addCookies([
    {
      name: "access_token",
      value: "fake-token",
      domain: "localhost",
      path: "/",
    },
    {
      name: "refresh_token",
      value: "fake-refresh",
      domain: "localhost",
      path: "/",
    },
  ]);
  return user;
}
