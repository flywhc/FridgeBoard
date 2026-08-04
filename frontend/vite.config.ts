import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'kindle-qr-page',
      configureServer(server) {
        server.middlewares.use((request, response, next) => {
          if (/^\/fridge(?:\?|$)/.test(request.url ?? '')) {
            response.setHeader('Cache-Control', 'no-store, max-age=0')
            request.url = (request.url ?? '').replace(/^\/fridge(?=\?|$)/, '/fridge-qr.html')
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
