import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const fridgeLayoutCorePath = fileURLToPath(new URL('./src/fridgeLayoutCore.js', import.meta.url))

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'shared-fridge-layout-core-build',
      apply: 'build',
      buildStart() {
        this.emitFile({
          type: 'asset',
          fileName: 'fridge-layout-core.js',
          source: readFileSync(fridgeLayoutCorePath, 'utf8'),
        })
      },
    },
    {
      name: 'shared-fridge-layout-core-dev',
      apply: 'serve',
      configureServer(server) {
        server.middlewares.use((request, response, next) => {
          if ((request.url ?? '').split('?')[0] !== '/fridge-layout-core.js') {
            next()
            return
          }
          response.setHeader('Content-Type', 'text/javascript; charset=utf-8')
          response.end(readFileSync(fridgeLayoutCorePath, 'utf8'))
        })
      },
    },
    {
      name: 'kindle-static-pages',
      configureServer(server) {
        server.middlewares.use((request, response, next) => {
          if (/^(?:\/fridge|\/k)(?:\/|\?|$)/.test(request.url ?? '')) {
            response.setHeader('Cache-Control', 'no-store, max-age=0')
            request.url = (request.url ?? '').replace(/^\/(?:fridge|k)(?:\/[^?]*)?/, '/kindle.html')
          }
          next()
        })
      },
    },
  ],
  build: { outDir: 'dist', emptyOutDir: true },
  server: {
    host: '0.0.0.0',
    port: 7001,
    proxy: { '/api': 'http://127.0.0.1:7002' },
  },
})
