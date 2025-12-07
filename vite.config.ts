import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  base: '/tQr4x/',
  worker: {
    format: 'es',
  },
  optimizeDeps: {
    exclude: ['src/audio/worklets/*', '@vectorsize/woscillators'],
  },
  build: {
    commonjsOptions: {
      include: [/@vectorsize\/woscillators/, /node_modules/],
    },
  },
})
