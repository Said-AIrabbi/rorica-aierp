/**
 * 單據異動事件（通知中心的第二層）。
 *
 * 需求：任一單據有更新就通知所有人。
 *
 * 做法刻意不是「在每個 mutation 裡呼叫 notify()」——mutations.ts 有上百個寫入函式，
 * 逐一插入遲早會漏，而且漏掉的往往正是連鎖產生的那幾張（表1 生效會自動帶出表2、表4、表8 草稿）。
 * 改為在所有 mutation 的共同出口（mutations.ts 的 delay()）比對「上一次寫入後的樣子」與「現在的樣子」，
 * 差異即事件。新增的單據型別不必再回頭補這裡。
 *
 * 一次操作內、同一種單據、同一種異動只記一筆（帶筆數），
 * 否則入庫時一口氣產生幾十張條碼標籤會把通知洗掉。
 */
import type { DocKey } from '@/lib/permissions'
import { getCurrentAccount } from './session'
import {
  abnormalNotices,
  documentEventReads,
  documentEvents,
  dyeOrders,
  dyeRequests,
  fabricLabels,
  goodsReceipts,
  packingNotices,
  proformaInvoices,
  purchaseOrders,
  secondaryProcessingOrders,
  shippingOrders,
} from './data'

export interface DocumentEvent {
  id: string
  /** ISO 時間 */
  at: string
  actorId: string
  actorName: string
  doc: DocKey
  kind: '新增' | '更新'
  /** 本次操作影響的張數；> 1 時連結指向列表而非單張 */
  count: number
  /** 最多保留 3 個單號供顯示 */
  docIds: string[]
  /** 人看的說明，例如「ORD-20260924-001：狀態 草稿 → 生效」 */
  summary: string
  link: string
}

interface Tracked {
  doc: DocKey
  rows: () => { id: string; status?: string }[]
  /** 單張詳情與列表共用同一個前綴 */
  route: string
  label: string
}

const TRACKED: Tracked[] = [
  { doc: 'PI', rows: () => proformaInvoices, route: '/proforma-invoice', label: 'PI 單' },
  { doc: '表1', rows: () => packingNotices, route: '/packing-notice', label: '表1 包裝通知單' },
  { doc: '表2', rows: () => purchaseOrders, route: '/purchase-order', label: '表2 訂購單' },
  { doc: '表3', rows: () => dyeRequests, route: '/dye-request', label: '表3 打色通知單' },
  { doc: '表4', rows: () => dyeOrders, route: '/dye-order', label: '表4 染整單' },
  { doc: '表5', rows: () => secondaryProcessingOrders, route: '/secondary-processing', label: '表5 二次加工單' },
  { doc: '表6', rows: () => goodsReceipts, route: '/goods-receipt', label: '表6 入庫單' },
  { doc: '表7', rows: () => fabricLabels, route: '/fabric-label', label: '表7 布疋條碼標籤' },
  { doc: '表8', rows: () => shippingOrders, route: '/shipping-order', label: '表8 出貨單' },
  { doc: '表9', rows: () => abnormalNotices, route: '/abnormal-notice', label: '表9 異常通知單' },
]

/** 通知只保留最近這麼多筆：這是展示環境，整包資料要塞進一次 HTTP 寫入裡 */
const MAX_EVENTS = 200

interface Fingerprint {
  status?: string
  json: string
}

/**
 * 上一次寫入完成後的樣子。**延遲建立**：
 * 遠端資料是開站時才載入的，若在模組載入當下就建索引，
 * 那份索引會是種子資料，使用者一進站就會收到「全部單據都更新了」的假通知。
 */
let baseline: Map<string, Fingerprint> | undefined
let seq = 0

function fingerprints(): Map<string, Fingerprint> {
  const map = new Map<string, Fingerprint>()
  for (const t of TRACKED) {
    for (const row of t.rows()) {
      map.set(`${t.doc}\u0000${row.id}`, { status: row.status, json: JSON.stringify(row) })
    }
  }
  return map
}

/**
 * 重建基準而不產生任何事件。
 * 套用外部快照（載入伺服器資料、輪詢到別人的異動）後必須呼叫，
 * 否則下一次自己存檔時會把對方改的東西全部當成自己改的重報一次。
 */
export function resetDocumentEventBaseline(): void {
  baseline = fingerprints()
}

/** 由 mutations.ts 的共同出口呼叫；本身不寫 sessionStorage／不送出網路請求 */
export function recordDocumentChanges(): void {
  const next = fingerprints()
  if (!baseline) {
    baseline = next
    return
  }

  const actor = getCurrentAccount()
  const at = new Date().toISOString()
  const created = new Map<DocKey, string[]>()
  const updated = new Map<DocKey, { id: string; from?: string; to?: string }[]>()

  for (const [key, fp] of next) {
    const before = baseline.get(key)
    const [doc, id] = key.split('\u0000') as [DocKey, string]
    if (!before) {
      created.set(doc, [...(created.get(doc) ?? []), id])
    } else if (before.json !== fp.json) {
      updated.set(doc, [...(updated.get(doc) ?? []), { id, from: before.status, to: fp.status }])
    }
  }
  baseline = next
  // 刪除不另行通知：單據本身沒有刪除功能，主檔的刪除不在此列

  for (const t of TRACKED) {
    const news = created.get(t.doc)
    if (news?.length) {
      push(t, '新增', news, at, actor, news.length === 1 ? `${news[0]} 已建立` : `新增 ${news.length} 筆`)
    }
    const changes = updated.get(t.doc)
    if (changes?.length) {
      const one = changes[0]
      const moved = one.from && one.to && one.from !== one.to
      const summary =
        changes.length === 1
          ? moved
            ? `${one.id}：狀態 ${one.from} → ${one.to}`
            : `${one.id} 內容已更新`
          : `更新 ${changes.length} 筆`
      push(
        t,
        '更新',
        changes.map((c) => c.id),
        at,
        actor,
        summary,
      )
    }
  }

  if (documentEvents.length > MAX_EVENTS) documentEvents.splice(0, documentEvents.length - MAX_EVENTS)
}

function push(
  t: Tracked,
  kind: DocumentEvent['kind'],
  ids: string[],
  at: string,
  actor: { id: string; name: string } | undefined,
  summary: string,
): void {
  seq += 1
  documentEvents.push({
    id: `evt-${at}-${seq}`,
    at,
    // 沒有登入者（測試腳本直接呼叫資料層）時仍要留下事件，只是不知道是誰做的
    actorId: actor?.id ?? '',
    actorName: actor?.name ?? '系統',
    doc: t.doc,
    kind,
    count: ids.length,
    docIds: ids.slice(0, 3),
    summary,
    link: ids.length === 1 ? `${t.route}/${ids[0]}` : t.route,
  })
}

/**
 * 標記為已讀：記下這個帳號讀到哪個時間點，而不是逐筆打勾。
 * 通知是全員共用的一份清單，逐筆已讀會讓這包 JSON 隨人數與筆數相乘地長大。
 */
export function markDocumentEventsRead(accountId: string): void {
  documentEventReads[accountId] = new Date().toISOString()
}

/** 未讀：比上次已讀時間新，且不是自己做的（自己剛按的按鈕不需要通知自己） */
export function unreadDocumentEvents(events: DocumentEvent[], accountId: string): DocumentEvent[] {
  const readAt = documentEventReads[accountId]
  return events.filter((e) => e.actorId !== accountId && (!readAt || e.at > readAt))
}
