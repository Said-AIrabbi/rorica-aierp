import { Fragment, useEffect, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Eye, Printer, X } from 'lucide-react'
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
 *
 * 版面預覽以覆蓋整個畫面的方式呈現——#print-root 在 DOM 上位於 App 之後，
 * 若只是就地顯示，內容會落在整個系統畫面下方，使用者得往下捲很久才看得到，形同沒作用。
 * 一張單據可有多種列印輸出（如入庫單與其布卷標籤）：預覽時全部一起顯示供確認格式，
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

  // 預覽為全畫面覆蓋層，比照對話框慣例支援 Esc 關閉
  useEffect(() => {
    if (!preview) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPreview(false)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [preview])

  if (sheets.length === 0) return null
  const active = sheets.find((s) => s.key === activeKey) ?? sheets[0]

  const print = (key: string) => {
    // 預覽模式會同時顯示所有版面，列印前先收起，確保只輸出這一份
    setPreview(false)
    setActiveKey(key)
    setPrintToken((t) => t + 1)
  }

  return (
    <>
      <Button
        size="sm"
        variant="outline"
        className="print:hidden"
        onClick={() => setPreview(true)}
        title="以實際紙張尺寸顯示列印出來的樣子"
      >
        <Eye className="mr-1 h-4 w-4" /> 版面預覽
      </Button>
      {sheets.map((sheet) => (
        <Button key={sheet.key} size="sm" variant="outline" className="print:hidden" onClick={() => print(sheet.key)}>
          <Printer className="mr-1 h-4 w-4" /> {sheet.label}
        </Button>
      ))}

      {container &&
        createPortal(
          preview ? (
            <>
              {/* 預覽工具列：僅畫面上顯示，列印時由 print.css 隱藏 */}
              <div className="pr-preview-bar">
                <div className="pr-preview-bar-text">
                  <strong>列印版面預覽</strong>
                  <span>以下為實際列印出來的樣子（依真實紙張尺寸呈現），僅供確認格式</span>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {sheets.map((sheet) => (
                    <Button key={sheet.key} size="sm" variant="outline" onClick={() => print(sheet.key)}>
                      <Printer className="mr-1 h-4 w-4" /> {sheet.label}
                    </Button>
                  ))}
                  <Button size="sm" variant="outline" onClick={() => setPreview(false)}>
                    <X className="mr-1 h-4 w-4" /> 關閉預覽
                  </Button>
                </div>
              </div>
              {sheets.map((s) => (
                <Fragment key={s.key}>{s.sheet}</Fragment>
              ))}
            </>
          ) : (
            active.sheet
          ),
          container,
        )}
    </>
  )
}
