/**
 * Polymarket WebSocket 实时行情服务
 * 放置位置：src/services/realtime/RealtimeService.ts
 * 修复版本：解决 "WebSocket is closed before the connection is established" 竞态条件
 *
 * 修复点：
 * 1. close() 时机：只关闭 OPEN/CLOSING 状态的旧连接，避免关掉正在握手的新连接
 * 2. onerror 立即 resolve(false)，避免 Promise 悬挂后超时才处理
 * 3. 重连防重：onclose 触发重连前检查 reconnectTimer，避免重复调度
 */

export interface MarketData {
  type: 'book' | 'price_change' | 'tick_size_change' | 'last_trade_price' | 'best_bid_ask' | 'new_market' | 'market_resolved'
  asset_id?: string
  market?: string
  data?: any
  timestamp?: number
  hash?: string
  raw?: any
}

export interface OrderBook {
  bids: Array<[number, number]>
  asks: Array<[number, number]>
  last_update: number
  spread?: number
  midPrice?: number
}

export interface TradeData {
  price: number
  size: number
  side: 'buy' | 'sell'
  timestamp: number
}

export interface PriceUpdate {
  asset_id: string
  price: number
  change: number
  timestamp: number
}

export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error'
export type StrategyCallback = (data: MarketData, analysis: MarketAnalysis) => void
export type ConnectionCallback = (status: ConnectionStatus) => void

export interface MarketAnalysis {
  asset_id: string
  bestBid: number
  bestAsk: number
  spread: number
  spreadPercent: number
  midPrice: number
  imbalance: number
  totalBidVolume: number
  totalAskVolume: number
  signal: 'buy' | 'sell' | 'hold'
  confidence: number
}

export class RealtimeService {
  private ws: WebSocket | null = null
  private status: ConnectionStatus = 'disconnected'
  private subscribedAssets: Set<string> = new Set()
  private pingInterval: NodeJS.Timeout | null = null
  private reconnectAttempts = 0
  private maxReconnectAttempts = 5
  private messageHandlers: Set<(data: MarketData) => void> = new Set()
  private strategyHandlers: Set<StrategyCallback> = new Set()
  private connectionHandlers: Set<ConnectionCallback> = new Set()

  private priceHistory: Map<string, number[]> = new Map()
  private orderBooks: Map<string, OrderBook> = new Map()

  private connectPromise: Promise<boolean> | null = null
  private reconnectTimer: NodeJS.Timeout | null = null

  private readonly WS_URL = 'wss://ws-subscriptions-clob.polymarket.com/ws/market'
  private readonly POPULAR_ASSETS = [
    '21742633143463906290569050155826241533067272736897614950488156847949938836455',
    '48331043336612883890938759509493159234755048973500640148014422747788308965732',
  ]

  /**
   * 连接 WebSocket
   */
  async connect(): Promise<boolean> {
    if (this.status === 'connected') {
      console.log('[RealtimeService] ✅ 已连接')
      this.notifyConnectionChange('connected')
      return true
    }

    if (this.status === 'connecting' && this.connectPromise) {
      console.log('[RealtimeService] ⏳ 正在连接中，等待完成...')
      return this.connectPromise
    }

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }

    this.connectPromise = new Promise((resolve) => {
      try {
        this.setStatus('connecting')

        // 【修复1】只关闭已建立或正在关闭的旧连接
        // 原代码对任意状态的 ws 直接 close()，会把正在握手的新连接也关掉，
        // 导致 "WebSocket is closed before the connection is established"
        if (this.ws) {
          if (
            this.ws.readyState === WebSocket.OPEN ||
            this.ws.readyState === WebSocket.CLOSING
          ) {
            this.ws.close(1000)
          }
          this.ws = null
        }

        this.ws = new WebSocket(this.WS_URL)

        this.ws.onopen = () => {
          console.log('[RealtimeService] ✅ WebSocket 连接成功')
          this.setStatus('connected')
          this.reconnectAttempts = 0
          this.connectPromise = null

          setTimeout(() => {
            this.startPing()
            if (this.subscribedAssets.size > 0) {
              this.subscribe(Array.from(this.subscribedAssets))
            }
          }, 800)

          resolve(true)
        }

        this.ws.onmessage = (event) => {
          this.handleMessage(event.data)
        }

        // 【修复2】onerror 立即 resolve(false)
        // 原代码注释"不立即 resolve，等待 onclose 处理"，但 onerror 后
        // onclose 触发时 connectPromise 已被清空，导致 Promise 永久悬挂直到 15s 超时
        this.ws.onerror = () => {
          console.error('[RealtimeService] ❌ WebSocket 错误')
          this.setStatus('error')
          this.connectPromise = null
          resolve(false)
        }

        this.ws.onclose = (event) => {
          console.log('[RealtimeService] 🔌 WebSocket 关闭:', event.code)
          this.setStatus('disconnected')
          this.stopPing()
          this.connectPromise = null

          // 【修复3】重连前检查 reconnectTimer 是否已存在，防止重复调度
          // 原代码在多次触发 onclose 时可能同时存在多个重连定时器
          if (
            event.code !== 1000 &&
            this.reconnectAttempts < this.maxReconnectAttempts &&
            !this.reconnectTimer
          ) {
            this.reconnectAttempts++
            const delay = Math.min(this.reconnectAttempts * 1000, 10000)
            console.log(`[RealtimeService] ${delay / 1000}s 后重连...`)

            this.reconnectTimer = setTimeout(() => {
              this.reconnectTimer = null
              this.connect()
            }, delay)
          }
        }

        // 15 秒连接超时兜底
        setTimeout(() => {
          if (this.status === 'connecting') {
            console.error('[RealtimeService] ⏱️ 连接超时')
            this.setStatus('error')
            this.connectPromise = null
            resolve(false)
          }
        }, 15000)

      } catch (error) {
        console.error('[RealtimeService] 连接失败:', error)
        this.setStatus('error')
        this.connectPromise = null
        resolve(false)
      }
    })

    return this.connectPromise
  }

  /**
   * 设置状态并通知监听器
   */
  private setStatus(status: ConnectionStatus): void {
    if (this.status !== status) {
      this.status = status
      this.notifyConnectionChange(status)
    }
  }

  /**
   * 通知连接状态变化
   */
  private notifyConnectionChange(status: ConnectionStatus): void {
    this.connectionHandlers.forEach(handler => {
      try {
        handler(status)
      } catch (e) {
        console.error('[RealtimeService] 连接处理器错误:', e)
      }
    })
  }

  /**
   * 断开连接
   */
  disconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }

    this.stopPing()
    this.subscribedAssets.clear()

    if (this.ws) {
      this.ws.close(1000)
      this.ws = null
    }

    this.setStatus('disconnected')
    this.connectPromise = null
    console.log('[RealtimeService] 已断开连接')
  }

  /**
   * 订阅市场
   */
  subscribe(assetIds: string[]): void {
    if (this.status !== 'connected') {
      console.warn('[RealtimeService] ⚠️ 未连接，无法订阅')
      return
    }

    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      console.warn('[RealtimeService] ⚠️ WebSocket 未就绪，延迟订阅')
      setTimeout(() => this.subscribe(assetIds), 500)
      return
    }

    const subscription = {
      assets_ids: assetIds,
      type: 'market',
      custom_feature_enabled: true,
    }

    try {
      this.ws.send(JSON.stringify(subscription))
      assetIds.forEach(id => this.subscribedAssets.add(id))
      console.log('[RealtimeService] 📡 已订阅:', assetIds.length, '个资产')
    } catch (e: any) {
      console.error('[RealtimeService] ❌ 订阅失败:', e.message)
    }
  }

  /**
   * 取消订阅
   */
  unsubscribe(assetIds: string[]): void {
    if (this.status !== 'connected' || !this.ws) {
      return
    }

    const unsubscription = {
      assets_ids: assetIds,
      operation: 'unsubscribe',
    }

    this.ws.send(JSON.stringify(unsubscription))
    assetIds.forEach(id => this.subscribedAssets.delete(id))
    console.log('[RealtimeService] 🚫 已取消订阅:', assetIds.length, '个资产')
  }

  /**
   * 启动心跳
   */
  private startPing(): void {
    this.stopPing()
    this.pingInterval = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send('PING')
      }
    }, 10000)
  }

  /**
   * 停止心跳
   */
  private stopPing(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval)
      this.pingInterval = null
    }
  }

  /**
   * 处理消息
   */
  private handleMessage(rawData: string): void {
    try {
      if (rawData === 'PONG') return

      if (rawData.includes('INVALID') || rawData.includes('ERROR')) {
        console.debug('[RealtimeService] 服务器消息:', rawData)
        return
      }

      if (!rawData || rawData.trim() === '') return

      let parsed: any
      try {
        parsed = JSON.parse(rawData)
      } catch {
        console.debug('[RealtimeService] 非 JSON 消息:', rawData.substring(0, 50))
        return
      }

      if (!parsed || typeof parsed !== 'object') return

      const messages = Array.isArray(parsed) ? parsed : [parsed]
      for (const msg of messages) {
        const marketData = this.normalizeMessage(msg)
        if (marketData && marketData.type !== 'unknown') {
          this.updateInternalState(marketData)

          const assetId = marketData.asset_id || marketData.market || ''

          if (process.env.NODE_ENV === 'development' && marketData.data) {
            console.debug(
              '[RealtimeService] 📨',
              marketData.type,
              assetId ? assetId.substring(0, 16) + '...' : '',
              '有数据'
            )
          }

          this.messageHandlers.forEach(handler => {
            try {
              handler(marketData)
            } catch (e) {
              console.error('[RealtimeService] 消息处理器错误:', e)
            }
          })

          if (assetId && this.strategyHandlers.size > 0) {
            const analysis = this.analyzeMarket(assetId)
            if (analysis) {
              this.strategyHandlers.forEach(handler => {
                try {
                  handler(marketData, analysis)
                } catch (e) {
                  console.error('[RealtimeService] 策略处理器错误:', e)
                }
              })
            }
          }
        }
      }
    } catch (error) {
      console.debug('[RealtimeService] 消息处理失败')
    }
  }

  /**
   * 标准化消息
   */
  private normalizeMessage(msg: any): MarketData | null {
    if (!msg || typeof msg !== 'object') return null

    const type = msg.type || msg.event || msg.event_type || 'unknown'
    const assetId = msg.asset_id || msg.market || msg.token_id || msg.assetId || ''
    let data = msg.data || msg.payload || msg

    if (type === 'book' || msg.bids || msg.asks) {
      data = {
        bids: this.normalizeOrders(msg.bids || msg.data?.bids || []),
        asks: this.normalizeOrders(msg.asks || msg.data?.asks || []),
        last_update: msg.timestamp || Date.now(),
      }
    }

    if (type === 'last_trade_price' || type === 'price_change') {
      data = {
        price: parseFloat(msg.price || msg.data?.price || msg.last_price || 0),
        size: parseFloat(msg.size || msg.data?.size || 0),
        side: msg.side || msg.data?.side,
        timestamp: msg.timestamp || Date.now(),
      }
    }

    return {
      type: type as MarketData['type'],
      asset_id: assetId,
      data,
      timestamp: msg.timestamp || Date.now(),
      raw: msg,
    }
  }

  /**
   * 标准化订单
   */
  private normalizeOrders(orders: any[]): Array<[number, number]> {
    if (!Array.isArray(orders)) return []

    return orders.map(order => {
      if (Array.isArray(order)) {
        return [parseFloat(order[0]) || 0, parseFloat(order[1]) || 0] as [number, number]
      }
      if (typeof order === 'object' && order !== null) {
        return [
          parseFloat(order.price || order.p || 0),
          parseFloat(order.size || order.s || order.amount || 0),
        ] as [number, number]
      }
      return [0, 0] as [number, number]
    }).filter(([price, size]) => price > 0 && size > 0)
  }

  /**
   * 更新内部状态
   */
  private updateInternalState(data: MarketData): void {
    const assetId = data.asset_id || ''
    if (!assetId) return

    if (data.type === 'book' && data.data) {
      const book = data.data as OrderBook
      if (book.bids && book.asks && book.bids.length > 0 && book.asks.length > 0) {
        const bestBid = book.bids[0]?.[0] || 0
        const bestAsk = book.asks[0]?.[0] || 0
        book.spread = bestAsk - bestBid
        book.midPrice = (bestBid + bestAsk) / 2
        this.orderBooks.set(assetId, book)
      }
    }

    if (data.type === 'last_trade_price' && data.data?.price) {
      const history = this.priceHistory.get(assetId) || []
      history.push(data.data.price)
      if (history.length > 100) history.shift()
      this.priceHistory.set(assetId, history)
    }
  }

  /**
   * 分析市场
   */
  analyzeMarket(assetId: string): MarketAnalysis | null {
    const book = this.orderBooks.get(assetId)
    if (!book || !book.bids?.length || !book.asks?.length) return null

    const bestBid = book.bids[0][0]
    const bestAsk = book.asks[0][0]
    const spread = bestAsk - bestBid
    const midPrice = (bestBid + bestAsk) / 2
    const spreadPercent = midPrice > 0 ? (spread / midPrice) * 100 : 0

    const totalBidVolume = book.bids.reduce((sum, [, size]) => sum + size, 0)
    const totalAskVolume = book.asks.reduce((sum, [, size]) => sum + size, 0)
    const totalVolume = totalBidVolume + totalAskVolume
    const imbalance = totalVolume > 0 ? (totalBidVolume - totalAskVolume) / totalVolume : 0

    let signal: 'buy' | 'sell' | 'hold' = 'hold'
    let confidence = 0

    if (imbalance > 0.3) {
      signal = 'buy'
      confidence = Math.min(imbalance, 1)
    } else if (imbalance < -0.3) {
      signal = 'sell'
      confidence = Math.min(Math.abs(imbalance), 1)
    }

    if (spreadPercent > 5) {
      signal = 'hold'
      confidence = 0
    }

    return {
      asset_id: assetId,
      bestBid,
      bestAsk,
      spread,
      spreadPercent,
      midPrice,
      imbalance,
      totalBidVolume,
      totalAskVolume,
      signal,
      confidence,
    }
  }

  /**
   * 添加消息监听器
   */
  onMessage(handler: (data: MarketData) => void): () => void {
    this.messageHandlers.add(handler)
    return () => this.messageHandlers.delete(handler)
  }

  /**
   * 添加策略监听器
   */
  onStrategy(handler: StrategyCallback): () => void {
    this.strategyHandlers.add(handler)
    return () => this.strategyHandlers.delete(handler)
  }

  /**
   * 添加连接状态监听器
   */
  onConnectionChange(handler: ConnectionCallback): () => void {
    this.connectionHandlers.add(handler)
    handler(this.status)
    return () => this.connectionHandlers.delete(handler)
  }

  getStatus(): ConnectionStatus {
    return this.status
  }

  getSubscribedAssets(): string[] {
    return Array.from(this.subscribedAssets)
  }

  getOrderBook(assetId: string): OrderBook | undefined {
    return this.orderBooks.get(assetId)
  }

  getPriceHistory(assetId: string): number[] {
    return this.priceHistory.get(assetId) || []
  }
}

export const realtimeService = new RealtimeService()