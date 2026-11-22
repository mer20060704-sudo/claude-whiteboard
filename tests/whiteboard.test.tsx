import type { On } from 'claude-code'
import { expect, mock, test } from 'claude-code/testing'

import { TEMPLATE_EN, TEMPLATE_ZH } from '../hooks/templates'

const ROOT = 'C:/proj'
const WB = `${ROOT}/WHITEBOARD.md`
const BAND = {
  plugin: 'whiteboard',
  component: 'AbovePrompt',
  props: {
    hasSurvey: false,
    isCollapsed: false,
    isWorking: false,
    maxRows: 30,
    bodyColumns: 100,
    scroll: { offset: 0, bodyRows: 29 },
    view: {},
  },
} as const
const PANE = {
  plugin: 'whiteboard',
  component: 'Pane',
  requestId: 'whiteboard',
  props: {
    title: '白板',
    isFocused: false,
    bodyColumns: 60,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 40 },
    view: {},
  },
} as const
const RUN = { args: '', origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 80 } } as const

/** 用 JS 包住的白板（給要在瀏覽器直接打開白板的專案用）：反引號寫成 \`、開頭有規則註解。內容全是虛構的。 */
function wrappedBoard(doing: string): string {
  return [
    'window.__WHITEBOARD_MD__ = String.raw`# 🎯 白板',
    '<!--',
    '  規則：內文每個反引號都要寫成 \\` 。',
    '-->',
    '',
    '## 📍 CURRENT_FOCUS',
    '- **主目標**：上線第一版',
    '- **最後更新**：2026-01-05 09:01',
    '',
    '---',
    '',
    '## 🃏 KANBAN',
    '',
    '### 🔥 DOING (正在執行)',
    doing,
    '',
    '### 📋 TODO (待辦佇列)',
    '- **[A2] 寫登入頁** \\`@alice\\` \\`#web\\`',
    '  - 先做 \\`email\\` 登入',
    '',
    '### 🚧 BLOCKED (卡關 / 待決策)',
    '- （目前無）',
    '',
    '### ✅ DONE (已完成)',
    '- **[A1] 開專案** \\`@bob\\`',
    '',
    '---',
    '',
    '## 📐 CHEATSHEET',
    '- **埠號**：\\`8080\\`',
    '- **紅線**：不要動正式資料庫',
    '`;',
    '',
  ].join('\n')
}

/** 一般 Markdown、英文、卡片不用粗體、冒號寫在粗體裡面：介面要跟著變英文。 */
const EN_BOARD = [
  '# Board',
  '<!-- rules: keep it short -->',
  '## Current focus',
  '- **Goal**: ship v1',
  '- **Last update:** 2026-01-05',
  '',
  '## Kanban',
  '### Doing',
  '- Fix the login bug `@alice` `#web`',
  '  - repro on Safari',
  '### To do',
  '- **Write docs** `@bob`',
  '- (none)',
  '### Blocked',
  '- (none)',
  '### Done',
  '- **Set up repo**',
  '',
  '## Cheatsheet',
  '- **Port**: `8080`',
  '',
].join('\n')

/** 一般 Markdown、只用中文標題、沒有看板段落：欄位直接寫在文件裡也要找得到，小抄不能被吃進已完成欄。 */
const ZH_PLAIN = [
  '# 白板',
  '## 焦點',
  '- **目標**：月底上線',
  '### 正在做',
  '- **[B1] 串金流** `@dana`',
  '### 待辦',
  '- （目前無）',
  '### 卡關',
  '- **[B2] 等合約**：等對方回覆 `@erin`',
  '### 已完成',
  '- （目前無）',
  '## 小抄',
  '- **測試卡號**：只用假資料',
  '',
].join('\n')

type Files = Record<string, { text: string; mtimeMs: number }>

/** 測試裡由這些 hook 扮演引擎：檔案系統、指令登記、對話開始、第一則訊息的前置內容。
    引擎把路徑交給 fs 之前會換成這台的格式（Windows 是 C:\proj\WHITEBOARD.md），所以這裡一律換回斜線再查。 */
const norm = (p: string): string => p.replace(/\\/g, '/')
function world(on: On, files: Files, opened: string[], cwd = ROOT) {
  on('command.register', (_, e) => ({ value: { command: e.name } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('session.cwd', () => ({ value: cwd }))
  on('prompt.context', (_, e) => ({ blocks: e.blocks }))
  on('ui.open', (_, e) => {
    opened.push(e.id)
    return { value: { isPlaced: true } }
  })
  on('fs.exists', (_, e) => ({ value: norm(e.path) in files }))
  on('fs.stat', (_, e) => {
    const f = files[norm(e.path)]
    if (!f) throw new Error(`ENOENT ${e.path}`)
    return { value: { kind: 'file', size: f.text.length, mtimeMs: f.mtimeMs, isLink: false } }
  })
  on('fs.read', (_, e) => ({ value: files[norm(e.path)]?.text ?? '' }))
  on('fs.write', (_, e) => {
    files[norm(e.path)] = { text: e.text, mtimeMs: 100 }
    return { value: undefined }
  })
}

test('橫條預設縮小成一行，每個畫面都畫得出四欄數字；不自動開側邊面板', async ($, on) => {
  const opened: string[] = []
  world(on, { [WB]: { text: wrappedBoard('- **[QA] 驗收** \\`@carol\\`'), mtimeMs: 1 } }, opened)
  mock.clock(on)
  mock.store(on)

  await $.session.start({ cwd: `${ROOT}/.claude/worktrees/elastic-bell`, surface: 'desktop', isInteractive: true })
  expect(opened).toEqual([])

  for (const surface of ['terminal', 'desktop', 'mobile'] as const) {
    const ui = await $.ui.mount({ ...BAND, surface })
    expect((await ui.find({ type: 'Text', text: /白板/ }))?.text).toBe('📋 白板')
    expect((await ui.find({ type: 'Text', text: /進行/ }))?.text).toBe('進行 1・待辦 1・卡關 0・完成 1')
    expect(await ui.find({ key: 'wb-toggle' })).toBeTruthy()
    expect(await ui.find({ type: 'Markdown', text: /寫登入頁/ })).toBeUndefined() // 縮小時不列卡片
    await ui.unmount()
  }
})

test('按展開列出焦點與卡片標題，按縮小收回', async ($, on) => {
  const opened: string[] = []
  world(on, { [WB]: { text: wrappedBoard(''), mtimeMs: 1 } }, opened)
  mock.clock(on)
  mock.store(on)
  await $.session.start({ cwd: ROOT, surface: 'desktop', isInteractive: true })

  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  await ui.press({ key: 'wb-toggle' })
  expect(await ui.find({ type: 'Markdown', text: /\*\*主目標\*\*：上線第一版/ })).toBeTruthy()
  expect(await ui.find({ type: 'Markdown', text: /・\[A2\] 寫登入頁　@alice #web/ })).toBeTruthy()
  expect((await ui.find({ type: 'Text', text: /已完成/ }))?.text).toBe('✅ 已完成 1 張（完整面板看全部）')
  await ui.press({ key: 'wb-pane' })
  expect(opened).toEqual(['whiteboard'])

  await ui.press({ key: 'wb-toggle' })
  expect(await ui.find({ type: 'Markdown', text: /寫登入頁/ })).toBeUndefined()
  await ui.unmount()
})

test('上次展開過，新對話的橫條就照展開的樣子', async ($, on) => {
  const opened: string[] = []
  world(on, { [WB]: { text: wrappedBoard(''), mtimeMs: 1 } }, opened)
  mock.clock(on)
  mock.store(on, { bandExpanded: true })
  await $.session.start({ cwd: ROOT, surface: 'desktop', isInteractive: true })

  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect(await ui.find({ type: 'Markdown', text: /寫登入頁/ })).toBeTruthy()
  await ui.unmount()
})

test('別的對話存檔後，下一輪（3 秒內）橫條數字就更新', async ($, on) => {
  const opened: string[] = []
  const files: Files = { [WB]: { text: wrappedBoard(''), mtimeMs: 1 } }
  world(on, files, opened)
  const clock = mock.clock(on)
  mock.store(on)

  await $.session.start({ cwd: `${ROOT}/docs/sub`, surface: 'desktop', isInteractive: true })
  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect((await ui.find({ type: 'Text', text: /進行/ }))?.text).toBe('進行 0・待辦 1・卡關 0・完成 1')

  files[WB] = { text: wrappedBoard('- **[新] 剛加的卡** \\`@dana\\`'), mtimeMs: 2 }
  await clock.advance(3000)
  expect((await ui.find({ type: 'Text', text: /進行/ }))?.text).toBe('進行 1・待辦 1・卡關 0・完成 1')
  await ui.unmount()
})

test('每個對話第一則訊息前面帶著白板摘要；JS 包住的白板才提醒反引號', async ($, on) => {
  const opened: string[] = []
  world(on, { [WB]: { text: wrappedBoard('- **[QA] 驗收** \\`@carol\\`'), mtimeMs: 1 } }, opened)
  mock.clock(on)
  mock.store(on)
  await $.session.start({ cwd: ROOT, surface: 'desktop', isInteractive: true })

  const ctx = await $.prompt.context({ blocks: [{ name: 'currentDate', text: '2026-01-05' }] })
  expect(ctx.blocks.map((b) => b.name)).toEqual(['currentDate', 'whiteboard'])
  const text = ctx.blocks[1]?.text ?? ''
  expect(text).toContain('共用白板 WHITEBOARD.md')
  expect(text).toContain('改前先重讀檔案、改完立刻存')
  expect(text).toContain('內文的反引號要寫成 \\`')
  expect(text).toContain('主目標：上線第一版')
  expect(text).toContain('正在做（1）：[QA] 驗收（@carol）')
  expect(text).toContain('待辦（1）：[A2] 寫登入頁（@alice #web）')
  expect(text).toContain('卡關／待決策（0）：無')
  expect(text).not.toContain('先做') // 描述不帶，省 token
})

test('沒有白板的專案：沒有橫條、不帶摘要，/whiteboard-panel 說找不到並教怎麼建', async ($, on) => {
  const opened: string[] = []
  world(on, {}, opened, 'C:/other')
  mock.clock(on)
  mock.store(on)
  await $.session.start({ cwd: 'C:/other', surface: 'desktop', isInteractive: true })

  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect(await ui.find({ type: 'Text', text: /白板|Whiteboard/ })).toBeUndefined()
  await ui.unmount()

  const ctx = await $.prompt.context({ blocks: [] })
  expect(ctx.blocks).toEqual([])

  const ran = await $.command.run({ command: 'whiteboard-panel', ...RUN })
  expect(ran.text).toMatch(/找不到 WHITEBOARD\.md/)
  expect(ran.text).toMatch(/\/whiteboard-init/)
  expect(ran.text).toMatch(/No WHITEBOARD\.md found/)
  expect(opened).toEqual([])
})

test('完整面板：四欄含描述與標籤；最小化小卡只放數字；小抄按了才展開', async ($, on) => {
  const opened: string[] = []
  world(on, { [WB]: { text: wrappedBoard(''), mtimeMs: 1 } }, opened)
  mock.clock(on)
  mock.store(on)
  await $.session.start({ cwd: ROOT, surface: 'desktop', isInteractive: true })

  const ran = await $.command.run({ command: 'whiteboard-panel', ...RUN })
  expect(ran.text).toMatch(/白板完整面板已打開/)
  expect(opened).toEqual(['whiteboard'])

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface })
    expect((await ui.find({ type: 'Text', text: /待辦（/ }))?.text).toBe('📋 待辦（1）')
    expect(await ui.find({ type: 'Markdown', text: /先做 `email` 登入/ })).toBeTruthy()
    expect((await ui.find({ type: 'Text', text: /@alice/ }))?.text).toBe('@alice・#web')
    expect(await ui.find({ type: 'Markdown', text: /規則/ })).toBeUndefined()
    await ui.unmount()
  }

  const widget = await $.ui.mount({ ...PANE, surface: 'desktop', props: { ...PANE.props, placement: 'widget' } })
  expect((await widget.find({ type: 'Text', text: /進行/ }))?.text).toBe('進行 0・待辦 1・卡關 0・完成 1')
  await widget.unmount()

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect(await ui.find({ type: 'Markdown', text: /8080/ })).toBeUndefined()
  await ui.press({ key: 'cheats' })
  expect(await ui.find({ type: 'Markdown', text: /8080/ })).toBeTruthy()
  await ui.unmount()
})

test('英文的一般 Markdown 白板：介面與摘要都用英文，不提反引號規則', async ($, on) => {
  const opened: string[] = []
  world(on, { [WB]: { text: EN_BOARD, mtimeMs: 1 } }, opened)
  mock.clock(on)
  mock.store(on)
  await $.session.start({ cwd: ROOT, surface: 'terminal', isInteractive: true })

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...BAND, surface })
    expect((await ui.find({ type: 'Text', text: /Whiteboard/ }))?.text).toBe('📋 Whiteboard')
    expect((await ui.find({ type: 'Text', text: /Doing/ }))?.text).toBe('Doing 1 · To do 1 · Blocked 0 · Done 1')
    await ui.press({ key: 'wb-toggle' })
    expect(await ui.find({ type: 'Markdown', text: /\*\*Goal\*\*: ship v1/ })).toBeTruthy()
    expect(await ui.find({ type: 'Markdown', text: /\*\*Last update\*\*: 2026-01-05/ })).toBeTruthy()
    expect(await ui.find({ type: 'Markdown', text: /^• Fix the login bug {2}@alice #web$/ })).toBeTruthy()
    expect((await ui.find({ type: 'Text', text: /done/ }))?.text).toBe('✅ 1 done (the full panel lists them)')
    await ui.press({ key: 'wb-toggle' })
    await ui.unmount()
  }

  const text = (await $.prompt.context({ blocks: [] })).blocks[0]?.text ?? ''
  expect(text).toContain('Shared whiteboard WHITEBOARD.md')
  expect(text).not.toContain('backtick')
  expect(text).toContain('Goal: ship v1')
  expect(text).toContain('Doing (1): Fix the login bug (@alice #web)')
  expect(text).toContain('To do (1): Write docs (@bob)')
  expect(text).toContain('Blocked (0): none')
  expect(text).not.toContain('Safari')

  const pane = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect((await pane.find({ type: 'Text', text: /^📋 To do/ }))?.text).toBe('📋 To do (1)')
  expect(await pane.find({ type: 'Markdown', text: /repro on Safari/ })).toBeTruthy()
  await pane.unmount()
})

test('只用中文標題、沒有看板段落的一般 Markdown 也讀得懂，小抄不會被算成卡片', async ($, on) => {
  const opened: string[] = []
  world(on, { [WB]: { text: ZH_PLAIN, mtimeMs: 1 } }, opened)
  mock.clock(on)
  mock.store(on)
  await $.session.start({ cwd: ROOT, surface: 'desktop', isInteractive: true })

  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect((await ui.find({ type: 'Text', text: /進行/ }))?.text).toBe('進行 1・待辦 0・卡關 1・完成 0')
  await ui.unmount()

  const text = (await $.prompt.context({ blocks: [] })).blocks[0]?.text ?? ''
  expect(text).toContain('目標：月底上線')
  expect(text).not.toContain('反引號')
  expect(text).toContain('卡關／待決策（1）：[B2] 等合約（@erin）')
  expect(text).toContain('已完成（0）：無')
  expect(text).not.toContain('等對方回覆') // 粗體後面那段不是標題
})

test('摘要有上限：已完成只列前 10 張，白板太長就截斷並註明', async ($, on) => {
  const opened: string[] = []
  const done = Array.from({ length: 12 }, (_, i) => `- **[D${i + 1}] 做完的事**`).join('\n')
  const long = ['## 📍 CURRENT_FOCUS', `- **很長**：${'字'.repeat(7000)}`, '## 🃏 KANBAN', '### ✅ DONE', done].join('\n')
  const files: Files = { [WB]: { text: ['## 🃏 KANBAN', '### ✅ DONE', done].join('\n'), mtimeMs: 1 } }
  world(on, files, opened)
  const clock = mock.clock(on)
  mock.store(on)
  await $.session.start({ cwd: ROOT, surface: 'desktop', isInteractive: true })

  const first = (await $.prompt.context({ blocks: [] })).blocks[0]?.text ?? ''
  expect(first).toContain('已完成（12）：[D1] 做完的事；')
  expect(first).toContain('[D10] 做完的事；……另 2 張')
  expect(first).not.toContain('[D11]')

  files[WB] = { text: long, mtimeMs: 2 }
  await clock.advance(3000)
  const cut = (await $.prompt.context({ blocks: [] })).blocks[0]?.text ?? ''
  expect(Array.from(cut).length).toBeLessThan(6100)
  expect(cut).toContain('（白板太長，摘要到此截斷；完整內容請讀白板檔）')
})

test('/whiteboard-init 在沒有白板的專案建中文範本，橫條隨即出現；已經有白板就不覆蓋', async ($, on) => {
  const opened: string[] = []
  const files: Files = {}
  world(on, files, opened, 'C:/fresh')
  mock.clock(on)
  mock.store(on)
  await $.session.start({ cwd: 'C:/fresh', surface: 'desktop', isInteractive: true })

  const made = await $.command.run({ command: 'whiteboard-init', ...RUN })
  expect(made.text).toMatch(/已建立白板：C:\/fresh\/WHITEBOARD\.md/)
  expect(files['C:/fresh/WHITEBOARD.md']?.text).toBe(TEMPLATE_ZH)

  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect((await ui.find({ type: 'Text', text: /進行/ }))?.text).toBe('進行 0・待辦 1・卡關 0・完成 0')
  await ui.unmount()

  const text = (await $.prompt.context({ blocks: [] })).blocks[0]?.text ?? ''
  expect(text).toContain('主目標：（一句話：這個專案現在最重要的事）')
  expect(text).toContain('待辦（1）：[T1] 第一張卡片：寫下要做的事（@負責人 #標籤）')
  expect(text).not.toContain('反引號') // 範本是一般 Markdown

  files['C:/fresh/WHITEBOARD.md'] = { text: 'changed by hand', mtimeMs: 200 }
  const again = await $.command.run({ command: 'whiteboard-init', ...RUN })
  expect(again.text).toMatch(/已經有白板了，沒有覆蓋/)
  expect(files['C:/fresh/WHITEBOARD.md']?.text).toBe('changed by hand')
})

test('/whiteboard-init en 建英文範本，介面跟著變英文；在 worktree 裡建在主資料夾', async ($, on) => {
  const opened: string[] = []
  const files: Files = {}
  world(on, files, opened, 'C:/fresh/.claude/worktrees/calm-river')
  mock.clock(on)
  mock.store(on)
  await $.session.start({ cwd: 'C:/fresh/.claude/worktrees/calm-river', surface: 'desktop', isInteractive: true })

  const made = await $.command.run({ command: 'whiteboard-init', ...RUN, args: 'en' })
  expect(made.text).toMatch(/^Created C:\/fresh\/WHITEBOARD\.md/)
  expect(files['C:/fresh/WHITEBOARD.md']?.text).toBe(TEMPLATE_EN)

  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect((await ui.find({ type: 'Text', text: /Doing/ }))?.text).toBe('Doing 0 · To do 1 · Blocked 0 · Done 0')
  await ui.unmount()

  const pane = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect((await pane.find({ type: 'Text', text: /^Source:/ }))?.text).toBe('Source: C:/fresh/WHITEBOARD.md')
  expect(await pane.find({ key: 'cheats' })).toBeTruthy()
  await pane.unmount()
})
