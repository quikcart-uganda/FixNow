import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'

/** Monorepo dirs that must never enter Vite's watcher / dep crawl. */
const DEV_IGNORE = [
  '**/android/**',
  '**/ios/**',
  '**/backend/**',
  '**/dist/**',
  '**/.git/**',
  '**/coverage/**',
  '**/node_modules/.cache/**',
]

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@fixnow/ui': path.resolve(__dirname, './packages/ui'),
      '@fixnow/utils': path.resolve(__dirname, './packages/utils'),
      '@fixnow/types': path.resolve(__dirname, './packages/types'),
      '@fixnow/api': path.resolve(__dirname, './packages/api'),
      '@fixnow/hooks': path.resolve(__dirname, './packages/hooks'),
      '@fixnow/shared': path.resolve(__dirname, './packages/shared'),
      '@fixnow/native': path.resolve(__dirname, './packages/native'),
      '@fixnow/assets': path.resolve(__dirname, './packages/assets'),
      '@customer': path.resolve(__dirname, './apps/customer'),
      '@technician': path.resolve(__dirname, './apps/technician'),
      '@admin': path.resolve(__dirname, './apps/admin'),
      '@': path.resolve(__dirname, './src'),
    },
  },
  // Capacitor loads the bundled assets from the device filesystem; absolute
  // `/assets/...` paths break. Relative base keeps the WebView happy.
  base: './',
  build: {
    sourcemap: false,
    cssCodeSplit: true,
    target: 'es2020',
    chunkSizeWarningLimit: 700,
    modulePreload: false,
    rollupOptions: {
      output: {
        manualChunks(id) {
          const norm = id.replace(/\\/g, '/')
          if (!norm.includes('node_modules')) {
            if (norm.includes('/packages/api/')) return 'fixnow-api'
            if (norm.includes('/packages/native/')) return 'fixnow-native'
            if (norm.includes('/packages/hooks/')) return 'fixnow-hooks'
            if (norm.includes('/packages/shared/')) return 'fixnow-shared'
            return undefined
          }
          if (norm.includes('@capacitor') || norm.includes('@aparajita')) return 'capacitor'
          if (norm.includes('socket.io') || norm.includes('engine.io')) return 'realtime'
          if (norm.includes('axios')) return 'http'
          if (
            norm.includes('/react-dom/') ||
            norm.includes('/react-router') ||
            /\/react\//.test(norm) ||
            norm.includes('/scheduler/')
          ) {
            return 'react-vendor'
          }
          return 'vendor'
        },
      },
    },
  },
  optimizeDeps: {
    // Serve HTML/JS immediately on cold start instead of holding every request
    // until the full static-import crawl finishes (can take minutes in this monorepo).
    holdUntilCrawlEnd: false,
    entries: ['index.html', 'src/main.tsx', 'src/App.tsx'],
    include: [
      'react',
      'react-dom',
      'react-dom/client',
      'react/jsx-dev-runtime',
      'react/jsx-runtime',
      'react-router-dom',
      'axios',
      'socket.io-client',
      'clsx',
    ],
  },
  server: {
    host: true,
    port: 5173,
    strictPort: true,
    // Keep HMR reachable from LAN devices (Android emulator / physical phone).
    hmr: {
      protocol: 'ws',
    },
    watch: {
      ignored: DEV_IGNORE,
    },
  },
  preview: {
    host: true,
    port: 4173,
    strictPort: true,
  },
})
