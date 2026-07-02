/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath, URL } from 'node:url'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  build: {
    // The WalletConnect/Reown SDK is inherently ~1MB; it is isolated in its own
    // chunk below, so raise the per-chunk warning threshold to avoid noise on
    // that known-large vendor chunk.
    chunkSizeWarningLimit: 1200,
    rollupOptions: {
      output: {
        // Split the large web3/wallet dependencies out of the app chunk so no
        // single chunk dominates initial load.
        manualChunks(id) {
          if (!id.includes('node_modules')) return
          if (id.includes('@walletconnect') || id.includes('@reown') || id.includes('@coinbase'))
            return 'walletconnect'
          if (id.includes('wagmi') || id.includes('viem') || id.includes('@tanstack')) return 'web3'
          if (id.includes('react') || id.includes('scheduler')) return 'react'
          return 'vendor'
        },
      },
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
  },
})
