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
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/setupTests.ts',
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;
          if (id.includes('@ionic/react-router')) return 'ionic-router';
          if (id.includes('@ionic/react')) return 'ionic-react';
          if (id.includes('@ionic/core')) return 'ionic-core';
          if (id.includes('ionicons')) return 'icons';
          if (id.includes('leaflet')) return 'maps';
          if (id.includes('laravel-echo') || id.includes('pusher-js')) return 'realtime';
          if (id.includes('dexie')) return 'storage';
          if (id.includes('@capacitor')) return 'capacitor';
          if (id.includes('react') || id.includes('scheduler')) return 'react';
          return 'vendor';
        },
      },
    },
  },
})
