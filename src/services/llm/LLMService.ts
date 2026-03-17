/**
 * LLM 市场分析服务 - 增强版
 * 放置位置：src/services/llm/LLMService.ts
 * 功能：整合多个 AI API，支持结构化推理和自主决策
 */

import apiConfigManager from '@/services/api/ApiConfigManager'
import { MarketAnalysis } from '@/services/realtime/RealtimeService'

// ============================================
// 类型定义
// ============================================

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

// ✅ 新增：结构化推理的 JSON Schema 类型
export type JsonSchemaType = 'string' | 'number' | 'boolean' | 'enum' | 'object' | 'array'

export interface JsonSchemaField {
  type: JsonSchemaType
  values?: string[]  // for enum
  min?: number       // for number
  max?: number       // for number
  optional?: boolean
  description?: string
}

export interface JsonSchema {
  [key: string]: JsonSchemaField
}

// ✅ 新增：reason 方法的参数类型
export interface ReasonParams {
  system: string
  prompt: string
  outputSchema?: JsonSchema
  model?: string
  providerId?: string
  temperature?: number
  maxTokens?: number
}

// ============================================
// LLM 服务类
// ============================================

export class LLMService {
  // 原有提示模板
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

  // ✅ 新增：结构化推理的 Schema 提示模板
  private readonly SCHEMA_PROMPT = `
## Output Format Requirements
You MUST respond with a valid JSON object matching this schema. Do not include any other text.

Schema:
{schema}

Example output:
{example}
`.trim()

  // 提供商配置映射
  private readonly PROVIDER_CONFIGS: Record<string, { endpoint: string; authHeader: string }> = {
    openrouter: {
      endpoint: 'https://openrouter.ai/api/v1/chat/completions',
      authHeader: 'Authorization'
    },
    openai: {
      endpoint: 'https://api.openai.com/v1/chat/completions',
      authHeader: 'Authorization'
    },
    anthropic: {
      endpoint: 'https://api.anthropic.com/v1/messages',
      authHeader: 'x-api-key'
    },
    google: {
      endpoint: 'https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent',
      authHeader: 'Authorization'
    }
  }

  // ============================================
  // 原有方法：市场情绪分析
  // ============================================

  async analyze(
    context: MarketContext,
    providerId?: string
  ): Promise<LLMAnalysis | null> {
    try {
      const config = await apiConfigManager.getProviderConfig(providerId || 'openrouter')
      if (!config?.apiKey) {
        console.warn('[LLMService] No API key configured')
        return null
      }

      const prompt = this.buildPrompt(context)
      const response = await this.callLLM(
        { ...config, providerId: config.providerId }, 
        prompt
      )
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

  // ============================================
  // ✅ 新增：结构化推理方法 (OpenClaw 核心)
  // ============================================

  /**
   * 结构化推理 - 支持 JSON Schema 约束输出
   * 用于自主决策场景，确保 LLM 输出可解析的结构化数据
   */
  async reason<T>(params: ReasonParams): Promise<T> {
    const {
      system,
      prompt,
      outputSchema,
      model,
      providerId = 'openrouter',
      temperature = 0.3,
      maxTokens = 1000
    } = params

    try {
      const config = await apiConfigManager.getProviderConfig(providerId)
      if (!config?.apiKey) {
        throw new Error(`[LLMService] No API key for provider: ${providerId}`)
      }

      // 构建带 Schema 约束的提示词
      const enhancedPrompt = outputSchema
        ? this.buildSchemaPrompt(prompt, outputSchema)
        : prompt

      // 调用 LLM
      const response = await this.callLLM(
        { ...config, providerId: config.providerId }, // ✅ 明确传递 providerId
        enhancedPrompt,
        { system, temperature, maxTokens }
      )

      // 解析并验证响应
      return this.parseStructuredResponse<T>(response, outputSchema)
    } catch (error) {
      console.error('[LLMService] reason 失败:', error)
      throw error
    }
  }

  /**
   * 构建带 Schema 约束的提示词
   */
  private buildSchemaPrompt(userPrompt: string, schema: JsonSchema): string {
    // 生成 Schema 描述
    const schemaDesc = Object.entries(schema).map(([key, field]) => {
      const optional = field.optional ? ' (optional)' : ''
      const desc = field.description ? ` - ${field.description}` : ''

      if (field.type === 'enum') {
        return `  "${key}": ${field.values?.join(' | ')}${optional}${desc}`
      } else if (field.type === 'number') {
        const range = field.min !== undefined && field.max !== undefined
          ? ` (${field.min}-${field.max})`
          : ''
        return `  "${key}": number${range}${optional}${desc}`
      }
      return `  "${key}": ${field.type}${optional}${desc}`
    }).join('\n')

    // 生成示例
    const example: Record<string, any> = {}
    Object.entries(schema).forEach(([key, field]) => {
      if (field.type === 'string') example[key] = 'example text'
      else if (field.type === 'number') example[key] = field.min || 0
      else if (field.type === 'boolean') example[key] = true
      else if (field.type === 'enum' && field.values?.[0]) example[key] = field.values[0]
      else if (field.type === 'object') example[key] = {}
      else if (field.type === 'array') example[key] = []
    })

    return `${userPrompt}

${this.SCHEMA_PROMPT
  .replace('{schema}', `{\n${schemaDesc}\n}`)
  .replace('{example}', JSON.stringify(example, null, 2))}`
  }

  /**
   * 解析结构化响应并验证类型
   */
  private parseStructuredResponse<T>(response: string, schema?: JsonSchema): T {
    try {
      // 提取 JSON 部分
      const jsonMatch = response.match(/\{[\s\S]*\}/)
      const jsonStr = jsonMatch ? jsonMatch[0] : response
      const parsed = JSON.parse(jsonStr)

      // 如果有 Schema，进行基本验证
      if (schema) {
        this.validateSchema(parsed, schema)
      }

      return parsed as T
    } catch (error) {
      console.error('[LLMService] JSON 解析失败:', response.substring(0, 200))
      throw new Error(`Failed to parse LLM response: ${error instanceof Error ? error.message : 'Unknown'}`)
    }
  }

  /**
   * 验证响应是否符合 Schema
   */
  private validateSchema(data: any, schema: JsonSchema): void {
    for (const [key, field] of Object.entries(schema)) {
      // 可选字段跳过
      if (field.optional && data[key] === undefined) continue

      // 必填字段检查
      if (data[key] === undefined) {
        throw new Error(`Missing required field: ${key}`)
      }

      // 类型检查
      if (field.type === 'string' && typeof data[key] !== 'string') {
        throw new Error(`Field ${key} should be string`)
      }
      if (field.type === 'number' && typeof data[key] !== 'number') {
        throw new Error(`Field ${key} should be number`)
      }
      if (field.type === 'boolean' && typeof data[key] !== 'boolean') {
        throw new Error(`Field ${key} should be boolean`)
      }
      if (field.type === 'enum' && field.values && !field.values.includes(data[key])) {
        throw new Error(`Field ${key} should be one of: ${field.values.join(', ')}`)
      }
      if (field.type === 'number' && field.min !== undefined && data[key] < field.min) {
        throw new Error(`Field ${key} should be >= ${field.min}`)
      }
      if (field.type === 'number' && field.max !== undefined && data[key] > field.max) {
        throw new Error(`Field ${key} should be <= ${field.max}`)
      }
    }
  }

  // ============================================
  // 原有方法：调用 LLM API（增强版）
  // ============================================

  private async callLLM(
    config: { apiKey: string; model: string; providerId?: string },
    prompt: string,
    options?: { system?: string; temperature?: number; maxTokens?: number }
  ): Promise<string> {
    const { system, temperature = 0.3, maxTokens = 500 } = options || {}
    
    // ✅ 修复：优先使用 config 中明确指定的 providerId
    // 只有在未指定时才根据模型名称检测，防止 OpenRouter 请求被错误导向直连 Endpoint
    const providerId = config.providerId || this.detectProvider(config.model)
    const providerConfig = this.PROVIDER_CONFIGS[providerId] || this.PROVIDER_CONFIGS.openrouter

    // 构建请求体
    const requestBody = this.buildRequestBody(providerId, {
      model: config.model,
      messages: [
        ...(system ? [{ role: 'system' as const, content: system }] : []),
        { role: 'user' as const, content: prompt }
      ],
      temperature,
      max_tokens: maxTokens,
    })

    // 构建请求头
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    }

    if (providerConfig.authHeader === 'Authorization') {
      headers['Authorization'] = `Bearer ${config.apiKey}`
    } else if (providerConfig.authHeader === 'x-api-key') {
      headers['x-api-key'] = config.apiKey
    }

    // OpenRouter 额外头
    if (providerId === 'openrouter') {
      headers['HTTP-Referer'] = window.location.origin
      headers['X-Title'] = 'Polymarket LLM Bot'
    }

    // 执行请求（带重试）
    const maxRetries = 3
    let lastError: Error | null = null

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const endpoint = providerConfig.endpoint.replace('{model}', config.model)
        const response = await fetch(endpoint, {
          method: 'POST',
          headers,
          body: JSON.stringify(requestBody),
        })

        if (!response.ok) {
          const errorText = await response.text().catch(() => 'Unknown error')
          throw new Error(`LLM API error ${response.status}: ${errorText}`)
        }

        const data = await response.json()
        return this.extractContent(data, providerId)
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error))
        console.warn(`[LLMService] 尝试 ${attempt}/${maxRetries} 失败:`, lastError.message)

        // 指数退避重试
        if (attempt < maxRetries) {
          await new Promise(resolve => setTimeout(resolve, 1000 * attempt))
        }
      }
    }

    throw lastError || new Error('LLM API call failed after retries')
  }

  /**
   * 检测模型对应的提供商
   */
  private detectProvider(model: string): string {
    if (model.includes('claude')) return 'anthropic'
    if (model.includes('gemini')) return 'google'
    if (model.includes('gpt')) return 'openai'
    return 'openrouter'  // 默认
  }

  /**
   * 构建不同提供商的请求体
   */
  private buildRequestBody(providerId: string, base: any): any {
    // ✅ 修复：如果是 OpenRouter，确保使用通用的 OpenAI 格式，不进行特殊转换
    if (providerId === 'openrouter') {
      return base
    }

    if (providerId === 'anthropic') {
      // Anthropic 使用不同的消息格式
      return {
        model: base.model,
        messages: base.messages.map((m: any) => ({
          role: m.role === 'assistant' ? 'assistant' : 'user',
          content: m.content
        })),
        max_tokens: base.max_tokens,
        temperature: base.temperature,
      }
    }

    if (providerId === 'google') {
      // Google Gemini 格式
      return {
        contents: base.messages.map((m: any) => ({
          role: m.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: m.content }]
        })),
        generationConfig: {
          temperature: base.temperature,
          maxOutputTokens: base.max_tokens,
        }
      }
    }

    // 默认 (OpenAI/OpenRouter 兼容格式)
    return base
  }

  /**
   * 从不同提供商的响应中提取内容
   */
  private extractContent(data: any, providerId: string): string {
    if (providerId === 'anthropic') {
      return data.content?.[0]?.text || ''
    }

    if (providerId === 'google') {
      return data.candidates?.[0]?.content?.parts?.[0]?.text || ''
    }

    // 默认 (OpenAI/OpenRouter)
    return data.choices?.[0]?.message?.content || ''
  }

  // ============================================
  // 原有方法：解析响应
  // ============================================

  private parseResponse(
    response: string,
    context: MarketContext
  ): LLMAnalysis {
    try {
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

  // ============================================
  // 原有方法：整合策略信号
  // ============================================

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
      return {
        action: strategySignal === 'buy' ? 'buy_yes' :
                strategySignal === 'sell' ? 'buy_no' : 'hold',
        confidence: 0.5,
        reasoning: 'Strategy signal only (LLM unavailable)',
      }
    }

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

// 导出单例
export const llmService = new LLMService()
export default llmService