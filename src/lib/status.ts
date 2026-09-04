/**
 * 全系統狀態色彩語意（對齊 README「主 UI 視覺配色」）：
 * - success（橄欖綠）：已完成
 * - warning（赭黃）：待確認 / 進行中待處理
 * - error（磚紅）：駁回 / 異常 / 疑似覆色
 * - info（皇加藍）：生效 / 已簽回等「已進入下一階段」
 * - neutral（灰）：草稿等尚未送出的狀態
 */
export type StatusVariant = 'success' | 'warning' | 'error' | 'info' | 'neutral'

const STATUS_VARIANT_MAP: Record<string, StatusVariant> = {
  // 通用
  草稿: 'neutral',
  已完成: 'success',
  已駁回: 'error',
  已作廢: 'error',

  // 表1 包裝通知單／表4 染整單
  生效: 'info',

  // 表2 訂購單
  待簽回: 'warning',
  已簽回: 'info',
  已逾期: 'warning',

  // 表3 打色通知單
  已送出: 'warning',
  色卡送樣確認: 'warning',

  // 表6 入庫單
  已複核: 'info',

  // 表7 布卷條碼標籤
  已建立: 'neutral',
  已使用: 'info',
  已終止: 'error',
  '瑕疵／報廢': 'error',

  // 表8 出貨單
  已確認出貨: 'success',

  // 表9 異常通知單
  受理中: 'warning',
  處理中: 'info',

  // 表9 退回布卷複核
  待複核: 'warning',
  良品: 'success',
  瑕疵: 'error',

  // 送樣流程回覆（表3色卡送樣確認、表4大貨樣確認送樣）
  通過: 'success',
  退回: 'error',

  // 客戶主檔狀態：A～C 為往來等級，已歇業為終止往來
  'A level': 'success',
  'B level': 'info',
  'C level': 'warning',
  已歇業: 'error',

  // 顏色機制提示（表1／表2 的色號查詢結果）
  已有色號: 'success',
  疑似覆色: 'warning',
  全新配色: 'info',
  視染整廠而定: 'neutral',

  // 接疋拼接建議（系統提供建議、人工確認）
  待確認: 'warning',
  已採用: 'success',
  已改為整捲裁切: 'neutral',

  // 庫存預留
  預留中: 'warning',
  已釋放: 'neutral',
  已轉出貨: 'success',
}

export function statusVariant(status: string): StatusVariant {
  return STATUS_VARIANT_MAP[status] ?? 'neutral'
}

export const statusVariantClass: Record<StatusVariant, string> = {
  success: 'bg-success/10 text-success border-success/30',
  warning: 'bg-warning/10 text-warning border-warning/30',
  error: 'bg-destructive/10 text-destructive border-destructive/30',
  info: 'bg-accent-blue/10 text-accent-blue border-accent-blue/30',
  neutral: 'bg-muted text-muted-foreground border-border',
}
