# Входные данные, конвенции, шаг 1 — страница и Jira-виджеты

## Что нужно на входе

| Что | Откуда |
|---|---|
| Jira-ключ задачи | от пользователя / из ветки (`feature/<KEY>-…`) |
| Эмодзи дизайнера | свой у каждого; занятые видно по началу имён страниц в файле. Нового человека спросить и сохранить `set_designer_emoji` — реестра нет, эмодзи живёт в настройках мода на машине |
| Источник экранов | ветка, на которой человек работает, как она есть в рабочей копии (с незакоммиченными правками) — прототип в design-lab, ветка `web-ui-shop` или другой репо; мод подставляет репо и ветку сессии, подтвердить. Плюс адрес, где UI открыт (локально или стенд) — спросить |
| Квартальный файл | из настроек мода (`task_start` показывает) или найти по процедуре ниже; в любом сомнении — подтвердить у человека |

## Квартальный файл — куда кладём страницу

Страницы задач живут в Figma-проекте **«Product task»**: у Portal — файл на квартал (`Portal <год> – Q<n>`), у Ecom — один текущий файл (имя начинается с `Ecomm`). Ключи файлов в моде не зашиты: они лежат в настройках на машине и обновляются инструментом `set_figma_file`.

1. **Продукт** — по префиксу ключа (`ECOM-…` → Ecom, остальное → Portal) или по слову человека.
2. **Файл в настройках есть** — `task_start` помнит, для какого квартала он сохранён, и сравнивает с кварталом по сегодняшней дате. Квартал сменился → вводные так и говорят: **сначала спросить ссылку на новый файл** и сохранить её `set_figma_file`, страницу в старом файле не создавать. Если квартал файла моду неизвестен (ключ вписан руками в настройки), страховка — скрипт шага 1.2: он сравнивает `figma.root.name` с `EXPECTED_FILE` и останавливается, если имя не совпало. Для Ecom проверки нет (файл один, не квартальный).
3. **Файла нет или квартал сменился** — посчитать квартал по сегодняшней дате, найти в «Product task» файл с таким именем (попросить ссылку у человека; если он открыт в Figma — взять оттуда) и **сверить с файлом, в котором идёт работа**: `task_start` называет файл последней задачи этого продукта, ссылки на страницы в текущем разговоре тоже считаются. Расхождение между датой и тем, где реально работают, — вопрос человеку, не выбор молча.
4. **Подтвердить** у человека файл одной строкой (имя + ссылка) и сохранить: `set_figma_file { product, file: <ссылка> }`. Прежний файл мод сам переносит в «Earlier Figma files», чтобы комментарии и перезаливка в старых страницах работали.

Шаблон: в Portal-файле первая страница с `Template` в имени (в имени шаблона — эмодзи участников квартала), в Ecom — `template` и за ним разделитель `----`.

## Подготовка (один раз на машину)

1. Облачный Figma MCP под отдельным именем (чтобы не конфликтовал с `Figma` из Claude Desktop — тот только читает):
   ```bash
   claude mcp add --transport http --scope user figma-remote https://mcp.figma.com/mcp
   ```
2. **Новая** сессия (серверы подхватываются только при старте) → `/mcp` → `figma-remote` → Authenticate → в браузере Allow access.
   - В списке `/mcp` 90+ серверов: `figma-remote` внизу, без префикса `plugin:`.
   - Если сессия запомнила старый статус «needs auth» — `/mcp` → `figma-remote` → Reconnect (повторный вход не нужен).
3. Проверка: `whoami` отвечает аккаунтом. Роли **guest** в команде Sweed хватает на запись (проверено).
4. Перед `use_figma` — загрузить skill `figma:figma-use` (обязательно).

## Конвенции страницы

- **Имя:** `<эмодзи>␣␣<KEY> – <summary>` — эмодзи, **два пробела**, ключ, **en dash** `–`, название из Jira без префиксов `[Design]` / `[UX]`.
  - Пример: `🌙  DP-2871 – Reorganized Delivery settings — navigation and Map tab`
  - Несколько задач на одну страницу: `🌙  ECOM-15515 / ECOM-15578 – …`
- **Место:** сразу после шаблона и разделителей, которые идут прямо за ним (в Ecom — `----`): новые страницы сверху.
- **Шаблон:** первая страница файла, в имени есть `template` (регистр любой; в портальном перед словом — эмодзи участников квартала).
- **Ecom:** новые страницы — по этому же стандарту. Старые Ecom-страницы названы `ECOM-xxxx / Title` и свёрстаны свободно; их не переименовываем, к стандарту приведут отдельно.
- **Без чёрного чек-листа:** виджет `Aitm Junior — task, todos, notes, checklists` из оформления убран (Portal и Ecom). Из шаблона Q4 он удалён 2026-10-08; в старых файлах скрипт удаляет его из копии.

## Шаг 1 — страница + Jira-виджеты

### 1.1 Цепочка задачи в Jira

Пройти `parent` от задачи вверх, пока родителя нет: sub-task → story → epic → … Каждое звено = отдельный виджет. Порядок слева направо: **корень → … → сама задача** (как в шаблоне: epic, story, subtask).

> `getJiraIssue` в `compact` поле `parent` не отдаёт — брать `view: "evidence"` (у задачи) / `"full"`. Нет `parent` в ответе = корень.

### 1.2 Скрипт (`use_figma`)

Подставить `PAGE_NAME`, `KEY`, `CHAIN` (корень первым) и `EXPECTED_FILE` (имя файла квартала из `task_start`; для Ecom — `'Ecomm'`). Скрипт идемпотентен: если страница с `KEY` уже есть — ничего не делает; если файл не тот — останавливается до копирования.

```js
const KEY = 'DP-2871';
const PAGE_NAME = '🌙  DP-2871 – Reorganized Delivery settings — navigation and Map tab';
const CHAIN = ['DP-2870', 'DP-2871']; // root → task
const EXPECTED_FILE = 'Portal 2026 – Q4'; // the quarter file task_start named

if (!figma.root.name.includes(EXPECTED_FILE)) return { wrongFile: figma.root.name, expected: EXPECTED_FILE }; // ask for the current file, then set_figma_file

const keyRe = new RegExp('(^|[^A-Za-z0-9-])' + KEY + '(?![0-9])'); // DP-287 ≠ DP-2871
const existing = figma.root.children.find(p => keyRe.test(p.name));
if (existing) return { skipped: true, id: existing.id, name: existing.name };

const pages = figma.root.children;
const ti = pages.findIndex(p => /template/i.test(p.name));
if (ti < 0) throw new Error('Template page not found');
let at = ti + 1;                                             // после шаблона…
while (pages[at] && /^[-–—\s]+$/.test(pages[at].name)) at++;  // …и разделителей прямо за ним (Ecom: «----»)

const page = pages[ti].clone();
page.name = PAGE_NAME;
figma.root.insertChild(at, page);
await figma.setCurrentPageAsync(page);

const info = page.findOne(n => n.type === 'SECTION' && n.name === 'Info');
const jira = info.children.filter(n => n.type === 'WIDGET' && n.name === 'Jira');
const empty = jira.filter(w => w.height < 250);              // пустые: 360×176 (Portal), 360/392×176 (Ecom)
const filled = jira.filter(w => w.height >= 250);            // демо-виджеты с чужими задачами (Portal, 2024)
if (!empty.length) throw new Error('no empty Jira widget in the template');
filled.forEach(w => w.remove());
const checklist = info.children.filter(n => n.type === 'WIDGET' && n.name.startsWith('Aitm Junior'));
checklist.forEach(n => n.remove());                          // чёрный чек-лист больше не используется

const slots = empty.slice(0, CHAIN.length);
empty.slice(CHAIN.length).forEach(w => w.remove());          // лишние пустые
while (slots.length < CHAIN.length) { const c = empty[0].clone(); info.appendChild(c); slots.push(c); }
const X0 = 1622, Y = 400, STEP = 392 + 40;                  // 392 — ширина виджета после привязки
slots.forEach((w, i) => { w.x = X0 + i * STEP; w.y = Y; });

const review = info.children.find(n => n.type === 'INSTANCE' && n.name === 'review'); // есть только в Portal
if (review) { review.x = X0 + CHAIN.length * STEP; review.y = Y; }
const right = Math.max(...info.children.map(n => n.x + n.width));
info.resizeWithoutConstraints(right + 400, info.height);

// в шаблоне может лежать текст-ссылка на чужую задачу
const stray = page.findAll(n => n.type === 'TEXT' && n.name.startsWith('https://sweed.atlassian.net/browse/'));
stray.forEach(n => n.remove());

return { pageId: page.id, pageIndex: at, infoId: info.id,
  slots: slots.map((w, i) => ({ id: w.id, x: w.x, issue: CHAIN[i] })),
  removed: { filled: filled.length, checklist: checklist.length, stray: stray.length } };
```

Проверка: `get_screenshot` секции Info (`infoId`) — N пустых виджетов «Import an issue or project», затем review (в Portal).

> Portal-ветка скрипта проверена на DP-2871 (Q4). Ecom-ветка (шаблон `template`, разделитель, два пустых виджета, нет review) по структуре шаблона написана, но ещё не прогонялась — проверить скриншотом Info на первой Ecom-задаче.

### 1.3 Ссылки пользователю

Прислать списком, слева направо:

```
левый виджет  → https://sweed.atlassian.net/browse/<ROOT>
…
правый виджет → https://sweed.atlassian.net/browse/<KEY>
```

Человек в каждом виджете: **Import an issue or project** → вставить ссылку.

**Почему руками:** задачу, к которой привязан Jira-виджет, хранит сам виджет в своём состоянии, а читать и менять это состояние может только код самого виджета (`widgetSyncedState`). Наш код может только скопировать виджет вместе с тем, что в нём уже есть. Поэтому копируем **пустой**, а привязку делает человек.

### 1.4 После вставки ссылок

Привязанный виджет вырастает (в ECOM-15438 — до 1468 px в высоту), и секция Info перестаёт его вмещать. Нужно подогнать высоту: `info.resizeWithoutConstraints(info.width, 400 + <max высота виджета> + 400)`.
