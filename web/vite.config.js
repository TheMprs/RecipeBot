import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  return {
    plugins: [react()],
    server: {
      // Pin the port so localhost is always the same origin — otherwise Vite
      // bumps it when busy and localStorage (lang pref, caches) looks reset.
      port: 5173,
      strictPort: true,
      proxy: {
        // Dev proxy target comes from VITE_API_PROXY_TARGET (in gitignored
        // .env.local) so the backend address is never committed. Falls back
        // to a local backend.
        '/api': {
          target: env.VITE_API_PROXY_TARGET || 'http://localhost:8080',
          changeOrigin: true,
        },
      },
    },
  }
})
