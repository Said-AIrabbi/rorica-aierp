/**
 * ERP 庫存介面合約 v0 的端點：GET /api/integrations/bespox/inventory
 * （fabric-portal docs/erp-inventory-contract.md，選布平台的 ERP 串接模組照這份合約讀庫存）。
 *
 * 資料來源是原型展示環境存在 Upstash Redis 的那包快照（見 api/snapshot.ts、PROTOTYPE-HOSTING.md），
 * 只讀不寫。真後端上線時，換成直接查資料庫即可，計算規則在 api/_lib/bespox-inventory.ts。
 *
 * 環境變數：
 *   ERP_BESPOX_TOKEN      Bearer token；未設定時一律 401，不開放匿名讀庫存
 *   ERP_BESPOX_WORKSPACE  讀哪個工作區的快照，預設 demo
 */
import { buildInventory, type LabelRow, type ProductRow, type ReservationRow } from '../../_lib/bespox-inventory'

export const config = { runtime: 'edge' }

const PRODUCT_IDS_MAX = 100

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  })
}

async function readSnapshot(workspace: string): Promise<unknown> {
  const env = process.env
  const url = env.KV_REST_API_URL ?? env.UPSTASH_REDIS_REST_URL
  const token = env.KV_REST_API_TOKEN ?? env.UPSTASH_REDIS_REST_TOKEN
  if (!url || !token) throw new Error('尚未連結 Upstash Redis')
  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(['GET', `rorica:${workspace}:data`]),
  })
  if (!res.ok) throw new Error(`Redis 回應 ${res.status}`)
  const body = (await res.json()) as { result?: string | null; error?: string }
  if (body.error) throw new Error(body.error)
  return body.result ? JSON.parse(body.result) : null
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'GET') return json({ error: `不支援的方法 ${req.method}` }, 405)

  const expected = process.env.ERP_BESPOX_TOKEN
  if (!expected || req.headers.get('authorization') !== `Bearer ${expected}`) {
    return json({ error: 'missing or wrong token' }, 401)
  }

  const ids = new URL(req.url).searchParams.getAll('product_id')
  if (ids.length > PRODUCT_IDS_MAX) return json({ error: `at most ${PRODUCT_IDS_MAX} product_id` }, 400)
  if (ids.some((id) => id.trim() === '')) return json({ error: 'empty product_id' }, 400)

  try {
    const workspace = (process.env.ERP_BESPOX_WORKSPACE ?? 'demo').toLowerCase()
    // 快照外層為 { data, permissions }（src/prototype-storage/boot.ts）
    const payload = (await readSnapshot(workspace)) as {
      data?: { products?: ProductRow[]; fabricLabels?: LabelRow[]; stockReservations?: ReservationRow[] }
    } | null
    const data = payload?.data
    // 工作區還沒有人操作過時伺服器上沒有快照（種子資料只在瀏覽器裡產生）：回 503，
    // 依合約選布平台會保留上次同步的值並標示資料時間
    if (!data?.products || !data.fabricLabels) return json({ error: `工作區 ${workspace} 尚無 ERP 快照` }, 503)
    const result = buildInventory(
      { products: data.products, fabricLabels: data.fabricLabels, stockReservations: data.stockReservations ?? [] },
      new Date(),
      ids.length ? [...new Set(ids.map((id) => id.trim()))] : undefined,
    )
    return json(result)
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : String(error) }, 503)
  }
}
