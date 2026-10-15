import { test, expect } from "@playwright/test";
import { mockApi, seedAuth } from "./fixtures";

const ADMIN = {
  email: "admin@school.edu.vn",
  fullName: "Quản trị viên",
  role: "admin" as const,
};

test.describe("Admin", () => {
  test.beforeEach(async ({ page }) => {
    await seedAuth(page, ADMIN);
    await mockApi(page, { user: ADMIN });
  });

  test("trang phân công liệt kê khóa học", async ({ page }) => {
    await page.goto("/admin");
    await expect(page.getByRole("heading", { name: "Phân công giảng viên" })).toBeVisible();
    await expect(page.getByText("Lập trình Python cơ bản").first()).toBeVisible();
  });

  test("expand khóa học hiển thị giảng viên hiện tại", async ({ page }) => {
    await page.goto("/admin");
    await page.getByRole("button", { name: /Lập trình Python cơ bản/ }).click();
    await expect(page.getByText("Giảng viên hiện tại")).toBeVisible();
    await expect(page.getByText("Chủ khóa học")).toBeVisible();
  });

  test("cấu hình calibration hiển thị form", async ({ page }) => {
    await page.goto("/admin/settings");
    await expect(page.getByRole("heading", { name: "Tính điểm hiệu chỉnh" })).toBeVisible();
    await expect(page.getByRole("spinbutton", { name: "Ngưỡng MAE tối đa" })).toBeVisible();
    await expect(page.getByRole("button", { name: /Lưu cấu hình/ })).toBeVisible();
  });

  test("hồ sơ admin không phải dead-end", async ({ page }) => {
    await page.goto("/admin/profile");
    await expect(page.getByRole("heading", { name: "Thông tin định danh" })).toBeVisible();
    await expect(page.getByText("admin@school.edu.vn")).toBeVisible();
  });
});
