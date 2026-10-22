import type { Page, Route } from "@playwright/test";

export interface MockUser {
  email: string;
  fullName: string;
  role: "student" | "teacher" | "admin";
  avatarUrl?: string | null;
}

export function json(route: Route, body: unknown, status = 200) {
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

export const MODULES = [
  {
    id: "mod-1",
    title: "Chương 1: Nhập môn",
    lessons: [
      { id: "lesson-1", title: "Bài 1: Giới thiệu", kind: "lesson", slides: 3, attention: 70 },
      { id: "lesson-2", title: "Bài 2: Biến", kind: "lesson", slides: 2, attention: 60 },
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
];

export const STUDENTS = [
  {
    id: "stu-1",
    name: "Nguyễn Văn An",
    code: "SV001",
    color: "#000",
    attention: 72,
    lastActive: "2 giờ trước",
    status: "active",
    lessons: [{ lessonId: "lesson-1", attention: 70 }],
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
];

export const ENROLLMENTS = [
  {
    enrollmentId: "enr-1",
    enrolledAt: "2026-09-01T00:00:00Z",
    status: "active",
    course: {
      id: "course-1",
      title: "Lập trình Python cơ bản",
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
        { id: "lesson-1", title: "Bài 1: Giới thiệu", kind: "lesson", slideCount: 3 },
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
        { id: "lesson-2", title: "Bài 2: Biến", kind: "lesson", slideCount: 2 },
      ],
    },
  ],
};

const QUIZ_BASE = {
  id: "quiz-python-1",
  courseId: "course-1",
  courseTitle: "Lập trình Python cơ bản",
  lessonId: "lesson-quiz-1",
  lessonTitle: "Bài tập: Kiểm tra nhập môn",
  title: "Kiểm tra kiến thức Python nhập môn",
  instructions: "Chọn đáp án đúng cho mỗi câu.",
  dueAt: null,
  durationMinutes: 15,
  status: "published",
  createdAt: "2026-10-14T08:00:00.000Z",
  allowRetry: true,
};

const QUIZ_QUESTIONS = [
  {
    id: "q-1",
    prompt: "Từ khóa nào dùng để khai báo một hàm trong Python?",
    options: [
      { id: "q-1-a", text: "func" },
      { id: "q-1-b", text: "def" },
      { id: "q-1-c", text: "function" },
    ],
    correctOptionIds: ["q-1-b"],
    allowMultiple: false,
    explanation: "Python dùng từ khóa def.",
    points: 1,
  },
  {
    id: "q-2",
    prompt: "Kiểu dữ liệu nào lưu dãy phần tử có thứ tự và thay đổi được?",
    options: [
      { id: "q-2-a", text: "tuple" },
      { id: "q-2-b", text: "set" },
      { id: "q-2-c", text: "list" },
    ],
    correctOptionIds: ["q-2-c"],
    allowMultiple: false,
    explanation: "list có thứ tự và thay đổi được.",
    points: 1,
  },
  {
    id: "q-3",
    prompt: "Kết quả của 3 ** 2 là gì?",
    options: [
      { id: "q-3-a", text: "6" },
      { id: "q-3-b", text: "9" },
      { id: "q-3-c", text: "32" },
    ],
    correctOptionIds: ["q-3-b"],
    allowMultiple: false,
    explanation: "3 ** 2 = 9.",
    points: 1,
  },
];

// Bản công khai cho học viên chưa nộp (ẩn đáp án + giải thích).
export const QUIZ_PUBLIC = {
  ...QUIZ_BASE,
  questions: QUIZ_QUESTIONS.map((question) => ({
    ...question,
    correctOptionIds: [],
    explanation: "",
  })),
};

export const QUIZ_REVEALED = { ...QUIZ_BASE, questions: QUIZ_QUESTIONS };

export const QUIZ_ATTEMPT = {
  id: "attempt-1",
  assignmentId: "quiz-python-1",
  answers: { "q-1": ["q-1-b"], "q-2": ["q-2-c"], "q-3": ["q-3-b"] },
  submittedAt: "2026-10-15T08:00:00.000Z",
  score: 3,
  maxScore: 3,
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

  // Quiz / bài tập trắc nghiệm (nhúng trong bài học)
  let quizSubmitted = false;
  await page.route("**/api/assignments/*", (r) =>
    json(r, {
      ...QUIZ_PUBLIC,
      id: r.request().url().split("/").pop(),
      status: "draft",
      questions: [],
    }),
  );
  await page.route("**/api/assignments/*/attempt", (r) => json(r, null));
  await page.route("**/api/assignments/*/attempts", (r) => json(r, QUIZ_ATTEMPT, 201));
  // Trợ lý học tập theo môn (chat session)
  await page.route("**/api/courses/*/chat/sessions", (r) => json(r, []));
  await page.route("**/api/chat/sessions/*/messages", (r) => json(r, []));
  await page.route("**/api/courses/*/chat", (r) =>
    json(r, { sessionId: "session-1", answer: "Gợi ý", citations: [], intent: "qa" }),
  );
  // Giáo viên/quản trị luôn thấy đáp án đúng (giống backend: reveal theo role).
  const revealQuizAnswers = user.role === "teacher" || user.role === "admin";
  // Route cụ thể đăng ký sau route tổng để được ưu tiên (last match wins).
  await page.route("**/api/assignments/quiz-python-1", (r) => {
    if (r.request().method() === "PATCH") {
      // Giả lập PATCH: trả về bài tập đã ghép thay đổi để UI phản hồi đúng trạng thái.
      const patch = (r.request().postDataJSON() ?? {}) as Record<string, unknown>;
      return json(r, { ...QUIZ_REVEALED, ...patch });
    }
    return json(r, quizSubmitted || revealQuizAnswers ? QUIZ_REVEALED : QUIZ_PUBLIC);
  });
  await page.route("**/api/assignments/quiz-python-1/attempt", (r) =>
    json(r, quizSubmitted ? QUIZ_ATTEMPT : null),
  );
  await page.route("**/api/assignments/quiz-python-1/attempts", (r) => {
    quizSubmitted = true;
    return json(r, QUIZ_ATTEMPT, 201);
  });
  await page.route("**/api/assignments/quiz-python-1/retry", (r) => {
    quizSubmitted = false;
    return json(r, QUIZ_PUBLIC);
  });

  // Calibrations
  await page.route("**/api/calibrations", (r) => json(r, { ok: true }));
  // Route cụ thể phải đăng ký SAU route tổng để được ưu tiên (Playwright: last match wins)
  await page.route("**/api/calibrations/active/model**", (r) =>
    json(r, { modelUbjBase64: "VUJK", maePx: 0.05 }),
  );
  await page.route("**/api/calibrations/active**", (r) =>
    json(r, { calibrated: true, calibratedAt: new Date().toISOString() }),
  );
  await page.route("**/api/calibrations/config", (r) =>
    json(r, { enabled: true, threshold: 0.12 }),
  );

  // Teacher
  // Bản sao mutable của cây khóa học: kéo thả xong, refetch phải thấy thứ tự mới.
  const courseTree = MODULES.map((mod) => ({
    ...mod,
    lessons: mod.lessons.map((lesson) => ({ ...lesson })),
  }));
  await page.route("**/api/teacher/courses/**", (r) => json(r, courseTree));
  // PATCH /teacher/courses/{id} = lưu thông tin khóa học; GET cùng path = cây nội dung.
  await page.route("**/api/teacher/courses/*", (r) => {
    if (r.request().method() === "PATCH") {
      const patch = (r.request().postDataJSON() ?? {}) as Record<string, unknown>;
      return json(r, { ...TEACHER_COURSE, ...patch });
    }
    return json(r, courseTree);
  });
  await page.route("**/api/teacher/courses", (r) => {
    if (r.request().method() === "POST") return json(r, TEACHER_COURSE);
    return json(r, [TEACHER_COURSE]);
  });
  await page.route("**/api/teacher/courses/*/students", (r) => {
    if (r.request().method() === "POST") return json(r, { ok: true, added: 1 });
    return json(r, STUDENTS);
  });
  await page.route("**/api/teacher/courses/*/students/*", (r) => json(r, { ok: true }));
  await page.route("**/api/teacher/courses/*/gaze-dot", (r) =>
    json(r, { ok: true, updated: 3 }),
  );
  await page.route("**/api/teacher/modules/*/quizzes", (r) =>
    json(
      r,
      {
        id: "lesson-quiz-new",
        title: "Bài tập mới",
        kind: "quiz",
        slides: 0,
        quizId: "quiz-new",
        quizStatus: "draft",
        questionCount: 0,
        durationMinutes: 30,
        dueAt: null,
      },
      201,
    ),
  );
  await page.route("**/api/teacher/modules/*/items/reorder", (r) => {
    const moduleId = /\/modules\/([^/]+)\/items\/reorder/.exec(r.request().url())?.[1];
    const items = (r.request().postDataJSON() as { items?: { id: string }[] }).items ?? [];
    const mod = courseTree.find((item) => item.id === moduleId);
    if (mod) {
      const position = (lesson: { id: string }) => {
        const index = items.findIndex((item) => item.id === lesson.id);
        return index < 0 ? Number.MAX_SAFE_INTEGER : index;
      };
      mod.lessons.sort((a, b) => position(a) - position(b));
    }
    return json(r, { ok: true });
  });
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
    if (url.includes("/model")) {
      return r.fulfill({
        status: 200,
        contentType: "application/octet-stream",
        body: "UBJ",
      });
    }
    if (url.includes("/import")) return json(r, { status: "ready" });
    if (url.includes("/train")) return json(r, { status: "ok", mae_px: 0.05 });
    if (url.includes("/calibrate")) return json(r, { status: "accepted", count: 1 });
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
