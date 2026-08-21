/**
 * 极简 Pinia 持久化插件：
 * store 声明 `persist: true`（或字符串 key）时，自动把 state 存到 localStorage，
 * 下次启动时先恢复再渲染，避免重开应用后要重新输入。
 */
const STORE_KEY = 'house-calc-state-v1'

export function persistPlugin({ store, options }) {
  if (!options.persist) return
  const key = options.persist === true ? STORE_KEY : options.persist

  // 恢复：仅合并当前 state 中存在的键，忽略历史遗留字段
  try {
    const raw = localStorage.getItem(key)
    if (raw) {
      const saved = JSON.parse(raw)
      const current = store.$state
      const patch = {}
      for (const k of Object.keys(current)) {
        if (k in saved) patch[k] = saved[k]
      }
      if (Object.keys(patch).length) store.$patch(patch)
    }
  } catch (e) {
    console.warn('[persist] 恢复失败，使用默认值', e)
  }

  // 保存：任何 state 变化都写回（throttle 由 localStorage 同步写入承担，量很小）
  store.$subscribe(
    () => {
      try {
        localStorage.setItem(key, JSON.stringify(store.$state))
      } catch (e) {
        console.warn('[persist] 保存失败', e)
      }
    },
    { detached: true }
  )
}
