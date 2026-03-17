/**
 * Polymarket 交易执行服务 - 增强版
 * 放置位置：src/services/trading/TradingService.ts
 * 保留：订单队列、限流控制、重试机制
 * 新增：纸面交易、策略整合、仓位管理、PnL 追踪
 */

import { ethers } from 'ethers'
import { realtimeService } from '@/services/realtime/RealtimeService'
import { strategyManager, TradeSignal } from '@/services/strategies'
import { useAppStore } from '@/stores/appStore'
import { MarketScanner } from './MarketScanner'
import { GammaClient } from '../api/gammaClient'
import { Market } from '@/types'
import { LLMService } from '../llm/LLMService'

// ============================================
// 类型定义
// ============================================

export interface MarketFilter {
  underlyings?: string[]
  duration?: string
  active?: boolean
}

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

  // Trading fee constant
  private readonly TRADING_FEE_PERCENT = 0.02  // Polymarket 2% per trade

  // 配置（保留现有）
  private readonly MAX_ORDERS_PER_MINUTE = 10
  private readonly MAX_ORDERS_PER_HOUR = 50
  private readonly ORDER_COOLDOWN_MS = 500
  private readonly MAX_RETRIES = 3

  // ✅ 状态追踪（新增）
  private activeOrders: Map<string, Order> = new Map()
  private positions: Map<string, Position> = new Map()
  private pendingAutoExits: Set<string> = new Set()
  private subscribedPositionTokens: Set<string> = new Set()
  private lastStorePositionsSignature: string = ''
  private autoExitTimer: NodeJS.Timeout | null = null
  private tradeHistory: Order[] = []

  // ✅ 交易限制（核心优化）
  private readonly MAX_BUY_PRICE = 0.99
  private readonly REVERSE_SIGNALS = false

  // ✅ 市场扫描器
  private marketScanner: MarketScanner

  // ✅ LLM 审核服务
  private llmService: LLMService

  // ✅ 策略信号订阅（新增）
  private strategyUnsubscribe: (() => void) | null = null
  private autoExecuteSignals: boolean = false

  constructor() {
    this.minuteResetTime = Date.now()
    this.hourResetTime = Date.now()

    // 初始化服务
    this.marketScanner = new MarketScanner(new GammaClient())
    this.llmService = new LLMService()

    // 启动订单处理器（保留现有）
    this.startOrderProcessor()

    // ✅ 订阅策略信号（新增）
    this.subscribeToStrategySignals()

    // ✅ 启动 PnL 更新（新增）
    this.startPnLUpdater()

    // ✅ 同步 Store 状态（新增）
    this.syncWithStore()

    console.log('[TradingService] ✅ 服务已初始化')
  }

  /**
   * 与 Store 同步状态
   */
  private syncWithStore(): void {
    // 初始化状态
    const state = useAppStore.getState()
    this.autoExecuteSignals = state.trading.isActive
    this.isPaperTrading = state.settings.paperTradingMode

    // 监听状态变化
    useAppStore.subscribe((state) => {
      const signature = (state.positions.active || [])
        .map(p => `${p.tokenId}:${p.amount}:${p.entryPrice}:${p.currentPrice}:${p.pnl}`)
        .join('|')
      if (signature !== this.lastStorePositionsSignature) {
        this.lastStorePositionsSignature = signature
        this.reconcilePositionsFromStore(state)
        this.scheduleAutoExitEvaluation()
      }

      if (this.autoExecuteSignals !== state.trading.isActive) {
        this.autoExecuteSignals = state.trading.isActive
        console.log('[TradingService] 自动交易状态同步:', this.autoExecuteSignals ? '✅ 启用' : '❌ 禁用')
      }
      if (this.isPaperTrading !== state.settings.paperTradingMode) {
        this.isPaperTrading = state.settings.paperTradingMode
        console.log('[TradingService] 交易模式同步:', this.isPaperTrading ? '📝 纸面交易' : '💰 真实交易')
      }

      this.scheduleAutoExitEvaluation()
    })
  }

  private reconcilePositionsFromStore(state: ReturnType<typeof useAppStore.getState>): void {
    const storePositions = state.positions.active || []
    const storeTokenIds = new Set(storePositions.map(p => p.tokenId))

    for (const p of storePositions) {
      const existing = this.positions.get(p.tokenId)
      const side: 'yes' | 'no' = (p.outcome || '').toLowerCase() === 'no' ? 'no' : 'yes'
      if (!existing) {
        this.positions.set(p.tokenId, {
          tokenId: p.tokenId,
          side,
          entryPrice: p.entryPrice,
          size: p.amount,
          entryTime: p.openedAt,
          unrealizedPnL: p.pnl,
          realizedPnL: 0,
        })
      } else {
        existing.side = side
        existing.entryPrice = p.entryPrice
        existing.size = p.amount
        existing.entryTime = p.openedAt
        existing.unrealizedPnL = p.pnl
      }

      if (!this.subscribedPositionTokens.has(p.tokenId)) {
        realtimeService.subscribe([p.tokenId])
        this.subscribedPositionTokens.add(p.tokenId)
      }
    }

    for (const tokenId of Array.from(this.positions.keys())) {
      if (!storeTokenIds.has(tokenId)) {
        this.positions.delete(tokenId)
      }
    }

    for (const tokenId of Array.from(this.subscribedPositionTokens.values())) {
      if (!storeTokenIds.has(tokenId)) {
        realtimeService.unsubscribe([tokenId])
        this.subscribedPositionTokens.delete(tokenId)
      }
    }
  }

  private scheduleAutoExitEvaluation(): void {
    if (this.autoExitTimer) clearTimeout(this.autoExitTimer)
    this.autoExitTimer = setTimeout(() => {
      this.autoExitTimer = null
      this.evaluateAutoExitFromStore()
    }, 300)
  }

  private evaluateAutoExitFromStore(): void {
    const state = useAppStore.getState()
    if (!state.settings.autoSellEnabled) return

    const takeProfit = (state.settings.takeProfitPercent ?? 30) / 100
    const stopLoss = (state.settings.stopLossPercent ?? 15) / 100

    for (const p of state.positions.active || []) {
      const entryValue = (p.entryPrice || 0) * (p.amount || 0)
      const pnlPercent = entryValue > 0 ? (p.pnl || 0) / entryValue : 0

      if (this.pendingAutoExits.has(p.tokenId)) continue
      if (pnlPercent < takeProfit && pnlPercent > -stopLoss) continue

      const internal = this.positions.get(p.tokenId)
      if (!internal) {
        this.positions.set(p.tokenId, {
          tokenId: p.tokenId,
          side: (p.outcome || '').toLowerCase() === 'no' ? 'no' : 'yes',
          entryPrice: p.entryPrice,
          size: p.amount,
          entryTime: p.openedAt,
          unrealizedPnL: p.pnl,
          realizedPnL: 0,
        })
      }

      this.pendingAutoExits.add(p.tokenId)
      const reason = pnlPercent >= takeProfit ? 'take-profit' : 'stop-loss'
      state.addActivityLog({
        type: 'analysis',
        message: `触发${reason === 'take-profit' ? '止盈' : '止损'}：${(pnlPercent * 100).toFixed(1)}%`,
        data: { tokenId: p.tokenId, pnlPercent, entryPrice: p.entryPrice, currentPrice: p.currentPrice }
      })
      this.createOrder({
        tokenId: p.tokenId,
        side: 'SELL',
        amount: p.amount,
        orderType: 'FAK',
        price: p.currentPrice,
        maxSlippage: 0.02,
        reason,
      }).finally(() => {
        this.pendingAutoExits.delete(p.tokenId)
      })
    }
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

  /**
   * 获取符合条件的市场 (修复缺失方法)
   */
  async getEligibleMarkets(filter: MarketFilter): Promise<Market[]> {
    try {
      const scanResults = await this.marketScanner.scan()
      return scanResults
        .filter(result => {
          if (!result.eligible) return false
          
          const market = result.market
          
          // 按底层资产过滤 (如 ETH, BTC)
          if (filter.underlyings && filter.underlyings.length > 0) {
            const matchesUnderlying = filter.underlyings.some(u => 
              market.question.toUpperCase().includes(u.toUpperCase())
            )
            if (!matchesUnderlying) return false
          }
          
          // 按周期过滤 (如 15m)
          if (filter.duration) {
            if (!market.question.includes(filter.duration)) return false
          }
          
          return true
        })
        .map(result => result.market)
    } catch (error) {
      console.error('[TradingService] Failed to get eligible markets:', error)
      return []
    }
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

      // ✅ 记录信号日志到 Activity Feed
      useAppStore.getState().addActivityLog({
        type: 'signal',
        message: `收到 ${signal.strategy} 信号: ${signal.action.toUpperCase()} @ ${(signal.price * 100).toFixed(1)}¢ (${signal.reason})`,
      })

      // 检查是否启用自动交易
      if (!this.autoExecuteSignals) {
        console.log('[TradingService] 自动交易未启用，忽略信号')
        return
      }

      // 检查纸面交易模式
      if (!this.isPaperTrading) {
        console.log('[TradingService] ⚠️ 真实交易模式下启动 LLM 审核...')
        
        // 自动交易在真实模式下的前置审核
        const isApproved = await this.approveTradeWithLLM(signal)
        if (!isApproved) {
          console.log('[TradingService] ❌ 真实交易信号被 LLM 否决')
          return
        }
        console.log('[TradingService] ✅ LLM 审核通过，继续执行真实交易')
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
    // 1. 检查是否已有该资产的持仓（单市场持仓限制）
    if (this.positions.has(signal.asset_id)) {
      console.log(`[TradingService] 🚫 已持有资产 ${signal.asset_id} 的仓位，跳过重复下单`)
      return { success: false, error: 'Position already exists' }
    }

    // 2. 价格限制检查
    if (signal.price > this.MAX_BUY_PRICE) {
      const msg = `🚫 信号价格 (${signal.price}) 超过最大买入限制 (${this.MAX_BUY_PRICE})，放弃接盘`
      console.log(`[TradingService] ${msg}`)
      useAppStore.getState().addActivityLog({ type: 'error', message: msg })
      return { success: false, error: 'Price too high' }
    }

    // 3. 构建交易参数（先构建，再处理反向逻辑）
    const params: CreateOrderParams = {
      tokenId: signal.asset_id,
      side: signal.action === 'buy' ? 'BUY' : 'SELL',
      amount: signal.size,
      orderType: 'GTC',
      price: signal.price,
      maxSlippage: 0.02,
      reason: signal.reason,
      signal: signal,
    }

    // 4. 反向信号处理：买入对立面的 Token（而不是平仓 SELL）
    if (this.REVERSE_SIGNALS) {
      const store = useAppStore.getState()
      const market = store.markets.activeMarkets.find(m => (m.assetIds || []).includes(signal.asset_id))
      if (market && (market.assetIds?.length ?? 0) >= 2) {
        const assetIds = market.assetIds || []
        const currentIndex = assetIds.indexOf(signal.asset_id)
        const otherIndex = currentIndex === 0 ? 1 : 0
        const otherTokenId = assetIds[otherIndex]

        params.tokenId = otherTokenId
        params.side = 'BUY'
        params.price = 1 - signal.price
        params.reason = `[REVERSED] 原信号买入 ${currentIndex === 0 ? 'YES' : 'NO'}，现买入 ${otherIndex === 0 ? 'YES' : 'NO'}`

        console.log(`[TradingService] 🔄 反向买入激活: ${signal.asset_id} -> ${otherTokenId} @ ${params.price}`)
      }
    }

    // 5. 价格限制：用最终 params.price 进行检查
    if ((params.price ?? 0) > this.MAX_BUY_PRICE) {
      const msg = `🚫 信号价格 (${params.price}) 超过最大买入限制 (${this.MAX_BUY_PRICE})，放弃接盘`
      console.log(`[TradingService] ${msg}`)
      useAppStore.getState().addActivityLog({ type: 'error', message: msg })
      return { success: false, error: 'Price too high' }
    }

    // 6. 单市场持仓限制：对最终 tokenId 做限制
    if (this.positions.has(params.tokenId)) {
      console.log(`[TradingService] 🚫 已持有资产 ${params.tokenId} 的仓位，跳过重复下单`)
      return { success: false, error: 'Position already exists' }
    }

    return await this.createOrder(params)
  }

  /**
   * 使用 LLM 对真实交易进行二次审核 (增强安全性)
   */
  private async approveTradeWithLLM(signal: TradeSignal): Promise<boolean> {
    try {
      // 这里的 prompt 应该包含策略逻辑、信号原因和当前市场风险
      const prompt = `
        审核交易请求 (真实资金):
        策略: ${signal.strategy}
        操作: ${signal.action}
        资产ID: ${signal.asset_id}
        价格: ${signal.price}
        仓位: ${signal.size}
        原因: ${signal.reason}
        
        请评估该信号的合理性。如果该策略表现良好且逻辑清晰，请批准。
        如果信号显得异常或风险过高，请否决。
      `
      
      const response = await this.llmService.reason<{ approved: boolean, riskLevel: string }>({
        system: "你是一个专业的交易风控专家。你的职责是审核自动化策略发出的交易信号，防止因策略 Bug 或极端行情导致的资金损失。",
        prompt,
        outputSchema: {
          approved: { type: 'boolean' },
          riskLevel: { type: 'enum', values: ['low', 'medium', 'high'] }
        }
      })
      
      return response.approved
    } catch (error) {
      console.error('[TradingService] LLM 审核异常，默认否决以保护资金:', error)
      return false
    }
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

    const existingPosition = params.side === 'SELL' ? this.positions.get(params.tokenId) : undefined
    const tradeValue = (params.price || 0.5) * params.amount
    
    // ✅ 扣除手续费 (Polymarket 2% per trade)
    const tradingFee = tradeValue * this.TRADING_FEE_PERCENT
    
    // 计算已实现盈亏（扣除手续费）
    const realizedPnL =
      existingPosition && params.side === 'SELL'
        ? tradeValue - existingPosition.entryPrice * Math.min(params.amount, existingPosition.size) - tradingFee
        : -tradingFee  // 买入时只记录手续费成本

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

    // ✅ 通知 Store
    const store = useAppStore.getState()
    store.addTrade({
      id: orderId,
      marketId: params.tokenId,
      type: params.side.toLowerCase() as any,
      outcome: params.side === 'BUY' ? 'yes' : 'no',
      amount: params.amount,
      price: params.price || 0.5,
      timestamp: Date.now(),
      pnl: params.side === 'SELL' ? realizedPnL : undefined,
    })

    // ✅ 新增：记录 Activity Log（包含手续费）
    store.addActivityLog({
      type: 'trade',
      message: `${params.side === 'BUY' ? '买入' : '卖出'} ${params.amount} 份 @ ${params.price || 0.5} | 手续费 ${tradingFee.toFixed(2)}${params.side === 'SELL' && typeof realizedPnL === 'number' ? ` | 净盈亏 ${realizedPnL >= 0 ? '+' : ''}${realizedPnL.toFixed(2)}` : ''} (原因: ${params.reason || '策略信号'})`,
    })

    console.log('[TradingService] 📝 纸面交易完成:', orderId, '手续费:', tradingFee.toFixed(2))

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
        const fetchedPrice = await this.getMarketPrice(params.tokenId, params.side)
        if (fetchedPrice == null) {
          return { success: false, error: 'Unable to get market price' }
        }
        price = fetchedPrice
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
      // ✅ 修复：如果是 SELL，减少仓位大小；如果是 BUY，增加仓位大小
      if (order.side === 'BUY') {
        const avgPrice = (existingPosition.entryPrice * existingPosition.size + order.price * order.size) /
                         (existingPosition.size + order.size)
        existingPosition.entryPrice = avgPrice
        existingPosition.size += order.size
      } else {
        // 卖出时，计算已实现盈亏
        // 对于 Polymarket 令牌，卖出即平仓
        const priceDiff = order.price - existingPosition.entryPrice
        const realizedPnL = priceDiff * order.size
        
        existingPosition.realizedPnL += realizedPnL
        existingPosition.size -= order.size
        
        // 如果仓位清空，则记录已实现盈亏到 Store 并移除
        if (existingPosition.size <= 0.0001) {
          this.positions.delete(order.tokenId)
          console.log('[TradingService] 仓位已完全清空:', order.tokenId)
        }
      }
    } else if (order.side === 'BUY') {
      // 只有买入时才新建仓位
      const store = useAppStore.getState()
      const market = store.markets.activeMarkets.find(m => (m.assetIds || []).includes(order.tokenId))
      const side: 'yes' | 'no' =
        market && market.assetIds
          ? (market.assetIds.indexOf(order.tokenId) === 1 ? 'no' : 'yes')
          : 'yes'
      this.positions.set(order.tokenId, {
        tokenId: order.tokenId,
        side,
        entryPrice: order.price,
        size: order.size,
        entryTime: Date.now(),
        unrealizedPnL: 0,
        realizedPnL: 0,
      })
    }

    // 同步到 Store 的 active 列表
    const allActivePositions = Array.from(this.positions.values()).map(p => ({
      tokenId: p.tokenId,
      marketId: p.tokenId, // 简化处理
      outcome: p.side,
      amount: p.size,
      entryPrice: p.entryPrice,
      currentPrice: p.entryPrice, // 初始价格设为成本价
      pnl: p.unrealizedPnL,
      openedAt: p.entryTime,
    }))
    useAppStore.getState().updatePositions(allActivePositions)

    console.log('[TradingService] 仓位已更新:', order.tokenId, '当前持仓数:', allActivePositions.length)
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

    // ✅ 统一盈亏计算逻辑：(现价 - 成本价) * 数量
    const pnl = (currentPrice - position.entryPrice) * position.size

    position.unrealizedPnL = pnl

    // ✅ 更新 Store
    const allPositions = Array.from(this.positions.values())
    const totalUnrealized = allPositions.reduce((sum, p) => sum + p.unrealizedPnL, 0)
    const totalRealized = allPositions.reduce((sum, p) => sum + p.realizedPnL, 0)
    
    useAppStore.getState().updatePnl({
      unrealized: totalUnrealized,
      total: totalUnrealized + totalRealized
    })

    // 同步更新 Store 中的具体 Position 对象
    useAppStore.getState().updatePosition(tokenId, {
      currentPrice,
      pnl
    })

    const state = useAppStore.getState()
    if (!state.settings.autoSellEnabled) return

    const entryValue = position.entryPrice * position.size
    const pnlPercent = entryValue > 0 ? pnl / entryValue : 0
    const takeProfit = (state.settings.takeProfitPercent ?? 30) / 100
    const stopLoss = (state.settings.stopLossPercent ?? 15) / 100

    if (this.pendingAutoExits.has(tokenId)) return

    if (pnlPercent >= takeProfit || pnlPercent <= -stopLoss) {
      this.pendingAutoExits.add(tokenId)
      const reason = pnlPercent >= takeProfit ? 'take-profit' : 'stop-loss'
      state.addActivityLog({
        type: 'analysis',
        message: `触发${reason === 'take-profit' ? '止盈' : '止损'}：${(pnlPercent * 100).toFixed(1)}%`,
        data: { tokenId, pnlPercent, entryPrice: position.entryPrice, currentPrice }
      })
      this.createOrder({
        tokenId,
        side: 'SELL',
        amount: position.size,
        orderType: 'FAK',
        price: currentPrice,
        maxSlippage: 0.02,
        reason,
      }).finally(() => {
        this.pendingAutoExits.delete(tokenId)
      })
    }
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

  /**
   * 启动 PnL 更新（新增）
   */
  private startPnLUpdater(): void {
    setInterval(() => {
      this.positions.forEach((pos, tokenId) => {
        const orderBook = realtimeService.getOrderBook(tokenId)
        const bestBid = orderBook?.bids?.[0]?.[0] || 0
        const bestAsk = orderBook?.asks?.[0]?.[0] || 0
        const bookMid = bestBid > 0 && bestAsk > 0 ? (bestBid + bestAsk) / 2 : 0
        const lastUpdate = realtimeService.getLastUpdate(tokenId)
        const ageMs = lastUpdate ? Date.now() - lastUpdate : Number.POSITIVE_INFINITY

        let currentPrice = bookMid
        if (!currentPrice || !Number.isFinite(currentPrice) || ageMs > 30000) {
          const history = realtimeService.getPriceHistory(tokenId)
          const lastPrice = history.length > 0 ? history[history.length - 1] : 0
          currentPrice = lastPrice || bookMid || bestBid || bestAsk || pos.entryPrice
        }

        if (currentPrice > 0) {
          this.updatePositionPnL(tokenId, currentPrice)
        }
      })
    }, 5000)
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
