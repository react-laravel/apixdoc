import { test, expect } from "@playwright/test";

test.describe("Login page", () => {
  test("renders login form", async ({ page }) => {
    await page.goto("/login");

    await expect(page.getByLabel("邮箱")).toBeVisible();
    await expect(page.getByLabel("密码")).toBeVisible();
    await expect(page.getByRole("button", { name: "登录" })).toBeVisible();
    await expect(page.getByText("API 文档管理平台")).toBeVisible();
  });

  test("shows error with invalid credentials", async ({ page }) => {
    await page.goto("/login");

    await page.getByLabel("邮箱").fill("wrong@test.com");
    await page.getByLabel("密码").fill("wrongpass");
    await page.getByRole("button", { name: "登录" }).click();

    await expect(page.getByText("邮箱或密码错误")).toBeVisible();
  });

  test("has correct input placeholders", async ({ page }) => {
    await page.goto("/login");

    await expect(page.getByPlaceholder("admin@apixdocs.com")).toBeVisible();
    await expect(page.getByPlaceholder("请输入密码")).toBeVisible();
  });

  test("shows loading state on submit", async ({ page }) => {
    await page.goto("/login");

    await page.getByLabel("邮箱").fill("test@test.com");
    await page.getByLabel("密码").fill("password");
    await page.getByRole("button", { name: "登录" }).click();

    // Button should show loading text briefly
    await expect(page.getByText("登录中...")).toBeVisible();
  });
});
