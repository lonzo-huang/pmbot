/**
 * Polymarket WebSocket 实时行情服务
 *
 * 放置位置: src/services/realtime/RealtimeService.ts
 *
 * 修复版本：增强消息解析、错误处理、策略回调支持
 */

export interface MarketData {
  type: 'book' | 'price_change' | 'tick_size_change' | 'last_trade_price' | 'best_bid_ask' | 'new_market' | 'market_resolved'
  asset_id?: string
  market?: string  // 有些消息用 market 而不是 asset_id
  data?: any
  timestamp?: number
  hash?: string
  raw?: any  // 原始消息（用于调试）
}

export interface OrderBook {
  bids: Array<[number, number]>  // [price, size]
  asks: Array<[number, number]>
  last_update: number
  spread?: number  // 买卖价差
  midPrice?: number  // 中间价
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

// 策略回调类型
export type StrategyCallback = (data: MarketData, analysis: MarketAnalysis) => void

export interface MarketAnalysis {
  asset_id: string
  bestBid: number
  bestAsk: number
  spread: number
  spreadPercent: number
  midPrice: number
  imbalance: number  // 买卖压力不平衡度 (-1 到 1)
  totalBidVolume: number
  totalAskVolume: number
  signal: 'buy' | 'sell' | 'hold'
  confidence: number  // 0 到 1
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

  // 价格历史（用于策略分析）
  private priceHistory: Map<string, number[]> = new Map()
  private orderBooks: Map<string, OrderBook> = new Map()

  // WebSocket 端点
  private readonly WS_URL = 'wss://ws-subscriptions-clob.polymarket.com/ws/market'

  // 热门市场资产 ID（示例）
  private readonly POPULAR_ASSETS = [
    '21742633143463906290569050155826241533067272736897614950488156847949938836455',
    '48331043336612883890938759509493159234755048973500640148014422747788308965732',
  ]

  /**
   * 连接 WebSocket
   */
  async connect(): Promise<boolean> {
    if (this.status === 'connected' || this.status === 'connecting') {
      console.log('[RealtimeService] 已连接或正在连接')
      return true
    }

    return new Promise((resolve) => {
      try {
        this.status = 'connecting'
        console.log('[RealtimeService] 开始连接 WebSocket...')

        this.ws = new WebSocket(this.WS_URL)

        this.ws.onopen = () => {
          console.log('[RealtimeService] ✅ WebSocket 连接成功')
          this.status = 'connected'
          this.reconnectAttempts = 0

          this.startPing()
          this.subscribe(this.POPULAR_ASSETS)

          resolve(true)
        }

        this.ws.onmessage = (event) => {
          this.handleMessage(event.data)
        }

        this.ws.onerror = (error) => {
          console.error('[RealtimeService] ❌ WebSocket 错误:', error)
          this.status = 'error'
          resolve(false)
        }

        this.ws.onclose = (event) => {
          console.log('[RealtimeService] 🔌 WebSocket 关闭:', event.code, event.reason)
          this.status = 'disconnected'
          this.stopPing()

          if (this.reconnectAttempts < this.maxReconnectAttempts) {
            this.reconnectAttempts++
            console.log(`[RealtimeService] ${this.reconnectAttempts}s 后重连...`)
            setTimeout(() => this.connect(), this.reconnectAttempts * 1000)
          }
        }

        setTimeout(() => {
          if (this.status === 'connecting') {
            console.error('[RealtimeService] ⏱️ 连接超时')
            this.status = 'error'
            resolve(false)
          }
        }, 10000)

      } catch (error) {
        console.error('[RealtimeService] 连接失败:', error)
        this.status = 'error'
        resolve(false)
      }
    })
  }

  /**
   * 断开连接
   */
  disconnect(): void {
    this.stopPing()
    this.subscribedAssets.clear()

    if (this.ws) {
      this.ws.close()
      this.ws = null
    }

    this.status = 'disconnected'
    console.log('[RealtimeService] 已断开连接')
  }

  /**
   * 订阅市场
   */
  subscribe(assetIds: string[]): void {
    if (this.status !== 'connected' || !this.ws) {
      console.warn('[RealtimeService] 未连接，无法订阅')
      return
    }

    const subscription = {
      assets_ids: assetIds,
      type: 'market',
      custom_feature_enabled: true,
    }

    this.ws.send(JSON.stringify(subscription))

    assetIds.forEach(id => this.subscribedAssets.add(id))
    console.log('[RealtimeService] 📡 已订阅市场:', assetIds.length, '个资产')
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
        console.log('[RealtimeService] 💓 PING')
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
   * 处理接收到的消息 - 增强版
   */
  private handleMessage(rawData: string): void {
    try {
      // 处理 PONG 响应
      if (rawData === 'PONG') {
        console.log('[RealtimeService] 🏓 PONG')
        return
      }

      // 尝试解析 JSON
      let parsed: any
      try {
        parsed = JSON.parse(rawData)
      } catch {
        console.warn('[RealtimeService] 非 JSON 消息:', rawData.substring(0, 100))
        return
      }

      // ✅ 处理数组格式的消息（Polymarket 可能返回数组）
      const messages = Array.isArray(parsed) ? parsed : [parsed]

      for (const msg of messages) {
        const marketData = this.normalizeMessage(msg)

        if (marketData) {
          // 更新内部状态
          this.updateInternalState(marketData)

          // 获取资产 ID
          const assetId = marketData.asset_id || marketData.market || ''

          // 打印日志（更详细）
          console.log(
            '[RealtimeService] 📨 收到消息:',
            marketData.type || 'unknown',
            assetId ? assetId.substring(0, 16) + '...' : '(无资产ID)',
            marketData.data ? '有数据' : ''
          )

          // 通知普通监听器
          this.messageHandlers.forEach(handler => {
            try {
              handler(marketData)
            } catch (e) {
              console.error('[RealtimeService] 消息处理器错误:', e)
            }
          })

          // 执行策略分析并通知策略监听器
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
      console.error('[RealtimeService] 消息处理失败:', error, '原始数据:', rawData.substring(0, 200))
    }
  }

  /**
   * 标准化消息格式
   */
  private normalizeMessage(msg: any): MarketData | null {
    if (!msg || typeof msg !== 'object') {
      return null
    }

    const type = msg.type || msg.event || msg.event_type || 'unknown'
    const assetId = msg.asset_id || msg.market || msg.token_id || msg.assetId || ''

    let data = msg.data || msg.payload || msg

    // 如果是订单簿消息，标准化格式
    if (type === 'book' || msg.bids || msg.asks) {
      data = {
        bids: this.normalizeOrders(msg.bids || msg.data?.bids || []),
        asks: this.normalizeOrders(msg.asks || msg.data?.asks || []),
        last_update: msg.timestamp || Date.now(),
      }
    }

    // 如果是价格消息
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
   * 标准化订单数据
   */
  private normalizeOrders(orders: any[]): Array<[number, number]> {
    if (!Array.isArray(orders)) return []

    return orders.map(order => {
      if (Array.isArray(order)) {
        return [parseFloat(order[0]) || 0, parseFloat(order[1]) || 0] as [number, number]
      }
      if (typeof order === 'object') {
        return [
          parseFloat(order.price || order.p || 0),
          parseFloat(order.size || order.s || order.amount || 0)
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

    // 更新订单簿
    if (data.type === 'book' && data.data) {
      const book = data.data as OrderBook
      if (book.bids && book.asks) {
        const bestBid = book.bids[0]?.[0] || 0
        const bestAsk = book.asks[0]?.[0] || 0
        book.spread = bestAsk - bestBid
        book.midPrice = (bestBid + bestAsk) / 2

        this.orderBooks.set(assetId, book)
      }
    }

    // 更新价格历史
    if (data.type === 'last_trade_price' && data.data?.price) {
      const history = this.priceHistory.get(assetId) || []
      history.push(data.data.price)

      if (history.length > 100) {
        history.shift()
      }

      this.priceHistory.set(assetId, history)
    }
  }

  /**
   * 分析市场数据（用于策略）
   */
  analyzeMarket(assetId: string): MarketAnalysis | null {
    const book = this.orderBooks.get(assetId)
    if (!book || !book.bids?.length || !book.asks?.length) {
      return null
    }

    const bestBid = book.bids[0][0]
    const bestAsk = book.asks[0][0]
    const spread = bestAsk - bestBid
    const midPrice = (bestBid + bestAsk) / 2
    const spreadPercent = (spread / midPrice) * 100

    const totalBidVolume = book.bids.reduce((sum, [, size]) => sum + size, 0)
    const totalAskVolume = book.asks.reduce((sum, [, size]) => sum + size, 0)
    const totalVolume = totalBidVolume + totalAskVolume

    const imbalance = totalVolume > 0
      ? (totalBidVolume - totalAskVolume) / totalVolume
      : 0

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
   * 获取连接状态
   */
  getStatus(): ConnectionStatus {
    return this.status
  }

  /**
   * 获取已订阅的资产
   */
  getSubscribedAssets(): string[] {
    return Array.from(this.subscribedAssets)
  }

  /**
   * 获取订单簿
   */
  getOrderBook(assetId: string): OrderBook | undefined {
    return this.orderBooks.get(assetId)
  }

  /**
   * 获取价格历史
   */
  getPriceHistory(assetId: string): number[] {
    return this.priceHistory.get(assetId) || []
  }
}

// 导出单例
export const realtimeService = new RealtimeService()