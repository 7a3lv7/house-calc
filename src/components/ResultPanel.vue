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
  const W = 720
  /* ---- 上区：月供走势 ---- */
  const H = 280, ml = 64, mr = 18, mt = 16, mb = 30
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

  /* ---- 下区：本金与利息构成（两种方式并排堆叠，共享期数轴） ---- */
  const P = store.loanTotalWan * 10000
  const comp = { top: 300, plotTop: 308, plotBot: 452, mid: 380, gap: 16 }
  const leftX = (i) => 64 + (comp.mid - comp.gap - 64) * (n > 1 ? i / (n - 1) : 0)
  const rightX = (i) => (comp.mid + comp.gap) + (702 - (comp.mid + comp.gap)) * (n > 1 ? i / (n - 1) : 0)
  // 两半共用较大的总还款作为 y 轴上限，保证高度可比
  const sumTotal = (rows) => { const r = rows[n - 1]; return P - r.balance + r.cum }
  const compYMax = Math.max(sumTotal(store.seriesEqual), sumTotal(store.seriesPrincipal))
  const yc = (v) => comp.plotBot - (comp.plotBot - comp.plotTop) * (v / compYMax)
  const fwd = (xx, arr) => arr.map((v, i) => (i ? 'L' : 'M') + ' ' + xx(i).toFixed(1) + ' ' + yc(v).toFixed(1)).join(' ')
  const rev = (xx, arr) => {
    let d = ''
    for (let i = n - 1; i >= 0; i--) d += ' L ' + xx(i).toFixed(1) + ' ' + yc(arr[i]).toFixed(1)
    return d
  }
  const base = comp.plotBot
  const buildHalf = (rows, xx) => {
    const cumP = rows.map((r) => P - r.balance)
    const cumI = rows.map((r) => r.cum)
    const cumT = cumP.map((v, i) => v + cumI[i])
    return {
      prinArea: fwd(xx, cumP) + ` L ${xx(n - 1).toFixed(1)} ${base} L ${xx(0).toFixed(1)} ${base} Z`,
      intArea: fwd(xx, cumT) + ` L ${xx(n - 1).toFixed(1)} ${yc(cumP[n - 1]).toFixed(1)} ` + rev(xx, cumP) + ' Z',
      prinEnd: cumP[n - 1],
      intEnd: cumI[n - 1],
      totalEnd: cumT[n - 1]
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
    crossV: crossIdx >= 0 ? pr[crossIdx] : 0,  // 交点处的月供
    prFirst: pr[0],                    // 等额本金首期月供
    prLast: pr[n - 1],                 // 等额本金末期月供
    eqValue: eq[0],                    // 等额本息月供（平直线高度）
    comp: {
      eq: buildHalf(store.seriesEqual, leftX),
      pr: buildHalf(store.seriesPrincipal, rightX),
      mid: comp.mid, gap: comp.gap, plotTop: comp.plotTop, plotBot: comp.plotBot,
      leftX, rightX
    }
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
        <h3>月供走势 · 本金利息构成</h3>
        <div class="legend">
          <span class="lg" :class="{ cur: store.method === 'equal' }">
            <span class="sw solid"></span>等额本息<span v-if="store.method === 'equal'" class="tag">当前</span>
          </span>
          <span class="lg" :class="{ cur: store.method === 'principal' }">
            <span class="sw dash"></span>等额本金<span v-if="store.method === 'principal'" class="tag">当前</span>
          </span>
          <span class="lg-sep" aria-hidden="true"></span>
          <span class="lg"><span class="sw solid" style="background:#2f6b52"></span>本金</span>
          <span class="lg"><span class="sw solid" style="background:#b9552f"></span>利息</span>
        </div>
      </div>
      <svg class="chart" viewBox="0 0 720 470" role="img" :aria-label="`${store.METHOD_CN[store.method]}月供曲线，首期约 ¥${fmt(chart.selV[0])}，末期约 ¥${fmt(chart.selV[chart.n - 1])}；下区为两种方式累计本金与利息构成`">
        <defs>
          <linearGradient id="gradSel" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stop-color="#2f6b52" stop-opacity=".22"/>
            <stop offset="1" stop-color="#2f6b52" stop-opacity=".02"/>
          </linearGradient>
        </defs>
        <line v-for="t in chart.yTicks" :key="'g' + t.v" :x1="64" :y1="t.y" :x2="702" :y2="t.y" stroke="rgba(35,42,35,.09)" stroke-dasharray="2 4"/>
        <text v-for="t in chart.yTicks" :key="'l' + t.v" :x="56" :y="t.y + 4" text-anchor="end">{{ fmt(t.v) }}</text>
        <line v-for="i in chart.xTicks" :key="'x' + i" :x1="chart.x(i)" :y1="250" :x2="chart.x(i)" :y2="254" stroke="rgba(35,42,35,.25)"/>
        <text v-for="i in chart.xTicks" :key="'xt' + i" :x="chart.x(i)" :y="268" text-anchor="middle">第 {{ i + 1 }} 期</text>
        <path :d="chart.otherPath" fill="none" stroke="rgba(185,85,47,.45)" stroke-width="1.6" stroke-dasharray="5 5" vector-effect="non-scaling-stroke"/>
        <path :d="chart.selArea" fill="url(#gradSel)" stroke="none"/>
        <path :d="chart.selPath" fill="none" stroke="#1e4d3b" stroke-width="2.4" vector-effect="non-scaling-stroke" stroke-linejoin="round"/>
        <circle :cx="chart.x(chart.n - 1)" :cy="chart.y(chart.selV[chart.n - 1])" r="3.5" fill="#b9552f" stroke="#f3edde" stroke-width="1.5"/>
        <!-- 等额本息月供在 Y 轴的标注 -->
        <line :x1="60" :y1="chart.y(chart.eqValue)" :x2="chart.x(0)" :y2="chart.y(chart.eqValue)" stroke="#2f6b52" stroke-opacity=".55" stroke-width="1.5"/>
        <text :x="56" :y="chart.y(chart.eqValue) + 4" text-anchor="end" fill="#2f6b52" font-size="11.5" font-weight="600" stroke="#f3edde" stroke-width="3" paint-order="stroke">¥{{ fmt(chart.eqValue) }}</text>
        <!-- 等额本金首期 / 末期月供数值 -->
        <text :x="chart.x(0) + 6" :y="chart.y(chart.prFirst) + 4" text-anchor="start" fill="#b9552f" font-size="11.5" font-weight="600" stroke="#f3edde" stroke-width="3" paint-order="stroke">¥{{ fmt(chart.prFirst) }}</text>
        <text :x="chart.x(chart.n - 1) - 6" :y="chart.y(chart.prLast) - 8" text-anchor="end" fill="#b9552f" font-size="11.5" font-weight="600" stroke="#f3edde" stroke-width="3" paint-order="stroke">¥{{ fmt(chart.prLast) }}</text>
        <!-- 两曲线交点 -->
        <template v-if="chart.crossIdx >= 0">
          <line :x1="chart.x(chart.crossIdx)" :y1="chart.y(chart.crossV)" :x2="chart.x(chart.crossIdx)" :y2="250" stroke="rgba(161,126,46,.5)" stroke-dasharray="2 3"/>
          <circle :cx="chart.x(chart.crossIdx)" :cy="chart.y(chart.crossV)" r="4.5" fill="#a17e2e" stroke="#f3edde" stroke-width="2"/>
          <text :x="chart.x(chart.crossIdx)" :y="chart.y(chart.crossV) - 10" text-anchor="middle" fill="#a17e2e" font-size="11.5" font-weight="600">{{ periodLabel(chart.crossIdx + 1) }}</text>
        </template>

        <!-- 分隔线 + 下区：本金与利息构成 -->
        <line x1="64" y1="290" x2="702" y2="290" stroke="rgba(35,42,35,.14)" stroke-dasharray="3 4"/>
        <text x="64" y="302" text-anchor="start" font-size="10.5" letter-spacing=".1em">累计本金 / 利息</text>
        <text :x="(64 + chart.comp.mid - chart.comp.gap) / 2" y="316" text-anchor="middle" font-size="11.5" font-weight="700">等额本息</text>
        <text :x="(chart.comp.mid + chart.comp.gap + 702) / 2" y="316" text-anchor="middle" font-size="11.5" font-weight="700">等额本金</text>
        <line :x1="chart.comp.mid" :y1="chart.comp.plotTop" :x2="chart.comp.mid" :y2="chart.comp.plotBot" stroke="rgba(35,42,35,.12)" stroke-dasharray="2 3"/>
        <path :d="chart.comp.eq.intArea" fill="rgba(185,85,47,.55)"/>
        <path :d="chart.comp.eq.prinArea" fill="rgba(47,107,82,.5)"/>
        <path :d="chart.comp.pr.intArea" fill="rgba(185,85,47,.4)"/>
        <path :d="chart.comp.pr.prinArea" fill="rgba(47,107,82,.35)"/>
        <line :x1="64" :y1="chart.comp.plotBot" :x2="chart.comp.mid - chart.comp.gap" :y2="chart.comp.plotBot" stroke="rgba(35,42,35,.25)"/>
        <line :x1="chart.comp.mid + chart.comp.gap" :y1="chart.comp.plotBot" :x2="702" :y2="chart.comp.plotBot" stroke="rgba(35,42,35,.25)"/>
      </svg>

      <!-- 两种方式的本金 / 利息 / 总还款汇总 -->
      <div class="comp-totals">
        <span class="ct"><b class="ct-name">等额本息</b>本金 <b class="p">¥{{ fmt(chart.comp.eq.prinEnd) }}</b> · 利息 <b class="i">¥{{ fmt(chart.comp.eq.intEnd) }}</b> · 总还款 <b>¥{{ fmt(chart.comp.eq.totalEnd) }}</b></span>
        <span class="ct"><b class="ct-name">等额本金</b>本金 <b class="p">¥{{ fmt(chart.comp.pr.prinEnd) }}</b> · 利息 <b class="i">¥{{ fmt(chart.comp.pr.intEnd) }}</b> · 总还款 <b>¥{{ fmt(chart.comp.pr.totalEnd) }}</b></span>
      </div>

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
