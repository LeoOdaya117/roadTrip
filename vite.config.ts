/// <reference types="vitest" />

import legacy from '@vitejs/plugin-legacy'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { resolve } from 'path'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    legacy()
  ],
  resolve: {
    alias: [
      { find: '@shared', replacement: resolve(__dirname, 'src/shared') },
      { find: '@shared/', replacement: resolve(__dirname, 'src/shared') + '/' },
      { find: '@features', replacement: resolve(__dirname, 'src/features') },
      { find: '@features/', replacement: resolve(__dirname, 'src/features') + '/' }
    ]
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          const normalizedId = id.replace(/\\/g, '/');
          if (!normalizedId.includes('/node_modules/')) return undefined;
          if (
            normalizedId.includes('/react/') ||
            normalizedId.includes('/react-dom/') ||
            normalizedId.includes('/scheduler/')
          ) return 'framework-vendor';
          if (normalizedId.includes('/ionicons/')) return 'icons-vendor';
          if (normalizedId.includes('/@ionic/react')) return 'ionic-react-vendor';
          if (normalizedId.includes('/@ionic/core/')) {
            return 'ionic-core-vendor';
          }
          if (normalizedId.includes('/leaflet/') || normalizedId.includes('/react-leaflet/')) {
            return 'map-vendor';
          }
          return undefined;
        },
      },
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/setupTests.ts',
  },
})
