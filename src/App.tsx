import { Route, Routes } from 'react-router-dom'
import { AppShell } from '@/components/layout/AppShell'
import { HomePage } from '@/features/home/HomePage'
import { StockOverviewPage } from '@/features/inventory/StockOverviewPage'
import { PiListPage } from '@/features/proforma-invoice/PiListPage'
import { PiDetailPage } from '@/features/proforma-invoice/PiDetailPage'
import { PiFormPage } from '@/features/proforma-invoice/PiFormPage'
import { PackingNoticeListPage } from '@/features/packing-notice/PackingNoticeListPage'
import { PackingNoticeDetailPage } from '@/features/packing-notice/PackingNoticeDetailPage'
import { PackingNoticeFormPage } from '@/features/packing-notice/PackingNoticeFormPage'
import { PurchaseOrderListPage } from '@/features/purchase-order/PurchaseOrderListPage'
import { PurchaseOrderDetailPage } from '@/features/purchase-order/PurchaseOrderDetailPage'
import { PurchaseOrderFormPage } from '@/features/purchase-order/PurchaseOrderFormPage'
import { DyeRequestListPage } from '@/features/dye-request/DyeRequestListPage'
import { DyeRequestDetailPage } from '@/features/dye-request/DyeRequestDetailPage'
import { DyeRequestFormPage } from '@/features/dye-request/DyeRequestFormPage'
import { DyeOrderListPage } from '@/features/dye-order/DyeOrderListPage'
import { DyeOrderDetailPage } from '@/features/dye-order/DyeOrderDetailPage'
import { DyeOrderFormPage } from '@/features/dye-order/DyeOrderFormPage'
import { GoodsReceiptListPage } from '@/features/goods-receipt/GoodsReceiptListPage'
import { GoodsReceiptDetailPage } from '@/features/goods-receipt/GoodsReceiptDetailPage'
import { FabricLabelListPage } from '@/features/fabric-label/FabricLabelListPage'
import { FabricLabelDetailPage } from '@/features/fabric-label/FabricLabelDetailPage'
import { ShippingOrderListPage } from '@/features/shipping-order/ShippingOrderListPage'
import { ShippingOrderDetailPage } from '@/features/shipping-order/ShippingOrderDetailPage'
import { ShippingOrderFormPage } from '@/features/shipping-order/ShippingOrderFormPage'
import { AbnormalNoticeListPage } from '@/features/abnormal-notice/AbnormalNoticeListPage'
import { AbnormalNoticeDetailPage } from '@/features/abnormal-notice/AbnormalNoticeDetailPage'
import { AbnormalNoticeFormPage } from '@/features/abnormal-notice/AbnormalNoticeFormPage'
import { SecondaryProcessingListPage } from '@/features/secondary-processing/SecondaryProcessingListPage'
import { SecondaryProcessingFormPage } from '@/features/secondary-processing/SecondaryProcessingFormPage'
import { SecondaryProcessingDetailPage } from '@/features/secondary-processing/SecondaryProcessingDetailPage'
import { CustomerListPage } from '@/features/masters/customers/CustomerListPage'
import { CustomerDetailPage } from '@/features/masters/customers/CustomerDetailPage'
import { ProductListPage } from '@/features/masters/products/ProductListPage'
import { ProductDetailPage } from '@/features/masters/products/ProductDetailPage'
import { VendorListPage } from '@/features/masters/vendors/VendorListPage'
import { VendorDetailPage } from '@/features/masters/vendors/VendorDetailPage'
import { RoleMatrixPage } from '@/features/settings/RoleMatrixPage'
import { ExclusionsPage } from '@/features/settings/ExclusionsPage'
import { AccountListPage } from '@/features/masters/accounts/AccountListPage'
import { AccountDetailPage } from '@/features/masters/accounts/AccountDetailPage'
import { RequireAction } from '@/components/shared/ReadOnlyNotice'

export default function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route path="/" element={<HomePage />} />

        <Route path="/inventory" element={<StockOverviewPage />} />

        {/* Phase 2：PI 單為表1 的上游，路由順序比照側欄排在表1 之前 */}
        <Route path="/proforma-invoice" element={<PiListPage />} />
        <Route path="/proforma-invoice/new" element={
            <RequireAction doc="PI" action="建立" backTo="/proforma-invoice">
              <PiFormPage />
            </RequireAction>
          } />
        <Route path="/proforma-invoice/:id" element={<PiDetailPage />} />
        <Route path="/proforma-invoice/:id/edit" element={
            <RequireAction doc="PI" action="編輯草稿" backTo="/proforma-invoice">
              <PiFormPage />
            </RequireAction>
          } />

        <Route path="/packing-notice" element={<PackingNoticeListPage />} />
        <Route path="/packing-notice/new" element={
            <RequireAction doc="表1" action="建立" backTo="/packing-notice">
              <PackingNoticeFormPage />
            </RequireAction>
          } />
        <Route path="/packing-notice/:id" element={<PackingNoticeDetailPage />} />
        <Route path="/packing-notice/:id/edit" element={
            <RequireAction doc="表1" action="編輯草稿" backTo="/packing-notice">
              <PackingNoticeFormPage />
            </RequireAction>
          } />

        <Route path="/purchase-order" element={<PurchaseOrderListPage />} />
        <Route path="/purchase-order/new" element={
            <RequireAction doc="表2" action="建立" backTo="/purchase-order">
              <PurchaseOrderFormPage />
            </RequireAction>
          } />
        <Route path="/purchase-order/:id" element={<PurchaseOrderDetailPage />} />

        <Route path="/dye-request" element={<DyeRequestListPage />} />
        <Route path="/dye-request/new" element={
            <RequireAction doc="表3" action="建立" backTo="/dye-request">
              <DyeRequestFormPage />
            </RequireAction>
          } />
        <Route path="/dye-request/:id" element={<DyeRequestDetailPage />} />

        <Route path="/dye-order" element={<DyeOrderListPage />} />
        <Route path="/dye-order/new" element={
            <RequireAction doc="表4" action="建立" backTo="/dye-order">
              <DyeOrderFormPage />
            </RequireAction>
          } />
        <Route path="/dye-order/:id" element={<DyeOrderDetailPage />} />

        <Route path="/goods-receipt" element={<GoodsReceiptListPage />} />
        <Route path="/goods-receipt/:id" element={<GoodsReceiptDetailPage />} />

        <Route path="/fabric-label" element={<FabricLabelListPage />} />
        <Route path="/fabric-label/:id" element={<FabricLabelDetailPage />} />

        <Route path="/shipping-order" element={<ShippingOrderListPage />} />
        <Route path="/shipping-order/new" element={
            <RequireAction doc="表8" action="建立" backTo="/shipping-order">
              <ShippingOrderFormPage />
            </RequireAction>
          } />
        <Route path="/shipping-order/:id" element={<ShippingOrderDetailPage />} />

        <Route path="/secondary-processing" element={<SecondaryProcessingListPage />} />
        <Route path="/secondary-processing/new" element={
            <RequireAction doc="表5" action="補齊加工廠" backTo="/secondary-processing">
              <SecondaryProcessingFormPage />
            </RequireAction>
          } />
        <Route path="/secondary-processing/:id" element={<SecondaryProcessingDetailPage />} />

        <Route path="/abnormal-notice" element={<AbnormalNoticeListPage />} />
        <Route path="/abnormal-notice/new" element={
            <RequireAction doc="表9" action="建立" backTo="/abnormal-notice">
              <AbnormalNoticeFormPage />
            </RequireAction>
          } />
        <Route path="/abnormal-notice/:id" element={<AbnormalNoticeDetailPage />} />

        <Route path="/masters/customers" element={<CustomerListPage />} />
        <Route path="/masters/customers/:id" element={<CustomerDetailPage />} />
        <Route path="/masters/products" element={<ProductListPage />} />
        <Route path="/masters/products/:id" element={<ProductDetailPage />} />
        <Route path="/masters/vendors" element={<VendorListPage />} />
        <Route path="/masters/vendors/:id" element={<VendorDetailPage />} />
        {/* 權限設定：角色矩陣與個別排除刻意分成兩頁（權限規格第二章「為何分兩頁」） */}
        <Route path="/settings/permissions" element={<RoleMatrixPage />} />
        <Route path="/settings/exclusions" element={<ExclusionsPage />} />
        <Route path="/masters/accounts" element={<AccountListPage />} />
        {/* 新增與編輯共用同一個頁面元件，:id 為 new 時即新增模式 */}
        <Route path="/masters/accounts/:id" element={<AccountDetailPage />} />
      </Route>
    </Routes>
  )
}
