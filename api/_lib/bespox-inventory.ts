/**
 * ERP 庫存介面合約 v0（fabric-portal docs/erp-inventory-contract.md）的 ERP 端計算。
 *
 * 選布平台的「ERP 串接」模組每 15 分鐘呼叫一次 GET /api/integrations/bespox/inventory，
 * 這裡把 ERP 快照裡的布卷與預留換算成合約的 items。純函式、不碰網路，方便單獨驗證。
 *
 * 可用量的規則與畫面上的「現貨／無現貨總覽」同一把尺（src/lib/inventory.ts）：
 *   - 在庫布卷：狀態為「在庫」者；已完成、已終止、瑕疵／報廢都不算
 *   - 鎖住的布卷：預留中且未逾 14 天效期，或已轉出貨但仍保留剩料（決策170）
 *   - available_yards ＝ 在庫碼數 － 被鎖住的在庫碼數，最小為 0
 * api/ 以獨立的 tsconfig 檢查、不認得 @/ 路徑，故此處以最小型別重寫判斷，不 import 前端程式；
 * 規則若在 src/lib/inventory.ts 改了，這裡要一起改。
 */

export interface LabelRow {
  rollCode: string
  productId?: string
  productName: string
  length: number
  unit: 'Yard' | 'Meter'
  status: string
}

export interface ReservationRow {
  rollCodes: string[]
  status: string
  expiresAt: string
  holding?: boolean
}

export interface ProductRow {
  id: string
  productName: string
}

export interface ContractItem {
  product_id: string
  product_name: string
  available_yards: number
  on_hand_yards: number
  updated_at: string
}

const YARD_PER_METER = 1 / 0.9144

/** 合約範例的時間寫法：台北時間、含時區（2026-10-23T14:05:00+08:00） */
export function taipeiIso(d: Date): string {
  return new Date(d.getTime() + 8 * 3_600_000).toISOString().replace(/\.\d{3}Z$/, '+08:00')
}

function isLocking(r: ReservationRow, now: Date): boolean {
  if (r.status === '預留中') return now.getTime() <= new Date(r.expiresAt).getTime()
  return r.status === '已轉出貨' && Boolean(r.holding)
}

const toYards = (l: LabelRow) => (l.unit === 'Meter' ? l.length * YARD_PER_METER : l.length)
const round2 = (v: number) => Math.round(v * 100) / 100

/**
 * 全部在售產品（不帶 productIds）或指定產品的庫存。
 * 查不到的 product_id 依合約直接省略、不回錯誤。
 *
 * 布卷沒有帶產品編號的舊資料，以品名歸到該品名的第一個分支——與 availableFabricLabels
 * 「未帶產品編號才退回以品名比對」一致；同品名多分支時只會歸到第一支，這是舊資料本身的限制。
 */
export function buildInventory(
  input: { products: ProductRow[]; fabricLabels: LabelRow[]; stockReservations: ReservationRow[] },
  now: Date,
  productIds?: string[],
): { generated_at: string; items: ContractItem[] } {
  const generatedAt = taipeiIso(now)
  const locked = new Set(input.stockReservations.filter((r) => isLocking(r, now)).flatMap((r) => r.rollCodes))
  const firstBranchByName = new Map<string, string>()
  input.products.forEach((p) => {
    if (!firstBranchByName.has(p.productName)) firstBranchByName.set(p.productName, p.id)
  })

  const totals = new Map<string, { onHand: number; available: number }>()
  input.fabricLabels
    .filter((l) => l.status === '在庫')
    .forEach((l) => {
      const pid = l.productId ?? firstBranchByName.get(l.productName)
      if (!pid) return
      const t = totals.get(pid) ?? { onHand: 0, available: 0 }
      const y = toYards(l)
      t.onHand += y
      if (!locked.has(l.rollCode)) t.available += y
      totals.set(pid, t)
    })

  const wanted = productIds ? new Set(productIds) : undefined
  const items = input.products
    .filter((p) => !wanted || wanted.has(p.id))
    .map((p) => {
      const t = totals.get(p.id) ?? { onHand: 0, available: 0 }
      return {
        product_id: p.id,
        product_name: p.productName,
        available_yards: Math.max(0, round2(t.available)),
        on_hand_yards: round2(t.onHand),
        // 快照沒有逐產品的異動時間，依合約「不確定時用 generated_at」
        updated_at: generatedAt,
      }
    })
  return { generated_at: generatedAt, items }
}
