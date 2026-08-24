<script setup>
import { ref, watch, onMounted } from 'vue'
import { useLoanStore, money } from '../stores/loan'

const store = useLoanStore()

const TYPES = [
  { key: 'commercial', name: '商业贷款', desc: 'LPR 浮动利率，额度高' },
  { key: 'fund', name: '公积金贷款', desc: '利率最低，额度受缴存限制' },
  { key: 'combined', name: '组合贷款', desc: '公积金 + 商贷搭配，兼顾利率与额度' }
]
const DOWN_CHIPS = [20, 30, 40, 50]
const YEAR_CHIPS = [5, 10, 15, 20, 25, 30]
const FUND_MONTHLY_CHIPS = [0, 1000, 2000, 3000]
const FUND_RATE_CHIPS = [2.85, 3.325]
const COMM_RATE_CHIPS = [3.0, 3.3]

/* 滑块填充比例 */
const pct = (v, min, max) => ((v - min) / (max - min) * 100) + '%'
const priceFill = () => pct(store.price, 10, 3000)
const loanFill = () => pct(store.loan, 10, 3000)
const rateFill = () => pct(store.activeRate, 0.5, 6)
const yearsFill = () => pct(store.years, 1, 30)
const fundMonthlyFill = () => pct(store.fundMonthly, 0, 10000)
const fundSliderFill = () => (store.fundComm.total > 0 ? store.fundComm.fund / store.fundComm.total * 100 : 0) + '%'

/* 数字输入：解析后写入 store（不即时钳制，保留输入过程） */
const numInput = (fn) => (e) => {
  const v = parseFloat(e.target.value)
  if (!isNaN(v)) fn(v)
}
const onPriceInput = numInput(store.setPrice)
const onDownInput = numInput(store.setDownRatio)
const onLoanInput = numInput(store.setLoan)
const onYearsInput = numInput(store.setYears)
const onFundMonthlyInput = numInput(store.setFundMonthly)
const onFundWanInput = numInput(store.setFundWan)
const onCommWanInput = numInput(store.setCommWan)
const onRateInput = numInput(store.setRate)
const onRateFundInput = numInput(store.setRateFund)
const onRateCommInput = numInput(store.setRateComm)

/* 利率小数输入框：非受控，避免输入 "2.85" 时中间态被覆盖；
   外部变化（滑块/快捷利率/切换贷款类型）时才回填显示值 */
const rateNumEl = ref(null)
const rateFundEl = ref(null)
const rateCommEl = ref(null)
function syncRateInputs() {
  if (rateNumEl.value && document.activeElement !== rateNumEl.value) rateNumEl.value.value = store.activeRate.toFixed(2)
  if (rateFundEl.value && document.activeElement !== rateFundEl.value) rateFundEl.value.value = store.rateFund.toFixed(2)
  if (rateCommEl.value && document.activeElement !== rateCommEl.value) rateCommEl.value.value = store.rateComm.toFixed(2)
}
watch(() => store.activeRate, syncRateInputs)
watch(() => store.rateFund, syncRateInputs)
watch(() => store.rateComm, syncRateInputs)
watch(() => store.loanType, syncRateInputs)
onMounted(syncRateInputs)
</script>

<template>
  <section class="panel inputs" aria-label="贷款参数">
    <div class="panel-head">
      <h2>贷款参数</h2>
      <span class="note">PARAMETERS</span>
    </div>

    <div class="fields">
      <!-- 贷款类型 -->
      <div class="field">
        <div class="field-head"><label>贷款类型</label></div>
        <div class="methods three" role="radiogroup" aria-label="贷款类型">
          <button
            v-for="t in TYPES"
            :key="t.key"
            class="method"
            :class="{ active: store.loanType === t.key }"
            role="radio"
            :aria-checked="store.loanType === t.key"
            @click="store.setLoanType(t.key)"
          >
            <div class="m-name">{{ t.name }}</div>
            <div class="m-desc">{{ t.desc }}</div>
          </button>
        </div>
      </div>

      <!-- 房屋总价 / 首付（按总价模式） -->
      <template v-if="store.isPriceMode">
        <div class="field">
          <div class="field-head">
            <label>房屋总价<small>万元</small></label>
            <span class="field-readout">{{ store.price.toLocaleString('zh-CN') }}<span class="unit">万</span></span>
          </div>
          <input
            type="range" min="10" max="3000" step="1"
            v-model.number="store.price"
            :style="{ '--fill': priceFill() }"
            aria-label="房屋总价（万元）"
          >
          <div class="field-foot">
            <div class="num-input">
              <input type="number" min="10" max="5000" step="1" :value="store.price" @input="onPriceInput" aria-label="房屋总价（万元）">
              <span class="suffix">万</span>
            </div>
          </div>
        </div>

        <div class="field">
          <div class="field-head">
            <label>首付比例</label>
            <span class="field-readout">{{ store.downRatio }}<span class="unit">%</span><span class="sep">·</span>{{ store.downWan.toLocaleString('zh-CN') }}<span class="unit">万</span></span>
          </div>
          <div class="field-foot">
            <div class="chips" role="group" aria-label="常用首付比例">
              <button
                v-for="p in DOWN_CHIPS"
                :key="p"
                class="chip"
                :class="{ active: store.downRatio === p }"
                @click="store.setDownRatio(p)"
              >{{ p }}%</button>
            </div>
            <div class="num-input">
              <input type="number" min="0" max="95" step="1" :value="store.downRatio" @input="onDownInput" aria-label="首付比例（%）">
              <span class="suffix">%</span>
            </div>
            <span class="mono-sub">首付 ≈ {{ money(store.downWan * 10000) }}</span>
          </div>
        </div>
      </template>

      <div class="mode-switch-row">
        <button class="mode-switch" type="button" @click="store.toggleInputMode()">
          {{ store.isPriceMode ? '直接输入贷款金额' : '按总价与首付计算' }}
        </button>
      </div>

      <!-- 贷款金额：直接输入模式 -->
      <div v-if="!store.isPriceMode && !store.isCombined" class="field">
        <div class="field-head">
          <label>贷款金额<small>万元</small></label>
          <span class="field-readout">{{ store.loan.toLocaleString('zh-CN') }}<span class="unit">万</span></span>
        </div>
        <input
          type="range" min="10" max="3000" step="1"
          v-model.number="store.loan"
          :style="{ '--fill': loanFill() }"
          aria-label="贷款金额（万元）"
        >
        <div class="field-foot">
          <div class="num-input">
            <input type="number" min="10" max="3000" step="1" :value="store.loan" @input="onLoanInput" aria-label="贷款金额（万元）">
            <span class="suffix">万</span>
          </div>
          <span class="mono-sub">≈ {{ money(store.loan * 10000) }}</span>
        </div>
      </div>

      <!-- 贷款金额：按总价模式（自动计算，只读） -->
      <div v-if="store.isPriceMode && !store.isCombined" class="field">
        <div class="field-head">
          <label>贷款金额<small>自动计算</small></label>
          <span class="field-readout">{{ store.loanTotalWan.toLocaleString('zh-CN') }}<span class="unit">万</span></span>
        </div>
        <div class="loan-readout-card">
          <span class="big">{{ money(store.loanTotalWan * 10000) }}</span>
          <span class="hint">= 总价 − 首付</span>
        </div>
      </div>

      <!-- 组合贷拆分：公积金可调，商贷自动补齐 -->
      <div v-if="store.isCombined" class="field">
        <div class="field-head">
          <label>贷款金额<small>万元</small></label>
          <span class="field-readout">共 <span>{{ store.loanTotalWan.toLocaleString('zh-CN') }}</span><span class="unit">万</span></span>
        </div>

        <!-- 直接输入模式：总额可编辑 -->
        <template v-if="!store.isPriceMode">
          <input
            type="range" min="10" max="3000" step="1"
            v-model.number="store.loan"
            :style="{ '--fill': loanFill() }"
            aria-label="贷款总额（万元）"
          >
          <div class="field-foot">
            <div class="num-input">
              <input type="number" min="10" max="3000" step="1" :value="store.loan" @input="onLoanInput" aria-label="贷款总额（万元）">
              <span class="suffix">万</span>
            </div>
            <span class="mono-sub">≈ {{ money(store.loan * 10000) }}</span>
          </div>
        </template>
        <!-- 按总价模式：自动计算，只读 -->
        <template v-else>
          <div class="loan-readout-card">
            <span class="big">{{ money(store.loanTotalWan * 10000) }}</span>
            <span class="hint">= 总价 − 首付</span>
          </div>
        </template>

        <div class="combo-row" style="margin-top: 14px">
          <div class="combo-part">
            <div class="combo-label"><span class="dot fund"></span>公积金部分</div>
            <input
              type="range" :min="0" :max="Math.max(store.fundComm.total, 1)" step="1"
              :value="store.fundComm.fund"
              @input="onFundWanInput"
              :style="{ '--fill': fundSliderFill() }"
              aria-label="公积金贷款金额（万元）"
            >
            <div class="field-foot">
              <div class="num-input">
                <input type="number" :min="0" :max="Math.max(store.fundComm.total, 1)" step="1" :value="store.fundComm.fund" @input="onFundWanInput" aria-label="公积金贷款金额（万元）">
                <span class="suffix">万</span>
              </div>
            </div>
          </div>
          <div class="combo-plus" aria-hidden="true">+</div>
          <div class="combo-part">
            <div class="combo-label"><span class="dot comm"></span>商贷部分<small class="auto-tag">自动</small></div>
            <div class="combo-readout">{{ store.fundComm.comm.toLocaleString('zh-CN') }} 万</div>
            <div class="field-foot">
              <div class="num-input">
                <input type="number" :min="0" :max="Math.max(store.fundComm.total, 1)" step="1" :value="store.fundComm.comm" @input="onCommWanInput" aria-label="商业贷款金额（万元）">
                <span class="suffix">万</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- 贷款年限 -->
      <div class="field">
        <div class="field-head">
          <label>贷款年限<small>年</small></label>
          <span class="field-readout">{{ store.years }}<span class="unit">年</span></span>
        </div>
        <input
          type="range" min="1" max="30" step="1"
          v-model.number="store.years"
          :style="{ '--fill': yearsFill() }"
          aria-label="贷款年限（年）"
        >
        <div class="field-foot">
          <div class="chips" role="group" aria-label="快捷年限">
            <button v-for="y in YEAR_CHIPS" :key="y" class="chip" @click="store.setYears(y)">{{ y }}年</button>
          </div>
          <div class="num-input">
            <input type="number" min="1" max="30" step="1" :value="store.years" @input="onYearsInput" aria-label="贷款年限（年）">
            <span class="suffix">年</span>
          </div>
        </div>
      </div>

      <!-- 年利率：单一贷款 -->
      <div v-if="!store.isCombined" class="field">
        <div class="field-head">
          <label>年利率<small>%</small></label>
          <span class="field-readout">{{ store.activeRate.toFixed(2) }}<span class="unit">%</span></span>
        </div>
        <input
          type="range" min="0.5" max="6" step="0.05"
          :value="store.activeRate"
          @input="onRateInput"
          :style="{ '--fill': rateFill() }"
          aria-label="年利率（%）"
        >
        <div class="field-foot">
          <div class="num-input">
            <input ref="rateNumEl" type="number" min="0" max="12" step="0.01" @input="onRateInput" aria-label="年利率（%）">
            <span class="suffix">%</span>
          </div>
          <div class="chips" role="group" aria-label="常用利率">
            <button
              v-for="p in store.RATE_PRESETS[store.loanType]"
              :key="p.v"
              class="chip"
              :class="{ active: Math.abs(store.activeRate - p.v) < 0.005 }"
              @click="store.setRate(p.v)"
            >{{ p.label }}</button>
          </div>
        </div>
      </div>

      <!-- 年利率：组合贷（两部分独立） -->
      <div v-else class="field">
        <div class="field-head"><label>年利率<small>%</small></label></div>
        <div class="combo-row">
          <div class="combo-part">
            <div class="combo-label"><span class="dot fund"></span>公积金利率</div>
            <div class="field-foot">
              <div class="num-input">
                <input ref="rateFundEl" type="number" min="0" max="12" step="0.01" @input="onRateFundInput" aria-label="公积金贷款利率（%）">
                <span class="suffix">%</span>
              </div>
              <div class="chips" role="group" aria-label="公积金常用利率">
                <button
                  v-for="p in FUND_RATE_CHIPS"
                  :key="p"
                  class="chip"
                  :class="{ active: Math.abs(store.rateFund - p) < 0.005 }"
                  @click="store.setRateFund(p)"
                >{{ p.toFixed(3).replace(/0$/, '') }}%</button>
              </div>
            </div>
          </div>
          <div class="combo-plus" aria-hidden="true">+</div>
          <div class="combo-part">
            <div class="combo-label"><span class="dot comm"></span>商贷利率</div>
            <div class="field-foot">
              <div class="num-input">
                <input ref="rateCommEl" type="number" min="0" max="12" step="0.01" @input="onRateCommInput" aria-label="商业贷款利率（%）">
                <span class="suffix">%</span>
              </div>
              <div class="chips" role="group" aria-label="商贷常用利率">
                <button
                  v-for="p in COMM_RATE_CHIPS"
                  :key="p"
                  class="chip"
                  :class="{ active: Math.abs(store.rateComm - p) < 0.005 }"
                  @click="store.setRateComm(p)"
                >{{ p.toFixed(2) }}%</button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- 还款方式 -->
      <div class="field">
        <div class="field-head"><label>还款方式</label></div>
        <div class="methods" role="radiogroup" aria-label="还款方式">
          <button
            class="method"
            :class="{ active: store.method === 'equal' }"
            role="radio"
            :aria-checked="store.method === 'equal'"
            @click="store.setMethod('equal')"
          >
            <div class="m-name">等额本息</div>
            <div class="m-desc">每月还款额固定，前期利息占比高，总利息较多</div>
          </button>
          <button
            class="method"
            :class="{ active: store.method === 'principal' }"
            role="radio"
            :aria-checked="store.method === 'principal'"
            @click="store.setMethod('principal')"
          >
            <div class="m-name">等额本金</div>
            <div class="m-desc">每月本金固定，月供逐月递减，总利息较少</div>
          </button>
        </div>
      </div>

      <!-- 每月公积金抵扣 -->
      <div class="field">
        <div class="field-head">
          <label>每月公积金金额<small>元</small></label>
          <span class="field-readout">{{ store.fundMonthly.toLocaleString('zh-CN') }}<span class="unit">元</span></span>
        </div>
        <input
          type="range" min="0" max="10000" step="100"
          v-model.number="store.fundMonthly"
          :style="{ '--fill': fundMonthlyFill() }"
          aria-label="每月公积金金额（元）"
        >
        <div class="field-foot">
          <div class="chips" role="group" aria-label="常用公积金月缴存">
            <button
              v-for="m in FUND_MONTHLY_CHIPS"
              :key="m"
              class="chip"
              :class="{ active: store.fundMonthly === m }"
              @click="store.setFundMonthly(m)"
            >{{ m.toLocaleString('zh-CN') }}</button>
          </div>
          <div class="num-input">
            <input type="number" min="0" max="50000" step="50" :value="store.fundMonthly" @input="onFundMonthlyInput" aria-label="每月公积金金额（元）">
            <span class="suffix">元</span>
          </div>
          <span class="mono-sub">月供 − 公积金 = 实际自付</span>
        </div>
      </div>
    </div>
  </section>
</template>
