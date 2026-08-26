import path from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  // 相對路徑：GitHub Pages 會把網站掛在 /<repo-name>/ 底下，
  // 用相對路徑就不必把 repo 名稱寫死在設定檔裡，改名或換代管都不用重設。
  base: './',
  define: {
    // 頁面上顯示的版本戳記，讓客戶回饋意見時能對得上是哪一版
    __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
  },
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
    },
  },
})
