import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'
import dayjs from 'dayjs'
import { PageHeader } from '@/components/shared/PageHeader'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { api } from '@/mocks/api'
import { createSecondaryProcessingOrder } from '@/mocks/mutations'
import { buildSecondaryProcessingPackaging } from '@/lib/workflow'
import { formatNumber } from '@/lib/units'
import { PackagingSummary } from '@/components/shared/PackagingSummary'

export function SecondaryProcessingFormPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [searchParams] = useSearchParams()

  const { data: notices = [] } = useQuery({ queryKey: ['packingNotices'], queryFn: api.packingNotices })
  const { data: vendors = [] } = useQuery({ queryKey: ['vendors'], queryFn: api.vendors })

  const [parentId, setParentId] = useState(searchParams.get('parentId') ?? '')
  const [vendorId, setVendorId] = useState('')
  const [vendorContactPerson, setVendorContactPerson] = useState('')
  const [vendorPhone, setVendorPhone] = useState('')
  const [vendorAddress, setVendorAddress] = useState('')
  const [internalContact, setInternalContact] = useState('')
  const [dueDate, setDueDate] = useState(dayjs().add(14, 'day').format('YYYY-MM-DD'))
  const [note, setNote] = useState('')
  const [selectedItemIds, setSelectedItemIds] = useState<string[]>([])
  const [unitPrices, setUnitPrices] = useState<Record<string, string>>({})

  const notice = notices.find((n) => n.id === parentId)

  /** 只有指定了加工方法的明細才需要二次加工，未指定者不列入本單 */
  const processingItems = useMemo(() => notice?.items.filter((item) => item.processingMethod) ?? [], [notice])

  // 換一張來源單據時，預設全選該單所有需加工的品項，並清掉前一張的單價
  useEffect(() => {
    setSelectedItemIds(processingItems.map((item) => item.id))
    setUnitPrices({})
    if (notice) setDueDate(dayjs(notice.expectedDeliveryAt).format('YYYY-MM-DD'))
  }, [notice, processingItems])

  // 廠商資訊由廠商主檔帶入，帶入後仍可就本單覆寫
  function selectVendor(id: string) {
    setVendorId(id)
    const vendor = vendors.find((v) => v.id === id)
    setVendorContactPerson(vendor?.contactPerson ?? '')
    setVendorPhone(vendor?.phone ?? '')
    setVendorAddress(vendor?.address ?? '')
  }

  const mutation = useMutation({
    mutationFn: () =>
      createSecondaryProcessingOrder({
        parentId,
        vendorId,
        vendorContactPerson,
        vendorPhone,
        vendorAddress,
        internalContact,
        dueDate: dayjs(dueDate).toISOString(),
        note,
        sourceItemIds: selectedItemIds,
        itemUnitPrices: Object.fromEntries(
          Object.entries(unitPrices).map(([key, value]) => [key, value === '' ? undefined : Number(value)]),
        ),
      }),
    onSuccess: async (order) => {
      await queryClient.invalidateQueries({ queryKey: ['secondaryProcessingOrders'] })
      toast.success(`已建立 ${order.id}`)
      navigate(`/secondary-processing/${order.id}`)
    },
    onError: (error: Error) => toast.error(error.message),
  })

  // 可開立二次加工單的來源：明細中至少有一筆指定了加工方法
  const eligibleNotices = notices.filter((n) => n.items.some((item) => item.processingMethod))

  return (
    <div>
      <PageHeader
        title="新增二次加工單"
        formCode="表5"
        description="加工明細與包裝設定皆由表1包裝通知單帶入；廠商資訊選自廠商資料主檔。"
        actions={
          <>
            <Button variant="outline" onClick={() => navigate('/secondary-processing')}>
              取消
            </Button>
            <Button
              className="bg-brand hover:bg-brand-dark"
              disabled={!parentId || !vendorId || selectedItemIds.length === 0 || mutation.isPending}
              onClick={() => mutation.mutate()}
            >
              建立二次加工單
            </Button>
          </>
        }
      />

      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">廠商資訊</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div className="space-y-1">
              <Label className="text-xs">加工廠（選自廠商資料主檔）</Label>
              <Select value={vendorId} onValueChange={selectVendor}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="請選擇加工廠" />
                </SelectTrigger>
                <SelectContent>
                  {vendors.map((v) => (
                    <SelectItem key={v.id} value={v.id}>
                      {v.name}
                      {v.siteCode ? `${v.siteCode}` : ''}（{v.types.join('／')}）
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">廠商聯絡人</Label>
              <Input value={vendorContactPerson} onChange={(e) => setVendorContactPerson(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">廠商電話</Label>
              <Input value={vendorPhone} onChange={(e) => setVendorPhone(e.target.value)} />
            </div>
            <div className="space-y-1 sm:col-span-2">
              <Label className="text-xs">廠商地址</Label>
              <Input value={vendorAddress} onChange={(e) => setVendorAddress(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">交期</Label>
              <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">皇加聯絡窗口</Label>
              <Input value={internalContact} onChange={(e) => setInternalContact(e.target.value)} placeholder="非必填" />
            </div>
            <div className="space-y-1 sm:col-span-2">
              <Label className="text-xs">備註</Label>
              <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="非必填" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">加工明細</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1 sm:max-w-md">
              <Label className="text-xs">來源包裝通知單（表1）</Label>
              <Select value={parentId} onValueChange={setParentId}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="請選擇包裝通知單" />
                </SelectTrigger>
                <SelectContent>
                  {eligibleNotices.map((n) => (
                    <SelectItem key={n.id} value={n.id}>
                      {n.id}（{n.items.filter((i) => i.processingMethod).length} 筆需加工）
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                僅列出明細中已指定「加工方法」的包裝通知單；未指定加工方法的品項不會出現在下方清單。
              </p>
            </div>

            {!notice ? (
              <p className="text-sm text-muted-foreground">請先選擇來源包裝通知單。</p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-10">納入</TableHead>
                      <TableHead>客戶品名</TableHead>
                      <TableHead>皇加品名</TableHead>
                      <TableHead>顏色</TableHead>
                      <TableHead className="text-right">商品總數 (Yard)</TableHead>
                      <TableHead className="text-right">米數 (Meter)</TableHead>
                      <TableHead>加工方法</TableHead>
                      <TableHead className="text-right">加工單價</TableHead>
                      <TableHead>備註</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {processingItems.map((item) => (
                      <TableRow key={item.id}>
                        <TableCell>
                          <input
                            type="checkbox"
                            checked={selectedItemIds.includes(item.id)}
                            onChange={(e) =>
                              setSelectedItemIds((prev) =>
                                e.target.checked ? [...prev, item.id] : prev.filter((id) => id !== item.id),
                              )
                            }
                          />
                        </TableCell>
                        <TableCell>{item.customerProductName}</TableCell>
                        <TableCell>{item.roricaProductName}</TableCell>
                        <TableCell>{item.color}</TableCell>
                        <TableCell className="text-right">{formatNumber(item.yard, 0)}</TableCell>
                        <TableCell className="text-right">{formatNumber(item.meter, 1)}</TableCell>
                        <TableCell className="text-xs">
                          <span className="rounded bg-muted px-1.5 py-0.5 text-ink-body">{item.processingMethod}</span>
                          {item.processingMethodNote ? (
                            <span className="ml-1 text-muted-foreground">{item.processingMethodNote}</span>
                          ) : null}
                        </TableCell>
                        <TableCell className="text-right">
                          <Input
                            type="number"
                            step="0.1"
                            min="0"
                            className="ml-auto h-8 w-24 text-right"
                            value={unitPrices[item.id] ?? ''}
                            onChange={(e) => setUnitPrices((prev) => ({ ...prev, [item.id]: e.target.value }))}
                          />
                        </TableCell>
                        <TableCell className="text-muted-foreground">{item.note || '-'}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                <p className="mt-2 text-xs text-muted-foreground">
                  數量與加工方法唯讀，帶入自表1；加工單價為本單專屬可編輯欄位。
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">包裝設定</CardTitle>
          </CardHeader>
          <CardContent>
            {notice ? (
              <PackagingSummary packaging={buildSecondaryProcessingPackaging(notice)} />
            ) : (
              <p className="text-sm text-muted-foreground">請先選擇來源包裝通知單。</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
