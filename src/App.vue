<script setup lang="ts">
import InputPanel from './components/InputPanel.vue'
import ResultPanel from './components/ResultPanel.vue'
import AmortizationTable from './components/AmortizationTable.vue'

const today: string = new Date().toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' })
</script>

<template>
  <div class="grain" aria-hidden="true"></div>

  <div class="wrap">
    <header class="masthead">
      <div class="brand">
        <div class="brand-mark" aria-hidden="true">貸</div>
        <div>
          <h1>房贷<em>月供</em>计算器</h1>
          <div class="en">Mortgage Calculator</div>
        </div>
      </div>
      <div class="mast-meta">
        <div class="date">{{ today }}</div>
        <div>等额本息 / 等额本金 · 实时测算</div>
      </div>
    </header>

    <main class="layout">
      <InputPanel />
      <ResultPanel />
    </main>

    <AmortizationTable />

    <footer>
      <span>计算结果仅供参考，实际额度、利率与还款计划以银行最终审批为准。</span>
      <span class="formula">等额本息 <em>M = P·r·(1+r)ⁿ / [(1+r)ⁿ − 1]</em></span>
    </footer>
  </div>
</template>
