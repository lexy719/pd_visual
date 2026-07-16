import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath, URL } from 'node:url'

/**
 * Dev-only test endpoint: /slow-img?ms=6000 answers with a real PNG after the given delay.
 * Exists to make late-image layout shift DETERMINISTIC in tests — remote images (picsum/Flux)
 * race the test probe and win, so "image still pending at component mount" can't be staged
 * reliably against real hosts. A 1×1 PNG is enough: styled width makes it occupy real height.
 */
const ONE_PX_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64'
)
const slowImg: Plugin = {
  name: 'slow-img-test-endpoint',
  configureServer(server) {
    server.middlewares.use('/slow-img', (req, res) => {
      const ms = Math.min(30000, Number(new URL(req.url ?? '/', 'http://x').searchParams.get('ms')) || 4000)
      setTimeout(() => {
        res.setHeader('Content-Type', 'image/png')
        res.setHeader('Cache-Control', 'no-store')
        res.end(ONE_PX_PNG)
      }, ms)
    })
  }
}

// The `@/…` alias is what every shadcn/Aceternity component imports through
// (e.g. `@/lib/utils`, `@/hooks/use-outside-click`). It maps to /src, where the
// preview CLI drops the component's registry files.
export default defineConfig({
  base: './',
  plugins: [react(), slowImg],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) }
  },
  server: { port: 5199, strictPort: true }
})
