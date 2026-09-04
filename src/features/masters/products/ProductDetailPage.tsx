import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Save } from 'lucide-react'
import { toast } from 'sonner'
import { PageHeader } from '@/components/shared/PageHeader'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { api } from '@/mocks/api'
import { customers, getVendor } from '@/mocks/data'
import { createProduct, deleteProduct, updateProduct, type ProductInput } from '@/mocks/mutations'
import { DeleteMasterButton } from '@/components/shared/DeleteMasterButton'
import { formatDate, isColorStale } from '@/lib/dates'
import { formatNumber, inchToCm, yardPriceToMeterPrice, yardWeightToMeterWeight } from '@/lib/units'
import { PRODUCT_CATEGORIES, type Product } from '@/types'
import { ProductStockCard } from './ProductStockCard'

function toInput(product: Product): ProductInput {
  return {
    productName: product.productName,
    customerProductName: product.customerProductName,
    customerId: product.customerId,
    categoryCode: product.categoryCode,

    greigeFabricCode: product.greigeFabricCode,
    material: product.material,
    greigeSpec: product.greigeSpec,
    finishedSpec: product.finishedSpec,
    thicknessMm: product.thicknessMm,
    characteristics: product.characteristics,
    width: product.width,
    widthTolerancePct: product.widthTolerancePct,
    weightGY: product.weightGY,
    weightTolerancePct: product.weightTolerancePct,
    originalRollStandardYard: product.originalRollStandardYard,
    costPrice: product.costPrice,
    sellPrice: product.sellPrice,
  }
}

/** 新增時的空白表單：規格數值先給常見預設，避免使用者面對一整排 0 */
function emptyInput(): ProductInput {
  return {
    productName: '',
    customerProductName: '',
    customerId: customers[0]?.id ?? '',
    categoryCode: PRODUCT_CATEGORIES[0].code,
    greigeFabricCode: '',
    material: '',
    greigeSpec: '',
    finishedSpec: '',
    thicknessMm: 0,
    characteristics: '',
    width: 60,
    // 容許誤差沿用全公司慣例：幅寬 ±3%、碼重 ±5%
    widthTolerancePct: 3,
    weightGY: 0,
    weightTolerancePct: 5,
    originalRollStandardYard: 100,
    costPrice: undefined,
    sellPrice: undefined,
  }
}

/** 數字欄位：空字串一律視為 0，避免 NaN 寫回主檔 */
function num(value: string): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

export function ProductDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { data = [] } = useQuery({ queryKey: ['products'], queryFn: api.products })
  // 新增與編輯共用同一份表單：路由 /masters/products/new 即為新增模式
  const isNew = id === 'new'
  const product = data.find((p) => p.id === id)
  const [draft, setDraft] = useState<ProductInput | null>(isNew ? emptyInput() : null)

  useEffect(() => {
    if (product) setDraft(toInput(product))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [product?.id])

  const mutation = useMutation({
    mutationFn: () => (isNew ? createProduct(draft!) : updateProduct(id!, draft!)),
    onSuccess: async (saved) => {
      await queryClient.invalidateQueries({ queryKey: ['products'] })
      toast.success(isNew ? `已建立商品 ${saved.id}（分支 ${saved.sortNo}）` : `${id} 商品資料已更新`)
      if (isNew) navigate(`/masters/products/${saved.id}`)
    },
    onError: (error: Error) => toast.error(error.message),
  })

  const deleteMutation = useMutation({
    mutationFn: () => deleteProduct(id!),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['products'] })
      toast.success(`已刪除商品 ${product?.productName ?? id}`)
      navigate('/masters/products')
    },
    // 有單據或布卷引用時 mutation 層會擋下並回傳引用的單號，原文顯示給使用者
    onError: (error: Error) => toast.error(error.message),
  })

  if ((!product && !isNew) || !draft) {
    return <div className="text-sm text-muted-foreground">找不到商品資料</div>
  }

  const set = <K extends keyof ProductInput>(key: K, value: ProductInput[K]) =>
    setDraft((prev) => (prev ? { ...prev, [key]: value } : prev))
  const dirty = isNew || (product ? JSON.stringify(draft) !== JSON.stringify(toInput(product)) : false)

  return (
    <div>
      <Link
        to="/masters/products"
        className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-ink"
      >
        <ArrowLeft className="h-4 w-4" /> 返回商品主檔
      </Link>

      <PageHeader
        title={isNew ? '新增商品' : `${product!.productName}-${product!.sortNo}　${product!.id}`}
        description="商品資料主檔編輯視窗。產品編號、產品序號、米重（G/M）與歷史色號為系統維護欄位，不開放手動輸入；同一皇加品名再建一筆即自動成為下一個規格分支。"
        actions={
          <>
            <Button variant="outline" onClick={() => navigate('/masters/products')}>
              <ArrowLeft className="mr-1 h-4 w-4" />
              返回商品主檔
            </Button>
            {!isNew && (
              <DeleteMasterButton
                label="商品"
                name={`${product!.productName}-${product!.sortNo}`}
                pending={deleteMutation.isPending}
                onConfirm={() => deleteMutation.mutate()}
              />
            )}
            <Button onClick={() => mutation.mutate()} disabled={!dirty || mutation.isPending}>
              <Save className="mr-1 h-4 w-4" />
              {isNew ? '建立商品' : '儲存商品資料'}
            </Button>
          </>
        }
      />

      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>基本識別</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-1">
              <Label className="text-xs">產品編號（唯讀）</Label>
              <Input value={isNew ? '建立後自動產生' : product!.id} disabled />
              <p className="text-xs text-muted-foreground">建檔時自動編號，單據以此關聯</p>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">產品序號（產品分支，唯讀）</Label>
              <Input value={isNew ? '建立後自動指派' : product!.sortNo} disabled />
              <p className="text-xs text-muted-foreground">同一皇加品名規格略有差異時，以此序號區分分支</p>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">皇加品名</Label>
              <Input value={draft.productName} onChange={(e) => set('productName', e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">客戶品名</Label>
              <Input
                value={draft.customerProductName}
                onChange={(e) => set('customerProductName', e.target.value)}
                placeholder="與皇加品名一對一對應"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">所屬客戶</Label>
              <Select value={draft.customerId} onValueChange={(v) => set('customerId', v)}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="請選擇客戶" />
                </SelectTrigger>
                <SelectContent>
                  {/* 已歇業客戶不從清單移除：既有商品仍掛在該客戶底下，移掉會讓欄位變空白；
                      改為標註，讓人不會誤選來建新商品 */}
                  {customers.map((c) => (
                    <SelectItem key={c.id} value={c.id} disabled={c.status === '已歇業' && draft.customerId !== c.id}>
                      {c.shortName}（{c.fullNameCN}）{c.status === '已歇業' ? '　已歇業' : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">產品類別</Label>
              <Select value={draft.categoryCode} onValueChange={(v) => set('categoryCode', v as Product['categoryCode'])}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="請選擇類別" />
                </SelectTrigger>
                <SelectContent>
                  {PRODUCT_CATEGORIES.map((c) => (
                    <SelectItem key={c.code} value={c.code}>
                      第{c.code}類　{c.zh}（{c.en}）
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">胚布編號</Label>
              <Input
                value={draft.greigeFabricCode ?? ''}
                onChange={(e) => set('greigeFabricCode', e.target.value)}
                placeholder="例：T3268305"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">產品說明</Label>
              <Input
                value={draft.characteristics}
                onChange={(e) => set('characteristics', e.target.value)}
                placeholder="例：暢銷款緞布:薄緞"
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>規格</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-1">
              <Label className="text-xs">成份</Label>
              <Input
                value={draft.material}
                onChange={(e) => set('material', e.target.value)}
                placeholder="例：100% POLY/METALLIC"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">胚布規格</Label>
              <Input
                value={draft.greigeSpec}
                onChange={(e) => set('greigeSpec', e.target.value)}
                placeholder="表4染整單第二列帶入"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">成品規格</Label>
              <Input
                value={draft.finishedSpec}
                onChange={(e) => set('finishedSpec', e.target.value)}
                placeholder="表4染整單第二列帶入"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">厚度（mm）</Label>
              <Input
                type="number"
                step="0.01"
                min="0"
                value={draft.thicknessMm}
                onChange={(e) => set('thicknessMm', num(e.target.value))}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">幅寬（英吋）約有 ±5% 誤差</Label>
              <div className="flex items-center gap-1.5">
                <Input
                  type="number"
                  step="0.5"
                  min="0"
                  className="w-24"
                  value={draft.width}
                  onChange={(e) => set('width', num(e.target.value))}
                />
                <span className="w-24 shrink-0 text-xs whitespace-nowrap text-muted-foreground">
                  ≈ {formatNumber(inchToCm(draft.width), 1)} cm
                </span>
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">幅寬容許誤差（%）</Label>
              <Input
                type="number"
                step="0.5"
                min="0"
                value={draft.widthTolerancePct}
                onChange={(e) => set('widthTolerancePct', num(e.target.value))}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">碼重（G/Y）約有 ±5% 誤差</Label>
              <Input
                type="number"
                step="0.1"
                min="0"
                value={draft.weightGY}
                onChange={(e) => set('weightGY', num(e.target.value))}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">碼重容許誤差（%）</Label>
              <Input
                type="number"
                step="0.5"
                min="0"
                value={draft.weightTolerancePct}
                onChange={(e) => set('weightTolerancePct', num(e.target.value))}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">米重（G/M，唯讀）</Label>
              <Input value={formatNumber(yardWeightToMeterWeight(draft.weightGY), 2)} disabled />
              <p className="text-xs text-muted-foreground">碼重 ÷ 0.9144 自動換算，隨碼重連動</p>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">原疋標準尺寸（碼）</Label>
              <Input
                type="number"
                step="1"
                min="0"
                value={draft.originalRollStandardYard}
                onChange={(e) => set('originalRollStandardYard', num(e.target.value))}
              />
              <p className="text-xs text-muted-foreground">接疋判斷基準，數值須大於客戶要求的捲長</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>價格</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-xs text-muted-foreground">
              進價／售價以「碼」為計價單位，牌價Y／牌價M 不拆分為兩個欄位；每米單價由全公司統一係數 0.9144 即時換算（每米單價 ＝ 每碼單價 ÷ 0.9144）。欄位可見範圍待依角色權限另行設定。
            </p>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1">
                <Label className="text-xs">進價（每碼）</Label>
                <div className="flex items-center gap-1.5">
                  <Input
                    type="number"
                    step="0.1"
                    min="0"
                    className="w-28"
                    value={draft.costPrice ?? ''}
                    onChange={(e) => set('costPrice', e.target.value === '' ? undefined : num(e.target.value))}
                  />
                  <span className="w-40 shrink-0 text-xs whitespace-nowrap text-muted-foreground">
                    {draft.costPrice != null ? `＝ ${formatNumber(yardPriceToMeterPrice(draft.costPrice), 1)} / 米` : ''}
                  </span>
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">售價（每碼）</Label>
                <div className="flex items-center gap-1.5">
                  <Input
                    type="number"
                    step="0.1"
                    min="0"
                    className="w-28"
                    value={draft.sellPrice ?? ''}
                    onChange={(e) => set('sellPrice', e.target.value === '' ? undefined : num(e.target.value))}
                  />
                  <span className="w-40 shrink-0 text-xs whitespace-nowrap text-muted-foreground">
                    {draft.sellPrice != null ? `＝ ${formatNumber(yardPriceToMeterPrice(draft.sellPrice), 1)} / 米` : ''}
                  </span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>歷史色號（唯讀，由表3／表4實際使用時累積）</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="mb-3 text-xs text-muted-foreground">
              查詢鍵為「客戶＋皇加品名＋顏色＋染整廠」四者綁定，非通用色號；換一家染整廠即視為無色號。標示 ⚠ 表示超過12個月未使用，開單時系統會提醒可能需重新覆色，非自動擋單。
            </p>
            {!product || product.colors.length === 0 ? (
              <p className="text-sm text-muted-foreground">尚無歷史色號紀錄</p>
            ) : (
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {product!.colors.map((c) => (
                  <div
                    key={`${c.color}-${c.dyeVendorId}`}
                    className={
                      isColorStale(c.lastUsedAt)
                        ? 'rounded border border-warning/40 bg-warning/10 p-2 text-xs'
                        : 'rounded border border-border bg-muted p-2 text-xs'
                    }
                  >
                    <div className="font-medium text-ink">
                      {c.color}
                      {isColorStale(c.lastUsedAt) && ' ⚠'}
                    </div>
                    <div className="mt-0.5 text-muted-foreground">
                      色樣編號 {c.sampleCode}　染整廠 {getVendor(c.dyeVendorId)?.name ?? c.dyeVendorId}
                    </div>
                    <div className="text-muted-foreground">最後使用：{formatDate(c.lastUsedAt)}</div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* 第五張卡：庫存（唯讀 UI 聚合，即時查詢布卷資料主檔）；新增中的商品尚無布卷 */}
        {product && <ProductStockCard product={product} />}
      </div>
    </div>
  )
}
