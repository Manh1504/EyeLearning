import { test, expect, type Page } from "@playwright/test";
import { ENROLLMENTS, OUTLINE, json, mockApi, seedAuth } from "./fixtures";

const STUDENT = {
  email: "student@school.edu.vn",
  fullName: "Nguyễn Văn An",
  role: "student" as const,
};

async function mockSavedCalibration(
  page: Page,
  options: { sessionId?: string; expired?: boolean; unavailable?: boolean; changedScreen?: boolean } = {},
) {
  const calibratedAt = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString();
  const calls = {
    checks: 0,
    restores: 0,
    imports: [] as string[],
    samples: 0,
    active: 0,
    models: 0,
    statuses: [] as string[],
    unavailable: options.unavailable ?? false,
  };
  await page.addInitScript(({ sessionId, calibratedAt, changedScreen }) => {
    // Full navigations must not overwrite the session created by a restore.
    if (!localStorage.getItem("e2e_gaze_seeded")) {
      localStorage.setItem("e2e_gaze_seeded", "1");
      if (sessionId) localStorage.setItem("gaze_session_id", sessionId);
      localStorage.setItem("gaze_calibrated_at", calibratedAt);
      localStorage.setItem("gaze_screen_w", String(window.innerWidth * (changedScreen ? 0.75 : 1)));
      localStorage.setItem("gaze_screen_h", String(window.innerHeight));
      localStorage.setItem("gaze_dpr", String(window.devicePixelRatio));
    }
    Object.defineProperty(navigator.mediaDevices, "getUserMedia", {
      configurable: true,
      value: async () => {
        // Reader tracking may request a camera; preflight reuse must not.
        if (location.pathname.endsWith("/prepare")) {
          localStorage.setItem("e2e_preflight_camera_calls", String(
            Number(localStorage.getItem("e2e_preflight_camera_calls") ?? "0") + 1,
          ));
        }
        throw new DOMException("Camera disabled for regression tests", "NotAllowedError");
      },
    });
  }, { sessionId: options.sessionId, calibratedAt, changedScreen: options.changedScreen });
  await page.route("**/api/calibrations/active**", (route) => {
    calls.active += 1;
    return json(route, { calibrated: true, calibratedAt });
  });
  // Register after the generic active route: Playwright uses the last match.
  await page.route("**/api/calibrations/active/model**", (route) => {
    calls.models += 1;
    return json(route, { modelUbjBase64: "VUJK", maePx: 0.05 });
  });
  await page.route("**/gaze/session**", (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path === "/gaze/session" && request.method() === "POST") {
      const { points } = request.postDataJSON() as { points: { id: string }[] };
      if (points.some((point) => point.id === "check")) calls.checks += 1;
      else calls.restores += 1;
      return json(route, { session_id: "restored-session" });
    }
    if (path.endsWith("/import")) {
      expect(request.method()).toBe("POST");
      calls.imports.push(request.postDataBuffer()?.toString() ?? "");
      return json(route, { status: "ready" });
    }
    if (path.endsWith("/calibrate")) {
      calls.samples += 1;
      return json(route, { status: "accepted", count: 1 });
    }
    if (request.method() === "GET") {
      calls.statuses.push(path);
      if (calls.unavailable) return route.abort("failed");
      if (options.expired && path === `/gaze/session/${options.sessionId}`) {
        return json(route, { detail: "Session expired" }, 404);
      }
      return json(route, { state: "ready", calibrated: true });
    }
    return json(route, {});
  });
  return { calls, calibratedAt };
}

test.describe("Student", () => {
  test.beforeEach(async ({ page }) => {
    await seedAuth(page, STUDENT);
    await mockApi(page, { user: STUDENT });
  });

  test("home hiển thị danh sách khóa học và tìm kiếm theo tên", async ({ page }) => {
    await page.goto("/student");
    await expect(page.getByRole("heading", { name: /Chào mừng trở lại/ })).toBeVisible();
    await expect(page.getByText("Lập trình Python cơ bản").first()).toBeVisible();

    const search = page.getByRole("textbox", { name: "Tìm khóa học theo tên" });
    await search.fill("python");
    await expect(page.getByText("Lập trình Python cơ bản").first()).toBeVisible();
    await search.fill("khong-ton-tai");
    await expect(page.getByText("Không tìm thấy khóa học")).toBeVisible();
  });

  test("topbar bỏ pill Khóa học, logo dẫn về trang chính", async ({ page }) => {
    await page.goto("/student/profile");

    const topbar = page.getByRole("banner");
    await expect(topbar.getByRole("link", { name: "Khóa học" })).toHaveCount(0);

    await topbar.getByRole("link", { name: "GazeEdu" }).click();
    await expect(page).toHaveURL(/\/student$/);
  });

  test("danh sách khóa học sắp xếp theo cột", async ({ page }) => {
    await page.goto("/student");

    const byTitle = page.getByRole("button", { name: /Sắp xếp theo Khóa học/ });
    await byTitle.click();
    await expect(
      page.getByRole("button", { name: /Đang sắp xếp theo Khóa học tăng dần/ }),
    ).toBeVisible();

    await page.getByRole("button", { name: /Đang sắp xếp theo Khóa học tăng dần/ }).click();
    await expect(
      page.getByRole("button", { name: /Đang sắp xếp theo Khóa học giảm dần/ }),
    ).toBeVisible();
  });

  test("mở hồ sơ học viên và validate", async ({ page }) => {
    await page.goto("/student/profile");
    await expect(page.getByText("Thông tin có thể chỉnh sửa")).toBeVisible();
    await expect(page.getByText("SV001", { exact: true })).toBeVisible();
    const nameInput = page.getByLabel("Họ và tên");
    await nameInput.fill("");
    await expect(page.getByText("Họ và tên không được để trống.")).toBeVisible();

    await page.getByRole("button", { name: "Thay ảnh" }).click();
    await expect(page.getByLabel("Liên kết ảnh đại diện")).toBeVisible();
    await page.getByRole("button", { name: "Hủy" }).click();
    await expect(page.getByLabel("Liên kết ảnh đại diện")).toBeHidden();
  });

  test("preflight hiển thị các kiểm tra", async ({ page }) => {
    await page.route("**/api/calibrations/active**", (route) =>
      json(route, { calibrated: false, calibratedAt: null }),
    );
    await page.goto("/student/courses/course-1/prepare");
    await expect(page.getByRole("heading", { name: "Thiết lập một vùng học ổn định." })).toBeVisible();
    await expect(page.getByText("Lập trình Python cơ bản")).toBeVisible();
    await expect(page.getByText("Sẵn sàng vào bài")).toBeVisible();
    await expect(page.getByText("Hiệu chỉnh điểm nhìn").first()).toBeVisible();
    await expect(page.getByText("Cần hiệu chỉnh", { exact: true })).toBeVisible();
    await expect(page.getByText(/Thiết bị chưa có profile hiệu chỉnh tương thích/)).toBeVisible();
  });

  test.describe("saved calibration", () => {
    test.afterEach(async ({ page }) => {
      expect(await page.evaluate(() => localStorage.getItem("e2e_preflight_camera_calls"))).toBeNull();
    });

    test("ready session bypasses repeated prepare visits across lessons and courses", async ({ page }) => {
      const { calls } = await mockSavedCalibration(page, { sessionId: "saved-session" });
      await page.route("**/api/me/enrollments", (route) => json(route, [
        ...ENROLLMENTS,
        { ...ENROLLMENTS[0], enrollmentId: "enr-2", course: { ...ENROLLMENTS[0].course, id: "course-2" } },
      ]));
      await page.route("**/api/courses/course-2", (route) => json(route, { ...OUTLINE, id: "course-2" }));

      for (const [course, lesson, title] of [
        ["course-1", "lesson-1", "Bài 1: Giới thiệu"],
        ["course-1", "lesson-2", "Bài 2: Biến"],
        ["course-2", "lesson-1", "Bài 1: Giới thiệu"],
      ]) {
        const href = `/student/courses/${course}?lesson=${lesson}`;
        await page.goto(`/student/courses/${course}/prepare?lesson=${lesson}`);
        await expect(page).toHaveURL(href);
        await expect(page.getByRole("heading", { name: title, exact: true })).toBeVisible();
        expect(await page.evaluate(() => localStorage.getItem("gaze_session_id"))).toBe("saved-session");
      }
      expect(calls.statuses).toContain("/gaze/session/saved-session");
      expect(calls.active).toBe(0);
      expect(calls.models).toBe(0);
      expect(calls.restores).toBe(0);
      expect(calls.checks).toBe(0);
      expect(calls.samples).toBe(0);
    });

    for (const scenario of ["missing", "expired", "direct reader"] as const) {
      test(`${scenario} session restores a model older than 30 days without recalibration`, async ({ page }) => {
        const { calls, calibratedAt } = await mockSavedCalibration(page, {
          sessionId: scenario === "expired" ? "expired-session" : undefined,
          expired: scenario === "expired",
        });
        const readerHref = "/student/courses/course-1?lesson=lesson-2";
        await page.goto(scenario === "direct reader"
          ? readerHref
          : "/student/courses/course-1/prepare?lesson=lesson-2");
        await expect(page).toHaveURL(readerHref);
        await expect(page.getByRole("heading", { name: "Bài 2: Biến", exact: true })).toBeVisible();
        await expect.poll(() => page.evaluate(() => localStorage.getItem("gaze_session_id"))).toBe("restored-session");
        expect(await page.evaluate(() => localStorage.getItem("gaze_calibrated_at"))).toBe(calibratedAt);
        expect(calls.active).toBe(1);
        expect(calls.models).toBe(1);
        expect(calls.restores).toBe(1);
        expect(calls.imports).toHaveLength(1);
        expect(calls.imports[0]).toContain('filename="calibration.ubj"');
        expect(calls.imports[0]).toContain("UBJ");
        expect(calls.checks).toBe(0);
        expect(calls.samples).toBe(0);
        if (scenario === "expired") expect(calls.statuses).toContain("/gaze/session/expired-session");

        await page.goto("/student/courses/course-1/prepare?lesson=lesson-1");
        await expect(page).toHaveURL("/student/courses/course-1?lesson=lesson-1");
        await expect(page.getByRole("heading", { name: "Bài 1: Giới thiệu", exact: true })).toBeVisible();
        expect(calls.restores).toBe(1);
        expect(calls.imports).toHaveLength(1);
        expect(calls.checks).toBe(0);
        expect(calls.samples).toBe(0);
      });
    }

    test("check=1 retains the manual check screen and lesson-specific recalibration link", async ({ page }) => {
      const { calls } = await mockSavedCalibration(page, { sessionId: "saved-session" });
      const href = "/student/courses/course-1/prepare?lesson=lesson-2&check=1";
      await page.goto(href);
      await expect(page.getByText("Phiên sẵn sàng", { exact: true })).toBeVisible();
      await expect(page.getByRole("heading", { name: "Thiết lập một vùng học ổn định." })).toBeVisible();
      await expect(page).toHaveURL(href);
      await expect(page.getByRole("link", { name: "Hiệu chỉnh lại điểm nhìn" })).toHaveAttribute(
        "href", "/student/courses/course-1/calibrate?lesson=lesson-2",
      );
      await expect(page.getByRole("button", { name: "Kiểm tra camera", exact: true })).toBeEnabled();
      expect(calls.restores).toBe(0);
      expect(calls.checks).toBe(0);
      expect(calls.samples).toBe(0);
    });

    test("network failure retains the local session and retries without recalibration", async ({ page }) => {
      const { calls } = await mockSavedCalibration(page, { sessionId: "saved-session", unavailable: true });
      await page.goto("/student/courses/course-1/prepare?lesson=lesson-2");
      const retry = page.getByRole("button", { name: "Thử kết nối lại", exact: true });
      await expect(retry).toBeVisible();
      await expect(page.getByText(/không cần hiệu chỉnh lại chỉ vì mất kết nối/)).toBeVisible();
      expect(await page.evaluate(() => localStorage.getItem("gaze_session_id"))).toBe("saved-session");
      expect(calls.active).toBe(0);
      calls.unavailable = false;
      await retry.click();
      await expect(page).toHaveURL("/student/courses/course-1?lesson=lesson-2");
      await expect(page.getByRole("heading", { name: "Bài 2: Biến", exact: true })).toBeVisible();
      expect(calls.statuses.filter((path) => path === "/gaze/session/saved-session").length).toBeGreaterThanOrEqual(2);
      expect(await page.evaluate(() => localStorage.getItem("gaze_session_id"))).toBe("saved-session");
      expect(calls.active).toBe(0);
      expect(calls.restores).toBe(0);
      expect(calls.checks).toBe(0);
      expect(calls.samples).toBe(0);
    });

    test("viewport changed by more than ten percent requires manual setup", async ({ page }) => {
      const { calls } = await mockSavedCalibration(page, { sessionId: "saved-session", changedScreen: true });
      const href = "/student/courses/course-1/prepare?lesson=lesson-2";
      await page.goto(href);
      await expect(page.getByText(/Kích thước màn hình\/cửa sổ đã đổi/)).toBeVisible();
      await expect(page.getByText("Cần hiệu chỉnh", { exact: true })).toBeVisible();
      await expect(page.getByRole("button", { name: "Kiểm tra camera", exact: true })).toBeEnabled();
      await expect(page).toHaveURL(href);
      expect(calls.statuses).toEqual([]);
      expect(calls.active).toBe(0);
      expect(calls.models).toBe(0);
      expect(calls.restores).toBe(0);
      expect(calls.checks).toBe(0);
      expect(calls.samples).toBe(0);
    });
  });

  test("reader hiển thị slide và điều hướng trang", async ({ page }) => {
    await page.goto("/student/courses/course-1");
    await expect(page.getByRole("heading", { name: "Bài 1: Giới thiệu" })).toBeVisible();
    await page.getByRole("button", { name: "Sau" }).click();
    await page.getByRole("button", { name: "Sau" }).click();
    await expect(page.getByText(/3\s*\/\s*3/)).toBeVisible();
  });

  test("reader thông báo rõ khi bài học chưa có slide", async ({ page }) => {
    await page.route("**/api/lessons/lesson-1/contents", (route) => json(route, []));
    await page.goto("/student/courses/course-1");
    await expect(page.getByText("Bài học chưa có slide", { exact: true })).toBeVisible();
    await expect(page.getByText("Giảng viên chưa tải lên tài liệu PDF cho bài học này.")).toBeVisible();
    await expect(page.getByText("Nội dung trang PDF sẽ hiển thị tại đây.")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Trước", exact: true })).toBeDisabled();
    await expect(page.getByRole("button", { name: "Sau", exact: true })).toBeDisabled();
  });

  test("reader không nhầm slide thiếu ảnh với bài học trống", async ({ page }) => {
    await page.goto("/student/courses/course-1");
    await expect(page.getByText("Hình ảnh slide hiện không khả dụng.")).toBeVisible();
    await expect(page.getByText("Bài học chưa có slide", { exact: true })).toHaveCount(0);
  });

  test("reader mở bài tập trắc nghiệm và nộp bài", async ({ page }) => {
    await page.goto("/student/courses/course-1?lesson=lesson-quiz-1");
    await expect(page.getByText("Bài tập: Kiểm tra nhập môn").first()).toBeVisible();
    // Chưa nộp bài thì chưa có trợ lý học tập.
    await expect(page.getByRole("button", { name: "Mở trợ lý học tập" })).toHaveCount(0);

    await page.getByText("def", { exact: true }).click();
    await page.getByRole("button", { name: "Tiếp" }).click();
    await page.getByText("list", { exact: true }).click();
    await page.getByRole("button", { name: "Tiếp" }).click();
    await page.getByText("9", { exact: true }).click();
    await page.getByRole("button", { name: "Nộp bài" }).click();

    await expect(page.getByText(/3\/3 điểm/)).toBeVisible();
    await expect(page.getByText("Đáp án đúng").first()).toBeVisible();
    await expect(page.getByRole("button", { name: "Bài tiếp theo" })).toBeVisible();
    // Nộp xong mới hiện trợ lý học tập.
    await expect(page.getByRole("button", { name: "Mở trợ lý học tập" })).toBeVisible();
  });

  test("học viên làm lại bài tập khi giáo viên cho phép", async ({ page }) => {
    await page.goto("/student/courses/course-1?lesson=lesson-quiz-1");
    await page.getByText("def", { exact: true }).click();
    await page.getByRole("button", { name: "Tiếp" }).click();
    await page.getByText("list", { exact: true }).click();
    await page.getByRole("button", { name: "Tiếp" }).click();
    await page.getByText("9", { exact: true }).click();
    await page.getByRole("button", { name: "Nộp bài" }).click();
    await expect(page.getByText(/3\/3 điểm/)).toBeVisible();

    // Giáo viên đã bật "cho phép làm lại" -> có nút Làm lại + hộp xác nhận.
    await page.getByRole("button", { name: "Làm lại" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Làm lại" }).click();

    // Quay lại câu 1 với bài làm trắng và trợ lý học tập ẩn lại.
    await expect(page.getByText("Câu 1 / 3")).toBeVisible();
    await expect(page.getByRole("button", { name: "Nộp bài" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Mở trợ lý học tập" })).toHaveCount(0);
  });

  test("đổi bài đóng phiên cũ và quay lại tạo phiên mới", async ({ page }) => {
    const created: string[] = [];
    const closed: string[] = [];
    await page.route("**/api/learning-sessions**", async (route) => {
      if (route.request().method() === "PATCH") {
        closed.push(route.request().url().split("/").at(-1) ?? "");
        return route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
      }
      const input = route.request().postDataJSON() as { enrollmentId: string; lessonId: string };
      const id = `session-${created.length + 1}`;
      created.push(id);
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ...input, id, deviceId: "device-1", calibrated: true, status: "active", trackingConsent: true }),
      });
    });

    await page.goto("/student/courses/course-1");
    await expect.poll(() => created.length).toBe(1);

    await page.getByRole("button", { name: "Bài 2: Biến" }).click();
    await expect.poll(() => created.length).toBe(2);
    await expect.poll(() => closed).toContain("session-1");

    await page.getByRole("button", { name: "Bài 1: Giới thiệu" }).click();
    await expect.poll(() => created.length).toBe(3);
    expect(new Set(created).size).toBe(3);
  });
});
