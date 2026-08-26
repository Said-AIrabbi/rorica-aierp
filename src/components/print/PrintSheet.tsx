import type { ReactNode } from 'react'
import { PRINT_COMPANY } from '@/lib/print'
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
  /** 單據日期（列於單號下方） */
  date?: string
  meta?: PrintMetaItem[]
  children?: ReactNode
  /** 底部簽名欄標題；省略則不印簽名區 */
  signatures?: readonly string[]
  /** 頁尾左側附註，例如「本單請於 2 日內簽名回傳」 */
  footNote?: ReactNode
  /** 紙張變體：布卷標籤為標籤紙尺寸，其餘單據皆為 A4 */
  variant?: 'a4' | 'label'
}

export function PrintSheet({
  formCode,
  title,
  docNo,
  date,
  meta,
  children,
  signatures,
  footNote,
  variant = 'a4',
}: PrintSheetProps) {
  const variantClass = variant === 'label' ? ' pr-label-sheet' : ''
  return (
    <section className={`pr-sheet${variantClass}`}>
      <header className="pr-head">
        <div>
          <div className="pr-head-company">{PRINT_COMPANY.name}</div>
          <div className="pr-head-company-en">{PRINT_COMPANY.nameEn}</div>
          <div className="pr-head-contact">
            統一編號 {PRINT_COMPANY.taxId}　{PRINT_COMPANY.address}
            <br />
            TEL {PRINT_COMPANY.phone}　FAX {PRINT_COMPANY.fax}
          </div>
        </div>
        <div className="pr-head-right">
          <div className="pr-head-form-code">{formCode}</div>
          <div className="pr-head-title">{title}</div>
          <div className="pr-head-docno">{docNo}</div>
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
  header: string
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
  emptyText = '（無明細）',
}: {
  columns: PrintColumn<T>[]
  rows: T[]
  /** 合計列：與欄位數相同長度的陣列，null 表示空白格 */
  totalRow?: ReactNode[]
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
          rows.map((row, ri) => (
            <tr key={ri}>
              {columns.map((col, ci) => (
                <td key={ci} className={alignClass(col.align)}>
                  {col.cell(row, ri)}
                </td>
              ))}
            </tr>
          ))
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
