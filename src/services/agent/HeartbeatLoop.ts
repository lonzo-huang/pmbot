/**
 * 智能体心跳循环 - 自主决策核心
 * 放置位置：src/services/agent/HeartbeatLoop.ts
 * 功能：每分钟执行一次完整决策流程
 */

import { llmService } from '@/services/llm/LLMService'
import { memoryManager, MemoryType } from './MemoryManager'
import { calculateKelly, KellyResult } from '@/utils/kelly'
import { realtimeService } from '@/services/realtime/RealtimeService'
import { tradingService } from '@/services/trading/TradingService'
import { useAppStore } from '@/stores/appStore'

export interface AgentDecision {
  action: 'BUY' | 'SELL' | 'HOLD' | 'WAIT'
  assetId?: string
  side?: 'yes' | 'no'
  size?: number
  price?: number
  confidence: number
  reasoning: string
  kellyResult?: KellyResult
}

export class HeartbeatLoop {
  private intervalId: NodeJS.Timeout | null = null
  private isRunning = false
  private bankroll: number = 1000  // 默认本金 $1000

  constructor() {
    // 构造函数逻辑
  }

  /**
   * 启动心跳循环
   */
  start(intervalMs: number = 60000): void {
    if (this.isRunning) {
      console.log('[HeartbeatLoop] ⚠️ 已在运行')
      return
    }

    this.isRunning = true
    console.log('[HeartbeatLoop] 🫀 心跳启动，间隔:', intervalMs/1000, '秒')

    // 立即执行一次
    this.tick()

    // 设置定时循环
    this.intervalId = setInterval(() => this.tick(), intervalMs)
  }

  /**
   * 停止心跳循环
   */
  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId)
      this.intervalId = null
    }
    this.isRunning = false
    console.log('[HeartbeatLoop] ⏹️ 心跳停止')
  }

  /**
   * 单次心跳执行
   */
  private async tick(): Promise<void> {
    try {
      console.log('[HeartbeatLoop] 🔁 开始决策循环...')

      // 1. 读取上下文
      const [strategy, context, journal] = await Promise.all([
        memoryManager.parseStrategy(),
        memoryManager.read('context'),
        memoryManager.read('journal')
      ])

      // 2. 获取当前市场快照
      const marketSnapshot = this.captureMarketSnapshot()

      // 3. 构建 Prompt
      const prompt = this.buildDecisionPrompt({
        strategy,
        context,
        journal: journal.slice(-2000),  // 只取最近 2000 字符
        market: marketSnapshot,
        positions: useAppStore.getState().positions.active
      })

      // 4. LLM 决策 (增加 Fallback)
      let decision: AgentDecision
      try {
        if (!llmService || typeof llmService.reason !== 'function') {
          throw new Error('LLM Service unavailable')
        }

        decision = await llmService.reason<AgentDecision>({
          system: `你是一个专业的 Polymarket 交易专家。你的策略风格是: ${strategy.style}。`,
          prompt,
          outputSchema: {
            action: { type: 'enum', values: ['BUY', 'SELL', 'HOLD', 'WAIT'] },
            assetId: { type: 'string', optional: true },
            side: { type: 'enum', values: ['yes', 'no'], optional: true },
            size: { type: 'number', optional: true },
            price: { type: 'number', optional: true },
            confidence: { type: 'number', min: 0, max: 1 },
            reasoning: { type: 'string' },
            kellyResult: { type: 'object', optional: true }
          }
        })
      } catch (llmError) {
        console.warn('[HeartbeatLoop] 🤖 LLM 决策失败，切换到本地规则引擎:', llmError)
        decision = this.fallbackRuleBasedDecision(strategy, marketSnapshot)
      }

      console.log('[HeartbeatLoop] 🤖 决策:', decision.action, decision.reasoning)

      // 5. 执行决策（如果需要）
      if (decision.action === 'BUY' || decision.action === 'SELL') {
        await this.executeDecision(decision)
      } else if (decision.action === 'WAIT') {
        console.log('[HeartbeatLoop] 😴 市场状态不明，等待下一轮')
      }

      // 6. 更新上下文
      await this.updateContext(marketSnapshot, decision)

    } catch (error) {
      console.error('[HeartbeatLoop] ❌ 决策循环错误:', error)
      await memoryManager.append('journal', `❌ 决策循环错误: ${error instanceof Error ? error.message : 'Unknown'}`)
    }
  }

  /**
   * 当 LLM 不可用时的备选决策逻辑 (单纯本地策略)
   */
  private fallbackRuleBasedDecision(strategy: any, marketSnapshot: string): AgentDecision {
    const subscribed = realtimeService.getSubscribedAssets()
    if (subscribed.length === 0) {
      return {
        action: 'WAIT',
        confidence: 0,
        reasoning: '没有订阅任何资产，无法决策。'
      }
    }

    // 简单逻辑：如果资产有显著不平衡则触发
    for (const assetId of subscribed) {
      const book = realtimeService.getOrderBook(assetId)
      if (!book) continue

      const bestBid = book.bids[0]?.[0] || 0
      const bestAsk = book.asks[0]?.[0] || 0
      const spread = bestAsk - bestBid
      
      // 这里的逻辑可以根据 strategy.style 调整
      // 简单起见，这里仅做示例：如果价差极小且有流动性
      if (spread > 0 && spread < 0.05) {
        return {
          action: 'HOLD',
          assetId,
          confidence: 0.5,
          reasoning: '本地策略: 市场流动性良好，但方向不明。LLM 离线中。'
        }
      }
    }

    return {
      action: 'WAIT',
      confidence: 0.1,
      reasoning: '本地策略: 市场波动不足以触发规则决策。LLM 离线中。'
    }
  }

  /**
   * 捕获市场快照
   */
  private captureMarketSnapshot(): string {
    const subscribed = realtimeService.getSubscribedAssets()
    const snapshots = subscribed.map(assetId => {
      const book = realtimeService.getOrderBook(assetId)
      if (!book) return null
      return {
        assetId: assetId.substring(0, 16) + '...',
        bestBid: book.bids[0]?.[0],
        bestAsk: book.asks[0]?.[0],
        spread: book.spread,
        midPrice: book.midPrice
      }
    }).filter(Boolean)

    return JSON.stringify(snapshots, null, 2)
  }

  /**
   * 构建决策 Prompt
   */
  private buildDecisionPrompt(data: {
    strategy: any
    context: string
    journal: string
    market: string
    positions: any[]
  }): string {
    return `
## 当前策略配置
${JSON.stringify(data.strategy, null, 2)}

## 市场上下文
${data.context}

## 近期交易记录（最近 10 条）
${data.journal}

## 实时市场快照
${data.market}

## 当前持仓
${JSON.stringify(data.positions.map(p => ({
  market: p.marketId.substring(0, 20) + '...',
  side: p.outcome,
  size: p.amount,
  entry: p.entryPrice,
  current: p.currentPrice,
  pnl: p.pnl
})), null, 2)}

## 任务
基于以上信息，请分析：
1. 当前是否有高置信度的交易机会？
2. 现有持仓是否需要调整（止盈/止损/对冲）？
3. 市场是否有异常信号需要警惕？

请以 JSON 格式输出决策，包含 action(BUY/SELL/HOLD/WAIT)、assetId、side、size、price、confidence(0-1)、reasoning。
`.trim()
  }

  /**
   * 执行决策
   */
  private async executeDecision(decision: AgentDecision): Promise<void> {
    if (!decision.assetId || !decision.side || !decision.size) {
      console.log('[HeartbeatLoop] ⚠️ 决策参数不完整，跳过执行')
      return
    }

    // 1. 凯利公式验证
    const kelly = calculateKelly(
      {
        probability: decision.confidence,
        odds: decision.price || 0.5,
        maxRiskPercent: 0.25
      },
      this.bankroll
    )

    if (!kelly.shouldTrade) {
      console.log('[HeartbeatLoop] 🚫 凯利公式不建议交易:', kelly.reason)
      await memoryManager.append('journal', `🚫 跳过交易: ${kelly.reason}`)
      return
    }

    // 2. 执行交易（纸面或真实）
    const result = await tradingService.createOrder({
      tokenId: decision.assetId,
      side: decision.action === 'BUY' ? 'BUY' : 'SELL',
      amount: Math.min(decision.size, kelly.recommendedSize),  // 取较小值
      orderType: 'GTC',
      price: decision.price,
      reason: `[AI-Agent] ${decision.reasoning}`,
    })

    // 3. 记录执行结果
    await memoryManager.append('journal',
      `✅ 执行 ${decision.action} ${decision.side.toUpperCase()} @ ${decision.price}¢ | 仓位: $${decision.size} | 结果: ${result.success ? '成功' : '失败: ' + result.error}`
    )

    if (result.success) {
      console.log('[HeartbeatLoop] ✅ 交易执行成功:', result.orderId)
    } else {
      console.error('[HeartbeatLoop] ❌ 交易执行失败:', result.error)
    }
  }

  /**
   * 更新市场上下文
   */
  private async updateContext(marketSnapshot: string, decision: AgentDecision): Promise<void> {
    const summary = `
### [${new Date().toLocaleTimeString()}] 决策摘要
- 行动: ${decision.action}
- 置信度: ${(decision.confidence * 100).toFixed(1)}%
- 理由: ${decision.reasoning}
- 市场快照: ${marketSnapshot.substring(0, 200)}...
`
    await memoryManager.append('context', summary, false)
  }

  /**
   * 设置本金（从钱包同步）
   */
  setBankroll(amount: number): void {
    this.bankroll = amount
    console.log(`[HeartbeatLoop] 💰 本金更新: $${amount}`)
  }
}

export const heartbeatLoop = new HeartbeatLoop()