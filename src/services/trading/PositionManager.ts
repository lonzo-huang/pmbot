import { Position, AutoSellConfig, ActivityLog } from '@/types'
import { TradingService } from './TradingService'
import { DataClient } from '../api/DataClient'
import { RealtimeService } from '../realtime/RealtimeService'

export const DEFAULT_AUTO_SELL_CONFIG: AutoSellConfig = {
  enabled: true,
  lossThreshold: 0.15,        // 15% stop loss
  profitThreshold: 0.30,      // 30% take profit
  oddsMovementThreshold: 0.15,
  maxHoldTime: 24 * 60 * 60 * 1000,  // 24 hours
  timeBasedExit: true,
  trailingStopEnabled: false,
  trailingStopDistance: 0.05,
}

interface PendingSell {
  tokenId: string
  timestamp: number
  reason: string
}

export class PositionManager {
  private dataClient: DataClient
  private tradingService: TradingService
  private realtimeService: RealtimeService
  
  private positions: Map<string, Position> = new Map()
  private positionHistory: Position[] = []
  private pendingSells: Map<string, PendingSell> = new Map()
  
  private autoSellConfig: AutoSellConfig = DEFAULT_AUTO_SELL_CONFIG
  private monitorInterval: NodeJS.Timeout | null = null
  private readonly MONITOR_INTERVAL_MS = 5000
  
  private walletAddress: string | null = null
  
  constructor(
    dataClient: DataClient,
    tradingService: TradingService,
    realtimeService: RealtimeService
  ) {
    this.dataClient = dataClient
    this.tradingService = tradingService
    this.realtimeService = realtimeService
    
    this.setupRealtimeUpdates()
  }
  
  private setupRealtimeUpdates(): void {
    this.realtimeService.on('priceUpdate', (update) => {
      this.updatePositionPrice(update.tokenId, update.price)
    })
  }
  
  async setWalletAddress(address: string): Promise<void> {
    this.walletAddress = address
    await this.refreshPositions()
  }
  
  async refreshPositions(): Promise<void> {
    if (!this.walletAddress) return
    
    try {
      const apiPositions = await this.dataClient.getPositions(this.walletAddress)
      
      for (const apiPos of apiPositions) {
        if (apiPos.size <= 0.01) continue
        
        // Skip recently sold positions (blockchain lag handling)
        if (this.pendingSells.has(apiPos.asset)) {
          const pending = this.pendingSells.get(apiPos.asset)!
          if (Date.now() - pending.timestamp < 5 * 60 * 1000) {
            continue
          }
          this.pendingSells.delete(apiPos.asset)
        }
        
        const position = await this.convertToPosition(apiPos)
        if (position) {
          this.positions.set(position.tokenId, position)
        }
      }
    } catch (error) {
      console.error('Failed to refresh positions:', error)
    }
  }
  
  private async convertToPosition(apiPos: any): Promise<Position | null> {
    try {
      const marketDetails = await this.dataClient.getMarketDetails(apiPos.conditionId)
      
      if (!marketDetails) return null
      
      const outcomeIndex = apiPos.outcomeIndex || 0
      const outcome = marketDetails.outcomes[outcomeIndex] || 'Unknown'
      
      return {
        tokenId: apiPos.asset,
        marketId: apiPos.conditionId,
        marketQuestion: apiPos.title || marketDetails.question,
        outcome,
        outcomeIndex,
        size: apiPos.size,
        entryPrice: apiPos.avgPrice,
        currentPrice: apiPos.curPrice || apiPos.avgPrice,
        pnl: {
          dollar: apiPos.cashPnl || 0,
          percent: apiPos.percentPnl || 0,
        },
        entryTime: new Date(),
        lastUpdate: new Date(),
        autoSellSettings: { ...this.autoSellConfig },
      }
    } catch (error) {
      console.error('Failed to convert position:', error)
      return null
    }
  }
  
  startMonitoring(): void {
    if (this.monitorInterval) return
    
    this.monitorInterval = setInterval(async () => {
      await this.monitorPositions()
    }, this.MONITOR_INTERVAL_MS)
    
    console.log('[PositionManager] Started monitoring')
  }
  
  stopMonitoring(): void {
    if (this.monitorInterval) {
      clearInterval(this.monitorInterval)
      this.monitorInterval = null
    }
    console.log('[PositionManager] Stopped monitoring')
  }
  
  private async monitorPositions(): Promise<void> {
    await this.refreshPositions()
    
    for (const [tokenId, position] of this.positions.entries()) {
      try {
        const shouldSell = await this.checkAutoSellConditions(position)
        
        if (shouldSell) {
          console.log(`[PositionManager] Auto-selling ${tokenId}`)
          await this.sellPosition(tokenId)
        }
      } catch (error) {
        console.error(`[PositionManager] Error monitoring ${tokenId}:`, error)
      }
    }
    
    // Clean up old pending sells
    this.cleanupPendingSells()
  }
  
  private async checkAutoSellConditions(position: Position): Promise<boolean> {
    const settings = position.autoSellSettings || this.autoSellConfig
    
    if (!settings.enabled) return false
    
    // Check profit target
    if (position.pnl.percent >= settings.profitThreshold) {
      console.log(`[AutoSell] Profit target: ${position.pnl.percent.toFixed(2)}% >= ${settings.profitThreshold.toFixed(2)}%`)
      return true
    }
    
    // Check stop loss
    if (position.pnl.percent <= -settings.lossThreshold) {
      console.log(`[AutoSell] Stop loss: ${position.pnl.percent.toFixed(2)}% <= -${settings.lossThreshold.toFixed(2)}%`)
      return true
    }
    
    // Check odds movement
    const oddsChange = Math.abs(position.currentPrice - position.entryPrice) / position.entryPrice
    if (oddsChange >= settings.oddsMovementThreshold) {
      console.log(`[AutoSell] Odds movement: ${oddsChange.toFixed(2)} >= ${settings.oddsMovementThreshold.toFixed(2)}`)
      return true
    }
    
    // Check max hold time
    if (settings.timeBasedExit) {
      const holdTime = Date.now() - position.entryTime.getTime()
      if (holdTime >= settings.maxHoldTime) {
        console.log(`[AutoSell] Max hold time: ${holdTime / 1000 / 60} min`)
        return true
      }
    }
    
    // Check trailing stop
    if (settings.trailingStopEnabled) {
      const highestPrice = this.getHighestPrice(position)
      const currentDrawdown = (highestPrice - position.currentPrice) / highestPrice
      
      if (currentDrawdown >= settings.trailingStopDistance) {
        console.log(`[AutoSell] Trailing stop: ${currentDrawdown.toFixed(2)} >= ${settings.trailingStopDistance.toFixed(2)}`)
        return true
      }
    }
    
    return false
  }
  
  private getHighestPrice(position: Position): number {
    // Track highest price since entry (would need price history)
    return Math.max(position.entryPrice, position.currentPrice)
  }
  
  async sellPosition(tokenId: string, amount?: number): Promise<boolean> {
    const position = this.positions.get(tokenId)
    
    if (!position) {
      console.error(`[PositionManager] Position not found: ${tokenId}`)
      return false
    }
    
    const sellAmount = amount || position.size
    
    try {
      // Mark as pending to prevent re-processing
      this.pendingSells.set(tokenId, {
        tokenId,
        timestamp: Date.now(),
        reason: 'auto-sell',
      })
      
      const result = await this.tradingService.createOrder({
        tokenId,
        side: 'SELL',
        amount: sellAmount,
        orderType: 'FAK',
        price: position.currentPrice,
        maxSlippage: 0.02,
      })
      
      if (result.success) {
        // Move to history
        this.positionHistory.push({
          ...position,
          size: sellAmount,
          lastUpdate: new Date(),
        })
        
        // Remove from active
        this.positions.delete(tokenId)
        
        console.log(`[PositionManager] Sold ${tokenId}: PnL = ${position.pnl.dollar.toFixed(2)} USDC`)
        
        this.emit('position:sold', { position, result })
        return true
      } else {
        this.pendingSells.delete(tokenId)
        console.error(`[PositionManager] Sell failed: ${result.error}`)
        return false
      }
    } catch (error) {
      this.pendingSells.delete(tokenId)
      console.error(`[PositionManager] Sell error:`, error)
      return false
    }
  }
  
  private updatePositionPrice(tokenId: string, price: number): void {
    const position = this.positions.get(tokenId)
    
    if (!position) return
    
    position.currentPrice = price
    position.lastUpdate = new Date()
    position.pnl = this.calculatePnL(position)
  }
  
  private calculatePnL(position: Position): { dollar: number; percent: number } {
    const dollarPnL = (position.currentPrice - position.entryPrice) * position.size
    const percentPnL = (position.currentPrice - position.entryPrice) / position.entryPrice
    
    return { dollar: dollarPnL, percent: percentPnL }
  }
  
  private cleanupPendingSells(): void {
    const cutoff = Date.now() - 10 * 60 * 1000
    
    for (const [tokenId, pending] of this.pendingSells.entries()) {
      if (pending.timestamp < cutoff) {
        this.pendingSells.delete(tokenId)
      }
    }
  }
  
  getActivePositions(): Position[] {
    return Array.from(this.positions.values())
  }
  
  getPositionHistory(): Position[] {
    return [...this.positionHistory]
  }
  
  getTotalPnL(): { realized: number; unrealized: number; total: number } {
    const realized = this.positionHistory.reduce((sum, pos) => sum + pos.pnl.dollar, 0)
    const unrealized = Array.from(this.positions.values()).reduce((sum, pos) => sum + pos.pnl.dollar, 0)
    
    return { realized, unrealized, total: realized + unrealized }
  }
  
  updateAutoSellConfig(config: Partial<AutoSellConfig>): void {
    this.autoSellConfig = { ...this.autoSellConfig, ...config }
    
    // Update all existing positions
    for (const position of this.positions.values()) {
      position.autoSellSettings = { ...this.autoSellConfig }
    }
  }
  
  // Event emitter
  private eventHandlers: Map<string, Function[]> = new Map()
  
  on(event: string, handler: Function): void {
    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, [])
    }
    this.eventHandlers.get(event)!.push(handler)
  }
  
  private emit(event: string, data: any): void {
    const handlers = this.eventHandlers.get(event) || []
    handlers.forEach(handler => handler(data))
  }
}