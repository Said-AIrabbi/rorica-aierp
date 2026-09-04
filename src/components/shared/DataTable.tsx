import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import {
  type ColumnDef,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  type SortingState,
  useReactTable,
} from '@tanstack/react-table'
import { ArrowUpDown, Search } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { cn } from '@/lib/utils'

interface DataTableProps<TData> {
  columns: ColumnDef<TData, unknown>[]
  data: TData[]
  searchPlaceholder?: string
  onRowClick?: (row: TData) => void
  emptyText?: string
  /**
   * 凍結窗格：表頭固定於表格上方。啟用後表格自帶垂直捲軸（高度上限 maxHeight），
   * 垂直捲動改在表格內發生——sticky 是相對「最近的捲動祖先」定位，
   * 若沿用整頁捲動，表頭就會跟著整塊表格一起捲出畫面。
   */
  stickyHeader?: boolean
  /**
   * 水平捲動時要固定在左側的欄位 id（依陣列順序由左至右排列）。
   * 未指定時固定第一欄——各列表的第一欄都是識別欄（單號／代碼／條碼／品名），
   * 橫向捲到右邊時，那正是唯一還需要看得到的欄位。傳入空陣列即可關閉。
   */
  pinnedColumnIds?: string[]
  /** 捲動區高度上限，僅在 stickyHeader 時有效 */
  maxHeight?: string
}

export function DataTable<TData>({
  columns,
  data,
  searchPlaceholder = '搜尋...',
  onRowClick,
  emptyText = '目前沒有資料',
  stickyHeader = true,
  pinnedColumnIds,
  maxHeight = 'max(18rem, calc(100dvh - 20rem))',
}: DataTableProps<TData>) {
  const [sorting, setSorting] = useState<SortingState>([])
  const [globalFilter, setGlobalFilter] = useState('')

  const table = useReactTable({
    data,
    columns,
    state: { sorting, globalFilter },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
  })

  // 呼叫端多半直接寫陣列字面值，每次 render 都是新參考；以字串為鍵取得穩定的相依值
  const firstColumnId = table.getAllLeafColumns()[0]?.id
  const pinnedKey = (pinnedColumnIds ?? (firstColumnId ? [firstColumnId] : [])).join(',')
  const pinned = useMemo(() => (pinnedKey ? pinnedKey.split(',') : []), [pinnedKey])
  const lastPinnedId = pinned[pinned.length - 1]

  /**
   * 固定欄的 left 位移量以實際量測的表頭寬度累加，而不是預先設定的欄寬——
   * 欄位內容是中文品名、長度不固定，表格又是自動版面，寫死寬度會讓固定欄與
   * 捲動中的內容錯位。改用 ResizeObserver 在欄寬變動（換資料、視窗縮放）時重算。
   */
  const headRefs = useRef<Record<string, HTMLTableCellElement | null>>({})
  const [pinOffsets, setPinOffsets] = useState<Record<string, number>>({})

  useLayoutEffect(() => {
    if (pinned.length === 0) return
    const measure = () => {
      let acc = 0
      const next: Record<string, number> = {}
      for (const id of pinned) {
        next[id] = acc
        acc += headRefs.current[id]?.offsetWidth ?? 0
      }
      setPinOffsets((prev) => {
        const same = pinned.every((id) => prev[id] === next[id]) && Object.keys(prev).length === pinned.length
        return same ? prev : next
      })
    }
    measure()
    const observer = new ResizeObserver(measure)
    for (const id of pinned) {
      const el = headRefs.current[id]
      if (el) observer.observe(el)
    }
    return () => observer.disconnect()
  }, [pinned, data])

  /** 固定欄需要自己的背景色蓋住捲過去的資料；bg-inherit 讓它跟著整列（含 hover 態）變色 */
  const pinnedCellClass = (columnId: string, kind: 'head' | 'cell') => {
    if (!pinned.includes(columnId)) return undefined
    return cn(
      'sticky bg-inherit',
      // 表頭的固定欄同時卡在上緣與左緣，層級要高於只固定一邊的儲存格
      kind === 'head' ? 'z-30' : 'z-20',
      columnId === lastPinnedId && 'shadow-[1px_0_0_var(--color-border)]',
    )
  }
  const pinnedStyle = (columnId: string) =>
    pinned.includes(columnId) ? { left: pinOffsets[columnId] ?? 0 } : undefined

  return (
    <div className="space-y-3">
      <div className="relative w-full sm:max-w-xs">
        <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input
          value={globalFilter}
          onChange={(e) => setGlobalFilter(e.target.value)}
          placeholder={searchPlaceholder}
          className="pl-8"
        />
      </div>
      <div
        className={cn(
          'relative rounded-lg border border-border bg-card',
          stickyHeader ? 'overflow-auto' : 'overflow-x-auto',
        )}
        style={stickyHeader ? { maxHeight } : undefined}
      >
        {/* min-w：欄位多，窄螢幕壓縮成斷行泥巴不如水平捲動（第一欄已固定，捲到右邊仍看得到識別欄） */}
        <table className="w-full min-w-[48rem] caption-bottom text-sm" data-slot="table">
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              // 表頭列自己上背景色：sticky 的儲存格若透明，捲動中的資料會透出來
              <TableRow key={headerGroup.id} className="bg-muted hover:bg-muted">
                {headerGroup.headers.map((header) => (
                  <TableHead
                    key={header.id}
                    ref={(el) => {
                      headRefs.current[header.column.id] = el
                    }}
                    className={cn(
                      stickyHeader && 'sticky top-0 z-10 bg-inherit shadow-[inset_0_-1px_0_var(--color-border)]',
                      pinnedCellClass(header.column.id, 'head'),
                    )}
                    style={pinnedStyle(header.column.id)}
                  >
                    {header.isPlaceholder ? null : (
                      <button
                        type="button"
                        className={cn(
                          'flex items-center gap-1',
                          header.column.getCanSort() && 'cursor-pointer select-none hover:text-ink',
                        )}
                        onClick={header.column.getToggleSortingHandler()}
                      >
                        {flexRender(header.column.columnDef.header, header.getContext())}
                        {header.column.getCanSort() && <ArrowUpDown className="h-3 w-3" />}
                      </button>
                    )}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.length ? (
              table.getRowModel().rows.map((row) => (
                <TableRow
                  key={row.id}
                  // 固定欄以 bg-inherit 取色，所以整列必須是不透明色，否則捲動的內容會透出來
                  className={cn('bg-card', onRowClick && 'cursor-pointer hover:bg-muted')}
                  onClick={() => onRowClick?.(row.original)}
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id} className={pinnedCellClass(cell.column.id, 'cell')} style={pinnedStyle(cell.column.id)}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={columns.length} className="h-24 text-center text-muted-foreground">
                  {emptyText}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </table>
      </div>
    </div>
  )
}
