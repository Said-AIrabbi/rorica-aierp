import { faker } from '@faker-js/faker'
import dayjs from 'dayjs'
import { yardToMeter, yardWeightToMeterWeight } from '@/lib/units'
import { reservationExpiresAt } from '@/lib/inventory'
import { buildSecondaryProcessingPackaging, defaultRollYard } from '@/lib/workflow'
import { PI_PAYMENT_TERM_TEMPLATES, piQuoteValidUntil } from '@/lib/pi'
import { PRODUCT_CATALOG } from './product-catalog'
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
  ProformaInvoice,
  ProformaInvoiceItem,
  PurchaseOrder,
  SecondaryProcessingOrder,
  ShippingOrder,
  SplicingSuggestion,
  StockReservation,
  Vendor,
  VendorType,
} from '@/types'
import {
  EMBOSSING_OPTIONS,
  FIXED_ROLL_PACKING_METHODS,
  GOODS_RECEIPT_PURPOSES,
  LABEL_TYPES,
  MARKING_SHAPES,
  PACKAGING_TYPES,
  PACKING_METHODS,
  PI_CURRENCIES,
  PI_LEAD_TIME_DAYS,
  PI_PORTS,
  PI_TRADE_TERMS,
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

/** 胚布規格常見的經緯紗支數寫法，供商品資料主檔「胚布規格」欄位模擬用 */
const GREIGE_YARN_SPECS = ['75D/72F × 150D/48F', '50D/24F × 75D/36F', '30D/24F × 50D/48F', '100D/144F × 100D/144F']

/** 各加工方法的說明範例：實務上這欄由業務依客戶要求逐單填寫，此處僅供模擬 */
const PROCESSING_METHOD_NOTE_SAMPLES: Record<(typeof PROCESSING_METHODS)[number], string> = {
  上膠: '背面上透明膠，膠層薄不反光',
  壓褶: '直條褶，褶距 1.5cm',
  壓光: '高溫壓光一次，正面亮度提升',
  膠印: '客供圖檔，單色膠印',
  噴蔥: '全幅噴蔥，去除多餘漿料',
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
  // 聯絡資訊可有多組：第一組為主要聯絡人，部分客戶另有第二窗口（如倉庫收貨聯絡人）
  contacts: [
    {
      name: faker.person.fullName(),
      email: `${faker.internet.username().toLowerCase()}@example.com`,
      phone: faker.phone.number({ style: 'international' }),
      mobile: faker.phone.number({ style: 'international' }),
      shippingAddress: `台北市大同區重慶北路${faker.number.int({ min: 1, max: 300 })}號`,
      bankAccount: `第一銀行 圓山分行 ${faker.string.numeric(3)}-${faker.string.numeric(8)}`,
    },
    ...(i % 2 === 0
      ? [
          {
            name: faker.person.fullName(),
            email: `${faker.internet.username().toLowerCase()}@example.com`,
            mobile: faker.phone.number({ style: 'international' }),
            shippingAddress: `新北市五股區工商路${faker.number.int({ min: 1, max: 200 })}號（倉庫收貨）`,
          },
        ]
      : []),
  ],
  address: `台北市大同區重慶北路${faker.number.int({ min: 1, max: 300 })}號${faker.number.int({ min: 1, max: 10 })}樓`,
  invoiceAddress: `台北市大同區重慶北路${faker.number.int({ min: 1, max: 300 })}號${faker.number.int({ min: 1, max: 10 })}樓`,
  taxId: faker.string.numeric(8),
  // 國外稅務統編：僅國外客戶有，故只給英文名客戶（展示兩種情況的畫面呈現）
  foreignTaxId: /^[A-Za-z]/.test(c.short) ? `VAT-${faker.string.alphanumeric(9).toUpperCase()}` : undefined,
  taxRate: '5%',
  paymentTerms: faker.helpers.arrayElement(['月結30天', '月結45天', '月結60天', '訂金30%/出貨前付清']),
  leadTimeDays: 14,
  // 往來等級分佈：多數為 A／B，最後一家設為已歇業，方便看出停用客戶的呈現
  status: i === CUSTOMER_NAMES.length - 1 ? '已歇業' : faker.helpers.arrayElement(['A level', 'A level', 'B level', 'C level']),
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
 * 商品資料主檔：直接建自皇加產品表（見 product-catalog.ts），不再產生虛構品名。
 *
 * 產品表沒有的欄位（所屬客戶、客戶品名、胚布編號、胚布規格、歷史色卡、原疋標準尺寸）
 * 仍為展示用模擬值；產品表有的欄位一律照原表，不補值、不修正。
 * 牌價兩欄在原表為空白，故進價／售價一律留空，畫面上顯示「-」。
 */

/** 產品分支序號：同一皇加品名底下由 01 開始遞增（產品表中 N120 有 60"／120" 兩個分支） */
const branchCounter = new Map<string, number>()

/** 同一皇加品名的各分支共用所屬客戶與客戶品名，差異只在規格數值 */
const productBaseByName = new Map(
  [...new Set(PRODUCT_CATALOG.map((row) => row.item))].map((item) => {
    const customer = faker.helpers.arrayElement(customers)
    return [item, { customer, customerProductName: `${customer.shortName}#${faker.string.alphanumeric(4).toUpperCase()}` }]
  }),
)

export const products: Product[] = PRODUCT_CATALOG.map((row) => {
  const base = productBaseByName.get(row.item)!
  const category = PRODUCT_CATEGORIES.find((c) => c.code === row.categoryCode)!
  const branchNo = (branchCounter.get(row.item) ?? 0) + 1
  branchCounter.set(row.item, branchNo)
  const customer = base.customer
  // 產品表未列碼重／幅寬／厚度者（法國蕾絲、繽紛系列、部分 300CM 產品、配件）以 0 表示未提供，畫面顯示「-」
  const weightGY = row.weightGY ?? 0
  const width = row.width ?? 0
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

  return {
    // 記錄識別碼＝產品編號-產品序號：N120 的 60" 與 120" 同為 8-13，靠分支序號區分
    id: `${row.productCode}-${pad(branchNo, 2)}`,
    productCode: row.productCode,
    customerId: customer.id,
    productName: row.item,
    customerProductName: base.customerProductName,
    greigeFabricCode: `T${faker.string.numeric(7)}`,
    categoryCode: category.code,
    sortNo: pad(branchNo, 2),
    material: row.composition,
    greigeSpec: [row.composition, faker.helpers.arrayElement(GREIGE_YARN_SPECS)].filter(Boolean).join(' '),
    finishedSpec: [row.widthSpec, weightGY ? `${weightGY}G/Y` : '', category.zh].filter(Boolean).join(' '),
    colors,
    thicknessMm: row.thicknessMm ?? 0,
    characteristics: row.characteristics ?? '',
    width,
    widthSpec: row.widthSpec,
    widthTolerancePct: 5,
    weightGY,
    weightTolerancePct: 5,
    weightMY: weightGY ? Number(yardWeightToMeterWeight(weightGY).toFixed(2)) : 0,
    // 原疋標準尺寸必然大於客戶要求的捲長（表1需求多為 40~65 碼），故取 80 碼以上
    originalRollStandardYard: faker.helpers.arrayElement([80, 100, 120]),
    // 產品表的牌價(Y)／牌價(M) 兩欄整份為空白，故不給展示值
    costPrice: undefined,
    sellPrice: undefined,
  }
})

/**
 * 可下單的商品：產品表中尚未提供碼重／幅寬的品項（法國蕾絲、繽紛系列、部分 300CM 產品、配件）
 * 規格不全，開單與布卷標籤都算不出數量，故展示資料只從有完整規格者挑選。
 * 這些品項仍在商品主檔中，可於主檔頁面查閱。
 */
const orderableProducts = products.filter((p) => p.width > 0 && p.weightGY > 0)

function randomOrderId(index: number, daysAgo: number) {
  const date = dayjs().subtract(daysAgo, 'day')
  return `ORD-${date.format('YYYYMMDD')}-${pad(index)}`
}

const PACKING_STATUSES: PackingNotice['status'][] = ['草稿', '生效', '已完成']

/** 建單業務輪流掛，讓「建單者不得自行簽核」這條在展示資料上也成立 */
const seedSalesAccounts = accounts.filter((a) => a.roles.includes('業務'))
const salesAccountIdForSeed = (i: number) =>
  (seedSalesAccounts[i % seedSalesAccounts.length] ?? accounts[0]).id
const managerAccountId = (accounts.find((a) => a.roles.includes('管理層')) ?? accounts[0]).id

export const packingNotices: PackingNotice[] = Array.from({ length: 10 }).map((_, i) => {
  const daysAgo = faker.number.int({ min: 0, max: 60 })
  const id = randomOrderId(i + 1, daysAgo)
  const createdAt = dayjs().subtract(daysAgo, 'day')
  const status = PACKING_STATUSES[i % PACKING_STATUSES.length]
  const customer = faker.helpers.arrayElement(customers)
  const itemCount = faker.number.int({ min: 1, max: 4 })
  const shipMethod = faker.helpers.arrayElements(SHIP_METHODS, { min: 1, max: 2 })
  // 嘜頭形狀先決定，抬頭文字的格式（形狀內短字樣 vs A5 多行公司抬頭）要跟著它走
  const markingShape = faker.helpers.arrayElement(MARKING_SHAPES)
  // 第二組嘜頭刻意給不同形狀，讓多組嘜頭的畫面與列印差異看得出來
  const secondMarkingShape = faker.helpers.arrayElement(MARKING_SHAPES.filter((s) => s !== markingShape))
  /** 抬頭文字依形狀給格式：三角形／菱形只放得下短字樣；A5大小沒有形狀、整段印在最上方，才是多行公司抬頭 */
  const markingHeaderText = (shape: (typeof MARKING_SHAPES)[number]) =>
    shape === 'A5大小'
      ? [
          customer.fullNameEN,
          faker.helpers.arrayElement(['JEDDAH, K.S.A.', 'XIAMEN, CHINA', 'HO CHI MINH, VIETNAM']),
          `TEL：${customer.personInChargePhone}`,
        ].join('\n')
      : faker.helpers.arrayElement(['FASHION', 'G.L', 'BRIDAL', 'RORICA'])

  const items: PackingNoticeItem[] = Array.from({ length: itemCount }).map((_, j) => {
    const product = faker.helpers.arrayElement(orderableProducts)
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
      // 彩條改為明細層級（決策105）：不同顏色／材質的品項各自可能有不同彩條要求，
      // 最多 3 組；多數品項為空白（不指定）
      colorRatios: faker.helpers.arrayElement([
        [],
        [],
        ['依訂單指定色比±5%'],
        ['彩條 3cm 紅／白', '邊條 1cm 金'],
        ['主條 5cm 藍', '副條 2cm 白', '邊條 1cm 銀'],
      ]),
      note: faker.helpers.arrayElement(['', '', '客戶指定紙管顏色', '']),
    }
  })

  // 決策118：草稿的簽核旗標。第一張草稿留在「未送簽」（可按送簽），
  // 其餘草稿放「待簽核」，讓管理層一進系統就有東西可簽、也看得到退回按鈕。
  const approvalState: PackingNotice['approvalState'] =
    status !== '草稿' ? '已簽核' : i % 2 === 0 ? '未送簽' : '待簽核'

  return {
    id,
    customerId: customer.id,
    customerOrderNo: `${customer.code}-${faker.string.numeric(5)}`,
    status,
    approvalState,
    // 建單者：職責分離要用（建單者不得自行簽核），故種子也要記
    createdByAccountId: salesAccountIdForSeed(i),
    submittedAt: approvalState === '待簽核' ? createdAt.add(1, 'hour').toISOString() : undefined,
    approvedAt: status !== '草稿' ? createdAt.add(1, 'day').toISOString() : undefined,
    approvedByAccountId: status !== '草稿' ? managerAccountId : undefined,
    createdAt: createdAt.toISOString(),
    effectiveAt: status === '草稿' ? undefined : createdAt.add(1, 'day').toISOString(),
    expectedDeliveryAt: createdAt.add(customer.leadTimeDays, 'day').toISOString(),
    // 出貨樣數量：半碼一單位，上限 20 碼；部分訂單另有文字說明（誰的樣、寄哪、剪法）
    sampleQty: faker.number.int({ min: 0, max: 40 }) * 0.5,
    sampleQtyNote: faker.helpers.arrayElement([
      undefined,
      undefined,
      '每色各剪一段，隨大貨寄客戶樣品室',
      '業務留樣，不隨大貨出',
    ]),
    shipMethod,
    shipMethodNote: shipMethod.includes('其他') ? '客戶指定貨運行代收' : undefined,
    labelTypes: faker.helpers.arrayElements(LABEL_TYPES, { min: 1, max: LABEL_TYPES.length }),
    packagingType: faker.helpers.arrayElement(PACKAGING_TYPES),
    tolerance:
      faker.helpers.arrayElement(TOLERANCE_MODES) === '其他'
        ? { mode: '其他' as const, customText: '依客戶指示另訂' }
        : { mode: faker.helpers.arrayElement(['±5%', '±10%'] as const) },
    items,
    // 接疋規則：訂單層級可調整欄位，預設「不可」，客戶通常會希望不接疋
    // 數量輸入基準：實務上多數客戶以碼下單，少數以米，種子資料兩種都給，方便看出畫面呈現差異
    itemUnit: i % 4 === 0 ? 'Meter' : 'Yard',
    allowSplicing: faker.datatype.boolean({ probability: 0.2 }),
    // 嘜頭可多組：多數訂單一組，部分訂單客戶會另外指定第二組（不同目的地／箱型）
    markings: [
      {
        shape: markingShape,
        headerText: markingHeaderText(markingShape),
        destination: faker.helpers.arrayElement(['', 'LA Warehouse', 'NY Distribution Center', '']),
        grossWeightKg: faker.number.float({ min: 20, max: 120, fractionDigits: 1 }),
        netWeightKg: faker.number.float({ min: 18, max: 110, fractionDigits: 1 }),
        composition: faker.helpers.arrayElement(['', '100% POLY', '']),
        origin: faker.helpers.arrayElement(['', 'Taiwan', '']),
        hasSmallMarking: faker.datatype.boolean(),
        // 小嘜頭只寫產地與成份規格；產地（MADE IN TAIWAN）為列印時自動帶入的固定文字，此處只填成份
        smallMarkingText: faker.helpers.arrayElement(['100% NYLON', '100% POLYESTER', '95% POLY\n5% SPANDEX']),
      },
      ...(i % 3 === 0
        ? [
            {
              shape: secondMarkingShape,
              headerText: markingHeaderText(secondMarkingShape),
              destination: 'HO CHI MINH, VIETNAM',
              grossWeightKg: faker.number.float({ min: 20, max: 120, fractionDigits: 1 }),
              netWeightKg: faker.number.float({ min: 18, max: 110, fractionDigits: 1 }),
              composition: '100% POLY',
              origin: 'MADE IN TAIWAN',
              hasSmallMarking: false,
            },
          ]
        : []),
    ],
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
      colorRatios: item.colorRatios,
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
    const product = faker.helpers.arrayElement(orderableProducts)
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
      // 成品規格於打色過程中確認，故僅已進入色卡確認階段之後的單據才有值
      finishedSpec:
        status === '草稿' || status === '已送出'
          ? undefined
          : `${product.width}" ${product.weightGY}G/Y 打色確認版`,
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

  // 生效中的單以單號奇偶模擬「胚布尚未到廠（指染 0）」與「已到廠投入染整（全數指染中）」兩種狀態
  const greigeArrived = status === '生效' ? i % 2 === 0 : status === '已完成'
  const items = pn.items.map((item, j) => {
    const totalQty = item.yard
    // 胚布材質／規格、成品規格依明細的產品分支自動帶入
    const product = resolveProduct(item.productId, item.roricaProductName)
    return {
      id: `${id}-L${j + 1}`,
      sourceItemId: item.id,
      colorRatios: item.colorRatios,
      color: item.color,
      sampleCode: `${id}-L${j + 1}-SAMPLE`,
      colorMatchStandard: faker.helpers.arrayElement(['依客戶留樣', '依上批色差±3%', '依標準色卡']),
      // 單卷碼數＝該筆明細定碼長度換算的每卷碼數，非整批商品總數
      rollYard: defaultRollYard(item.fixedLengthMeter) ?? undefined,
      fabricMaterial: product?.material ?? faker.helpers.arrayElement(FABRIC_MATERIALS),
      fabricSpec: product?.greigeSpec ?? '',
      finishedSpec: product?.finishedSpec ?? '',
      unitPrice: faker.number.float({ min: 15, max: 45, fractionDigits: 1 }),
      // 兩段式：成品數量為該列應產出量（固定不變）；指染數量只在胚布到廠、尚未結案期間有值
      finishedQty: totalQty,
      inDyeQty: status === '生效' && greigeArrived ? totalQty : 0,
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
    vendorId: faker.helpers.arrayElement(vendors.filter((v) => v.types.includes('染整廠'))).id,
    internalContact: faker.helpers.arrayElement(['陳美玲', '林志豪']),
    note: faker.helpers.arrayElement(['厚染', '', '厚染，需加強色牢度', '']),
    items,
    greigeFabricCode: `T${faker.string.numeric(7)}`,
    shippingSampleQty: 0.5,
    effectiveAt: status === '草稿' ? undefined : createdAt.add(1, 'day').toISOString(),
    // 胚布直送染整廠，到廠確認的當下才登記為指染中
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

/**
 * 布卷的品名／顏色／規格一律取自來源表1 明細（明細本身即選自商品資料主檔），
 * 不另外亂數挑一個商品——庫存查的就是這些布卷，若各自亂數就會出現主檔沒有的品名，
 * 或該品名根本沒有的顏色，與商品主檔的歷史色卡對不起來。
 */
export const fabricLabels: FabricLabel[] = goodsReceipts.flatMap((gr) => {
  const notice = packingNotices.find((n) => n.id === gr.parentId)
  return gr.rolls.map((roll, i) => {
    // 一張入庫單可能收多個品項，逐捲輪流對應來源明細
    const item = notice?.items.length ? notice.items[i % notice.items.length] : undefined
    const product = resolveProduct(item?.productId, item?.roricaProductName) ?? faker.helpers.arrayElement(orderableProducts)
    // 幅寬原文供標籤列印（決策115）；width 為計算基準，只供接疋與規格運算
    const color = item?.color ?? product.colors[0]?.color ?? faker.helpers.arrayElement(COLOR_NAMES)
    return {
      id: `${gr.id}-L${roll.rollNo}`,
      receiptId: gr.id,
      rollCode: nextRollCode(product.greigeFabricCode ?? 'T0000000'),
      productName: product.productName,
      productId: product.id,
      composition: product.material,
      color,
      width: product.width,
      widthSpec: product.widthSpec,
      batchCode: roll.batchCode,
      length: roll.length,
      unit: 'Yard',
      status: LABEL_STATUSES[i % LABEL_STATUSES.length],
    }
  })
})

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
    // 箱/袋號為出貨當下人工填寫，僅供本張出貨單列印嘜頭；部分單據留空，呈現未填時整行不印
    markingBoxNos: i % 2 === 0 ? [`C/NO 1-${(i + 1) * 10}`] : undefined,
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
        colorRatios: item.colorRatios,
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
    // 已進入處理分流者，代表管理層批准過（權限規格第四章第 4 節）
    approvedAt: noticeDate.add(1, 'day').toISOString(),
    approvedByAccountId: managerAccountId,
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

// 待管理層批准的主單：業務剛受理完客訴、尚未經核決，故生管還不能收單。
// 展示資料必須有這一張，「管理層批准」與「退回業務」才按得到。
if (abnormalNotices.length > 0) {
  const template = abnormalNotices[0]
  const pendingDate = dayjs(template.noticeDate).add(6, 'day')
  abnormalNotices.unshift({
    ...template,
    id: `AB-${pendingDate.format('YYYYMMDD')}-${pad(9)}`,
    kind: '客訴異常',
    parentAbnormalId: undefined,
    status: '受理中',
    createdAt: pendingDate.toISOString(),
    noticeDate: pendingDate.toISOString(),
    // 尚未核決：批准與會計簽核皆留空
    approvedAt: undefined,
    approvedByAccountId: undefined,
    accountingSignedAt: undefined,
    accountingSignedByAccountId: undefined,
    categoryName: '布面問題',
    categoryItem: '污漬',
    issueNote: '客戶反映整批布面有零星污漬，要求扣款處理；待管理層批准後由生管收單。',
    abnormalQty: Number((template.shippedQty * 0.25).toFixed(1)),
    handling: {
      deduction: {
        amount: 8000,
        upstreamVendorId: (vendors.find((v) => v.types.includes('染整廠')) ?? vendors[0]).id,
      },
    },
    batchDefectRollCodes: [],
    returnedRolls: undefined,
    // 生管尚未回覆——批准之前本來就還輪不到生管
    productionReply: undefined,
    processedAt: undefined,
    completedAt: undefined,
  })
}

// 上游追討附單：客訴後回頭向染整廠追討，掛在該張表9底下（欄位暫時與表9相同）
if (abnormalNotices.length > 0) {
  const parent = abnormalNotices.find((x) => x.status === '處理中') ?? abnormalNotices[0]
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

// ---------- Phase 2：PI 單（Proforma Invoice） ----------

/**
 * PI 展示資料：涵蓋狀態流上的各個節點（草稿／待批准／待簽回／已簽回／已轉換／逾期／取代版），
 * 讓客戶一進畫面就能看到每種情境長什麼樣。
 * 前兩張為「已轉換」，其表1 **由該張 PI 實際生成**（依 PO 拆單、帶入同一個客戶與明細、
 * 嘜頭與收貨地址一併帶入），而不是掛到既有的表1 上——掛既有單會出現「PI 寫客戶 A、
 * 點進去的表1 卻是客戶 B、PO 也對不上」這種自相矛盾的展示資料。
 */
const PI_STATUS_PLAN: {
  status: ProformaInvoice['status']
  daysAgo: number
  convertCount: number
  /**
   * 該 PI 的表1 是否已有「對外發出」的下游（表2 已送出）。
   * true 的那一張，按下「作廢並重開」就會走到規則3——取代版留在草稿並掛待人工處理；
   * false 的那一張則是正常的覆蓋路徑。兩種情境都要有，客戶才點得到。
   */
  downstreamDispatched?: boolean
}[] = [
  // 兩張已轉換的 PI 皆取近期日期：其表1 仍在生效後 7 個工作天內（未凍結），
  // 覆蓋規則才示範得出規則1／2／3 的差異——凍結（規則0）優先序最高，會把其他規則整個蓋掉
  { status: '已轉換', daysAgo: 8, convertCount: 2, downstreamDispatched: true },
  { status: '已轉換', daysAgo: 6, convertCount: 1 },
  { status: '已簽回', daysAgo: 9, convertCount: 0 },
  { status: '待簽回', daysAgo: 4, convertCount: 0 },
  { status: '待批准', daysAgo: 2, convertCount: 0 },
  { status: '草稿', daysAgo: 0, convertCount: 0 },
  // 報價 14 天已過：狀態欄位仍是待簽回，畫面由 effectivePiStatus 即時判為「已逾期」
  { status: '待簽回', daysAgo: 21, convertCount: 0 },
]

/** PI 轉出的表1：接在既有種子單號之後編號，避免與前面的表1 重號 */
let piNoticeSeq = 0

export const proformaInvoices: ProformaInvoice[] = PI_STATUS_PLAN.map((plan, i) => {
  const createdAt = dayjs().subtract(plan.daysAgo, 'day')
  const id = `PI-${createdAt.format('YYYYMMDD')}-${String(i + 1).padStart(3, '0')}`
  const customer = customers[i % customers.length]
  const currency = faker.helpers.arrayElement(PI_CURRENCIES)
  // PO 號：客戶自己的訂單編號；一張 PI 常含 1～2 個 PO，轉表1 時依此拆單（決策43）
  const poNos = Array.from({ length: faker.number.int({ min: 1, max: 2 }) }).map(
    () => `N${faker.number.int({ min: 21000, max: 21999 })}`,
  )
  const items: ProformaInvoiceItem[] = poNos.flatMap((poNo, pi) =>
    Array.from({ length: faker.number.int({ min: 1, max: 2 }) }).map((_, j) => {
      const product = faker.helpers.arrayElement(orderableProducts)
      const yard = faker.number.int({ min: 200, max: 2500 })
      const packingMethod = faker.helpers.arrayElement(PACKING_METHODS)
      return {
        id: `${id}-L${pi * 2 + j + 1}`,
        poNo,
        roricaProductName: product.productName,
        productId: product.id,
        customerProductName: product.customerProductName,
        color: faker.helpers.arrayElement(product.colors)?.color ?? 'WHITE',
        yard,
        meter: Number(yardToMeter(yard).toFixed(1)),
        // 單價來自報價單（不納入系統），故為手填值；主檔牌價空白時兩者不比對
        unitPrice: Number(faker.number.float({ min: 0.8, max: 4.5, fractionDigits: 2 }).toFixed(2)),
        packingMethod,
        fixedLengthMeter: FIXED_ROLL_PACKING_METHODS.includes(packingMethod)
          ? faker.number.float({ min: 40, max: 60, fractionDigits: 1 })
          : undefined,
        colorRatios: faker.helpers.arrayElement([[], [], ['依訂單指定色比±5%']]),
        note: '',
      }
    }),
  )

  // 收貨人：只能是該客戶底下的聯絡人（決策37），故收貨地址一律取自該組聯絡資訊
  const contactIndex = customer.contacts.length > 1 && i % 2 === 1 ? 1 : 0
  const contact = customer.contacts[contactIndex]

  // 嘜頭沿用既有種子的一組（欄位與表1 完全相同），轉出的表1 逐張帶入全部嘜頭（決策52）
  const markings = packingNotices[i % packingNotices.length].markings

  const pi: ProformaInvoice = {
    id,
    status: plan.status,
    createdAt: createdAt.toISOString(),
    quoteValidUntil: piQuoteValidUntil(createdAt).toISOString(),
    approvedAt: plan.status === '草稿' || plan.status === '待批准' ? undefined : createdAt.add(1, 'day').toISOString(),
    signedBackAt:
      plan.status === '已簽回' || plan.status === '已轉換' ? createdAt.add(3, 'day').toISOString() : undefined,
    signedBackFileName: plan.status === '已轉換' ? `${id}-signed.pdf` : undefined,
    convertedAt: plan.status === '已轉換' ? createdAt.add(4, 'day').toISOString() : undefined,
    customerId: customer.id,
    customerName: customer.shortName,
    contactIndex,
    shippingAddress: contact?.shippingAddress,
    currency,
    tradeTerm: faker.helpers.arrayElement(PI_TRADE_TERMS),
    portOfLoading: faker.helpers.arrayElement(PI_PORTS),
    destination: faker.helpers.arrayElement(['JEDDAH, K.S.A.', 'XIAMEN, CHINA', 'HO CHI MINH, VIETNAM', 'DUBAI, U.A.E.']),
    leadTimeDays: faker.helpers.arrayElement(PI_LEAD_TIME_DAYS),
    paymentTerm: faker.helpers.arrayElement(PI_PAYMENT_TERM_TEMPLATES),
    itemUnit: faker.helpers.arrayElement(['Yard', 'Meter'] as const),
    items,
    // 嘜頭與表1 為同一組資料，只填一次（決策20、52）；轉換時每張表1 帶入全部
    markings,
    packingNoticeIds: [],
  }

  if (plan.status === '已轉換') {
    // 依 PO 拆單：一張表1 只承載一個 PO 號（決策43）
    const effectiveAt = createdAt.add(4, 'day')
    // 交期 Day 0 為第一張表1 的生效日（決策36），故全批共用同一個應出貨日
    const dueDate = effectiveAt.add(pi.leadTimeDays, 'day').format('YYYY-MM-DD')
    const noticeIds = [...new Set(items.map((item) => item.poNo))].map((poNo) => {
      piNoticeSeq += 1
      const noticeId = `ORD-${effectiveAt.format('YYYYMMDD')}-${String(900 + piNoticeSeq).padStart(3, '0')}`
      const poItems = items.filter((item) => item.poNo === poNo)
      packingNotices.push({
        id: noticeId,
        customerId: customer.id,
        customerOrderNo: poNo,
        status: '生效',
        approvalState: '已簽核',
        createdByAccountId: salesAccountId,
        approvedAt: effectiveAt.toISOString(),
        approvedByAccountId: managerAccountId,
        createdAt: effectiveAt.toISOString(),
        effectiveAt: effectiveAt.toISOString(),
        expectedDeliveryAt: dueDate,
        sampleQty: 0,
        shipMethod: ['海運'],
        labelTypes: [...LABEL_TYPES],
        packagingType: '一般PP袋',
        tolerance: { mode: '±5%' },
        items: poItems.map((item, j) => ({
          id: `${noticeId}-L${j + 1}`,
          customerProductName: item.customerProductName,
          roricaProductName: item.roricaProductName,
          productId: item.productId,
          color: item.color,
          yard: item.yard,
          meter: item.meter,
          packingMethod: item.packingMethod,
          fixedLengthMeter: item.fixedLengthMeter,
          colorRatios: item.colorRatios,
          note: item.note,
          // 逐列對位鍵：改版 PI 覆蓋時要能對回是哪一列（決策42）
          sourcePiItemId: item.id,
        })),
        itemUnit: pi.itemUnit,
        allowSplicing: false,
        markings,
        embossing: ['否'],
        edgeCut: false,
        // PI → 表1 → 表8 的收貨地址只填一次（決策40）
        sourcePiId: id,
        shippingAddress: contact?.shippingAddress,
      })
      return noticeId
    })
    pi.packingNoticeIds = noticeIds

    if (plan.downstreamDispatched && noticeIds.length > 0) {
      // 表2 已送出（待簽回）＝已讓外部廠商動起來，這張 PI 的取代版就會被規則3 擋下
      const noticeId = noticeIds[0]
      const notice = packingNotices.find((n) => n.id === noticeId)!
      const poId = `${noticeId}-P1`
      purchaseOrders.unshift({
        id: poId,
        parentId: noticeId,
        type: '胚布',
        hasDyeVendor: true,
        dyeVendorId: vendors.find((v) => v.types.includes('染整廠'))?.id,
        vendorId: (vendors.find((v) => v.types.includes('胚布供應商')) ?? vendors[0]).id,
        status: '待簽回',
        createdAt: effectiveAt.add(1, 'day').toISOString(),
        effectiveAt: effectiveAt.add(1, 'day').toISOString(),
        dueDate: effectiveAt.add(21, 'day').toISOString(),
        note: '配合染整廠排缸',
        items: notice.items.map((item) => ({
          id: `${poId}-${item.id}`,
          customerProductName: item.customerProductName,
          roricaProductName: item.roricaProductName,
          productId: item.productId,
          color: item.color,
          yard: item.yard,
          meter: item.meter,
          packingMethod: item.packingMethod,
          fixedLengthMeter: item.fixedLengthMeter,
          colorRatios: item.colorRatios,
          unitPrice: Number(faker.number.float({ min: 20, max: 80, fractionDigits: 1 }).toFixed(1)),
          note: item.note,
        })),
        embossing: notice.embossing.join('、'),
      })
    }
  }

  return pi
})

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

// 版號隨資料結構調整遞增：舊快照的欄位已不相容（如產品編號改制），沿用會讓畫面顯示舊資料
const SESSION_STORAGE_KEY = 'rorica-erp-session-snapshot-v2'

interface SessionSnapshot {
  proformaInvoices: ProformaInvoice[]
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
      proformaInvoices,
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
    // PI 單為 Phase 2 新增的快照欄位，舊快照沒有時沿用種子資料
    if (snapshot.proformaInvoices) proformaInvoices.splice(0, proformaInvoices.length, ...snapshot.proformaInvoices)
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

/** 表1 反查來源 PI（Phase 2）：畫面上要顯示這張表1 是從哪張 PI 轉來的 */
export function getProformaInvoice(id: string | undefined): ProformaInvoice | undefined {
  if (!id) return undefined
  return proformaInvoices.find((pi) => pi.id === id)
}

/** 下游單據（表8 等）反查來源包裝通知單，主要用於取得建單時的數量輸入基準 */
export function getPackingNotice(id: string): PackingNotice | undefined {
  return packingNotices.find((n) => n.id === id)
}

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
