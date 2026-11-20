# 客戶訂單 → ERP PI 欄位對應規格

模擬資料（2026 成果查核點用，非真實交易）。客戶訂單格式見 customer-orders.json；逐欄標註見 field-annotations.csv。

| 客戶訂單欄位 | ERP PI 欄位 | 轉換規則 |
|---|---|---|
| order_no | items[].poNo | 原樣帶入 |
| order_date | createdAt | 日期 |
| buyer.company | customerId、customerName | 以客戶名稱比對客戶主檔 |
| ship_from | portOfLoading | 港口對照（KEELUNG／TAIPEI／TAICHUNG／KAOHSIUNG）|
| ship_to | destination | 原樣帶入 |
| incoterm | tradeTerm | 貿易條件（EXW、FOB、CFR、CIF…）|
| payment_terms | paymentTerm | 原樣帶入 |
| currency | currency | USD／RMB／NTD／EUR／HKD |
| requested_delivery | leadTimeDays | 與下單日相差天數，取最接近的 30／45／60／90 |
| lines[].buyer_item_code | items[].roricaProductName、productId、customerProductName | 以「客戶名稱#客戶品名」比對商品主檔 |
| lines[].colour | items[].color | 英文色名對照 ERP 中文色名 |
| lines[].qty＋uom | items[].yard、meter | YDS 原樣；MTR ÷ 0.9144 換碼；公尺＝碼 × 0.9144 |
| lines[].unit_price | items[].unitPrice | 原樣帶入 |
| lines[].packing | items[].packingMethod | ROLL→捲支、FIXED 50M ROLL→定碼ROLL可接疋、FOLD→板捲、TUBE ROLL→原疋捲 |
