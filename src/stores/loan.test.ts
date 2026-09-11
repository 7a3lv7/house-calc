import { describe, it, expect, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useLoanStore } from './loan'

/* 统一的基准状态：直接输入贷款额 100 万，避免受房价/首付比例影响 */
function setup(): ReturnType<typeof useLoanStore> {
  const s = useLoanStore()
  s.$patch({ inputMode: 'loan', loan: 100, method: 'equal', fundMonthly: 0 })
  return s
}

describe('年限上限按贷款类型区分', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('商业贷款上限为 40 年', () => {
    const s = setup()
    s.setLoanType('commercial')
    expect(s.maxYears).toBe(40)
  })

  it('公积金贷款上限为 30 年', () => {
    const s = setup()
    s.setLoanType('fund')
    expect(s.maxYears).toBe(30)
  })

  it('组合贷款上限为 30 年（两部分期限须一致，受公积金封顶约束）', () => {
    const s = setup()
    s.setLoanType('combined')
    expect(s.maxYears).toBe(30)
  })
})

describe('setYears 取值范围', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('接受 40 年', () => {
    const s = setup()
    s.setYears(40)
    expect(s.years).toBe(40)
  })

  it('超过 40 年时封顶到 40', () => {
    const s = setup()
    s.setYears(45)
    expect(s.years).toBe(40)
  })

  it('小于 1 年时兜底到 1', () => {
    const s = setup()
    s.setYears(0)
    expect(s.years).toBe(1)
  })

  it('接受字符串数字并取整', () => {
    const s = setup()
    s.setYears('35')
    expect(s.years).toBe(35)
  })
})

describe('超出当前类型上限时保留原值', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('商贷 40 年切到组合贷：effYears 收窄为 30，原值仍是 40', () => {
    const s = setup()
    s.setLoanType('commercial')
    s.setYears(40)

    s.setLoanType('combined')

    expect(s.effYears).toBe(30)
    expect(s.years).toBe(40)
  })

  it('再切回商贷：effYears 恢复为 40', () => {
    const s = setup()
    s.setLoanType('commercial')
    s.setYears(40)
    s.setLoanType('combined')
    s.setLoanType('commercial')

    expect(s.effYears).toBe(40)
  })

  it('在组合贷下主动改成 25 年，切回商贷后为 25 年（主动修改才写回）', () => {
    const s = setup()
    s.setLoanType('commercial')
    s.setYears(40)
    s.setLoanType('combined')
    s.setYears(25)
    s.setLoanType('commercial')

    expect(s.effYears).toBe(25)
  })

  it('组合贷下 history 里残留的 40 年不会让期数超过 360', () => {
    const s = setup()
    s.setLoanType('commercial')
    s.setYears(40)
    s.setLoanType('combined')

    expect(s.series.length).toBe(360)
    expect(s.summary.n).toBe(360)
  })
})

describe('期数跟随 effYears', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('商业贷款 40 年共 480 期', () => {
    const s = setup()
    s.setLoanType('commercial')
    s.setYears(40)

    expect(s.series.length).toBe(480)
    expect(s.summary.n).toBe(480)
  })

  it('公积金贷款 30 年共 360 期', () => {
    const s = setup()
    s.setLoanType('fund')
    s.setYears(30)

    expect(s.series.length).toBe(360)
  })

  it('复制文案中的年限与期数取有效值', () => {
    const s = setup()
    s.setLoanType('commercial')
    s.setYears(40)
    s.setLoanType('combined')

    expect(s.copyText).toContain('贷款年限：30 年（360 期）')
  })
})

describe('等额本息摊还', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('100 万 / 30 年 / 3.0% 的月供为 4216.04 元', () => {
    const s = setup()
    s.setLoanType('commercial')
    s.setRateComm(3.0)
    s.setYears(30)

    expect(s.summary.M).toBeCloseTo(4216.04, 1)
  })

  it('每期月供恒定', () => {
    const s = setup()
    s.setLoanType('commercial')
    s.setRateComm(3.0)

    const payments = s.series.map((r) => r.payment)
    for (const p of payments) expect(p).toBeCloseTo(payments[0], 6)
  })

  it('本金合计等于贷款额，末期剩余本金归零', () => {
    const s = setup()
    s.setLoanType('commercial')
    s.setRateComm(3.0)

    const principalSum = s.series.reduce((a, r) => a + r.principal, 0)
    expect(principalSum).toBeCloseTo(100 * 10000, 4)
    expect(s.series[s.series.length - 1].balance).toBeCloseTo(0, 6)
  })

  it('总还款 = 本金 + 总利息', () => {
    const s = setup()
    s.setLoanType('commercial')
    s.setRateComm(3.0)

    expect(s.summary.totalPay).toBeCloseTo(s.summary.P + s.summary.totalInt, 4)
    expect(s.summary.totalPay).toBeCloseTo(1517774.52, 0)
  })
})

describe('等额本金摊还', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('100 万 / 40 年 / 3.0% 首期月供为 4583.33 元', () => {
    const s = setup()
    s.setLoanType('commercial')
    s.setRateComm(3.0)
    s.setYears(40)
    s.setMethod('principal')

    expect(s.summary.M).toBeCloseTo(4583.33, 1)
  })

  it('每期本金恒定，月供逐月递减', () => {
    const s = setup()
    s.setLoanType('commercial')
    s.setRateComm(3.0)
    s.setYears(40)
    s.setMethod('principal')

    const each = 100 * 10000 / 480
    for (const r of s.series) expect(r.principal).toBeCloseTo(each, 6)
    for (let i = 1; i < s.series.length; i++) {
      expect(s.series[i].payment).toBeLessThan(s.series[i - 1].payment)
    }
  })

  it('相同时长下总利息少于等额本息', () => {
    const s = setup()
    s.setLoanType('commercial')
    s.setRateComm(3.0)
    s.setYears(40)

    s.setMethod('principal')
    const principalInt = s.summary.totalInt
    s.setMethod('equal')
    const equalInt = s.summary.totalInt

    expect(principalInt).toBeLessThan(equalInt)
  })
})

describe('组合贷合并', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('公积金部分取 0 时，合并结果等于纯商贷', () => {
    const s = setup()
    s.setRateComm(3.0)
    s.setRateFund(2.85)
    s.setYears(30)

    s.setLoanType('commercial')
    const pureComm = s.series.map((r) => r.payment)

    s.setLoanType('combined')
    s.setFundWan(0)
    const merged = s.series.map((r) => r.payment)

    expect(merged).toHaveLength(pureComm.length)
    merged.forEach((v, i) => expect(v).toBeCloseTo(pureComm[i], 6))
  })

  it('商贷部分取 0 时，合并结果等于纯公积金', () => {
    const s = setup()
    s.setRateComm(3.0)
    s.setRateFund(2.85)
    s.setYears(30)

    s.setLoanType('fund')
    const pureFund = s.series.map((r) => r.payment)

    s.setLoanType('combined')
    s.setFundWan(100)
    expect(s.fundComm.comm).toBe(0)
    const merged = s.series.map((r) => r.payment)

    expect(merged).toHaveLength(pureFund.length)
    merged.forEach((v, i) => expect(v).toBeCloseTo(pureFund[i], 6))
  })

  it('两部分各占一半时，首期月供等于两部分首期月供之和', () => {
    const s = setup()
    s.setRateComm(3.0)
    s.setRateFund(2.85)
    s.setYears(30)

    s.setLoanType('commercial')
    s.setLoan(50)
    const commFirst = s.series[0].payment

    s.setLoanType('fund')
    const fundFirst = s.series[0].payment

    s.setLoanType('combined')
    s.setLoan(100)
    s.setFundWan(50)

    expect(s.summary.M).toBeCloseTo(commFirst + fundFirst, 0)
  })
})
