import { test, expect } from "@playwright/test";
import { mockApi } from "./fixtures";

test.describe("Public", () => {
  test("trang gốc hiển thị landing page", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: /Biết học viên đang nhìn đâu/ })).toBeVisible();
    await expect(page.getByRole("link", { name: "Đăng nhập" }).first()).toHaveAttribute("href", "/account/login");
  });

  test("đăng nhập hiển thị form và validate", async ({ page }) => {
    await mockApi(page);
    await page.goto("/account/login");
    await expect(page.getByRole("heading", { name: "Chào mừng trở lại" })).toBeVisible();
    await expect(page.getByLabel("Email")).toBeVisible();
    await expect(page.locator("#login-password")).toBeVisible();
  });

  test("đăng nhập thành công chuyển tới khu học viên", async ({ page }) => {
    await mockApi(page, {
      user: { email: "student@school.edu.vn", fullName: "Nguyễn Văn An", role: "student" },
    });
    await page.goto("/account/login");
    await page.getByLabel("Email").fill("student@school.edu.vn");
    await page.locator("#login-password").fill("Password123!");
    await page.getByRole("button", { name: "Đăng nhập" }).click();
    await expect(page).toHaveURL(/\/student$/);
  });

  test("trang design system render đủ nhóm thành phần", async ({ page }) => {
    await page.goto("/design");
    await expect(page.getByRole("heading", { name: "GazeEdu Design System" })).toBeVisible();
    await expect(page.getByText("Buttons")).toBeVisible();
    await expect(page.getByText("Badges")).toBeVisible();
  });

  test("demo khách: intro → xem slide", async ({ page }) => {
    await mockApi(page);
    await page.goto("/try");
    await expect(page.getByRole("heading", { name: "Xem cách ánh mắt tương tác với nội dung." })).toBeVisible();
    await page.getByRole("button", { name: /Bắt đầu hiệu chỉnh/ }).click();
    // calibration stage hiển thị
    await expect(page.getByText("Hiệu chỉnh điểm nhìn").first()).toBeVisible();
  });

  test("trang 404 cho route không tồn tại", async ({ page }) => {
    await page.goto("/khong-ton-tai");
    await expect(page.getByText("Không tìm thấy trang")).toBeVisible();
  });
});
