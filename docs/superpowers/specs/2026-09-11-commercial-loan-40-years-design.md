# 商业贷款年限上限放宽至 40 年

日期：2026-09-11

## 背景

当前项目已支持三种贷款类型（`commercial` 商业贷款 / `fund` 公积金贷款 / `combined` 组合贷款），
但贷款年限在所有类型下被硬编码锁死在 30 年，无法反映「商业贷款最长可贷 40 年」的实际政策。

## 范围

年限上限按贷款类型动态化，唯一变化是商业贷款可到 40 年：

| 贷款类型 | 年限上限 |
| --- | --- |
| 商业贷款 `commercial` | **40 年** |
| 公积金贷款 `fund` | 30 年 |
| 组合贷款 `combined` | 30 年 |

**为什么组合贷不放宽**：组合贷款由「公积金 + 商贷」两部分组成，为便于管理，两部分期限必须保持一致。
公积金贷款最长期限受国家政策限制为 30 年，因此整个组合贷款的期限上限仍是 30 年。
想要 40 年期限只能放弃公积金、申请纯商业贷款。

**明确不做**：

- 组合贷两部分拆成独立年限输入（政策上不成立：两部分期限须一致）
- 放宽公积金贷款年限
- 新增贷款类型

## 状态模型

`years` 字段名与语义保持不变——它存的是**用户输入的原始年限**，取值范围 `[1, 40]`。

字段名不变带来一个直接好处：`persist.ts` 只恢复当前 state 中已存在的键，
老 localStorage 里的 `years` 能原样恢复，**无需任何迁移代码**。
（旧版本上限为 30，历史值必然 ≤ 30，落在新范围内。）

新增两个 getter：

| getter | 含义 |
| --- | --- |
| `maxYears` | 当前贷款类型的年限上限：商贷 40，其余 30 |
| `effYears` | `Math.min(years, maxYears)`，**所有计算与显示的唯一入口** |

### 超限行为：保留原值，读取时封顶

切换贷款类型时**不修改** `years`，只让 `effYears` 跟随 `maxYears` 收窄：

```
商贷填 40 → 切到组合贷：years 仍是 40，effYears = 30，界面显示 30
           → 切回商贷：  years 仍是 40，effYears = 40，界面显示 40
```

这样反复切换类型做对比时不会丢失已输入的年限。
用户主动拖动滑块或点快捷年限按钮时，才把钳制后的值写回 `years`。

### 不变式

> `years` 是原始值，可能超过当前类型上限；`effYears` 才是有效值。
> 除 `setYears` 写入、滑块/按钮读取当前值外，**任何地方都不得直接读 `years`**。

现有直接使用 `years` 的位置（全部改为 `effYears`）：

- `buildLoanRows()` — 传给 `buildSeries` 计算期数
- `summary` getter — 返回 `n`（总期数）
- `copyText` getter — 「贷款年限：X 年（n 期）」

## 改动清单

### `src/stores/loan.ts`

- 新增 `maxYears` getter：`s.loanType === 'commercial' ? 40 : 30`
- 新增 `effYears` getter：`Math.min(s.years, s.maxYears)`
- `setYears`：绝对范围由 `[1, 30]` 放宽至 `[1, 40]`，仍为 `Math.round` 取整
  - 不按贷款类型钳制（超限由 `effYears` 兜住）
- `buildLoanRows()`：`s.years` → `s.effYears`（单笔与组合贷两条分支共 3 处调用）
- `copyText`：`this.years` → `this.effYears`

`summary`、`summaryItems`、`subLine1`、`compareText` 等 getter 的期数均从
`buildLoanRows()` 的结果或 `summary.n` 推导，改掉 `buildLoanRows()` 后自动跟随，无需单独改动。

### `src/components/InputPanel.vue`

- `YEAR_CHIPS` 扩展为 `[5, 10, 15, 20, 25, 30, 35, 40]`；
  模板中按 `y <= store.maxYears` 过滤（商贷显示 8 个，其余显示 6 个，与现状一致）
  - `.chips` 已有 `flex-wrap: wrap`，多出的按钮会自然换行
- 年限滑块：`:max="store.maxYears"`，由 `v-model.number` 改为 `:value="store.effYears"` + `@input`，
  经 `setYears` 写回（保持写法与利率滑块一致）
- 年限数字框：`:max="store.maxYears"`，`:value="store.effYears"`
- `yearsFill()`：分母由硬编码 `30` 改为 `store.maxYears`
- 年限 readout 与快捷按钮的 `active` 判断：一律用 `store.effYears`
- 组合贷时在年限字段下补一行小字：`两部分期限须一致，最长 30 年`

### `src/components/InputPanel.vue` 类型卡片文案

- 商业贷款描述：`LPR 浮动利率，额度高` → `LPR 浮动利率，最长 40 年`

### 不受影响

- `ResultPanel.vue` — 图表按 `series` 长度自适应（`x(i)`、柱宽 `step` 均由 `n` 推导），
  480 期的走势图与 360 期无差别
- `AmortizationTable.vue` — 行数由 `series.length` 决定，展开全部即 480 行
- `persist.ts` — 无需改动
- `compareText` / `netPay` / `fundComm` 等 — 均不含年限硬编码

## 验证

项目无测试框架（`playwright-core` 已装但无测试文件），采用：

1. `npm run typecheck`（`vue-tsc --noEmit`）通过
2. `npm run build` 通过
3. 浏览器实跑，逐项确认：
   - 商业贷款：滑块可拖到 40，数字框可输 40，快捷按钮出现 35/40，「40年」按钮高亮
   - 商业贷款 40 年：总期数显示 480 期，走势图与还款计划表正常渲染
   - 公积金 / 组合贷：滑块与数字框上限仍是 30，快捷按钮不出现 35/40
   - 商贷填 40 → 切组合贷显示 30 → 切回商贷仍为 40（原值保留）
   - 商贷填 40 → 切组合贷 → 拖动滑块到 25 → 切回商贷为 25（主动修改才写回）
   - 刷新页面后年限从 localStorage 正确恢复
   - 复制结果文案中的年限与期数一致
