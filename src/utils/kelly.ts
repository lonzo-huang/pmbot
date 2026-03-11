/**
 * 凯利公式仓位计算器
 * 放置位置：src/utils/kelly.ts
 * 公式：f* = (bp - q) / b
 * 其中：b=赔率-1, p=成功概率, q=1-p
 */

export interface KellyParams {
  probability: number  // AI 预估成功概率 (0-1)
  odds: number         // 市场赔率 (如 0.42 表示 42¢，对应赔率 1/0.42 ≈ 2.38)
  maxRiskPercent?: number  // 最大风险比例 (默认 25%)
}

export interface KellyResult {
  fraction: number     // 建议投入本金比例 (0-1)
  recommendedSize: number  // 建议下注金额 (USDC)
  expectedValue: number    // 期望收益
  riskLevel: 'low' | 'medium' | 'high' | 'extreme'
  shouldTrade: boolean     // 是否建议交易
  reason: string
}

/**
 * 计算凯利最优仓位
 */
export function calculateKelly(params: KellyParams, bankroll: number): KellyResult {
  const { probability, odds, maxRiskPercent = 0.25 } = params

  // 参数校验
  if (probability <= 0 || probability >= 1) {
    return {
      fraction: 0,
      recommendedSize: 0,
      expectedValue: 0,
      riskLevel: 'extreme',
      shouldTrade: false,
      reason: '概率值必须在 (0, 1) 范围内'
    }
  }

  if (odds <= 0 || odds >= 1) {
    return {
      fraction: 0,
      recommendedSize: 0,
      expectedValue: 0,
      riskLevel: 'extreme',
      shouldTrade: false,
      reason: '赔率值必须在 (0, 1) 范围内'
    }
  }

  // 计算赔率倍数 (b): 如果花 0.42¢ 买 1¢ 的 YES，赢了赚 0.58¢，赔率 = 0.58/0.42 ≈ 1.38
  const b = (1 - odds) / odds

  const p = probability
  const q = 1 - p

  // 凯利公式: f* = (bp - q) / b
  const kellyFraction = (b * p - q) / b

  // 半凯利 (更保守): 只用计算结果的一半
  const conservativeFraction = kellyFraction * 0.5

  // 应用最大风险限制
  const cappedFraction = Math.min(
    Math.max(conservativeFraction, 0),  // 不低于 0
    maxRiskPercent                       // 不超过最大风险
  )

  // 计算期望收益
  const expectedValue = p * (1 - odds) - q * odds

  // 风险等级评估
  let riskLevel: KellyResult['riskLevel'] = 'low'
  if (cappedFraction > 0.2) riskLevel = 'high'
  else if (cappedFraction > 0.1) riskLevel = 'medium'
  if (kellyFraction < 0) riskLevel = 'extreme'  // 负期望，不应交易

  // 是否建议交易
  const shouldTrade = cappedFraction > 0.01 && expectedValue > 0

  return {
    fraction: parseFloat(cappedFraction.toFixed(4)),
    recommendedSize: parseFloat((bankroll * cappedFraction).toFixed(2)),
    expectedValue: parseFloat(expectedValue.toFixed(4)),
    riskLevel,
    shouldTrade,
    reason: generateReason(kellyFraction, cappedFraction, expectedValue, probability, odds)
  }
}

/**
 * 生成决策理由
 */
function generateReason(
  rawKelly: number,
  capped: number,
  ev: number,
  p: number,
  odds: number
): string {
  if (rawKelly <= 0) {
    return `负期望值 (EV=${(ev*100).toFixed(2)}%)，不建议交易`
  }
  if (capped < 0.01) {
    return `仓位过小 (<1%)，机会不显著`
  }
  if (capped > 0.2) {
    return `高置信度机会，但已应用 25% 风险上限`
  }
  return `凯利建议 ${(rawKelly*100).toFixed(1)}%，保守采用 ${(capped*100).toFixed(1)}%，期望收益 ${(ev*100).toFixed(2)}%`
}

/**
 * 批量计算多个选项的凯利值（用于比较）
 */
export function compareKellyOptions(
  options: Array<{ name: string; probability: number; odds: number }>,
  bankroll: number
): Array<KellyResult & { name: string }> {
  return options.map(opt => ({
    name: opt.name,
    ...calculateKelly(
      { probability: opt.probability, odds: opt.odds },
      bankroll
    )
  })).sort((a, b) => b.recommendedSize - a.recommendedSize)
}