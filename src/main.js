import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import './style.css'

/* PWA standalone：禁用双指缩放 / 双击缩放（兼容不支持 touch-action 的旧版 iOS） */
document.addEventListener('touchmove', (e) => {
  if (e.touches.length > 1) e.preventDefault()
}, { passive: false })
let lastTouchEnd = 0
document.addEventListener('touchend', (e) => {
  const now = Date.now()
  if (now - lastTouchEnd <= 300) e.preventDefault()
  lastTouchEnd = now
}, { passive: false })

createApp(App).use(createPinia()).mount('#app')
