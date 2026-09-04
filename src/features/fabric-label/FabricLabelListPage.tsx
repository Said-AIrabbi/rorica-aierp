import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link, useNavigate } from 'react-router-dom'
import type { ColumnDef } from '@tanstack/react-table'
import { Info } from 'lucide-react'
import { PageHeader } from '@/components/shared/PageHeader'
import { DataTable } from '@/components/shared/DataTable'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { api } from '@/mocks/api'
import { rollLengthText } from '@/components/shared/BasisQty'
import type { FabricLabel } from '@/types'

export function FabricLabelListPage() {
  const navigate = useNavigate()
  const { data = [], isLoading } = useQuery({ queryKey: ['fabricLabels'], queryFn: api.fabricLabels })

  const columns = useMemo<ColumnDef<FabricLabel, unknown>[]>(
    () => [
      { accessorKey: 'rollCode', header: '布卷條碼（胚布編號-流水號）' },
      { id: 'productId', header: '產品編號', accessorFn: (row) => row.productId ?? '-' },
      { accessorKey: 'receiptId', header: '來源入庫單' },
      { accessorKey: 'productName', header: '皇加品名' },
      { id: 'composition', header: '成分', accessorFn: (row) => row.composition ?? '-' },
      { accessorKey: 'color', header: '顏色' },
      { id: 'width', header: '幅寬', accessorFn: (row) => `${row.width}"` },
      { id: 'batchCode', header: '批', accessorFn: (row) => row.batchCode ?? '-' },
      // 長度以該捲入庫時實際量測的單位為主值，另一單位標 ≈ 為換算值
      { id: 'length', header: '長度（實測單位為主）', accessorFn: (row) => rollLengthText(row.length, row.unit) },
      {
        id: 'status',
        header: '狀態',
        accessorFn: (row) => row.status,
        cell: ({ getValue }) => <StatusBadge status={getValue<string>()} />,
      },
    ],
    [],
  )

  return (
    <div>
      <PageHeader
        title="布卷資料（跨商品檢視）"
        formCode="主檔"
        description="倉庫裡實際存在的每一捲布，入庫確認時由表6並行產生。庫存查詢與接疋判斷實際查的就是這份資料。"
      />
      <div className="mb-4 flex items-start gap-2 rounded-lg border border-brand/30 bg-brand/10 p-3 text-sm text-ink-body">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-brand-dark" />
        <span>
          本頁為<strong>跨商品</strong>的布卷查詢（如只知道條碼、要找出是哪一捲時使用）。日常操作請由
          <Link to="/masters/products" className="mx-1 font-medium text-brand-dark underline">
            商品主檔
          </Link>
          點入商品，該分支的布卷即列於商品詳細頁——資料層布卷仍是獨立主檔（一列＝實際存在的一捲布，庫存帳性質），
          商品一列則＝一個產品分支（型錄性質），庫存比對只比對同一產品分支的布卷。
          點進任一捲可檢視長度異動紀錄、分割布卷，並列印貼附於布捲的實體標籤（表7 列印格式）。
        </span>
      </div>
      <DataTable
        columns={columns}
        data={data}
        searchPlaceholder="搜尋條碼、入庫單..."
        onRowClick={(row) => navigate(`/fabric-label/${row.id}`)}
        emptyText={isLoading ? '載入中...' : '目前沒有布卷條碼紀錄'}
      />
    </div>
  )
}
