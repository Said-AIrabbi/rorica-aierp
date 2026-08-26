import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, Save } from 'lucide-react'
import { toast } from 'sonner'
import { PageHeader } from '@/components/shared/PageHeader'
import { DetailField, DetailGrid } from '@/components/shared/DetailField'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { PrintActions } from '@/components/print/PrintActions'
import { SecondaryProcessingPrint } from './SecondaryProcessingPrint'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { api } from '@/mocks/api'
import { getCustomer, getVendor, productBranchSuffix } from '@/mocks/data'
import {
  setSecondaryProcessingStatus,
  updateSecondaryProcessingItems,
  updateSecondaryProcessingVendor,
  type SecondaryProcessingVendorInput,
} from '@/mocks/mutations'
import dayjs from 'dayjs'
import { formatDate } from '@/lib/dates'
import { formatNumber } from '@/lib/units'
import { PackagingSummary } from './PackagingSummary'
import type { SecondaryProcessingItem } from '@/types'

export function SecondaryProcessingDetailPage() {
  const { id } = useParams<{ id: string }>()
  const queryClient = useQueryClient()
  const { data = [] } = useQuery({
    queryKey: ['secondaryProcessingOrders'],
    queryFn: api.secondaryProcessingOrders,
  })
  const order = data.find((o) => o.id === id)

  const { data: vendors = [] } = useQuery({ queryKey: ['vendors'], queryFn: api.vendors })

  // 加工單價與備註為草稿階段可調整欄位，先落在本地草稿再一次寫回
  const [itemDraft, setItemDraft] = useState<SecondaryProcessingItem[]>([])
  useEffect(() => {
    if (order) setItemDraft(order.items)
  }, [order])

  /**
   * 廠商資訊草稿：染整完成時自動建立的二次加工單沒有加工廠，
   * 須由生管在此補齊後才能發包，故草稿狀態下整組欄位可編輯。
   */
  const [vendorDraft, setVendorDraft] = useState<SecondaryProcessingVendorInput>({ vendorId: '' })
  useEffect(() => {
    if (!order) return
    setVendorDraft({
      vendorId: order.vendorId,
      vendorContactPerson: order.vendorContactPerson,
      vendorPhone: order.vendorPhone,
      vendorAddress: order.vendorAddress,
      internalContact: order.internalContact,
      dueDate: order.dueDate,
      note: order.note,
    })
  }, [order])

  // 選定加工廠後由廠商主檔帶入聯絡資訊，帶入後仍可就本單覆寫
  function selectVendor(vendorId: string) {
    const vendor = vendors.find((v) => v.id === vendorId)
    setVendorDraft((prev) => ({
      ...prev,
      vendorId,
      vendorContactPerson: vendor?.contactPerson ?? '',
      vendorPhone: vendor?.phone ?? '',
      vendorAddress: vendor?.address ?? '',
    }))
  }

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['secondaryProcessingOrders'] })

  const statusMutation = useMutation({
    mutationFn: (status: '生效' | '已完成') => setSecondaryProcessingStatus(id!, status),
    onSuccess: async (updated) => {
      await invalidate()
      toast.success(`${updated.id} 已變更為「${updated.status}」`)
    },
    onError: (error: Error) => toast.error(error.message),
  })

  const saveVendorMutation = useMutation({
    mutationFn: () => updateSecondaryProcessingVendor(id!, vendorDraft),
    onSuccess: async () => {
      await invalidate()
      toast.success('廠商資訊已儲存')
    },
    onError: (error: Error) => toast.error(error.message),
  })

  const saveItemsMutation = useMutation({
    mutationFn: () => updateSecondaryProcessingItems(id!, itemDraft),
    onSuccess: async () => {
      await invalidate()
      toast.success('加工明細已儲存')
    },
    onError: (error: Error) => toast.error(error.message),
  })

  if (!order) {
    return <div className="text-sm text-muted-foreground">找不到單號 {id} 的二次加工單。</div>
  }

  const vendor = getVendor(order.vendorId)
  const itemsEditable = order.status === '草稿'
  const itemsDirty = JSON.stringify(itemDraft) !== JSON.stringify(order.items)
  const vendorDirty =
    JSON.stringify(vendorDraft) !==
    JSON.stringify({
      vendorId: order.vendorId,
      vendorContactPerson: order.vendorContactPerson,
      vendorPhone: order.vendorPhone,
      vendorAddress: order.vendorAddress,
      internalContact: order.internalContact,
      dueDate: order.dueDate,
      note: order.note,
    })
  const totalAmount = itemDraft.reduce((sum, item) => sum + (item.unitPrice ?? 0) * item.yard, 0)

  const updateItem = (index: number, patch: Partial<SecondaryProcessingItem>) =>
    setItemDraft((prev) => prev.map((item, i) => (i === index ? { ...item, ...patch } : item)))

  return (
    <div>
      <Link
        to="/secondary-processing"
        className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-ink print:hidden"
      >
        <ArrowLeft className="h-4 w-4" /> 返回二次加工單列表
      </Link>
      <PageHeader
        title={order.id}
        formCode="表5"
        description={
          <span>
            來源包裝通知單：
            <Link className="text-accent-blue hover:underline" to={`/packing-notice/${order.parentId}`}>
              {order.parentId}
            </Link>
          </span>
        }
        actions={
          <>
            <StatusBadge status={order.status} />
            <PrintActions sheets={[{ key: 'doc', label: '列印二次加工單', sheet: <SecondaryProcessingPrint order={order} /> }]} />
            {order.status === '草稿' && (
              <Button
                className="bg-brand hover:bg-brand-dark"
                // 染整完成自動建立的草稿沒有加工廠，補齊後才能發包
                disabled={statusMutation.isPending || !order.vendorId}
                onClick={() => statusMutation.mutate('生效')}
              >
                確認發包（轉生效）
              </Button>
            )}
            {order.status === '生效' && (
              <Button
                className="bg-brand hover:bg-brand-dark"
                disabled={statusMutation.isPending}
                onClick={() => statusMutation.mutate('已完成')}
              >
                加工完成結案
              </Button>
            )}
          </>
        }
      />

      <div className="space-y-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">廠商資訊</CardTitle>
            {itemsEditable && (
              <Button
                size="sm"
                variant="outline"
                disabled={!vendorDirty || saveVendorMutation.isPending}
                onClick={() => saveVendorMutation.mutate()}
              >
                <Save className="mr-1 h-4 w-4" /> 儲存廠商資訊
              </Button>
            )}
          </CardHeader>
          <CardContent>
            {itemsEditable ? (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <div className="space-y-1">
                  <Label className="text-xs">加工廠（選自廠商資料主檔）</Label>
                  <Select value={vendorDraft.vendorId} onValueChange={selectVendor}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="請選擇加工廠" />
                    </SelectTrigger>
                    <SelectContent>
                      {vendors.map((v) => (
                        <SelectItem key={v.id} value={v.id}>
                          {v.name}
                          {v.siteCode ?? ''}（{v.types.join('／')}）
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">廠商聯絡人</Label>
                  <Input
                    value={vendorDraft.vendorContactPerson ?? ''}
                    onChange={(e) => setVendorDraft((prev) => ({ ...prev, vendorContactPerson: e.target.value }))}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">廠商電話</Label>
                  <Input
                    value={vendorDraft.vendorPhone ?? ''}
                    onChange={(e) => setVendorDraft((prev) => ({ ...prev, vendorPhone: e.target.value }))}
                  />
                </div>
                <div className="space-y-1 sm:col-span-2">
                  <Label className="text-xs">廠商地址</Label>
                  <Input
                    value={vendorDraft.vendorAddress ?? ''}
                    onChange={(e) => setVendorDraft((prev) => ({ ...prev, vendorAddress: e.target.value }))}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">交期</Label>
                  <Input
                    type="date"
                    value={dayjs(vendorDraft.dueDate ?? order.dueDate).format('YYYY-MM-DD')}
                    onChange={(e) => setVendorDraft((prev) => ({ ...prev, dueDate: dayjs(e.target.value).toISOString() }))}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">皇加聯絡窗口</Label>
                  <Input
                    value={vendorDraft.internalContact ?? ''}
                    onChange={(e) => setVendorDraft((prev) => ({ ...prev, internalContact: e.target.value }))}
                    placeholder="非必填"
                  />
                </div>
                <div className="space-y-1 sm:col-span-2">
                  <Label className="text-xs">備註</Label>
                  <Input
                    value={vendorDraft.note ?? ''}
                    onChange={(e) => setVendorDraft((prev) => ({ ...prev, note: e.target.value }))}
                    placeholder="非必填"
                  />
                </div>
              </div>
            ) : (
            <DetailGrid>
              <DetailField
                label="加工廠"
                value={vendor ? `${vendor.name}${vendor.siteCode ?? ''}` : order.vendorId}
              />
              <DetailField label="廠商類型" value={vendor?.types.join('／')} />
              <DetailField label="廠商聯絡人" value={order.vendorContactPerson} />
              <DetailField label="廠商電話" value={order.vendorPhone} />
              <DetailField label="廠商地址" value={order.vendorAddress} />
              <DetailField label="客戶" value={getCustomer(order.customerId)?.shortName ?? order.customerId} />
              {/* 由表4結案自動建立者才有來源染單；人工建單無對應染單 */}
              <DetailField
                label="來源染單"
                value={
                  order.dyeOrderId ? (
                    <Link to={`/dye-order/${order.dyeOrderId}`} className="text-brand-dark underline">
                      {order.dyeOrderId}
                    </Link>
                  ) : (
                    '人工建單（無來源染單）'
                  )
                }
              />
              <DetailField label="建立日" value={formatDate(order.createdAt)} />
              <DetailField label="生效日" value={order.effectiveAt ? formatDate(order.effectiveAt) : '-'} />
              <DetailField label="交期" value={formatDate(order.dueDate)} />
              <DetailField label="皇加聯絡窗口" value={order.internalContact} />
              <DetailField label="備註" value={order.note || '-'} />
            </DetailGrid>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">加工明細</CardTitle>
            {itemsEditable && (
              <Button
                size="sm"
                variant="outline"
                disabled={!itemsDirty || saveItemsMutation.isPending}
                onClick={() => saveItemsMutation.mutate()}
              >
                <Save className="mr-1 h-4 w-4" /> 儲存加工明細
              </Button>
            )}
          </CardHeader>
          <CardContent className="px-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>客戶品名</TableHead>
                    <TableHead>皇加品名</TableHead>
                    <TableHead>顏色</TableHead>
                    <TableHead className="text-right">商品總數 (Yard)</TableHead>
                    <TableHead className="text-right">米數 (Meter)</TableHead>
                    <TableHead>加工方法</TableHead>
                    <TableHead className="text-right">加工單價</TableHead>
                    <TableHead className="text-right">金額</TableHead>
                    <TableHead>備註</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {itemDraft.map((item, index) => (
                    <TableRow key={item.id}>
                      <TableCell>{item.customerProductName}</TableCell>
                      <TableCell>
                      {item.roricaProductName}
                      {/* 同品名有多個規格分支時附上分支序號，讓明細看得出指的是哪一個 */}
                      <span className="text-muted-foreground">{productBranchSuffix(item.productId)}</span>
                    </TableCell>
                      <TableCell>{item.color}</TableCell>
                      <TableCell className="text-right">{formatNumber(item.yard, 0)}</TableCell>
                      <TableCell className="text-right">{formatNumber(item.meter, 1)}</TableCell>
                      <TableCell className="text-xs">
                        {item.processingMethod ? (
                          <>
                            <span className="rounded bg-muted px-1.5 py-0.5 text-ink-body">{item.processingMethod}</span>
                            {item.processingMethodNote ? (
                              <span className="ml-1 text-muted-foreground">{item.processingMethodNote}</span>
                            ) : null}
                          </>
                        ) : (
                          '-'
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        {itemsEditable ? (
                          <Input
                            type="number"
                            step="0.1"
                            min="0"
                            className="ml-auto h-8 w-24 text-right"
                            value={item.unitPrice ?? ''}
                            onChange={(e) =>
                              updateItem(index, {
                                unitPrice: e.target.value === '' ? undefined : Number(e.target.value),
                              })
                            }
                          />
                        ) : item.unitPrice != null ? (
                          formatNumber(item.unitPrice, 1)
                        ) : (
                          '-'
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        {item.unitPrice != null ? formatNumber(item.unitPrice * item.yard, 0) : '-'}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {itemsEditable ? (
                          <Input
                            className="h-8"
                            value={item.note ?? ''}
                            placeholder="非必填"
                            onChange={(e) => updateItem(index, { note: e.target.value })}
                          />
                        ) : (
                          item.note || '-'
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <div className="px-6 pt-3 text-right text-sm">
              加工金額合計：<span className="font-semibold text-ink">{formatNumber(totalAmount, 0)}</span>
            </div>
            <p className="px-6 pt-1 text-xs text-muted-foreground">
              品項、數量與加工方法唯讀，帶入自表1包裝通知單；加工單價與備註僅草稿狀態可調整。
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">包裝設定</CardTitle>
          </CardHeader>
          <CardContent>
            <PackagingSummary packaging={order.packaging} />
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
