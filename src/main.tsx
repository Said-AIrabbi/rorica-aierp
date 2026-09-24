import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { CurrentAccountProvider } from '@/lib/current-account'
// 靜態代管（GitHub Pages）沒有 server 端 rewrite，BrowserRouter 的深層連結一重新整理就 404，
// 故改用 HashRouter：網址會是 /#/dye-order/xxx，但任何路徑都能直接開啟與分享。
import { HashRouter } from 'react-router-dom'
import { Toaster } from '@/components/ui/sonner'
import App from './App.tsx'
import { initPrototypeStorage, onRemoteSnapshotApplied } from '@/prototype-storage/boot'
import { resetDocumentEventBaseline } from '@/mocks/document-events'
import './index.css'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      refetchOnWindowFocus: false,
    },
  },
})

// 遠端模式（Vercel 展示環境）要先把伺服器上的資料讀回來再開畫面，
// 否則使用者會先看到一瞬間的種子資料再被覆蓋。本機模式（GitHub Pages）此呼叫立即返回。
await initPrototypeStorage()

// 單據異動通知的比對基準，在資料全部就位、使用者還沒動手之前建立。
// 少了這一行，基準會延到「第一次寫入完成時」才建，那一次操作就不會有人收到通知。
resetDocumentEventBaseline()

// 輪詢到同事的異動後，記憶體裡的資料陣列已被整包換掉，
// React Query 手上那份快取卻還是舊的——一律作廢，畫面才會跟著更新（通知也是這樣送到的）。
onRemoteSnapshotApplied(() => void queryClient.invalidateQueries())

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      {/* 權限規格：目前身分決定側欄、按鈕與欄位，故包在最外層 */}
      <CurrentAccountProvider>
        <HashRouter>
          <App />
          {/* closeButton：提示訊息右上角顯示「×」，可在自動消失前手動關閉（擋住畫面時不必等） */}
          <Toaster closeButton />
        </HashRouter>
      </CurrentAccountProvider>
    </QueryClientProvider>
  </StrictMode>,
)
