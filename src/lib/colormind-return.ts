/**
 * ColorMind 按「帶回配方」後，瀏覽器回到 return_url，短碼放在查詢參數：
 *   http://localhost:5173/?code=一長串字#/four-modules
 * code 在 ? 後面、# 前面，所以要讀 window.location.search（HashRouter 只看 # 之後，讀不到）。
 *
 * 這個分頁是 Agents協作中心開出去的新分頁，不一定登入了 ERP（登入狀態存在各分頁自己的 sessionStorage）：
 * 不載入 ERP 畫面，只用短碼向後端（api/colormind/redeem）換配方，交回協作中心（BroadcastChannel，localStorage 備援），
 * 再顯示「已帶回，可關閉此分頁」。短碼一讀到就從網址列拿掉，不留在瀏覽紀錄。
 */

export const COLORMIND_CHANNEL = 'rorica-colormind'
export const COLORMIND_STORAGE_KEY = 'rorica-colormind-result'

/** 網址上有 ColorMind 短碼就取出並從網址列移除；沒有回傳 null */
export function takeColorMindCode(): string | null {
  const params = new URLSearchParams(window.location.search)
  const code = params.get('code')
  if (!code) return null
  params.delete('code')
  const rest = params.toString()
  window.history.replaceState(null, '', `${window.location.pathname}${rest ? `?${rest}` : ''}${window.location.hash}`)
  return code
}

function deliver(payload: { result?: unknown; error?: string }): void {
  const msg = { type: 'colormind-result', at: Date.now(), ...payload }
  try {
    const ch = new BroadcastChannel(COLORMIND_CHANNEL)
    ch.postMessage(msg)
    ch.close()
  } catch {
    // 不支援 BroadcastChannel 時靠 localStorage 的 storage 事件
  }
  try {
    window.localStorage.setItem(COLORMIND_STORAGE_KEY, JSON.stringify(msg))
  } catch {
    // 存不進去就只靠 BroadcastChannel
  }
}

function show(title: string, text: string, bad = false): void {
  const root = document.getElementById('root') ?? document.body
  root.innerHTML = ''
  const box = document.createElement('div')
  box.className = 'mx-auto mt-[15vh] max-w-lg rounded-lg border border-border bg-card p-6 text-sm'
  const h = document.createElement('h1')
  h.className = 'mb-2 text-lg font-semibold text-ink'
  h.textContent = title
  const p = document.createElement('p')
  p.className = bad ? 'text-destructive' : 'text-muted-foreground'
  p.textContent = text
  const btn = document.createElement('button')
  btn.type = 'button'
  btn.className = 'mt-4 rounded-md bg-brand px-4 py-2 text-white'
  btn.textContent = '關閉此分頁'
  btn.onclick = () => window.close()
  box.append(h, p, btn)
  root.append(box)
}

/** 用短碼換配方並交回協作中心 */
export async function finishColorMindReturn(code: string): Promise<void> {
  show('正在帶回 ColorMind 配方…', '請稍候，不要關閉這個分頁。')
  try {
    const r = await fetch('/api/colormind/redeem', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code }),
    })
    const body = (await r.json().catch(() => null)) as { recipes?: unknown[]; 色樣名稱?: string; error?: string } | null
    if (!r.ok || !body || !Array.isArray(body.recipes)) {
      const err = body?.error ?? '帶回失敗，請回到 Agents協作中心重新開啟 ColorMind'
      deliver({ error: err })
      show('沒有帶回配方', err, true)
      return
    }
    deliver({ result: body })
    show(`已帶回 ${body.recipes.length} 組配方`, `「${body.色樣名稱 ?? ''}」的配方已送回 Agents協作中心，這個分頁可以關閉。`)
  } catch {
    deliver({ error: '連不上 ERP，請回到 Agents協作中心重新開啟 ColorMind' })
    show('沒有帶回配方', '連不上 ERP，請回到 Agents協作中心重新開啟 ColorMind。', true)
  }
}
