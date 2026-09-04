import { Route, Routes } from 'react-router-dom'
import { AppShell } from '@/components/layout/AppShell'
import { HomePage } from '@/features/home/HomePage'
import { StockOverviewPage } from '@/features/inventory/StockOverviewPage'
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
import { AccountListPage } from '@/features/masters/accounts/AccountListPage'
import { AccountDetailPage } from '@/features/masters/accounts/AccountDetailPage'

export default function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route path="/" element={<HomePage />} />

        <Route path="/inventory" element={<StockOverviewPage />} />

        <Route path="/packing-notice" element={<PackingNoticeListPage />} />
        <Route path="/packing-notice/new" element={<PackingNoticeFormPage />} />
        <Route path="/packing-notice/:id" element={<PackingNoticeDetailPage />} />
        <Route path="/packing-notice/:id/edit" element={<PackingNoticeFormPage />} />

        <Route path="/purchase-order" element={<PurchaseOrderListPage />} />
        <Route path="/purchase-order/new" element={<PurchaseOrderFormPage />} />
        <Route path="/purchase-order/:id" element={<PurchaseOrderDetailPage />} />

        <Route path="/dye-request" element={<DyeRequestListPage />} />
        <Route path="/dye-request/new" element={<DyeRequestFormPage />} />
        <Route path="/dye-request/:id" element={<DyeRequestDetailPage />} />

        <Route path="/dye-order" element={<DyeOrderListPage />} />
        <Route path="/dye-order/new" element={<DyeOrderFormPage />} />
        <Route path="/dye-order/:id" element={<DyeOrderDetailPage />} />

        <Route path="/goods-receipt" element={<GoodsReceiptListPage />} />
        <Route path="/goods-receipt/:id" element={<GoodsReceiptDetailPage />} />

        <Route path="/fabric-label" element={<FabricLabelListPage />} />
        <Route path="/fabric-label/:id" element={<FabricLabelDetailPage />} />

        <Route path="/shipping-order" element={<ShippingOrderListPage />} />
        <Route path="/shipping-order/new" element={<ShippingOrderFormPage />} />
        <Route path="/shipping-order/:id" element={<ShippingOrderDetailPage />} />

        <Route path="/secondary-processing" element={<SecondaryProcessingListPage />} />
        <Route path="/secondary-processing/new" element={<SecondaryProcessingFormPage />} />
        <Route path="/secondary-processing/:id" element={<SecondaryProcessingDetailPage />} />

        <Route path="/abnormal-notice" element={<AbnormalNoticeListPage />} />
        <Route path="/abnormal-notice/new" element={<AbnormalNoticeFormPage />} />
        <Route path="/abnormal-notice/:id" element={<AbnormalNoticeDetailPage />} />

        <Route path="/masters/customers" element={<CustomerListPage />} />
        <Route path="/masters/customers/:id" element={<CustomerDetailPage />} />
        <Route path="/masters/products" element={<ProductListPage />} />
        <Route path="/masters/products/:id" element={<ProductDetailPage />} />
        <Route path="/masters/vendors" element={<VendorListPage />} />
        <Route path="/masters/vendors/:id" element={<VendorDetailPage />} />
        <Route path="/masters/accounts" element={<AccountListPage />} />
        {/* 新增與編輯共用同一個頁面元件，:id 為 new 時即新增模式 */}
        <Route path="/masters/accounts/:id" element={<AccountDetailPage />} />
      </Route>
    </Routes>
  )
}
