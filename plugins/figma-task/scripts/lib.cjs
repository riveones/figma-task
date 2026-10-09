// Shared Playwright helpers for figma-task screenshots: a prototype, or a branch of a production repo,
// running locally or on a stand. Run scripts from the repo root; Playwright comes from its node_modules,
// or from PLAYWRIGHT_MODULE (a path to an installed playwright package) when the repo has none.
//   FIGMA_TASK_CHROMIUM  — optional chrome-headless-shell path, when the repo's Playwright wants another revision
//   FIGMA_TASK_OUT       — where screenshots go (default: ./.claude/personal/figma-task-shots)
const path = require('path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || path.join(process.cwd(), 'node_modules', 'playwright'));

const CHROME = process.env.FIGMA_TASK_CHROMIUM || '';
const OUT_ROOT = process.env.FIGMA_TASK_OUT || path.join(process.cwd(), '.claude', 'personal', 'figma-task-shots');

const launch = () => chromium.launch(CHROME ? { executablePath: CHROME } : {});
/* 1440×1066 = the 1000×740 card ratio; 2× for sharp images in Figma. */
/* storageState: the session file login.cjs saved, for screens behind a sign-in. */
const newPage = async (browser, { fixedTime = '2026-10-08T10:00:00', storageState } = {}) => {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1066 }, deviceScaleFactor: 2, reducedMotion: 'reduce', ...(storageState ? { storageState } : {}) });
  const page = await ctx.newPage();
  if (fixedTime) await page.clock.setFixedTime(new Date(fixedTime)); // screens that default to "today" stay stable
  return { ctx, page };
};

async function settle(page, ms = 900) {
  if (await page.locator('.leaflet-container').count()) {
    await page.locator('.leaflet-tile-loaded').first().waitFor({ timeout: 10000 }).catch(() => {});
  }
  await page.waitForTimeout(ms);
}
/* go(page, '?tab=map', ms) opens base + prefix + query and parks the mouse. */
const goTo = (base, prefix = '') => async (page, q = '', ms) => {
  await page.goto(base + prefix + q, { waitUntil: 'networkidle' });
  await page.mouse.move(2, 2);
  await settle(page, ms);
};
/* Searchable SweedSelect: a div[role=combobox] that turns into an input labelled "Search options". */
async function pickSearchable(page, placeholderText, query, optionRe) {
  await page.locator('[role=combobox]').filter({ hasText: placeholderText }).first().click();
  if (query) await page.getByLabel('Search options').fill(query);
  await page.getByRole('option', { name: optionRe }).first().click();
}
async function pickPreset(page, name) {
  await page.getByRole('combobox').filter({ hasText: 'Select preset' }).first().click();
  await page.getByRole('option', { name }).first().click();
}
/* Clicks at fractions of the Leaflet container (drawing zones point by point). */
async function drawOnMap(page, pts, container = '.leaflet-container') {
  const box = await page.locator(container).first().boundingBox();
  for (const [fx, fy] of pts) {
    await page.mouse.click(box.x + box.width * fx, box.y + box.height * fy);
    await page.waitForTimeout(250);
  }
  await page.mouse.move(2, 2);
}
/* Radix DropdownMenu opens on pointerdown; a full click also toggles the row under it. */
async function openRowMenu(page, name) {
  const dots = page.locator(`button[aria-label="Actions for ${name}"]`).first();
  await dots.scrollIntoViewIfNeeded();
  await dots.dispatchEvent('pointerdown', { button: 0, pointerType: 'mouse', pointerId: 1 });
  await page.waitForTimeout(400);
}

module.exports = { launch, newPage, settle, goTo, pickSearchable, pickPreset, drawOnMap, openRowMenu, OUT_ROOT };
