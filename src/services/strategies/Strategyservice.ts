/**
 * Polymarket 自动交易策略服务
 *
 * 放置位置: src/services/strategies/StrategyService.ts
 *
 * 包含多种适合预测市场的交易策略
 */

import { MarketData, MarketAnalysis, realtimeService } from '@/services/realtime/RealtimeService'

// ============================================
// 策略类型定义
// ============================================

export interface TradeSignal {
  strategy: string
  asset_id: string
  action: 'buy' | 'sell' | 'hold'
  side: 'yes' | 'no'
  price: number
  size: number
  confidence: number  // 0-1
  reason: string
  timestamp: number
}

export interface StrategyConfig {
  enabled: boolean
  maxPositionSize: number  // 最大持仓金额
  maxLossPercent: number   // 最大亏损百分比
  minConfidence: number    // 最小信心度
  cooldownMs: number       // 冷却时间（毫秒）
}

export interface StrategyState {
  lastTradeTime: number
  totalTrades: number
  totalPnL: number
  positions: Map<string, Position>
}

export interface Position {
  asset_id: string
  side: 'yes' | 'no'
  entryPrice: number
  size: number
  entryTime: number
  unrealizedPnL: number
}

// ============================================
// 策略基类
// ============================================

abstract class BaseStrategy {
  name: string
  config: StrategyConfig
  state: StrategyState

  constructor(name: string, config: Partial<StrategyConfig> = {}) {
    this.name = name
    this.config = {
      enabled: true,
      maxPositionSize: 100,  // $100 USDC
      maxLossPercent: 10,
      minConfidence: 0.5,
      cooldownMs: 5000,  // 5秒冷却
      ...config,
    }
    this.state = {
      lastTradeTime: 0,
      totalTrades: 0,
      totalPnL: 0,
      positions: new Map(),
    }
  }

  abstract analyze(data: MarketData, analysis: MarketAnalysis): TradeSignal | null

  canTrade(): boolean {
    if (!this.config.enabled) return false

    const now = Date.now()
    if (now - this.state.lastTradeTime < this.config.cooldownMs) {
      return false
    }

    return true
  }

  recordTrade(signal: TradeSignal): void {
    this.state.lastTradeTime = Date.now()
    this.state.totalTrades++
  }
}


// ============================================
// 策略 1: 套利策略 (Arbitrage)
// ============================================

export class ArbitrageStrategy extends BaseStrategy {
  private readonly MIN_PROFIT_MARGIN = 0.005  // 0.5% 最小利润

  constructor(config: Partial<StrategyConfig> = {}) {
    super('Arbitrage', config)
  }

  analyze(data: MarketData, analysis: MarketAnalysis): TradeSignal | null {
    if (!this.canTrade()) return null

    // 套利条件：YES价格 + NO价格 < 1.0（扣除手续费后有利润）
    const yesPrice = analysis.bestAsk
    const noPrice = 1 - analysis.bestBid

    const totalCost = yesPrice + noPrice
    const profitMargin = 1 - totalCost

    if (profitMargin > this.MIN_PROFIT_MARGIN) {
      const confidence = Math.min(profitMargin * 10, 1)

      return {
        strategy: this.name,
        asset_id: analysis.asset_id,
        action: 'buy',
        side: 'yes',
        price: yesPrice,
        size: this.config.maxPositionSize / 2,
        confidence,
        reason: `套利机会：总成本 ${(totalCost * 100).toFixed(2)}¢，利润率 ${(profitMargin * 100).toFixed(2)}%`,
        timestamp: Date.now(),
      }
    }

    return null
  }
}


// ============================================
// 策略 2: 订单簿不平衡策略 (Order Book Imbalance)
// ============================================

export class ImbalanceStrategy extends BaseStrategy {
  private readonly IMBALANCE_THRESHOLD = 0.4  // 40% 不平衡触发

  constructor(config: Partial<StrategyConfig> = {}) {
    super('OrderBookImbalance', config)
  }

  analyze(data: MarketData, analysis: MarketAnalysis): TradeSignal | null {
    if (!this.canTrade()) return null
    if (data.type !== 'book') return null

    const { imbalance, spreadPercent, bestBid, bestAsk } = analysis

    // 价差太大不交易
    if (spreadPercent > 3) return null

    if (Math.abs(imbalance) < this.IMBALANCE_THRESHOLD) return null

    const confidence = Math.min(Math.abs(imbalance), 1)

    if (confidence < this.config.minConfidence) return null

    if (imbalance > this.IMBALANCE_THRESHOLD) {
      return {
        strategy: this.name,
        asset_id: analysis.asset_id,
        action: 'buy',
        side: 'yes',
        price: bestAsk,
        size: this.config.maxPositionSize * confidence,
        confidence,
        reason: `买压强劲，不平衡度 ${(imbalance * 100).toFixed(1)}%，预期价格上涨`,
        timestamp: Date.now(),
      }
    } else if (imbalance < -this.IMBALANCE_THRESHOLD) {
      return {
        strategy: this.name,
        asset_id: analysis.asset_id,
        action: 'buy',
        side: 'no',
        price: 1 - bestBid,
        size: this.config.maxPositionSize * confidence,
        confidence,
        reason: `卖压强劲，不平衡度 ${(imbalance * 100).toFixed(1)}%，预期价格下跌`,
        timestamp: Date.now(),
      }
    }

    return null
  }
}


// ============================================
// 策略 3: 价差收窄策略 (Spread Capture / Market Making)
// ============================================

export class SpreadStrategy extends BaseStrategy {
  private readonly MIN_SPREAD_PERCENT = 2
  private readonly MAX_SPREAD_PERCENT = 10

  constructor(config: Partial<StrategyConfig> = {}) {
    super('SpreadCapture', config)
  }

  analyze(data: MarketData, analysis: MarketAnalysis): TradeSignal | null {
    if (!this.canTrade()) return null
    if (data.type !== 'book') return null

    const { spreadPercent, bestBid, bestAsk } = analysis

    if (spreadPercent < this.MIN_SPREAD_PERCENT || spreadPercent > this.MAX_SPREAD_PERCENT) {
      return null
    }

    const expectedProfit = spreadPercent / 2
    const confidence = Math.min(expectedProfit / 5, 1)

    if (confidence < this.config.minConfidence) return null

    const limitPrice = bestBid + (bestAsk - bestBid) * 0.3

    return {
      strategy: this.name,
      asset_id: analysis.asset_id,
      action: 'buy',
      side: 'yes',
      price: limitPrice,
      size: this.config.maxPositionSize * 0.5,
      confidence,
      reason: `价差 ${spreadPercent.toFixed(2)}%，在 ${(limitPrice * 100).toFixed(1)}¢ 挂买单`,
      timestamp: Date.now(),
    }
  }
}


// ============================================
// 策略 4: 均值回归策略 (Mean Reversion)
// ============================================

export class MeanReversionStrategy extends BaseStrategy {
  private readonly LOOKBACK_PERIOD = 20
  private readonly DEVIATION_THRESHOLD = 0.05

  constructor(config: Partial<StrategyConfig> = {}) {
    super('MeanReversion', config)
  }

  analyze(data: MarketData, analysis: MarketAnalysis): TradeSignal | null {
    if (!this.canTrade()) return null

    const priceHistory = realtimeService.getPriceHistory(analysis.asset_id)

    if (priceHistory.length < this.LOOKBACK_PERIOD) {
      return null
    }

    const recentPrices = priceHistory.slice(-this.LOOKBACK_PERIOD)
    const sma = recentPrices.reduce((a, b) => a + b, 0) / recentPrices.length

    const currentPrice = analysis.midPrice
    const deviation = (currentPrice - sma) / sma

    if (Math.abs(deviation) < this.DEVIATION_THRESHOLD) {
      return null
    }

    const confidence = Math.min(Math.abs(deviation) * 5, 1)

    if (confidence < this.config.minConfidence) return null

    if (deviation > this.DEVIATION_THRESHOLD) {
      return {
        strategy: this.name,
        asset_id: analysis.asset_id,
        action: 'buy',
        side: 'no',
        price: 1 - analysis.bestBid,
        size: this.config.maxPositionSize * confidence,
        confidence,
        reason: `价格高于均值 ${(deviation * 100).toFixed(1)}%，预期回归`,
        timestamp: Date.now(),
      }
    } else {
      return {
        strategy: this.name,
        asset_id: analysis.asset_id,
        action: 'buy',
        side: 'yes',
        price: analysis.bestAsk,
        size: this.config.maxPositionSize * confidence,
        confidence,
        reason: `价格低于均值 ${(deviation * 100).toFixed(1)}%，预期反弹`,
        timestamp: Date.now(),
      }
    }
  }
}


// ============================================
// 策略 5: 动量策略 (Momentum)
// ============================================

export class MomentumStrategy extends BaseStrategy {
  private readonly LOOKBACK_PERIOD = 10
  private readonly MOMENTUM_THRESHOLD = 0.02

  constructor(config: Partial<StrategyConfig> = {}) {
    super('Momentum', config)
  }

  analyze(data: MarketData, analysis: MarketAnalysis): TradeSignal | null {
    if (!this.canTrade()) return null

    const priceHistory = realtimeService.getPriceHistory(analysis.asset_id)

    if (priceHistory.length < this.LOOKBACK_PERIOD + 1) {
      return null
    }

    const currentPrice = priceHistory[priceHistory.length - 1]
    const oldPrice = priceHistory[priceHistory.length - this.LOOKBACK_PERIOD - 1]
    const momentum = (currentPrice - oldPrice) / oldPrice

    if (Math.abs(momentum) < this.MOMENTUM_THRESHOLD) {
      return null
    }

    const confidence = Math.min(Math.abs(momentum) * 10, 1)

    if (confidence < this.config.minConfidence) return null

    if (momentum > this.MOMENTUM_THRESHOLD) {
      return {
        strategy: this.name,
        asset_id: analysis.asset_id,
        action: 'buy',
        side: 'yes',
        price: analysis.bestAsk,
        size: this.config.maxPositionSize * confidence,
        confidence,
        reason: `上涨动量 ${(momentum * 100).toFixed(1)}%，跟随趋势`,
        timestamp: Date.now(),
      }
    } else {
      return {
        strategy: this.name,
        asset_id: analysis.asset_id,
        action: 'buy',
        side: 'no',
        price: 1 - analysis.bestBid,
        size: this.config.maxPositionSize * confidence,
        confidence,
        reason: `下跌动量 ${(momentum * 100).toFixed(1)}%，跟随趋势`,
        timestamp: Date.now(),
      }
    }
  }
}


// ============================================
// 策略管理器
// ============================================

export class StrategyManager {
  private strategies: Map<string, BaseStrategy> = new Map()
  private signalHandlers: Set<(signal: TradeSignal) => void> = new Set()
  private isRunning = false
  private unsubscribe: (() => void) | null = null

  constructor() {
    // 初始化所有策略
    this.addStrategy(new ArbitrageStrategy())
    this.addStrategy(new ImbalanceStrategy())
    this.addStrategy(new SpreadStrategy())
    this.addStrategy(new MeanReversionStrategy())
    this.addStrategy(new MomentumStrategy())
  }

  addStrategy(strategy: BaseStrategy): void {
    this.strategies.set(strategy.name, strategy)
    console.log(`[StrategyManager] 添加策略: ${strategy.name}`)
  }

  removeStrategy(name: string): void {
    this.strategies.delete(name)
  }

  enableStrategy(name: string): void {
    const strategy = this.strategies.get(name)
    if (strategy) {
      strategy.config.enabled = true
      console.log(`[StrategyManager] 启用策略: ${name}`)
    }
  }

  disableStrategy(name: string): void {
    const strategy = this.strategies.get(name)
    if (strategy) {
      strategy.config.enabled = false
      console.log(`[StrategyManager] 禁用策略: ${name}`)
    }
  }

  getStrategies(): Array<{ name: string; enabled: boolean; config: StrategyConfig }> {
    return Array.from(this.strategies.values()).map(s => ({
      name: s.name,
      enabled: s.config.enabled,
      config: s.config,
    }))
  }

  /**
   * 启动策略引擎
   */
  start(): void {
    if (this.isRunning) return

    this.isRunning = true
    console.log('[StrategyManager] 🚀 策略引擎启动')

    // 订阅实时数据
    this.unsubscribe = realtimeService.onStrategy((data: MarketData, analysis: MarketAnalysis) => {
      this.processData(data, analysis)
    })
  }

  /**
   * 停止策略引擎
   */
  stop(): void {
    this.isRunning = false
    if (this.unsubscribe) {
      this.unsubscribe()
      this.unsubscribe = null
    }
    console.log('[StrategyManager] ⏹️ 策略引擎停止')
  }

  /**
   * 处理市场数据
   */
  private processData(data: MarketData, analysis: MarketAnalysis): void {
    if (!this.isRunning) return

    for (const [name, strategy] of this.strategies) {
      if (!strategy.config.enabled) continue

      try {
        const signal = strategy.analyze(data, analysis)

        if (signal && signal.confidence >= strategy.config.minConfidence) {
          console.log(`[StrategyManager] 📊 ${name} 产生信号:`, signal.reason)

          strategy.recordTrade(signal)

          this.signalHandlers.forEach(handler => {
            try {
              handler(signal)
            } catch (e) {
              console.error('[StrategyManager] 信号处理器错误:', e)
            }
          })
        }
      } catch (error) {
        console.error(`[StrategyManager] 策略 ${name} 执行错误:`, error)
      }
    }
  }

  /**
   * 订阅交易信号
   */
  onSignal(handler: (signal: TradeSignal) => void): () => void {
    this.signalHandlers.add(handler)
    return () => this.signalHandlers.delete(handler)
  }
}

// 导出单例
export const strategyManager = new StrategyManager()