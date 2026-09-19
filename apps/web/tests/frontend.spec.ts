import { expect, test } from "@playwright/test";

test("sample run saves a local locked result and exposes read-only replay", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Load sample layout" }).click();
  await expect(page.getByText("2 / 4 tiles placed")).toBeVisible();
  await page.getByRole("button", { name: /Play demo run/ }).click();
  await expect(page.getByText("What a lovely line.")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText("Anonymous play keeps a local result")).toBeVisible();
  await page.reload();
  await expect(page.getByText("What a lovely line.")).toBeVisible();
  await page.goto("/");
  await expect(page.getByText("COURSE LOCKED")).toBeVisible();
  await expect(page.getByRole("link", { name: /View demo result/ })).toBeVisible();
});

test("an experiment can be aborted without losing its layout", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /Breeze/ }).click();
  await expect(page.locator(".course-canvas canvas")).toBeVisible();
  await page.locator(".course-canvas").click();
  await expect(page.getByText("1 / 4 tiles placed")).toBeVisible();
  await page.getByRole("button", { name: /Play demo run/ }).click();
  await expect(page.getByRole("button", { name: "Abort" })).toBeVisible();
  await page.getByRole("button", { name: "Abort" }).click();
  await expect(page.getByText("1 / 4 tiles placed")).toBeVisible();
  await expect(page.getByRole("button", { name: /Play demo run/ })).toBeVisible();
});

test("authoring changes and local publication persist", async ({ page }) => {
  await page.goto("/admin");
  await page.getByRole("button", { name: "New course" }).click();
  await page.getByLabel("Course title").fill("Pocket Garden");
  await page.getByRole("button", { name: "Save revision" }).click();
  await page.getByRole("tab", { name: "Publish" }).click();
  await page.getByRole("button", { name: "Run structure check" }).click();
  await expect(page.getByText("Structure checks passed.")).toBeVisible();
  await page.getByRole("button", { name: "Publish locally" }).click();
  await expect(page.getByText("LOCALLY PUBLISHED")).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { name: "Pocket Garden" })).toBeVisible();
  await expect(page.getByText("LOCALLY PUBLISHED")).toBeVisible();
});

test("mobile layout has no horizontal overflow", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(page.getByRole("navigation", { name: "Mobile navigation" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});

test("keyboard nudges are precise and out-of-bounds edits are rejected", async ({ page }) => {
  await page.goto("/archive/archive-drift");
  await page.getByRole("button", { name: /Breeze/ }).click();
  await expect(page.locator(".course-canvas canvas")).toBeVisible();
  await page.locator(".course-canvas").click();
  const x = page.getByRole("spinbutton", { name: "X position" });
  const before = Number(await x.inputValue());
  await page.keyboard.press("ArrowRight");
  await expect.poll(async () => Number(await x.inputValue())).toBe(before + 1);
  await page.keyboard.press("Shift+ArrowRight");
  await expect.poll(async () => Number(await x.inputValue())).toBe(before + 1.25);
  await x.fill("1");
  await expect(page.getByText("That tile would cross the placement boundary.")).toBeVisible();
  await expect.poll(async () => Number(await x.inputValue())).toBe(before + 1.25);
});

test("rejected mock validation returns to planning with the layout intact", async ({ page }) => {
  await page.goto("/archive/archive-corner?demoReject=1");
  await page.getByRole("button", { name: "Load sample layout" }).click();
  await page.getByRole("button", { name: /Play demo run/ }).click();
  await expect(page.getByText(/Demo validation rejected this run/)).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText("2 / 4 tiles placed")).toBeVisible();
  await expect(page.getByRole("button", { name: /Play demo run/ })).toBeVisible();
});

test("demo account gets a sample standing only after a local solve", async ({ page }) => {
  await page.goto("/leaderboard");
  await expect(page.getByText("Solve first").first()).toBeVisible();
  await page.goto("/sign-in");
  await page.getByRole("button", { name: /Continue with Google/ }).click();
  await expect(page.getByRole("heading", { name: "Google player" })).toBeVisible();
  await page.goto("/archive/archive-bend");
  await page.getByRole("button", { name: "Load sample layout" }).click();
  await page.getByRole("button", { name: /Play demo run/ }).click();
  await expect(page.getByText("What a lovely line.")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText("This late archive solve has no original daily rank or percentile.")).toBeVisible();
  await page.goto("/leaderboard");
  await page.getByRole("combobox", { name: "Choose puzzle leaderboard" }).selectOption("archive-bend");
  await page.getByRole("tab", { name: "Around me" }).click();
  await expect(page.getByText("YOUR DEMO STANDING")).toBeVisible();
  await expect(page.getByRole("link", { name: /View/ }).first()).toBeVisible();
});
