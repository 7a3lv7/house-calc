<script setup>
import { computed } from 'vue'
import { useLoanStore, fmt } from '../stores/loan'

const store = useLoanStore()
const PER_PAGE = 12

const visibleRows = computed(() =>
  store.expanded ? store.series : store.series.slice(0, PER_PAGE)
)
const showEllipsis = computed(() => !store.expanded && store.series.length > PER_PAGE)
const totals = computed(() => {
  let pay = 0
  let int = 0
  for (const r of store.series) {
    pay += r.payment
    int += r.interest
  }
  return { pay, int }
})
</script>

<template>
  <section class="table-wrap" aria-label="还款计划表">
    <div class="table-head">
      <h2>还款计划表<small>{{ store.METHOD_CN[store.method] }} · {{ store.typeLine }}</small></h2>
      <span class="t-meta">共 {{ store.summary.n }} 期 · {{ store.rateLine }}</span>
    </div>

    <div class="table-scroll">
      <table>
        <thead>
          <tr>
            <th>期数</th>
            <th>月供</th>
            <th>本金</th>
            <th>利息</th>
            <th>剩余本金</th>
            <th>累计利息</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="r in visibleRows" :key="r.i">
            <td data-label="期数">{{ r.i }}</td>
            <td data-label="月供"><b style="color:#232a23;font-weight:600">{{ fmt(r.payment) }}</b></td>
            <td class="principal" data-label="本金">{{ fmt(r.principal) }}</td>
            <td class="interest" data-label="利息">{{ fmt(r.interest) }}</td>
            <td data-label="剩余本金">{{ fmt(r.balance) }}</td>
            <td data-label="累计利息">{{ fmt(r.cum) }}</td>
          </tr>
          <tr v-if="showEllipsis" class="period-end">
            <td colspan="6" style="text-align:center;color:#969c8a;font-size:12px">… 仅显示前 {{ PER_PAGE }} 期 …</td>
          </tr>
          <tr class="total">
            <td data-label="合计">合计</td>
            <td data-label="月供">{{ fmt(totals.pay) }}</td>
            <td class="principal" data-label="本金">{{ fmt(store.loanTotalWan * 10000) }}</td>
            <td class="interest" data-label="利息">{{ fmt(totals.int) }}</td>
            <td data-label="剩余本金">—</td>
            <td data-label="累计利息">—</td>
          </tr>
        </tbody>
      </table>
    </div>

    <div class="table-foot">
      <button class="btn toggle" type="button" @click="store.toggleExpanded()">
        {{ store.expanded ? '收起计划表' : '展开全部 ' + store.summary.n + ' 期' }}
      </button>
    </div>
  </section>
</template>
