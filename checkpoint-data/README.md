# 成果查核點：模擬資料

產生方式：`npx tsx --tsconfig tsconfig.app.json tools/checkpoint/generate.mts`（固定亂數種子，重跑結果相同）。
產生日期：2026-11-20（2026-11-26 擴充：訂單 45、色彩 10,500、歷史色 30、任務 125、情境 3×15、端到端 120；原有資料逐筆不變）

**這裡全部是輸入資料，不是測試結果。** 各項的測試紀錄與通過率，要由系統實際執行這些輸入後產生。
除 B1 標示「去識別化」的部分外，皆為模擬資料（2026 成果查核點用，非真實交易）。

| 查核點 | 檔案 | 數量 |
|---|---|---|
| A1 訂單欄位對應 | a1/customer-orders.json（外部訂單格式）、a1/field-mapping.md（規格）、a1/field-annotations.csv（逐欄標註）| 45 筆訂單、1080 筆標註 |
| A1 → ERP | 45 筆訂單已轉成 ERP 的 PI（狀態「草稿」，編號 PI-20261120-101～145）| 45 張 |
| A2 庫存 | a2/inventory.csv；已載入 ERP 工作區 | 1135 捲（新增 1100、入庫單 134 張）|
| A2 媒合 | a2/matching-orders.json（含參考配貨規則算出的標準答案）| 45 筆訂單、90 行 |
| B1 色彩 | b1/colours.json / .csv；ERP 讀 public/color-library/colors.json | 10500 筆（去識別化真實 501、模擬 9999）|
| B1 配方 | b1/recipes.json | 501 筆 |
| B2 歷史色配對 | b2/history-match-cases.json | 30 題 |
| B2 噴印配色 | b2/print-images/*.png、b2/print-match-cases.json | 20 張 |
| C1-1 兩模型交辦 | c1/a2a-tasks.json | 125 筆 |
| C1-2 Agent Card | c1/agent-cards/*.json（JWS ES256 簽章）、jwks.json、registry.json；線上 https://rorica-aierp.vercel.app/a2a/<agent>/.well-known/agent-card.json | 4 份 |
| C1-2 DataPart Schema | c1/schemas/*.schema.json | 3 份 |
| C2-1 場域情境 | c2/field-scenarios.json | 3 類 × 15 |
| C2-2 一致性測試 | c2/conformance-tests.json | 52 項 |
| C2-3 端到端 | c2/e2e-orders.json（contextId 為追溯索引）| 120 筆 |

## 去識別化（B1）
真實來源為皇加的 PET 染色配方（不進 git）。原色名含品牌／客戶的色卡名稱，一律改為「色系＋編號」（例如「藍 0012」），
色號改為 HIS-0001 起；保留 Lab 與染料代號、用量。

## A2 參考配貨規則
同品名、同色、在庫且未預留的布卷；能由單一批號湊足時，取「湊得足的批號中總量最小者」，批內依捲號順序取到夠；
任何單一批號都不足時，依入庫日期由舊到新跨批取；全部加總仍不足時判定「庫存不足」（每 5 筆訂單有 1 筆刻意不足）。

## 簽章金鑰
Agent Card 以 ES256 簽章，公鑰在 jwks.json；私鑰只在本機 checkpoint-data/.keys/（不進 git）。驗證：`node tools/checkpoint/verify-cards.mjs`。
