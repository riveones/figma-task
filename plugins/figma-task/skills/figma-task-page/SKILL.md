---
name: figma-task-page
description: Sets up a Sweed task page in the quarterly Figma file (Portal or Ecom) — template copy and naming, Jira widgets for the whole issue chain, flow boards from prototype screenshots, a "For dev" block mapped to the production UI kit and re-checked — and works through the review comments on it. Use when /figma-task or /figma-comments starts, or whenever someone asks to make, fill or update the Figma page of a Jira task ("собери фигму для этой задачи", "сделай страницу задачи в фигме", "обнови фигму по задаче"), or to check, review, go through or fix the Figma comments of a task ("проверь комментарии по DP-2871", "разбери комменты в фигме по задаче", "исправь замечания из фигмы").
---

# Figma task page — with the figma-task mod

The mod adds these on top of the procedure. Use them instead of doing those parts by hand. Tools other than `task_start` and `task_comments` load on demand: if one is listed only by name, load it with ToolSearch (`select:mcp__figma-task__<name>`).

| Mod part | Use it for |
|---|---|
| `task_start` tool | A plain request with no command: take the key from the request or the branch name (`feature/<KEY>-…`), call `task_start { key, product? }` — it returns the inputs the command would pass and opens the pane. After a push of such a branch with no Figma page the mod adds a note asking you to offer the page: ask once («Собрать страницу <KEY> в Figma?»), on yes → `task_start`. |
| `task_progress` tool | After **every** step: `{ key, step, status: doing / done / blocked, note? }`. Steps: `page` · `widgets` · `inventory` · `capture` · `boards` · `fordev` · `verify` · `comments`. Pass `pageUrl` (the `figma.com/design/…?node-id=` link of the page) once it exists and `widgetLinks` (`https://sweed.atlassian.net/browse/<KEY>`, root first) once the chain is known — the pane shows them with Copy buttons. Other links are refused. |
| `upload_screens` tool | Step 2.4: `{ fileKey, pageId, items: [{ path, nodeId }] }` with absolute PNG paths inside the project, each rectangle once. It gets the upload URLs from the Figma MCP and posts the files itself (60 per batch). If it says it got no upload URLs (in auto mode its own Figma MCP call can get no verdict), call `upload_assets` yourself with the same `fileKey`, `count`, `nodeIds`, `currentPageId`, `scaleMode: "FILL"` and call `upload_screens` again with the same `items` plus `uploads` from that answer (≤ 60 per call) — the mod still posts the files; don't `curl` by hand. |
| `task_comments`, `draft_reply` tools | Step 3: `task_comments { key }` finds the task page itself and reads its open threads with what each is pinned to (the screenshot or marker under a pin on a frame, with its `nodeId`). `draft_reply` drafts the answer for a fixed thread — nothing is sent: the person reads the drafts in the pane and posts them. Works on a plain request ("проверь комментарии по DP-2871") or `/figma-comments <KEY>`; needs the Figma token in the mod's settings. |
| `set_figma_file`, `set_designer_emoji` tools | The inputs say when the Figma file is not set or may be an earlier quarter's: follow «Квартальный файл» in `references/page.md` — work out the quarter from today's date, look for that file in the Figma project "Product task", compare with the file the last task went to, confirm with the person, then `set_figma_file { product, file }`. The designer emoji: ask once, save with `set_designer_emoji`. |
| Agents | `figma-task:flow-inventory` (2.1), `figma-task:kit-mapper` (2.5), `figma-task:kit-verifier` (2.6 — always a separate run after the mapper; never skip). They read code only; every Figma write stays in the main session. |
| Scripts | `<mod folder>/scripts/lib.cjs` (Playwright harness), `sheet.cjs` (contact sheets), `login.cjs` (a signed-in session for screens behind a login — the person signs in, never Claude), `examples/dp2871-capture.cjs` and `examples/dp2871-devboxes.cjs` (a full worked example). Copy an example to `.claude/personal/<KEY>-figma/` in the repo the UI is built in, change the requires to the mod's `scripts/lib.cjs` by absolute path, rewrite the steps, run from the repo root. Outputs go to `$FIGMA_TASK_OUT` (default `.claude/personal/figma-task-shots`). Set `FIGMA_TASK_CHROMIUM` when Playwright wants another Chromium revision, `PLAYWRIGHT_MODULE` when the repo has no Playwright. |

The command or `task_start` passes the inputs (Jira key, product, Figma file, designer emoji, where the screens come from, checkout paths). Ask the person for anything marked "not set" or "ask me"; when the Figma file is in doubt, confirm it before creating anything. Before any `use_figma` call load the `figma:figma-use` skill.

> Как завести страницу задачи в квартальном Figma-файле Portal или Ecom: копия шаблона → имя по конвенции → Jira-виджеты на всю цепочку задачи → доски флоу → For dev. Делает Claude через `figma-remote` MCP; человек только вставляет ссылки в виджеты. Ecom-задачи оформляются по стандарту Portal.
> Впервые прогнано на DP-2871 (Q4, 2026-10-08). Эталон оформления — страница ECOM-15438 в Q3.

## Шаги — читать файл того шага, который выполняется

Пути — от папки этого скилла.

| Файл | Что внутри |
|---|---|
| `references/page.md` | входные данные, выбор квартального файла, подготовка, конвенции страницы, шаг 1 — страница и Jira-виджеты |
| `references/flows.md` | шаг 2 — источник экранов, инвентаризация, съёмка, доски, загрузка, For dev, перепроверка |
| `references/comments.md` | шаг 3 — комментарии из Figma: план правок, правки, черновики ответов |
| `references/gotchas.md` | подводные камни Figma MCP и Playwright |
