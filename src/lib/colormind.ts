/**
 * ColorMind 預測（選色系統）在瀏覽器端的流程，後端在 api/colormind/、帶回頁在 public/colormind-return.html。
 *
 *   ① 電腦色號區塊按「ColorMind 預測」→ 先開好新分頁（避免被擋彈出視窗），再請後端簽發預測頁連結
 *   ② 新分頁前往 ColorMind，使用者確認配方後按「帶回配方」
 *   ③ 回到 colormind-return.html：後端用短碼換配方，結果透過 BroadcastChannel 交回原分頁
 *   ④ 原分頁列出各組配方，使用者選一組帶入 HEX／CMYK（LAB 維持原值），再自行儲存
 *
 * 只在設定 VITE_COLORMIND_ENABLED=true 的環境顯示按鈕（GitHub Pages 是純靜態網站，沒有後端可代呼叫）。
 */

export interface ColorMindRecipe {
  序號: number
  C: number
  M: number
  Y: number
  K: number
  R: number
  G: number
  B: number
}

export interface ColorMindResult {
  色樣名稱: string
  L: number
  a: number
  b: number
  recipes: ColorMindRecipe[]
}

export const isColorMindEnabled = (): boolean => import.meta.env.VITE_COLORMIND_ENABLED === 'true'

const CHANNEL = 'rorica-colormind'
const STORAGE_KEY = 'rorica-colormind-result'

function newRequestId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(12))
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/** 開啟 ColorMind 預測頁；成功回傳請求代號，用來等結果 */
export async function startColorMindPrediction(input: { name: string; lab: { l: number; a: number; b: number } }): Promise<string> {
  // 必須在使用者點擊的同一個事件裡開窗，否則會被當成彈出廣告擋掉；網址稍後再填
  const win = window.open('', '_blank')
  if (!win) throw new Error('瀏覽器擋下了新分頁，請允許本站開啟彈出視窗後再試')
  win.opener = null
  win.document.title = 'ColorMind 預測'
  win.document.body.textContent = '正在開啟 ColorMind 預測畫面…'

  const req = newRequestId()
  try {
    const r = await fetch('/api/colormind/launch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: input.name, l: input.lab.l, a: input.lab.a, b: input.lab.b, req }),
    })
    const body = (await r.json().catch(() => null)) as { launch_url?: string; error?: string } | null
    if (!r.ok || !body?.launch_url) throw new Error(body?.error ?? `開啟 ColorMind 失敗（${r.status}）`)
    // launch_url 只能成功打開一次：整段交給分頁，不截斷
    win.location.replace(body.launch_url)
    return req
  } catch (error) {
    win.close()
    throw error instanceof Error ? error : new Error(String(error))
  }
}

type Outcome = { result: ColorMindResult } | { error: string }

/** 等某個請求代號的結果；回傳取消函式 */
export function onColorMindResult(req: string, cb: (outcome: Outcome) => void): () => void {
  let done = false
  const handle = (data: unknown) => {
    const m = data as { type?: unknown; req?: unknown; result?: ColorMindResult; error?: unknown } | null
    if (done || m?.type !== 'colormind-result' || m.req !== req) return
    if (m.result && Array.isArray(m.result.recipes)) {
      done = true
      cb({ result: m.result })
    } else if (typeof m.error === 'string') {
      done = true
      cb({ error: m.error })
    }
  }
  let channel: BroadcastChannel | undefined
  try {
    channel = new BroadcastChannel(CHANNEL)
    channel.onmessage = (e) => handle(e.data)
  } catch {
    // 不支援 BroadcastChannel 時靠下面的 storage 事件
  }
  const onStorage = (e: StorageEvent) => {
    if (e.key !== STORAGE_KEY || !e.newValue) return
    try {
      handle(JSON.parse(e.newValue))
    } catch {
      // 內容壞掉就忽略
    }
  }
  window.addEventListener('storage', onStorage)
  return () => {
    done = true
    channel?.close()
    window.removeEventListener('storage', onStorage)
  }
}

export function recipeHex(r: ColorMindRecipe): string {
  return `#${[r.R, r.G, r.B].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('').toUpperCase()}`
}
