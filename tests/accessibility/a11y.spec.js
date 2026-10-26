// @ts-check
const { test, expect } = require("@playwright/test");
const AxeBuilder = require("@axe-core/playwright").default;

const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];

/** Fails the test on any WCAG 2.1 A/AA violation, printing a readable summary. */
async function expectNoViolations(page, context) {
  const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
  const summary = results.violations.map(
    (v) => `${v.impact}: ${v.id} - ${v.help}\n    ${v.nodes.map((n) => n.target.join(" ")).join("\n    ")}`
  );
  expect(summary, `axe violations on ${context}`).toEqual([]);
}

const pages = [
  { path: "/", name: "Home" },
  { path: "/eligibility.html", name: "Eligibility screener" },
  { path: "/cases.html", name: "Caseworker queue", ready: "#cases-body a" },
  { path: "/case.html?id=2", name: "Case detail", ready: "#beneficiary-details dt" },
  { path: "/accessibility.html", name: "Accessibility statement" }
];

for (const p of pages) {
  test(`${p.name} has no WCAG 2.1 AA violations`, async ({ page }) => {
    await page.goto(p.path);
    if (p.ready) await page.waitForSelector(p.ready);
    await expectNoViolations(page, p.name);
  });
}

test("every page has a working skip link, one h1 and a unique title", async ({ page }) => {
  const titles = new Set();
  for (const p of pages) {
    await page.goto(p.path);
    if (p.ready) await page.waitForSelector(p.ready);
    await page.keyboard.press("Tab");
    await expect(page.locator(":focus")).toHaveText("Skip to main content");
    await page.keyboard.press("Enter");
    await expect(page.locator("main")).toBeFocused();
    await expect(page.locator("h1")).toHaveCount(1);
    titles.add(await page.title());
  }
  expect(titles.size).toBe(pages.length);
});

test("page does not scroll horizontally at 320px (reflow)", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 720 });
  for (const p of pages) {
    await page.goto(p.path);
    if (p.ready) await page.waitForSelector(p.ready);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow, `horizontal overflow on ${p.name}`).toBeLessThanOrEqual(0);
  }
});

test.describe("eligibility form", () => {
  test("empty submit shows a focused error summary linked to fields", async ({ page }) => {
    await page.goto("/eligibility.html");
    await page.getByRole("button", { name: "Check eligibility" }).click();

    const summary = page.locator("#error-summary");
    await expect(summary).toBeFocused();
    await expect(page).toHaveTitle(/^Error: /);
    await expect(page.locator("#age")).toHaveAttribute("aria-invalid", "true");
    await expect(page.locator("#age")).toHaveAttribute("aria-describedby", /age-error/);

    await summary.getByRole("link", { name: /monthly income/i }).click();
    await expect(page.locator("#monthlyIncome")).toBeFocused();
    await expectNoViolations(page, "eligibility error state");
  });

  test("valid answers render results and move focus to them", async ({ page }) => {
    await page.goto("/eligibility.html");
    await page.getByLabel("How old are you?").fill("72");
    await page.getByLabel("How many people live in your household?").fill("1");
    await page.getByLabel("What is your total monthly income before taxes?").fill("$1,250");
    await page.getByLabel("What is the total value of your countable assets?").fill("1500");
    await page.getByRole("group", { name: "Do you have a disability?" }).getByLabel("No").check();
    await page.getByRole("group", { name: "Do you have Medicare Part A?" }).getByLabel("Yes").check();
    await page.getByLabel("Bathing or showering").check();
    await page.getByLabel("Getting dressed").check();
    await page.getByRole("button", { name: "Check eligibility" }).click();

    await expect(page.getByRole("heading", { name: "Your results" })).toBeFocused();
    await expect(page.locator("#results-list > li")).toHaveCount(3);
    await expect(page.locator("#bcn-live-polite")).toContainText("Results ready");
  });
});

test.describe("caseworker queue", () => {
  test("sorting updates aria-sort and announces the result", async ({ page }) => {
    await page.goto("/cases.html");
    await page.waitForSelector("#cases-body a");
    const header = page.locator('th[data-sort="beneficiary"]');
    await header.getByRole("button").click();
    await expect(header).toHaveAttribute("aria-sort", "ascending");
    await expect(page.locator("#results-summary")).toContainText("sorted by beneficiary, ascending");
    await header.getByRole("button").click();
    await expect(header).toHaveAttribute("aria-sort", "descending");
  });
});

test.describe("case detail", () => {
  test("tabs support arrow keys, Home and End", async ({ page }) => {
    await page.goto("/case.html?id=4");
    await page.waitForSelector("#beneficiary-details dt");
    await page.getByRole("tab", { name: "Overview" }).focus();
    await page.keyboard.press("ArrowRight");
    await expect(page.getByRole("tab", { name: "Service authorizations" })).toBeFocused();
    await expect(page.getByRole("tab", { name: "Service authorizations" })).toHaveAttribute("aria-selected", "true");
    await expect(page.getByRole("tabpanel", { name: "Service authorizations" })).toBeVisible();
    await page.keyboard.press("End");
    await expect(page.getByRole("tab", { name: "Care plan" })).toBeFocused();
    await page.keyboard.press("Home");
    await expect(page.getByRole("tab", { name: "Overview" })).toBeFocused();
  });

  test("decision dialog manages focus, validates, and returns focus", async ({ page }) => {
    await page.goto("/case.html?id=5#tab-authorizations");
    const decide = page.getByRole("button", { name: /^Decide on / }).first();
    await decide.click();

    const dialog = page.getByRole("dialog", { name: "Decide service authorization" });
    await expect(dialog).toBeVisible();
    await expect(page.locator("#decision-approve")).toBeFocused();

    await page.getByLabel("Deny", { exact: true }).check();
    await dialog.getByRole("button", { name: "Submit decision" }).click();
    await expect(page.locator("#decision-error-summary")).toBeFocused();
    await expectNoViolations(page, "decision dialog error state");

    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(decide).toBeFocused();

    await decide.click();
    await page.getByLabel("Approve", { exact: true }).check();
    await dialog.getByRole("button", { name: "Submit decision" }).click();
    await expect(page.locator("#decision-notice")).toBeFocused();
    await expect(page.locator("#decision-notice")).toContainText("was approved");
  });
});
