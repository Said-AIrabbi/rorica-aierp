import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { PageHeader } from '@/components/shared/PageHeader'
import { DetailField, DetailGrid } from '@/components/shared/DetailField'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { PrintActions } from '@/components/print/PrintActions'
import { DyeRequestPrint } from './DyeRequestPrint'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { api } from '@/mocks/api'
import { getProduct, getVendor } from '@/mocks/data'
import {
  applyDyeRequestFinishedSpec,
  sendDyeRequest,
  submitDyeRequestColorSample,
  updateDyeRequestColors,
  updateDyeRequestFinishedSpec,
  type DyeRequestColorInput,
} from '@/mocks/mutations'
import { formatDate } from '@/lib/dates'

export function DyeRequestDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { data = [] } = useQuery({ queryKey: ['dyeRequests'], queryFn: api.dyeRequests })
  const request = data.find((d) => d.id === id)
  const [rejectReason, setRejectReason] = useState('')
  // 成品規格草稿：打字時只更新草稿，離開欄位才寫入
  const [specDraft, setSpecDraft] = useState<string | undefined>(undefined)
  // 色號清單為可編輯草稿：染整廠回覆後由生管補填色樣編號，或因重新覆色追加新列
  const [colorDraft, setColorDraft] = useState<DyeRequestColorInput[]>([])

  useEffect(() => {
    if (request) {
      setColorDraft(request.colors.map((c) => ({ id: c.id, color: c.color, sampleCode: c.sampleCode ?? '' })))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [request?.id, request?.colors])

  const invalidate = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ['dyeRequests'] }),
      queryClient.invalidateQueries({ queryKey: ['dyeOrders'] }),
    ])

  const sendMutation = useMutation({
    mutationFn: () => sendDyeRequest(id!),
    onSuccess: async () => {
      await invalidate()
      toast.success(`${id} 已送出染整廠`)
    },
  })
  const submitSampleMutation = useMutation({
    mutationFn: (input: { result: '通過' | '退回'; reason?: string }) =>
      submitDyeRequestColorSample(id!, input.result, input.reason),
    onSuccess: async (_updated, input) => {
      await invalidate()
      setRejectReason('')
      toast.success(input.result === '通過' ? `${id} 色卡已確認通過，已回填至對應染單` : `${id} 色卡已退回，已自動新增下一筆送樣紀錄`)
    },
    onError: (error: Error) => toast.error(error.message),
  })

  const saveSpecMutation = useMutation({
    mutationFn: (spec: string) => updateDyeRequestFinishedSpec(id!, spec),
    onSuccess: async () => {
      await invalidate()
      setSpecDraft(undefined)
    },
    onError: (error: Error) => toast.error(error.message),
  })

  const applySpecMutation = useMutation({
    mutationFn: () => applyDyeRequestFinishedSpec(id!),
    onSuccess: async (product) => {
      await queryClient.invalidateQueries({ queryKey: ['products'] })
      toast.success(`已納入商品主檔 ${product.productName}-${product.sortNo} 的成品規格`)
    },
    onError: (error: Error) => toast.error(error.message),
  })

  const saveColorsMutation = useMutation({
    mutationFn: () => updateDyeRequestColors(id!, colorDraft.filter((c) => c.color.trim())),
    onSuccess: async () => {
      await invalidate()
      toast.success(`${id} 色號清單已儲存`)
    },
    onError: (error: Error) => toast.error(error.message),
  })

  if (!request) {
    return (
      <div className="text-sm text-muted-foreground">
        找不到單號 {id} 的打色通知單。
        <button className="ml-2 text-brand underline" onClick={() => navigate('/dye-request')}>
          返回列表
        </button>
      </div>
    )
  }

  const product = getProduct(request.productId)
  const vendor = getVendor(request.dyeVendorId)
  const pending = sendMutation.isPending || submitSampleMutation.isPending
  // 已完成後鎖定色號清單，其餘狀態皆可補填／追加（重新覆色不設次數上限）
  const colorsEditable = request.status !== '已完成'
  // 成品規格同樣在結案前可修改；結案後改為唯讀，並開放「納入商品主檔」
  const specEditable = request.status !== '已完成'

  return (
    <div>
      <Link
        to="/dye-request"
        className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-ink print:hidden"
      >
        <ArrowLeft className="h-4 w-4" /> 返回打色通知單列表
      </Link>

      <PageHeader
        title={request.id}
        formCode="表3"
        description={
          <>
            來源包裝通知單：
            <Link to={`/packing-notice/${request.parentId}`} className="text-brand-dark underline">
              {request.parentId}
            </Link>
          </>
        }
        actions={
          <>
            <StatusBadge status={request.status} className="text-sm print:hidden" />
            {/* 列印格式保留貼色樣布留白區塊（PRD 決策64），畫面不顯示 */}
            <PrintActions sheets={[{ key: 'doc', label: '列印打色通知單', sheet: <DyeRequestPrint request={request} /> }]} />
            {request.status === '草稿' && (
              <Button size="sm" className="bg-brand hover:bg-brand-dark print:hidden" disabled={pending} onClick={() => sendMutation.mutate()}>
                送出染整廠
              </Button>
            )}
          </>
        }
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">單頭資訊</CardTitle>
        </CardHeader>
        <CardContent>
          <DetailGrid>
            <DetailField label="買方" value={request.buyer} />
            <DetailField label="皇加品名" value={product?.productName ?? request.productId} />
            <DetailField label="胚布編號" value={request.greigeFabricCode} />
            <DetailField label="染整廠" value={vendor?.name} />
            <DetailField label="染整廠聯絡人" value={vendor?.contactPerson} />
            <DetailField label="委託日" value={formatDate(request.requestDate)} />
            <DetailField label="色卡確認日" value={formatDate(request.colorSampleConfirmedAt)} />
            <DetailField label="備註" value={request.note || '-'} />
            {/* 成品規格：打色過程中才確定，故於本單手動登記；結案後可人工納入商品主檔 */}
            <div className="space-y-1 sm:col-span-2">
              <Label className="text-xs text-muted-foreground">成品規格（手動輸入）</Label>
              {specEditable ? (
                <Input
                  value={specDraft ?? request.finishedSpec ?? ''}
                  placeholder="例：60&quot; 120G/Y 緞布，打色確認版"
                  onChange={(e) => setSpecDraft(e.target.value)}
                  onBlur={() => {
                    if (specDraft !== undefined && specDraft !== (request.finishedSpec ?? '')) {
                      saveSpecMutation.mutate(specDraft)
                    }
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') e.currentTarget.blur()
                  }}
                />
              ) : (
                <div className="text-sm text-ink-body">{request.finishedSpec || '-'}</div>
              )}
              {!specEditable && (
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={!request.finishedSpec || applySpecMutation.isPending}
                    onClick={() => applySpecMutation.mutate()}
                  >
                    納入商品主檔成品規格
                  </Button>
                  <span className="text-xs text-muted-foreground">
                    主檔現值：{product?.finishedSpec || '-'}
                  </span>
                </div>
              )}
            </div>
          </DetailGrid>
        </CardContent>
      </Card>

      <Card className="mt-4">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">
            色號清單{colorsEditable ? '（染整廠回覆後補填色樣編號；重新覆色請追加一筆並於備註註記原因）' : '（已完成，不再提供修改）'}
          </CardTitle>
          {colorsEditable && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="print:hidden"
              onClick={() => setColorDraft([...colorDraft, { color: '', sampleCode: '' }])}
            >
              <Plus className="mr-1 h-4 w-4" /> 新增色號
            </Button>
          )}
        </CardHeader>
        <CardContent>
          {/* 列印版面：保留色卡貼附留白區塊，供染整廠或皇加人工黏貼實體布樣 */}
          <div className="hidden grid-cols-3 gap-3 print:grid">
            {request.colors.map((c) => (
              <div key={c.id} className="rounded-lg border border-border p-3 text-sm">
                <div className="mb-2 h-16 w-full rounded border border-dashed border-border bg-muted/30" aria-hidden />
                <div className="font-medium text-ink">{c.color}</div>
                <div className="text-xs text-muted-foreground">色樣編號：{c.sampleCode || '（待填）'}</div>
              </div>
            ))}
          </div>

          <div className="space-y-3 print:hidden">
            {colorDraft.length === 0 && (
              <p className="text-sm text-muted-foreground">尚無色號，請點右上角「新增色號」登記。</p>
            )}
            {colorDraft.map((c, index) => (
              <div key={c.id ?? `new-${index}`} className="rounded-lg border border-border p-3">
                <div className="flex flex-wrap items-end gap-3">
                  <div className="min-w-40 flex-1 space-y-1">
                    <Label className="text-xs">顏色</Label>
                    <Input
                      value={c.color}
                      disabled={!colorsEditable}
                      placeholder="例：COL#605 DK.BLUE"
                      onChange={(e) =>
                        setColorDraft(colorDraft.map((x, i) => (i === index ? { ...x, color: e.target.value } : x)))
                      }
                    />
                  </div>
                  <div className="min-w-40 flex-1 space-y-1">
                    <Label className="text-xs">色樣編號（染整廠回覆後填入）</Label>
                    <Input
                      value={c.sampleCode ?? ''}
                      disabled={!colorsEditable}
                      placeholder="例：T0505147-1A"
                      onChange={(e) =>
                        setColorDraft(colorDraft.map((x, i) => (i === index ? { ...x, sampleCode: e.target.value } : x)))
                      }
                    />
                  </div>
                  {colorsEditable && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="shrink-0 text-destructive hover:text-destructive"
                      onClick={() => setColorDraft(colorDraft.filter((_, i) => i !== index))}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </div>
            ))}

            {colorsEditable && (
              <div className="flex justify-end">
                <Button
                  className="bg-brand hover:bg-brand-dark"
                  disabled={saveColorsMutation.isPending}
                  onClick={() => saveColorsMutation.mutate()}
                >
                  {saveColorsMutation.isPending ? '儲存中...' : '儲存色號清單'}
                </Button>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {request.status !== '草稿' && (
        <Card className="mt-4 print:hidden">
          <CardHeader>
            <CardTitle className="text-base">色卡送樣確認（退回不設次數上限，可反覆送樣；通過後狀態變更為已完成並回填染單）</CardTitle>
          </CardHeader>
          <CardContent>
            {request.colorSampleSubmissions && request.colorSampleSubmissions.length > 0 && (
              <ul className="mb-4 space-y-1.5 text-sm">
                {request.colorSampleSubmissions.map((s) => (
                  <li key={s.id} className="flex flex-wrap items-center gap-2 text-ink-body">
                    <span className="text-muted-foreground">{formatDate(s.submittedAt)}</span>
                    <StatusBadge status={s.result} />
                    {s.reason && <span className="text-muted-foreground">（{s.reason}）</span>}
                  </li>
                ))}
              </ul>
            )}
            {!request.colorSampleConfirmedAt && (
              <div className="flex flex-wrap items-end gap-3">
                <div className="space-y-1.5">
                  <label className="text-xs text-muted-foreground">退回原因（選填，僅登記退回時使用）</label>
                  <Input
                    value={rejectReason}
                    onChange={(e) => setRejectReason(e.target.value)}
                    placeholder="例：色號太久重新覆色"
                    className="w-72"
                  />
                </div>
                <Button
                  variant="outline"
                  className="border-destructive text-destructive hover:bg-destructive/10"
                  disabled={pending}
                  onClick={() => submitSampleMutation.mutate({ result: '退回', reason: rejectReason || undefined })}
                >
                  登記退回
                </Button>
                <Button
                  className="bg-brand hover:bg-brand-dark"
                  disabled={pending}
                  onClick={() => submitSampleMutation.mutate({ result: '通過' })}
                >
                  登記通過
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <div className="mt-4 rounded-lg border border-border bg-muted/40 p-3 text-xs text-muted-foreground print:hidden">
        提醒：色卡（客戶＋皇加品名＋色號＋染整廠）為全新配色時系統自動觸發本單，與表4染整單為平行關係、無先後卡控。
      </div>
    </div>
  )
}
