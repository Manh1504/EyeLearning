import { test, expect } from "@playwright/test";

// Demo mode được bật qua NEXT_PUBLIC_DEMO=1 trong e2e webServer env.
// Không mock API — app tự trả dữ liệu giả.

test.describe("Demo mode (không backend)", () => {
  test("trang gốc mở trang chọn màn /demo", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveURL(/\/demo/);
    await expect(page.getByRole("heading", { name: "Chọn màn để xem" })).toBeVisible();
  });

  test("nút Học viên nhảy thẳng vào /student có dữ liệu", async ({ page }) => {
    await page.goto("/demo");
    await page.getByRole("button", { name: "Mở" }).first().click();
    await expect(page).toHaveURL(/\/student$/);
    await expect(page.getByText("Lập trình Python cơ bản").first()).toBeVisible();
  });

  test("vào thẳng URL giảng viên không cần đăng nhập", async ({ page }) => {
    await page.goto("/teacher");
    await expect(page.getByText("Lập trình Python cơ bản").first()).toBeVisible();
  });

  test("vào thẳng URL học viên không cần đăng nhập", async ({ page }) => {
    await page.goto("/student");
    await expect(page.getByText("Lộ trình học")).toBeVisible();
  });

  test("bài trắc nghiệm hiển thị bên dưới bài học", async ({ page }) => {
    await page.goto("/student/courses/course-1?lesson=lesson-1");
    await page.getByRole("button", { name: "Bắt đầu lại" }).click();
    await expect(page.getByRole("heading", { name: "Bài trắc nghiệm" })).toBeVisible();
    await expect(page.getByText("Kiểm tra kiến thức Python nhập môn")).toBeVisible();
  });

  test("vào thẳng heatmap giảng viên", async ({ page }) => {
    await page.goto("/teacher/courses/course-1/lessons/lesson-1/heatmap");
    await expect(page.getByText("Phân tích điểm nhìn")).toBeVisible();
  });

  test("mở tiến độ học viên rồi chọn bài để xem heatmap", async ({ page }) => {
    await page.goto("/teacher/courses/course-1?tab=students");
    await page.getByRole("button", { name: "Xem tiến độ & heatmap" }).first().click();
    const progress = page.getByRole("dialog");
    await expect(progress.getByText("Tiến độ từng bài")).toBeVisible();
    await progress.getByRole("link", { name: /Bài 1: Giới thiệu/ }).click();
    await expect(page).toHaveURL(/\/heatmap\?student=/);
    await expect(page.getByText("Phân tích điểm nhìn")).toBeVisible();
  });

  test("giảng viên mở trình tạo bài trắc nghiệm", async ({ page }) => {
    await page.goto("/teacher/assignments");
    await expect(page.getByRole("heading", { name: "Bài kiểm tra" })).toBeVisible();
    await expect(page.getByText("Thiết lập bài giao mới")).toBeVisible();
  });

  test("học viên làm bài, xem kết quả và chatbot chữa bài", async ({ page }) => {
    await page.goto("/student/assignments/quiz-python-1");
    await expect(page.getByText("Trợ lý học tập", { exact: true })).toBeVisible();
    await page.getByText("def", { exact: true }).click();
    await page.getByRole("button", { name: /Tiếp theo/ }).click();
    await page.getByText("list", { exact: true }).click();
    await page.getByRole("button", { name: /Tiếp theo/ }).click();
    await page.getByText("9", { exact: true }).click();
    await page.getByRole("button", { name: "Nộp bài" }).last().click();
    await expect(page).toHaveURL(/\/result$/);
    await expect(page.getByText("Đáp án và giải thích")).toBeVisible();
    await expect(page.getByText("Trợ lý học tập", { exact: true })).toBeVisible();
    await expect(page.getByText("Luôn sẵn sàng hỗ trợ")).toBeVisible();
  });

  test("login demo bằng email bất kỳ", async ({ page }) => {
    await page.goto("/account/login");
    await page.getByLabel("Email").fill("giaovien@abc.com");
    await page.locator("#login-password").fill("bat-ky");
    await page.getByRole("button", { name: "Đăng nhập" }).click();
    await expect(page).toHaveURL(/\/student$|\/teacher$|\/admin$/);
  });
});
