import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
  ],
  build: {
    cssMinify: 'esbuild',
    chunkSizeWarningLimit: 1000, // Large chunks ki warning hatane ke liye
  }
})