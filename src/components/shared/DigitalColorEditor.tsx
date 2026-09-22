import { useState } from 'react'
import { Save, Wand2 } from 'lucide-react'
import { toast } from 'sonner'
import { ColorSwatch, DigitalColorDetail, SWATCH_SIZE_PX } from '@/components/shared/ColorSwatch'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { formatDate } from '@/lib/dates'
import { hexToCmyk, labToHex, normalizeHex, validateDigitalColor } from '@/lib/digital-color'
import type { DigitalColor } from '@/types'

type Draft = {
  l: string
  a: string
  b: string
  hex: string
  c: string
  m: string
  y: string
  k: string
}

const str = (v: number | undefined) => (v === undefined ? '' : String(v))

function toDraft(d: DigitalColor | undefined): Draft {
  return {
    l: str(d?.lab?.l),
    a: str(d?.lab?.a),
    b: str(d?.lab?.b),
    hex: d?.hex ?? '',
    c: str(d?.cmyk?.c),
    m: str(d?.cmyk?.m),
    y: str(d?.cmyk?.y),
    k: str(d?.cmyk?.k),
  }
}

/** 一組欄位全空＝不填；填了一部分就交給驗證去報錯，不默默丟掉 */
function fromDraft(d: Draft): DigitalColor {
  const num = (v: string) => (v.trim() === '' ? NaN : Number(v))
  const any = (...vs: string[]) => vs.some((v) => v.trim() !== '')
  return {
    lab: any(d.l, d.a, d.b) ? { l: num(d.l), a: num(d.a), b: num(d.b) } : undefined,
    hex: d.hex,
    cmyk: any(d.c, d.m, d.y, d.k) ? { c: num(d.c), m: num(d.m), y: num(d.y), k: num(d.k) } : undefined,
  }
}

/**
 * 「顏色圖示＋電腦色號」登記區，表3 色號列與商品主檔的歷史色號共用。
 * 不可編輯時只顯示色塊與數值。於表3 與色號清單分開儲存：清單在已完成後鎖定，
 * 但電腦色號是量測紀錄，結案後仍要能補登。
 */
export function DigitalColorEditor({
  value,
  editable,
  pending,
  onSave,
}: {
  value: DigitalColor | undefined
  editable: boolean
  pending: boolean
  onSave: (digital: DigitalColor) => void
}) {
  const [draft, setDraft] = useState<Draft>(() => toDraft(value))
  const [open, setOpen] = useState(false)

  if (!editable || !open) {
    return (
      // 按鈕固定在右下角：內容在上、按鈕列在下並靠右，不論有沒有登記過位置都一樣
      <div className="mt-2 space-y-2 rounded-md bg-muted/50 px-3 py-2 text-xs">
        <DigitalColorDetail digital={value} />
        {value?.recordedAt && <div className="text-muted-foreground">登記於 {formatDate(value.recordedAt)}</div>}
        {editable && (
          <div className="flex justify-end">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7"
              onClick={() => {
                setDraft(toDraft(value))
                setOpen(true)
              }}
            >
              {value ? '修改電腦色號' : '登記電腦色號'}
            </Button>
          </div>
        )}
      </div>
    )
  }

  const set = (key: keyof Draft) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setDraft((d) => ({ ...d, [key]: e.target.value }))

  let preview: DigitalColor | undefined
  let outOfGamut = false
  try {
    preview = validateDigitalColor(fromDraft(draft))
    if (preview?.lab && !preview.hex) outOfGamut = labToHex(preview.lab).outOfGamut
  } catch {
    preview = undefined
  }

  const deriveFromLab = () => {
    const lab = fromDraft(draft).lab
    if (!lab || ![lab.l, lab.a, lab.b].every(Number.isFinite)) {
      toast.error('請先填好 L*、a*、b* 三個值')
      return
    }
    const { hex, outOfGamut: oog } = labToHex(lab)
    const cmyk = hexToCmyk(hex)
    setDraft((d) => ({
      ...d,
      hex,
      c: str(cmyk.c),
      m: str(cmyk.m),
      y: str(cmyk.y),
      k: str(cmyk.k),
    }))
    if (oog) toast.warning('此 LAB 超出螢幕 sRGB 色域，HEX 為最接近的可顯示顏色')
  }

  const save = () => {
    try {
      validateDigitalColor(fromDraft(draft))
    } catch (error) {
      toast.error((error as Error).message)
      return
    }
    onSave(fromDraft(draft))
    setOpen(false)
  }

  const numField = (key: keyof Draft, label: string, placeholder: string) => (
    <div className="w-20 space-y-1">
      <Label className="text-[11px] text-muted-foreground">{label}</Label>
      <Input className="h-8" inputMode="decimal" value={draft[key]} placeholder={placeholder} onChange={set(key)} />
    </div>
  )

  return (
    // data-editing：外層卡片據此在編輯時暫時佔滿整列（一列三欄時欄寬放不下輸入欄位）
    <div data-editing className="mt-2 space-y-3 rounded-md border border-dashed border-border p-3">
      <div className="flex flex-wrap items-start gap-4">
        <div className="flex flex-col items-center gap-1">
          {preview ? (
            <ColorSwatch digital={preview} />
          ) : (
            <span
              className="rounded-md border border-dashed border-border"
              style={{ width: SWATCH_SIZE_PX, height: SWATCH_SIZE_PX }}
              aria-hidden
            />
          )}
          <span className="text-[10px] text-muted-foreground">螢幕示意</span>
        </div>

        <div className="space-y-2">
          <div className="text-xs font-medium text-ink">LAB（主值，分光儀讀數 D65／10°）</div>
          <div className="flex flex-wrap items-end gap-2">
            {numField('l', 'L*', '0–100')}
            {numField('a', 'a*', '-128–127')}
            {numField('b', 'b*', '-128–127')}
            <Button type="button" variant="outline" size="sm" className="h-8" onClick={deriveFromLab}>
              <Wand2 className="mr-1 h-3.5 w-3.5" /> 換算 HEX／CMYK
            </Button>
          </div>
          {outOfGamut && <div className="text-[11px] text-warning">此 LAB 超出螢幕色域，色塊為最接近的可顯示顏色</div>}
        </div>

        <div className="space-y-2">
          <div className="text-xs font-medium text-ink">HEX</div>
          <div className="w-28 space-y-1">
            <Label className="text-[11px] text-muted-foreground">六位色碼</Label>
            <Input
              className="h-8 font-mono"
              value={draft.hex}
              placeholder="#F7F7F2"
              onChange={set('hex')}
              onBlur={() => setDraft((d) => ({ ...d, hex: normalizeHex(d.hex) ?? d.hex }))}
            />
          </div>
        </div>

        <div className="space-y-2">
          <div className="text-xs font-medium text-ink">CMYK（%，換算值未套 ICC，僅供參考）</div>
          <div className="flex flex-wrap gap-2">
            {numField('c', 'C', '0–100')}
            {numField('m', 'M', '0–100')}
            {numField('y', 'Y', '0–100')}
            {numField('k', 'K', '0–100')}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-end gap-2">
        <span className="mr-auto text-[11px] text-muted-foreground">三組皆可留空；全部清空後儲存即清除。</span>
        <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
          取消
        </Button>
        <Button type="button" size="sm" className="bg-brand hover:bg-brand-dark" disabled={pending} onClick={save}>
          <Save className="mr-1 h-4 w-4" /> 儲存電腦色號
        </Button>
      </div>
    </div>
  )
}
