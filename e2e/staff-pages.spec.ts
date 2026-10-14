import { expect, test } from "@playwright/test";

const pages = ["/login", "/patients/new", "/patients"] as const;

for (const path of pages) {
  test(`${path} loads without the page-crash screen`, async ({ page }) => {
    const response = await page.goto(path);
    expect(response?.status()).toBeLessThan(500);
    await expect(page.getByRole("heading", { name: "This page didn't load" })).toHaveCount(0);
    await expect(page.locator("body")).toBeVisible();
  });
}

test("login page shows the sign-in form", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByRole("heading", { name: "VSP Software" })).toBeVisible();
  await expect(page.getByLabel("Email")).toBeVisible();
  await expect(page.getByLabel("Password")).toBeVisible();
});
