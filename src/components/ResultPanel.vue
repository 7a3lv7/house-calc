<script setup>
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue'
import { useLoanStore, fmt, money } from '../stores/loan'

const store = useLoanStore()

/* ---- 月供数字滚动动画 ---- */
const shown = ref(0)
let animId = null
function animateTo(target) {
  if (animId) cancelAnimationFrame(animId)
  const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  if (reduce) { shown.value = Math.round(target); return }
  const from = shown.value
  const t0 = performance.now()
  const dur = 650
  const ease = (t) => 1 - Math.pow(1 - t, 3)
  const step = (now) => {
    const p = Math.min(1, (now - t0) / dur)
    shown.value = Math.round(from + (target - from) * ease(p))
    animId = p < 1 ? requestAnimationFrame(step) : null
  }
  animId = requestAnimationFrame(step)
}
watch(() => store.summary.M, animateTo, { immediate: true })
onMounted(() => animateTo(store.summary.M))
onBeforeUnmount(() => { if (animId) cancelAnimationFrame(animId) })

/* ---- 走势图 ---- */
function niceMax(v) {
  if (v <= 0) return 1
  const mag = Math.pow(10, Math.floor(Math.log10(v)))
  const step = mag / 2
  return Math.ceil(v / step) * step
}
/* 期数显示：一年内为「第 X 期」，超过一年为「第 X 年 Y 月」 */
function periodLabel(p) {
  if (p <= 12) return `第 ${p} 期`
  const y = Math.floor((p - 1) / 12) + 1
  const m = ((p - 1) % 12) + 1
  return `第 ${y} 年 ${m} 月`
}
const chart = computed(() => {
  const eq = store.seriesEqual.map((r) => r.payment)
  const pr = store.seriesPrincipal.map((r) => r.payment)
  const n = eq.length
  const W = 720, H = 280, ml = 64, mr = 18, mt = 16, mb = 30
  const plotW = W - ml - mr
  const plotH = H - mt - mb
  const yMax = niceMax(Math.max(eq[0], pr[0]))
  const x = (i) => ml + plotW * (n > 1 ? i / (n - 1) : 0)
  const y = (v) => H - mb - plotH * (v / yMax)
  const path = (arr) => arr.map((v, i) => (i ? 'L' : 'M') + ' ' + x(i).toFixed(1) + ' ' + y(v).toFixed(1)).join(' ')
  const selV = store.method === 'equal' ? eq : pr
  const otherV = store.method === 'equal' ? pr : eq

  /* 两曲线交点：等额本金月供首次 ≤ 等额本息月供的期数（利率为 0 时两线重合，无交点） */
  let crossIdx = -1
  if (pr[0] > eq[0]) {
    for (let i = 1; i < n; i++) {
      if (pr[i] <= eq[i]) { crossIdx = i; break }
    }
  }

  return {
    n, x, y, yMax,
    selV, otherV,
    selPath: path(selV),
    otherPath: path(otherV),
    selArea: path(selV) + ` L ${x(n - 1).toFixed(1)} ${H - mb} L ${x(0).toFixed(1)} ${H - mb} Z`,
    yTicks: [0, 0.5, 1].map((t) => ({ v: yMax * t, y: y(yMax * t) })),
    xTicks: n > 1 ? [0, Math.floor((n - 1) / 2), n - 1] : [0],
    crossIdx,                          // 交点所在期（0 基）
    crossV: crossIdx >= 0 ? pr[crossIdx] : 0  // 交点处的月供
  }
})

/* ---- 复制 ---- */
const copied = ref(false)
function copyResult() {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(store.copyText).then(() => {
      copied.value = true
      setTimeout(() => { copied.value = false }, 1800)
    })
  } else {
    window.prompt('复制计算结果：', store.copyText)
  }
}
</script>

<template>
  <section class="panel results" aria-label="计算结果">
    <div class="watermark" aria-hidden="true">¥</div>

    <div class="result-ledger">
      <div class="result-main">
        <div class="result-label">每月月供 · Monthly Payment</div>
        <div class="result-amount">
          <span class="yen">¥</span>
          <span class="value" aria-live="polite">{{ fmt(shown) }}</span>
          <span class="per">/月</span>
        </div>

        <!-- 实际自付月供收据条 -->
        <div v-if="store.fundMonthly > 0" class="net-strip" aria-label="实际自付月供">
          <div class="net-row">
            <span class="net-l">每月月供</span>
            <span class="net-v">{{ money(store.summary.M) }}</span>
          </div>
          <div class="net-row sub">
            <span class="net-l">− 公积金抵扣</span>
            <span class="net-v green">{{ money(store.fundMonthly) }}</span>
          </div>
          <div class="net-row net-total">
            <span class="net-l">实际自付月供</span>
            <span class="net-v">{{ money(store.netPay) }}</span>
          </div>
        </div>
      </div>

      <div class="result-summary" aria-label="贷款概要">
        <div
          v-for="(it, i) in store.summaryItems"
          :key="it.label"
          class="sum-row"
          :class="{ 'sum-div': i === 4 }"
        >
          <span>{{ it.label }}</span>
          <b>{{ it.value }}</b>
        </div>
      </div>
    </div>

    <div class="stats">
      <div class="stat">
        <div class="s-label">总利息</div>
        <div class="s-value">{{ money(store.summary.totalInt) }}</div>
        <div class="s-cap">TOTAL INTEREST</div>
      </div>
      <div class="stat">
        <div class="s-label">还款总额</div>
        <div class="s-value">{{ money(store.summary.totalPay) }}</div>
        <div class="s-cap">PRINCIPAL + INTEREST</div>
      </div>
      <div class="stat">
        <div class="s-label">利息占比</div>
        <div class="s-value">{{ (store.summary.totalPay > 0 ? store.summary.totalInt / store.summary.totalPay * 100 : 0).toFixed(1) }}%</div>
        <div class="s-cap">INTEREST SHARE</div>
      </div>
    </div>

    <div class="split-strip">
      <div class="split-bar" role="img" aria-label="还款总额中本金与利息占比">
        <div class="seg principal" :style="{ width: (store.summary.totalPay > 0 ? store.summary.P / store.summary.totalPay * 100 : 0) + '%' }"></div>
        <div class="seg interest" :style="{ width: (store.summary.totalPay > 0 ? store.summary.totalInt / store.summary.totalPay * 100 : 0) + '%' }"></div>
      </div>
      <div class="split-legend">
        <span class="p"><b>{{ money(store.summary.P) }}</b> 本金</span>
        <span class="i"><b>{{ money(store.summary.totalInt) }}</b> 利息</span>
      </div>
    </div>

    <div class="chart-wrap">
      <div class="chart-head">
        <h3>月供走势</h3>
        <div class="legend">
          <span class="lg" :class="{ cur: store.method === 'equal' }">
            <span class="sw solid"></span>等额本息<span v-if="store.method === 'equal'" class="tag">当前</span>
          </span>
          <span class="lg" :class="{ cur: store.method === 'principal' }">
            <span class="sw dash"></span>等额本金<span v-if="store.method === 'principal'" class="tag">当前</span>
          </span>
        </div>
      </div>
      <svg class="chart" viewBox="0 0 720 280" role="img" :aria-label="`${store.METHOD_CN[store.method]}月供曲线，首期约 ¥${fmt(chart.selV[0])}，末期约 ¥${fmt(chart.selV[chart.n - 1])}；另一条曲线为${store.method === 'equal' ? '等额本金' : '等额本息'}`">
        <defs>
          <linearGradient id="gradSel" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stop-color="#2f6b52" stop-opacity=".22"/>
            <stop offset="1" stop-color="#2f6b52" stop-opacity=".02"/>
          </linearGradient>
        </defs>
        <line v-for="t in chart.yTicks" :key="'g' + t.v" :x1="64" :y1="t.y" :x2="702" :y2="t.y" stroke="rgba(35,42,35,.09)" stroke-dasharray="2 4"/>
        <text v-for="t in chart.yTicks" :key="'l' + t.v" :x="56" :y="t.y + 4" text-anchor="end">{{ fmt(t.v) }}</text>
        <line v-for="i in chart.xTicks" :key="'x' + i" :x1="chart.x(i)" :y1="250" :x2="chart.x(i)" :y2="254" stroke="rgba(35,42,35,.25)"/>
        <text v-for="i in chart.xTicks" :key="'xt' + i" :x="chart.x(i)" :y="268" text-anchor="middle">{{ periodLabel(i + 1) }}</text>
        <path :d="chart.otherPath" fill="none" stroke="rgba(185,85,47,.45)" stroke-width="1.6" stroke-dasharray="5 5" vector-effect="non-scaling-stroke"/>
        <path :d="chart.selArea" fill="url(#gradSel)" stroke="none"/>
        <path :d="chart.selPath" fill="none" stroke="#1e4d3b" stroke-width="2.4" vector-effect="non-scaling-stroke" stroke-linejoin="round"/>
        <circle :cx="chart.x(chart.n - 1)" :cy="chart.y(chart.selV[chart.n - 1])" r="3.5" fill="#b9552f" stroke="#f3edde" stroke-width="1.5"/>
        <!-- 两曲线交点 -->
        <template v-if="chart.crossIdx >= 0">
          <line :x1="chart.x(chart.crossIdx)" :y1="chart.y(chart.crossV)" :x2="chart.x(chart.crossIdx)" :y2="250" stroke="rgba(161,126,46,.5)" stroke-dasharray="2 3"/>
          <circle :cx="chart.x(chart.crossIdx)" :cy="chart.y(chart.crossV)" r="4.5" fill="#a17e2e" stroke="#f3edde" stroke-width="2"/>
          <text :x="chart.x(chart.crossIdx)" :y="chart.y(chart.crossV) - 10" text-anchor="middle" fill="#a17e2e" font-size="11.5" font-weight="600">{{ periodLabel(chart.crossIdx + 1) }}</text>
        </template>
      </svg>
      <p v-if="chart.crossIdx >= 0" class="chart-note">
        两曲线于<b>{{ periodLabel(chart.crossIdx + 1) }}</b>相交,此后等额本金月供开始低于等额本息
      </p>
    </div>

    <div class="compare" v-html="store.compareText"></div>

    <div class="result-actions">
      <button class="btn" type="button" @click="copyResult">
        <span v-if="!copied">复制计算结果</span>
        <span v-else class="ok">✓ 已复制</span>
      </button>
    </div>
  </section>
</template>
