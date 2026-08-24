import type { PiniaPluginContext, StateTree } from 'pinia'

/* 让 store 声明 `persist: true`（或自定义 key）获得类型支持 */
declare module 'pinia' {
  interface DefineStoreOptionsBase<S extends StateTree, Store> {
    persist?: boolean | string
  }
}

const STORE_KEY = 'house-calc-state-v1'

/**
 * 极简 Pinia 持久化插件：
 * store 声明 `persist: true`（或字符串 key）时，自动把 state 存到 localStorage，
 * 下次启动时先恢复再渲染，避免重开应用后要重新输入。
 */
export function persistPlugin({ store, options }: PiniaPluginContext): void {
  if (!options.persist) return
  const key = options.persist === true ? STORE_KEY : options.persist

  // 恢复：仅合并当前 state 中存在的键，忽略历史遗留字段
  try {
    const raw = localStorage.getItem(key)
    if (raw) {
      const saved = JSON.parse(raw) as Record<string, unknown>
      const current = store.$state as Record<string, unknown>
      const patch: Record<string, unknown> = {}
      for (const k of Object.keys(current)) {
        if (k in saved) patch[k] = saved[k]
      }
      if (Object.keys(patch).length) store.$patch(patch as Partial<typeof store.$state>)
    }
  } catch (e) {
    console.warn('[persist] 恢复失败，使用默认值', e)
  }

  // 保存：任何 state 变化都写回
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
