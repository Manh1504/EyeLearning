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
    await expect(page.getByRole("textbox", { name: "Tìm khóa học theo tên" })).toBeVisible();
  });

  test("bài tập trắc nghiệm là một mục trong chương", async ({ page }) => {
    await page.goto("/student/courses/course-1?lesson=lesson-quiz-1");
    await expect(page.getByText("Bài tập: Kiểm tra nhập môn").first()).toBeVisible();
    await expect(
      page.getByText("Từ khóa nào dùng để khai báo một hàm trong Python?"),
    ).toBeVisible();
  });

  test("vào thẳng heatmap giảng viên", async ({ page }) => {
    await page.goto("/teacher/courses/course-1/lessons/lesson-1/heatmap");
    await expect(page.getByRole("heading", { name: "Phân tích điểm nhìn" })).toBeVisible();
  });

  test("mở danh sách học viên rồi chọn bài để xem heatmap", async ({ page }) => {
    await page.goto("/teacher/courses/course-1?tab=students");
    await page.getByRole("button", { name: "Xem heatmap" }).first().click();
    const sheet = page.getByRole("dialog");
    await expect(sheet.getByText("Bài học")).toBeVisible();
    await sheet.getByRole("link", { name: /Bài 1: Giới thiệu/ }).click();
    await expect(page).toHaveURL(/\/heatmap\?student=/);
    await expect(page.getByRole("heading", { name: "Phân tích điểm nhìn" })).toBeVisible();
  });

  test("giảng viên soạn bài tập trắc nghiệm trong chương", async ({ page }) => {
    await page.goto("/teacher/courses/course-1?tab=content");
    await expect(
      page.getByRole("button", { name: "Kéo để sắp xếp Bài 1: Giới thiệu" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Mở Bài tập: Kiểm tra nhập môn" }).click();
    await expect(page.getByRole("heading", { name: "Câu hỏi", exact: true })).toBeVisible();
    // Công tắc "cho phép làm lại" nằm ngay đầu phần soạn bài tập, không bị gập.
    await expect(
      page.getByRole("switch", { name: /Cho phép học viên làm lại/ }),
    ).toBeVisible();
  });

  test("giảng viên kéo thả sắp xếp lại bài học trong chương", async ({ page }) => {
    await page.goto("/teacher/courses/course-1?tab=content");
    const first = page.getByRole("button", { name: "Kéo để sắp xếp Bài 1: Giới thiệu" });
    const second = page.getByRole("button", {
      name: "Kéo để sắp xếp Bài 2: Biến và kiểu dữ liệu",
    });
    await expect(first).toBeVisible();

    await first.focus();
    await page.keyboard.press("Space");
    await expect(page.getByText("Đang ở vị trí 1/3.")).toBeAttached();
    await page.keyboard.press("ArrowDown");
    await expect(page.getByText("Đang ở vị trí 2/3.")).toBeAttached();
    await page.keyboard.press("Space");

    // Demo lưu thứ tự trong bộ nhớ nên danh sách đổi ngay sau khi thả.
    await expect(async () => {
      const [secondBox, firstBox] = [await second.boundingBox(), await first.boundingBox()];
      expect(secondBox!.y).toBeLessThan(firstBox!.y);
    }).toPass();
  });

  test("học viên làm bài trắc nghiệm trong reader và xem kết quả", async ({ page }) => {
    await page.goto("/student/courses/course-1?lesson=lesson-quiz-1");
    // Trợ lý học tập chỉ hiện sau khi nộp bài.
    await expect(page.getByRole("button", { name: "Mở trợ lý học tập" })).toHaveCount(0);
    await page.getByText("def", { exact: true }).click();
    await page.getByRole("button", { name: "Tiếp" }).click();
    await page.getByText("list", { exact: true }).click();
    await page.getByText("dict", { exact: true }).click();
    await page.getByRole("button", { name: "Tiếp" }).click();
    await page.getByText("9", { exact: true }).click();
    await page.getByRole("button", { name: "Nộp bài" }).click();
    await expect(page.getByText("3/3 điểm")).toBeVisible();
    await expect(page.getByText("Đáp án đúng").first()).toBeVisible();
    await expect(page.getByRole("button", { name: "Mở trợ lý học tập" })).toBeVisible();

    // Demo bật "cho phép làm lại": làm lại -> quay về câu 1, trợ lý ẩn lại.
    await page.getByRole("button", { name: "Làm lại" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Làm lại" }).click();
    await expect(page.getByText("Câu 1 / 3")).toBeVisible();
    await expect(page.getByRole("button", { name: "Mở trợ lý học tập" })).toHaveCount(0);
  });

  test("login demo bằng email bất kỳ", async ({ page }) => {
    await page.goto("/account/login");
    await page.getByLabel("Email").fill("giaovien@abc.com");
    await page.locator("#login-password").fill("bat-ky");
    await page.getByRole("button", { name: "Đăng nhập" }).click();
    await expect(page).toHaveURL(/\/student$|\/teacher$|\/admin$/);
  });
});
