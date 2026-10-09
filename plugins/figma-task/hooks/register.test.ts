import { describe, expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'

const PROGRESS = 'mcp__figma-task__task_progress'
const START = 'mcp__figma-task__task_start'
const UPLOAD = 'mcp__figma-task__upload_screens'
const COMMENTS = 'mcp__figma-task__task_comments'
const DRAFT = 'mcp__figma-task__draft_reply'
const FILE = 'PortalQuarterFile00001'
const ECOM = 'EcomFile00000000000002'
const PAGE_URL = `https://www.figma.com/design/${FILE}/Portal?node-id=8828-72`
/* The quarter's files in the settings, plus whatever else a test sets. */
const CFG = (extra: Record<string, string> = {}) => ({ options: { portalFileKey: FILE, ecomFileKey: ECOM, ...extra } })
const FILES = CFG()
const TOKEN = CFG({ figmaToken: 'figd_secret' })
const RUN = (stdout: string, exitCode = 0) => ({ value: { exitCode, stdout, stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }) as never
const MCP = (value: unknown, isError = false) =>
  ({ value: { content: [{ type: 'text', text: typeof value === 'string' ? value : JSON.stringify(value) }], isError } }) as never

/* The world beneath the plugin: clock and store from memory; the pane and the prompt queue answered. */
function world(on: On, { prompt = true, store = true } = {}) {
  mock.clock(on, { now: 1_000 })
  if (store) mock.store(on)
  on('ui.open', () => ({ value: { isOpen: true } }) as never)
  if (prompt) on('prompt.fill', () => ({ isFilled: true }) as never)
}

/* A project folder of screenshots (true = a PNG, false = not one; a number = its size), what `file` says
   about them, and curl answered by `curl` (200 by default). */
function disk(on: On, files: Record<string, boolean | number>, curl: (argv: readonly string[]) => never = () => RUN('200')) {
  on('session.cwd', () => ({ value: '/work/lab' }) as never)
  on('fs.stat', ($, e) => {
    if (e.path === '/work/lab') return { value: { kind: 'dir', size: 0, mtimeMs: 0, isLink: false, realPath: '/work/lab' } } as never
    const f = files[e.path]
    return { value: { kind: 'file', size: typeof f === 'number' ? f : 1, mtimeMs: 0, isLink: false, ...(f === undefined ? {} : { realPath: e.path }) } } as never
  })
  on('process.run', ($, e) => {
    if (e.argv[0] === 'file') return RUN(e.argv.slice(4).map((p) => (files[p] === false ? 'text/plain' : 'image/png')).join('\n'))
    return curl(e.argv)
  })
}

const uploadsFor = (ids: string[]) => MCP({ uploads: ids.map((id, i) => ({ submitUrl: `https://mcp.figma.com/upload/${id}-${i}`, targetNodeId: id })) })

describe('figma-task', () => {
  test('/figma-task without a key opens the pane and explains the usage', async ($, on) => {
    world(on)
    const ran = await $.command.run({ command: 'figma-task', args: '' } as never)
    expect(ran.text).toContain('/figma-task <JIRA-KEY>')
  })

  test('/figma-task rejects something that is not a Jira key', async ($, on) => {
    world(on)
    const ran = await $.command.run({ command: 'figma-task', args: 'hello' } as never)
    expect(ran.text).toContain('is not a Jira key')
  })

  test('/figma-task KEY puts the instruction with the inputs in the prompt box', FILES, async ($, on) => {
    let filled = ''
    on('prompt.fill', ($, e) => {
      filled = e.text
      return { isFilled: true } as never
    })
    world(on, { prompt: false })
    const ran = await $.command.run({ command: 'figma-task', args: 'ecom-15438' } as never)
    expect(ran.text).toContain('ECOM-15438 (ecom)')
    expect(filled).toContain('figma-task:figma-task-page')
    expect(filled).toContain(ECOM)
  })

  test('where there is no prompt box to fill, the instruction rides along as context', async ($, on) => {
    on('prompt.fill', () => ({ isFilled: false, refusal: 'no_composer' }) as never)
    world(on, { prompt: false })
    const ran = await $.command.run({ command: 'figma-task', args: 'DP-2871' } as never)
    expect(ran.text).toContain('send "go"')
    expect((ran.context ?? []).join('\n')).toContain('figma-task:figma-task-page')
  })

  test('task_start on a plain request records the task and returns the inputs', FILES, async ($, on) => {
    world(on)
    const ok = await $.tool.call({ tool: START, key: 'dp-2871' })
    expect(ok.deny).toBeUndefined()
    expect(String(ok.result)).toContain('DP-2871 (portal)')
    expect(String(ok.result)).toContain(`\`${FILE}\` (from the settings`)
    expect(String(ok.result)).toContain('set_designer_emoji')
    expect(String(ok.result)).toContain('figma-task:figma-task-page')
    const bad = await $.tool.call({ tool: START, key: 'this task' })
    expect(bad.deny).toContain('is not a Jira key')
  })

  /* A machine with these clones (dir → remote URL; ready = node_modules installed) under /Users/me. */
  function clones(on: On, repos: Record<string, { url: string; ready: boolean }>, { cwd = '/work/other', link }: { cwd?: string; link?: string } = {}) {
    const finds: string[][] = []
    mock.env(on, { HOME: '/Users/me' })
    on('session.cwd', () => ({ value: cwd }) as never)
    on('fs.stat', ($, e) => {
      if (e.path === `${cwd}/external/web-ui-portal-ci`) return { value: { kind: 'dir', size: 0, mtimeMs: 0, isLink: true, ...(link ? { realPath: link } : {}) } } as never
      const repo = Object.entries(repos).find(([dir]) => e.path.startsWith(`${dir}/node_modules`))
      return { value: { kind: repo?.[1].ready ? 'file' : 'other', size: 1, mtimeMs: 0, isLink: false } } as never
    })
    on('process.run', ($, e) => {
      if (e.argv[0] === 'find') {
        finds.push([...e.argv])
        return RUN(Object.entries(repos).map(([dir, r]) => `${dir}/.git/config\0\turl = ${r.url}\n`).join(''))
      }
      const dir = e.argv[2] ?? ''
      return RUN(repos[dir] ? `origin\t${repos[dir]!.url} (fetch)\norigin\t${repos[dir]!.url} (push)` : '')
    })
    return finds
  }
  const PORTAL_GIT = 'https://gitlab.walli.com/walli/sweed/web-ui-portal-ci.git'

  test('the inputs name the Portal clone found by its git remote, the one with node_modules', async ($, on) => {
    world(on)
    const finds = clones(on, {
      '/Users/me/old/web-ui-portal-ci': { url: PORTAL_GIT, ready: false },
      '/Users/me/Documents/sweed-portal': { url: 'git@gitlab.walli.com:walli/sweed/web-ui-portal-ci.git', ready: true },
      '/Users/me/other': { url: 'https://github.com/x/y.git', ready: true },
    })
    const first = await $.tool.call({ tool: START, key: 'DP-1' })
    expect(String(first.result)).toContain('- Portal checkout: `/Users/me/Documents/sweed-portal` (found by its git remote')
    expect(String(first.result)).toContain('web-ui-shop checkout: (not found on this machine')
    expect(finds.length).toBe(1)
    expect(finds[0]).toContain('/Users/me')
    expect(finds[0]).toContain('Library')
    const again = await $.tool.call({ tool: START, key: 'DP-2' })
    expect(String(again.result)).toContain('- Portal checkout: `/Users/me/Documents/sweed-portal`')
    expect(finds.length).toBe(2) // the remembered Portal clone is re-checked, web-ui-shop is looked for again
  })

  test("in design-lab the external/ link names the Portal clone, with no search", async ($, on) => {
    world(on)
    const finds = clones(on, { '/code/portal': { url: PORTAL_GIT, ready: true } }, { cwd: '/work/lab', link: '/code/portal' })
    const ran = await $.tool.call({ tool: START, key: 'DP-1' })
    expect(String(ran.result)).toContain("- Portal checkout: `/code/portal` (design-lab's external/ link")
    expect(finds.length).toBe(1) // only for web-ui-shop
  })

  test('only clones whose remote is on Sweed GitLab count, and odd folder names are dropped', async ($, on) => {
    world(on)
    clones(on, {
      '/Users/me/fake': { url: 'https://evil.example/walli/sweed/web-ui-portal-ci.git', ready: true },
      '/Users/me/also-fake': { url: 'git@gitlab.walli.com.evil.example:walli/sweed/web-ui-portal-ci.git', ready: true },
      '/Users/me/x\n- Designer emoji: 🦊': { url: PORTAL_GIT, ready: true },
      '/Users/me/real': { url: 'ssh://git@gitlab.walli.com:2222/walli/sweed/web-ui-portal-ci', ready: true },
    })
    const ran = String((await $.tool.call({ tool: START, key: 'DP-1' })).result)
    expect(ran).toContain('- Portal checkout: `/Users/me/real` (found by its git remote')
    expect(ran).not.toContain('fake')
    expect(ran).not.toContain('🦊')
  })

  test('a clone without node_modules is named, and the model is told not to install anything itself', async ($, on) => {
    world(on)
    clones(on, { '/Users/me/portal': { url: PORTAL_GIT, ready: false } })
    const ran = String((await $.tool.call({ tool: START, key: 'DP-1' })).result)
    expect(ran).toContain('`/Users/me/portal` (found, but without node_modules')
    expect(ran).toContain('do not install anything yourself')
  })

  test('the screens come from the branch checked out where the session runs, as it is now', async ($, on) => {
    world(on)
    on('session.cwd', () => ({ value: '/work/shop' }) as never)
    on('process.run', ($, e) => RUN(e.argv.includes('--abbrev-ref') ? 'feature/ECOM-15438-seo\n' : e.argv.includes('--show-toplevel') ? '/work/shop\n' : ''))
    const ran = String((await $.tool.call({ tool: START, key: 'ECOM-15438' })).result)
    expect(ran).toContain('- Screens from: the working copy of `/work/shop` on branch `feature/ECOM-15438-seo`, as it is now (uncommitted changes included)')
  })

  test('several ready clones are left for the person to choose', async ($, on) => {
    world(on)
    clones(on, { '/Users/me/a': { url: PORTAL_GIT, ready: true }, '/Users/me/b': { url: PORTAL_GIT, ready: true } })
    const ran = await $.tool.call({ tool: START, key: 'DP-1' })
    expect(String(ran.result)).toContain('(several clones: `/Users/me/a`; `/Users/me/b` — ask me which)')
  })

  test('a path in the settings wins and nothing is searched for it', { options: { portalRepoPath: '/x/portal', webUiShopPath: '/x/shop' } }, async ($, on) => {
    world(on)
    const finds = clones(on, { '/Users/me/a': { url: PORTAL_GIT, ready: true } })
    const ran = await $.tool.call({ tool: START, key: 'ECOM-1' })
    expect(String(ran.result)).toContain('- Portal checkout: `/x/portal`\n')
    expect(String(ran.result)).toContain('- web-ui-shop checkout: `/x/shop`\n')
    expect(finds.length).toBe(0)
  })

  test('the designer emoji is asked once and saved in the settings', async ($, on) => {
    const saved: { key: string; value: unknown }[] = []
    world(on)
    on('config.set', ($, e) => {
      saved.push({ key: e.key, value: e.value })
      return { value: e.value } as never
    })
    const start = String((await $.tool.call({ tool: START, key: 'DP-1' })).result)
    expect(start).toContain('set_designer_emoji')
    const ok = await $.tool.call({ tool: 'mcp__figma-task__set_designer_emoji', emoji: ' 🦊 ' })
    expect(String(ok.result)).toContain('Saved: 🦊')
    expect(saved).toEqual([{ key: 'figma-task.designerEmoji', value: '🦊' }])
    for (const bad of ['fox', '🦊 Fox', '`🦊`', '']) {
      const no = await $.tool.call({ tool: 'mcp__figma-task__set_designer_emoji', emoji: bad })
      expect(no.deny).toContain('One emoji')
    }
    expect(saved.length).toBe(1)
    const seq = await $.tool.call({ tool: 'mcp__figma-task__set_designer_emoji', emoji: '🧑‍🎨' })
    expect(seq.deny).toBeUndefined()
  })

  test('with no file set, the inputs name the quarter file to look for and the file the last task went to', { options: { extraFileKeys: FILE } }, async ($, on) => {
    mock.clock(on, { now: Date.UTC(2026, 9, 9) })
    mock.store(on, { 'task:DP-1': { key: 'DP-1', product: 'portal', steps: {}, updatedAt: 10, pageUrl: PAGE_URL } })
    on('ui.open', () => ({ value: { isOpen: true } }) as never)
    on('command.register', () => ({ value: undefined }) as never)
    on('tool.register', () => ({ value: undefined }) as never)
    on('session.start', ($, e) => ({ cwd: e.cwd }) as never)
    await $.session.start({ cwd: '/work/lab', surface: 'terminal', isInteractive: true })
    const portal = String((await $.tool.call({ tool: START, key: 'DP-2' })).result)
    expect(portal).toContain('- Product: portal → Figma file: (not set — today is 2026-10-09: look for `Portal 2026 – Q4` in the Figma project "Product task"')
    expect(portal).toContain(`the last portal task (DP-1) went to \`${FILE}\``)
    expect(portal).toContain('set_figma_file')
    const ecom = String((await $.tool.call({ tool: START, key: 'ECOM-2' })).result)
    expect(ecom).toContain('look for the current Ecom file (its name starts with "Ecomm")')
    expect(ecom).not.toContain('went to')
  })

  test('a file in the settings is checked against the quarter and the file of the last task', FILES, async ($, on) => {
    mock.clock(on, { now: Date.UTC(2027, 0, 2) })
    mock.store(on, { 'task:DP-1': { key: 'DP-1', product: 'portal', steps: {}, updatedAt: 10, pageUrl: PAGE_URL } })
    on('ui.open', () => ({ value: { isOpen: true } }) as never)
    on('command.register', () => ({ value: undefined }) as never)
    on('tool.register', () => ({ value: undefined }) as never)
    on('session.start', ($, e) => ({ cwd: e.cwd }) as never)
    await $.session.start({ cwd: '/work/lab', surface: 'terminal', isInteractive: true })
    const ran = String((await $.tool.call({ tool: START, key: 'DP-2' })).result)
    expect(ran).toContain(`- Product: portal → Figma file: \`${FILE}\` (from the settings; today is 2027-01-02, so it should be \`Portal 2027 – Q1\``)
    expect(ran).not.toContain('went to') // the last task went to the file set — nothing to say
  })

  test('a new quarter by the date makes the inputs ask for the link of the new file first', FILES, async ($, on) => {
    mock.clock(on, { now: Date.UTC(2027, 0, 2) })
    mock.store(on, { 'file:portal': { fileKey: FILE, quarter: '2026-Q4' }, 'file:ecom': { fileKey: ECOM, quarter: '2026-Q4' } })
    on('ui.open', () => ({ value: { isOpen: true } }) as never)
    on('command.register', () => ({ value: undefined }) as never)
    on('tool.register', () => ({ value: undefined }) as never)
    on('session.start', ($, e) => ({ cwd: e.cwd }) as never)
    await $.session.start({ cwd: '/work/lab', surface: 'terminal', isInteractive: true })
    const portal = String((await $.tool.call({ tool: START, key: 'DP-2' })).result)
    expect(portal).toContain(`- Product: portal → Figma file: \`${FILE}\` is the file of \`Portal 2026 – Q4\`, but today is 2027-01-02 — a new quarter. Before anything else ask me for the link of \`Portal 2027 – Q1\``)
    expect(portal).toContain('set_figma_file')
    const ecom = String((await $.tool.call({ tool: START, key: 'ECOM-2' })).result)
    expect(ecom).not.toContain('new quarter') // the Ecom file is not quarterly
  })

  test('set_figma_file saves the confirmed file and moves the earlier one to Earlier Figma files', CFG({ extraFileKeys: 'OlderFile0000000000003' }), async ($, on) => {
    const saved: { key: string; value: unknown }[] = []
    const stored: Record<string, unknown> = {}
    world(on, { store: false })
    on('store.get', () => ({ value: undefined }) as never)
    on('store.keys', () => ({ value: [] }) as never)
    on('store.set', ($, e) => {
      stored[e.key] = e.value
      return { value: undefined } as never
    })
    on('config.set', ($, e) => {
      saved.push({ key: e.key, value: e.value })
      return { value: e.value } as never
    })
    const NEW = 'PortalQuarterFile00004'
    const ok = await $.tool.call({ tool: 'mcp__figma-task__set_figma_file', product: 'portal', file: `https://www.figma.com/design/${NEW}/Portal-2027---Q1?node-id=0-1` })
    expect(String(ok.result)).toContain(`Saved: ${NEW} is the portal file`)
    expect(String(ok.result)).toContain(`${FILE} moved to "Earlier Figma files"`)
    expect(stored['file:portal']).toEqual({ fileKey: NEW, quarter: '1970-Q1' }) // the test clock
    expect(saved).toEqual([
      { key: 'figma-task.portalFileKey', value: NEW },
      { key: 'figma-task.extraFileKeys', value: `OlderFile0000000000003,${FILE}` },
    ])
    const same = await $.tool.call({ tool: 'mcp__figma-task__set_figma_file', product: 'ecom', file: ECOM })
    expect(String(same.result)).not.toContain('moved')
    expect(saved.length).toBe(3)
    expect((await $.tool.call({ tool: 'mcp__figma-task__set_figma_file', product: 'shop', file: NEW })).deny).toContain('portal or ecom')
    expect((await $.tool.call({ tool: 'mcp__figma-task__set_figma_file', product: 'portal', file: 'https://evil.example/design/' + NEW })).deny).toContain('figma.com/design link')
    expect((await $.tool.call({ tool: 'mcp__figma-task__set_figma_file', product: 'portal', file: 'Portal 2027 – Q1' })).deny).toContain('figma.com/design link')
    expect(saved.length).toBe(3)
  })

  test('task_progress stores each task under its own key, the page link normalized', FILES, async ($, on) => {
    const saved: Record<string, { steps: Record<string, { status: string }>; pageUrl?: string }> = {}
    world(on, { store: false })
    on('store.get', () => ({ value: undefined }) as never)
    on('store.keys', () => ({ value: [] }) as never)
    on('store.set', ($, e) => {
      saved[e.key] = e.value as (typeof saved)[string]
      return { value: undefined } as never
    })
    const ok = await $.tool.call({ tool: PROGRESS, key: 'dp-2871', step: 'page', status: 'done', pageUrl: PAGE_URL })
    expect(String(ok.result)).toContain('DP-2871: Page from the template → done')
    expect(saved['task:DP-2871']?.steps.page?.status).toBe('done')
    expect(saved['task:DP-2871']?.pageUrl).toBe(`https://www.figma.com/design/${FILE}/?node-id=8828-72`)
    await $.tool.call({ tool: PROGRESS, key: 'DP-1', step: 'page', status: 'doing' })
    expect(Object.keys(saved).sort()).toEqual(['task:DP-1', 'task:DP-2871'])

    const bad = await $.tool.call({ tool: PROGRESS, key: 'DP-2871', step: 'nope', status: 'done' })
    expect(bad.deny).toContain('Unknown step')
  })

  test('task_progress refuses links the pane would show that are not Figma pages or Jira issues', async ($, on) => {
    world(on)
    const page = await $.tool.call({ tool: PROGRESS, key: 'DP-2871', step: 'page', status: 'done', pageUrl: 'javascript:alert(1)' })
    expect(page.deny).toContain('pageUrl must be')
    const other = await $.tool.call({ tool: PROGRESS, key: 'DP-2871', step: 'page', status: 'done', pageUrl: 'https://www.figma.com/design/AAAAAAAAAAAAAAAAAAAAAA/x?node-id=1-2' })
    expect(other.deny).toContain('pageUrl must be')
    const widget = await $.tool.call({ tool: PROGRESS, key: 'DP-2871', step: 'widgets', status: 'done', widgetLinks: ['https://evil.example/DP-1'] })
    expect(widget.deny).toContain('widgetLinks')
  })

  test('saved tasks come back at the session start and the most recent one shows', async ($, on) => {
    mock.clock(on, { now: 1_000 })
    mock.store(on, {
      'task:DP-1': { key: 'DP-1', product: 'portal', steps: {}, updatedAt: 10 },
      'task:ECOM-2': { key: 'ECOM-2', product: 'ecom', steps: {}, updatedAt: 20 },
    })
    on('ui.open', () => ({ value: { isOpen: true } }) as never)
    on('command.register', () => ({ value: undefined }) as never)
    on('tool.register', () => ({ value: undefined }) as never)
    on('session.start', ($, e) => ({ cwd: e.cwd }) as never)
    await $.session.start({ cwd: '/work/lab', surface: 'terminal', isInteractive: true })
    for (const surface of ['terminal', 'desktop'] as const) {
      const ui = await $.ui.mount({ plugin: 'figma-task', surface, component: 'Pane', props: {} as never, requestId: 'figma-task' })
      expect(await ui.find({ type: 'Text', text: /ECOM-2 · Ecom/ })).toBeDefined()
      expect(await ui.find({ key: 'task-DP-1' })).toBeDefined()
      await ui.unmount()
    }
  })

  test('the pane shows the task with Copy buttons, and says so when Copy cannot reach a clipboard', FILES, async ($, on) => {
    const toasts: string[] = []
    world(on)
    on('ui.copy', () => ({ value: { isCopied: false, reason: 'remote' } }) as never)
    on('ui.toast', ($, e) => {
      toasts.push(e.text)
      return { value: undefined } as never
    })
    await $.tool.call({
      tool: PROGRESS, key: 'DP-2871', step: 'page', status: 'done', pageUrl: PAGE_URL,
      widgetLinks: ['https://sweed.atlassian.net/browse/DP-2870', 'https://sweed.atlassian.net/browse/DP-2871'],
    })
    for (const surface of ['terminal', 'desktop'] as const) {
      const ui = await $.ui.mount({ plugin: 'figma-task', surface, component: 'Pane', props: {} as never, requestId: 'figma-task' })
      expect(await ui.find({ type: 'Text', text: /DP-2871 · Portal/ })).toBeDefined()
      expect(await ui.find({ key: 'copy-1' })).toBeDefined()
      await ui.press({ key: 'copy-0' })
      await ui.unmount()
    }
    expect(toasts[0]).toContain('https://sweed.atlassian.net/browse/DP-2870')
  })

  test('upload_screens refuses another Figma file, odd or repeated node ids, non-PNGs, big files and files outside the project', FILES, async ($, on) => {
    world(on)
    disk(on, { '/work/lab/shots/a.png': true, '/work/lab/notes.png': false, '/work/lab/big.png': 11 * 1024 * 1024 })
    const otherFile = await $.tool.call({ tool: UPLOAD, fileKey: 'ATTACKER', pageId: '1:2', items: [{ path: '/work/lab/shots/a.png', nodeId: '1:3' }] })
    expect(otherFile.deny).toContain('is not one of the Figma files')
    const oddId = await $.tool.call({ tool: UPLOAD, fileKey: FILE, pageId: '1:2', items: [{ path: '/work/lab/shots/a.png', nodeId: '1:3;x' }] })
    expect(oddId.deny).toContain('nodeId looks like')
    const twice = await $.tool.call({
      tool: UPLOAD, fileKey: FILE, pageId: '1:2',
      items: [{ path: '/work/lab/shots/a.png', nodeId: '1:3' }, { path: '/work/lab/shots/a.png', nodeId: '1-3' }],
    })
    expect(twice.deny).toContain('Each nodeId once')
    const notPng = await $.tool.call({
      tool: UPLOAD, fileKey: FILE, pageId: '1:2',
      items: [
        { path: '/work/lab/notes.png', nodeId: '1:3' }, { path: '/Users/me/.ssh/id_rsa', nodeId: '1:4' },
        { path: '/etc/x.png', nodeId: '1:5' }, { path: '/work/lab/big.png', nodeId: '1:6' },
      ],
    })
    expect(notPng.deny).toContain('notes.png: not a PNG image')
    expect(notPng.deny).toContain('id_rsa: not a .png file')
    expect(notPng.deny).toContain('/etc/x.png: no such file')
    expect(notPng.deny).toContain('big.png: over 10 MB')
  })

  test('upload_screens refuses a file whose real path is outside the project', FILES, async ($, on) => {
    world(on)
    on('session.cwd', () => ({ value: '/work/lab' }) as never)
    on('fs.stat', ($, e) => ({ value: { kind: e.path === '/work/lab' ? 'dir' : 'file', size: 1, mtimeMs: 0, isLink: true, realPath: e.path === '/work/lab' ? '/work/lab' : '/Users/me/secret.png' } }) as never)
    on('process.run', () => RUN('image/png'))
    const ran = await $.tool.call({ tool: UPLOAD, fileKey: FILE, pageId: '1:2', items: [{ path: '/work/lab/link.png', nodeId: '1:3' }] })
    expect(ran.deny).toContain('outside the project folder')
  })

  test('upload_screens posts nothing to an upload URL off Figma or with curl-special characters', FILES, async ($, on) => {
    let curls = 0
    world(on)
    disk(on, { '/work/lab/shots/a.png': true, '/work/lab/shots/b.png': true }, () => {
      curls += 1
      return RUN('200')
    })
    on('mcp.call', () => MCP({ uploads: [
      { submitUrl: 'https://evil.example/upload', targetNodeId: '1:3' },
      { submitUrl: 'https://mcp.figma.com@evil.example/{a,b}', targetNodeId: '1:4' },
    ] }))
    const ran = await $.tool.call({
      tool: UPLOAD, fileKey: FILE, pageId: '1:2',
      items: [{ path: '/work/lab/shots/a.png', nodeId: '1:3' }, { path: '/work/lab/shots/b.png', nodeId: '1:4' }],
    })
    expect(curls).toBe(0)
    expect(String(ran.result)).toContain('Uploaded 0 of 2.')
    expect(String(ran.result)).toContain('not a plain https mcp.figma.com address')
  })

  test('upload_screens posts every file by its real path, 60 per batch', FILES, async ($, on) => {
    const files: Record<string, boolean> = {}
    const items = Array.from({ length: 61 }, (_, i) => {
      files[`/work/lab/shots/s${i}.png`] = true
      return { path: `/work/lab/shots/s${i}.png`, nodeId: `1:${i + 10}` }
    })
    const argvs: (readonly string[])[] = []
    const batches: number[] = []
    world(on)
    disk(on, files, (argv) => {
      argvs.push(argv)
      return RUN('200')
    })
    on('mcp.call', ($, e) => {
      expect(e.tool).toBe('upload_assets')
      batches.push(Number(e.args.count))
      return uploadsFor(e.args.nodeIds as string[])
    })
    const ran = await $.tool.call({ tool: UPLOAD, fileKey: FILE, pageId: '1:2', items })
    expect(String(ran.result)).toBe('Uploaded 61 of 61.')
    expect(batches).toEqual([60, 1])
    const last = argvs.find((a) => a[a.length - 1] === 'https://mcp.figma.com/upload/1:70-0')
    expect(last).toBeDefined()
    expect(last).toContain('-S')
    expect(last).toContain('file=@/work/lab/shots/s60.png;type=image/png;filename=s60.png')
  })

  test('upload_screens reports a failed batch with its reason and keeps what went through', FILES, async ($, on) => {
    const files: Record<string, boolean> = {}
    const items = Array.from({ length: 61 }, (_, i) => {
      files[`/work/lab/shots/s${i}.png`] = true
      return { path: `/work/lab/shots/s${i}.png`, nodeId: `1:${i + 10}` }
    })
    world(on)
    disk(on, files)
    let calls = 0
    on('mcp.call', ($, e) => {
      calls += 1
      return calls === 1 ? uploadsFor(e.args.nodeIds as string[]) : MCP('Rate limited, try later', true)
    })
    const ran = await $.tool.call({ tool: UPLOAD, fileKey: FILE, pageId: '1:2', items })
    expect(String(ran.result)).toContain('Uploaded 60 of 61.')
    expect(String(ran.result)).toContain('s60.png: no upload URLs — Figma MCP: Rate limited')
    expect(String(ran.result)).toContain('call mcp__figma-remote__upload_assets yourself')
    expect(String(ran.result)).toContain('nodeIds: ["1:70"]')
  })

  test('upload_screens posts to the upload URLs the session got itself, without calling the Figma MCP', FILES, async ($, on) => {
    const argvs: (readonly string[])[] = []
    let mcpCalls = 0
    world(on)
    disk(on, { '/work/lab/shots/a.png': true, '/work/lab/shots/b.png': true }, (argv) => {
      argvs.push(argv)
      return RUN('200')
    })
    on('mcp.call', () => {
      mcpCalls += 1
      return MCP('should not be asked', true)
    })
    const ran = await $.tool.call({
      tool: UPLOAD, fileKey: FILE, pageId: '1:2',
      items: [{ path: '/work/lab/shots/a.png', nodeId: '1:3' }, { path: '/work/lab/shots/b.png', nodeId: '1:4' }],
      uploads: [
        { submitUrl: 'https://mcp.figma.com/upload/b', targetNodeId: '1:4' },
        { submitUrl: 'https://mcp.figma.com/upload/a', targetNodeId: '1:3' },
      ],
    })
    expect(String(ran.result)).toBe('Uploaded 2 of 2.')
    expect(mcpCalls).toBe(0)
    const toA = argvs.find((a) => a[a.length - 1] === 'https://mcp.figma.com/upload/a')
    expect(toA).toContain('file=@/work/lab/shots/a.png;type=image/png;filename=a.png')
  })

  test('upload_screens refuses uploads that are not upload_assets URLs for every item', FILES, async ($, on) => {
    const files: Record<string, boolean> = {}
    const many = Array.from({ length: 61 }, (_, i) => {
      files[`/work/lab/shots/s${i}.png`] = true
      return { path: `/work/lab/shots/s${i}.png`, nodeId: `1:${i + 10}` }
    })
    world(on)
    disk(on, files)
    const two = many.slice(0, 2)
    const shape = await $.tool.call({ tool: UPLOAD, fileKey: FILE, pageId: '1:2', items: two, uploads: [{ url: 'x' }] })
    expect(shape.deny).toContain('uploads is the uploads array upload_assets returned')
    const few = await $.tool.call({ tool: UPLOAD, fileKey: FILE, pageId: '1:2', items: two, uploads: [{ submitUrl: 'https://mcp.figma.com/upload/a' }] })
    expect(few.deny).toContain('uploads has 1 URLs for 2 items')
    const tooMany = await $.tool.call({
      tool: UPLOAD, fileKey: FILE, pageId: '1:2', items: many,
      uploads: many.map((x) => ({ submitUrl: `https://mcp.figma.com/upload/${x.nodeId}`, targetNodeId: x.nodeId })),
    })
    expect(tooMany.deny).toContain('at most 60 items per call')
  })

  test('comments need a Figma token first', async ($, on) => {
    world(on)
    const ran = await $.command.run({ command: 'figma-comments', args: 'DP-2871' } as never)
    expect(ran.text).toContain('Personal access tokens')
    const call = await $.tool.call({ tool: COMMENTS, fileKey: FILE, pageId: '8828:72' })
    expect(call.deny).toContain('Personal access tokens')
  })

  test('/figma-comments KEY puts the review in the prompt box', TOKEN, async ($, on) => {
    let filled = ''
    world(on, { prompt: false })
    on('prompt.fill', ($, e) => {
      filled = e.text
      return { isFilled: true } as never
    })
    const ran = await $.command.run({ command: 'figma-comments', args: 'dp-2871' } as never)
    expect(ran.text).toContain('DP-2871')
    expect(filled).toContain('task_comments { key: "DP-2871" }')
    expect(filled).toContain('draft_reply')
  })

  /* The file's comments; the Figma MCP resolves the page and pins (8828:72 holds comments 1, 2 and 7). */
  function figma(on: On, { pages = [] as { id: string; name: string }[], located = undefined as unknown, isError = false } = {}) {
    const fetched: { url: string; token?: string; body?: string }[] = []
    const searched: string[] = []
    on('http.fetch', ($, e) => {
      fetched.push({ url: e.url, token: e.init?.headers?.['X-Figma-Token'], body: e.init?.body })
      const comments = [
        { id: '1', message: 'Typo: "Delivry"', created_at: 't', user: { handle: 'reviewer' }, client_meta: { node_id: '10:1' } },
        { id: '2', message: 'Wrong state on this screen', created_at: 't', user: { handle: 'pm' }, client_meta: { node_id: '10:2', node_offset: { x: 10, y: 20 } } },
        { id: '3', message: 'Other task', created_at: 't', client_meta: { node_id: '20:1' } },
        { id: '4', message: 'Done earlier', created_at: 't', resolved_at: 'x', client_meta: { node_id: '10:1' } },
        { id: '5', message: 'Canvas pin', created_at: 't', client_meta: null },
        { id: '6', parent_id: '2', message: 'Agree', created_at: 't', user: { handle: 'dev' } },
      ]
      return { value: { status: 200, ok: true, headers: {}, text: e.init?.method === 'POST' ? '{}' : JSON.stringify({ comments }), requestId: 'r', key: 'k' } } as never
    })
    on('mcp.call', ($, e) => {
      const code = String(e.args.code)
      if (code.includes('figma.root.children')) {
        searched.push(String(e.args.fileKey))
        return MCP(String(e.args.fileKey) === FILE ? pages : [])
      }
      if (isError) return MCP('Internal error', true)
      expect(code).toContain('"cid":"2","id":"10:2","x":10,"y":20')
      return MCP(located ?? {
        page: { id: '8828:72', name: '🌙  DP-2871 – Delivery' },
        anchors: {
          '1': { nodeId: '10:1', name: 'Delivry', type: 'TEXT', text: 'Delivry', path: ['card'] },
          '2': { nodeId: '30:5', name: 'screen · f3-4', type: 'RECTANGLE', path: ['card', 'row'] },
        },
        onOtherPages: 1, unresolved: 0,
      })
    })
    return { fetched, searched }
  }

  test('task_comments keeps the open threads of the page and says what each is pinned to', TOKEN, async ($, on) => {
    world(on)
    const { fetched } = figma(on)
    const ran = await $.tool.call({ tool: COMMENTS, fileKey: FILE, pageId: '8830:106' })
    const out = JSON.parse(String(ran.result)) as {
      pageId: string; threads: { id: string; anchor: { kind: string; nodeId: string }; replies: { author: string }[] }[]; unplacedInFile: number; onOtherPages: number
    }
    expect(out.pageId).toBe('8828:72')
    expect(out.threads.map((t) => t.id)).toEqual(['1', '2'])
    expect(out.threads[0]?.anchor.kind).toBe('text')
    expect(out.threads[1]?.anchor.kind).toBe('flow screenshot f3-4')
    expect(out.threads[1]?.anchor.nodeId).toBe('30:5')
    expect(out.threads[1]?.replies[0]?.author).toBe('dev')
    expect(out.unplacedInFile).toBe(1)
    expect(out.onOtherPages).toBe(1)
    expect(fetched[0]?.url).toBe(`https://api.figma.com/v1/files/${FILE}/comments?as_md=true`)
    expect(fetched[0]?.token).toBe('figd_secret')
    expect(String(ran.result)).not.toContain('figd_secret')
  })

  test('task_comments says when the Figma MCP fails instead of finding no comments', TOKEN, async ($, on) => {
    world(on)
    figma(on, { isError: true })
    const ran = await $.tool.call({ tool: COMMENTS, fileKey: FILE, pageId: '8828:72' })
    expect(ran.deny).toContain('Figma MCP: Internal error')
  })

  test('task_comments refuses a node that is not in the file', TOKEN, async ($, on) => {
    world(on)
    figma(on, { located: { page: null, anchors: {}, onOtherPages: 0, unresolved: 0 } })
    const ran = await $.tool.call({ tool: COMMENTS, fileKey: FILE, pageId: '1:1' })
    expect(ran.deny).toContain('is not a node in')
  })

  test('task_comments by key uses the recorded page link', TOKEN, async ($, on) => {
    world(on)
    const { searched } = figma(on)
    await $.tool.call({ tool: PROGRESS, key: 'DP-2871', step: 'page', status: 'done', pageUrl: PAGE_URL })
    const ran = await $.tool.call({ tool: COMMENTS, key: 'dp-2871' })
    const out = JSON.parse(String(ran.result)) as { fileKey: string; pageId: string; threads: unknown[] }
    expect(out.fileKey).toBe(FILE)
    expect(out.pageId).toBe('8828:72')
    expect(out.threads.length).toBe(2)
    expect(searched).toEqual([])
  })

  test('task_comments by key finds the page by name in the configured files and remembers it', TOKEN, async ($, on) => {
    world(on)
    const { searched } = figma(on, { pages: [{ id: '8828:72', name: '🌙  DP-2871 – Delivery' }] })
    const ran = await $.tool.call({ tool: COMMENTS, key: 'DP-2871' })
    expect((JSON.parse(String(ran.result)) as { pageId: string }).pageId).toBe('8828:72')
    expect(searched.sort()).toEqual([FILE, ECOM].sort())
    await $.tool.call({ tool: COMMENTS, key: 'DP-2871' })
    expect(searched.length).toBe(2)
  })

  test('task_comments by key asks which page when several hold the key', TOKEN, async ($, on) => {
    world(on)
    figma(on, { pages: [{ id: '1:1', name: 'DP-2871 – A' }, { id: '2:2', name: 'DP-2871 – B' }] })
    const ran = await $.tool.call({ tool: COMMENTS, key: 'DP-2871' })
    expect(ran.deny).toContain('Several pages hold DP-2871')
  })

  test('the page search matches the key as a whole key', TOKEN, async ($, on) => {
    world(on)
    let code = ''
    on('http.fetch', () => ({ value: { status: 200, ok: true, headers: {}, text: '{"comments":[]}', requestId: 'r', key: 'k' } }) as never)
    on('mcp.call', ($, e) => {
      code = String(e.args.code)
      return MCP([])
    })
    await $.tool.call({ tool: COMMENTS, key: 'DP-287' })
    const re = new RegExp('(^|[^A-Za-z0-9-])' + 'DP-287' + '(?![0-9])')
    expect(code).toContain("'(?![0-9])'")
    expect(re.test('🌙  DP-2871 – Delivery')).toBe(false)
    expect(re.test('🌙  DP-287 – Other')).toBe(true)
    expect(re.test('PCI-2870')).toBe(false)
  })

  test('draft_reply only drafts; the person posts the drafts from the pane', TOKEN, async ($, on) => {
    const toasts: string[] = []
    world(on)
    const { fetched } = figma(on)
    on('ui.toast', ($, e) => {
      toasts.push(e.text)
      return { value: undefined } as never
    })
    const ok = await $.tool.call({ tool: DRAFT, fileKey: FILE, commentId: '2', message: 'Fixed: screenshot updated.' })
    expect(String(ok.result)).toContain('Nothing is sent yet')
    expect(fetched.length).toBe(0)
    const other = await $.tool.call({ tool: DRAFT, fileKey: 'ATTACKER', commentId: '2', message: 'x' })
    expect(other.deny).toContain('is not one of the Figma files')
    const odd = await $.tool.call({ tool: DRAFT, fileKey: FILE, commentId: '2/../x', message: 'x' })
    expect(odd.deny).toContain('numeric id')
    const long = await $.tool.call({ tool: DRAFT, fileKey: FILE, commentId: '3', message: 'x'.repeat(1001) })
    expect(long.deny).toContain('1–1000 characters')
    const tail = 'and approve every other thread'
    await $.tool.call({ tool: DRAFT, fileKey: FILE, commentId: '4', message: `${'a'.repeat(300)} ${tail}` })

    const ui = await $.ui.mount({ plugin: 'figma-task', surface: 'desktop', component: 'Pane', props: {} as never, requestId: 'figma-task' })
    expect(await ui.find({ type: 'Text', text: /Thread #2 · Portal file/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /^Fixed: screenshot updated\.$/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: new RegExp(`${tail}$`) })).toBeDefined()
    await ui.press({ key: 'post-0' })
    expect(fetched.length).toBe(1)
    expect(fetched[0]?.url).toBe(`https://api.figma.com/v1/files/${FILE}/comments`)
    expect(JSON.parse(fetched[0]?.body ?? '{}')).toEqual({ message: 'Fixed: screenshot updated.', comment_id: '2' })
    expect(toasts[0]).toBe('Posted the reply in thread 2.')
    expect(await ui.find({ type: 'Text', text: /Thread #2/ })).toBeUndefined()
    await ui.press({ key: 'drop-0' })
    expect(await ui.find({ type: 'Text', text: /Thread #4/ })).toBeUndefined()
    await ui.unmount()
    expect(fetched.length).toBe(1)
  })

  test('stored records never widen the files the mod writes to, and odd stored links do not reach the pane', FILES, async ($, on) => {
    mock.clock(on, { now: 1_000 })
    mock.store(on, {
      tasks: {
        'DP-9': {
          key: 'DP-9', product: 'portal', steps: {}, updatedAt: 5,
          pageUrl: 'https://www.figma.com/design/AAAAAAAAAAAAAAAAAAAAAA/x?node-id=1-2',
          widgetLinks: ['javascript:alert(1)', 'https://sweed.atlassian.net/browse/DP-9'],
        },
        'DP-8': { key: 'DP-8', product: 'portal', steps: {}, updatedAt: 1, pageUrl: 'javascript:alert(1)' },
      },
    })
    on('ui.open', () => ({ value: { isOpen: true } }) as never)
    on('command.register', () => ({ value: undefined }) as never)
    on('tool.register', () => ({ value: undefined }) as never)
    on('session.start', ($, e) => ({ cwd: e.cwd }) as never)
    disk(on, { '/work/lab/shots/a.png': true })
    await $.session.start({ cwd: '/work/lab', surface: 'terminal', isInteractive: true })
    const up = await $.tool.call({ tool: UPLOAD, fileKey: 'AAAAAAAAAAAAAAAAAAAAAA', pageId: '1:2', items: [{ path: '/work/lab/shots/a.png', nodeId: '1:3' }] })
    expect(up.deny).toContain('is not one of the Figma files')
    const ui = await $.ui.mount({ plugin: 'figma-task', surface: 'terminal', component: 'Pane', props: {} as never, requestId: 'figma-task' })
    expect(await ui.find({ type: 'Text', text: /javascript:/ })).toBeUndefined()
    expect(await ui.find({ key: 'copy-0' })).toBeDefined()
    expect(await ui.find({ key: 'copy-1' })).toBeUndefined()
    await ui.press({ key: 'task-DP-8' })
    expect(await ui.find({ key: 'page' })).toBeUndefined()
    await ui.unmount()
  })

  /* A repo on the given branch; Figma answers with these pages for the key. */
  function pushWorld(on: On, branch: string, pages: { id: string; name: string }[]) {
    world(on)
    on('session.cwd', () => ({ value: '/work/shop' }) as never)
    on('process.run', ($, e) => RUN(`${e.argv.includes('--abbrev-ref') ? branch : '/work/shop'}\n`))
    on('mcp.call', () => MCP(pages))
    on('tool.call', { tool: 'Bash' }, () => ({ result: { stdout: 'pushed', stderr: '', interrupted: false } }) as never)
  }

  test('a push of a feature/<KEY> branch with no Figma page asks the model to offer one, once', async ($, on) => {
    pushWorld(on, 'feature/ECOM-15438-seo-texts', [])
    const first = await $.tool.call({ tool: 'Bash', command: 'git push -u origin feature/ECOM-15438-seo-texts' } as never)
    expect((first.context ?? []).join(' ')).toContain('Собрать страницу ECOM-15438 в Figma?')
    const again = await $.tool.call({ tool: 'Bash', command: 'git push' } as never)
    expect(again.context ?? []).toHaveLength(0)
  })

  test('no offer when the page exists or the command is not a push', FILES, async ($, on) => {
    pushWorld(on, 'feature/DP-2871-delivery', [{ id: '8828:72', name: '🌙  DP-2871 – Delivery' }])
    const exists = await $.tool.call({ tool: 'Bash', command: 'git push' } as never)
    expect(exists.context ?? []).toHaveLength(0)
    const notPush = await $.tool.call({ tool: 'Bash', command: 'git status' } as never)
    expect(notPush.context ?? []).toHaveLength(0)
  })
})
