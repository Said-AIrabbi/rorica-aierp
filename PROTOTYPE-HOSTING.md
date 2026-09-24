# 原型展示環境（暫時性，非正式規格）

**這份文件與 PRD 無關。** 它記錄的是「這個原型暫時跑在哪裡、資料暫時存在哪裡」，屬於工程設定，
不是客戶的需求。所以：

- 不佔用 PRD 的決策編號，不寫進 PRD 的增修表
- PRD 描述「系統該有什麼行為」；這份只描述「原型目前掛在什麼地方」
- **真正的後端上線時，這份文件與它描述的程式一起刪除**

放在 repo 根目錄（而非 `docs/`），是因為裡面沒有任何客戶資訊——`docs/` 不進 git 是為了客戶機密，
這份沒有那個顧慮，進 git 剛好順便解決它自己的備份問題。

---

## 為什麼這樣做

客戶要在真後端出現以前，就能實際產生單據、關掉瀏覽器還在、同事看得到同一份資料。

同時，**需求還在每天變動**。現在切資料表等於在規格定案前把結構定死，客戶每改一次想法就要搬一次家——
那是把真正的後端工作提前做一遍，而且會做錯。

所以：**整包模擬資料當成「一包 JSON」存起來，沒有資料表、沒有 schema。**
商業規則（`src/mocks/mutations.ts`）仍然跑在瀏覽器裡，一行都沒有改。

## 兩個版本

同一份程式碼、同一個 repo，推 `main` 兩邊一起更新。

| | GitHub Pages | Vercel |
|---|---|---|
| 用途 | 乾淨展示版（開會用） | 可存檔操作版（客戶練習用） |
| 資料存在哪 | 瀏覽器分頁 `sessionStorage` | 伺服器，共用且留存 |
| 關掉分頁 | 資料消失 | 資料還在 |
| 切換開關 | 沒有 `VITE_PROTOTYPE_STORAGE` | `VITE_PROTOTYPE_STORAGE=remote` |

判斷點只有一個函式：`isRemoteStorage()`。沒有兩套設定檔，也沒有兩個分支。

## 架構

```
瀏覽器
  └─ src/mocks/mutations.ts    商業規則（未改動）
       └─ persistSessionSnapshot()
            ├─ 本機模式 → sessionStorage
            └─ 遠端模式 → src/prototype-storage → PUT /api/snapshot
                                                      └─ api/snapshot.ts（Vercel Edge Function）
                                                           └─ Upstash Redis
```

Redis 裡一個工作區兩把鍵：

```
rorica:<工作區>:version    整數，每次成功寫入加一
rorica:<工作區>:data       那包 JSON（目前約 240 KB）
```

版本號與資料分開存，是為了讓 compare-and-set 在 Lua 裡只比一個整數，
不必把 240 KB 的 JSON 丟進 Lua 解析。

## 併發：後手被擋下，不是默默覆蓋

兩人同時操作時，後存的那個人會收到 409，畫面顯示「這份資料已被其他人更新」並要求重新載入。
**這是刻意的**——寧可他重做一次，也不要他的表1 無聲蓋掉別人剛簽核的那張。

衝突發生後前端會**停止一切寫入**，直到使用者重新載入。不自動重整是因為他可能正在打字，
畫面突然跳掉比衝突本身更糟。

## 工作區

同一個網站、不同代碼 = 不同的一份資料，彼此不相干：

```
https://<你的網址>/?ws=demo#/          ← 預設
https://<你的網址>/?ws=sales#/         ← 另一份，完全獨立
```

**`?ws=` 必須寫在 `#` 之前**（本站用 HashRouter）。代碼限英數與連字號，最長 32 字。

用途：
- 開會示範前，用一個沒被亂改過的工作區
- 業務組與生管組各練各的，互不干擾
- **換一個沒用過的代碼＝一份全新的種子資料**，這就是「重置模擬資料」被移除後的替代做法

## 為什麼移除「重置模擬資料」

資料改為共用之後，那顆按鈕會一鍵毀掉所有人的進度。替代方式：

1. 要乾淨資料 → 換工作區代碼，或改用 GitHub Pages 版本
2. 要留底 → 右上角「匯出目前資料」，存成 JSON 檔案

## 設定步驟

### 1. 接上 Vercel

1. [vercel.com/new](https://vercel.com/new) → Import `Said-AIrabbi/rorica-aierp`
2. Framework Preset 選 **Vite**（通常自動偵測）
3. Build Command、Output Directory 都不要改
4. Deploy

### 2. 裝 Upstash Redis

專案 → **Storage** → **Create Database** → **Upstash Redis** → Free → Region 選 Singapore 或 Tokyo，
建好後確認已連結到這個專案。連線用的環境變數會自動注入，不需要手動抄金鑰。

### 3. 環境變數

| Key | Value | 環境 | 來源 |
|---|---|---|---|
| `VITE_PROTOTYPE_STORAGE` | `remote` | Production / Preview / Development | **手動新增** |
| `KV_REST_API_URL` 或 `UPSTASH_REDIS_REST_URL` | （自動） | 全部 | Upstash 整合自動注入 |
| `KV_REST_API_TOKEN` 或 `UPSTASH_REDIS_REST_TOKEN` | （自動） | 全部 | Upstash 整合自動注入 |

程式兩組命名都支援（`api/snapshot.ts` 的 `upstash()`），因為 Vercel 的整合依版本會注入不同名稱。

## 出事的時候

| 症狀 | 可能原因 | 處理 |
|---|---|---|
| 一直顯示預設展示資料、改的東西重整就沒了 | `VITE_PROTOTYPE_STORAGE` 沒設或沒重新部署 | 設好後要 **Redeploy**，Vite 的環境變數是建置時寫死的 |
| 主控台出現「尚未連結 Upstash Redis」 | Upstash 沒連到這個專案 | Storage 分頁重新連結，然後 Redeploy |
| 一直跳「資料已被其他人更新」 | 有人同時在操作，或上一個分頁沒關 | 重新載入即可 |
| 資料整包不見 | 免費方案不保證永久保存 | 換工作區重來；重要內容本來就該先匯出 |

## 已知限制（刻意的）

- **沒有存取控制。** 知道網址的人都能讀取與修改。故首頁明寫「請勿輸入真實客戶資料與報價」。
- **沒有自動備份。** 只有手動匯出 JSON。
- **快照整包覆寫。** 目前約 240 KB，Upstash 免費方案吃得下；若日後成長到接近 1 MB 需改為壓縮或分區。
- **免費方案閒置會休眠**，隔幾天第一次開啟會慢幾秒。
- **商業規則仍在瀏覽器**。共用環境中這代表：規則本身仍然可靠（每個人的瀏覽器都跑同一套），
  但併發只靠版本號擋，不是資料庫層級的交易。這是玩具環境可接受的取捨。

## 要拆掉的時候

真後端上線時：

1. 刪除 `api/`、`src/prototype-storage/`、`tsconfig.api.json`、本檔案
2. `src/mocks/data.ts` 的 `persistSessionSnapshot()` 移除遠端分支
3. `src/lib/permissions.ts` 移除 `onPermissionSettingsPersisted` / `exportPermissionState` / `importPermissionState`
4. `src/main.tsx` 移除 `initPrototypeStorage()`
5. Header 的「匯出目前資料」與首頁說明依當時情況調整

`src/mocks/api.ts`（68 行）就是要被真 API 取代的那一層，界線已經畫好了。
