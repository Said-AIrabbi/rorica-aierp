import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import type { ColumnDef } from '@tanstack/react-table'
import { PageHeader } from '@/components/shared/PageHeader'
import { DataTable } from '@/components/shared/DataTable'
import { api } from '@/mocks/api'
import { getCategoryLabel, getCustomer } from '@/mocks/data'
import { formatDate, isColorStale } from '@/lib/dates'
import { formatNumber, inchToCm, yardPriceToMeterPrice } from '@/lib/units'
import type { Product } from '@/types'

/** 主檔單價以「碼」為計價單位，同時列出換算後的每米單價（÷0.9144），不另存牌價M欄位 */
function dualUnitPrice(pricePerYard: number): string {
  return `${formatNumber(pricePerYard, 1)}/Y　≈ ${formatNumber(yardPriceToMeterPrice(pricePerYard), 1)}/M`
}

export function ProductListPage() {
  const navigate = useNavigate()
  const { data = [], isLoading } = useQuery({ queryKey: ['products'], queryFn: api.products })

  const columns = useMemo<ColumnDef<Product, unknown>[]>(
    () => [
      { accessorKey: 'id', header: '產品編號' },
      { accessorKey: 'sortNo', header: '產品序號（分支）' },
      { accessorKey: 'productName', header: '皇加品名' },
      { accessorKey: 'customerProductName', header: '客戶品名' },
      {
        id: 'category',
        header: '款式類別',
        accessorFn: (row) => getCategoryLabel(row.categoryCode),
      },
      {
        id: 'customer',
        header: '所屬客戶',
        accessorFn: (row) => getCustomer(row.customerId)?.shortName ?? row.customerId,
      },
      { accessorKey: 'material', header: '胚布材質' },
      { accessorKey: 'greigeSpec', header: '胚布規格' },
      { accessorKey: 'finishedSpec', header: '成品規格' },
      // 幅寬原始單位為英吋（廠商規格單位），括號附註公分換算供內部參考
      {
        id: 'width',
        header: '幅寬',
        accessorFn: (row) => `${row.width}" ±${row.widthTolerancePct}%（≈ ${formatNumber(inchToCm(row.width), 1)} cm）`,
      },
      { id: 'weightGY', header: '碼重 (G/Y)', accessorFn: (row) => `${row.weightGY} ±${row.weightTolerancePct}%` },
      { id: 'weightMY', header: '米重 (G/M，自動換算)', accessorFn: (row) => row.weightMY },
      {
        id: 'originalRollStandardYard',
        header: '原疋標準尺寸',
        accessorFn: (row) => `${formatNumber(row.originalRollStandardYard, 1)} Y`,
      },
      // 牌價Y／牌價M 不拆分為兩個欄位，改以共用係數 0.9144 即時換算兩種計價單位
      {
        id: 'costPrice',
        header: '進價 (每碼／每米)',
        accessorFn: (row) => (row.costPrice != null ? dualUnitPrice(row.costPrice) : '-'),
      },
      {
        id: 'sellPrice',
        header: '售價 (每碼／每米)',
        accessorFn: (row) => (row.sellPrice != null ? dualUnitPrice(row.sellPrice) : '-'),
      },
      {
        id: 'colors',
        header: '歷史色卡',
        cell: ({ row }) => (
          <div className="flex flex-wrap gap-1">
            {row.original.colors.map((c) => (
              <span
                key={c.color}
                title={`最後使用：${formatDate(c.lastUsedAt)}`}
                className={
                  isColorStale(c.lastUsedAt)
                    ? 'rounded border border-warning/40 bg-warning/10 px-1.5 py-0.5 text-xs text-warning'
                    : 'rounded border border-border bg-muted px-1.5 py-0.5 text-xs text-ink-body'
                }
              >
                {c.color}
                {isColorStale(c.lastUsedAt) && ' ⚠'}
              </span>
            ))}
          </div>
        ),
      },
    ],
    [],
  )

  return (
    <div>
      <PageHeader
        title="產品主檔"
        description="點選任一列可開啟編輯視窗。產品編號與產品序號皆由系統自動編號、不可修改；同一皇加品名的規格若有些微差異，會各自建檔並以產品序號區分分支。顏色為「客戶＋皇加品名＋色號＋染整廠」四者綁定，非通用色號。標示 ⚠ 表示超過12個月未使用，疑似複色。進價/售價欄位可見範圍待依角色權限另行設定，此處先顯示全部。"
      />
      <DataTable
        columns={columns}
        data={data}
        searchPlaceholder="搜尋品名、編號..."
        onRowClick={(row) => navigate(`/masters/products/${row.id}`)}
        emptyText={isLoading ? '載入中...' : '目前沒有產品資料'}
      />
    </div>
  )
}
