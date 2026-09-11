import { defineStore } from 'pinia'

/* ---------- 类型 ---------- */
export type LoanType = 'commercial' | 'fund' | 'combined'
export type Method = 'equal' | 'principal'
export type InputMode = 'price' | 'loan'

export interface AmortRow {
  i: number
  payment: number
  principal: number
  interest: number
  balance: number
  cum: number
}

export interface LoanState {
  loanType: LoanType
  inputMode: InputMode
  price: number        // 房屋总价（万）
  downRatio: number    // 首付比例（%）
  loan: number         // 直接输入模式下的贷款金额（万）
  fundWan: number      // 组合贷中公积金部分（万），商贷自动补齐
  fundMonthly: number  // 每月公积金抵扣金额（元）
  rateComm: number     // 商贷年利率（%）
  rateFund: number     // 公积金年利率（%）
  years: number        // 贷款年限
  method: Method
  expanded: boolean
}

export interface SummaryInfo {
  P: number
  totalPay: number
  totalInt: number
  first: AmortRow
  last: AmortRow
  M: number
  n: number
}

export interface FundComm {
  total: number
  fund: number
  comm: number
}

export interface RatePreset {
  label: string
  v: number
}

export interface SummaryItem {
  label: string
  value: string
}

/* ---------- 工具 ---------- */
export const fmt = (v: number): string => Math.round(v).toLocaleString('zh-CN')
export const money = (v: number): string => '¥' + fmt(v)

const r1 = (v: number): number => Math.round(v * 10) / 10

/* ---------- 贷款年限上限 ---------- */
/* 商业贷款最长 40 年；公积金贷款受政策限制最长 30 年。
   组合贷由「公积金 + 商贷」两部分组成，为便于管理两部分期限必须一致，
   因此整体同样受公积金封顶约束，最长 30 年——想要 40 年只能申请纯商业贷款 */
const YEARS_CAP: Record<LoanType, number> = { commercial: 40, fund: 30, combined: 30 }

/* 可输入的绝对上限：取各类型上限中的最大值 */
const YEARS_INPUT_MAX = Math.max(...Object.values(YEARS_CAP))

/* 有效年限：超出当前类型上限的部分不写回 state，只在此收窄。
   这样在类型间来回切换做对比时，用户已输入的年限不会被破坏 */
const effYearsOf = (s: LoanState): number => Math.min(s.years, YEARS_CAP[s.loanType])

/* 单笔贷款逐月明细（等额本息 / 等额本金） */
function buildSeries(amountWan: number, years: number, ratePct: number, method: Method): AmortRow[] {
  const P = amountWan * 10000
  const n = Math.max(1, Math.round(years * 12))
  const r = ratePct / 100 / 12
  const rows: AmortRow[] = []
  let balance = 0
  let cumInterest = 0

  if (method === 'equal') {
    const M = r > 0 ? (P * r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1) : P / n
    balance = P
    for (let i = 1; i <= n; i++) {
      const interest = balance * r
      const principalShare = M - interest
      balance = Math.max(0, balance - principalShare)
      cumInterest += interest
      rows.push({ i, payment: M, principal: principalShare, interest, balance, cum: cumInterest })
    }
  } else {
    const principalShare = P / n
    balance = P
    for (let i = 1; i <= n; i++) {
      const interest = Math.max(0, (P - principalShare * (i - 1)) * r)
      const payment = principalShare + interest
      balance = Math.max(0, P - principalShare * i)
      cumInterest += interest
      rows.push({ i, payment, principal: principalShare, interest, balance, cum: cumInterest })
    }
  }
  return rows
}

/* 按当前贷款类型组装整笔贷款明细（组合贷 = 公积金部分 + 商贷部分按月合并） */
function buildLoanRows(s: LoanState, method: Method): AmortRow[] {
  const total = s.inputMode === 'price' ? r1(s.price * (1 - s.downRatio / 100)) : s.loan
  const years = effYearsOf(s)
  if (s.loanType === 'combined') {
    const fund = Math.min(Math.max(0, r1(s.fundWan)), total)
    const comm = r1(total - fund)
    const f = buildSeries(fund, years, s.rateFund, method)
    const c = buildSeries(comm, years, s.rateComm, method)
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
  return buildSeries(total, years, rate, method)
}

/* ---------- store ---------- */
export const useLoanStore = defineStore('loan', {
  persist: true, // 输入状态持久化到 localStorage，重开自动恢复

  state: (): LoanState => ({
    loanType: 'commercial', // commercial | fund | combined
    inputMode: 'price',     // price（总价+首付） | loan（直接输入贷款额）
    price: 150,
    downRatio: 30,
    loan: 105,
    fundWan: 60,
    fundMonthly: 0,
    rateComm: 3.0,
    rateFund: 2.85,
    years: 30,
    method: 'equal',
    expanded: false
  }),

  getters: {
    TYPE_CN: (): Record<LoanType, string> => ({
      commercial: '商业贷款', fund: '公积金贷款', combined: '组合贷款'
    }),
    METHOD_CN: (): Record<Method, string> => ({
      equal: '等额本息', principal: '等额本金'
    }),
    RATE_PRESETS: (): Record<string, RatePreset[]> => ({
      fund: [{ label: '公积金 2.85%', v: 2.85 }, { label: '公积金 3.325%', v: 3.325 }],
      commercial: [{ label: '商贷 3.00%', v: 3.0 }, { label: '商贷 3.30%', v: 3.3 }]
    }),

    isCombined: (s): boolean => s.loanType === 'combined',
    isPriceMode: (s): boolean => s.inputMode === 'price',
    activeRate: (s): number => (s.loanType === 'fund' ? s.rateFund : s.rateComm),

    /* 年限上限（滑块 / 数字框 / 快捷按钮均跟随此值） */
    maxYears: (s): number => YEARS_CAP[s.loanType],
    /* 参与计算与显示的年限，见 effYearsOf 说明 */
    effYears: (s): number => effYearsOf(s),

    loanTotalWan: (s): number => (s.inputMode === 'price' ? r1(s.price * (1 - s.downRatio / 100)) : s.loan),
    downWan: (s): number => r1(s.price - (s.inputMode === 'price' ? r1(s.price * (1 - s.downRatio / 100)) : s.loan)),

    /* 组合贷拆分：公积金部分可调，商贷部分自动补齐 */
    fundComm: (s): FundComm => {
      const total = s.inputMode === 'price' ? r1(s.price * (1 - s.downRatio / 100)) : s.loan
      const fund = Math.min(Math.max(0, r1(s.fundWan)), total)
      return { total, fund: r1(fund), comm: r1(total - fund) }
    },

    series: (s): AmortRow[] => buildLoanRows(s, s.method),
    seriesEqual: (s): AmortRow[] => buildLoanRows(s, 'equal'),
    seriesPrincipal: (s): AmortRow[] => buildLoanRows(s, 'principal'),

    summary: (s): SummaryInfo => {
      const rows = buildLoanRows(s, s.method)
      const P = (s.inputMode === 'price' ? r1(s.price * (1 - s.downRatio / 100)) : s.loan) * 10000
      let totalPay = 0
      for (const r of rows) totalPay += r.payment
      const totalInt = totalPay - P
      return { P, totalPay, totalInt, first: rows[0], last: rows[rows.length - 1], M: rows[0].payment, n: rows.length }
    },

    netPay(): number {
      return Math.max(0, this.summary.M - this.fundMonthly)
    },

    typeLine(): string {
      if (this.isCombined) {
        const fc = this.fundComm
        return `组合贷 公积金 ${fc.fund}万 + 商贷 ${fc.comm}万`
      }
      return this.TYPE_CN[this.loanType]
    },
    rateLine(): string {
      if (this.isCombined) return `公积金 ${this.rateFund.toFixed(2)}% · 商贷 ${this.rateComm.toFixed(2)}%`
      return `年利率 ${this.activeRate.toFixed(2)}%`
    },
    subLine1(): string {
      return `${this.METHOD_CN[this.method]} · ${this.typeLine} · ${this.summary.n} 期 · ${this.rateLine}`
    },

    /* 结果区右侧「贷款概要」卡片的数据行 */
    summaryItems(): SummaryItem[] {
      const fc = this.isCombined ? this.fundComm : null
      const compose = fc
        ? `组合贷 · 公积金 ${fc.fund}万 + 商贷 ${fc.comm}万`
        : this.TYPE_CN[this.loanType]
      const rate = fc
        ? `公积金 ${this.rateFund.toFixed(2)}% · 商贷 ${this.rateComm.toFixed(2)}%`
        : this.activeRate.toFixed(2) + '%'
      return [
        { label: '还款方式', value: this.METHOD_CN[this.method] },
        { label: '贷款组成', value: compose },
        { label: '期限', value: this.summary.n + ' 期' },
        { label: '年利率', value: rate },
        { label: '首月利息', value: money(this.summary.first.interest) },
        { label: '末月利息', value: money(this.summary.last.interest) }
      ]
    },

    /* 两种还款方式的利息 / 首月对比提示（含 HTML 高亮） */
    compareText(): string {
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

    copyText(): string {
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
        `贷款年限：${this.effYears} 年（${res.n} 期）`,
        rateLine,
        `还款方式：${this.METHOD_CN[this.method]}`,
        `每月月供：${money(res.M)}`,
        this.fundMonthly > 0 ? `公积金抵扣：${money(this.fundMonthly)}\n实际自付月供：${money(this.netPay)}` : '',
        `还款总额：${money(res.totalPay)}`,
        `总利息：${money(res.totalInt)}`,
        '─────────────',
        '结果仅供参考，以银行审批为准'
      ].filter((x): x is string => Boolean(x)).join('\n')
    }
  },

  actions: {
    setLoanType(t: LoanType) { this.loanType = t },
    setMethod(m: Method) { this.method = m },
    /* 只做绝对范围钳制：允许输入到 40，超出当前贷款类型上限的部分留给 effYears 收窄，
       因此切换贷款类型不会改写用户已输入的年限 */
    setYears(v: number | string) { this.years = Math.min(YEARS_INPUT_MAX, Math.max(1, Math.round(parseFloat(String(v))))) },
    setPrice(v: number | string) { this.price = Math.min(5000, Math.max(1, parseFloat(String(v)))) },
    setDownRatio(v: number | string) { this.downRatio = Math.min(95, Math.max(0, parseFloat(String(v)))) },
    setLoan(v: number | string) { this.loan = Math.min(3000, Math.max(1, parseFloat(String(v)))) },
    setRate(v: number | string) {
      const val = Math.min(12, Math.max(0, parseFloat(String(v))))
      if (this.loanType === 'fund') this.rateFund = val
      else this.rateComm = val
    },
    setRateFund(v: number | string) { this.rateFund = Math.min(12, Math.max(0, parseFloat(String(v)))) },
    setRateComm(v: number | string) { this.rateComm = Math.min(12, Math.max(0, parseFloat(String(v)))) },
    setFundWan(v: number | string) { this.fundWan = Math.min(this.loanTotalWan, Math.max(0, r1(parseFloat(String(v))))) },
    setCommWan(v: number | string) {
      const total = this.loanTotalWan
      const comm = Math.min(total, Math.max(0, r1(parseFloat(String(v)))))
      this.fundWan = r1(total - comm)
    },
    setFundMonthly(v: number | string) {
      this.fundMonthly = Math.min(50000, Math.max(0, Math.round(parseFloat(String(v)) || 0)))
    },
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
