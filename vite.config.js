import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'Sistema de Nómina',
        short_name: 'Nómina',
        description: 'Gestión de nómina, préstamos, control de dinero y reportes',
        theme_color: '#2563eb',
        background_color: '#0f172a',
        display: 'standalone',
        orientation: 'portrait',
        lang: 'es',
        start_url: '/',
        scope: '/',
        icons: [
          {
            src: 'pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        // No cachear las llamadas al backend; siempre red primero
        navigateFallbackDenylist: [/^\/api/],
        runtimeCaching: [
          {
            urlPattern: /^\/api\//,
            handler: 'NetworkOnly',
          },
        ],
      },
      devOptions: {
        enabled: false,
      },
    }),
  ],
  build: {
    // Separa las librerías pesadas en su propio chunk: cambian poco, así el
    // navegador las cachea entre despliegues y la app propia carga aparte.
    rollupOptions: {
      output: {
        manualChunks: {
          charts: ['@mantine/charts', 'recharts'],
          mantine: ['@mantine/core', '@mantine/hooks'],
          pdf: ['jspdf', 'jspdf-autotable'],
        },
      },
    },
    chunkSizeWarningLimit: 900,
  },
  server: {
    port: 5173,
    open: true,
    host: true, // accesible en la red local durante desarrollo
    proxy: {
      '/api': 'http://127.0.0.1:3001',
    },
  },
})
