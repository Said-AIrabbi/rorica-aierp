import { Fragment, useEffect, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Eye, EyeOff, Printer } from 'lucide-react'
import { Button } from '@/components/ui/button'

export interface PrintSheetOption {
  key: string
  /** 列印按鈕文字，如「列印單據」「列印嘜頭」 */
  label: string
  sheet: ReactNode
}

/**
 * 單據列印按鈕組。
 * 列印版面渲染於 #print-root（App 之外的獨立容器），列印時系統畫面整個隱藏、
 * 只輸出單據本身，因此列印格式不受畫面版面影響（見 src/styles/print.css）。
 * 一張單據可有多種列印輸出（如表1的單據本身與嘜頭）：版面預覽時全部一起顯示供確認格式，
 * 實際列印時只輸出被按下的那一份，避免一次印出全部。
 */
export function PrintActions({ sheets }: { sheets: PrintSheetOption[] }) {
  const [activeKey, setActiveKey] = useState(sheets[0]?.key)
  const [preview, setPreview] = useState(false)
  // 每次按下列印遞增，作為「已切換到指定版面後再呼叫列印」的觸發訊號
  const [printToken, setPrintToken] = useState(0)

  useEffect(() => {
    if (printToken > 0) window.print()
  }, [printToken])

  const container = typeof document === 'undefined' ? null : document.getElementById('print-root')

  useEffect(() => {
    if (!container) return
    container.classList.toggle('pr-preview', preview)
    return () => container.classList.remove('pr-preview')
  }, [container, preview])

  if (sheets.length === 0) return null
  const active = sheets.find((s) => s.key === activeKey) ?? sheets[0]

  return (
    <>
      <Button
        size="sm"
        variant="outline"
        className="print:hidden"
        onClick={() => setPreview((v) => !v)}
        title="在畫面下方顯示實際列印版面，供確認格式"
      >
        {preview ? <EyeOff className="mr-1 h-4 w-4" /> : <Eye className="mr-1 h-4 w-4" />}
        {preview ? '關閉版面預覽' : '版面預覽'}
      </Button>
      {sheets.map((sheet) => (
        <Button
          key={sheet.key}
          size="sm"
          variant="outline"
          className="print:hidden"
          onClick={() => {
            // 預覽模式會同時顯示所有版面，列印前先收起，確保只輸出這一份
            setPreview(false)
            setActiveKey(sheet.key)
            setPrintToken((t) => t + 1)
          }}
        >
          <Printer className="mr-1 h-4 w-4" /> {sheet.label}
        </Button>
      ))}
      {container &&
        createPortal(
          preview ? sheets.map((s) => <Fragment key={s.key}>{s.sheet}</Fragment>) : active.sheet,
          container,
        )}
    </>
  )
}
