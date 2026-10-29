import { Fragment, type ReactNode } from 'react'
import { companyProfile } from '@/mocks/data'
import { formatDate } from '@/lib/dates'

/**
 * 單據列印版面共用元件。
 * 所有紙本單據共用同一組抬頭／表頭欄位／明細表格／簽名欄結構，
 * 版面樣式集中於 src/styles/print.css，以 mm 為單位對齊實際紙張。
 */

export interface PrintMetaItem {
  label: string
  value: ReactNode
  /** 佔用欄數（表頭為 4 欄格線） */
  span?: 1 | 2 | 4
}

interface PrintSheetProps {
  formCode: string
  title: string
  docNo: string
  /** 單據日期（列於單號下方；不印單號時直接接在單據名稱下方） */
  date?: string
  /**
   * 不在單據名稱下方印單號（決策154，表2～表4）：這三張的表頭資訊格第一格就是單號，
   * 頁尾也有，名稱下方再印一次是重複。省略時照舊印出。
   */
  hideHeadDocNo?: boolean
  meta?: PrintMetaItem[]
  children?: ReactNode
  /** 底部簽名欄標題；省略則不印簽名區 */
  signatures?: readonly string[]
  /** 頁尾左側附註，例如「本單請於 2 日內簽名回傳」 */
  footNote?: ReactNode
  /** 紙張變體：布卷標籤為標籤紙尺寸，其餘單據皆為 A4 */
  variant?: 'a4' | 'label'
  /** 抬頭印哪組聯絡資訊：表1 與 PI 為公司，表2～表9 為工廠（預設） */
  contact?: 'company' | 'factory'
}

export function PrintSheet({
  formCode,
  title,
  docNo,
  date,
  hideHeadDocNo = false,
  meta,
  children,
  signatures,
  footNote,
  variant = 'a4',
  contact = 'factory',
}: PrintSheetProps) {
  const variantClass = variant === 'label' ? ' pr-label-sheet' : ''
  // 工廠地址未設定時三欄一起退回公司，避免印出工廠地址配公司電話的混搭
  const useFactory = contact === 'factory' && !!companyProfile.factoryAddress
  const address = useFactory ? companyProfile.factoryAddress : companyProfile.address
  const phone = useFactory ? companyProfile.factoryPhone : companyProfile.phone
  const fax = useFactory ? companyProfile.factoryFax : companyProfile.fax
  return (
    <section className={`pr-sheet${variantClass}`}>
      <header className="pr-head">
        <div>
          {/* 抬頭取自系統設定的公司資訊（決策136）：那裡改了，所有單據的紙本跟著改 */}
          <div className="pr-head-company">{companyProfile.name}</div>
          <div className="pr-head-company-en">{companyProfile.nameEn}</div>
          <div className="pr-head-contact">
            統一編號 {companyProfile.taxId}　{address}
            <br />
            TEL {phone}
            {/* 傳真未提供時整段不印，避免紙上出現空的 FAX 欄位 */}
            {fax && `　FAX ${fax}`}
          </div>
        </div>
        <div className="pr-head-right">
          <div className="pr-head-form-code">{formCode}</div>
          <div className="pr-head-title">{title}</div>
          {!hideHeadDocNo && <div className="pr-head-docno">{docNo}</div>}
          {date && <div className="pr-head-contact">日期：{formatDate(date)}</div>}
        </div>
      </header>

      {meta && meta.length > 0 && <PrintMeta items={meta} />}

      {children}

      {signatures && signatures.length > 0 && <PrintSignatures labels={signatures} />}

      <footer className="pr-foot">
        <span>{footNote}</span>
        <span>
          {docNo}　列印日期 {formatDate(new Date())}
        </span>
      </footer>
    </section>
  )
}

export function PrintMeta({ items }: { items: PrintMetaItem[] }) {
  return (
    <div className="pr-meta">
      {items.map((item, i) => (
        <div key={i} className={`pr-meta-cell${item.span && item.span > 1 ? ` pr-span-${item.span}` : ''}`}>
          <div className="pr-meta-label">{item.label}</div>
          <div className="pr-meta-value">{item.value ?? ' '}</div>
        </div>
      ))}
    </div>
  )
}

export function PrintSection({ title, note, children }: { title: string; note?: ReactNode; children: ReactNode }) {
  return (
    <section className="pr-section">
      <h2 className="pr-section-title">{title}</h2>
      {children}
      {note && <p className="pr-section-note">{note}</p>}
    </section>
  )
}

export interface PrintColumn<T> {
  /**
   * 欄位標題。允許 ReactNode 是為了讓過長的標題能在指定位置分兩行
   * （如 PI 的 UNIT PRICE／(US$/Y)）——否則欄寬得由標題決定，
   * 把內容本來就長的欄位（顏色、客戶品名）擠到換行。
   */
  header: ReactNode
  /** 儲存格內容 */
  cell: (row: T, index: number) => ReactNode
  /** 數值欄右對齊 */
  align?: 'left' | 'center' | 'right'
  width?: string
}

export function PrintTable<T>({
  columns,
  rows,
  totalRow,
  subRow,
  emptyText = '（無明細）',
}: {
  columns: PrintColumn<T>[]
  rows: T[]
  /** 合計列：與欄位數相同長度的陣列，null 表示空白格 */
  totalRow?: ReactNode[]
  /**
   * 每一列的第二行（跨滿整個表寬）：欄位太長會把整張表撐爆，
   * 改放到同一項次的下一行，視覺上仍屬同一列。回傳 null 則不輸出第二行。
   */
  subRow?: (row: T, index: number) => ReactNode
  emptyText?: string
}) {
  const alignClass = (align?: PrintColumn<T>['align']) =>
    align === 'right' ? 'pr-num' : align === 'center' ? 'pr-center' : undefined

  return (
    <table className="pr-table">
      <thead>
        <tr>
          {columns.map((col, i) => (
            <th key={i} style={col.width ? { width: col.width } : undefined}>
              {col.header}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.length === 0 ? (
          <tr>
            <td colSpan={columns.length} className="pr-center">
              {emptyText}
            </td>
          </tr>
        ) : (
          rows.map((row, ri) => {
            const sub = subRow?.(row, ri)
            return (
              <Fragment key={ri}>
                <tr>
                  {columns.map((col, ci) => (
                    <td key={ci} className={alignClass(col.align)}>
                      {col.cell(row, ri)}
                    </td>
                  ))}
                </tr>
                {sub ? (
                  <tr className="pr-subrow">
                    <td colSpan={columns.length}>{sub}</td>
                  </tr>
                ) : null}
              </Fragment>
            )
          })
        )}
        {totalRow && (
          <tr className="pr-total-row">
            {totalRow.map((cell, i) => (
              <td key={i} className={alignClass(columns[i]?.align)}>
                {cell}
              </td>
            ))}
          </tr>
        )}
      </tbody>
    </table>
  )
}

export function PrintSignatures({ labels }: { labels: readonly string[] }) {
  return (
    <div className="pr-signatures" style={{ gridTemplateColumns: `repeat(${labels.length}, 1fr)` }}>
      {labels.map((label) => (
        <div key={label} className="pr-signature-cell">
          {label}
        </div>
      ))}
    </div>
  )
}
