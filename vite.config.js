import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const apiPort = env.API_PORT || '3001'
  const apiProxy = {
    target: `http://127.0.0.1:${apiPort}`,
    changeOrigin: true,
  }
  return {
    plugins: [vue()],
    server: {
      proxy: { '/api': apiProxy },
    },
    preview: {
      proxy: { '/api': apiProxy },
    },
  }
})
