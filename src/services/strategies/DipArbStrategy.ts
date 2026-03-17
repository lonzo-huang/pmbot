import { BaseStrategy, StrategyStats } from './BaseStrategy'
import { Market, Position, Order, ActivityLog } from '@/types'
import { TradingService } from '../trading/TradingService'
import { RealtimeService, PriceUpdate } from '../realtime/RealtimeService'
import { DipDetector, DipSignal } from './DipDetector'
import { WalletService } from '../wallet/WalletService'
import { LLMService } from '../llm/LLMService'

// Trading fee constant (Polymarket 2% per side, 4% total for round-trip)
const TRADING_FEE_PERCENT = 0.04

// ===== PROVEN CONFIG (86% ROI in 4 Days) =====
export const DIP_ARB_PROVEN_CONFIG = {
  // Position Sizing
  shares: 25,
  sumTarget: 0.90,           // ✅ 优化：从 0.95 调整为 0.90
                             // Leg1 + Leg2 <= $0.90 = 10% gross profit
                             // 扣除 4% 手续费后 = 6% net profit
  
  // Signal Detection
  slidingWindowMs: 10000,    // 10 second sliding window
  dipThreshold: 0.30,        // 30% price drop triggers Leg1
  windowMinutes: 14,         // Only trade first 14 minutes of 15-min round
  minPricePoints: 3,         // Need 3+ data points before detecting
  
  // Order Execution
  orderType: 'FOK' as const,
  maxSlippage: 0.02,         // 2% max slippage
  executionCooldown: 500,    // 500ms delay between orders
  splitOrders: 1,
  orderIntervalMs: 500,
  
  // Risk Management
  leg2TimeoutSeconds: 60,    // Exit if Leg2 not filled in 60s
  autoMerge: true,           // Auto-convert UP+DOWN → USDC
  autoExecute: true,
  enableSurge: false,
  
  // Market Selection
  underlyings: ['ETH', 'BTC', 'SOL', 'XRP'],
  duration: '15m',
  autoRotate: true,
  
  // Debug
  debug: true,
}

// Failed config - DO NOT USE
export const DIP_ARB_FAILED_CONFIG = {
  shares: 20,
  sumTarget: 0.6,              // TOO AGGRESSIVE
  dipThreshold: 0.01,          // TOO SENSITIVE
  windowMinutes: 15,
}

interface DipArbRound {
  marketId: string
  market: Market
  leg1Executed: boolean
  leg1TokenId: string | null
  leg1Price: number
  leg1Timestamp: number
  leg2Executed: boolean
  leg2TokenId: string | null
  leg2Price: number
  profit?: number
  status: 'waiting_leg1' | 'waiting_leg2' | 'complete' | 'failed'
}

export class DipArbStrategy extends BaseStrategy {
  name = 'Dip Arbitrage'
  description = '15-minute crypto markets - buy dips, hedge, lock profit'
  strategyType = 'mechanical'
  
  private config = DIP_ARB_PROVEN_CONFIG
  private tradingService: TradingService
  private realtimeService: RealtimeService
  private walletService: WalletService
  private dipDetector: DipDetector
  private llmService: LLMService
  
  private currentRound: DipArbRound | null = null
  private subscribedMarkets: Set<string> = new Set()
  private priceHistory: Map<string, number[]> = new Map()
  
  private stats: StrategyStats = {
    totalTrades: 0,
    winRate: 0,
    totalPnl: 0,
    avgHoldTime: 0,
  }
  
  private roundHistory: DipArbRound[] = []
  
  constructor(
    tradingService: TradingService,
    realtimeService: RealtimeService,
    walletService: WalletService
  ) {
    super()
    this.tradingService = tradingService
    this.realtimeService = realtimeService
    this.walletService = walletService
    this.llmService = new LLMService()
    this.dipDetector = new DipDetector(
      this.config.slidingWindowMs,
      this.config.dipThreshold,
      this.config.minPricePoints
    )
    
    this.setupEventListeners()
  }
  
  private setupEventListeners(): void {
    this.realtimeService.on('priceUpdate', (update: PriceUpdate) => {
      this.handlePriceUpdate(update)
    })
    
    this.realtimeService.on('connected', () => {
      this.log('WebSocket connected, resuming dip detection')
      this.resubscribeMarkets()
    })
    
    this.realtimeService.on('disconnected', () => {
      this.log('WebSocket disconnected, pausing dip detection')
    })
  }
  
  async initialize(): Promise<void> {
    this.log('Dip Arbitrage Strategy initialized')
    this.log(`Config: shares=${this.config.shares}, sumTarget=${this.config.sumTarget}, dipThreshold=${this.config.dipThreshold}`)
  }
  
  async start(): Promise<void> {
    if (this.enabled) {
      this.log('Strategy already running')
      return
    }
    
    this.enabled = true
    this.log('Starting Dip Arbitrage Strategy...')
    
    await this.realtimeService.connect()
    await this.findAndSubscribeMarket()
    
    this.emit('strategy:started', { name: this.name })
  }
  
  async stop(): Promise<void> {
    this.enabled = false
    
    if (this.currentRound && this.currentRound.status !== 'complete') {
      this.log('Emergency exit: closing incomplete round')
      await this.emergencyExit()
    }
    
    this.log('Dip Arbitrage Strategy stopped')
    this.emit('strategy:stopped', { name: this.name })
  }
  
  private async findAndSubscribeMarket(): Promise<void> {
    try {
      const market = await this.findActiveMarket()
      
      if (!market) {
        this.log('No eligible market found, retrying in 30s...')
        setTimeout(() => this.findAndSubscribeMarket(), 30000)
        return
      }
      
      await this.subscribeToMarket(market)
      this.log(`Subscribed to market: ${market.question}`)
      
    } catch (error) {
      this.log(`Error finding market: ${error}`)
      setTimeout(() => this.findAndSubscribeMarket(), 30000)
    }
  }
  
  private async findActiveMarket(): Promise<Market | null> {
    const markets = await this.tradingService.getEligibleMarkets({
      underlyings: this.config.underlyings,
      duration: this.config.duration,
      active: true,
    })
    
    for (const market of markets) {
      const timeRemaining = this.getTimeRemaining(market)
      
      if (timeRemaining > 0 && timeRemaining <= this.config.windowMinutes * 60 * 1000) {
        return market
      }
    }
    
    return null
  }
  
  private getTimeRemaining(market: Market): number {
    const endTime = new Date(market.endDate).getTime()
    return endTime - Date.now()
  }
  
  private async subscribeToMarket(market: Market): Promise<void> {
    const tokenIds = market.clobTokenIds
    
    for (const tokenId of tokenIds) {
      if (!this.subscribedMarkets.has(tokenId)) {
        await this.realtimeService.subscribe(tokenId)
        this.subscribedMarkets.add(tokenId)
        this.priceHistory.set(tokenId, [])
      }
    }
  }
  
  private async resubscribeMarkets(): Promise<void> {
    for (const tokenId of this.subscribedMarkets) {
      await this.realtimeService.subscribe(tokenId)
    }
  }
  
  private async handlePriceUpdate(update: PriceUpdate): Promise<void> {
    if (!this.enabled || !this.config.autoExecute) return
    
    const tokenId = update.tokenId
    const price = update.price
    
    // 优化：限制历史记录长度，防止内存溢出
    let history = this.priceHistory.get(tokenId) || []
    history.push(price)
    if (history.length > 50) history = history.slice(-50)
    this.priceHistory.set(tokenId, history)
    
    // Add to dip detector
    this.dipDetector.addPricePoint(tokenId, price)
    
    // Check for dip signal
    if (!this.currentRound || this.currentRound.status === 'complete') {
      const dipSignal = this.dipDetector.detectDip(tokenId)
      
      if (dipSignal && dipSignal.dipPercent >= this.config.dipThreshold) {
        this.log(`🔴 DIP DETECTED: ${tokenId} dropped ${(dipSignal.dipPercent * 100).toFixed(1)}%`)
        await this.executeLeg1(dipSignal)
      }
    }
    
    // Check Leg2 condition
    if (this.currentRound?.leg1Executed && !this.currentRound.leg2Executed) {
      await this.checkLeg2Condition()
    }
    
    // Check Leg2 timeout
    if (this.currentRound?.leg1Executed && !this.currentRound.leg2Executed) {
      const elapsed = Date.now() - this.currentRound.leg1Timestamp
      if (elapsed > this.config.leg2TimeoutSeconds * 1000) {
        this.log(`⚠️ Leg2 timeout (${this.config.leg2TimeoutSeconds}s), starting smart exit...`)
        await this.handleSmartLeg2Timeout()
      }
    }
  }

  /**
   * 智能超时处理：不再是简单的卖出，而是先咨询 LLM 是否应该补单完成对冲
   */
  private async handleSmartLeg2Timeout(): Promise<void> {
    if (!this.currentRound) return
    
    try {
      const leg1Price = this.currentRound.leg1Price
      const oppositeTokenId = this.getOppositeTokenId(this.currentRound.leg1TokenId!)
      const currentOppositePrice = oppositeTokenId ? this.realtimeService.getPrice(oppositeTokenId)?.price : null
      
      if (currentOppositePrice) {
        const currentSum = leg1Price + currentOppositePrice
        
        // 咨询 LLM
        const analysis = await this.llmService.reason<{ action: 'BUY_LEG2' | 'SELL_LEG1' | 'WAIT', reasoning: string }>({
          system: "你是一个交易风控专家。目前抄底策略的第二笔交易(Leg2)超时未成交，导致仓位处于未对冲风险中。",
          prompt: `
            策略: 抄底套利 (Dip Arb)
            Leg1 买入价格: ${leg1Price}
            Leg2 当前市场价格: ${currentOppositePrice}
            当前总成本: ${currentSum} (目标是 <= ${this.config.sumTarget})
            
            如果当前总成本略高于目标但仍有利润空间 (总成本 < 1.0)，可以考虑强制买入 Leg2 完成对冲。
            如果市场波动剧烈且亏损风险极大，请选择 SELL_LEG1 止损。
          `,
          outputSchema: {
            action: { type: 'enum', values: ['BUY_LEG2', 'SELL_LEG1', 'WAIT'] },
            reasoning: { type: 'string' }
          }
        })
        
        this.log(`🤖 LLM 超时建议: ${analysis.action} - ${analysis.reasoning}`)
        
        if (analysis.action === 'BUY_LEG2') {
          await this.executeLeg2(oppositeTokenId!, currentOppositePrice)
          return
        }
      }
      
      // 默认回退到紧急退出逻辑
      await this.handleLeg2Timeout()
    } catch (error) {
      this.log(`❌ Smart timeout error: ${error}, falling back to emergency exit`)
      await this.handleLeg2Timeout()
    }
  }
  
  private async executeLeg1(signal: DipSignal): Promise<void> {
    try {
      this.log(`📈 Executing Leg1: Buy ${signal.tokenId} at $${signal.currentPrice.toFixed(3)}`)
      
      const result = await this.tradingService.createOrder({
        tokenId: signal.tokenId,
        side: 'BUY',
        amount: this.config.shares,
        orderType: 'FOK',
        maxSlippage: this.config.maxSlippage,
      })
      
      if (result.success && result.orderId) {
        this.currentRound = {
          marketId: signal.marketId,
          market: signal.market,
          leg1Executed: true,
          leg1TokenId: signal.tokenId,
          leg1Price: signal.currentPrice,
          leg1Timestamp: Date.now(),
          leg2Executed: false,
          leg2TokenId: null,
          leg2Price: 0,
          status: 'waiting_leg2',
        }
        
        this.log(`✅ Leg1 executed: Order ${result.orderId}`)
        this.emit('leg1:executed', this.currentRound)
        
        // Wait for execution cooldown
        await this.sleep(this.config.executionCooldown)
      } else {
        this.log(`❌ Leg1 failed: ${result.error}`)
        this.emit('leg1:failed', { error: result.error })
      }
    } catch (error) {
      this.log(`❌ Leg1 error: ${error}`)
      this.emit('leg1:error', { error })
    }
  }
  
  private async checkLeg2Condition(): Promise<void> {
    if (!this.currentRound) return
    
    const oppositeTokenId = this.getOppositeTokenId(this.currentRound.leg1TokenId!)
    if (!oppositeTokenId) return
    
    const oppositePrice = this.realtimeService.getPrice(oppositeTokenId)
    if (!oppositePrice) return
    
    const totalCost = this.currentRound.leg1Price + oppositePrice.price
    
    this.log(`📊 Leg2 Check: Leg1=${this.currentRound.leg1Price.toFixed(3)}, Leg2=${oppositePrice.price.toFixed(3)}, Total=${totalCost.toFixed(3)}`)
    
    if (totalCost <= this.config.sumTarget) {
      this.log(`✅ Leg2 condition met! Total cost ${totalCost.toFixed(3)} <= ${this.config.sumTarget}`)
      await this.executeLeg2(oppositeTokenId, oppositePrice.price)
    }
  }
  
  private async executeLeg2(tokenId: string, price: number): Promise<void> {
    try {
      this.log(`📈 Executing Leg2: Buy ${tokenId} at $${price.toFixed(3)}`)
      
      const result = await this.tradingService.createOrder({
        tokenId,
        side: 'BUY',
        amount: this.config.shares,
        orderType: 'FOK',
        maxSlippage: this.config.maxSlippage,
      })
      
      if (result.success && result.orderId) {
        if (this.currentRound) {
          this.currentRound.leg2Executed = true
          this.currentRound.leg2TokenId = tokenId
          this.currentRound.leg2Price = price
          this.currentRound.status = 'complete'
          
          // ✅ 修复：计算净盈亏（扣除手续费）
          const rawProfit = 1.0 - (this.currentRound.leg1Price + this.currentRound.leg2Price)
          const netProfit = rawProfit - TRADING_FEE_PERCENT  // 扣除双边手续费
          this.currentRound.profit = netProfit
          
          this.log(`✅ Leg2 executed: Order ${result.orderId}`)
          this.log(`💰 ROUND COMPLETE: Raw Profit = ${(rawProfit * 100).toFixed(1)}%, Net Profit = ${(netProfit * 100).toFixed(1)}% ($${(netProfit * this.config.shares).toFixed(2)})`)
          
          // Auto-merge positions
          if (this.config.autoMerge) {
            await this.mergePositions(this.currentRound.marketId)
          }
          
          // ✅ 修复：使用净盈亏判断胜负
          this.stats.totalTrades++
          if (netProfit > 0) {
            this.stats.winRate = ((this.stats.winRate * (this.stats.totalTrades - 1) + 1) / this.stats.totalTrades) * 100
          } else {
            this.stats.winRate = (this.stats.winRate * (this.stats.totalTrades - 1)) / this.stats.totalTrades
          }
          // 无论盈亏都累加净盈亏
          this.stats.totalPnl += netProfit * this.config.shares
          
          this.emit('round:complete', this.currentRound)
          
          // Store in history
          this.roundHistory.push({ ...this.currentRound })
          
          // Reset and find next market
          this.currentRound = null
          
          if (this.config.autoRotate) {
            setTimeout(() => this.findAndSubscribeMarket(), 5000)
          }
        }
      } else {
        this.log(`❌ Leg2 failed: ${result.error}`)
        this.emit('leg2:failed', { error: result.error })
      }
    } catch (error) {
      this.log(`❌ Leg2 error: ${error}`)
      this.emit('leg2:error', { error })
    }
  }
  
  private async handleLeg2Timeout(): Promise<void> {
    if (!this.currentRound) return
    
    this.log(`⚠️ Leg2 timeout - initiating emergency exit`)
    
    // Try to sell Leg1 position
    if (this.currentRound.leg1TokenId) {
      const sellResult = await this.tradingService.createOrder({
        tokenId: this.currentRound.leg1TokenId,
        side: 'SELL',
        amount: this.config.shares,
        orderType: 'FAK',
        maxSlippage: 0.05,
      })
      
      if (sellResult.success) {
        this.log(`✅ Emergency sell completed`)
      } else {
        this.log(`❌ Emergency sell failed: ${sellResult.error}`)
      }
    }
    
    this.currentRound.status = 'failed'
    this.emit('round:failed', this.currentRound)
    
    this.currentRound = null
    setTimeout(() => this.findAndSubscribeMarket(), 5000)
  }
  
  private async emergencyExit(): Promise<void> {
    if (!this.currentRound) return
    
    this.log('🚨 EMERGENCY EXIT INITIATED')
    
    // Sell any open positions
    if (this.currentRound.leg1TokenId) {
      await this.tradingService.createOrder({
        tokenId: this.currentRound.leg1TokenId,
        side: 'SELL',
        amount: this.config.shares,
        orderType: 'FAK',
      })
    }
    
    if (this.currentRound.leg2TokenId) {
      await this.tradingService.createOrder({
        tokenId: this.currentRound.leg2TokenId,
        side: 'SELL',
        amount: this.config.shares,
        orderType: 'FAK',
      })
    }
    
    this.currentRound.status = 'failed'
    this.emit('round:emergency_exit', this.currentRound)
  }
  
  private async mergePositions(marketId: string): Promise<void> {
    try {
      this.log('🔄 Merging UP+DOWN tokens to USDC...')
      await this.walletService.mergeCTFTokens(marketId, this.config.shares)
      this.log('✅ Merge complete')
    } catch (error) {
      this.log(`⚠️ Merge failed: ${error}`)
    }
  }
  
  private getOppositeTokenId(tokenId: string): string | null {
    // Find the opposite outcome token in the same market
    for (const [marketId, market] of this.subscribedMarkets) {
      // Implementation depends on market data structure
    }
    return null
  }
  
  private log(message: string): void {
    const timestamp = new Date().toISOString()
    const logEntry: ActivityLog = {
      id: Date.now().toString(),
      timestamp: new Date(),
      type: 'info',
      message: `[DipArb] ${message}`,
    }
    this.emit('log', logEntry)
    console.log(`[${timestamp}] ${message}`)
  }
  
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }
  
  getStats(): StrategyStats {
    return { ...this.stats }
  }
  
  getCurrentRound(): DipArbRound | null {
    return this.currentRound
  }
  
  getRoundHistory(): DipArbRound[] {
    return [...this.roundHistory]
  }
}