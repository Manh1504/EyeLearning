import { test, expect } from "@playwright/test";
import { open } from "node:fs/promises";
import { mockApi, seedAuth } from "./fixtures";

const TEACHER = {
  email: "teacher@school.edu.vn",
  fullName: "ThS. Nguyễn Văn Minh",
  role: "teacher" as const,
};

test.describe("Teacher", () => {
  test.beforeEach(async ({ page }) => {
    await seedAuth(page, TEACHER);
    await mockApi(page, { user: TEACHER });
  });

  test("danh sách khóa học hiển thị stats và card", async ({ page }) => {
    await page.goto("/teacher");
    await expect(page.getByRole("heading", { name: "Khóa học" })).toBeVisible();
    await expect(page.getByText("Lập trình Python cơ bản").first()).toBeVisible();
    await expect(page.getByRole("link", { name: "Tạo khóa học" })).toBeVisible();
  });

  test("workspace tab Nội dung hiển thị chương/bài", async ({ page }) => {
    await page.goto("/teacher/courses/course-1?tab=content");
    await expect(page.getByRole("heading", { name: "Thông tin khóa học" })).toBeVisible();
    await expect(page.getByText("Chương 1: Nhập môn")).toBeVisible();
    await expect(page.getByText("Bài 1: Giới thiệu")).toBeVisible();
  });

  test("tạo khóa học cho phép chọn học viên để ghi danh", async ({ page }) => {
    await page.goto("/teacher/courses/c-new?new=1");
    const searchRequest = page.waitForRequest((request) => {
      const url = new URL(request.url());
      return url.pathname === "/api/teacher/students" && url.searchParams.get("q") === "SV003";
    });
    await page.getByRole("textbox", { name: "Tìm học viên để thêm vào khóa học" }).fill("SV003");
    await searchRequest;
    const student = page.getByRole("checkbox", { name: /Phạm Văn Cường/ });

    await expect(student).toBeVisible();
    await student.check();
    await expect(page.getByText("Tùy chọn · đã chọn 1")).toBeVisible();
  });

  test("dialog thêm học viên tìm kiếm trên server", async ({ page }) => {
    await page.goto("/teacher/courses/course-1?tab=students");
    await page.getByRole("button", { name: /Thêm học viên/ }).first().click();
    const searchRequest = page.waitForRequest((request) => {
      const url = new URL(request.url());
      return url.pathname === "/api/teacher/students" && url.searchParams.get("q") === "SV003";
    });

    await page.getByRole("textbox", { name: "Tìm học viên để thêm" }).fill("SV003");

    await searchRequest;
    await expect(page.getByText("Phạm Văn Cường")).toBeVisible();
  });

  test("từ chối PDF quá lớn trước khi tạo khóa học", async ({ page }, testInfo) => {
    let createRequests = 0;
    await page.route("**/api/teacher/courses", async (route) => {
      if (route.request().method() === "POST") createRequests += 1;
      await route.fallback();
    });
    await page.goto("/teacher/courses/c-new?new=1");
    await page.getByLabel("Tên khóa học").fill("Khóa kiểm tra PDF");
    await page.getByLabel("Tên chương 1").fill("Chương kiểm tra");
    await page.getByLabel("Tên bài 1").fill("Bài kiểm tra");
    const oversizedPdf = testInfo.outputPath("too-large.pdf");
    const file = await open(oversizedPdf, "w");
    await file.truncate(50 * 1024 * 1024 + 1);
    await file.close();
    await page.getByLabel("PDF cho bài 1").setInputFiles(oversizedPdf);

    await expect(page.getByText(/PDF vượt quá 50MB: too-large\.pdf/)).toBeVisible();
    await expect(page.getByRole("button", { name: "Tạo và xuất bản" })).toBeDisabled();
    expect(createRequests).toBe(0);
  });

  test("giữ liên kết bản nháp khi tạo đầy đủ thất bại", async ({ page }) => {
    await page.route("**/api/teacher/courses", async (route) => {
      if (route.request().method() !== "POST") return route.fallback();
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ id: "draft-recovery" }),
      });
    });
    await page.route("**/api/teacher/courses/draft-recovery/modules", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: '{"id":"mod-recovery"}' }),
    );
    await page.route("**/api/teacher/modules/mod-recovery/lessons", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: '{"id":"lesson-recovery"}' }),
    );
    await page.route("**/api/teacher/lessons/lesson-recovery/slides/upload", (route) =>
      route.fulfill({ status: 500, contentType: "application/json", body: '{"detail":"upload failed"}' }),
    );
    await page.goto("/teacher/courses/c-new?new=1");
    await page.getByLabel("Tên khóa học").fill("Khóa cần khôi phục");
    await page.getByLabel("Tên chương 1").fill("Chương 1");
    await page.getByLabel("Tên bài 1").fill("Bài 1");
    await page.getByLabel("PDF cho bài 1").setInputFiles({
      name: "lesson.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from("%PDF-1.4"),
    });
    await page.getByRole("button", { name: "Tạo và xuất bản" }).click();

    await expect(page.getByRole("alert").filter({ hasText: "Khóa học nháp đã được tạo" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Tiếp tục chỉnh sửa bản nháp" })).toHaveAttribute(
      "href",
      "/teacher/courses/draft-recovery?tab=content",
    );
    await expect(page.getByRole("button", { name: "Tạo và xuất bản" })).toHaveCount(0);
  });

  test("thay PDF tải lại danh sách slide quản trị", async ({ page }) => {
    let slideRequests = 0;
    await page.route("**/api/teacher/lessons/lesson-1/slides", (route) => {
      slideRequests += 1;
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([
          { id: `slide-${slideRequests}`, orderIndex: 1, imageUrl: null, isKey: false, aoiCount: 0, aoiSource: "none" },
        ]),
      });
    });
    await page.route("**/api/teacher/lessons/lesson-1/slides/upload", (route) =>
      route.fulfill({ status: 201, contentType: "application/json", body: '{"ok":true,"slides":1}' }),
    );
    await page.goto("/teacher/courses/course-1?tab=content");
    await page.getByRole("button", { name: "Mở Bài 1: Giới thiệu" }).click();
    await expect.poll(() => slideRequests).toBe(1);

    await page.locator('input[type="file"]').setInputFiles({
      name: "replacement.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from("%PDF-1.4"),
    });

    await expect.poll(() => slideRequests).toBeGreaterThan(1);
  });

  test("đổi tên bài học gọi API cập nhật", async ({ page }) => {
    await page.goto("/teacher/courses/course-1?tab=content");
    const request = page.waitForRequest((candidate) =>
      candidate.url().includes("/api/teacher/lessons/lesson-1") && candidate.method() === "PATCH",
    );

    await page.getByRole("button", { name: "Bài 1: Giới thiệu", exact: true }).click();
    const input = page.getByRole("textbox", { name: "Đổi tên" });
    await input.fill("Bài 1: Python nhập môn");
    await input.press("Enter");

    expect((await request).postDataJSON()).toEqual({ title: "Bài 1: Python nhập môn" });
  });

  test("workspace tab Học viên hiển thị danh sách", async ({ page }) => {
    await page.goto("/teacher/courses/course-1?tab=students");
    await expect(page.getByText("Nguyễn Văn An")).toBeVisible();
    await expect(page.getByText("Trần Thị Bình")).toBeVisible();
    await expect(page.getByRole("button", { name: /Thêm học viên/ })).toBeVisible();
  });

  test("drawer tiến độ hiển thị mọi bài và liên kết heatmap học viên", async ({ page }) => {
    await page.goto("/teacher/courses/course-1?tab=students");
    await page.getByRole("button", { name: "Xem tiến độ & heatmap" }).first().click();

    await expect(page.getByRole("dialog").getByText("Nguyễn Văn An")).toBeVisible();
    await expect(page.getByRole("dialog").getByText("Bài 1: Giới thiệu")).toBeVisible();
    await expect(page.getByRole("dialog").getByText("Bài 2: Biến")).toBeVisible();
    await expect(page.getByRole("dialog").getByRole("link", { name: /Bài 2: Biến/ })).toHaveAttribute(
      "href",
      "/teacher/courses/course-1/lessons/lesson-2/heatmap?student=stu-1&from=students",
    );
  });

  test("workspace tab Tổng quan hiển thị metric", async ({ page }) => {
    await page.goto("/teacher/courses/course-1?tab=overview");
    await expect(page.getByText("Tổng quan khóa học")).toBeVisible();
    await expect(page.getByText("Tổng học viên")).toBeVisible();
    await expect(page.getByText("Phân bố tiến độ")).toBeVisible();
  });

  test("heatmap viewer hiển thị bộ lọc và dữ liệu", async ({ page }) => {
    await page.goto("/teacher/courses/course-1/lessons/lesson-1/heatmap");
    await expect(page.getByText("Phân tích điểm nhìn")).toBeVisible();
    await expect(page.getByRole("combobox", { name: "Đối tượng" })).toBeVisible();
    await expect(page.getByText("Tỷ lệ gaze trên trang")).toBeVisible();
  });

  test("hồ sơ giảng viên", async ({ page }) => {
    await page.goto("/teacher/profile");
    await expect(page.getByRole("heading", { name: "ThS. Nguyễn Văn Minh" })).toBeVisible();
    await expect(page.getByText("GV001", { exact: true })).toBeVisible();
  });
});
