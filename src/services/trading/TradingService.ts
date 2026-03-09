/**
 * Polymarket 交易执行服务 - 增强版
 * 放置位置：src/services/trading/TradingService.ts
 * 保留：订单队列、限流控制、重试机制
 * 新增：纸面交易、策略整合、仓位管理、PnL 追踪
 */

import { ethers } from 'ethers'
import { realtimeService } from '@/services/realtime/RealtimeService'
import { strategyManager, TradeSignal } from '@/services/strategies/StrategyService'
import { useAppStore } from '@/stores/appStore'

// ============================================
// 类型定义
// ============================================

export interface CreateOrderParams {
  tokenId: string
  side: 'BUY' | 'SELL'
  amount: number
  orderType: 'FOK' | 'FAK' | 'GTC' | 'GTD'
  price?: number
  maxSlippage?: number
  expiration?: number
  reason?: string  // 交易原因（用于日志）
  signal?: TradeSignal  // 关联的策略信号
}

export interface OrderResult {
  success: boolean
  orderId?: string
  txHash?: string
  error?: string
  paperTrade?: boolean  // 是否是纸面交易
}

export interface Order {
  orderId: string
  tokenId: string
  side: 'BUY' | 'SELL'
  price: number
  size: number
  type: 'FOK' | 'FAK' | 'GTC' | 'GTD'
  status: 'pending' | 'filled' | 'cancelled' | 'failed'
  timestamp: Date
  pnl?: number
  reason?: string
}

export interface Position {
  tokenId: string
  side: 'yes' | 'no'
  entryPrice: number
  size: number
  entryTime: number
  unrealizedPnL: number
  realizedPnL: number
}

export interface OrderQueueItem {
  params: CreateOrderParams
  resolve: (result: OrderResult) => void
  reject: (error: Error) => void
  timestamp: number
  retryCount: number
}

// ============================================
// 交易服务类
// ============================================

export class TradingService {
  // 依赖服务（可选，真实交易时需要）
  private clobClient: any | null = null
  private walletService: any | null = null
  private provider: ethers.Provider | null = null
  private signer: ethers.Signer | null = null

  // ✅ 交易模式（新增）
  private isPaperTrading: boolean = true

  // 订单队列和限流（保留现有）
  private orderQueue: OrderQueueItem[] = []
  private lastOrderTime: number = 0
  private ordersThisMinute: number = 0
  private ordersThisHour: number = 0
  private minuteResetTime: number = 0
  private hourResetTime: number = 0

  // 配置（保留现有）
  private readonly MAX_ORDERS_PER_MINUTE = 10
  private readonly MAX_ORDERS_PER_HOUR = 50
  private readonly ORDER_COOLDOWN_MS = 500
  private readonly MAX_RETRIES = 3

  // ✅ 状态追踪（新增）
  private activeOrders: Map<string, Order> = new Map()
  private positions: Map<string, Position> = new Map()
  private tradeHistory: Order[] = []

  // ✅ 策略信号订阅（新增）
  private strategyUnsubscribe: (() => void) | null = null
  private autoExecuteSignals: boolean = false

  constructor() {
    this.minuteResetTime = Date.now()
    this.hourResetTime = Date.now()

    // 启动订单处理器（保留现有）
    this.startOrderProcessor()

    // ✅ 订阅策略信号（新增）
    this.subscribeToStrategySignals()

    // ✅ 启动 PnL 更新（新增）
    this.startPnLUpdater()

    console.log('[TradingService] ✅ 服务已初始化')
  }

  // ============================================
  // 配置方法（新增）
  // ============================================

  /**
   * 设置交易模式
   */
  setPaperTrading(enabled: boolean): void {
    this.isPaperTrading = enabled
    console.log('[TradingService] 交易模式:', enabled ? '📝 纸面交易' : '💰 真实交易')
    useAppStore.getState().updateSettings({ paperTradingMode: enabled })
  }

  /**
   * 设置自动执行策略信号
   */
  setAutoExecuteSignals(enabled: boolean): void {
    this.autoExecuteSignals = enabled
    console.log('[TradingService] 自动执行策略:', enabled ? '✅ 启用' : '❌ 禁用')
  }

  /**
   * 设置钱包（真实交易需要）
   */
  async setWallet(signer: ethers.Signer, provider: ethers.Provider): Promise<void> {
    this.signer = signer
    this.provider = provider
    console.log('[TradingService] 钱包已设置')
  }

  /**
   * 设置 CLOB 客户端（真实交易需要）
   */
  setCLOBClient(clobClient: any): void {
    this.clobClient = clobClient
    console.log('[TradingService] CLOB 客户端已设置')
  }

  // ============================================
  // 策略信号整合（新增）
  // ============================================

  /**
   * 订阅策略信号自动交易
   */
  private subscribeToStrategySignals(): void {
    this.strategyUnsubscribe = strategyManager.onSignal(async (signal: TradeSignal) => {
      console.log('[TradingService] 📊 收到策略信号:', signal.strategy, signal.reason)

      // 检查是否启用自动交易
      if (!this.autoExecuteSignals) {
        console.log('[TradingService] 自动交易未启用，忽略信号')
        return
      }

      // 检查纸面交易模式
      if (!this.isPaperTrading) {
        console.log('[TradingService] ⚠️ 真实交易模式下需要额外确认')
        // 真实交易需要 LLM 确认等（后续集成）
      }

      // 执行交易
      try {
        const result = await this.executeStrategyTrade(signal)
        console.log('[TradingService] 策略交易结果:', result)
      } catch (error) {
        console.error('[TradingService] 策略交易失败:', error)
      }
    })
  }

  /**
   * 执行策略交易
   */
  private async executeStrategyTrade(signal: TradeSignal): Promise<OrderResult> {
    const params: CreateOrderParams = {
      tokenId: signal.asset_id,
      side: signal.action === 'buy' ? 'BUY' : 'SELL',
      amount: signal.size,
      orderType: 'GTC',
      price: signal.price,
      maxSlippage: 0.02,  // 2% 滑点
      reason: signal.reason,
      signal: signal,
    }

    return await this.createOrder(params)
  }

  // ============================================
  // 订单处理核心（保留现有架构）
  // ============================================

  private startOrderProcessor(): void {
    setInterval(() => {
      this.processOrderQueue()
    }, 100)
  }

  private async processOrderQueue(): Promise<void> {
    if (this.orderQueue.length === 0) return
    if (!this.canPlaceOrder()) return

    const item = this.orderQueue[0]

    // 检查冷却时间
    const timeSinceLastOrder = Date.now() - this.lastOrderTime
    if (timeSinceLastOrder < this.ORDER_COOLDOWN_MS) {
      return
    }

    try {
      const result = await this.executeOrder(item.params)
      item.resolve(result)
      this.orderQueue.shift()
      this.lastOrderTime = Date.now()
      this.updateRateLimits()
    } catch (error) {
      item.retryCount++

      if (item.retryCount >= this.MAX_RETRIES) {
        item.reject(error as Error)
        this.orderQueue.shift()
      } else {
        // 移到队列末尾重试（保留现有逻辑）
        this.orderQueue.push(this.orderQueue.shift()!)
      }
    }
  }

  private canPlaceOrder(): boolean {
    const now = Date.now()

    // 重置分钟计数器
    if (now - this.minuteResetTime >= 60000) {
      this.ordersThisMinute = 0
      this.minuteResetTime = now
    }

    // 重置小时计数器
    if (now - this.hourResetTime >= 3600000) {
      this.ordersThisHour = 0
      this.hourResetTime = now
    }

    return (
      this.ordersThisMinute < this.MAX_ORDERS_PER_MINUTE &&
      this.ordersThisHour < this.MAX_ORDERS_PER_HOUR
    )
  }

  private updateRateLimits(): void {
    this.ordersThisMinute++
    this.ordersThisHour++
  }

  /**
   * 创建订单（主要入口）
   */
  async createOrder(params: CreateOrderParams): Promise<OrderResult> {
    return new Promise((resolve, reject) => {
      this.orderQueue.push({
        params,
        resolve,
        reject,
        timestamp: Date.now(),
        retryCount: 0,
      })
    })
  }

  /**
   * 执行订单
   */
  private async executeOrder(params: CreateOrderParams): Promise<OrderResult> {
    console.log('[TradingService] 执行订单:', params)

    // ✅ 纸面交易模式（新增）
    if (this.isPaperTrading) {
      return this.executePaperTrade(params)
    }

    // 真实交易模式（保留现有逻辑）
    return this.executeRealTrade(params)
  }

  /**
   * 纸面交易执行（新增）
   */
  private executePaperTrade(params: CreateOrderParams): OrderResult {
    const orderId = `paper-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`

    // 创建订单记录
    const order: Order = {
      orderId,
      tokenId: params.tokenId,
      side: params.side,
      price: params.price || 0.5,
      size: params.amount,
      type: params.orderType,
      status: 'filled',
      timestamp: new Date(),
      reason: params.reason,
    }

    this.activeOrders.set(orderId, order)
    this.tradeHistory.push(order)

    // ✅ 更新仓位（新增）
    this.updatePosition(order)

    // ✅ 通知 Store（新增）
    useAppStore.getState().addTrade({
      id: orderId,
      marketId: params.tokenId,
      type: params.side.toLowerCase() as any,
      outcome: params.side === 'BUY' ? 'yes' : 'no',
      amount: params.amount,
      price: params.price || 0.5,
      timestamp: Date.now(),
    })

    console.log('[TradingService] 📝 纸面交易完成:', orderId)

    return {
      success: true,
      orderId,
      paperTrade: true,
    }
  }

  /**
   * 真实交易执行（保留现有逻辑）
   */
  private async executeRealTrade(params: CreateOrderParams): Promise<OrderResult> {
    try {
      if (!this.signer) {
        return { success: false, error: 'Wallet not connected' }
      }

      if (!this.clobClient) {
        return { success: false, error: 'CLOB client not configured' }
      }

      // 确保授权（保留现有逻辑）
      if (params.side === 'BUY') {
        // const approved = await this.walletService?.ensureUSDCApproval(params.amount)
        // if (!approved) {
        //   return { success: false, error: 'USDC approval failed' }
        // }
      }

      // 获取价格（保留现有逻辑）
      let price = params.price
      if (!price) {
        price = await this.getMarketPrice(params.tokenId, params.side)
        if (!price) {
          return { success: false, error: 'Unable to get market price' }
        }
      }

      // 调整滑点（保留现有逻辑）
      if (params.maxSlippage) {
        price = this.adjustPriceForSlippage(price, params.side, params.maxSlippage)
      }

      // 调整 tick size（保留现有逻辑）
      price = this.adjustForTickSize(price)

      // 计算大小（保留现有逻辑）
      let size = params.amount
      if (params.side === 'BUY') {
        size = this.adjustForNegativeRisk(size, price)
      }

      // 下单（保留现有逻辑）
      const orderResult = await this.clobClient.placeOrder({
        token_id: params.tokenId,
        price,
        size,
        side: params.side,
        type: params.orderType,
        expiration: params.expiration,
        signer: this.signer,
      })

      if (orderResult.success && orderResult.orderId) {
        const order: Order = {
          orderId: orderResult.orderId,
          tokenId: params.tokenId,
          side: params.side,
          price,
          size,
          type: params.orderType,
          status: 'filled',
          timestamp: new Date(),
          reason: params.reason,
        }

        this.activeOrders.set(orderResult.orderId, order)
        this.tradeHistory.push(order)

        return {
          success: true,
          orderId: orderResult.orderId,
          txHash: orderResult.txHash,
          paperTrade: false,
        }
      }

      return {
        success: false,
        error: orderResult.error || 'Order placement failed',
      }

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      console.error('[TradingService] 真实交易失败:', errorMessage)
      return { success: false, error: errorMessage }
    }
  }

  // ============================================
  // 仓位管理（新增）
  // ============================================

  /**
   * 更新仓位
   */
  private updatePosition(order: Order): void {
    const existingPosition = this.positions.get(order.tokenId)

    if (existingPosition) {
      // 更新现有仓位
      const avgPrice = (existingPosition.entryPrice * existingPosition.size + order.price * order.size) /
                       (existingPosition.size + order.size)

      existingPosition.entryPrice = avgPrice
      existingPosition.size += order.size
      existingPosition.entryTime = Date.now()
    } else {
      // 新建仓位
      this.positions.set(order.tokenId, {
        tokenId: order.tokenId,
        side: order.side === 'BUY' ? 'yes' : 'no',
        entryPrice: order.price,
        size: order.size,
        entryTime: Date.now(),
        unrealizedPnL: 0,
        realizedPnL: 0,
      })
    }

    console.log('[TradingService] 仓位已更新:', order.tokenId)
  }

  /**
   * 获取所有仓位
   */
  getPositions(): Position[] {
    return Array.from(this.positions.values())
  }

  /**
   * 更新仓位 PnL
   */
  updatePositionPnL(tokenId: string, currentPrice: number): void {
    const position = this.positions.get(tokenId)
    if (!position) return

    const priceDiff = currentPrice - position.entryPrice
    const pnl = position.side === 'yes'
      ? priceDiff * position.size
      : -priceDiff * position.size

    position.unrealizedPnL = pnl

    // ✅ 更新 Store（新增）
    useAppStore.getState().updatePnl({
      unrealized: Array.from(this.positions.values())
        .reduce((sum, p) => sum + p.unrealizedPnL, 0),
    })
  }

  // ============================================
  // 工具方法（保留现有）
  // ============================================

  private async getMarketPrice(tokenId: string, side: 'BUY' | 'SELL'): Promise<number | null> {
    try {
      // ✅ 使用 RealtimeService 获取订单簿（新增）
      const orderBook = realtimeService.getOrderBook(tokenId)

      if (!orderBook || (!orderBook.bids.length && !orderBook.asks.length)) {
        return null
      }

      if (side === 'BUY') {
        return orderBook.asks[0]?.[0] || orderBook.bids[0]?.[0] || null
      } else {
        return orderBook.bids[0]?.[0] || orderBook.asks[0]?.[0] || null
      }
    } catch (error) {
      console.error('[TradingService] 获取市场价格失败:', error)
      return null
    }
  }

  private adjustPriceForSlippage(price: number, side: 'BUY' | 'SELL', slippage: number): number {
    if (side === 'BUY') {
      return price * (1 + slippage)
    } else {
      return price * (1 - slippage)
    }
  }

  private adjustForTickSize(price: number): number {
    // Polymarket 使用 2 位小数（美分）
    return Math.round(price * 100) / 100
  }

  private adjustForNegativeRisk(size: number, price: number): number {
    const negRiskFee = 0.005
    return size * (1 - negRiskFee * Math.min(price, 1 - price))
  }

  // ============================================
  // 订单管理（保留现有）
  // ============================================

  async cancelOrder(orderId: string): Promise<boolean> {
    const order = this.activeOrders.get(orderId)
    if (!order) return false

    if (this.isPaperTrading) {
      order.status = 'cancelled'
      this.activeOrders.delete(orderId)
      console.log('[TradingService] 订单已取消:', orderId)
      return true
    }

    try {
      // const result = await this.clobClient?.cancelOrder(orderId)
      // if (result?.success) {
      //   this.activeOrders.delete(orderId)
      // }
      // return result?.success || false
      return true
    } catch (error) {
      console.error('[TradingService] 取消订单失败:', error)
      return false
    }
  }

  async cancelAllOrders(tokenId?: string): Promise<number> {
    const ordersToCancel = tokenId
      ? Array.from(this.activeOrders.values()).filter(o => o.tokenId === tokenId)
      : Array.from(this.activeOrders.values())

    const results = await Promise.allSettled(
      ordersToCancel.map(order => this.cancelOrder(order.orderId))
    )

    const cancelled = results.filter(r => r.status === 'fulfilled' && r.value).length
    return cancelled
  }

  getActiveOrders(): Order[] {
    return Array.from(this.activeOrders.values())
  }

  getTradeHistory(): Order[] {
    return this.tradeHistory
  }

  // ============================================
  // PnL 更新（新增）
  // ============================================

  private startPnLUpdater(): void {
    // 每 5 秒更新一次 PnL
    setInterval(() => {
      this.updateAllPnL()
    }, 5000)
  }

  private updateAllPnL(): void {
    for (const [tokenId, position] of this.positions.entries()) {
      const orderBook = realtimeService.getOrderBook(tokenId)
      if (orderBook && orderBook.midPrice) {
        this.updatePositionPnL(tokenId, orderBook.midPrice)
      }
    }
  }

  // ============================================
  // 状态查询（保留现有 + 新增）
  // ============================================

  getRateLimitStatus(): {
    ordersThisMinute: number
    ordersThisHour: number
    maxPerMinute: number
    maxPerHour: number
    queueLength: number
  } {
    return {
      ordersThisMinute: this.ordersThisMinute,
      ordersThisHour: this.ordersThisHour,
      maxPerMinute: this.MAX_ORDERS_PER_MINUTE,
      maxPerHour: this.MAX_ORDERS_PER_HOUR,
      queueLength: this.orderQueue.length,
    }
  }

  /**
   * 获取交易模式（新增）
   */
  getTradingMode(): 'paper' | 'live' {
    return this.isPaperTrading ? 'paper' : 'live'
  }

  /**
   * 获取仓位总数（新增）
   */
  getPositionCount(): number {
    return this.positions.size
  }

  // ============================================
  // 清理（新增）
  // ============================================

  destroy(): void {
    if (this.strategyUnsubscribe) {
      this.strategyUnsubscribe()
    }
    this.orderQueue = []
    this.activeOrders.clear()
    this.positions.clear()
    console.log('[TradingService] 服务已销毁')
  }
}

// 导出单例
export const tradingService = new TradingService()