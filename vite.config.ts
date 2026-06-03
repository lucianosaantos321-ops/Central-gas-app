import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    target: 'es2020',
    cssCodeSplit: true,
    rollupOptions: {
      output: {
        manualChunks(id) {
          const normalizedId = id.replace(/\\/g, '/')

          if (normalizedId.includes('node_modules')) {
            if (
              normalizedId.includes('/react/') ||
              normalizedId.includes('/react-dom/') ||
              normalizedId.includes('/react-router')
            ) {
              return 'react-vendor'
            }

            if (
              normalizedId.includes('/@supabase/') ||
              normalizedId.includes('/@capacitor/')
            ) {
              return 'platform-vendor'
            }

            if (normalizedId.includes('/zustand/')) {
              return 'state-vendor'
            }
          }

          if (normalizedId.includes('/src/pages/admin/')) {
            return 'admin-pages'
          }

          if (normalizedId.includes('/src/pages/entregador/')) {
            return 'deliverer-pages'
          }
        },
      },
    },
  },
})
