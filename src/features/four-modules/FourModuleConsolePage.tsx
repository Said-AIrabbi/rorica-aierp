import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { PageHeader } from '@/components/shared/PageHeader'
import { api } from '@/mocks/api'
import { getHubAccess, type HubAccess } from '@/lib/sso'
import { isEmbedded } from '@/lib/embed'
import { buildConsoleBridge, type ColorDbRecord, type ConsoleBridge } from './bridge'

/**
 * 色彩庫：先讀 public/color-library/colors.json（tools/checkpoint/generate.mts 產生：歷史染色配方去識別化＋模擬色彩，可公開），
 * 沒有才讀本機的 public/private/color-db.json（tools/build-color-db.mjs 產生，不進 git）；都沒有回傳 null。
 */
async function loadColorDb(): Promise<ColorDbRecord[] | null> {
  for (const path of ['color-library/colors.json', 'private/color-db.json']) {
    try {
      const r = await fetch(`${import.meta.env.BASE_URL}${path}`, { cache: 'no-store' })
      if (!r.ok || !(r.headers.get('content-type') ?? '').includes('json')) continue
      const body = (await r.json()) as { records?: ColorDbRecord[] }
      if (Array.isArray(body.records) && body.records.length) return body.records
    } catch {
      // 下一個來源
    }
  }
  return null
}

declare global {
  interface Window {
    __FOUR_MODULE_BRIDGE__?: ConsoleBridge
    /** 選布平台上的共用狀態（agent-hub）：有存取證才有，協作中心據此即時同步；沒有就單機播放 */
    __AGENT_HUB__?: HubAccess
  }
}

/**
 * Agents協作中心：把協作中心原型（public/four-module-console.html）嵌進 ERP，
 * 並把 ERP 的布卷、預留、商品主檔與色號 Lab 交給它（見 bridge.ts）。
 *
 * 讀取走 api.*，與 ERP 其他頁面同一套權限：看不到布卷資料的角色，交過去的庫存就是空的。
 * 協作中心的劇本、畫面與色彩計算都在那個 HTML 裡，這裡只負責接資料。
 */
export function FourModuleConsolePage() {
  const { data: products, isLoading: loadingProducts } = useQuery({ queryKey: ['products'], queryFn: api.products })
  const { data: labels, isLoading: loadingLabels } = useQuery({ queryKey: ['fabricLabels'], queryFn: api.fabricLabels })
  // ERP 色彩資料庫：PET 染色配方（含客戶品牌色名，不進版控，只在有這份檔的環境提供）；取不到就用 ERP 色號
  const { data: colorDb, isLoading: loadingColorDb } = useQuery({
    queryKey: ['colorDb'],
    queryFn: loadColorDb,
    staleTime: Infinity,
    retry: false,
  })

  const bridge = useMemo(
    () => (products && labels && !loadingColorDb ? { ...buildConsoleBridge(products, labels), colorDb: colorDb ?? undefined } : undefined),
    [products, labels, colorDb, loadingColorDb],
  )
  // 嵌入頁讀 window.parent 上這份資料；先放好再渲染 iframe，資料換了就換 key 讓它重載
  if (bridge) window.__FOUR_MODULE_BRIDGE__ = bridge
  const hub = getHubAccess()
  window.__AGENT_HUB__ = hub
  const version = bridge
    ? `${bridge.snapshot.rolls.length}-${bridge.colorSeed.length}-${bridge.colorDb?.length ?? 0}-${bridge.snapshot.time}-${hub ? 'hub' : 'solo'}`
    : ''

  // 嵌在選布平台時，標題與說明由選布平台的頁面顯示，這裡不重複
  const embedded = isEmbedded()

  return (
    <div>
      {!embedded && (
        <PageHeader
          title="Agents協作中心"
          description={`選布平台、代理人協作、ERP 串接、色彩資料庫依情境順序串接；對外送出前一律由業務確認。庫存、品號對照與色樣取自本 ERP（唯讀）；選色系統 API 尚未提供，對色與配方預測暫用內建算法。${hub ? '與選布平台後台即時同步。' : '以 ERP 帳號密碼登入時為單機模式，不與選布平台同步。'}`}
        />
      )}
      {loadingProducts || loadingLabels || loadingColorDb || !bridge ? (
        <div className="text-sm text-muted-foreground">載入 ERP 資料中…</div>
      ) : (
        // 協作中心頁面會自行依內容高度撐開這個框（見 four-module-console.html 開頭），整頁只剩 ERP 一條捲軸
        <iframe
          key={version}
          title="Agents協作中心"
          src={`${import.meta.env.BASE_URL}four-module-console.html`}
          className="block h-[70vh] w-full border-0 bg-transparent"
        />
      )}
    </div>
  )
}
