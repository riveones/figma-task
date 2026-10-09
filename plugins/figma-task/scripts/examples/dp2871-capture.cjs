// DP-2871 flow screenshots for the Figma boards. Usage: node capture.cjs <baseUrl> [f1,f2,...]
const path = require('path');
const fs = require('fs');
const { launch, newPage, settle, goTo, pickSearchable, pickPreset, drawOnMap, openRowMenu , OUT_ROOT } = require('../lib.cjs');

const BASE = process.argv[2] || 'http://localhost:5180';
// Example for DP-2871 (Settings › Delivery v2): copy it next to your task, keep the harness, rewrite the steps.
const ONLY = process.argv[3] || '';
const OUT = path.join(OUT_ROOT, 'dp2871', 'shots');
fs.mkdirSync(OUT, { recursive: true });
const go = goTo(BASE, '/Settings/Delivery');
const map = '?tab=map';
const log = [];
const shot = async (page, id) => { await page.screenshot({ path: path.join(OUT, id + '.png') }); log.push(id); };

const flows = {
  async f1(page) {
    await go(page, '?v=1'); await shot(page, 'f1-1');
    await go(page, ''); await shot(page, 'f1-2');
    await go(page, '?tab=schedule'); await shot(page, 'f1-3');
    await go(page, map); await shot(page, 'f1-4');
    await go(page, '?tab=vehicles'); await shot(page, 'f1-5');
  },
  async f2(page) {
    await go(page, map); await shot(page, 'f2-1');
    await page.locator('.delivery-map-v2__legend-button').hover(); await page.waitForTimeout(500); await shot(page, 'f2-2');
    await page.getByRole('group', { name: 'Map layers' }).getByRole('checkbox', { name: 'Collection points', exact: true }).click();
    await page.mouse.move(2, 2); await page.waitForTimeout(600); await shot(page, 'f2-3');
    await go(page, map + '&item=zones:z1', 1400); await shot(page, 'f2-4');
    await go(page, map); await page.getByPlaceholder('Search zones, ZIP codes, addresses').fill('90026'); await settle(page); await shot(page, 'f2-5');
    await go(page, map); await page.getByRole('switch', { name: 'Hide inactive' }).click(); await settle(page); await shot(page, 'f2-6');
    await go(page, map + '&view=table'); await shot(page, 'f2-7');
  },
  async f3(page) {
    await go(page, map);
    await page.getByRole('button', { name: 'New zone', exact: true }).click(); await page.waitForTimeout(500); await shot(page, 'f3-1');
    await page.getByRole('menuitem').filter({ hasText: 'ZIP codes' }).click(); await settle(page, 1200); await shot(page, 'f3-2');
    await page.getByPlaceholder('e.g. Downtown').fill('Lincoln Heights');
    await pickSearchable(page, 'Find a ZIP code, city or address', '', /Los Angeles, CA/); await settle(page, 1400); await shot(page, 'f3-3');
    await pickSearchable(page, 'Find a ZIP code, city or address', '90011', /90011/); await settle(page, 1400); await shot(page, 'f3-4');
    await pickSearchable(page, 'Find a ZIP code, city or address', '90012', /90012/); await settle(page, 1400); await shot(page, 'f3-5');
    await pickPreset(page, 'Weekdays 10 AM – 8 PM');
    await page.getByRole('button', { name: 'Add', exact: true }).click(); await settle(page, 1400); await shot(page, 'f3-6');

    await go(page, map);
    await page.getByRole('button', { name: 'New zone', exact: true }).click();
    await page.getByRole('menuitem').filter({ hasText: 'Radius' }).click(); await settle(page, 800);
    await page.getByPlaceholder('e.g. Downtown').fill('Express · 3 mi');
    await page.getByPlaceholder('e.g. 3').fill('3'); await settle(page, 1400); await shot(page, 'f3-7');

    await go(page, map);
    await page.getByRole('button', { name: 'New zone', exact: true }).click();
    await page.getByRole('menuitem').filter({ hasText: 'Draw on the map' }).click(); await settle(page, 800);
    await page.getByPlaceholder('e.g. Downtown').fill('Arts District');
    await drawOnMap(page, [[0.52, 0.42], [0.64, 0.38], [0.68, 0.56], [0.55, 0.62]]); await settle(page, 800); await shot(page, 'f3-8');
  },
  async f4(page) {
    await go(page, map);
    await page.getByRole('button', { name: 'New collection point', exact: true }).click(); await settle(page, 800); await shot(page, 'f4-1');
    await page.getByPlaceholder('e.g. Echo Park lockers').fill('Downtown lockers');
    await pickSearchable(page, 'Start typing an address', '', /700 W 7th St/);
    await pickPreset(page, 'Every day 11 AM – 9 PM'); await settle(page, 1400); await shot(page, 'f4-2');
    await page.getByRole('button', { name: 'Add', exact: true }).click(); await settle(page, 1400); await shot(page, 'f4-3');

    await go(page, map);
    await page.getByRole('button', { name: 'New blocked address', exact: true }).click(); await settle(page, 800);
    await pickSearchable(page, 'Start typing an address', '', /Observatory/);
    await page.getByPlaceholder('Why deliveries are blocked').fill('Repeated failed deliveries'); await settle(page, 1400); await shot(page, 'f4-4');
    await page.getByRole('button', { name: 'Add', exact: true }).click(); await settle(page, 1400); await shot(page, 'f4-5');

    await go(page, map);
    await page.getByRole('button', { name: 'New exception zone', exact: true }).click(); await settle(page, 800);
    await page.getByPlaceholder('e.g. Stadium').fill('Convention Center');
    await drawOnMap(page, [[0.42, 0.55], [0.52, 0.52], [0.54, 0.66], [0.44, 0.68]]); await settle(page, 800); await shot(page, 'f4-6');

    await go(page, map);
    await openRowMenu(page, 'Dodger Stadium');
    await page.getByRole('menuitem', { name: 'Remove' }).click(); await page.waitForTimeout(600); await shot(page, 'f4-7');
  },
  async f5(page) {
    await go(page, '?tab=schedule', 500); await shot(page, 'f5-1');
    await page.locator('tr[data-row-id="p1"]').click(); await page.waitForTimeout(700); await shot(page, 'f5-2');
    await page.getByRole('button', { name: 'Save', exact: true }).click(); await page.waitForTimeout(600); await shot(page, 'f5-3');
    await go(page, '?tab=schedule&sched=rules', 500); await shot(page, 'f5-4');
    await page.getByRole('button', { name: 'New rule' }).click(); await page.waitForTimeout(500);
    await page.getByPlaceholder('e.g. Weekday hours').fill('Late hours');
    await pickSearchable(page, 'Select template', '', /Two windows/);
    await page.getByRole('button', { name: 'Fri', exact: true }).click(); await page.waitForTimeout(500); await shot(page, 'f5-5');
    await go(page, '?tab=schedule&sched=templates', 500); await shot(page, 'f5-6');
    await page.locator('tr[data-row-id="t2"]').click(); await page.waitForTimeout(700); await shot(page, 'f5-7');
    await go(page, '?tab=schedule&sched=templates', 500);
    await page.getByRole('button', { name: 'Delete Two windows' }).click(); await page.waitForTimeout(600); await shot(page, 'f5-8');
  },
};

(async () => {
  const browser = await launch();
  const errors = [];
  for (const [name, fn] of Object.entries(flows)) {
    if (ONLY && !ONLY.split(',').includes(name)) continue;
    const { ctx, page } = await newPage(browser);
    try { await fn(page); } catch (e) { errors.push(`${name}: ${e.message.split('\n')[0]}`); await page.screenshot({ path: path.join(OUT, `${name}-ERROR.png`) }); }
    await ctx.close();
  }
  await browser.close();
  console.log(JSON.stringify({ shots: log.length, errors }));
})();
