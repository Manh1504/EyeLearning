import { test, expect } from "@playwright/test";
import { mockApi, seedAuth } from "./fixtures";

const STUDENT = {
  email: "student@school.edu.vn",
  fullName: "Nguyễn Văn An",
  role: "student" as const,
};

test.describe("Student", () => {
  test.beforeEach(async ({ page }) => {
    await seedAuth(page, STUDENT);
    await mockApi(page, { user: STUDENT });
  });

  test("home hiển thị stats và khóa học", async ({ page }) => {
    await page.goto("/student");
    await expect(page.getByRole("heading", { name: /Chào mừng trở lại/ })).toBeVisible();
    await expect(page.getByText("Lập trình Python cơ bản").first()).toBeVisible();
    await expect(page.getByText("ngày liên tiếp")).toBeVisible();
    const courseLinks = page.locator('a[href="/student/courses/course-1/prepare"]');
    await expect(courseLinks.first()).toBeVisible();
    expect(await courseLinks.count()).toBeGreaterThan(1);
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
    await page.goto("/student/courses/course-1/prepare");
    await expect(page.getByRole("heading", { name: "Thiết lập một vùng học ổn định." })).toBeVisible();
    await expect(page.getByText("Lập trình Python cơ bản")).toBeVisible();
    await expect(page.getByText("Sẵn sàng vào bài")).toBeVisible();
    await expect(page.getByText("Hiệu chỉnh điểm nhìn").first()).toBeVisible();
    await expect(page.getByText("Cần hiệu chỉnh", { exact: true })).toBeVisible();
    await expect(page.getByText(/không có phiên theo dõi cục bộ đang hoạt động/i)).toBeVisible();
  });

  test("reader hiển thị slide và điều hướng trang", async ({ page }) => {
    await page.goto("/student/courses/course-1");

    // Dialog "học tiếp" hiện khi có tiến độ cũ → chọn học tiếp để vào reader.
    const resume = page.getByRole("button", { name: "Học tiếp" });
    await resume.waitFor({ state: "visible", timeout: 8000 }).catch(() => {});
    if (await resume.isVisible().catch(() => false)) {
      await resume.click();
    }

    await expect(page.getByRole("heading", { name: "Bài 1: Giới thiệu" })).toBeVisible();
    await page.getByRole("button", { name: "Sau" }).click();
    await expect(page.getByText(/3\s*\/\s*3/)).toBeVisible();
  });

  test("resume không ghi slide 0 vì tiến độ backend là cộng dồn", async ({ page }) => {
    const progressPatches: Array<{ lastSlide?: number }> = [];
    await page.route("**/api/lessons/**/progress", async (route) => {
      if (route.request().method() === "PATCH") {
        progressPatches.push(route.request().postDataJSON() as { lastSlide?: number });
        return route.fulfill({ status: 200, contentType: "application/json", body: '{"ok":true}' });
      }
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ lastSlide: 1, viewed: [0, 1], completed: false, updatedAt: null }),
      });
    });

    await page.goto("/student/courses/course-1");
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.getByRole("button", { name: "Đóng" }).click();
    await page.waitForTimeout(1400);
    expect(progressPatches.some((patch) => patch.lastSlide === 0)).toBe(false);

    await page.reload();
    await page.getByRole("button", { name: "Bắt đầu lại" }).click();
    await expect(page.getByText(/1\s*\/\s*3/)).toBeVisible();
    await page.waitForTimeout(1400);
    expect(progressPatches.some((patch) => patch.lastSlide === 0)).toBe(false);
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
    await page.getByRole("button", { name: "Đóng" }).click();
    await expect.poll(() => created.length).toBe(1);

    await page.getByRole("button", { name: "Bài 2: Biến" }).click();
    await expect.poll(() => created.length).toBe(2);
    await expect.poll(() => closed).toContain("session-1");
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.getByRole("button", { name: "Đóng" }).click();

    await page.getByRole("button", { name: "Bài 1: Giới thiệu" }).click();
    await expect.poll(() => created.length).toBe(3);
    expect(new Set(created).size).toBe(3);
  });
});
