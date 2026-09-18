import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import type { ColumnDef } from '@tanstack/react-table'
import { PageHeader } from '@/components/shared/PageHeader'
import { DataTable } from '@/components/shared/DataTable'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { Button } from '@/components/ui/button'
import { api } from '@/mocks/api'
import { formatDate } from '@/lib/dates'
import { formatNumber } from '@/lib/units'
import { PI_CURRENCY_SYMBOL, effectivePiStatus, piDueDate, piTotalAmount } from '@/lib/pi'
import type { ProformaInvoice } from '@/types'

export function PiListPage() {
  const navigate = useNavigate()
  const { data = [], isLoading } = useQuery({ queryKey: ['proformaInvoices'], queryFn: api.proformaInvoices })
  const { data: packingNotices = [] } = useQuery({ queryKey: ['packingNotices'], queryFn: api.packingNotices })

  const columns = useMemo<ColumnDef<ProformaInvoice, unknown>[]>(
    () => [
      { accessorKey: 'id', header: '單號' },
      { accessorKey: 'customerName', header: '客戶' },
      {
        id: 'poNos',
        header: 'PO NO.',
        accessorFn: (row) => [...new Set(row.items.map((i) => i.poNo))].join('、'),
      },
      { id: 'items', header: '品項數', accessorFn: (row) => row.items.length },
      {
        id: 'amount',
        header: '總金額',
        accessorFn: (row) => `${PI_CURRENCY_SYMBOL[row.currency]} ${formatNumber(piTotalAmount(row), 2)}`,
      },
      { id: 'tradeTerm', header: '貿易條件', accessorFn: (row) => row.tradeTerm },
      { id: 'leadTime', header: '交期', accessorFn: (row) => `${row.leadTimeDays} 天` },
      { id: 'createdAt', header: '建立日', accessorFn: (row) => formatDate(row.createdAt) },
      {
        id: 'quoteValidUntil',
        header: '報價有效期',
        accessorFn: (row) => formatDate(row.quoteValidUntil),
      },
      {
        id: 'dueDate',
        // 應出貨日要等第一張表1 生效才起算（決策36），未起算者顯示「－」而非空白，避免看起來像漏填
        header: '應出貨日',
        accessorFn: (row) => piDueDate(row, packingNotices)?.format('YYYY/MM/DD') ?? '－（表1 尚未生效）',
      },
      {
        id: 'packingNotices',
        header: '已轉表1',
        accessorFn: (row) => (row.packingNoticeIds.length > 0 ? row.packingNoticeIds.join('、') : '-'),
      },
      {
        id: 'status',
        header: '狀態',
        accessorFn: (row) => effectivePiStatus(row),
        cell: ({ getValue }) => <StatusBadge status={getValue<string>()} />,
      },
    ],
    [packingNotices],
  )

  return (
    <div>
      <PageHeader
        title="PI 單（預估發票）"
        formCode="PI"
        description="Phase 2：客戶在表1 之前先收到的報價／預估發票。客戶回簽後依 PO 拆單轉為表1 包裝通知單。"
        actions={
          <Button className="bg-brand hover:bg-brand-dark" onClick={() => navigate('/proforma-invoice/new')}>
            ＋ 新增 PI 單
          </Button>
        }
      />
      <DataTable
        columns={columns}
        data={data}
        searchPlaceholder="搜尋單號、客戶、PO NO...."
        onRowClick={(row) => navigate(`/proforma-invoice/${row.id}`)}
        emptyText={isLoading ? '載入中...' : '目前沒有 PI 單'}
      />
    </div>
  )
}
