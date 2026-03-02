import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  base: './',
  resolve: {
    alias: {
      '@game': path.resolve(__dirname, 'src/game'),
      '@ui': path.resolve(__dirname, 'src/ui'),
      '@assets': path.resolve(__dirname, 'src/assets'),
    },
  },
  server: {
    port: 5173,
  },
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    rollupOptions: {
      input: {
        main: path.resolve(__dirname, 'index.html'),
      },
    },
  },
})
