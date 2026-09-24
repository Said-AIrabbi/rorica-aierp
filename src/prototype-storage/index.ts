/**
 * 原型展示環境的遠端儲存（暫時性，非正式後端）。
 *
 * 目的：讓客戶在真正的後端出現以前，就能實際產生單據、關掉瀏覽器還在、同事看得到同一份資料。
 * 做法：把整包模擬資料當成「一包 JSON」存到伺服器，商業規則仍然跑在瀏覽器裡——
 * mutations.ts 那四千多行一行都不必動。
 *
 * 這整個資料夾是可拋棄的：真後端上線時刪掉它、把 data.ts 的存讀改回 sessionStorage 即可。
 * 詳見 repo 根目錄的 PROTOTYPE-HOSTING.md。
 */
import { toast } from 'sonner'

/** 沒有這個環境變數就是本機模式（GitHub Pages 即屬此類），行為與先前完全相同 */
export function isRemoteStorage(): boolean {
  // 可選鏈：測試與列印用的 SSR 建置不經 Vite 的環境變數注入，讀不到時一律視為本機模式
  return import.meta.env?.VITE_PROTOTYPE_STORAGE === 'remote'
}

const WORKSPACE_PATTERN = /^[a-z0-9-]{1,32}$/
const DEFAULT_WORKSPACE = 'demo'

/**
 * 工作區：同一個網站、不同代碼＝不同的一份資料，彼此不相干。
 * 業務組與生管組可以各練各的；換一個沒用過的代碼就是一份全新的種子資料，
 * 這也是「重置模擬資料」被移除後的替代做法——不會毀掉別人的進度。
 *
 * 取自網址的 ?ws=，且**必須寫在 # 之前**（本站用 HashRouter）：
 *   https://example.com/?ws=sales#/packing-notice
 */
export function workspaceId(): string {
  if (typeof window === 'undefined') return DEFAULT_WORKSPACE
  const raw = new URLSearchParams(window.location.search).get('ws')?.toLowerCase()
  return raw && WORKSPACE_PATTERN.test(raw) ? raw : DEFAULT_WORKSPACE
}

const endpoint = () => `/api/snapshot?ws=${encodeURIComponent(workspaceId())}`

/** 目前這份資料在伺服器上的版本；每次成功寫入加一，用來偵測「有人搶先改了」 */
let baseVersion = 0

/** 伺服器上還沒有資料時回 undefined，呼叫端即沿用種子資料 */
export async function loadRemoteSnapshot(): Promise<unknown | undefined> {
  const res = await fetch(endpoint(), { headers: { Accept: 'application/json' } })
  if (!res.ok) throw new Error(`讀取失敗（${res.status}）`)
  const body = (await res.json()) as { version: number; snapshot: unknown | null }
  baseVersion = body.version
  return body.snapshot ?? undefined
}

// ---------- 寫入：合併、排隊、離開頁面前補送 ----------

let buildSnapshot: (() => unknown) | undefined
let saveTimer: ReturnType<typeof setTimeout> | undefined
let inFlight = false
/** 寫入途中又有異動：記下來，等這次寫完立刻再送一次，不要漏掉最後一筆 */
let pendingAfterFlight = false
let conflicted = false

const SAVE_DEBOUNCE_MS = 600

/** 由 data.ts 在啟動時註冊「怎麼組出目前的快照」，避免這個模組反向依賴資料層的細節 */
export function registerSnapshotSource(fn: () => unknown): void {
  buildSnapshot = fn
}

/**
 * 有人搶先寫入時的處理：停止後續所有寫入，請使用者重新載入。
 *
 * 不自動重整——使用者可能正在打字，畫面突然跳掉比衝突本身更糟；
 * 但也不能繼續存，否則會把對方剛存的東西蓋掉。故就地凍結寫入並持續提示。
 */
function handleConflict(): void {
  if (conflicted) return
  conflicted = true
  toast.error('這份資料已被其他人更新，你之後的修改將不會儲存。請重新載入頁面再繼續。', {
    duration: Infinity,
    action: { label: '重新載入', onClick: () => window.location.reload() },
  })
}

async function flush(): Promise<void> {
  if (conflicted || inFlight || !buildSnapshot) return
  inFlight = true
  try {
    const res = await fetch(endpoint(), {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ baseVersion, snapshot: buildSnapshot() }),
    })
    if (res.status === 409) {
      handleConflict()
      return
    }
    if (!res.ok) throw new Error(`儲存失敗（${res.status}）`)
    baseVersion = ((await res.json()) as { version: number }).version
  } catch (error) {
    // 網路斷線等暫時性失敗：不擋使用者操作，下一次異動會連同這次的內容一起送出
    console.warn('[prototype-storage] 儲存失敗，將於下次異動時重試', error)
  } finally {
    inFlight = false
    if (pendingAfterFlight) {
      pendingAfterFlight = false
      void flush()
    }
  }
}

/**
 * 每次 mutation 後呼叫。合併 600ms 內的連續異動——
 * 一個操作常觸發好幾次寫入（例如表1 生效會連帶建立表2 與表8 草稿），
 * 逐次上傳 240KB 既慢又沒必要。
 */
export function scheduleRemoteSave(): void {
  if (conflicted) return
  if (inFlight) {
    pendingAfterFlight = true
    return
  }
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    saveTimer = undefined
    void flush()
  }, SAVE_DEBOUNCE_MS)
}

/** 關閉分頁前把還沒送出的異動補送，否則使用者最後一個動作會憑空消失 */
export function installFlushOnLeave(): void {
  if (typeof window === 'undefined') return
  window.addEventListener('pagehide', () => {
    if (conflicted || !buildSnapshot || (!saveTimer && !inFlight && !pendingAfterFlight)) return
    // 卸載中不能等 Promise，改用 sendBeacon：瀏覽器會在頁面關掉後自己把請求送完
    const payload = JSON.stringify({ baseVersion, snapshot: buildSnapshot() })
    navigator.sendBeacon?.(endpoint(), new Blob([payload], { type: 'application/json' }))
  })
}
