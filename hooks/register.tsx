import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, Timer } from 'claude-code'

import type { WhiteboardCard, WhiteboardColumn, WhiteboardLang, WhiteboardView } from '../types'
import { TEMPLATE_EN, TEMPLATE_ZH } from './templates'

/* 白板 whiteboard v1.0：把專案根目錄的 WHITEBOARD.md（跨對話共用的白板）帶進每一個對話。
   · 畫面：輸入框正上方一條橫條（AbovePrompt，桌面、手機、終端機都有）。預設縮小成一行：四欄各幾張；
     按「展開」列出焦點與進行中／待辦／卡關的卡片標題，再按「縮小」收回。展開或縮小記在 $.store，
     新對話照上次的樣子。引擎自己在橫條旁畫的 [-] 可以把整條收起來。完整內容在側邊面板（橫條的「完整面板」或 /whiteboard-panel）。
   · AI：每個對話的第一則訊息前面帶一份白板摘要（prompt.context，跟 CLAUDE.md 同一個地方），
     AI 不用自己去讀；摘要是對話開始時的快照，之後白板可能被別的對話改過，所以摘要裡寫明改卡片前先重讀。
     摘要最多 CONTEXT_MAX 字，已完成欄只列前 CONTEXT_DONE_MAX 張，白板再長也不會吃掉對話開頭。
   · 從這個對話的工作資料夾往上找 WHITEBOARD.md。開在 git worktree（…/.claude/worktrees/<名>）裡時，
     改讀主工作資料夾那份：白板只有一份。
   · 每 3 秒看一次檔案的修改時間與大小，變了才重讀，別的對話一存檔，橫條幾秒內就更新。
   · 只讀白板、不連網路。唯一會寫檔的是使用者自己下的 /whiteboard-init（往上找得到白板就不寫）。
   · 格式：一般 Markdown；也讀得懂 JS 包住的版本（window.__X__ = String.raw`…`，內文反引號寫成 \`，
     給要在瀏覽器直接打開白板的專案用）。介面語言跟著白板內容：有中文用中文，否則英文。
   · 找不到白板的專案：沒有橫條、不帶摘要。 */

const PANE = 'whiteboard'
const FILE = 'WHITEBOARD.md'
// /whiteboard 是 Claude Code 內建的指令名稱，登記會被拒、呼叫它的 hook 整個被跳過（plugin validate 抓到）
const COMMAND = 'whiteboard-panel'
const INIT = 'whiteboard-init'
const POLL_MS = 3000
const STORE_EXPANDED = 'bandExpanded'
const CONTEXT_MAX = 6000
const CONTEXT_DONE_MAX = 10

// 欄位改了就換 shape 的標籤：舊版存下的值在重載後還在，標籤不同就不會被拿來畫（board-2：加了 lang、wrapped）
const board = atom({ plugin: 'whiteboard', key: 'board' } as const, null, { shape: 'board-2' })
const showCheats = atom({ plugin: 'whiteboard', key: 'showCheats' } as const, false, { shape: 'cheats-1' })
const bandExpanded = atom({ plugin: 'whiteboard', key: 'bandExpanded' } as const, false, { shape: 'band-1' })

type ColumnKey = 'DOING' | 'TODO' | 'BLOCKED' | 'DONE'

// 欄位標題裡出現這些字之一就算那一欄（不分大小寫）
const COLUMNS: readonly { key: ColumnKey; names: readonly string[] }[] = [
  { key: 'DOING', names: ['DOING', 'IN PROGRESS', '正在做', '進行中'] },
  { key: 'TODO', names: ['TODO', 'TO DO', 'TO-DO', '待辦'] },
  { key: 'BLOCKED', names: ['BLOCKED', '卡關', '待決策'] },
  { key: 'DONE', names: ['DONE', '已完成'] },
]
const FOCUS_NAMES = ['CURRENT_FOCUS', 'FOCUS', '焦點']
const KANBAN_NAMES = ['KANBAN', '看板']
const CHEAT_NAMES = ['CHEATSHEET', 'CHEAT SHEET', '小抄']
// 欄裡的佔位行（「- （目前無）」「- (none)」）不是卡片
const PLACEHOLDER = /^[（(][^（()）]*[）)]$|^(?:none|n\/a|無|目前無|暫無)$/i

const TEXT = {
  zh: {
    title: '白板',
    band: '📋 白板',
    expand: '展開',
    collapse: '縮小',
    full: '完整面板',
    columns: { DOING: '🔥 正在做', TODO: '📋 待辦', BLOCKED: '🚧 卡關／待決策', DONE: '✅ 已完成' },
    counts: { DOING: '進行', TODO: '待辦', BLOCKED: '卡關', DONE: '完成' },
    countSep: '・',
    bullet: '・',
    tagGap: '　',
    focusSep: '：',
    doneHint: (n: number) => `✅ 已完成 ${n} 張（完整面板看全部）`,
    empty: '目前沒有',
    cheatsOpen: (n: number) => `看小抄（${n} 條）`,
    cheatsClose: '收起小抄',
    source: (p: string) => `來源：${p}`,
    loading: '正在讀白板…',
    missing: '讀不到白板檔（可能被移走或改名）',
    unreadable: '白板格式讀不懂（找不到焦點與卡片）',
    failed: (err: string) => `讀白板失敗：${err}`,
    opened: (p: string) => `白板完整面板已打開：${p}`,
    created: (p: string) => `已建立白板：${p}。輸入框上方的橫條幾秒內出現；照檔案開頭的註解填就行。`,
    ctxHead: (p: string) => `共用白板 ${FILE}（專案根目錄，${p}）在本對話開始時的摘要。`,
    ctxRules: '白板所有對話共用：做完一件事就更新自己負責的卡片；改前先重讀檔案、改完立刻存（這份摘要可能已經舊了）；別人負責的卡片不改內容',
    ctxEscape: '；內文的反引號要寫成 \\`',
    ctxEnd: '。',
    ctxTags: (t: string) => `（${t}）`,
    ctxItemSep: '；',
    ctxNone: '無',
    ctxColumn: (label: string, n: number, items: string) => `${label}（${n}）：${items}`,
    ctxMore: (n: number) => `……另 ${n} 張`,
    ctxCut: '（白板太長，摘要到此截斷；完整內容請讀白板檔）',
  },
  en: {
    title: 'Whiteboard',
    band: '📋 Whiteboard',
    expand: 'Expand',
    collapse: 'Collapse',
    full: 'Full panel',
    columns: { DOING: '🔥 Doing', TODO: '📋 To do', BLOCKED: '🚧 Blocked', DONE: '✅ Done' },
    counts: { DOING: 'Doing', TODO: 'To do', BLOCKED: 'Blocked', DONE: 'Done' },
    countSep: ' · ',
    bullet: '• ',
    tagGap: '  ',
    focusSep: ': ',
    doneHint: (n: number) => `✅ ${n} done (the full panel lists them)`,
    empty: 'Nothing here',
    cheatsOpen: (n: number) => `Show cheat sheet (${n})`,
    cheatsClose: 'Hide cheat sheet',
    source: (p: string) => `Source: ${p}`,
    loading: 'Reading the whiteboard…',
    missing: 'Cannot read the whiteboard file (moved or renamed?)',
    unreadable: 'Cannot read the whiteboard format (no focus lines or cards found)',
    failed: (err: string) => `Failed to read the whiteboard: ${err}`,
    opened: (p: string) => `Opened the whiteboard panel: ${p}`,
    created: (p: string) => `Created ${p}. The band shows up above the prompt in a few seconds; fill it in as the comment at the top says.`,
    ctxHead: (p: string) => `Shared whiteboard ${FILE} (project root, ${p}) as of the start of this conversation.`,
    ctxRules: 'Every conversation shares this whiteboard: when you finish something, update the cards you own; re-read the file right before editing and save right away (this summary may be out of date); do not change cards owned by others',
    ctxEscape: '; inside the file, write every backtick as \\`',
    ctxEnd: '.',
    ctxTags: (t: string) => ` (${t})`,
    ctxItemSep: '; ',
    ctxNone: 'none',
    ctxColumn: (label: string, n: number, items: string) => `${label} (${n}): ${items}`,
    ctxMore: (n: number) => `…and ${n} more`,
    ctxCut: '(The whiteboard is too long; the summary stops here. Read the file for the rest.)',
  },
} as const

// 還沒讀到白板內容時（找不到、還在讀）兩種語言都說
const BOTH = {
  notFound: (cwd: string) =>
    `這個專案找不到 ${FILE}（從 ${cwd} 往上找過）。輸入 /${INIT} 建一份白板範本。\n` +
    `No ${FILE} found in or above ${cwd}. Run /${INIT} en to create one from the template.`,
  exists: (p: string) => `已經有白板了，沒有覆蓋：${p}\nA whiteboard already exists, left untouched: ${p}`,
  createFailed: (err: string) => `建立白板失敗：${err}\nCould not create the whiteboard: ${err}`,
  failed: (err: string) => `白板指令出錯：${err}\nThe whiteboard command failed: ${err}`,
}
const brief = (err: unknown): string => String(err).slice(0, 160)

const escapeRe = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const anyOf = (names: readonly string[]): string => names.map(escapeRe).join('|')

/** 解析白板：拿掉 JS 包裝（有的話）與註解、還原 \`，切出焦點、四欄卡片、小抄，並決定介面語言。 */
function parseWhiteboard(raw: string): Pick<WhiteboardView, 'lang' | 'wrapped' | 'focus' | 'columns' | 'cheats'> {
  const text = raw.replace(/\r\n?/g, '\n')
  const wrappedMatch = text.match(/String\.raw`([\s\S]*)`\s*;?\s*$/)
  const body = wrappedMatch ? (wrappedMatch[1] ?? '').replace(/\\`/g, '`') : text
  const md = body.replace(/<!--[\s\S]*?-->/g, '')
  const lang: WhiteboardLang = /[㐀-鿿豈-﫿]/.test(md) ? 'zh' : 'en'
  const t = TEXT[lang]

  // 二級標題的段落。看板段要包住底下的三級欄位標題；焦點與小抄遇到任何標題就停
  const section = (names: readonly string[], keepSubheadings: boolean): string => {
    const end = keepSubheadings ? '(?=\\n## |$)' : '(?=\\n#{1,6} |$)'
    const m = md.match(new RegExp('(?:^|\\n)## [^\\n]*(?:' + anyOf(names) + ')[\\s\\S]*?' + end, 'i'))
    return m ? m[0] : ''
  }

  const focus = section(FOCUS_NAMES, false).split('\n').flatMap((line) => {
    const s = line.trim()
    const m = s.match(/^[-*+]\s+\*\*(.+?)\*\*\s*[：:]\s*(.+)$/) ?? s.match(/^[-*+]\s+\*\*(.+?)[：:]\*\*\s*(.+)$/)
    return m ? [{ label: m[1] ?? '', value: m[2] ?? '' }] : []
  })

  // 沒有看板標題的白板：欄位直接寫在文件裡也找得到
  const kanban = section(KANBAN_NAMES, true) || md
  const columns: WhiteboardColumn[] = COLUMNS.map(({ key, names }) => {
    const m = kanban.match(new RegExp('(?:^|\\n)#{2,3} [^\\n]*(?:' + anyOf(names) + ')[\\s\\S]*?(?=\\n#{1,3} |\\n---|$)', 'i'))
    const cards: WhiteboardCard[] = []
    let cur: WhiteboardCard | null = null
    for (const line of (m ? m[0] : '').split('\n')) {
      const top = line.match(/^[-*+]\s+(.+)$/) // 不縮排的項目：一張卡
      if (top) {
        if (cur) cards.push(cur)
        cur = null
        const item = (top[1] ?? '').trim()
        if (PLACEHOLDER.test(item)) continue
        const bold = item.match(/^\*\*(.+?)\*\*/)
        const tags = [...item.matchAll(/`([^`]+)`/g)].map((g) => g[1] ?? '')
        const plain = item.replace(/`[^`]*`/g, ' ').replace(/\s{2,}/g, ' ').trim()
        cur = { title: bold?.[1] ?? (plain || item), tags, desc: [] }
        continue
      }
      const sub = line.match(/^\s+[-*+]\s+(.+)$/) // 縮排的項目：上一張卡的說明
      if (cur && sub) cur.desc.push((sub[1] ?? '').trim())
    }
    if (cur) cards.push(cur)
    return { key, label: t.columns[key], cards }
  })

  const cheats = section(CHEAT_NAMES, false)
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => /^[-*+]\s/.test(l))
    .map((l) => l.replace(/^[-*+]\s+/, ''))
  return { lang, wrapped: Boolean(wrappedMatch), focus, columns, cheats }
}

/** 白板該放在哪個資料夾：工作資料夾；在 worktree 裡就是主工作資料夾。 */
function baseDir(cwd: string): string {
  const norm = cwd.replace(/\\/g, '/').replace(/\/+$/, '')
  const worktree = norm.match(/^(.*?)\/\.claude\/worktrees\/[^/]+(?:\/|$)/)
  return worktree?.[1] ?? norm
}

/** 從工作資料夾往上找白板；在 worktree 裡就從主工作資料夾開始找。 */
async function locate($: EngineInterface, cwd: string): Promise<string | null> {
  let dir = baseDir(cwd)
  for (let i = 0; i < 12 && dir; i++) {
    const path = `${dir}/${FILE}`
    if (await $.fs.exists(path).catch(() => false)) return path
    const cut = dir.lastIndexOf('/')
    if (cut <= 0) break
    dir = dir.slice(0, cut)
  }
  return null
}

let lastSeen = ''                        // 上次讀到的「路徑｜修改時間｜大小」：沒變就不重讀
let latest: WhiteboardView | null = null // 給 prompt.context 與指令用的最新內容（狀態值只在畫面裡讀）
let timer: Timer | null = null

const errorView = (path: string, mtimeMs: number, error: (t: (typeof TEXT)[WhiteboardLang]) => string): WhiteboardView => {
  const lang = latest?.lang ?? 'zh'
  return { path, mtimeMs, lang, wrapped: false, focus: [], columns: [], cheats: [], error: error(TEXT[lang]) }
}

async function load($: EngineInterface, path: string): Promise<void> {
  const stat = await $.fs.stat(path).catch(() => null)
  if (!stat) {
    if (lastSeen === `${path}|missing`) return
    lastSeen = `${path}|missing`
    latest = errorView(path, 0, (t) => t.missing)
    await update($, board, () => latest)
    return
  }
  const seen = `${path}|${stat.mtimeMs}|${stat.size}`
  if (seen === lastSeen) return
  lastSeen = seen
  let view: WhiteboardView
  try {
    view = { path, mtimeMs: stat.mtimeMs, ...parseWhiteboard(await $.fs.read(path)) }
    if (view.focus.length === 0 && view.columns.every((c) => c.cards.length === 0)) {
      view = { ...view, error: TEXT[view.lang].unreadable }
    }
  } catch (err) {
    view = errorView(path, stat.mtimeMs, (t) => t.failed(brief(err)))
  }
  latest = view
  await update($, board, () => view)
}

async function start($: EngineInterface, path: string): Promise<void> {
  await load($, path)
  timer?.cancel()
  timer = $.clock.every(POLL_MS, () => { void load($, path) })
}

const countOf = (view: WhiteboardView, key: ColumnKey): number => view.columns.find((c) => c.key === key)?.cards.length ?? 0
const countsLine = (view: WhiteboardView): string => {
  const t = TEXT[view.lang]
  return COLUMNS.map(({ key }) => `${t.counts[key]} ${countOf(view, key)}`).join(t.countSep)
}

/** 放在每個對話第一則訊息前面的白板摘要：規則、焦點、每張卡的標題與負責人（描述不帶，省 token）。 */
function contextText(view: WhiteboardView): string {
  const t = TEXT[view.lang]
  const lines = [
    t.ctxHead(view.path),
    t.ctxRules + (view.wrapped ? t.ctxEscape : '') + t.ctxEnd,
    ...view.focus.map((f) => `${f.label}${t.focusSep}${f.value}`),
    ...view.columns.map((c) => {
      const label = c.label.replace(/^\S+\s/, '')
      const shown = c.key === 'DONE' ? c.cards.slice(0, CONTEXT_DONE_MAX) : c.cards
      const items = shown.map((card) => card.title + (card.tags.length ? t.ctxTags(card.tags.join(' ')) : ''))
      if (c.cards.length > shown.length) items.push(t.ctxMore(c.cards.length - shown.length))
      return t.ctxColumn(label, c.cards.length, items.length ? items.join(t.ctxItemSep) : t.ctxNone)
    }),
  ]
  const text = lines.join('\n')
  const chars = Array.from(text)
  return chars.length > CONTEXT_MAX ? chars.slice(0, CONTEXT_MAX).join('') + '\n' + t.ctxCut : text
}

/** /whiteboard-panel：找到白板就打開完整面板。 */
async function openPanel($: EngineInterface): Promise<{ text: string }> {
  const cwd = await $.session.cwd()
  const path = await locate($, cwd)
  if (!path) return { text: BOTH.notFound(cwd) }
  lastSeen = ''
  await start($, path)
  const t = TEXT[latest?.lang ?? 'zh']
  await $.ui.open({ id: PANE, title: t.title })
  return { text: t.opened(path) }
}

/** /whiteboard-init [zh|en]：往上找不到白板，才在專案根目錄（worktree 時是主資料夾）寫一份範本。 */
async function createBoard($: EngineInterface, args: string): Promise<{ text: string }> {
  const cwd = await $.session.cwd()
  const found = await locate($, cwd)
  if (found) return { text: BOTH.exists(found) }
  const lang: WhiteboardLang = /^\s*en/i.test(args) ? 'en' : 'zh'
  const target = `${baseDir(cwd)}/${FILE}`
  const failed = await $.fs.write(target, lang === 'en' ? TEMPLATE_EN : TEMPLATE_ZH).then(
    () => '',
    (err: unknown) => brief(err),
  )
  if (failed) return { text: BOTH.createFailed(failed) }
  lastSeen = ''
  await start($, target)
  return { text: TEXT[lang].created(target) }
}

export const register: Register = (on) => {
  on('session.start', async ($, e, next) => {
    // 登記失敗（例如名稱被占用）不能連累白板
    await $.command.register({ name: COMMAND, description: 'Open the full whiteboard panel (WHITEBOARD.md)／打開白板完整面板' }).catch(() => undefined)
    await $.command
      .register({ name: INIT, description: 'Create WHITEBOARD.md here from the template／在這個專案建立白板範本', argumentHint: '[zh|en]' })
      .catch(() => undefined)
    const stored = await $.store.get(STORE_EXPANDED).catch(() => undefined)
    await update($, bandExpanded, () => stored === true)
    lastSeen = '' // 重載或新對話一律重讀一次
    latest = null
    const path = await locate($, e.cwd)
    if (path) await start($, path)
    return next(e)
  })

  // 每個對話一開始就帶著白板：跟 CLAUDE.md 一樣放在第一則訊息前面（每個對話一次，壓縮或 /clear 後再一次）
  on('prompt.context', async ($, e, next) => {
    const result = await next(e)
    if (!latest) {
      const path = await locate($, await $.session.cwd())
      if (path) await load($, path)
    }
    if (!latest || latest.error) return result
    return { ...result, blocks: [...result.blocks, { name: 'whiteboard', text: contextText(latest) }] }
  })

  on('command.run', { command: COMMAND }, ($) =>
    openPanel($).catch((err: unknown) => ({ text: BOTH.failed(brief(err)) })),
  )

  // 使用者自己下的指令才寫檔；往上找得到任何一份白板就不寫
  on('command.run', { command: INIT }, ($, e) =>
    createBoard($, e.args).catch((err: unknown) => ({ text: BOTH.failed(brief(err)) })),
  )

  // 輸入框上方的橫條：縮小時一行，展開時列出焦點與卡片標題
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const view = await read($, board)
    if (!view || view.error || e.props.hasSurvey) return next(e)
    const t = TEXT[view.lang]
    const { Box, Text, Markdown, Button } = $.ui.resolve(e)
    const expanded = await read($, bandExpanded)
    // 按鈕的處理一律馬上返回，慢的事（存設定、開面板）不等：引擎給按鈕處理 10 秒，
    // 對話正忙（AI 在跑工具）時存設定、開面板可能排很久，等它們就會整個被跳過（2026-11-22 實際發生過）。
    const toggle = (): void => {
      void update($, bandExpanded, (v) => !v).catch(() => undefined)
      void $.store.set(STORE_EXPANDED, !expanded).catch(() => undefined)
    }
    const openFull = (): void => { void $.ui.open({ id: PANE, title: t.title }).catch(() => undefined) }
    const head = (
      <Box key="wb-head" flexDirection="row" gap={1}>
        <Text bold>{t.band}</Text>
        <Text dimColor>{countsLine(view)}</Text>
        <Button key="wb-toggle" plain label={expanded ? t.collapse : t.expand} onPress={toggle} />
        {expanded && <Button key="wb-pane" plain label={t.full} onPress={openFull} />}
      </Box>
    )
    if (!expanded) return head
    return (
      <Box flexDirection="column">
        {head}
        {view.focus.map((f, i) => <Markdown key={`wb-focus-${i}`} text={`**${f.label}**${t.focusSep}${f.value}`} />)}
        {view.columns.filter((c) => c.key !== 'DONE').map((col) => (
          <Box key={`wb-col-${col.key}`} flexDirection="column">
            <Text bold>{col.label}{view.lang === 'zh' ? `（${col.cards.length}）` : ` (${col.cards.length})`}</Text>
            {col.cards.map((card, i) => (
              <Markdown key={`wb-card-${col.key}-${i}`} text={`${t.bullet}${card.title}${card.tags.length ? `${t.tagGap}${card.tags.join(' ')}` : ''}`} />
            ))}
          </Box>
        ))}
        <Text dimColor>{t.doneHint(countOf(view, 'DONE'))}</Text>
      </Box>
    )
  })

  // 完整面板（側邊）：焦點、四欄卡片含描述與標籤、小抄
  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text, Markdown, Button } = $.ui.resolve(e)
    const view = await read($, board)
    if (!view) return <Text dimColor>{TEXT[latest?.lang ?? 'zh'].loading}</Text>
    const t = TEXT[view.lang]
    if (view.error) {
      return (
        <Box flexDirection="column">
          <Text>{view.error}</Text>
          <Text dimColor>{view.path}</Text>
        </Box>
      )
    }
    if (e.props.placement === 'widget') {
      // 最小化的小卡：一眼看得懂就好，點擊不一定收得到
      return (
        <Box flexDirection="column">
          <Text bold>{t.title}</Text>
          <Text dimColor>{countsLine(view)}</Text>
        </Box>
      )
    }
    const cheatsOpen = await read($, showCheats)
    const count = (n: number): string => (view.lang === 'zh' ? `（${n}）` : ` (${n})`)
    return (
      <Box flexDirection="column" gap={1}>
        {view.focus.map((f, i) => (
          <Box key={`focus-${i}`} flexDirection="column">
            <Text dimColor>{f.label}</Text>
            <Markdown key={`focus-text-${i}`} text={f.value} />
          </Box>
        ))}
        {view.columns.map((col) => (
          <Box key={`col-${col.key}`} flexDirection="column" gap={1}>
            <Text bold>{col.label}{count(col.cards.length)}</Text>
            {col.cards.length === 0 && <Text dimColor>{t.empty}</Text>}
            {col.cards.map((card, i) => (
              <Box key={`card-${col.key}-${i}`} flexDirection="column" borderStyle="round" paddingX={1}>
                <Markdown key={`title-${col.key}-${i}`} text={`**${card.title}**`} />
                {card.desc.map((d, j) => <Markdown key={`desc-${col.key}-${i}-${j}`} text={d} dimColor />)}
                {card.tags.length > 0 && <Text dimColor>{card.tags.join(t.countSep)}</Text>}
              </Box>
            ))}
          </Box>
        ))}
        {view.cheats.length > 0 && (
          <Box flexDirection="column">
            <Button key="cheats" plain onPress={() => { void update($, showCheats, (v) => !v).catch(() => undefined) }}>
              {cheatsOpen ? t.cheatsClose : t.cheatsOpen(view.cheats.length)}
            </Button>
            {cheatsOpen && view.cheats.map((c, i) => <Markdown key={`cheat-${i}`} text={c} dimColor />)}
          </Box>
        )}
        <Text dimColor>{t.source(view.path)}</Text>
      </Box>
    )
  })
}
