import { PrintSheet, PrintSection, type PrintMetaItem } from '@/components/print/PrintSheet'
import { PRINT_TITLES, VENDOR_SIGNATURE_LABELS } from '@/lib/print'
import { formatDate } from '@/lib/dates'
import { getProduct, getVendor, vendorDisplayName } from '@/mocks/data'
import type { DyeRequest } from '@/types'

/**
 * 表3 打色通知單列印版面（PRD 決策64：表3需要列印）。
 * 列印格式的關鍵在於每組色號欄位下方保留「貼色樣布」的留白區塊——
 * 對應實際紙本單據上供染整廠或皇加人工黏貼實體布樣的空間，
 * 此需求僅存在於列印版面，系統畫面不顯示。
 */
export function DyeRequestPrint({ request }: { request: DyeRequest }) {
  const vendor = getVendor(request.dyeVendorId)
  const product = getProduct(request.productId)

  // 買方固定為「皇加」，對染整廠而言是廢話（本單就是皇加發的），故不列印
  const meta: PrintMetaItem[] = [
    { label: '打色通知單號', value: request.id },
    { label: '來源包裝通知單', value: request.parentId },
    // 表頭為 4 欄格線：前四項各佔一欄剛好一列，成品規格佔 2 欄填滿第二列，不留破格
    { label: '染整廠', value: vendorDisplayName(vendor) },
    { label: '日期', value: formatDate(request.requestDate) },
    { label: '皇加品名', value: product?.productName ?? request.productId },
    { label: '胚布編號', value: request.greigeFabricCode ?? ' ' },
    // 成品規格是打色的目標規格，對外單據一併印出供染整廠對照
    { label: '成品規格', value: request.finishedSpec ?? ' ', span: 2 },
  ]

  return (
    <PrintSheet
      formCode={PRINT_TITLES.dyeRequest.formCode}
      title={PRINT_TITLES.dyeRequest.title}
      docNo={request.id}
      date={request.requestDate}
      meta={meta}
      signatures={VENDOR_SIGNATURE_LABELS}
      footNote="色樣編號由染整廠打色後填寫，並於下方空白處黏貼實體色樣布。"
    >
      <PrintSection title="備註">
        <div style={{ border: '0.5pt solid #000', minHeight: '14mm', padding: '1.5mm 2mm' }}>{request.note ?? ' '}</div>
      </PrintSection>

      <PrintSection
        title="色號清單"
        note="※ 每組色號下方留白為黏貼實體色樣布之用；色樣編號由染整廠提供後回填。"
      >
        <div className="pr-swatch-grid">
          {request.colors.map((color, i) => (
            <div key={color.id} className="pr-swatch">
              <div className="pr-swatch-head">
                <span>
                  {i + 1}. 顏色：<strong>{color.color}</strong>
                </span>
                <span>色樣編號：{color.sampleCode ?? '____________'}</span>
              </div>
              {/* 貼色樣布留白區塊：僅列印保留版面，畫面線稿不顯示 */}
              <div className="pr-swatch-area">（請於此處黏貼色樣布）</div>
            </div>
          ))}
        </div>
      </PrintSection>

    </PrintSheet>
  )
}
