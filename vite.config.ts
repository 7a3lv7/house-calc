import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    vue(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/icon-32.png', 'icons/icon-180.png'],
      manifest: {
        name: '房贷月供计算器',
        short_name: '房贷计算',
        description: '房贷月供计算：纯商贷/公积金/组合贷，等额本息/等额本金，实时计算月供、利息与还款计划',
        lang: 'zh-CN',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#f3edde',
        theme_color: '#1e4d3b',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
        ]
      },
      workbox: {
        // 不预缓存 index.html：导航走 NetworkFirst，在线时永远拿到最新页面，
        // 避免安装版应用一直启动旧 bundle（曲线图「不跟随输入更新」多为旧版缓存所致）
        navigateFallback: undefined, // 显式禁用插件默认的预缓存兜底路由(否则它会优先于 NetworkFirst 匹配)
        globPatterns: ['**/*.{js,css,png,svg,ico,webmanifest,woff2}'],
        runtimeCaching: [
          {
            // 页面导航：优先网络（3 秒超时），离线回退上次缓存
            urlPattern: ({ request }: { request: Request }) => request.mode === 'navigate',
            handler: 'NetworkFirst',
            options: {
              cacheName: 'pages',
              networkTimeoutSeconds: 3
            }
          },
          {
            urlPattern: /^https:\/\/fonts\.(googleapis|gstatic)\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts',
              expiration: { maxEntries: 12, maxAgeSeconds: 60 * 60 * 24 * 365 }
            }
          }
        ]
      }
      // 说明：开发模式不注册 SW（避免与 HMR 缓存冲突）；测试「安装应用」请用 npm run build + npm run preview
    })
  ],
  server: {
    port: 5173,
    open: false
  }
})
