// DP-2871 "For dev" screens: screenshot + element boxes (CSS px, 1440×1066). Usage: node devboxes.cjs <baseUrl>
const path = require('path');
const fs = require('fs');
const { launch, newPage, settle, goTo, pickSearchable, pickPreset , OUT_ROOT } = require('../lib.cjs');

const BASE = process.argv[2] || 'http://localhost:5180';
// Example for DP-2871 (Settings › Delivery v2): copy it next to your task, keep the harness, rewrite the steps.
const OUT = path.join(OUT_ROOT, 'dp2871', 'dev');
fs.mkdirSync(OUT, { recursive: true });
const go = goTo(BASE, '/Settings/Delivery');
const map = '?tab=map';

function box(b) { return b ? { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width ?? b.w), h: Math.round(b.height ?? b.h) } : null; }
const css = (sel) => async (page) => box(await page.locator(sel).first().boundingBox());
const loc = (fn) => async (page) => box(await fn(page).first().boundingBox());
/* The smallest ancestor of a label (found by its text) that also holds the control. */
const field = (labelText, scope = 'body') => async (page) => box(await page.evaluate(([t, s]) => {
  const root = document.querySelector(s) || document.body;
  const lab = [...root.querySelectorAll('label, span, div')].find((e) => e.children.length <= 2 && e.textContent.trim().replace(/\s*\*$/, '').startsWith(t) && e.textContent.trim().length < t.length + 6);
  if (!lab) return null;
  let n = lab;
  while (n && n !== root && !n.querySelector('input, textarea, [role=combobox], [role=radiogroup]')) n = n.parentElement;
  if (!n) return null;
  const r = n.getBoundingClientRect();
  return { x: r.x, y: r.y, width: r.width, height: r.height };
}, [labelText, scope]));
const union = (...fns) => async (page) => {
  const bs = (await Promise.all(fns.map((f) => f(page)))).filter(Boolean);
  if (!bs.length) return null;
  const x = Math.min(...bs.map((b) => b.x)), y = Math.min(...bs.map((b) => b.y));
  return { x, y, w: Math.max(...bs.map((b) => b.x + b.w)) - x, h: Math.max(...bs.map((b) => b.y + b.h)) - y };
};

const SCREENS = [
  { id: 'dev-basic', setup: (p) => go(p, ''), els: [
    ['A1', css('.sweed-header .sweed-header-row')],
    ['A2', css('.sweed-header-tabs')],
    ['A3', loc((p) => p.locator('label').filter({ hasText: 'Home delivery' }))],
    ['A4', field('Order ahead, days')],
    ['A5', field('Order amount for delivery limits')],
    ['A6', css('.delivery-form__note')],
    ['A7', css('.page-footer__bar')],
  ] },
  { id: 'dev-map', setup: (p) => go(p, map + '&item=zones:z1', 1400), els: [
    ['B1', css('.delivery-map-v2__map')],
    ['B2', css('.delivery-map-v2__base')],
    ['B3', css('.delivery-map-v2__legend')],
    ['B4', css('.delivery-map-v2__controls')],
    ['B5', css('.delivery-cards__search')],
    ['B6', loc((p) => p.locator('label').filter({ has: p.getByRole('switch', { name: 'Hide inactive' }) }))],
    ['B7', css('.delivery-map-v2__expand')],
    ['B8', css('section[aria-label="Delivery zones"] .delivery-acc__header')],
    ['B9', css('.delivery-acc__item--open')],
    ['B10', css('button[aria-label="Edit Downtown LA"]')],
    ['B11', css('.delivery-map-v2__resizer')],
    ['B12', loc((p) => p.locator('.delivery-acc__item--inactive').getByText('Inactive', { exact: true }))],
  ] },
  { id: 'dev-menu', setup: async (p) => { await go(p, map); await p.getByRole('button', { name: 'New zone', exact: true }).click(); await p.waitForTimeout(500); }, els: [
    ['C1', css('[role=menu]')],
  ] },
  { id: 'dev-zone', setup: async (p) => {
      await go(p, map); await p.getByRole('button', { name: 'New zone', exact: true }).click();
      await p.getByRole('menuitem').filter({ hasText: 'ZIP codes' }).click(); await settle(p, 1000);
      await p.getByPlaceholder('e.g. Downtown').fill('Lincoln Heights');
      await pickSearchable(p, 'Find a ZIP code, city or address', '', /Los Angeles, CA/); await settle(p, 1200);
      await pickSearchable(p, 'Find a ZIP code, city or address', '90011', /90011/); await settle(p, 1400);
    }, els: [
    ['C2', css('.delivery-form__header')],
    ['C3', field('Name', '.delivery-form')],
    ['C4', css('.delivery-form__colors')],
    ['C5', loc((p) => p.locator('.delivery-form label').filter({ has: p.getByRole('switch') }))],
    ['C6', loc((p) => p.locator('.delivery-form [role=combobox]'))],
    ['C7', css('.delivery-form__result')],
    ['C8', css('.delivery-form__zip-list')],
    ['C12', css('.delivery-map-v2__hint')],
  ] },
  { id: 'dev-cp', setup: async (p) => {
      await go(p, map); await p.getByRole('button', { name: 'New collection point', exact: true }).click(); await settle(p, 800);
      await p.getByPlaceholder('e.g. Echo Park lockers').fill('Downtown lockers');
      await pickSearchable(p, 'Start typing an address', '', /700 W 7th St/);
      await pickPreset(p, 'Every day 11 AM – 9 PM'); await settle(p, 1400);
    }, els: [
    ['C9', field('Delivery fee, $', '.delivery-form')],
    ['C10', loc((p) => p.locator('.delivery-form button[role=combobox]'))],
    ['C11', css('.delivery-form__footer')],
  ] },
  { id: 'dev-toast', setup: async (p) => {
      await go(p, map); await p.getByRole('button', { name: 'New collection point', exact: true }).click(); await settle(p, 800);
      await p.getByPlaceholder('e.g. Echo Park lockers').fill('Downtown lockers');
      await pickSearchable(p, 'Start typing an address', '', /700 W 7th St/);
      await pickPreset(p, 'Every day 11 AM – 9 PM');
      await p.getByRole('button', { name: 'Add', exact: true }).click(); await settle(p, 1200);
    }, els: [
    ['C13', loc((p) => p.locator('li').filter({ hasText: 'Collection point added' }))],
  ] },
  { id: 'dev-sched', setup: (p) => go(p, '?tab=schedule', 500), els: [
    ['D1', css('.delivery-schedule-v2__info-banner')],
    ['D2', css('.delivery-vtabs')],
    ['D3', loc((p) => p.locator('.delivery-schedule-v2__content > *'))],
    ['D4', css('.delivery-schedule-v2__content table')],
    ['D5', union(css('button[aria-label="Duplicate Weekdays 10 AM – 8 PM"]'), css('button[aria-label="Delete Weekdays 10 AM – 8 PM"]'))],
  ] },
  { id: 'dev-preset', setup: (p) => go(p, '?tab=schedule&open=p1', 600), els: [
    ['E1', css('.sweed-header')],
    ['E2', field('Name', '.delivery-sched-editor')],
    ['E3', field('Description', '.delivery-sched-editor')],
    ['E4', union(css('.delivery-sched-rules'), loc((p) => p.getByRole('button', { name: 'Add rule' })))],
  ] },
  { id: 'dev-rule', setup: async (p) => {
      await go(p, '?tab=schedule&sched=rules&open=new', 600);
      await p.getByPlaceholder('e.g. Weekday hours').fill('Late hours');
      await pickSearchable(p, 'Select template', '', /Two windows/);
      await p.getByRole('button', { name: 'Fri', exact: true }).click(); await p.waitForTimeout(400);
    }, els: [
    ['F1', field('Repeat', '.delivery-sched-editor')],
    ['F2', field('Date from', '.delivery-sched-editor')],
    ['F3', css('.delivery-sched-days')],
  ] },
  { id: 'dev-template', setup: (p) => go(p, '?tab=schedule&sched=templates&open=t2', 600), els: [
    ['G1', css('.delivery-sched-windows')],
    ['G2', loc((p) => p.locator('.delivery-sched-windows tbody tr').nth(1).locator('td').nth(2))],
  ] },
  { id: 'dev-dialog', setup: async (p) => { await go(p, '?tab=schedule&open=p1', 600); await p.getByRole('button', { name: 'Save', exact: true }).click(); await p.waitForTimeout(600); }, els: [
    ['H1', css('[role=dialog]')],
  ] },
];

(async () => {
  const browser = await launch();
  const result = {};
  const errors = [];
  for (const s of SCREENS) {
    const { ctx, page } = await newPage(browser);
    try {
      await s.setup(page);
      const els = [];
      for (const [id, fn] of s.els) {
        const b = await fn(page).catch((e) => { errors.push(`${s.id}/${id}: ${e.message.split('\n')[0]}`); return null; });
        if (!b) errors.push(`${s.id}/${id}: no box`);
        else if (b.y > 1066 || b.y + b.h < 0) errors.push(`${s.id}/${id}: off screen`);
        els.push({ id, box: b });
      }
      await page.screenshot({ path: path.join(OUT, s.id + '.png') });
      result[s.id] = els;
    } catch (e) { errors.push(`${s.id}: ${e.message.split('\n')[0]}`); }
    await ctx.close();
  }
  await browser.close();
  fs.writeFileSync(path.join(OUT, 'boxes.json'), JSON.stringify(result, null, 1));
  console.log(JSON.stringify({ screens: Object.keys(result), errors }, null, 1));
})();
