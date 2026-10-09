// Saves a signed-in session for screens behind a login (a web-ui-shop stand, Portal for CMS screens).
// Opens a visible browser at the URL; the person signs in there and closes the tab. Claude never types the password.
//   node <mod>/scripts/login.cjs <url> .claude/personal/<KEY>-figma/session.json   (run from the repo root)
// The session file holds auth cookies: keep it in an ignored folder (.claude/personal), never commit or upload it.
const path = require('path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || path.join(process.cwd(), 'node_modules', 'playwright'));

const [url, out] = process.argv.slice(2);
if (!url || !out) {
  console.error('Usage: node login.cjs <url> <session.json>');
  process.exit(1);
}

(async () => {
  // The headless shell cannot show a window: Google Chrome if installed, else Playwright's Chromium.
  const browser = await chromium.launch({ headless: false, channel: 'chrome' }).catch(() => chromium.launch({ headless: false }));
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1066 } });
  const page = await ctx.newPage();
  await page.goto(url);
  console.log('Sign in in the opened window, then close the tab.');
  let saved = false;
  const save = () => ctx.storageState({ path: out }).then(() => { saved = true; }).catch(() => {});
  const timer = setInterval(save, 2000); // the last good state survives even if the whole browser is quit
  await Promise.race([page.waitForEvent('close', { timeout: 0 }).catch(() => {}), new Promise((r) => browser.on('disconnected', r))]);
  clearInterval(timer);
  await save();
  await browser.close().catch(() => {});
  console.log(saved ? `Session saved: ${out}` : 'No session saved.');
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
