import { defineStore } from 'pinia'

export const fmt = (v) => Math.round(v).toLocaleString('zh-CN')
export const money = (v) => '¥' + fmt(v)

const r1 = (v) => Math.round(v * 10) / 10

/* 单笔贷款逐月明细（等额本息 / 等额本金） */
function buildSeries(amountWan, years, ratePct, method) {
  const P = amountWan * 10000
  const n = Math.max(1, Math.round(years * 12))
  const r = ratePct / 100 / 12
  const rows = []
  let balance, principalShare, interest, payment, cumInterest = 0

  if (method === 'equal') {
    const M = r > 0 ? (P * r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1) : P / n
    balance = P
    for (let i = 1; i <= n; i++) {
      interest = balance * r
      principalShare = M - interest
      balance = Math.max(0, balance - principalShare)
      cumInterest += interest
      rows.push({ i, payment: M, principal: principalShare, interest, balance, cum: cumInterest })
    }
  } else {
    principalShare = P / n
    balance = P
    for (let i = 1; i <= n; i++) {
      interest = Math.max(0, (P - principalShare * (i - 1)) * r)
      payment = principalShare + interest
      balance = Math.max(0, P - principalShare * i)
      cumInterest += interest
      rows.push({ i, payment, principal: principalShare, interest, balance, cum: cumInterest })
    }
  }
  return rows
}

/* 按当前贷款类型组装整笔贷款明细（组合贷 = 公积金部分 + 商贷部分按月合并） */
function buildLoanRows(s, method) {
  const total = s.inputMode === 'price' ? r1(s.price * (1 - s.downRatio / 100)) : s.loan
  if (s.loanType === 'combined') {
    const fund = Math.min(Math.max(0, r1(s.fundWan)), total)
    const comm = r1(total - fund)
    const f = buildSeries(fund, s.years, s.rateFund, method)
    const c = buildSeries(comm, s.years, s.rateComm, method)
    return f.map((r, i) => ({
      i: r.i,
      payment: r.payment + c[i].payment,
      principal: r.principal + c[i].principal,
      interest: r.interest + c[i].interest,
      balance: r.balance + c[i].balance,
      cum: r.cum + c[i].cum
    }))
  }
  const rate = s.loanType === 'fund' ? s.rateFund : s.rateComm
  return buildSeries(total, s.years, rate, method)
}

export const useLoanStore = defineStore('loan', {
  persist: true, // 输入状态持久化到 localStorage，重开自动恢复

  state: () => ({
    loanType: 'commercial',    // commercial | fund | combined
    inputMode: 'price',        // price（总价+首付） | loan（直接输入贷款额）
    price: 150,                // 房屋总价（万）
    downRatio: 30,             // 首付比例（%）
    loan: 105,                 // 直接输入模式下的贷款金额（万）
    fundWan: 60,               // 组合贷中公积金部分（万），商贷自动补齐
    fundMonthly: 0,            // 每月公积金抵扣金额（元）
    rateComm: 3.0,             // 商贷年利率（%）
    rateFund: 2.85,            // 公积金年利率（%）
    years: 30,                 // 贷款年限
    method: 'equal',           // equal | principal
    expanded: false            // 还款计划表是否展开
  }),

  getters: {
    TYPE_CN: () => ({ commercial: '商业贷款', fund: '公积金贷款', combined: '组合贷款' }),
    METHOD_CN: () => ({ equal: '等额本息', principal: '等额本金' }),
    RATE_PRESETS: () => ({
      fund: [{ label: '公积金 2.85%', v: 2.85 }, { label: '公积金 3.325%', v: 3.325 }],
      commercial: [{ label: '商贷 3.00%', v: 3.0 }, { label: '商贷 3.30%', v: 3.3 }]
    }),

    isCombined: (s) => s.loanType === 'combined',
    isPriceMode: (s) => s.inputMode === 'price',
    activeRate: (s) => (s.loanType === 'fund' ? s.rateFund : s.rateComm),

    loanTotalWan: (s) => (s.inputMode === 'price' ? r1(s.price * (1 - s.downRatio / 100)) : s.loan),
    downWan: (s) => r1(s.price - (s.inputMode === 'price' ? r1(s.price * (1 - s.downRatio / 100)) : s.loan)),

    /* 组合贷拆分：公积金部分可调，商贷部分自动补齐 */
    fundComm: (s) => {
      const total = s.inputMode === 'price' ? r1(s.price * (1 - s.downRatio / 100)) : s.loan
      const fund = Math.min(Math.max(0, r1(s.fundWan)), total)
      return { total, fund: r1(fund), comm: r1(total - fund) }
    },

    series: (s) => buildLoanRows(s, s.method),
    seriesEqual: (s) => buildLoanRows(s, 'equal'),
    seriesPrincipal: (s) => buildLoanRows(s, 'principal'),

    summary: (s) => {
      const rows = buildLoanRows(s, s.method)
      const P = (s.inputMode === 'price' ? r1(s.price * (1 - s.downRatio / 100)) : s.loan) * 10000
      let totalPay = 0
      for (const r of rows) totalPay += r.payment
      const totalInt = totalPay - P
      return { P, totalPay, totalInt, first: rows[0], last: rows[rows.length - 1], M: rows[0].payment, n: rows.length }
    },

    netPay() {
      return Math.max(0, this.summary.M - this.fundMonthly)
    },

    typeLine() {
      if (this.isCombined) {
        const fc = this.fundComm
        return `组合贷 公积金 ${fc.fund}万 + 商贷 ${fc.comm}万`
      }
      return this.TYPE_CN[this.loanType]
    },
    rateLine() {
      if (this.isCombined) return `公积金 ${this.rateFund.toFixed(2)}% · 商贷 ${this.rateComm.toFixed(2)}%`
      return `年利率 ${this.activeRate.toFixed(2)}%`
    },
    subLine1() {
      return `${this.METHOD_CN[this.method]} · ${this.typeLine} · ${this.summary.n} 期 · ${this.rateLine}`
    },

    /* 两种还款方式的利息 / 首月对比提示（含 HTML 高亮） */
    compareText() {
      const eq = this.seriesEqual
      const pr = this.seriesPrincipal
      const eqTotal = eq.reduce((a, r) => a + r.payment, 0)
      const prTotal = pr.reduce((a, r) => a + r.payment, 0)
      const P = this.loanTotalWan * 10000
      const diffInt = (eqTotal - P) - (prTotal - P)
      const eqFirst = eq[0].payment
      const prFirst = pr[0].payment
      if (this.method === 'equal') {
        return `若改选 <b>等额本金</b>：总利息可少付 <b>¥${fmt(diffInt)}</b>，但首月月供为 <b>¥${fmt(prFirst)}</b>（比等额本息高 ¥${fmt(prFirst - eqFirst)}），此后逐月递减。`
      }
      return `若改选 <b>等额本息</b>：首月月供降至 <b>¥${fmt(eqFirst)}</b>，但总利息多付 <b>¥${fmt(diffInt)}</b>，且每月还款额固定不变。`
    },

    copyText() {
      const res = this.summary
      const fc = this.isCombined ? this.fundComm : null
      const priceLine = this.isPriceMode
        ? `房屋总价：${fmt(this.price * 10000)} 元\n首付：${fmt((this.price - this.loanTotalWan) * 10000)} 元（${this.downRatio}%）`
        : ''
      const amountLine = fc
        ? `贷款金额：公积金 ${fmt(fc.fund * 10000)} 元 + 商贷 ${fmt(fc.comm * 10000)} 元 = ${fmt(this.loanTotalWan * 10000)} 元`
        : `贷款金额：${fmt(this.loanTotalWan * 10000)} 元`
      const rateLine = this.isCombined
        ? `公积金利率：${this.rateFund.toFixed(2)}%\n商贷利率：${this.rateComm.toFixed(2)}%`
        : `年利率：${this.activeRate.toFixed(2)}%`
      return [
        '房贷月供计算',
        '─────────────',
        `贷款类型：${this.TYPE_CN[this.loanType]}`,
        priceLine,
        amountLine,
        `贷款年限：${this.years} 年（${res.n} 期）`,
        rateLine,
        `还款方式：${this.METHOD_CN[this.method]}`,
        `每月月供：${money(res.M)}`,
        this.fundMonthly > 0 ? `公积金抵扣：${money(this.fundMonthly)}\n实际自付月供：${money(this.netPay)}` : '',
        `还款总额：${money(res.totalPay)}`,
        `总利息：${money(res.totalInt)}`,
        '─────────────',
        '结果仅供参考，以银行审批为准'
      ].filter((x) => x).join('\n')
    }
  },

  actions: {
    setLoanType(t) { this.loanType = t },
    setMethod(m) { this.method = m },
    setYears(v) { this.years = Math.min(30, Math.max(1, Math.round(parseFloat(v)))) },
    setPrice(v) { this.price = Math.min(5000, Math.max(1, parseFloat(v))) },
    setDownRatio(v) { this.downRatio = Math.min(95, Math.max(0, parseFloat(v))) },
    setLoan(v) { this.loan = Math.min(3000, Math.max(1, parseFloat(v))) },
    setRate(v) {
      const val = Math.min(12, Math.max(0, parseFloat(v)))
      if (this.loanType === 'fund') this.rateFund = val
      else this.rateComm = val
    },
    setRateFund(v) { this.rateFund = Math.min(12, Math.max(0, parseFloat(v))) },
    setRateComm(v) { this.rateComm = Math.min(12, Math.max(0, parseFloat(v))) },
    setFundWan(v) { this.fundWan = Math.min(this.loanTotalWan, Math.max(0, r1(parseFloat(v)))) },
    setCommWan(v) {
      const total = this.loanTotalWan
      const comm = Math.min(total, Math.max(0, r1(parseFloat(v))))
      this.fundWan = r1(total - comm)
    },
    setFundMonthly(v) { this.fundMonthly = Math.min(50000, Math.max(0, Math.round(parseFloat(v) || 0))) },
    toggleInputMode() {
      if (this.inputMode === 'price') {
        this.inputMode = 'loan'
        this.loan = this.loanTotalWan
      } else {
        this.inputMode = 'price'
      }
    },
    toggleExpanded() { this.expanded = !this.expanded }
  }
})
