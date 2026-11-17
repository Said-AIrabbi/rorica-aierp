import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { parseEnv } from 'node:util'
import { defineConfig, type Plugin } from 'vite'
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

/** 只讀 .env 檔本身（vite 的 loadEnv 在前綴為空時會把整個 process.env 也混進來）；後讀的蓋前面的 */
function fileEnv(mode: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const name of ['.env', '.env.local', `.env.${mode}`, `.env.${mode}.local`]) {
    const file = path.join(process.cwd(), name)
    if (existsSync(file)) Object.assign(out, parseEnv(readFileSync(file, 'utf8')))
  }
  return out
}

// 設定檔本身也會重新載入，記錄放在 globalThis 才跨得過重啟
const envStore = globalThis as typeof globalThis & { __localApiEnv?: Set<string> }
const injectedEnv = (envStore.__localApiEnv ??= new Set<string>())

function localApi(): Plugin {
  return {
    name: 'local-api',
    apply: 'serve',
    configureServer(server) {
      // 改了 .env.local 時 vite 會重啟伺服器但行程不變：先清掉上次從檔案帶進來的值，刪掉的設定才不會殘留
      for (const k of injectedEnv) delete process.env[k]
      injectedEnv.clear()
      // 本機開發以 .env 檔為準（覆寫同名的既有值）
      for (const [k, v] of Object.entries(fileEnv(server.config.mode))) {
        if (k.startsWith('VITE_')) continue
        process.env[k] = v
        injectedEnv.add(k)
      }

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
