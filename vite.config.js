import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  resolve: {
    mainFields: ['module', 'browser', 'main'],
  },
  optimizeDeps: {
    include: ['lucide-react'],
  },
  build: {
    chunkSizeWarningLimit: 600,
  },
})
