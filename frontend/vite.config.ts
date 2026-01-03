import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      '/api': 'http://localhost:8080',
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'react-vendor': ['react', 'react-dom'],
          'query-vendor': ['@tanstack/react-query', '@tanstack/react-virtual'],
          'radix-vendor': [
            '@radix-ui/react-dialog',
            '@radix-ui/react-dropdown-menu',
            '@radix-ui/react-scroll-area',
          ],
          'highlight-vendor': ['highlight.js'],
          'motion-vendor': ['motion', 'framer-motion'],
          'i18n-vendor': ['i18next', 'react-i18next'],
          'utils-vendor': ['clsx', 'tailwind-merge', 'class-variance-authority', 'zustand', 'wouter'],
          'lang-vendor': ['franc-min'],
          'html-parser-vendor': [
            'unified',
            'rehype-parse',
            'rehype-sanitize',
            'rehype-stringify',
            'hast-util-to-jsx-runtime',
          ],
          'grid-vendor': ['@egjs/react-infinitegrid'],
          'carousel-vendor': ['embla-carousel-react'],
        },
      },
    },
  },
})
