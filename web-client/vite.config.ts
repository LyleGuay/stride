import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
import { execSync } from 'child_process'

// Resolve the build SHA at build time: Railway injects VITE_BUILD_SHA via Docker
// build arg; locally we fall back to the current git SHA.
function getBuildSha(): string {
  if (process.env.VITE_BUILD_SHA) return process.env.VITE_BUILD_SHA
  try {
    return execSync('git rev-parse --short HEAD').toString().trim()
  } catch {
    return 'dev'
  }
}

// https://vite.dev/config/
export default defineConfig({
  define: {
    // Bake the SHA into the bundle so import.meta.env.VITE_BUILD_SHA is always defined.
    'import.meta.env.VITE_BUILD_SHA': JSON.stringify(getBuildSha()),
  },
  server: {
    proxy: {
      '/api': {
        // API_PORT can be overridden by E2E tests to point at the test go-api
        // running on a separate port, avoiding reuse of a local dev server.
        target: `http://localhost:${process.env.API_PORT ?? '3000'}`,
        changeOrigin: true,
      },
    },
  },
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'mask-icon.svg'],
      manifest: {
        name: 'Stride',
        short_name: 'Stride',
        description: 'Habit tracking app',
        theme_color: '#4f46e5',
        background_color: '#ffffff',
        display: 'standalone',
        icons: [
          {
            src: 'pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png'
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable'
          }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg}']
      }
    })
  ],
})
