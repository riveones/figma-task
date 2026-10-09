// A contact sheet: every .png in a folder as one grid screenshot, for reviewing a capture at a glance.
//   node <mod>/scripts/sheet.cjs <shots-dir> <out.png> [columns=3]   (run from the repo root)
const path = require('path'), fs = require('fs');
const { pathToFileURL } = require('url');
const { launch } = require('./lib.cjs');

(async () => {
  const [dirArg, outArg, colsArg] = process.argv.slice(2);
  if (!dirArg || !outArg) {
    console.error('Usage: node sheet.cjs <shots-dir> <out.png> [columns=3]');
    process.exit(1);
  }
  const dir = path.resolve(dirArg), out = path.resolve(outArg), cols = +(colsArg || 3);
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.png')).sort();
  const html = `<body style="margin:0;background:#222;font:bold 18px sans-serif;color:#fc0"><div style="display:grid;grid-template-columns:repeat(${cols},1fr);gap:12px;padding:12px;align-items:start">${files.map((f) => `<div>${f}<img src="${pathToFileURL(path.join(dir, f)).href}" style="width:100%;display:block"></div>`).join('')}</div></body>`;
  const hp = out.replace(/\.png$/, '.html');
  fs.writeFileSync(hp, html);
  const b = await launch();
  try {
    const p = await b.newPage({ viewport: { width: 1800, height: 400 } });
    await p.goto(pathToFileURL(hp).href);
    await p.waitForTimeout(300);
    await p.screenshot({ path: out, fullPage: true });
  } finally {
    await b.close();
  }
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
