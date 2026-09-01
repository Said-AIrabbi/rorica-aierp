import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
// 靜態代管（GitHub Pages）沒有 server 端 rewrite，BrowserRouter 的深層連結一重新整理就 404，
// 故改用 HashRouter：網址會是 /#/dye-order/xxx，但任何路徑都能直接開啟與分享。
import { HashRouter } from 'react-router-dom'
import { Toaster } from '@/components/ui/sonner'
import App from './App.tsx'
import './index.css'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      refetchOnWindowFocus: false,
    },
  },
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <HashRouter>
        <App />
        {/* closeButton：提示訊息右上角顯示「×」，可在自動消失前手動關閉（擋住畫面時不必等） */}
        <Toaster closeButton />
      </HashRouter>
    </QueryClientProvider>
  </StrictMode>,
)
