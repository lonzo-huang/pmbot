/**
 * Polymarket WebSocket 实时行情服务
 * 放置位置：src/services/realtime/RealtimeService.ts
 * 
 * 修复点：
 * 1. 移除 handleMessage 中发送假消息的代码
 * 2. 添加详细调试日志来追踪消息流
 * 3. 确保 messageHandlers 被正确调用
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
  private subscribedAssets: Map<string, number> = new Map()
  private pingInterval: NodeJS.Timeout | null = null
  private lastUpdates: Map<string, number> = new Map()
  private reconnectAttempts = 0
  private maxReconnectAttempts = 5
  private messageHandlers: Set<(data: MarketData) => void> = new Set()
  private strategyHandlers: Set<StrategyCallback> = new Set()
  private connectionHandlers: Set<ConnectionCallback> = new Set()

  private priceHistory: Map<string, number[]> = new Map()
  private orderBooks: Map<string, OrderBook> = new Map()
  private assetAliases: Map<string, string> = new Map()

  private connectPromise: Promise<boolean> | null = null
  private reconnectTimer: NodeJS.Timeout | null = null

  // ✅ 调试计数器
  private debugRawCount = 0
  private debugNormalizedCount = 0
  private debugDispatchedCount = 0

  private readonly WS_URL = import.meta.env.VITE_WS_URL || 'wss://ws-subscriptions-clob.polymarket.com/ws/market'

  async connect(): Promise<boolean> {
    if (this.status === 'connected' && this.ws?.readyState === WebSocket.OPEN) {
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

        if (this.ws) {
          if (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CLOSING) {
            this.ws.close(1000)
          }
          this.ws = null
        }

        console.log(`[RealtimeService] 🔌 正在连接到 ${this.WS_URL}...`)
        this.ws = new WebSocket(this.WS_URL)

        this.ws.onopen = () => {
          console.log('[RealtimeService] ✅ WebSocket 连接成功')
          this.setStatus('connected')
          this.reconnectAttempts = 0
          this.connectPromise = null
          
          // 重置调试计数器
          this.debugRawCount = 0
          this.debugNormalizedCount = 0
          this.debugDispatchedCount = 0

          this.startPing()
          
          if (this.subscribedAssets.size > 0) {
            const assets = Array.from(this.subscribedAssets.keys())
            this.sendSubscription(assets)
          }

          resolve(true)
        }

        this.ws.onmessage = (event) => {
          this.handleMessage(event.data)
        }

        this.ws.onerror = (err) => {
          console.error('[RealtimeService] ❌ WebSocket 错误:', err)
          this.setStatus('error')
          this.connectPromise = null
          resolve(false)
        }

        this.ws.onclose = (event) => {
          const reason = event.reason || 'No reason'
          console.log(`[RealtimeService] 🔌 WebSocket 关闭: ${event.code} (${reason})`)
          this.setStatus('disconnected')
          this.stopPing()
          this.connectPromise = null

          if (event.code !== 1000 && this.reconnectAttempts < this.maxReconnectAttempts && !this.reconnectTimer) {
            this.reconnectAttempts++
            const delay = Math.min(this.reconnectAttempts * 1000, 10000)
            console.log(`[RealtimeService] ${delay / 1000}s 后重连...`)

            this.reconnectTimer = setTimeout(() => {
              this.reconnectTimer = null
              this.connect()
            }, delay)
          }
        }

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

  private setStatus(status: ConnectionStatus): void {
    if (this.status !== status) {
      this.status = status
      this.notifyConnectionChange(status)
    }
  }

  private notifyConnectionChange(status: ConnectionStatus): void {
    this.connectionHandlers.forEach(handler => {
      try {
        handler(status)
      } catch (e) {
        console.error('[RealtimeService] 连接处理器错误:', e)
      }
    })
  }

  disconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }

    this.stopPing()

    if (this.ws) {
      this.ws.close(1000)
      this.ws = null
    }

    this.setStatus('disconnected')
    this.connectPromise = null
    console.log('[RealtimeService] 已断开连接')
  }

  clearSubscriptions(): void {
    console.log('[RealtimeService] 🧹 清空所有订阅状态')
    const allAssets = Array.from(this.subscribedAssets.keys())
    if (allAssets.length > 0) {
      this.unsubscribe(allAssets)
    }
    this.subscribedAssets.clear()
    this.orderBooks.clear()
    this.priceHistory.clear()
    this.assetAliases.clear()
  }

  private resolveAssetId(msg: any): string | null {
    if (!msg || typeof msg !== 'object') return null

    const candidates: string[] = []
    const collect = (value: unknown) => {
      if (typeof value === 'string') {
        const trimmed = value.trim()
        if (trimmed.length > 0) {
          candidates.push(trimmed)
        }
      }
    }

    collect(msg.asset_id)
    collect(msg.assetId)
    collect(msg.token_id)
    collect(msg.tokenId)
    collect(msg.clobTokenId)
    collect(msg.clob_token_id)
    collect(msg.outcome_token_id)
    collect(msg.outcomeTokenId)
    collect(msg.id)
    collect(msg.token)
    collect(msg.token_slug)
    collect(msg.tokenSlug)
    collect(msg.market_token)
    collect(msg.marketToken)

    if (Array.isArray(msg.price_changes)) {
      msg.price_changes.forEach((pc: any) => {
        collect(pc?.asset_id)
        collect(pc?.token_id)
        collect(pc?.clobTokenId)
      })
    }

    collect(msg.market)
    collect(msg.market_id)

    for (const candidate of candidates) {
      if (this.assetAliases.has(candidate)) {
        return this.assetAliases.get(candidate) || candidate
      }
      if (this.subscribedAssets.has(candidate)) {
        return candidate
      }
    }

    return candidates[0] || null
  }

  private collectAssetAliases(assetId: string, msg: any): void {
    if (!msg || typeof msg !== 'object') return

    const maybeRegister = (value: unknown) => {
      if (typeof value !== 'string') return
      const alias = value.trim()
      if (!alias || alias === assetId) return
      this.assetAliases.set(alias, assetId)
    }

    maybeRegister(msg.asset_id)
    maybeRegister(msg.assetId)
    maybeRegister(msg.token_id)
    maybeRegister(msg.tokenId)
    maybeRegister(msg.clobTokenId)
    maybeRegister(msg.clob_token_id)
    maybeRegister(msg.outcome_token_id)
    maybeRegister(msg.outcomeTokenId)
    maybeRegister(msg.id)
    maybeRegister(msg.token)
    maybeRegister(msg.token_slug)
    maybeRegister(msg.tokenSlug)
    maybeRegister(msg.market)
    maybeRegister(msg.market_id)
    maybeRegister(msg.market_token)
    maybeRegister(msg.marketToken)

    if (Array.isArray(msg.price_changes)) {
      msg.price_changes.forEach((pc: any) => {
        maybeRegister(pc?.asset_id)
        maybeRegister(pc?.token_id)
        maybeRegister(pc?.clobTokenId)
      })
    }
  }

  subscribe(assetIds: string[]): void {
    if (!assetIds || assetIds.length === 0) return

    const newAssets: string[] = []
    assetIds.forEach(id => {
      const count = this.subscribedAssets.get(id) || 0
      this.subscribedAssets.set(id, count + 1)
      if (count === 0) newAssets.push(id)
    })

    console.log(`[RealtimeService] ➕ 订阅资产请求: ${assetIds.length} 个 (新订阅: ${newAssets.length})`)
    console.log(`[RealtimeService] 📝 当前监听器数量: ${this.messageHandlers.size}`)

    if (newAssets.length > 0 && this.status === 'connected') {
      this.sendSubscription(newAssets)
    }
  }

  private sendSubscription(assetIds: string[]): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      console.warn('[RealtimeService] 未连接，无法订阅')
      return
    }

    const subscription = {
      type: 'subscribe',
      asset_ids: assetIds,
      assets_ids: assetIds,
    }

    console.log('[RealtimeService] 📡 即将发送订阅:', JSON.stringify(subscription))

    try {
      this.ws.send(JSON.stringify(subscription))
      console.log('[RealtimeService] ✅ 订阅已发送:', assetIds.length, '个资产')
    } catch (e: any) {
      console.error('[RealtimeService] ❌ 订阅发送失败:', e.message)
    }
  }

  unsubscribe(assetIds: string[]): void {
    if (!assetIds || assetIds.length === 0) return
    if (this.status !== 'connected' || !this.ws) return

    const assetsToUnsubscribe = assetIds.filter(id => {
      const count = this.subscribedAssets.get(id) || 0
      if (count <= 1) {
        this.subscribedAssets.delete(id)
        return true
      } else {
        this.subscribedAssets.set(id, count - 1)
        return false
      }
    })

    if (assetsToUnsubscribe.length === 0) return

    const unsubscription = {
      type: 'unsubscribe',
      asset_ids: assetsToUnsubscribe,
      assets_ids: assetsToUnsubscribe,
    }

    try {
      this.ws.send(JSON.stringify(unsubscription))
      console.log('[RealtimeService] 🚫 发送取消订阅请求:', assetsToUnsubscribe.length, '个资产')
    } catch (e: any) {
      console.error('[RealtimeService] ❌ 取消订阅失败:', e.message)
    }
  }

  private startPing(): void {
    this.stopPing()
    this.pingInterval = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send('PING')
      }
    }, 10000)
  }

  private stopPing(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval)
      this.pingInterval = null
    }
  }

  /**
   * 处理消息 - ✅ 修复版本：添加详细调试日志
   */
  private handleMessage(rawData: string): void {
    try {
      // 跳过 PONG
      if (rawData === 'PONG') return

      this.debugRawCount++
      
      // ✅ 调试：打印前 10 条原始消息
      if (this.debugRawCount <= 10) {
        console.log(`[RealtimeService] 📥 原始消息 #${this.debugRawCount}:`, rawData.substring(0, 800))
      }
      
      // ✅ 调试：每 50 条消息打印一次统计
      if (this.debugRawCount % 50 === 0) {
        console.log(`[RealtimeService] 📊 统计: 原始=${this.debugRawCount}, 标准化=${this.debugNormalizedCount}, 分发=${this.debugDispatchedCount}, 监听器=${this.messageHandlers.size}`)
      }

      let parsed: any
      try {
        parsed = JSON.parse(rawData)
      } catch {
        console.debug('[RealtimeService] 📥 非 JSON 原始消息:', rawData.substring(0, 200))
        return
      }

      if (parsed.type === 'error' || parsed.event === 'error') {
        console.error('[RealtimeService] ❌ 服务器错误响应:', parsed)
        return
      }

      const messages = Array.isArray(parsed) ? parsed : [parsed]
      
      for (const msg of messages) {
        try {
          // 处理批量 price_change 消息
          if (msg.event_type === 'price_change' && Array.isArray(msg.price_changes)) {
            if (this.debugRawCount <= 10) {
              console.log(`[RealtimeService] 📊 price_change 批量消息，包含 ${msg.price_changes.length} 个价格变化`)
            }
            
            msg.price_changes.forEach((pc: any) => {
              const normalized = this.normalizeMessage({
                ...pc,
                event_type: 'price_change',
                asset_id: pc.asset_id || pc.token_id || pc.clobTokenId || msg.market
              })
              if (normalized) {
                this.debugNormalizedCount++
                this.processNormalizedMessage(normalized)
              }
            })
            continue
          }

          const marketData = this.normalizeMessage(msg)
          if (marketData) {
            this.debugNormalizedCount++
            if (this.debugNormalizedCount <= 10) {
              console.log(`[RealtimeService] ✅ 标准化消息 #${this.debugNormalizedCount}:`, {
                type: marketData.type,
                asset_id: marketData.asset_id?.substring(0, 20) + '...',
                hasData: !!marketData.data
              })
            }
            this.processNormalizedMessage(marketData)
          } else if (this.debugRawCount <= 20) {
            // ✅ 调试：打印无法标准化的消息
            console.log(`[RealtimeService] ⚠️ 无法标准化消息:`, {
              type: msg.type || msg.event_type || 'unknown',
              keys: Object.keys(msg).slice(0, 10)
            })
          }
        } catch (msgError) {
          console.error('[RealtimeService] 循环处理消息失败:', msgError, msg)
        }
      }
    } catch (error) {
      console.error('[RealtimeService] 消息处理管道崩溃:', error)
    }
  }

  /**
   * 统一处理标准化后的消息
   */
  private processNormalizedMessage(marketData: MarketData): void {
    this.updateInternalState(marketData)
    
    // ✅ 核心：分发消息给所有监听器
    const handlerCount = this.messageHandlers.size
    
    if (handlerCount === 0) {
      if (this.debugDispatchedCount === 0) {
        console.warn('[RealtimeService] ⚠️ 没有消息监听器！消息将不会被处理')
      }
    }
    
    this.messageHandlers.forEach(handler => {
      try {
        this.debugDispatchedCount++
        handler(marketData)
      } catch (e) {
        console.error('[RealtimeService] 消息处理器错误:', e)
      }
    })

    // ✅ 调试：打印前几次分发
    if (this.debugDispatchedCount <= 5) {
      console.log(`[RealtimeService] 📤 已分发消息 #${this.debugDispatchedCount} 给 ${handlerCount} 个监听器`)
    }

    const assetId = marketData.asset_id || ''

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

  /**
   * 标准化消息
   */
  private normalizeMessage(msg: any): MarketData | null {
    if (!msg || typeof msg !== 'object') return null

    const type = msg.type || msg.event || msg.event_type || 'unknown'
    const assetId = this.resolveAssetId(msg)

    if (!assetId) {
      return null
    }

    this.collectAssetAliases(assetId, msg)

    let data = msg.data || msg.payload || msg

    if (type === 'book' || msg.bids || msg.asks) {
      const bids = this.normalizeOrders(msg.bids || msg.data?.bids || [], 'bid')
      const asks = this.normalizeOrders(msg.asks || msg.data?.asks || [], 'ask')
      
      if (bids.length > 0 && asks.length > 0) {
        if (bids[0][0] >= asks[0][0]) {
          return null
        }
      }

      data = {
        bids,
        asks,
        last_update: msg.timestamp || Date.now(),
      }
    }

    if (type === 'last_trade_price' || type === 'price_change') {
      let price = 0
      let size = 0
      let side = msg.side || msg.data?.side
      let bestBid = 0
      let bestAsk = 0

      // ✅ 优先使用 best_ask/best_bid（市场价），而不是 price（成交价）
      if (msg.best_ask) bestAsk = parseFloat(msg.best_ask)
      if (msg.best_bid) bestBid = parseFloat(msg.best_bid)
      
      if (msg.price) price = parseFloat(msg.price)
      else if (msg.data?.price) price = parseFloat(msg.data.price)
      else if (msg.last_price) price = parseFloat(msg.last_price)
      
      if (msg.size) size = parseFloat(msg.size)
      else if (msg.data?.size) size = parseFloat(msg.data.size)
      else if (msg.amount) size = parseFloat(msg.amount)

      if (price === 0 && Array.isArray(msg.price_changes) && msg.price_changes.length > 0) {
        const pc = msg.price_changes[0]
        price = parseFloat(pc.price || 0)
        size = parseFloat(pc.size || 0)
        side = pc.side || side
        // ✅ 从 price_changes 中提取 best_ask/best_bid
        if (pc.best_ask) bestAsk = parseFloat(pc.best_ask)
        if (pc.best_bid) bestBid = parseFloat(pc.best_bid)
      }

      // ✅ 核心修复：优先使用 best_ask 作为市场价（买入价）
      // best_ask 是卖方最低出价，即你买入需要支付的价格
      const marketPrice = bestAsk > 0 && bestAsk < 1 ? bestAsk : (bestBid > 0 && bestBid < 1 ? bestBid : price)
      
      // 调试日志
      if (this.debugNormalizedCount <= 10) {
        console.log(`[RealtimeService] 📊 price_change 解析: price=${price}, best_ask=${bestAsk}, best_bid=${bestBid}, marketPrice=${marketPrice}`)
      }

      // 价格必须在 0-1 范围内
      if (marketPrice <= 0 || marketPrice >= 1.0) return null 

      const history = this.priceHistory.get(assetId) || []
      if (history.length > 0) {
        const lastPrice = history[history.length - 1]
        const change = Math.abs(marketPrice - lastPrice) / lastPrice
        if (change > 0.5 && lastPrice > 0.05) {
          console.warn(`[RealtimeService] ⚠️ 价格波动过大被过滤: ${lastPrice} -> ${marketPrice}`)
          return null
        }
      }

      data = {
        price: marketPrice,  // ✅ 使用市场价而不是成交价
        tradePrice: price,   // 保留原始成交价
        size,
        side,
        bestBid,
        bestAsk,
        timestamp: msg.timestamp || Date.now(),
      }
    }

    if (type === 'best_bid_ask') {
      const bidPrice = this.normalizeProbabilityPrice(parseFloat(msg.bid_price || msg.best_bid || 0))
      const askPrice = this.normalizeProbabilityPrice(parseFloat(msg.ask_price || msg.best_ask || 0))
      data = {
        bids: [[bidPrice, parseFloat(msg.bid_size || 0)]],
        asks: [[askPrice, parseFloat(msg.ask_size || 0)]],
        last_update: msg.timestamp || Date.now(),
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

  private normalizeOrders(orders: any[], side: 'bid' | 'ask'): Array<[number, number]> {
    if (!Array.isArray(orders)) return []

    const normalized = orders.map(order => {
      if (Array.isArray(order)) {
        return [this.normalizeProbabilityPrice(parseFloat(order[0]) || 0), parseFloat(order[1]) || 0] as [number, number]
      }
      if (typeof order === 'object' && order !== null) {
        return [
          this.normalizeProbabilityPrice(parseFloat(order.price || order.p || 0)),
          parseFloat(order.size || order.s || order.amount || 0),
        ] as [number, number]
      }
      return [0, 0] as [number, number]
    }).filter(([price, size]) => price > 0 && size > 0)

    if (side === 'bid') {
      return normalized.sort((a, b) => b[0] - a[0])
    } else {
      return normalized.sort((a, b) => a[0] - b[0])
    }
  }

  private normalizeProbabilityPrice(price: number): number {
    if (!Number.isFinite(price) || price <= 0) return 0
    if (price > 1 && price <= 100) return price / 100
    return price
  }

  private updateInternalState(data: MarketData): void {
    const assetId = data.asset_id || ''
    if (!assetId) return

    const ts = data.timestamp || data.data?.timestamp || Date.now()
    this.lastUpdates.set(assetId, ts)

    if (!this.priceHistory.has(assetId)) {
      this.priceHistory.set(assetId, [])
    }

    if ((data.type === 'book' || data.type === 'best_bid_ask') && data.data) {
      const book = data.data as OrderBook
      if (book.bids && book.asks && book.bids.length > 0 && book.asks.length > 0) {
        const bestBid = book.bids[0]?.[0] || 0
        const bestAsk = book.asks[0]?.[0] || 0
        book.spread = bestAsk - bestBid
        book.midPrice = (bestBid + bestAsk) / 2
        book.last_update = ts
        this.orderBooks.set(assetId, book)

        if (book.midPrice > 0) {
          const history = this.priceHistory.get(assetId) || []
          history.push(book.midPrice)
          if (history.length > 100) history.shift()
          this.priceHistory.set(assetId, history)
        }
      }
    }

    if ((data.type === 'last_trade_price' || data.type === 'price_change') && data.data?.price) {
      const price = data.data.price
      const history = this.priceHistory.get(assetId) || []
      
      const lastPrice = history.length > 0 ? history[history.length - 1] : null
      if (lastPrice && Math.abs(price - lastPrice) / lastPrice > 0.3) {
        console.warn(`[RealtimeService] ⚠️ 价格跳变过大: ${lastPrice} -> ${price}, 跳过更新`)
      } else {
        history.push(price)
        if (history.length > 100) history.shift()
        this.priceHistory.set(assetId, history)
      }
    }
  }

  analyzeMarket(assetId: string): MarketAnalysis | null {
    const book = this.orderBooks.get(assetId)
    const history = this.priceHistory.get(assetId) || []
    
    const hasBook = book && book.bids && book.asks && book.bids.length > 0 && book.asks.length > 0
    
    if (!hasBook) return null
    
    const bestBid = book.bids[0][0]
    const bestAsk = book.asks[0][0]
    
    if (bestBid <= 0 && bestAsk <= 0) return null

    const spread = Math.max(0, bestAsk - bestBid)
    const midPrice = (bestBid + bestAsk) / 2 || history[history.length - 1] || 0
    const spreadPercent = midPrice > 0 ? (spread / midPrice) * 100 : 0

    const totalBidVolume = book?.bids?.reduce((sum, [, size]) => sum + size, 0) || 0
    const totalAskVolume = book?.asks?.reduce((sum, [, size]) => sum + size, 0) || 0
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

  onMessage(handler: (data: MarketData) => void): () => void {
    this.messageHandlers.add(handler)
    console.log(`[RealtimeService] 📝 注册消息监听器，当前共 ${this.messageHandlers.size} 个`)
    return () => {
      this.messageHandlers.delete(handler)
      console.log(`[RealtimeService] 🗑️ 移除消息监听器，当前共 ${this.messageHandlers.size} 个`)
    }
  }

  onStrategy(handler: StrategyCallback): () => void {
    this.strategyHandlers.add(handler)
    return () => this.strategyHandlers.delete(handler)
  }

  onConnectionChange(handler: ConnectionCallback): () => void {
    this.connectionHandlers.add(handler)
    handler(this.status)
    return () => this.connectionHandlers.delete(handler)
  }

  getStatus(): ConnectionStatus {
    return this.status
  }

  getSubscribedAssets(): string[] {
    return Array.from(this.subscribedAssets.keys())
  }

  getOrderBook(assetId: string): OrderBook | undefined {
    return this.orderBooks.get(assetId)
  }

  getPriceHistory(assetId: string): number[] {
    return this.priceHistory.get(assetId) || []
  }

  getLastUpdate(assetId: string): number | undefined {
    const bookTs = this.orderBooks.get(assetId)?.last_update
    const lastTs = this.lastUpdates.get(assetId)
    if (bookTs == null) return lastTs
    if (lastTs == null) return bookTs
    return Math.max(bookTs, lastTs)
  }

  // ✅ 新增：获取调试状态
  getDebugStats(): { rawCount: number; normalizedCount: number; dispatchedCount: number; handlerCount: number } {
    return {
      rawCount: this.debugRawCount,
      normalizedCount: this.debugNormalizedCount,
      dispatchedCount: this.debugDispatchedCount,
      handlerCount: this.messageHandlers.size,
    }
  }
}

export const realtimeService = new RealtimeService()