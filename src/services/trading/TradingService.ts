import { ethers } from 'ethers'
import { CLOBClient } from '../api/CLOBClient'
import { WalletService } from '../wallet/WalletService'
import { Order, OrderResult, OrderStatus } from '@/types'

export interface CreateOrderParams {
  tokenId: string
  side: 'BUY' | 'SELL'
  amount: number
  orderType: 'FOK' | 'FAK' | 'GTC' | 'GTD'
  price?: number
  maxSlippage?: number
  expiration?: number
}

export interface OrderQueueItem {
  params: CreateOrderParams
  resolve: (result: OrderResult) => void
  reject: (error: Error) => void
  timestamp: number
  retryCount: number
}

export class TradingService {
  private clobClient: CLOBClient
  private walletService: WalletService
  private provider: ethers.Provider
  private signer: ethers.Signer | null = null
  
  // Rate limiting
  private orderQueue: OrderQueueItem[] = []
  private lastOrderTime: number = 0
  private ordersThisMinute: number = 0
  private ordersThisHour: number = 0
  private minuteResetTime: number = 0
  private hourResetTime: number = 0
  
  // Configuration
  private readonly MAX_ORDERS_PER_MINUTE = 10
  private readonly MAX_ORDERS_PER_HOUR = 50
  private readonly ORDER_COOLDOWN_MS = 500
  private readonly MAX_RETRIES = 3
  
  // Active orders tracking
  private activeOrders: Map<string, Order> = new Map()
  
  constructor(
    clobClient: CLOBClient,
    walletService: WalletService,
    provider: ethers.Provider
  ) {
    this.clobClient = clobClient
    this.walletService = walletService
    this.provider = provider
    this.minuteResetTime = Date.now()
    this.hourResetTime = Date.now()
    
    this.startOrderProcessor()
  }
  
  async setSigner(signer: ethers.Signer): Promise<void> {
    this.signer = signer
  }
  
  private startOrderProcessor(): void {
    setInterval(() => {
      this.processOrderQueue()
    }, 100)
  }
  
  private async processOrderQueue(): Promise<void> {
    if (this.orderQueue.length === 0) return
    if (!this.canPlaceOrder()) return
    
    const item = this.orderQueue[0]
    
    // Check cooldown
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
        // Move to back of queue for retry
        this.orderQueue.push(this.orderQueue.shift()!)
      }
    }
  }
  
  private canPlaceOrder(): boolean {
    const now = Date.now()
    
    // Reset minute counter
    if (now - this.minuteResetTime >= 60000) {
      this.ordersThisMinute = 0
      this.minuteResetTime = now
    }
    
    // Reset hour counter
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
  
  private async executeOrder(params: CreateOrderParams): Promise<OrderResult> {
    try {
      if (!this.signer) {
        return { success: false, error: 'Wallet not connected' }
      }
      
      // Ensure approvals
      if (params.side === 'BUY') {
        const approved = await this.walletService.ensureUSDCApproval(params.amount)
        if (!approved) {
          return { success: false, error: 'USDC approval failed' }
        }
      } else {
        const approved = await this.walletService.ensureCTFApproval()
        if (!approved) {
          return { success: false, error: 'CTF approval failed' }
        }
      }
      
      // Get price if not provided
      let price = params.price
      if (!price) {
        price = await this.getMarketPrice(params.tokenId, params.side)
        if (!price) {
          return { success: false, error: 'Unable to get market price' }
        }
      }
      
      // Adjust for slippage
      if (params.maxSlippage) {
        price = this.adjustPriceForSlippage(price, params.side, params.maxSlippage)
      }
      
      // Adjust for tick size
      price = this.adjustForTickSize(price)
      
      // Calculate size for negative risk
      let size = params.amount
      if (params.side === 'BUY') {
        size = this.adjustForNegativeRisk(size, price)
      }
      
      // Place order
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
        }
        
        this.activeOrders.set(orderResult.orderId, order)
        
        return {
          success: true,
          orderId: orderResult.orderId,
          txHash: orderResult.txHash,
        }
      }
      
      return {
        success: false,
        error: orderResult.error || 'Order placement failed',
      }
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      
      // Handle specific errors
      if (errorMessage.includes('not enough balance')) {
        return { success: false, error: 'Insufficient balance' }
      }
      
      if (errorMessage.includes('tick size')) {
        return { success: false, error: 'Invalid price tick size' }
      }
      
      if (errorMessage.includes('invalid signature')) {
        return { success: false, error: 'Invalid signature, please reconnect wallet' }
      }
      
      return { success: false, error: errorMessage }
    }
  }
  
  private async getMarketPrice(tokenId: string, side: 'BUY' | 'SELL'): Promise<number | null> {
    try {
      const orderBook = await this.clobClient.getOrderBook(tokenId)
      
      if (!orderBook || (!orderBook.bids.length && !orderBook.asks.length)) {
        return null
      }
      
      if (side === 'BUY') {
        return orderBook.asks[0]?.price || orderBook.bids[0]?.price || null
      } else {
        return orderBook.bids[0]?.price || orderBook.asks[0]?.price || null
      }
    } catch (error) {
      console.error('Failed to get market price:', error)
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
    // Polymarket uses 2 decimal places (cents)
    return Math.round(price * 100) / 100
  }
  
  private adjustForNegativeRisk(size: number, price: number): number {
    const negRiskFee = 0.005
    return size * (1 - negRiskFee * Math.min(price, 1 - price))
  }
  
  async cancelOrder(orderId: string): Promise<boolean> {
    try {
      const result = await this.clobClient.cancelOrder(orderId)
      
      if (result.success) {
        this.activeOrders.delete(orderId)
      }
      
      return result.success
    } catch (error) {
      console.error('Cancel order failed:', error)
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
  
  async getOrderStatus(orderId: string): Promise<OrderStatus | null> {
    try {
      const order = await this.clobClient.getOrder(orderId)
      
      if (!order) {
        return null
      }
      
      return {
        orderId,
        status: order.status as OrderStatus['status'],
        filledAmount: order.filled_amount,
        remainingAmount: order.remaining_amount,
      }
    } catch (error) {
      console.error('Get order status failed:', error)
      return null
    }
  }
  
  getActiveOrders(): Order[] {
    return Array.from(this.activeOrders.values())
  }
  
  async getEligibleMarkets(filters: {
    underlyings?: string[]
    duration?: string
    active?: boolean
  }): Promise<any[]> {
    return await this.clobClient.getEligibleMarkets(filters)
  }
  
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
}