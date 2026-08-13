import { expect, test } from "@playwright/test";

// Full milestone 1 journey: signup -> invite -> accept -> role-restricted UI.
// Needs a real database + Redis behind the dev server; CI provides them.
test.skip(!process.env.DATABASE_URL, "requires DATABASE_URL (runs in CI)");

test("signup, invite a read-only member, accept, restricted UI", async ({ page, browser }) => {
  test.setTimeout(120_000);
  const runId = Date.now();
  const adminEmail = `admin-${runId}@e2e.local`;
  const inviteeEmail = `readonly-${runId}@e2e.local`;

  // 1. Admin signs up and lands in the app.
  await page.goto("/signup");
  await page.getByLabel("Your name").fill("E2E Admin");
  await page.getByLabel("Email").fill(adminEmail);
  await page.getByLabel("Password").fill("super-secret-1");
  await page.getByLabel("Workspace name").fill(`E2E Agency ${runId}`);
  await page.getByRole("button", { name: "Create account" }).click();
  await page.waitForURL("**/dashboard");
  await expect(page.getByText("Admin", { exact: true })).toBeVisible();

  // 2. Admin invites a read-only member and grabs the shareable link.
  await page.goto("/settings/members");
  await page.getByLabel("Email").fill(inviteeEmail);
  await page.getByLabel("Invite role").selectOption("readonly");
  await page.getByRole("button", { name: "Send invitation" }).click();
  const inviteLink = await page.getByTestId("invite-link").textContent();
  expect(inviteLink).toBeTruthy();
  await expect(page.getByRole("cell", { name: inviteeEmail })).toBeVisible();

  // 3. The invitee accepts in a fresh browser session and creates an account.
  const inviteeContext = await browser.newContext();
  const inviteePage = await inviteeContext.newPage();
  await inviteePage.goto(inviteLink as string);
  await expect(inviteePage.getByRole("heading", { name: /Join E2E Agency/ })).toBeVisible();
  await inviteePage.getByLabel("Your name").fill("E2E Readonly");
  await inviteePage.getByLabel("Choose a password").fill("super-secret-2");
  await inviteePage.getByRole("button", { name: "Create account and join" }).click();
  await inviteePage.waitForURL("**/dashboard");

  // 4. The read-only member sees the restricted UI.
  await expect(inviteePage.getByText("Read-only").first()).toBeVisible();
  await inviteePage.goto("/settings/members");
  await expect(inviteePage.getByText("Only admins can invite members")).toBeVisible();
  await expect(inviteePage.getByRole("button", { name: "Send invitation" })).toHaveCount(0);

  // 5. Both admin and invitee appear in the member list the admin sees.
  await page.reload();
  await expect(page.getByRole("cell", { name: /E2E Readonly/ })).toBeVisible();
  await inviteeContext.close();
});
