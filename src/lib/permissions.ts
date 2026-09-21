import type { Account, AccountRole } from '@/types'

/**
 * 權限規格（docs/PRD-Phase1-權限規格-2026-09-21.md）的實作。
 *
 * 三層獨立控制（權限規格第二章）：
 *   ① 功能權限——看不看得到這張單據的入口（側欄與路由）
 *   ② 動作權限——單據上的按鈕
 *   ③ 欄位可見性——欄位本身
 * 三層皆於畫面隱藏或禁用，並於資料層（mutations.ts）再擋一次；前端隱藏不作為安全邊界。
 *
 * 本檔的各張表是「出廠預設值」（權限規格重要前提），正式系統由管理員於介面上維護。
 */

// ---------- 欄位群組（權限規格第五章，決策35：5 群擴充為 7 群） ----------

export const FIELD_GROUPS = [
  '訂單基本資訊',
  '售價',
  '進價',
  '加工與委外費用',
  '生產績效',
  '客戶聯絡資訊',
  '帳號管理',
] as const
export type FieldGroup = (typeof FIELD_GROUPS)[number]

/** 各群組涵蓋的欄位（權限規格第五章「七個群組的內容」），供畫面上說明用 */
export const FIELD_GROUP_CONTENT: Record<FieldGroup, string> = {
  訂單基本資訊: '客戶、皇加品名、顏色、數量、交期、包裝設定、嘜頭、捲號與條碼、實際入庫數量對照等單據主體欄位',
  售價: '對客戶的價格與金額：表8 售價與金額、商品主檔售價、表9 對客戶的退款與扣款金額、PI 單價',
  進價: '對廠商的採購成本：表2 訂購單單價與金額、表6 進價、商品主檔進價',
  加工與委外費用: '表4 染單的加工單價、表5 二次加工單的加工費、表9 向染整廠追討的索賠金額',
  生產績效: '表6 縮率與損耗、大貨樣退回次數等反映加工廠表現的數字',
  客戶聯絡資訊: '聯絡人、電話、地址、收貨地址、TAX ID、銀行帳戶',
  帳號管理: '帳號的新增／停用、角色指派、權限設定與個別排除',
}

/**
 * 角色 × 欄位群組的可見性（權限規格第五章）。
 * 三格標「待覆核」者為業務判斷，仍待皇加確認（權限規格第九章第 1 項）：
 * 業務的「加工與委外費用」「生產績效」、倉管的「生產績效」。
 */
const ROLE_FIELD_VISIBILITY: Record<AccountRole, Record<FieldGroup, boolean>> = {
  業務: {
    訂單基本資訊: true,
    售價: true,
    進價: false,
    加工與委外費用: false,
    生產績效: false,
    客戶聯絡資訊: true,
    帳號管理: false,
  },
  生管: {
    訂單基本資訊: true,
    售價: false,
    進價: true,
    加工與委外費用: true,
    生產績效: true,
    客戶聯絡資訊: false,
    帳號管理: false,
  },
  倉管: {
    訂單基本資訊: true,
    售價: false,
    進價: false,
    加工與委外費用: false,
    生產績效: true,
    客戶聯絡資訊: false,
    帳號管理: false,
  },
  財務: {
    訂單基本資訊: true,
    售價: true,
    進價: true,
    加工與委外費用: true,
    生產績效: true,
    客戶聯絡資訊: true,
    帳號管理: false,
  },
  管理層: {
    訂單基本資訊: true,
    售價: true,
    進價: true,
    加工與委外費用: true,
    生產績效: true,
    客戶聯絡資訊: true,
    帳號管理: false,
  },
  管理員: {
    訂單基本資訊: true,
    售價: true,
    進價: true,
    加工與委外費用: true,
    生產績效: true,
    客戶聯絡資訊: true,
    帳號管理: true,
  },
}

// ---------- 單據與動作（權限規格第三章） ----------

export const DOC_KEYS = ['PI', '表1', '表2', '表3', '表4', '表5', '表6', '表7', '表8', '表9'] as const
export type DocKey = (typeof DOC_KEYS)[number]

export const DOC_LABELS: Record<DocKey, string> = {
  PI: 'PI 單（預估發票）',
  表1: '表1 包裝通知單',
  表2: '表2 訂購單',
  表3: '表3 打色通知單',
  表4: '表4 染整單',
  表5: '表5 二次加工單',
  表6: '表6 入庫單',
  表7: '表7 布疋條碼標籤',
  表8: '表8 出貨單',
  表9: '表9 異常通知單',
}

export type DocAction =
  | '建立'
  | '編輯草稿'
  | '送簽'
  | '簽核'
  | '批准'
  | '退回'
  | '轉生效'
  | '送出'
  | '結案'
  | '確認色卡'
  | '補齊加工廠'
  | '複核'
  | '確認入庫'
  | '列印標籤'
  | '分割布卷'
  | '標記瑕疵'
  | '改為出貨完成'
  | '收單處理'
  | '退貨收貨複核'
  | '會計簽核'

/** ● 可操作／○ 唯讀檢視／－ 無權限（介面不呈現） */
export type DocAccess = '可操作' | '唯讀' | '無權限'

interface DocPermission {
  access: DocAccess
  /** access 為「可操作」時，該角色實際可按的動作 */
  actions: DocAction[]
}

const NONE: DocPermission = { access: '無權限', actions: [] }
const READ: DocPermission = { access: '唯讀', actions: [] }
const can = (...actions: DocAction[]): DocPermission => ({ access: '可操作', actions })

/**
 * 單據動作權限矩陣（權限規格第三章，2026/09/18 全數確認，09/21 補入表1／表9 的退回）。
 *
 * 管理員一律為「●」，但其全權限僅限系統維護用途，同受職責分離約束（決策38）——
 * 見 separationViolation()：管理員建立的表1／表9 不得由同一帳號簽核。
 */
const DOC_MATRIX: Record<DocKey, Record<AccountRole, DocPermission>> = {
  // PI 單屬 Phase 2，其批准權限另立簽核模組（權限規格範圍界線）；
  // 此處僅給出與 Phase 1 一致的可操作範圍，讓原型的側欄與按鈕有依據。
  PI: {
    業務: can('建立', '編輯草稿', '送簽', '結案'),
    生管: READ,
    倉管: NONE,
    財務: READ,
    管理層: can('批准'),
    管理員: can('建立', '編輯草稿', '送簽', '批准', '結案'),
  },
  表1: {
    業務: can('建立', '編輯草稿', '送簽'),
    生管: READ,
    倉管: NONE,
    財務: NONE,
    管理層: can('簽核', '退回'),
    管理員: can('建立', '編輯草稿', '送簽', '簽核', '退回'),
  },
  表2: {
    業務: READ,
    生管: can('建立', '編輯草稿', '送出', '結案'),
    倉管: READ,
    財務: READ,
    管理層: READ,
    管理員: can('建立', '編輯草稿', '送出', '結案'),
  },
  表3: {
    業務: READ,
    生管: can('建立', '送出', '確認色卡'),
    倉管: NONE,
    財務: NONE,
    管理層: READ,
    管理員: can('建立', '送出', '確認色卡'),
  },
  表4: {
    業務: READ,
    生管: can('建立', '編輯草稿', '轉生效', '結案'),
    倉管: READ,
    財務: READ,
    管理層: READ,
    管理員: can('建立', '編輯草稿', '轉生效', '結案'),
  },
  表5: {
    業務: READ,
    生管: can('補齊加工廠', '轉生效', '結案'),
    倉管: READ,
    財務: NONE,
    管理層: READ,
    管理員: can('補齊加工廠', '轉生效', '結案'),
  },
  // 表6／表7：生管與倉管權限完全相同（決策8），避免倉管請假時整條入庫線卡住
  表6: {
    業務: NONE,
    生管: can('複核', '確認入庫'),
    倉管: can('複核', '確認入庫'),
    財務: READ,
    管理層: READ,
    管理員: can('複核', '確認入庫'),
  },
  表7: {
    業務: READ,
    生管: can('列印標籤', '分割布卷', '標記瑕疵'),
    倉管: can('列印標籤', '分割布卷', '標記瑕疵'),
    財務: NONE,
    管理層: READ,
    管理員: can('列印標籤', '分割布卷', '標記瑕疵'),
  },
  表8: {
    業務: can('建立', '編輯草稿'),
    生管: can('改為出貨完成', '退回'),
    倉管: READ,
    財務: READ,
    管理層: READ,
    管理員: can('建立', '編輯草稿', '改為出貨完成', '退回'),
  },
  表9: {
    業務: can('建立'),
    生管: can('收單處理'),
    倉管: can('退貨收貨複核'),
    財務: can('會計簽核'),
    管理層: can('批准', '退回'),
    管理員: can('建立', '批准', '退回', '收單處理', '退貨收貨複核', '會計簽核'),
  },
}

// ---------- 主檔維護權限（權限規格第六章） ----------

export const MASTER_KEYS = ['客戶', '商品', '廠商', '帳號', '布卷'] as const
export type MasterKey = (typeof MASTER_KEYS)[number]

/** 可維護（新增／編輯／刪除）該主檔的角色；未列者為唯讀，帳號主檔則為完全不可見 */
const MASTER_MAINTAINERS: Record<MasterKey, AccountRole[]> = {
  客戶: ['業務', '管理員'],
  商品: ['生管', '管理員'],
  廠商: ['生管', '管理員'],
  帳號: ['管理員'],
  // 布卷不開放手動新增（全角色）；倉管可編輯欄位與刪除，其餘唯讀
  布卷: ['倉管', '管理員'],
}

/** 帳號主檔一般角色連列表都看不到（權限規格第六章） */
export function canViewMaster(account: Account | undefined, master: MasterKey): boolean {
  if (!account) return false
  if (master === '帳號') return account.roles.includes('管理員')
  return true
}

export function canMaintainMaster(account: Account | undefined, master: MasterKey): boolean {
  if (!account) return false
  return account.roles.some((r) => MASTER_MAINTAINERS[master].includes(r))
}

// ---------- 個別排除（權限規格決策32） ----------

/**
 * 最終權限 ＝（該帳號所有角色的聯集）－（該帳號的排除清單）。
 * 個別排除只能收緊、不能放寬——本檔不提供「加上某個角色沒有的權限」的路徑。
 */
export interface AccountExclusions {
  actions?: { doc: DocKey; action: DocAction }[]
  fieldGroups?: FieldGroup[]
}

function exclusionsOf(account: Account): NonNullable<Account['exclusions']> {
  return account.exclusions ?? {}
}

// ---------- 對外查詢：三層權限 ----------

/** ① 功能權限：該帳號是否看得到這張單據的入口 */
export function docAccess(account: Account | undefined, doc: DocKey): DocAccess {
  if (!account || account.status === '停用') return '無權限'
  // 多角色取聯集：任一角色可操作即可操作，任一角色唯讀即至少唯讀
  let best: DocAccess = '無權限'
  for (const role of account.roles) {
    const access = DOC_MATRIX[doc][role].access
    if (access === '可操作') return '可操作'
    if (access === '唯讀') best = '唯讀'
  }
  return best
}

export function canViewDoc(account: Account | undefined, doc: DocKey): boolean {
  return docAccess(account, doc) !== '無權限'
}

/** ② 動作權限：聯集後再減個別排除 */
export function canDoAction(account: Account | undefined, doc: DocKey, action: DocAction): boolean {
  if (!account || account.status === '停用') return false
  const excluded = exclusionsOf(account).actions?.some((e) => e.doc === doc && e.action === action)
  if (excluded) return false
  return account.roles.some((role) => DOC_MATRIX[doc][role].actions.includes(action))
}

/** 該帳號在這張單上可按的全部動作（聯集減排除），供畫面列出 */
export function actionsFor(account: Account | undefined, doc: DocKey): DocAction[] {
  if (!account || account.status === '停用') return []
  const all = new Set<DocAction>()
  account.roles.forEach((role) => DOC_MATRIX[doc][role].actions.forEach((a) => all.add(a)))
  return [...all].filter((a) => canDoAction(account, doc, a))
}

/** ③ 欄位可見性：聯集後再減個別排除 */
export function canSeeFieldGroup(account: Account | undefined, group: FieldGroup): boolean {
  if (!account || account.status === '停用') return false
  if (exclusionsOf(account).fieldGroups?.includes(group)) return false
  return account.roles.some((role) => ROLE_FIELD_VISIBILITY[role][group])
}

/**
 * 未指派群組的欄位一律預設「不可見」（決策36）。
 * 呼叫端若拿不到明確的群組，就走這條——寧可被反映看不到，也好過金額默默外露。
 */
export function canSeeField(account: Account | undefined, group: FieldGroup | undefined): boolean {
  if (!group) return false
  return canSeeFieldGroup(account, group)
}

// ---------- 職責分離（權限規格第七章第 1 節，決策27、38） ----------

/**
 * 不可調整的業務約束：不出現在管理員的設定介面上，也不因角色設定而改變。
 * 回傳違反的原因字串；沒有違反則回 undefined。
 *
 * doc 的建立者以 createdByAccountId 傳入；未記錄建立者的舊資料一律放行
 * （原型的種子資料早於本機制，不應因此卡死展示流程）。
 */
export function separationViolation(
  account: Account | undefined,
  doc: DocKey,
  action: DocAction,
  createdByAccountId?: string,
): string | undefined {
  if (!account) return '未指定操作帳號'

  // 管理層不得建立表1 與表9——它是這兩張單的核決者，自建自簽等同無人把關；
  // 且管理層僅一個帳號、不設代理，自建的單將永遠無人可簽
  if (action === '建立' && (doc === '表1' || doc === '表9') && account.roles.includes('管理層')) {
    return `管理層不得建立${DOC_LABELS[doc]}——本角色是這張單的核決者，自建自簽等同無人把關（權限規格決策38）`
  }

  if (!createdByAccountId || createdByAccountId !== account.id) return undefined

  // 建單者不得自行簽核
  if (action === '簽核' || action === '批准' || action === '會計簽核') {
    return `不得簽核自己建立的${DOC_LABELS[doc]}——建單者與核決者須為不同帳號（權限規格第七章第 1 節）`
  }
  // 建單者不得自行確認出貨（會觸發扣庫存）
  if (action === '改為出貨完成') {
    return `不得對自己建立的${DOC_LABELS[doc]}按出貨完成——出貨完成會觸發扣庫存，須由另一帳號確認（權限規格第七章第 1 節）`
  }
  return undefined
}

/**
 * 資料層的統一檢查：動作權限 ＋ 職責分離，兩者皆過才放行。
 * mutations.ts 於每個寫入點呼叫；違反時丟出可直接顯示給使用者的訊息。
 */
export function assertCanAct(
  account: Account | undefined,
  doc: DocKey,
  action: DocAction,
  createdByAccountId?: string,
): void {
  if (!account) throw new Error('未指定操作帳號，無法執行此動作')
  if (account.status === '停用') throw new Error(`帳號「${account.name}」已停用，無法執行任何動作`)
  // 職責分離先判：它的訊息說得出「為什麼不行」，比泛用的「沒有權限」有用。
  // 例如純管理層帳號建表1，矩陣本來就沒給，但真正的理由是「核決者不得自建自簽」。
  const violation = separationViolation(account, doc, action, createdByAccountId)
  if (violation) throw new Error(violation)
  if (!canDoAction(account, doc, action)) {
    throw new Error(
      `帳號「${account.name}」（${account.roles.join('、')}）沒有「${DOC_LABELS[doc]}－${action}」的權限`,
    )
  }
}

/**
 * 主檔維護的資料層檢查（權限規格第六章、決策23）。
 * 維護權限以「整張主檔」為單位，不往下拆到欄位層級——有維護權即可編輯該主檔的全部欄位；
 * 欄位「看不看得到」仍受第五章的可見性規範，兩者為不同層。
 */
export function assertCanMaintainMaster(account: Account | undefined, master: MasterKey): void {
  if (!account) throw new Error('未指定操作帳號，無法維護主檔')
  if (account.status === '停用') throw new Error(`帳號「${account.name}」已停用，無法執行任何動作`)
  if (!canMaintainMaster(account, master)) {
    throw new Error(
      `帳號「${account.name}」（${account.roles.join('、')}）沒有維護「${master}資料主檔」的權限`,
    )
  }
}

// ---------- 對外單據的指定列印角色（權限規格第七章第 3 節，決策29） ----------

/**
 * 列印內容依操作者的欄位可見性呈現，不另設固定版面。之所以不會出現「同一張單兩個版本」，
 * 是因為對外單據在實務上由固定角色列印，而該角色對該單的金額欄位本來就可見。
 *
 * 表9 拆兩列：主單的退款／扣款屬「售價」群（業務可見），
 * 上游追討附單的索賠金額屬「加工與委外費用」群（生管可見）。
 */
export const DESIGNATED_PRINTERS: {
  doc: string
  recipient: string
  role: AccountRole
  group: FieldGroup
}[] = [
  { doc: '表2 訂購單', recipient: '胚布供應商', role: '生管', group: '進價' },
  { doc: '表4 染整單', recipient: '染整廠', role: '生管', group: '加工與委外費用' },
  { doc: '表5 二次加工單', recipient: '加工廠', role: '生管', group: '加工與委外費用' },
  { doc: '表8 出貨單', recipient: '客戶', role: '業務', group: '售價' },
  { doc: '表9 主單及對客戶附單', recipient: '客戶', role: '業務', group: '售價' },
  { doc: '表9 上游追討附單', recipient: '染整廠', role: '生管', group: '加工與委外費用' },
]

/**
 * 非指定角色列印時的提示（提示但不擋，比照主文件決策22 的「出警示不卡控」慣例）。
 * 回傳 undefined 代表該帳號印出來的內容完整。
 */
export function printWarning(account: Account | undefined, docLabel: string): string | undefined {
  const entry = DESIGNATED_PRINTERS.find((d) => d.doc === docLabel)
  if (!entry) return undefined
  if (canSeeFieldGroup(account, entry.group)) return undefined
  return `本單有「${entry.group}」欄位因權限留白，建議由${entry.role}列印（收受方：${entry.recipient}）`
}
