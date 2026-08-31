import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import type { ColumnDef } from '@tanstack/react-table'
import { PageHeader } from '@/components/shared/PageHeader'
import { DataTable } from '@/components/shared/DataTable'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { api } from '@/mocks/api'
import { getCustomer } from '@/mocks/data'
import { formatDate } from '@/lib/dates'
import { formatNumber } from '@/lib/units'
import { isAbnormalCloseOverdue } from '@/lib/workflow'
import type { AbnormalNotice } from '@/types'

/** 已勾選的處理方式（可複選）：列表以標籤並列，一眼看出這張單同時在處理幾件事 */
function handlingLabels(notice: AbnormalNotice): string[] {
  const labels: string[] = []
  if (notice.handling.returnGoods) labels.push('退貨')
  if (notice.handling.deduction) labels.push('扣款不退貨')
  if (notice.handling.replacement) labels.push('補貨換貨')
  if (notice.handling.other) labels.push('其他補償')
  return labels
}

export function AbnormalNoticeListPage() {
  const navigate = useNavigate()
  const { data = [], isLoading } = useQuery({ queryKey: ['abnormalNotices'], queryFn: api.abnormalNotices })

  const columns = useMemo<ColumnDef<AbnormalNotice, unknown>[]>(
    () => [
      { accessorKey: 'id', header: '單號' },
      {
        id: 'kind',
        header: '種類',
        cell: ({ row }) =>
          row.original.kind === '上游追討' ? (
            <Badge variant="outline" className="border-accent-blue text-accent-blue">
              上游追討附單
            </Badge>
          ) : (
            <Badge variant="outline">客訴異常</Badge>
          ),
      },
      {
        id: 'customer',
        header: '客戶',
        accessorFn: (row) => (row.customerId ? (getCustomer(row.customerId)?.shortName ?? row.customerId) : '-'),
      },
      { id: 'productName', header: '皇加品名', accessorFn: (row) => row.productName || '-' },
      { id: 'color', header: '顏色', accessorFn: (row) => row.color || '-' },
      {
        id: 'abnormalQty',
        header: '異常數量 (Y)',
        accessorFn: (row) => formatNumber(row.abnormalQty, 1),
      },
      { id: 'category', header: '異常問題分類', accessorFn: (row) => [row.categoryName, row.categoryItem].filter(Boolean).join('／') || '-' },
      {
        id: 'handling',
        header: '處理方式',
        cell: ({ row }) => {
          const labels = handlingLabels(row.original)
          return labels.length === 0 ? (
            <span className="text-muted-foreground">待生管確認</span>
          ) : (
            <div className="flex flex-wrap gap-1">
              {labels.map((l) => (
                <Badge key={l} variant="outline">
                  {l}
                </Badge>
              ))}
            </div>
          )
        },
      },
      { id: 'noticeDate', header: '受理日', accessorFn: (row) => formatDate(row.noticeDate) },
      {
        id: 'status',
        header: '狀態',
        cell: ({ row }) => (
          <div className="flex items-center gap-1.5">
            <StatusBadge status={row.original.status} />
            {/* 成案後 12 個月內須結案，逾期視為異常需另行追蹤原因（提醒用，不擋操作） */}
            {isAbnormalCloseOverdue(row.original) && (
              <Badge variant="outline" className="border-destructive text-destructive">
                逾期未結案
              </Badge>
            )}
          </div>
        ),
      },
    ],
    [],
  )

  return (
    <div>
      <PageHeader
        title="異常通知單"
        formCode="表9"
        description="客訴分兩條路徑：①不退貨（依異常程度向廠商申請扣款）②退貨（退貨＋運費＋退款）；處理方式可複選。客戶簽收後 6 個月內受理，成案後 12 個月內結案。"
        actions={
          <Button className="bg-brand hover:bg-brand-dark" onClick={() => navigate('/abnormal-notice/new')}>
            ＋ 受理客訴
          </Button>
        }
      />
      <DataTable
        columns={columns}
        data={data}
        searchPlaceholder="搜尋單號、品名、客戶..."
        onRowClick={(row) => navigate(`/abnormal-notice/${row.id}`)}
        emptyText={isLoading ? '載入中...' : '目前沒有異常通知單'}
      />
    </div>
  )
}
