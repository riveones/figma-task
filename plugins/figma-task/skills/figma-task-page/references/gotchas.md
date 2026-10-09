# Gotchas

## Gotchas

- `get_metadata` без `nodeId` показывает **только первую страницу**, а не все. Полный список — через `use_figma`: `figma.root.children.map(p => p.name)`.
- Содержимое виджета через Plugin API закрыто (`OpaqueNode`), найти внутри текст «Import an issue» нельзя. Пустой виджет отличаем по размеру.
- `get_metadata` на целую страницу задачи может весить 250k+ символов. Структуру смотреть скриптом по сохранённому файлу (top-level), а не читать целиком.
- Playwright из репо может требовать другую ревизию Chromium, чем лежит в `~/Library/Caches/ms-playwright` → `chromium.launch({ executablePath: <путь к установленному chrome-headless-shell> })` вместо скачивания.
- Radix DropdownMenu открывается на `pointerdown`; обычный клик по «…» в строке ещё и раскрывает строку. Открывать через `locator.dispatchEvent('pointerdown', { button: 0, pointerType: 'mouse', pointerId: 1 })`.
- Scratchpad в `/tmp` не переживает перезагрузку — рабочие скрипты держать в `.claude/personal/` (gitignored).
- Версия кита в `node_modules` клона Portal может отставать от `master` на несколько мажоров (DP-2871: 16.0.0 при 20.0.0 на master) — пин брать с `origin/master` после `git fetch`, кит — из реестра (`npm pack`, шаг 2.5). Без `fetch` и `origin/master` бывает старым.
- `upload_screens` в auto-режиме может не получить ссылки: классификатор не выносит решение по вызову `upload_assets` изнутри инструмента мода. Тогда — `upload_assets` самому и `upload_screens` с `uploads` (шаг 2.4).
