import { Market, PredictionResult } from '@/types'

export interface StrategyStats {
  totalTrades: number
  winRate: number
  totalPnl: number
  avgHoldTime: number
}

export abstract class BaseStrategy {
  abstract name: string
  abstract description: string
  abstract strategyType: 'mechanical' | 'ai' | 'arbitrage'
  
  enabled: boolean = false
  protected config: Record<string, any> = {}
  
  abstract initialize(): Promise<void>
  abstract start(): Promise<void>
  abstract stop(): Promise<void>
  abstract getStats(): StrategyStats
  
  // 事件发射器
  private eventHandlers: Map<string, Function[]> = new Map()
  
  on(event: string, handler: Function): void {
    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, [])
    }
    this.eventHandlers.get(event)!.push(handler)
  }
  
  emit(event: string, data: any): void {
    const handlers = this.eventHandlers.get(event) || []
    handlers.forEach(handler => handler(data))
  }
  
  // 通用市场过滤
  protected isMarketEligible(market: Market): boolean {
    if (!market.active || market.closed) return false
    if (market.outcomePrices.length !== 2) return false
    
    const avgPrice = (market.outcomePrices[0] + market.outcomePrices[1]) / 2
    return avgPrice >= 0.4 && avgPrice <= 0.6
  }
  
  // 通用仓位计算
  protected calculatePositionSize(capital: number, confidence: number, maxPercent: number): number {
    const baseSize = capital * (maxPercent / 100)
    const scaledSize = baseSize * confidence
    return scaledSize
  }
}