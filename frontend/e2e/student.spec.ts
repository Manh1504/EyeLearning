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
    await expect(page.getByRole("heading", { name: "Bài 1: Giới thiệu" })).toBeVisible();
    await page.getByRole("button", { name: "Sau" }).click();
    await page.getByRole("button", { name: "Sau" }).click();
    await expect(page.getByText(/3\s*\/\s*3/)).toBeVisible();
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
