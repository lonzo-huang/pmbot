/**
 * Polymarket 自动交易策略服务
 *
 * 放置位置: src/services/strategies/StrategyService.ts
 *
 * 包含多种适合预测市场的交易策略
 */

import { MarketData, MarketAnalysis, realtimeService } from '@/services/realtime/RealtimeService'
import { binanceBtcService } from '@/services/marketdata/BinanceBtcService'
import { useAppStore } from '@/stores/appStore'

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


export class Btc5mBinaryEVStrategy extends BaseStrategy {
  private readonly T = 300
  private readonly minEntrySec = 60
  private readonly maxEntrySec = 240
  private readonly lateEntrySec = 290
  private readonly evThreshold = 0.05
  private readonly lateEvThreshold = 0.10
  private readonly maxLatePrice = 0.92

  constructor(config: Partial<StrategyConfig> = {}) {
    super('BTC5mBinaryEV', { cooldownMs: 1500, minConfidence: 0.3, ...config })
  }

  analyze(_data: MarketData, analysis: MarketAnalysis): TradeSignal | null {
    if (!this.canTrade()) return null

    const store = useAppStore.getState()
    const market = store.markets.activeMarkets.find(m => (m.assetIds || []).includes(analysis.asset_id))
    if (!market) return null

    const q = (market.question || '').toLowerCase()
    const isBtc = q.includes('bitcoin') || q.includes('btc')
    const is5m = /(5\s*(min|m)\b|5-minute)/i.test(q)
    if (!isBtc || !is5m) return null

    const yesTokenId = market.assetIds?.[0]
    const noTokenId = market.assetIds?.[1]
    if (!yesTokenId || !noTokenId) return null

    const yesAsk = bestAsk(yesTokenId)
    const noAsk = bestAsk(noTokenId)
    if (!yesAsk || !noAsk) return null

    return this.evaluate(yesTokenId, noTokenId, yesAsk, noAsk)
  }

  private evaluate(yesTokenId: string, noTokenId: string, oYes: number, oNo: number): TradeSignal | null {
    const now = Date.now()

    return this.computeSignal(now, yesTokenId, noTokenId, oYes, oNo)
  }

  private computeSignal(now: number, yesTokenId: string, noTokenId: string, oYes: number, oNo: number): TradeSignal | null {
    const snapshot = (this as any)._btcState as any
    if (!snapshot) {
      binanceBtcService.getBtc5mState().then(s => {
        ;(this as any)._btcState = s
      }).catch(() => {})
      return null
    }

    const ageMs = now - (snapshot.updatedAtMs || 0)
    if (ageMs > 5000) {
      binanceBtcService.getBtc5mState().then(s => {
        ;(this as any)._btcState = s
      }).catch(() => {})
      if (ageMs > 60_000) return null
    }

    const startTimeMs = snapshot.startTimeMs
    const startPrice = snapshot.startPrice
    const currentPrice = snapshot.currentPrice
    const sigmaPerSecond = snapshot.sigmaPerSecond

    const elapsedSec = Math.max(0, Math.min(this.T, (now - startTimeMs) / 1000))
    const remainingSec = Math.max(1, this.T - elapsedSec)

    if (elapsedSec < this.minEntrySec) return null
    if (elapsedSec > this.lateEntrySec) return null

    const sigmaRem = sigmaPerSecond * Math.sqrt(remainingSec)
    if (!Number.isFinite(sigmaRem) || sigmaRem <= 0) return null

    const delta = Math.log(currentPrice / startPrice)
    const z = delta / sigmaRem
    const pYes = normalCdf(z)

    const edgeYes = pYes - oYes
    const edgeNo = (1 - pYes) - oNo

    const threshold = elapsedSec <= this.maxEntrySec ? this.evThreshold : this.lateEvThreshold
    const maxPrice = elapsedSec <= this.maxEntrySec ? 0.98 : this.maxLatePrice

    let chosen: { tokenId: string; side: 'yes' | 'no'; price: number; edge: number } | null = null
    if (edgeYes > threshold && oYes <= maxPrice) {
      chosen = { tokenId: yesTokenId, side: 'yes', price: oYes, edge: edgeYes }
    }
    if (edgeNo > threshold && oNo <= maxPrice) {
      if (!chosen || edgeNo > chosen.edge) {
        chosen = { tokenId: noTokenId, side: 'no', price: oNo, edge: edgeNo }
      }
    }
    if (!chosen) return null

    const confidence = clamp(chosen.edge / 0.20, 0, 1)
    const size = Math.max(10, this.config.maxPositionSize * clamp((chosen.edge - threshold) / 0.15, 0.2, 1))

    const reason = [
      `t=${elapsedSec.toFixed(0)}s`,
      `P_yes=${(pYes * 100).toFixed(1)}%`,
      `O_yes=${(oYes * 100).toFixed(1)}¢`,
      `O_no=${(oNo * 100).toFixed(1)}¢`,
      `edge=${(chosen.edge * 100).toFixed(1)}%`,
      `z=${z.toFixed(2)}`,
    ].join(' | ')

    return {
      strategy: this.name,
      asset_id: chosen.tokenId,
      action: 'buy',
      side: chosen.side,
      price: chosen.price,
      size,
      confidence,
      reason,
      timestamp: now,
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
    this.addStrategy(new Btc5mBinaryEVStrategy())
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

function bestAsk(tokenId: string): number | null {
  const book = realtimeService.getOrderBook(tokenId)
  const ask = book?.asks?.[0]?.[0] || 0
  if (ask > 0 && ask < 1) return ask
  const history = realtimeService.getPriceHistory(tokenId)
  const last = history.length > 0 ? history[history.length - 1] : 0
  return last > 0 && last < 1 ? last : null
}

function normalCdf(z: number): number {
  return 0.5 * (1 + erf(z / Math.SQRT2))
}

function erf(x: number): number {
  const sign = x >= 0 ? 1 : -1
  const ax = Math.abs(x)
  const a1 = 0.254829592
  const a2 = -0.284496736
  const a3 = 1.421413741
  const a4 = -1.453152027
  const a5 = 1.061405429
  const p = 0.3275911
  const t = 1 / (1 + p * ax)
  const y = 1 - (((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t) * Math.exp(-ax * ax)
  return sign * y
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v))
}
