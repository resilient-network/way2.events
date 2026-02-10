import { defineConfig } from 'astro/config'
import sitemap from '@astrojs/sitemap'
import { themeConfig } from './src/config'
import { imageConfig } from './src/utils/image-config'
import path from 'node:path'

export default defineConfig({
  site: 'https://resilientnet.io',
  base: '/way2.events',
  devToolbar: {
    enabled: false
  },
  output: 'static',
  build: {
    inlineStylesheets: 'auto'
  },
  image: {
    service: {
      entrypoint: 'astro/assets/services/sharp',
      config: imageConfig
    }
  },
  integrations: [sitemap()],
  vite: {
    resolve: {
      alias: {
        '@': path.resolve('./src')
      }
    },
    build: {
      rollupOptions: {
        output: {}
      }
    },
    optimizeDeps: {}
  }
})
