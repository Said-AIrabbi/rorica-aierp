import { faker } from '@faker-js/faker'
import dayjs from 'dayjs'
import { yardToMeter, yardWeightToMeterWeight } from '@/lib/units'
import { reservationExpiresAt } from '@/lib/inventory'
import { buildSecondaryProcessingPackaging, defaultRollYard } from '@/lib/workflow'
import type {
  AbnormalNotice,
  Account,
  Customer,
  DyeOrder,
  DyeRequest,
  FabricLabel,
  GoodsReceipt,
  PackingNotice,
  PackingNoticeItem,
  Product,
  PurchaseOrder,
  SecondaryProcessingOrder,
  ShippingOrder,
  SplicingSuggestion,
  StockReservation,
  Vendor,
  VendorType,
} from '@/types'
import {
  COLOR_RATIO_MODES,
  EMBOSSING_OPTIONS,
  FIXED_ROLL_PACKING_METHODS,
  GOODS_RECEIPT_PURPOSES,
  LABEL_TYPES,
  MARKING_SHAPES,
  PACKAGING_TYPES,
  PACKING_METHODS,
  PRODUCT_CATEGORIES,
  PROCESSING_METHODS,
  SHIP_METHODS,
  TOLERANCE_MODES,
} from '@/types'

faker.seed(20260812)

const CUSTOMER_NAMES = [
  { short: 'Bella Rosa', cn: '貝拉羅莎婚紗有限公司', en: 'Bella Rosa Bridal Co., Ltd.' },
  { short: 'Ivory Line', cn: '象牙線禮服股份有限公司', en: 'Ivory Line Couture Co., Ltd.' },
  { short: '維多莉亞', cn: '維多莉亞婚紗實業有限公司', en: 'Victoria Bridal Industry Co., Ltd.' },
  { short: 'Luna Bridal', cn: '露娜婚紗設計有限公司', en: 'Luna Bridal Design Co., Ltd.' },
  { short: '雅緻服飾', cn: '雅緻服飾製造股份有限公司', en: 'Elegance Garment Mfg Co., Ltd.' },
  { short: 'Chantilly', cn: '香緹麗禮服有限公司', en: 'Chantilly Couture Co., Ltd.' },
]

const PRODUCT_NAME_POOL = [
  '珠光緞', '柔光緞', '重磅緞', '彈性緞', '手感緞', '亮面緞',
  '色織千鳥格', '色織條紋', '米卡多光澤布', '山東綢紋理布',
  '塔夫塔硬挺布', '裡布素面', '雪紡輕柔', '雪紡雙層',
  '歐根紗硬挺', '花朵蕾絲網', '六角網紗', '硬網澎裙用', '彈性網', '變化提花網', '拉舍爾蕾絲',
]

const MATERIALS = ['100% POLY', '100% POLY/METALLIC', '95% POLY/5% SPANDEX', '100% NYLON', '100% POLY/SILK LOOK']

/** 胚布規格常見的經緯紗支數寫法，供商品資料主檔「胚布規格」欄位模擬用 */
const GREIGE_YARN_SPECS = ['75D/72F × 150D/48F', '50D/24F × 75D/36F', '30D/24F × 50D/48F', '100D/144F × 100D/144F']

/** 各加工方法的說明範例：實務上這欄由業務依客戶要求逐單填寫，此處僅供模擬 */
const PROCESSING_METHOD_NOTE_SAMPLES: Record<(typeof PROCESSING_METHODS)[number], string> = {
  上膠: '背面上透明膠，膠層薄不反光',
  壓褶: '直條褶，褶距 1.5cm',
  壓光: '高溫壓光一次，正面亮度提升',
  膠印: '客供圖檔，單色膠印',
  噴沖: '全幅噴沖，去除多餘漿料',
  柔軟: '柔軟精處理，手感偏軟',
  手感: '依客戶留樣手感為準，勿過硬',
}

const COLOR_NAMES = [
  '象牙白', '香檳金', '珍珠白', '奶油白', '淺粉', '玫瑰粉', '天空藍', '寶石藍',
  '酒紅', '深卡其', '霧灰', '薄荷綠', '鵝黃', '丁香紫', '正黑', '銀灰',
]

const VENDOR_NAMES: { name: string; types: VendorType[]; siteCode?: string }[] = [
  { name: '永豐染整廠', types: ['染整廠'], siteCode: 'A' },
  { name: '合益織造股份有限公司', types: ['胚布供應商'] },
  { name: '大成染整實業社', types: ['染整廠'], siteCode: 'A' },
  { name: '宏昌織布廠', types: ['胚布供應商'] },
  { name: '福興染織有限公司', types: ['胚布供應商', '染整廠'], siteCode: 'B' },
  { name: '瑞成成衣有限公司', types: ['成品供應商'] },
]

const ACCOUNT_SEED: { name: string; roles: Account['roles'] }[] = [
  { name: '陳美玲', roles: ['業務'] },
  { name: '林志豪', roles: ['業務'] },
  { name: '黃淑芬', roles: ['生管'] },
  { name: '王建國', roles: ['倉管'] },
  { name: '李佳穎', roles: ['財務'] },
  { name: '吳宗翰', roles: ['管理層'] },
  { name: '張育誠', roles: ['管理員'] },
]

function pad(n: number, len = 3) {
  return String(n).padStart(len, '0')
}

export const customers: Customer[] = CUSTOMER_NAMES.map((c, i) => ({
  id: `CUST-${pad(i + 1)}`,
  code: `C${pad(i + 1)}`,
  shortName: c.short,
  fullNameCN: c.cn,
  fullNameEN: c.en,
  personInCharge: faker.person.fullName(),
  personInChargePhone: faker.phone.number({ style: 'international' }),
  contactPerson: faker.person.fullName(),
  contactPersonPhone: faker.phone.number({ style: 'international' }),
  address: `台北市大同區重慶北路${faker.number.int({ min: 1, max: 300 })}號${faker.number.int({ min: 1, max: 10 })}樓`,
  invoiceAddress: `台北市大同區重慶北路${faker.number.int({ min: 1, max: 300 })}號${faker.number.int({ min: 1, max: 10 })}樓`,
  taxId: faker.string.numeric(8),
  taxRate: '5%',
  paymentTerms: faker.helpers.arrayElement(['月結30天', '月結45天', '月結60天', '訂金30%/出貨前付清']),
  leadTimeDays: 14,
}))

export const vendors: Vendor[] = VENDOR_NAMES.map((v, i) => ({
  id: `VEND-${pad(i + 1)}`,
  code: `V${pad(i + 1)}`,
  name: v.name,
  types: v.types,
  siteCode: v.siteCode,
  address: `台中市大里區工業路${faker.number.int({ min: 1, max: 300 })}號`,
  invoiceAddress: `台中市大里區工業路${faker.number.int({ min: 1, max: 300 })}號`,
  contactPerson: faker.person.fullName(),
  phone: faker.phone.number({ style: 'international' }),
  taxId: faker.string.numeric(8),
  taxRate: '5%',
  paymentTerms: faker.helpers.arrayElement(['月結30天', '月結45天', '月結60天']),
}))

export const accounts: Account[] = ACCOUNT_SEED.map((a, i) => ({
  id: `ACC-${pad(i + 1)}`,
  code: `A${pad(i + 1)}`,
  name: a.name,
  // 模擬資料不放任何可用密碼；畫面上本欄一律以遮蔽形式呈現（見帳號主檔列表）
  password: 'DEMO-ONLY-NOT-A-REAL-PASSWORD',
  // 示範信箱一律使用保留網域 example.com，避免公開的模擬資料指向真實信箱網域
  mailbox: `${faker.internet.username({ firstName: a.name }).toLowerCase()}@example.com`,
  phone: faker.phone.number({ style: 'international' }),
  roles: a.roles,
  status: '啟用',
}))

/**
 * 商品建檔清單：同一個皇加品名若規格有些微差異，會各自建為一筆商品，
 * 由「產品序號（產品分支）」區分。此處刻意讓幾個品名各有兩個分支，供展示分支機制。
 */
const PRODUCT_BUILD_LIST = PRODUCT_NAME_POOL.flatMap((name, i) =>
  i % 7 === 0 ? [name, name] : [name],
)

/** 產品分支序號：同一皇加品名底下由 01 開始遞增 */
const branchCounter = new Map<string, number>()

/** 同一皇加品名的各分支共用類別、所屬客戶與材質，差異只在規格數值 */
const productBaseByName = new Map(
  PRODUCT_NAME_POOL.map((name, i) => [
    name,
    {
      category: PRODUCT_CATEGORIES[i % PRODUCT_CATEGORIES.length],
      customer: faker.helpers.arrayElement(customers),
      material: faker.helpers.arrayElement(MATERIALS),
    },
  ]),
)

export const products: Product[] = PRODUCT_BUILD_LIST.map((name, i) => {
  const base = productBaseByName.get(name)!
  const category = base.category
  const branchNo = (branchCounter.get(name) ?? 0) + 1
  branchCounter.set(name, branchNo)
  const customer = base.customer
  const weightGY = faker.number.float({ min: 60, max: 220, fractionDigits: 1 })
  const colorCount = faker.number.int({ min: 1, max: 4 })
  const colors = faker.helpers
    .arrayElements(COLOR_NAMES, colorCount)
    .map((color, ci) => ({
      color,
      dyeVendorId: faker.helpers.arrayElement(vendors.filter((v) => v.types.includes('染整廠'))).id,
      lastUsedAt: dayjs()
        .subtract(faker.number.int({ min: 0, max: 20 }), 'month')
        .toISOString(),
      sampleCode: `T${faker.string.numeric(7)}-${ci + 1}A`,
    }))

  // 幅寬原始單位為英吋（廠商規格單位），如標籤範例 72"；分支間的差異即在此類規格數值
  const width = faker.helpers.arrayElement([44, 58, 60, 72])
  const material = base.material

  return {
    id: `PROD-${pad(i + 1)}`,
    customerId: customer.id,
    productName: name,
    customerProductName: `${customer.shortName}#${faker.string.alphanumeric(4).toUpperCase()}`,
    greigeFabricCode: `T${faker.string.numeric(7)}`,
    categoryCode: category.code,
    sortNo: pad(branchNo, 2),
    material,
    greigeSpec: `${material} ${faker.helpers.arrayElement(GREIGE_YARN_SPECS)}`,
    finishedSpec: `${width}" ${weightGY}G/Y ${category.zh}`,
    colors,
    thicknessMm: faker.number.float({ min: 0.1, max: 1.2, fractionDigits: 2 }),
    characteristics: faker.helpers.arrayElement(['垂墜感佳', '硬挺澎度足', '輕薄透氣', '光澤度高', '彈性佳', '手感柔軟']),
    width,
    widthTolerancePct: 3,
    weightGY,
    weightTolerancePct: 5,
    weightMY: Number(yardWeightToMeterWeight(weightGY).toFixed(2)),
    // 原疋標準尺寸必然大於客戶要求的捲長（表1需求多為 40~65 碼），故取 80 碼以上
    originalRollStandardYard: faker.helpers.arrayElement([80, 100, 120]),
    costPrice: faker.number.float({ min: 20, max: 80, fractionDigits: 1 }),
    sellPrice: faker.number.float({ min: 90, max: 220, fractionDigits: 1 }),
  }
})

function randomOrderId(index: number, daysAgo: number) {
  const date = dayjs().subtract(daysAgo, 'day')
  return `ORD-${date.format('YYYYMMDD')}-${pad(index)}`
}

const PACKING_STATUSES: PackingNotice['status'][] = ['草稿', '生效', '已完成']

export const packingNotices: PackingNotice[] = Array.from({ length: 10 }).map((_, i) => {
  const daysAgo = faker.number.int({ min: 0, max: 60 })
  const id = randomOrderId(i + 1, daysAgo)
  const createdAt = dayjs().subtract(daysAgo, 'day')
  const status = PACKING_STATUSES[i % PACKING_STATUSES.length]
  const customer = faker.helpers.arrayElement(customers)
  const itemCount = faker.number.int({ min: 1, max: 4 })
  const shipMethod = faker.helpers.arrayElements(SHIP_METHODS, { min: 1, max: 2 })

  const items: PackingNoticeItem[] = Array.from({ length: itemCount }).map((_, j) => {
    const product = faker.helpers.arrayElement(products)
    const color = faker.helpers.arrayElement(product.colors)?.color ?? faker.helpers.arrayElement(COLOR_NAMES)
    const yard = faker.number.int({ min: 100, max: 2000 })
    const packingMethod = faker.helpers.arrayElement(PACKING_METHODS)
    const processingMethod = faker.helpers.arrayElement([...PROCESSING_METHODS, undefined, undefined, undefined])
    return {
      id: `${id}-L${j + 1}`,
      // 客戶品名由商品資料主檔與皇加品名一對一帶出，非逐單自由輸入
      customerProductName: product.customerProductName,
      roricaProductName: product.productName,
      productId: product.id,
      color,
      yard,
      meter: Number(yardToMeter(yard).toFixed(1)),
      packingMethod,
      fixedLengthMeter: FIXED_ROLL_PACKING_METHODS.includes(packingMethod)
        ? faker.number.float({ min: 40, max: 60, fractionDigits: 1 })
        : undefined,
      // 加工方法為單選且非必填：約半數品項不指定加工
      processingMethod,
      processingMethodNote: processingMethod ? PROCESSING_METHOD_NOTE_SAMPLES[processingMethod] : undefined,
      note: faker.helpers.arrayElement(['', '', '客戶指定紙管顏色', '']),
    }
  })

  return {
    id,
    customerId: customer.id,
    customerOrderNo: `${customer.code}-${faker.string.numeric(5)}`,
    status,
    createdAt: createdAt.toISOString(),
    effectiveAt: status === '草稿' ? undefined : createdAt.add(1, 'day').toISOString(),
    expectedDeliveryAt: createdAt.add(customer.leadTimeDays, 'day').toISOString(),
    sampleQty: faker.number.int({ min: 0, max: 10 }) * 0.5,
    shipMethod,
    shipMethodNote: shipMethod.includes('其他') ? '客戶指定貨運行代收' : undefined,
    colorRatio:
      faker.helpers.arrayElement(COLOR_RATIO_MODES) === '客人指定'
        ? { mode: '客人指定' as const, customText: '依訂單指定色比±5%' }
        : { mode: '空白' as const },
    labelTypes: faker.helpers.arrayElements(LABEL_TYPES, { min: 1, max: LABEL_TYPES.length }),
    packagingType: faker.helpers.arrayElement(PACKAGING_TYPES),
    tolerance:
      faker.helpers.arrayElement(TOLERANCE_MODES) === '其他'
        ? { mode: '其他' as const, customText: '依客戶指示另訂' }
        : { mode: faker.helpers.arrayElement(['±5%', '±10%'] as const) },
    items,
    // 接疋規則：訂單層級可調整欄位，預設「不可」，客戶通常會希望不接疋
    allowSplicing: faker.datatype.boolean({ probability: 0.2 }),
    marking: {
      shape: faker.helpers.arrayElement(MARKING_SHAPES),
      destination: faker.helpers.arrayElement(['', 'LA Warehouse', 'NY Distribution Center', '']),
      grossWeightKg: faker.number.float({ min: 20, max: 120, fractionDigits: 1 }),
      netWeightKg: faker.number.float({ min: 18, max: 110, fractionDigits: 1 }),
      composition: faker.helpers.arrayElement(['', '100% POLY', '']),
      origin: faker.helpers.arrayElement(['', 'Taiwan', '']),
      hasSmallMarking: faker.datatype.boolean(),
      smallMarkingText: `RORICA-${customer.code}-${dayjs().format('YYYY')}`,
    },
    embossing: faker.helpers.arrayElements(EMBOSSING_OPTIONS, { min: 1, max: 2 }),
    edgeCut: faker.datatype.boolean({ probability: 0.3 }),
  }
})

const PO_STATUSES: PurchaseOrder['status'][] = ['草稿', '待簽回', '已簽回', '已逾期', '已完成']

export const purchaseOrders: PurchaseOrder[] = packingNotices
  .filter((_, i) => i % 2 === 0)
  .map((pn, i) => {
    const createdAt = dayjs(pn.createdAt).add(1, 'day')
    const status = PO_STATUSES[i % PO_STATUSES.length]
    const id = `${pn.id}-P1`
    // 明細與表1包裝通知單完全一致，逐列（1:1）帶入，僅新增訂購單專屬的單價欄位
    const items = pn.items.map((item) => ({
      id: `${id}-${item.id}`,
      customerProductName: item.customerProductName,
      roricaProductName: item.roricaProductName,
      productId: item.productId,
      color: item.color,
      yard: item.yard,
      meter: item.meter,
      packingMethod: item.packingMethod,
      fixedLengthMeter: item.fixedLengthMeter,
      processingMethod: item.processingMethod,
      processingMethodNote: item.processingMethodNote,
      unitPrice: faker.number.float({ min: 20, max: 80, fractionDigits: 1 }),
      note: item.note,
    }))
    const type = faker.helpers.arrayElement<PurchaseOrder['type']>(['成品', '胚布'])
    const hasDyeVendor = type === '胚布' ? faker.datatype.boolean() : undefined
    // 賣方與染整廠可能不是同一家（跟A買胚布、送B染），故各自獨立指定
    const dyeVendorId = hasDyeVendor
      ? faker.helpers.arrayElement(vendors.filter((v) => v.types.includes('染整廠'))).id
      : undefined
    const isFinishedGoods = type === '成品'
    const largeSampleConfirmedAt =
      isFinishedGoods && status === '已完成' ? createdAt.add(6, 'day').toISOString() : undefined
    return {
      id,
      parentId: pn.id,
      type,
      hasDyeVendor,
      dyeVendorId,
      vendorId: faker.helpers.arrayElement(vendors).id,
      status,
      createdAt: createdAt.toISOString(),
      // 草稿尚未送出，故無生效日（凍結旗標自生效日起算）
      effectiveAt: status === '草稿' ? undefined : createdAt.add(1, 'day').toISOString(),
      signedAt: status === '已簽回' || status === '已完成' ? createdAt.add(2, 'day').toISOString() : undefined,
      dueDate: createdAt.add(20, 'day').toISOString(),
      note: faker.helpers.arrayElement(['配合染整廠排缸', '含備份用量5%', '', '客戶指定廠商']),
      items,
      embossing: pn.embossing.join('、'),
      colorRatioNote: pn.colorRatio.mode === '客人指定' ? `客人指定：${pn.colorRatio.customText ?? ''}` : '空白',
      largeSampleConfirmedAt,
      largeSampleSubmissions: largeSampleConfirmedAt
        ? [{ id: `${id}-SAMPLE1`, submittedAt: largeSampleConfirmedAt, result: '通過' as const }]
        : undefined,
    }
  })

const DYE_REQUEST_STATUSES: DyeRequest['status'][] = ['草稿', '已送出', '色卡送樣確認', '已完成']

export const dyeRequests: DyeRequest[] = packingNotices.slice(0, 7).flatMap((pn, i) => {
  const count = faker.number.int({ min: 1, max: 2 })
  return Array.from({ length: count }).map((_, j) => {
    const createdAt = dayjs(pn.createdAt).add(1, 'day')
    const status = DYE_REQUEST_STATUSES[(i + j) % DYE_REQUEST_STATUSES.length]
    const product = faker.helpers.arrayElement(products)
    // 表3的子序號為 -C{n}（Color card），與表4染單的 -D{n} 分開，避免同一主號下單號相撞
    const id = `${pn.id}-C${j + 1}`
    const colorNames = faker.helpers.arrayElements(COLOR_NAMES, { min: 1, max: 3 })
    const colorSampleConfirmedAt = status === '已完成' ? createdAt.add(5, 'day').toISOString() : undefined
    return {
      id,
      parentId: pn.id,
      buyer: '皇加' as const,
      dyeVendorId: faker.helpers.arrayElement(vendors.filter((v) => v.types.includes('染整廠'))).id,
      requestDate: createdAt.toISOString(),
      productId: product.id,
      greigeFabricCode: product.greigeFabricCode,
      // 色樣編號為染整廠打色完成後回覆才填入：草稿／已送出階段尚未回覆，故留空
      colors: colorNames.map((color, k) => ({
        id: `${id}-C${k + 1}`,
        color,
        sampleCode: status === '草稿' || status === '已送出' ? undefined : `${id}-SAMPLE${k + 1}`,
      })),
      colorSampleSubmissions: colorSampleConfirmedAt
        ? [{ id: `${id}-SAMPLE1`, submittedAt: colorSampleConfirmedAt, result: '通過' as const }]
        : undefined,
      colorSampleConfirmedAt,
      note: faker.helpers.arrayElement(['請安排打色，謝謝！', '色號太久重新覆色', '']),
      status,
    }
  })
})

const DYE_ORDER_STATUSES: DyeOrder['status'][] = ['草稿', '生效', '已完成']
const FABRIC_MATERIALS = ['100% POLY', '100% POLY/METALLIC', 'N/T 42/58', '100% NYLON']

export const dyeOrders: DyeOrder[] = packingNotices.slice(0, 6).map((pn, i) => {
  const createdAt = dayjs(pn.createdAt).add(3, 'day')
  const status = DYE_ORDER_STATUSES[i % DYE_ORDER_STATUSES.length]
  const id = `${pn.id}-D1`

  // 生效中的單以單號奇偶模擬「胚布尚未到廠（全待染）」與「已到廠投入染整（全指染）」兩種狀態
  const greigeArrived = status === '生效' ? i % 2 === 0 : status === '已完成'
  const items = pn.items.map((item, j) => {
    const totalQty = item.yard
    // 胚布材質／規格、成品規格依明細的產品分支自動帶入
    const product = resolveProduct(item.productId, item.roricaProductName)
    return {
      id: `${id}-L${j + 1}`,
      color: item.color,
      sampleCode: `${id}-L${j + 1}-SAMPLE`,
      colorMatchStandard: faker.helpers.arrayElement(['依客戶留樣', '依上批色差±3%', '依標準色卡']),
      // 單卷碼數＝該筆明細定碼長度換算的每卷碼數，非整批商品總數
      rollYard: defaultRollYard(item.fixedLengthMeter) ?? undefined,
      fabricMaterial: product?.material ?? faker.helpers.arrayElement(FABRIC_MATERIALS),
      fabricSpec: product?.greigeSpec ?? '',
      finishedSpec: product?.finishedSpec ?? '',
      unitPrice: faker.number.float({ min: 15, max: 45, fractionDigits: 1 }),
      // 三段式庫存：胚布到廠確認前一律為待染，到廠後轉指染，大貨樣通過後轉成品
      pendingDyeQty: status === '已完成' || greigeArrived ? 0 : totalQty,
      inDyeQty: status === '生效' && greigeArrived ? totalQty : 0,
      finishedQty: status === '已完成' ? totalQty : 0,
    }
  })

  return {
    id,
    parentId: pn.id,
    status,
    dueDate: createdAt.add(14, 'day').toISOString(),
    productName: pn.items[0]?.roricaProductName ?? '',
    productId: pn.items[0]?.productId,
    embossing: pn.embossing.join('、'),
    colorRatioNote: pn.colorRatio.mode === '客人指定' ? `客人指定：${pn.colorRatio.customText ?? ''}` : '空白',
    vendorId: faker.helpers.arrayElement(vendors.filter((v) => v.types.includes('染整廠'))).id,
    internalContact: faker.helpers.arrayElement(['陳美玲', '林志豪']),
    note: faker.helpers.arrayElement(['厚染', '', '厚染，需加強色牢度', '']),
    items,
    greigeFabricCode: `T${faker.string.numeric(7)}`,
    shippingSampleQty: 0.5,
    effectiveAt: status === '草稿' ? undefined : createdAt.add(1, 'day').toISOString(),
    // 胚布直送染整廠，到廠確認的當下才把待染轉為指染
    greigeArrivedAt: greigeArrived ? createdAt.add(2, 'day').toISOString() : undefined,
    // 大貨樣「通過」即結案，故僅已完成單有確認日與送樣紀錄；生效中的單尚未通過
    largeSampleConfirmedAt: status === '已完成' ? createdAt.add(4, 'day').toISOString() : undefined,
    largeSampleSubmissions:
      status === '已完成'
        ? [{ id: `${id}-SAMPLE1`, submittedAt: createdAt.add(4, 'day').toISOString(), result: '通過' as const }]
        : undefined,
    unit: 'Yard',
  }
})

const RECEIPT_SOURCES: GoodsReceipt['source'][] = ['委外加工', '直採大貨-成品', '直採大貨-胚布']
const RECEIPT_STATUSES: GoodsReceipt['status'][] = ['草稿', '已複核', '已完成']

export const goodsReceipts: GoodsReceipt[] = packingNotices.slice(0, 8).map((pn, i) => {
  const createdAt = dayjs(pn.createdAt).add(10, 'day')
  const status = RECEIPT_STATUSES[i % RECEIPT_STATUSES.length]
  const rollCount = faker.number.int({ min: 2, max: 6 })
  const rolls = Array.from({ length: rollCount }).map((_, r) => {
    const length = faker.number.int({ min: 30, max: 100 })
    const ocrConfidence = faker.helpers.arrayElement(['高', '高', '高', '低', '人工輸入']) as GoodsReceiptRollConfidence
    return {
      rollNo: `${r + 1}`,
      // 批號來自廠商單據（OCR 帶入或倉管補填），可能為兩組代碼並列
      batchCode: `批${faker.number.int({ min: 1, max: 20 })} P${faker.string.numeric(3)}`,
      length,
      meter: Number(yardToMeter(length).toFixed(1)),
      weight: faker.number.float({ min: 8, max: 30, fractionDigits: 1 }),
      ocrConfidence,
      reviewed: ocrConfidence !== '低' ? true : faker.datatype.boolean({ probability: 0.4 }),
    }
  })
  const source = RECEIPT_SOURCES[i % RECEIPT_SOURCES.length]
  const totalLength = rolls.reduce((sum, r) => sum + r.length, 0)
  const vendor = faker.helpers.arrayElement(vendors)
  /**
   * 關聯單據以實際單號記錄：委外加工路徑掛染單（若該張表1有二次加工單則掛二次加工單，
   * 對應「染完還要加工、加工完才進倉」的觸發點），直採大貨路徑掛對應的訂購單。
   */
  const related: { type: GoodsReceipt['relatedDocType']; id: string } | undefined =
    source === '委外加工'
      ? (() => {
          const dye = dyeOrders.find((d) => d.parentId === pn.id)
          return dye ? { type: '染單' as const, id: dye.id } : undefined
        })()
      : (() => {
          const po = purchaseOrders.find((o) => o.parentId === pn.id)
          return po ? { type: source === '直採大貨-成品' ? ('成品訂單' as const) : ('胚布訂單' as const), id: po.id } : undefined
        })()
  return {
    id: `${pn.id}-R1`,
    parentId: pn.id,
    source,
    relatedDocType: related?.type,
    relatedDocId: related?.id,
    status,
    receiptDate: createdAt.toISOString(),
    operatorAccountId: faker.helpers.arrayElement(accounts.filter((a) => a.roles.includes('倉管'))).id,
    vendorId: vendor.id,
    vendorShipmentNo: `${vendor.code}-${faker.string.numeric(6)}`,
    vendorShipDate: createdAt.subtract(1, 'day').toISOString(),
    receiptAttachmentName: faker.helpers.arrayElement(['receipt-scan.pdf', 'invoice-photo.jpg', undefined]),
    rolls,
    // 縮率僅委外加工送染整路徑適用，投胚量略高於實收總碼數以呈現合理損耗
    pledgedQty: source === '委外加工' ? Math.round(totalLength * faker.number.float({ min: 1.02, max: 1.08 })) : undefined,
    purpose: faker.helpers.arrayElement(GOODS_RECEIPT_PURPOSES),
  }
})

type GoodsReceiptRollConfidence = GoodsReceipt['rolls'][number]['ocrConfidence']

const LABEL_STATUSES: FabricLabel['status'][] = ['已建立', '已使用', '已完成']

/**
 * 條碼流水號：格式為「胚布編號＋流水號」，同一個胚布編號的流水號必須全檔連續且唯一——
 * 條碼是布卷的身分，出貨扣帳、退貨復活、瑕疵標記全部以條碼解析布卷，
 * 若不同入庫單各自從 01 起編就會撞號，扣到別人的庫存。
 */
const rollSeqByPrefix = new Map<string, number>()
function nextRollCode(prefix: string): string {
  const seq = (rollSeqByPrefix.get(prefix) ?? 0) + 1
  rollSeqByPrefix.set(prefix, seq)
  return `${prefix}-${pad(seq, 2)}`
}

export const fabricLabels: FabricLabel[] = goodsReceipts.flatMap((gr) =>
  gr.rolls.map((roll, i) => {
    const product = faker.helpers.arrayElement(products)
    return {
      id: `${gr.id}-L${roll.rollNo}`,
      receiptId: gr.id,
      rollCode: nextRollCode(product.greigeFabricCode ?? 'T0000000'),
      productName: product.productName,
      productId: product.id,
      composition: product.material,
      color: faker.helpers.arrayElement(COLOR_NAMES),
      width: product.width,
      batchCode: roll.batchCode,
      length: roll.length,
      unit: 'Yard',
      status: LABEL_STATUSES[i % LABEL_STATUSES.length],
    }
  }),
)

// ---------- 庫存預留（流程一：有現貨與無現貨總覽） ----------
// 業務建立包裝通知單時，系統即時查詢庫存並判斷可用庫存（實際庫存－已預留未出貨），
// 足夠則自動建立庫存預留紀錄：綁定客戶／記錄捲號批次／14天效期到期自動釋放。

export const stockReservations: StockReservation[] = packingNotices
  .slice(0, 5)
  .map((pn, i): StockReservation | undefined => {
    const item = pn.items[0]
    if (!item) return undefined
    const matchingRolls = fabricLabels.filter(
      (l) => l.productName === item.roricaProductName && l.color === item.color && l.status === '已建立',
    )
    if (matchingRolls.length === 0) return undefined
    const rollsToReserve = matchingRolls.slice(0, Math.min(2, matchingRolls.length))
    const reservedQty = rollsToReserve.reduce((sum, r) => sum + r.length, 0)
    // 前兩筆刻意設為已逾 14 天效期，示範自動釋放邏輯
    const createdAt = dayjs(pn.createdAt).add(1, 'day').subtract(i < 2 ? 20 : 0, 'day').toISOString()
    return {
      id: `${pn.id}-RES1`,
      packingNoticeId: pn.id,
      packingNoticeItemId: item.id,
      customerId: pn.customerId,
      productName: item.roricaProductName,
      color: item.color,
      rollCodes: rollsToReserve.map((r) => r.rollCode),
      qty: reservedQty,
      unit: 'Yard',
      status: '預留中',
      createdAt,
      expiresAt: reservationExpiresAt(createdAt).toISOString(),
    }
  })
  .filter((r): r is StockReservation => r !== undefined)

const SHIPPING_STATUSES: ShippingOrder['status'][] = ['草稿', '已建立', '已完成']

export const shippingOrders: ShippingOrder[] = packingNotices.slice(0, 6).map((pn, i) => {
  const createdAt = dayjs(pn.createdAt).add(15, 'day')
  const status = SHIPPING_STATUSES[i % SHIPPING_STATUSES.length]
  const items = pn.items.map((item, j) => {
    const yard = faker.number.int({ min: 20, max: 100 })
    return {
      customerProductName: item.customerProductName,
      roricaProductName: item.roricaProductName,
      color: item.color,
      sourceItemId: item.id,
      // 布卷條碼規則為「胚布編號-流水號」，取該品項對應產品分支的胚布編號；
      // 一筆明細可對應多個捲號（拼接出貨即記錄實際使用的捲號組合）
      rollCodes: [`${resolveProduct(item.productId, item.roricaProductName)?.greigeFabricCode ?? 'T0000000'}-${j + 1}`],
      yard,
      meter: Number(yardToMeter(yard).toFixed(1)),
      unitPrice: faker.number.float({ min: 90, max: 220, fractionDigits: 1 }),
      note: item.note,
    }
  })
  return {
    id: `${pn.id}-S1`,
    parentId: pn.id,
    customerId: pn.customerId,
    status,
    shipDate: createdAt.toISOString(),
    isSampleOrder: faker.datatype.boolean({ probability: 0.2 }),
    items,
    operatorAccountId: faker.helpers.arrayElement(accounts.filter((a) => a.roles.includes('倉管'))).id,
    purpose: faker.helpers.arrayElement(GOODS_RECEIPT_PURPOSES),
    signatures:
      status === '已完成'
        ? {
            processedBy: faker.person.firstName(),
            warehouse: faker.person.firstName(),
            shipped: faker.person.firstName(),
            sales: faker.person.firstName(),
          }
        : undefined,
  }
})

const SECONDARY_PROCESSING_STATUSES: SecondaryProcessingOrder['status'][] = ['草稿', '生效', '已完成']

/**
 * 表5 二次加工單：僅針對表1明細中「有指定加工方法」的品項開單，
 * 故種子資料只挑得出加工品項的包裝通知單來建立。
 */
export const secondaryProcessingOrders: SecondaryProcessingOrder[] = packingNotices
  .filter((pn) => pn.items.some((item) => item.processingMethod))
  .slice(0, 5)
  .map((pn, i) => {
    const createdAt = dayjs(pn.createdAt).add(2, 'day')
    const status = SECONDARY_PROCESSING_STATUSES[i % SECONDARY_PROCESSING_STATUSES.length]
    const vendor = faker.helpers.arrayElement(vendors)
    const processingItems = pn.items.filter((item) => item.processingMethod)

    return {
      id: `${pn.id}-X1`,
      parentId: pn.id,
      // 來源染單：模擬「表4結案自動建立表5」的情境，供入庫單沿鏈回推
      dyeOrderId: dyeOrders.find((d) => d.parentId === pn.id)?.id,
      customerId: pn.customerId,
      status,
      createdAt: createdAt.toISOString(),
      effectiveAt: status === '草稿' ? undefined : createdAt.add(1, 'day').toISOString(),
      dueDate: pn.expectedDeliveryAt,
      vendorId: vendor.id,
      vendorContactPerson: vendor.contactPerson,
      vendorPhone: vendor.phone,
      vendorAddress: vendor.address,
      internalContact: faker.helpers.arrayElement(accounts.filter((a) => a.roles.includes('生管'))).name,
      note: faker.helpers.arrayElement(['', '', '加工後直接送客戶指定倉庫']),
      items: processingItems.map((item, j) => ({
        id: `${pn.id}-X1-L${j + 1}`,
        sourceItemId: item.id,
        customerProductName: item.customerProductName,
        roricaProductName: item.roricaProductName,
        productId: item.productId,
        color: item.color,
        yard: item.yard,
        meter: item.meter,
        processingMethod: item.processingMethod,
        processingMethodNote: item.processingMethodNote,
        unitPrice: faker.number.float({ min: 3, max: 20, fractionDigits: 1 }),
        note: item.note,
      })),
      packaging: buildSecondaryProcessingPackaging(pn),
    }
  })

/**
 * 接疋拼接組合建議：系統於表1判斷可用庫存需靠零星捲拼接才夠時產生，
 * 待生管確認採用（才建立庫存預留）或改判不接疋（改整捲＋裁切）。
 * 種子資料不預設待確認項目，由實際建單流程即時產生。
 */
export const splicingSuggestions: SplicingSuggestion[] = []

/**
 * 委外加工路徑有兩個觸發點：染單結案（染完直接進倉）與二次加工單結案（染完還要加工，加工完才進倉）。
 * 種子資料的入庫單建於二次加工單之前，故於此後處理：該張表1若有二次加工單，
 * 入庫單的關聯單據改掛二次加工單，讓兩個觸發點在模擬資料裡都看得到。
 */
goodsReceipts.forEach((receipt, i) => {
  if (receipt.source !== '委外加工') return
  const spo = secondaryProcessingOrders.find((o) => o.parentId === receipt.parentId)
  if (!spo) return
  goodsReceipts[i] = { ...receipt, relatedDocType: '二次加工單', relatedDocId: spo.id }
})

// ---------- 測試階段暫存（sessionStorage） ----------
// Prototype 用假資料為記憶體陣列，重新整理頁面時模組會重新執行、資料即重置。
// 為了讓使用者能連貫測試表1→表8整條流程且不怕誤按重新整理，
// 將目前這次瀏覽分頁的異動快照存入 sessionStorage（分頁關閉即自動清除，
// 不影響其他分頁或下次開啟時的預設模擬資料），頁面重新整理時優先還原此快照。


// ---------- 表9 異常通知單（客訴／退貨，PRD 補充文件 2026/08/31） ----------
// 客訴分兩條路徑：①不退貨（依異常程度向廠商申請扣款）②退貨（退貨＋運費＋退款）；
// 處理方式為可複選，故種子資料刻意做一筆「同時退貨＋補貨換貨」的單，對應紙本範例 M-202602。

const abnormalSourceOrders = shippingOrders.filter((so) => so.status === '已完成' && so.items.length > 0).slice(0, 2)

/** 同批未出貨庫存亦有異常時連動標記的條碼：挑未被預留占用的可用捲，避免與庫存預留種子資料打架 */
const reservedRollCodes = new Set(stockReservations.flatMap((r) => r.rollCodes))
const batchDefectLabels = fabricLabels
  .filter((l) => l.status === '已建立' && !reservedRollCodes.has(l.rollCode))
  .slice(0, 3)

const salesAccountId = (accounts.find((a) => a.roles.includes('業務')) ?? accounts[0]).id

/** 追溯鍵：有染單走生產編號（→表4），純採購沒有生產編號，改以訂購單（→表2）為追溯鍵 */
function abnormalTraceKeys(parentId: string): Pick<AbnormalNotice, 'productionCode' | 'dyeOrderId' | 'purchaseOrderId'> {
  const dyeOrder = dyeOrders.find((d) => d.parentId === parentId)
  if (dyeOrder) {
    return { productionCode: `J${dayjs(dyeOrder.effectiveAt ?? dyeOrder.dueDate).format('YYMMDD')}C`, dyeOrderId: dyeOrder.id }
  }
  return { purchaseOrderId: purchaseOrders.find((po) => po.parentId === parentId)?.id }
}

export const abnormalNotices: AbnormalNotice[] = abnormalSourceOrders.flatMap((so, i) => {
  const item = so.items[0]
  const noticeDate = dayjs(so.shipDate).add(20 + i * 5, 'day')
  const id = `AB-${noticeDate.format('YYYYMMDD')}-${pad(i + 1)}`
  const shippedQty = item.yard
  const trace = abnormalTraceKeys(so.parentId)
  const base = {
    id,
    kind: '客訴異常' as const,
    createdAt: noticeDate.toISOString(),
    noticeDate: noticeDate.toISOString(),
    createdByAccountId: salesAccountId,
    customerId: so.customerId,
    ...trace,
    shippingOrderId: so.id,
    shipDate: so.shipDate,
    productName: item.roricaProductName ?? '',
    color: item.color ?? '',
    shippedQty,
    unit: 'Yard' as const,
  }

  if (i === 0) {
    // 紙本範例情境：同一張異常單同時處理「退貨」與「額外補償出貨」
    const returnYard = Number((shippedQty * 0.6).toFixed(1))
    const notice: AbnormalNotice = {
      ...base,
      status: '處理中',
      abnormalQty: returnYard,
      categoryName: '手感問題',
      categoryItem: '太軟',
      issueNote: `${dayjs(so.shipDate).format('M/D')} 安排出貨 ${shippedQty} 碼，客戶反映手感不對太軟。`,
      handling: {
        returnGoods: { yard: returnYard, feeEstimate: 'NT 9,000~10,000' },
        replacement: { yard: Number((shippedQty * 0.2).toFixed(1)), freightEstimate: 'NT 3,000~4,000（空運）' },
      },
      batchDefectRollCodes: batchDefectLabels.map((l) => l.rollCode),
      returnedRolls: [
        { rollCode: item.rollCodes[0], yard: returnYard, verdict: '待複核' },
      ],
      productionReply: '已請染整廠回覆手感異常原因，退回布另行複核良品／瑕疵。',
      processedAt: noticeDate.add(2, 'day').toISOString(),
    }
    return [notice]
  }

  const notice: AbnormalNotice = {
    ...base,
    status: '已完成',
    abnormalQty: Number((shippedQty * 0.15).toFixed(1)),
    categoryName: '顏色問題',
    categoryItem: '色差',
    issueNote: '客戶反映左右色差，僅部分異常，協議不退貨改為折讓扣款。',
    handling: {
      deduction: {
        amount: 12000,
        upstreamVendorId: (vendors.find((v) => v.types.includes('染整廠')) ?? vendors[0]).id,
      },
    },
    batchDefectRollCodes: [],
    productionReply: '已依異常程度與染整廠議定扣款金額。',
    processedAt: noticeDate.add(1, 'day').toISOString(),
    completedAt: noticeDate.add(10, 'day').toISOString(),
  }
  return [notice]
})

// 上游追討附單：客訴後回頭向染整廠追討，掛在該張表9底下（欄位暫時與表9相同）
if (abnormalNotices.length > 0) {
  const parent = abnormalNotices[0]
  abnormalNotices.push({
    ...parent,
    id: `${parent.id}-U1`,
    kind: '上游追討',
    parentAbnormalId: parent.id,
    status: '受理中',
    createdAt: dayjs(parent.createdAt).add(3, 'day').toISOString(),
    noticeDate: dayjs(parent.noticeDate).add(3, 'day').toISOString(),
    handling: {
      deduction: { upstreamVendorId: (vendors.find((v) => v.types.includes('染整廠')) ?? vendors[0]).id },
    },
    batchDefectRollCodes: [],
    returnedRolls: undefined,
    productionReply: undefined,
    processedAt: undefined,
    completedAt: undefined,
    issueNote: '客戶客訴手感異常，回頭向染整廠追討加工費與退款。',
  })
}

// 種子資料中已連動標記的同批條碼：狀態同步為瑕疵／報廢，否則庫存查詢仍會把它們算成可用
batchDefectLabels.forEach((label) => {
  const idx = fabricLabels.findIndex((l) => l.id === label.id)
  if (idx !== -1) {
    fabricLabels[idx] = {
      ...fabricLabels[idx],
      status: '瑕疵／報廢',
      defectedAt: abnormalNotices[0]?.noticeDate,
      defectNote: `同批庫存連動標記（${abnormalNotices[0]?.id ?? ''}）`,
    }
  }
})

const SESSION_STORAGE_KEY = 'rorica-erp-session-snapshot-v1'

interface SessionSnapshot {
  packingNotices: PackingNotice[]
  purchaseOrders: PurchaseOrder[]
  dyeRequests: DyeRequest[]
  dyeOrders: DyeOrder[]
  goodsReceipts: GoodsReceipt[]
  fabricLabels: FabricLabel[]
  shippingOrders: ShippingOrder[]
  abnormalNotices: AbnormalNotice[]
  secondaryProcessingOrders: SecondaryProcessingOrder[]
  stockReservations: StockReservation[]
  splicingSuggestions: SplicingSuggestion[]
  /** 主檔亦納入快照：商品資料可於編輯視窗異動，客戶主檔則會在表1輸入新客戶名稱時自動建立 */
  products: Product[]
  customers: Customer[]
  vendors: Vendor[]
}

/** 每次 mutation 完成後呼叫，將目前異動快照寫入本分頁的 sessionStorage */
export function persistSessionSnapshot(): void {
  try {
    const snapshot: SessionSnapshot = {
      packingNotices,
      purchaseOrders,
      dyeRequests,
      dyeOrders,
      goodsReceipts,
      fabricLabels,
      shippingOrders,
      abnormalNotices,
      secondaryProcessingOrders,
      stockReservations,
      splicingSuggestions,
      products,
      customers,
      vendors,
    }
    sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(snapshot))
  } catch {
    // sessionStorage 不可用（如隱私瀏覽模式）時靜默略過，不影響操作
  }
}

/** 模組載入時呼叫：若本分頁先前有暫存快照，還原之（覆蓋預設種子資料） */
function restoreSessionSnapshot(): void {
  try {
    const raw = sessionStorage.getItem(SESSION_STORAGE_KEY)
    if (!raw) return
    const snapshot = JSON.parse(raw) as SessionSnapshot
    packingNotices.splice(0, packingNotices.length, ...snapshot.packingNotices)
    purchaseOrders.splice(0, purchaseOrders.length, ...snapshot.purchaseOrders)
    dyeRequests.splice(0, dyeRequests.length, ...snapshot.dyeRequests)
    dyeOrders.splice(0, dyeOrders.length, ...snapshot.dyeOrders)
    goodsReceipts.splice(0, goodsReceipts.length, ...snapshot.goodsReceipts)
    fabricLabels.splice(0, fabricLabels.length, ...snapshot.fabricLabels)
    shippingOrders.splice(0, shippingOrders.length, ...snapshot.shippingOrders)
    // 表9為後續新增的快照欄位，舊快照沒有時沿用種子資料
    if (snapshot.abnormalNotices) abnormalNotices.splice(0, abnormalNotices.length, ...snapshot.abnormalNotices)
    if (snapshot.secondaryProcessingOrders)
      secondaryProcessingOrders.splice(0, secondaryProcessingOrders.length, ...snapshot.secondaryProcessingOrders)
    stockReservations.splice(0, stockReservations.length, ...snapshot.stockReservations)
    if (snapshot.splicingSuggestions)
      splicingSuggestions.splice(0, splicingSuggestions.length, ...snapshot.splicingSuggestions)
    // 主檔為後續新增的快照欄位，舊快照可能沒有，缺少時沿用種子資料
    if (snapshot.products) products.splice(0, products.length, ...snapshot.products)
    if (snapshot.customers) customers.splice(0, customers.length, ...snapshot.customers)
    if (snapshot.vendors) vendors.splice(0, vendors.length, ...snapshot.vendors)
  } catch {
    // 快照損毀或無法解析時，保留預設種子資料，不中斷應用程式啟動
  }
}

/** 清除本分頁暫存快照，下次重新整理將回到預設模擬資料（供「重置模擬資料」按鈕使用） */
export function clearSessionSnapshot(): void {
  try {
    sessionStorage.removeItem(SESSION_STORAGE_KEY)
  } catch {
    // 忽略
  }
}

restoreSessionSnapshot()

export function getCustomer(id: string): Customer | undefined {
  return customers.find((c) => c.id === id)
}

export function getVendor(id: string): Vendor | undefined {
  return vendors.find((v) => v.id === id)
}

/** 染整廠格式為「名稱＋廠點」，如「義裕A」；無廠點代號則僅顯示名稱 */
export function vendorDisplayName(vendor: Vendor | undefined): string {
  if (!vendor) return ''
  return vendor.siteCode ? `${vendor.name}${vendor.siteCode}` : vendor.name
}

export function getProduct(id: string): Product | undefined {
  return products.find((p) => p.id === id)
}

/**
 * 由單據明細反查商品資料主檔：優先用產品編號（可精準指到規格分支），
 * 查無或明細未帶產品編號時才退回以皇加品名比對——後者在同品名有多個分支時只會取到第一個分支，
 * 屬相容舊資料的後備路徑，不是預期行為。
 */
export function resolveProduct(productId: string | undefined, productName: string | undefined): Product | undefined {
  if (productId) {
    const byId = products.find((p) => p.id === productId)
    if (byId) return byId
  }
  return productName ? products.find((p) => p.productName === productName.trim()) : undefined
}

/**
 * 單據明細用的分支後綴：該品名有多個分支時回傳「-02」，只有單一分支時回傳空字串。
 * 讓表格在不加欄位的前提下也能看出這筆明細指的是哪一個規格分支。
 */
export function productBranchSuffix(productId: string | undefined): string {
  const product = productId ? products.find((p) => p.id === productId) : undefined
  if (!product) return ''
  const hasSiblings = products.some((p) => p.id !== product.id && p.productName === product.productName)
  return hasSiblings ? `-${product.sortNo}` : ''
}

/** 產品分支顯示標籤：同品名有多個分支時附上序號與關鍵規格，供下拉選單辨識 */
export function productBranchLabel(product: Product): string {
  const hasSiblings = products.some((p) => p.id !== product.id && p.productName === product.productName)
  return hasSiblings ? `${product.productName}-${product.sortNo}（${product.width}"／${product.weightGY}G/Y）` : product.productName
}

export function getAccount(id: string): Account | undefined {
  return accounts.find((a) => a.id === id)
}

export function getCategoryLabel(code: string): string {
  const cat = PRODUCT_CATEGORIES.find((c) => c.code === code)
  return cat ? `${cat.code}-${cat.zh}` : code
}
