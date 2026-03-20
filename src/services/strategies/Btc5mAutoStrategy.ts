/**
 * BTC 5分钟市场自动交易策略
 * 
 * 核心算法：
 * 1. 计算理论概率 P_yes = Φ(ΔlnP / σ_rem)
 * 2. 计算 edge = P_theory - O_market
 * 3. 当 edge > threshold 且在合适时间窗口内时触发信号
 * 
 * 时间窗口策略：
 * - 0-60s: 噪音期，不交易
 * - 60-240s: 甜点区，寻找机会
 * - 240-290s: 高风险高回报区，谨慎交易
 * - 290-300s: 结算风险期，停止交易
 */

import { useAppStore } from '@/stores/appStore'
import { realtimeService } from '@/services/realtime/RealtimeService'
import { binanceBtcService } from '@/services/marketdata/BinanceBtcService'

export interface TradeSignal {
  id: string
  timestamp: number
  type: 'BUY_YES' | 'BUY_NO' | 'HOLD'
  side: 'yes' | 'no' | null
  confidence: number      // 0-1
  edge: number           // 理论优势
  pTheory: number        // 理论概率
  oMarket: number        // 市场价格
  btcPrice: number       // BTC 当前价格
  btcStart: number       // BTC 开盘价
  elapsedSec: number     // 已过时间
  remainingSec: number   // 剩余时间
  reason: string         // 信号原因
  suggestedSize: number  // 建议仓位 (Kelly)
  expectedValue: number  // 期望收益
}

export interface StrategyConfig {
  // 触发阈值
  minEdge: number           // 最小 edge 触发信号 (默认 0.05 = 5%)
  minConfidence: number     // 最小置信度 (默认 0.6)
  
  // 时间窗口
  noiseEndSec: number       // 噪音期结束 (默认 60s)
  sweetSpotEndSec: number   // 甜点区结束 (默认 240s)
  dangerStartSec: number    // 危险期开始 (默认 290s)
  
  // Kelly 公式参数
  maxKellyFraction: number  // 最大 Kelly 比例 (默认 0.25)
  bankroll: number          // 本金
  
  // 其他
  enableAutoTrade: boolean  // 是否启用自动交易
  logSignals: boolean       // 是否记录信号
}

const DEFAULT_CONFIG: StrategyConfig = {
  minEdge: 0.05,
  minConfidence: 0.6,
  noiseEndSec: 60,
  sweetSpotEndSec: 240,
  dangerStartSec: 290,
  maxKellyFraction: 0.25,
  bankroll: 1000,
  enableAutoTrade: false,
  logSignals: true,
}

class Btc5mAutoStrategy {
  private config: StrategyConfig
  private signals: TradeSignal[] = []
  private lastSignalTime: number = 0
  private signalCooldownMs: number = 5000 // 5秒冷却
  private listeners: Array<(signal: TradeSignal) => void> = []
  private intervalId: NodeJS.Timeout | null = null

  constructor(config: Partial<StrategyConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config }
  }

  updateConfig(config: Partial<StrategyConfig>) {
    this.config = { ...this.config, ...config }
  }

  getConfig(): StrategyConfig {
    return { ...this.config }
  }

  getSignals(): TradeSignal[] {
    return [...this.signals]
  }

  onSignal(listener: (signal: TradeSignal) => void): () => void {
    this.listeners.push(listener)
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener)
    }
  }

  private notifyListeners(signal: TradeSignal) {
    this.listeners.forEach(listener => {
      try {
        listener(signal)
      } catch (err) {
        console.error('[Btc5mAutoStrategy] Listener error:', err)
      }
    })
  }

  /**
   * 标准正态分布 CDF
   */
  private normalCdf(z: number): number {
    return 0.5 * (1 + this.erf(z / Math.SQRT2))
  }

  private erf(x: number): number {
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

  /**
   * Kelly 公式计算最优仓位
   * f* = (p*b - q) / b
   * 其中 p = 胜率, q = 1-p, b = 赔率 (odds-1)
   */
  private kellyFraction(pWin: number, odds: number): number {
    if (odds <= 0 || pWin <= 0 || pWin >= 1) return 0
    const pLose = 1 - pWin
    const b = (1 / odds) - 1 // 如果买入价是 0.4，赔率是 2.5:1
    if (b <= 0) return 0
    const kelly = (pWin * b - pLose) / b
    return Math.max(0, Math.min(this.config.maxKellyFraction, kelly))
  }

  /**
   * 分析当前市场状态并生成信号
   */
  async analyze(): Promise<TradeSignal | null> {
    try {
      // 1. 获取 BTC 价格状态
      const btcState = await binanceBtcService.getBtc5mState()
      if (!btcState) {
        return null
      }

      const now = Date.now()
      const elapsedSec = Math.max(0, (now - btcState.startTimeMs) / 1000)
      const remainingSec = Math.max(0, 300 - elapsedSec)

      // 2. 获取市场价格
      const store = useAppStore.getState()
      const activeMarkets = store.markets.activeMarkets || []
      const metadata = store.polymarket.btc5m.metadata

      // 查找匹配的市场
      const yesTokenId = metadata?.assetIds?.[0]
      const noTokenId = metadata?.assetIds?.[1]
      
      const matchingMarket = activeMarkets.find(m =>
        m.assetIds?.includes(yesTokenId!) || m.assetIds?.includes(noTokenId!)
      )

      let oYes: number | null = null
      let oNo: number | null = null

      if (matchingMarket?.outcomePrices?.length >= 2) {
        oYes = parseFloat(String(matchingMarket.outcomePrices[0]))
        oNo = parseFloat(String(matchingMarket.outcomePrices[1]))
      }

      if (oYes === null || oNo === null || isNaN(oYes) || isNaN(oNo)) {
        return null
      }

      // 3. 计算理论概率
      const deltaLnP = Math.log(btcState.currentPrice / btcState.startPrice)
      const sigmaRem = btcState.sigmaPerSecond * Math.sqrt(Math.max(1, remainingSec))
      const z = sigmaRem > 0 ? deltaLnP / sigmaRem : 0
      const pYes = this.normalCdf(z)
      const pNo = 1 - pYes

      // 4. 计算 edge
      const edgeYes = pYes - oYes
      const edgeNo = pNo - oNo

      // 5. 判断时间窗口
      let timeZone: 'noise' | 'sweet' | 'danger' | 'closed' = 'noise'
      if (elapsedSec < this.config.noiseEndSec) {
        timeZone = 'noise'
      } else if (elapsedSec < this.config.sweetSpotEndSec) {
        timeZone = 'sweet'
      } else if (elapsedSec < this.config.dangerStartSec) {
        timeZone = 'danger'
      } else {
        timeZone = 'closed'
      }

      // 6. 生成信号
      let signalType: 'BUY_YES' | 'BUY_NO' | 'HOLD' = 'HOLD'
      let side: 'yes' | 'no' | null = null
      let edge = 0
      let confidence = 0
      let reason = ''
      let suggestedSize = 0
      let expectedValue = 0

      // 不在关闭期交易
      if (timeZone === 'closed') {
        reason = `⚠️ 结算风险期 (${Math.round(elapsedSec)}s)，停止交易`
      }
      // 噪音期需要更高的 edge
      else if (timeZone === 'noise') {
        const noiseThreshold = this.config.minEdge * 2 // 噪音期需要双倍 edge
        if (edgeYes > noiseThreshold) {
          signalType = 'BUY_YES'
          side = 'yes'
          edge = edgeYes
          confidence = Math.min(0.9, edgeYes / 0.3)
          reason = `🔥 噪音期强信号: YES edge=${(edgeYes*100).toFixed(1)}% > ${(noiseThreshold*100).toFixed(1)}%`
        } else if (edgeNo > noiseThreshold) {
          signalType = 'BUY_NO'
          side = 'no'
          edge = edgeNo
          confidence = Math.min(0.9, edgeNo / 0.3)
          reason = `🔥 噪音期强信号: NO edge=${(edgeNo*100).toFixed(1)}% > ${(noiseThreshold*100).toFixed(1)}%`
        } else {
          reason = `⏳ 噪音期 (${Math.round(elapsedSec)}s)，等待更明确信号`
        }
      }
      // 甜点区正常交易
      else if (timeZone === 'sweet') {
        if (edgeYes > this.config.minEdge) {
          signalType = 'BUY_YES'
          side = 'yes'
          edge = edgeYes
          confidence = Math.min(0.95, 0.6 + edgeYes)
          reason = `🎯 甜点区信号: YES edge=${(edgeYes*100).toFixed(1)}%, P_yes=${(pYes*100).toFixed(1)}%`
        } else if (edgeNo > this.config.minEdge) {
          signalType = 'BUY_NO'
          side = 'no'
          edge = edgeNo
          confidence = Math.min(0.95, 0.6 + edgeNo)
          reason = `🎯 甜点区信号: NO edge=${(edgeNo*100).toFixed(1)}%, P_no=${(pNo*100).toFixed(1)}%`
        } else {
          reason = `📊 甜点区监控中: YES edge=${(edgeYes*100).toFixed(1)}%, NO edge=${(edgeNo*100).toFixed(1)}%`
        }
      }
      // 危险期需要更高的理论概率
      else if (timeZone === 'danger') {
        // 在接近结束时，只有当理论概率非常高且市场价格明显滞后时才交易
        const pThreshold = 0.85
        if (pYes > pThreshold && edgeYes > this.config.minEdge) {
          signalType = 'BUY_YES'
          side = 'yes'
          edge = edgeYes
          confidence = pYes
          reason = `⚡ 危险区高概率: YES P=${(pYes*100).toFixed(1)}% > ${(pThreshold*100)}%, edge=${(edgeYes*100).toFixed(1)}%`
        } else if (pNo > pThreshold && edgeNo > this.config.minEdge) {
          signalType = 'BUY_NO'
          side = 'no'
          edge = edgeNo
          confidence = pNo
          reason = `⚡ 危险区高概率: NO P=${(pNo*100).toFixed(1)}% > ${(pThreshold*100)}%, edge=${(edgeNo*100).toFixed(1)}%`
        } else {
          reason = `⚠️ 危险期 (${Math.round(elapsedSec)}s): 概率不够高，观望`
        }
      }

      // 7. 计算建议仓位 (Kelly)
      if (signalType !== 'HOLD' && side) {
        const marketPrice = side === 'yes' ? oYes : oNo
        const theoryProb = side === 'yes' ? pYes : pNo
        suggestedSize = this.kellyFraction(theoryProb, marketPrice) * this.config.bankroll
        expectedValue = edge * suggestedSize
      }

      // 8. 创建信号
      const signal: TradeSignal = {
        id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        timestamp: now,
        type: signalType,
        side,
        confidence,
        edge,
        pTheory: side === 'yes' ? pYes : side === 'no' ? pNo : pYes,
        oMarket: side === 'yes' ? oYes : side === 'no' ? oNo : oYes,
        btcPrice: btcState.currentPrice,
        btcStart: btcState.startPrice,
        elapsedSec,
        remainingSec,
        reason,
        suggestedSize: Math.round(suggestedSize * 100) / 100,
        expectedValue: Math.round(expectedValue * 100) / 100,
      }

      return signal

    } catch (err) {
      console.error('[Btc5mAutoStrategy] Analyze error:', err)
      return null
    }
  }

  /**
   * 启动策略监控
   */
  start(intervalMs: number = 1000) {
    if (this.intervalId) {
      console.log('[Btc5mAutoStrategy] Already running')
      return
    }

    console.log('[Btc5mAutoStrategy] 🚀 策略启动', this.config)

    this.intervalId = setInterval(async () => {
      const signal = await this.analyze()
      if (!signal) return

      // 只记录非 HOLD 信号，或者每 10 秒记录一次 HOLD
      const shouldLog = signal.type !== 'HOLD' || 
        (Date.now() - this.lastSignalTime > 10000)

      if (shouldLog && this.config.logSignals) {
        const icon = signal.type === 'BUY_YES' ? '🟢' : signal.type === 'BUY_NO' ? '🔴' : '⚪'
        console.log(`[Btc5mAutoStrategy] ${icon} ${signal.reason}`)
        
        if (signal.type !== 'HOLD') {
          console.log(`  💰 建议仓位: $${signal.suggestedSize} | 期望收益: $${signal.expectedValue}`)
        }
      }

      // 通知监听器（用于 UI 更新）
      if (signal.type !== 'HOLD') {
        // 检查冷却时间
        if (Date.now() - this.lastSignalTime > this.signalCooldownMs) {
          this.signals.push(signal)
          // 只保留最近 100 个信号
          if (this.signals.length > 100) {
            this.signals = this.signals.slice(-100)
          }
          this.lastSignalTime = Date.now()
          this.notifyListeners(signal)

          // 更新 Store 的 Strategy Signals 计数
          const store = useAppStore.getState()
          if (store.incrementStrategySignals) {
            store.incrementStrategySignals()
          }
        }
      }

    }, intervalMs)
  }

  /**
   * 停止策略监控
   */
  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId)
      this.intervalId = null
      console.log('[Btc5mAutoStrategy] ⏹️ 策略已停止')
    }
  }

  isRunning(): boolean {
    return this.intervalId !== null
  }
}

// 导出单例
export const btc5mAutoStrategy = new Btc5mAutoStrategy()

// 导出类型和默认配置
export { DEFAULT_CONFIG as BTC5M_STRATEGY_DEFAULT_CONFIG }
export type { StrategyConfig as Btc5mStrategyConfig }