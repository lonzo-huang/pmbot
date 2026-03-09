/**
 * LLM 市场分析服务
 * 整合多个 AI API 进行市场情绪分析
 */

import apiConfigManager from '@/services/api/ApiConfigManager'
import { MarketAnalysis } from '@/services/realtime/RealtimeService'

export interface LLMAnalysis {
  sentiment: 'bullish' | 'bearish' | 'neutral'
  confidence: number
  reasoning: string
  recommendation: 'buy_yes' | 'buy_no' | 'hold'
  riskLevel: 'low' | 'medium' | 'high'
  timestamp: number
}

export interface MarketContext {
  assetId: string
  question: string
  currentPrice: number
  priceHistory: number[]
  volume: number
  orderBookImbalance: number
  strategySignal: 'buy' | 'sell' | 'hold'
}

class LLMService {
  private readonly PROMPT_TEMPLATE = `
Analyze this Polymarket prediction market and provide trading recommendation:

Market Question: {question}
Current YES Price: {price}¢ (implied probability: {probability}%)
Order Book Imbalance: {imbalance} ({imbalanceDirection} pressure)
Recent Price Trend: {trend}
Strategy Signal: {strategySignal}

Consider:
1. Market sentiment and news context
2. Technical indicators from price history
3. Risk/reward ratio at current price
4. Time decay implications

Provide:
1. Sentiment (bullish/bearish/neutral)
2. Confidence (0-1)
3. Recommendation (buy_yes/buy_no/hold)
4. Risk level (low/medium/high)
5. Reasoning (2-3 sentences)

Respond in JSON format:
{
  "sentiment": "...",
  "confidence": 0.0,
  "recommendation": "...",
  "riskLevel": "...",
  "reasoning": "..."
}
`.trim()

  async analyze(
    context: MarketContext,
    providerId?: string
  ): Promise<LLMAnalysis | null> {
    try {
      // 获取 API 配置
      const config = await apiConfigManager.getProviderConfig(
        providerId || 'openrouter'
      )

      if (!config?.apiKey) {
        console.warn('[LLMService] No API key configured')
        return null
      }

      // 构建提示词
      const prompt = this.buildPrompt(context)

      // 调用 LLM API
      const response = await this.callLLM(config, prompt)

      // 解析响应
      const analysis = this.parseResponse(response, context)

      console.log('[LLMService] 分析完成:', analysis)
      return analysis
    } catch (error) {
      console.error('[LLMService] 分析失败:', error)
      return null
    }
  }

  private buildPrompt(context: MarketContext): string {
    const trend = this.calculateTrend(context.priceHistory)
    const imbalanceDirection = context.orderBookImbalance > 0 ? 'buy' : 'sell'

    return this.PROMPT_TEMPLATE
      .replace('{question}', context.question)
      .replace('{price}', (context.currentPrice * 100).toFixed(1))
      .replace('{probability}', (context.currentPrice * 100).toFixed(1))
      .replace('{imbalance}', (context.orderBookImbalance * 100).toFixed(1))
      .replace('{imbalanceDirection}', imbalanceDirection)
      .replace('{trend}', trend)
      .replace('{strategySignal}', context.strategySignal)
  }

  private calculateTrend(prices: number[]): string {
    if (prices.length < 2) return 'insufficient data'

    const recent = prices.slice(-5)
    const change = (recent[recent.length - 1] - recent[0]) / recent[0]

    if (change > 0.05) return 'strong uptrend (+5%+)'
    if (change > 0.02) return 'uptrend (+2-5%)'
    if (change > -0.02) return 'sideways (±2%)'
    if (change > -0.05) return 'downtrend (-2 to -5%)'
    return 'strong downtrend (-5%+)'
  }

  private async callLLM(
    config: { apiKey: string; model: string },
    prompt: string
  ): Promise<string> {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': window.location.origin,
      },
      body: JSON.stringify({
        model: config.model,
        messages: [
          {
            role: 'system',
            content: 'You are a professional prediction market analyst. Provide concise, data-driven trading recommendations.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.3,
        max_tokens: 500,
      }),
    })

    if (!response.ok) {
      throw new Error(`LLM API error: ${response.status}`)
    }

    const data = await response.json()
    return data.choices[0]?.message?.content || ''
  }

  private parseResponse(
    response: string,
    context: MarketContext
  ): LLMAnalysis {
    try {
      // 尝试解析 JSON
      const jsonMatch = response.match(/\{[\s\S]*\}/)
      const jsonStr = jsonMatch ? jsonMatch[0] : response
      const parsed = JSON.parse(jsonStr)

      return {
        sentiment: parsed.sentiment || 'neutral',
        confidence: parsed.confidence || 0.5,
        reasoning: parsed.reasoning || 'No reasoning provided',
        recommendation: parsed.recommendation || 'hold',
        riskLevel: parsed.riskLevel || 'medium',
        timestamp: Date.now(),
      }
    } catch {
      // 降级处理
      return {
        sentiment: 'neutral',
        confidence: 0.5,
        reasoning: response.substring(0, 200),
        recommendation: 'hold',
        riskLevel: 'medium',
        timestamp: Date.now(),
      }
    }
  }

  /**
   * 整合策略信号和 LLM 分析
   */
  async generateFinalSignal(
    context: MarketContext,
    strategySignal: 'buy' | 'sell' | 'hold',
    providerId?: string
  ): Promise<{
    action: 'buy_yes' | 'buy_no' | 'hold'
    confidence: number
    reasoning: string
  } | null> {
    const llmAnalysis = await this.analyze(context, providerId)

    if (!llmAnalysis) {
      // LLM 不可用，使用策略信号
      return {
        action: strategySignal === 'buy' ? 'buy_yes' :
                strategySignal === 'sell' ? 'buy_no' : 'hold',
        confidence: 0.5,
        reasoning: 'Strategy signal only (LLM unavailable)',
      }
    }

    // 整合策略和 LLM 信号
    const strategyWeight = 0.4
    const llmWeight = 0.6

    const strategyScore = strategySignal === 'buy' ? 1 :
                         strategySignal === 'sell' ? -1 : 0
    const llmScore = llmAnalysis.recommendation === 'buy_yes' ? 1 :
                    llmAnalysis.recommendation === 'buy_no' ? -1 : 0

    const combinedScore = (strategyScore * strategyWeight) +
                         (llmScore * llmWeight * llmAnalysis.confidence)

    let action: 'buy_yes' | 'buy_no' | 'hold'
    if (combinedScore > 0.3) {
      action = 'buy_yes'
    } else if (combinedScore < -0.3) {
      action = 'buy_no'
    } else {
      action = 'hold'
    }

    return {
      action,
      confidence: Math.abs(combinedScore),
      reasoning: `Strategy: ${strategySignal} | LLM: ${llmAnalysis.sentiment} (${llmAnalysis.reasoning})`,
    }
  }
}

export const llmService = new LLMService()
export default llmService