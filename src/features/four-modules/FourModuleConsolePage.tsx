import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { PageHeader } from '@/components/shared/PageHeader'
import { api } from '@/mocks/api'
import { getHubAccess, type HubAccess } from '@/lib/sso'
import { buildConsoleBridge, type ConsoleBridge } from './bridge'

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

  const bridge = useMemo(
    () => (products && labels ? buildConsoleBridge(products, labels) : undefined),
    [products, labels],
  )
  // 嵌入頁讀 window.parent 上這份資料；先放好再渲染 iframe，資料換了就換 key 讓它重載
  if (bridge) window.__FOUR_MODULE_BRIDGE__ = bridge
  const hub = getHubAccess()
  window.__AGENT_HUB__ = hub
  const version = bridge ? `${bridge.snapshot.rolls.length}-${bridge.colorSeed.length}-${bridge.snapshot.time}-${hub ? 'hub' : 'solo'}` : ''

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        title="Agents協作中心"
        description={`選布平台、代理人協作、ERP 串接、色彩資料庫依情境順序串接。庫存、品號對照與色樣取自本 ERP（唯讀）；選色系統 API 尚未提供，對色與配方預測暫用內建算法。${hub ? '與選布平台後台即時同步。' : '以 ERP 帳號密碼登入時為單機模式，不與選布平台同步。'}`}
      />
      {loadingProducts || loadingLabels || !bridge ? (
        <div className="text-sm text-muted-foreground">載入 ERP 資料中…</div>
      ) : (
        <iframe
          key={version}
          title="Agents協作中心"
          src={`${import.meta.env.BASE_URL}four-module-console.html`}
          className="min-h-[80vh] w-full flex-1 rounded-md border border-border bg-surface"
        />
      )}
    </div>
  )
}
