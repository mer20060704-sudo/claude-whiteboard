# claude-whiteboard

讓同一個專案裡的每一個 Claude Code 對話，都看得到、也都會更新同一塊白板：專案根目錄的 `WHITEBOARD.md`。

[English](#english) is below.

## 它做什麼

- **輸入框上方的白板橫條**：預設縮成一行，顯示「進行・待辦・卡關・完成」各幾張；按「展開」看焦點與卡片標題，按「完整面板」看全部（含說明與小抄）。展開或縮小會記住，新對話照上次的樣子。
- **每個對話開頭自動帶白板摘要**：放在跟 `CLAUDE.md` 同一個地方，Claude 一開始就知道現在的焦點、誰在做什麼，也會被提醒「改卡片前先重讀、只改自己負責的卡」。
- **即時更新**：任何一個對話（或你自己）存檔後，其他對話的橫條幾秒內跟著變。
- **git worktree**：在 `.claude/worktrees/` 裡開的對話，讀主資料夾那一份，白板只有一份。

## 安裝

在 Claude Code 終端機的輸入框打：

```
/plugin install whiteboard --marketplace mer20060704-sudo/claude-whiteboard
```

先問 `Add marketplace?` 時按 `y`，再選安裝範圍（第一個是 user，按 Enter）。裝好後開一個新對話就看得到；已經開著的對話要重開。

從 shell 安裝：

```
claude plugin install whiteboard --marketplace mer20060704-sudo/claude-whiteboard
```

桌面 App：按輸入框旁邊的 **+**，選 **Plugins** → **Add marketplace**，填 `mer20060704-sudo/claude-whiteboard`，再按 **Add plugin**。在終端機以 user 範圍裝好的，桌面 App 的 Code 分頁也會載入。

## 開始用

1. 在專案的對話裡輸入 `/whiteboard-init`，會在專案根目錄建一份中文範本 `WHITEBOARD.md`（英文範本：`/whiteboard-init en`）。往上找得到白板就不會建、也不會覆蓋。
2. 照檔案開頭的註解填：焦點、四欄卡片、小抄。
3. 之後每個新對話都帶著白板；`/whiteboard-panel` 打開完整面板。

## 白板格式

一般的 Markdown，範本長這樣（節錄）：

```markdown
## 📍 CURRENT_FOCUS
- **主目標**：這個專案現在最重要的事
- **最後更新**：2026-01-05 09:00（誰改的）

## 🃏 KANBAN

### 🔥 DOING (正在做)
- （目前無）

### 📋 TODO (待辦)
- **[T1] 寫登入頁** `@alice` `#web`
  - 一行說明：做到哪裡算完成

### 🚧 BLOCKED (卡關／待決策)
### ✅ DONE (已完成)

## 📐 CHEATSHEET
- **常用指令**：`npm test`
```

- 焦點：每行 `- **標題**：內容`。
- 四欄：標題裡要有 `DOING`／`TODO`／`BLOCKED`／`DONE`，或中文的「正在做／待辦／卡關／已完成」。
- 卡片：不縮排的一行是一張卡，``- **卡片標題** `@負責人` `#標籤` ``；縮排兩格的項目是那張卡的說明。`- （目前無）`、`- (none)` 這種佔位行不算卡片。
- 小抄（`CHEATSHEET`）只在完整面板裡看，不進摘要。
- `<!-- 註解 -->` 不會出現在橫條和摘要裡，適合寫給人和 AI 看的白板規則。
- 介面語言跟著白板內容：有中文就用中文，否則英文。
- 也讀得懂用 JS 包住的版本（`window.__X__ = String.raw` 包住整份 Markdown，內文反引號寫成 `` \` ``），讓同一份檔案可以直接用瀏覽器打開。

## 隱私與資料

- 只讀你電腦上的 `WHITEBOARD.md`（從對話的工作資料夾往上找）。不連網路，不把任何東西傳到別的地方。
- 會寫檔的只有你自己下的 `/whiteboard-init`，而且找得到白板就不寫。
- 白板摘要會放進對話內容，跟 `CLAUDE.md` 一樣隨對話送給 Claude。**白板上不要寫金鑰、密碼或客戶個資。**
- 摘要最多 6000 字，已完成欄只列前 10 張，白板再長也不會吃掉對話的開頭。
- 本機只記一件事：橫條上次是展開還是縮小。

## 已知限制

- 需要支援 mods 的 Claude Code。在 Claude Code 2.1.330（Windows 桌面 App 與終端機）測過。
- 橫條固定在輸入框上方，由 Claude Code 決定位置；引擎在橫條旁的 `[-]` 可以把整條收起來。
- 摘要是對話開始時的快照；對話中途白板被別人改了，Claude 要重讀檔案才看得到（摘要裡已經提醒它）。

## 開發

```
claude plugin validate .
claude plugin test .
```

## 授權

MIT，見 [LICENSE](LICENSE)。

---

## English

Every Claude Code conversation in a project sees, and keeps up to date, the same whiteboard: a `WHITEBOARD.md` at the project root.

### What it does

- **A band above the prompt**: collapsed to one line by default, with the number of cards in Doing · To do · Blocked · Done. **Expand** shows the focus lines and card titles; **Full panel** shows everything, including details and the cheat sheet. The band remembers whether you left it expanded.
- **A summary at the start of every conversation**, in the same place as `CLAUDE.md`. Claude starts out knowing the current focus and who is doing what, and is told to re-read the file before editing and to change only the cards it owns.
- **Live updates**: when anyone saves the file, the band in every other conversation follows within seconds.
- **git worktrees**: a conversation opened in `.claude/worktrees/` reads the main folder's whiteboard, so there is only one.

### Install

At the prompt of a Claude Code terminal session:

```
/plugin install whiteboard --marketplace mer20060704-sudo/claude-whiteboard
```

Answer `y` to `Add marketplace?`, then pick a scope (user is first; press Enter). Start a new conversation to see it; conversations already open need a restart.

From a shell:

```
claude plugin install whiteboard --marketplace mer20060704-sudo/claude-whiteboard
```

In the desktop app: click **+** next to the prompt box, then **Plugins**, **Add marketplace** with `mer20060704-sudo/claude-whiteboard`, then **Add plugin**. A user-scope install from a terminal also loads in the desktop app's Code tab.

### Getting started

1. In a conversation in your project, run `/whiteboard-init en` to create an English `WHITEBOARD.md` template at the project root (`/whiteboard-init` alone writes the Chinese one). It never overwrites a whiteboard it can find.
2. Fill it in as the comment at the top of the file says: focus, four columns of cards, cheat sheet.
3. Every new conversation now starts with the whiteboard; `/whiteboard-panel` opens the full panel.

### Format

Plain Markdown:

- Focus: one `- **Label**: text` per line under `## 📍 CURRENT_FOCUS`.
- Columns: headings under `## 🃏 KANBAN` that contain `DOING`, `TODO`, `BLOCKED` and `DONE`.
- Cards: each top-level item is a card, ``- **Card title** `@owner` `#tag` ``; items indented two spaces are that card's details. Placeholders such as `- (none)` are not cards.
- The cheat sheet (`CHEATSHEET`) shows only in the full panel and stays out of the summary.
- `<!-- comments -->` never show in the band or the summary, so they are a good place for the whiteboard's rules.
- The interface follows the whiteboard's language: Chinese if it contains Chinese, English otherwise.
- A JS-wrapped whiteboard (`window.__X__ = String.raw` around the whole Markdown, with backticks written as `` \` ``) is read too, so the same file can be opened directly in a browser.

### Privacy and data

- It reads only the `WHITEBOARD.md` on your computer, found by walking up from the conversation's working folder. It makes no network calls and sends nothing anywhere.
- The only thing that writes a file is `/whiteboard-init`, run by you, and only when no whiteboard can be found.
- The summary goes into the conversation, and so to Claude, the same way `CLAUDE.md` does. **Never put keys, passwords or customer data on the whiteboard.**
- The summary is capped at 6,000 characters and lists only the first 10 done cards.
- The one thing it stores is whether you left the band expanded.

### Known limits

- Needs a Claude Code build with mods. Tested on Claude Code 2.1.330 (Windows desktop app and terminal).
- The band sits above the prompt where Claude Code places it; the engine's `[-]` beside it hides the whole band.
- The summary is a snapshot from the start of the conversation; Claude has to re-read the file to see later edits, and the summary tells it so.

### License

MIT, see [LICENSE](LICENSE).
