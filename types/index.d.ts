export type WhiteboardLang = 'zh' | 'en'
export type WhiteboardFocus = { label: string; value: string }
export type WhiteboardCard = { title: string; tags: string[]; desc: string[] }
export type WhiteboardColumn = { key: string; label: string; cards: WhiteboardCard[] }
export type WhiteboardView = {
  path: string
  mtimeMs: number
  /** 介面語言：白板內容有中文就是 zh，否則 en */
  lang: WhiteboardLang
  /** 檔案是不是用 JS 包住的版本（window.__X__ = String.raw`…`）：是的話內文反引號要寫成 \` */
  wrapped: boolean
  focus: WhiteboardFocus[]
  columns: WhiteboardColumn[]
  cheats: string[]
  error?: string
}

declare module 'claude-code' {
  interface PluginState {
    whiteboard: {
      board: Shaped<WhiteboardView | null>
      showCheats: Shaped<boolean>
      bandExpanded: Shaped<boolean>
    }
  }
}
