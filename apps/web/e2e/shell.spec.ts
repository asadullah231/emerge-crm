import { expect, test } from "@playwright/test";

test("app shell renders with navigation", async ({ page }) => {
  await page.goto("/dashboard");
  await expect(page.getByRole("navigation", { name: "Main navigation" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Candidates" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
});

test("root redirects to dashboard", async ({ page }) => {
  await page.goto("/");
  await page.waitForURL("**/dashboard");
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
});

test("placeholder route renders", async ({ page }) => {
  await page.goto("/candidates");
  await expect(page.getByRole("heading", { name: "Candidates" })).toBeVisible();
});
