/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// Proxy same-origin vers HDX HAPI : utilisé si l'appel direct est bloqué (CORS) par le navigateur.
// En production, voir netlify.toml / vercel.json qui définissent la même réécriture.
const proxy = {
  '/hapi-proxy': {
    target: 'https://hapi.humdata.org',
    changeOrigin: true,
    rewrite: (p: string) => p.replace(/^\/hapi-proxy/, ''),
  },
}

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg'],
      manifest: {
        name: 'MadaPrice',
        short_name: 'MadaPrice',
        description: "Ny vidin'ny entana manerana an'i Madagasikara",
        lang: 'mg',
        theme_color: '#0d5434',
        background_color: '#0d5434',
        display: 'standalone',
        start_url: '/',
        icons: [{ src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any maskable' }],
      },
      workbox: {
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/hapi-proxy/],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/[abc]?\.?tile\.openstreetmap\.org\/.*/,
            handler: 'CacheFirst',
            options: { cacheName: 'osm-tiles', expiration: { maxEntries: 600, maxAgeSeconds: 60 * 60 * 24 * 14 } },
          },
        ],
      },
    }),
  ],
  server: { proxy },
  preview: { proxy },
  test: { environment: 'node', include: ['src/**/*.test.ts', 'cloudflare/**/*.test.ts'] },
})
