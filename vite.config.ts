import path from 'node:path'
import { defineConfig, loadEnv, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

/**
 * 本機開發時代跑 api/ 底下的 Edge Function（部署在 Vercel 時由 Vercel 執行，這裡不參與）。
 * 只開放清單內的路徑；伺服器端的環境變數（無 VITE_ 前綴，如 COLORMIND_API_KEY）從 .env.local 讀進 process.env，
 * 不會打包進前端。
 */
const LOCAL_API_ROUTES: Record<string, string> = {
  '/api/colormind/launch': '/api/colormind/launch.ts',
  '/api/colormind/redeem': '/api/colormind/redeem.ts',
}

function localApi(): Plugin {
  return {
    name: 'local-api',
    apply: 'serve',
    configureServer(server) {
      const env = loadEnv(server.config.mode, process.cwd(), '')
      for (const [k, v] of Object.entries(env)) if (!k.startsWith('VITE_') && process.env[k] === undefined) process.env[k] = v

      server.middlewares.use(async (req, res, next) => {
        const pathname = (req.url ?? '').split('?')[0]
        const file = LOCAL_API_ROUTES[pathname]
        if (!file) return next()
        try {
          const chunks: Buffer[] = []
          for await (const c of req) chunks.push(c as Buffer)
          const origin = `http://${req.headers.host ?? 'localhost'}`
          const headers = new Headers()
          for (const [k, v] of Object.entries(req.headers)) if (typeof v === 'string') headers.set(k, v)
          const request = new Request(new URL(req.url ?? '/', origin), {
            method: req.method,
            headers,
            body: req.method === 'GET' || req.method === 'HEAD' ? undefined : Buffer.concat(chunks),
          })
          const mod = (await server.ssrLoadModule(file)) as { default: (r: Request) => Promise<Response> }
          const response = await mod.default(request)
          res.statusCode = response.status
          response.headers.forEach((v, k) => res.setHeader(k, v))
          res.end(Buffer.from(await response.arrayBuffer()))
        } catch (error) {
          res.statusCode = 500
          res.setHeader('Content-Type', 'application/json; charset=utf-8')
          res.end(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }))
        }
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  // 相對路徑：GitHub Pages 會把網站掛在 /<repo-name>/ 底下，
  // 用相對路徑就不必把 repo 名稱寫死在設定檔裡，改名或換代管都不用重設。
  base: './',
  define: {
    // 頁面上顯示的版本戳記，讓客戶回饋意見時能對得上是哪一版
    __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
  },
  plugins: [react(), localApi()],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
    },
  },
})
