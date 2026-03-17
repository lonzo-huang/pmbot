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
  private subscribedAssets: Map<string, number> = new Map() // 修复：使用引用计数 Map 替代 Set
  private pingInterval: NodeJS.Timeout | null = null
  private lastUpdates: Map<string, number> = new Map()
  private reconnectAttempts = 0
  private maxReconnectAttempts = 5
  private messageHandlers: Set<(data: MarketData) => void> = new Set()
  private strategyHandlers: Set<StrategyCallback> = new Set()
  private connectionHandlers: Set<ConnectionCallback> = new Set()

  private priceHistory: Map<string, number[]> = new Map()
  private orderBooks: Map<string, OrderBook> = new Map()

  private connectPromise: Promise<boolean> | null = null
  private reconnectTimer: NodeJS.Timeout | null = null

  private readonly WS_URL = import.meta.env.VITE_WS_URL || 'wss://ws-subscriptions-clob.polymarket.com/ws/market'
  private readonly POPULAR_ASSETS = [
    '21742633143463906290569050155826241533067272736897614950488156847949938836455',
    '48331043336612883890938759509493159234755048973500640148014422747788308965732',
  ]

  /**
   * 连接 WebSocket
   */
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

        // 【修复1】只关闭已建立或正在关闭的旧连接
        if (this.ws) {
          if (
            this.ws.readyState === WebSocket.OPEN ||
            this.ws.readyState === WebSocket.CLOSING
          ) {
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

          // ✅ 立即发送心跳
          this.startPing()
          
          // ✅ 立即订阅当前已选中的资产 (procedure step 2)
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

          // 【修复3】重连前检查 reconnectTimer 是否已存在，防止重复调度
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
    // 不要在断连时清空订阅，否则重连后不知道订什么
    // this.subscribedAssets.clear() 

    if (this.ws) {
      this.ws.close(1000)
      this.ws = null
    }

    this.setStatus('disconnected')
    this.connectPromise = null
    console.log('[RealtimeService] 已断开连接')
  }

  /**
   * 清空所有订阅
   */
  clearSubscriptions(): void {
    console.log('[RealtimeService] 🧹 清空所有订阅状态')
    const allAssets = Array.from(this.subscribedAssets.keys())
    if (allAssets.length > 0) {
      this.unsubscribe(allAssets)
    }
    this.subscribedAssets.clear()
    this.orderBooks.clear()
    this.priceHistory.clear()
  }

  /**
   * 订阅市场 (核心：确保发送订阅请求)
   */
  subscribe(assetIds: string[]): void {
    if (assetIds.length === 0) return

    const newAssetsToSubscribe: string[] = []
    
    assetIds.forEach(id => {
      const count = this.subscribedAssets.get(id) || 0
      this.subscribedAssets.set(id, count + 1)
      if (count === 0) {
        newAssetsToSubscribe.push(id)
      }
    })

    console.log(`[RealtimeService] ➕ 订阅资产请求: ${assetIds.length} 个 (新订阅: ${newAssetsToSubscribe.length})`)

    if (this.status === 'connected' && newAssetsToSubscribe.length > 0) {
      this.sendSubscription(newAssetsToSubscribe)
    }
  }

  /**
   * 发送订阅消息到服务器
   */
  private sendSubscription(assetIds: string[]): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      console.warn('[RealtimeService] ⚠️ WebSocket 未就绪，无法订阅')
      return
    }

    // ✅ 回滚：使用行情订阅专用格式 type: 'market'
    // 字段名 assets_ids 是正确的 (Polymarket CLOB 规范)
    const subscription = {
      type: 'market',
      assets_ids: assetIds
    }

    try {
      this.ws.send(JSON.stringify(subscription))
      console.log(`[RealtimeService] 📡 发送订阅请求:`, assetIds.length, '个资产', subscription)
    } catch (e: any) {
      console.error('[RealtimeService] ❌ 订阅失败:', e.message)
    }
  }

  /**
   * 取消订阅 (修复：增加引用计数，只有计数为 0 时才真正取消)
   */
  unsubscribe(assetIds: string[]): void {
    if (this.status !== 'connected' || !this.ws) {
      return
    }

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
      assets_ids: assetsToUnsubscribe,
    }

    try {
      this.ws.send(JSON.stringify(unsubscription))
      console.log('[RealtimeService] 🚫 发送取消订阅请求:', assetsToUnsubscribe.length, '个资产')
    } catch (e: any) {
      console.error('[RealtimeService] ❌ 取消订阅失败:', e.message)
    }
  }

  /**
   * 启动心跳
   */
  private startPing(): void {
    this.stopPing()
    this.pingInterval = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        // 回滚到原始心跳格式
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

      // ✅ 只要收到任何非空消息，就计入计数
      if (rawData && rawData.trim()) {
        // console.debug('[RealtimeService] 📥 原始数据:', rawData.substring(0, 500)) // 临时调试
        this.messageHandlers.forEach(handler => {
          try {
            handler({ type: 'book', asset_id: 'unknown', data: {} }) 
          } catch {}
        })
      }

      let parsed: any
      try {
        parsed = JSON.parse(rawData)
      } catch {
        console.debug('[RealtimeService] 📥 非 JSON 原始消息:', rawData.substring(0, 200))
        return
      }

      // ✅ 调试：记录解析后的数据
      if (parsed.event_type === 'price_change' || parsed.type === 'price_change') {
        // console.log('[RealtimeService] 📥 原始价格变化:', parsed)
      }

      if (parsed.type === 'error' || parsed.event === 'error') {
        console.error('[RealtimeService] ❌ 服务器错误响应:', parsed)
        return
      }

      const messages = Array.isArray(parsed) ? parsed : [parsed]
      for (const msg of messages) {
        try {
          // ✅ 核心：处理批量 price_change 消息，拆分为多个独立的 MarketData
          if (msg.event_type === 'price_change' && Array.isArray(msg.price_changes)) {
            msg.price_changes.forEach((pc: any) => {
              const normalized = this.normalizeMessage({
                ...pc,
                event_type: 'price_change',
                asset_id: pc.asset_id || pc.token_id || pc.clobTokenId || msg.market // 兜底使用市场 ID
              })
              if (normalized) this.processNormalizedMessage(normalized)
            })
            continue
          }

          const marketData = this.normalizeMessage(msg)
          if (marketData) {
            this.processNormalizedMessage(marketData)
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
    
    // ✅ 核心：分发消息给 UI (App.tsx 中的 handleMarketData 监听此处)
    this.messageHandlers.forEach(handler => {
      try {
        handler(marketData)
      } catch (e) {
        console.error('[RealtimeService] 消息处理器错误:', e)
      }
    })

    const assetId = marketData.asset_id || ''
    
    // ✅ 调试：记录成功匹配的行情
    if (['book', 'price_change', 'last_trade_price', 'best_bid_ask'].includes(marketData.type)) {
      // console.log(`[RealtimeService] 🎯 匹配行情 [${marketData.type}]: ${assetId}`, marketData.data)
    }

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
    
    // ✅ 严格校验：区分 Token ID (十进制字符串) 和 Market ID (十六进制 0x 字符串)
    // Polymarket 的行情资产 ID 总是纯数字字符串
    const rawId = msg.asset_id || msg.token_id || msg.assetId || msg.clobTokenId || ''
    const marketId = msg.market || msg.market_id || ''
    
    // 如果没有 Token ID，且 marketId 是 0x 开头的，说明是市场级别的消息，不作为行情处理
    const assetId = /^\d+$/.test(rawId) ? rawId : ''
    
    if (!assetId) {
      // 如果是市场消息，我们可以记录但不能将其作为价格点
      // console.log(`[RealtimeService] 忽略非 Token 级别的消息: ${type} for ${marketId}`)
      return null
    }

    let data = msg.data || msg.payload || msg

    if (type === 'book' || msg.bids || msg.asks) {
      const bids = this.normalizeOrders(msg.bids || msg.data?.bids || [], 'bid')
      const asks = this.normalizeOrders(msg.asks || msg.data?.asks || [], 'ask')
      
      // ✅ 修复 2：拒绝 crossed book (买价 >= 卖价)
      if (bids.length > 0 && asks.length > 0) {
        if (bids[0][0] >= asks[0][0]) {
          // console.warn('[RealtimeService] 🛡️ 拦截 Crossed Book 数据', bids[0][0], asks[0][0])
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
      // ✅ 严格解析：确保 price 仅来自价格字段，size 仅来自数量字段
      let price = 0
      let size = 0
      let side = msg.side || msg.data?.side

      if (msg.price) price = parseFloat(msg.price)
      else if (msg.data?.price) price = parseFloat(msg.data.price)
      else if (msg.last_price) price = parseFloat(msg.last_price)
      
      if (msg.size) size = parseFloat(msg.size)
      else if (msg.data?.size) size = parseFloat(msg.data.size)
      else if (msg.amount) size = parseFloat(msg.amount)

      // ✅ 修复：处理 Polymarket 5-min 特有的 price_changes 数组格式
      if (price === 0 && Array.isArray(msg.price_changes) && msg.price_changes.length > 0) {
        const pc = msg.price_changes[0]
        price = parseFloat(pc.price || 0)
        size = parseFloat(pc.size || 0)
        side = pc.side || side
      }

      // ❌ 安全拦截 1：Polymarket 价格范围是 0.01 - 0.99
      if (price <= 0 || price >= 1.0) return null 

      // ❌ 安全拦截 2：波动率检查 (防止 11c 瞬间跳到 99c)
      // 如果当前价格与历史价格偏差超过 50% (且历史已有数据)，则视为脏数据
      const history = this.priceHistory.get(assetId) || []
      if (history.length > 0) {
        const lastPrice = history[history.length - 1]
        const change = Math.abs(price - lastPrice) / lastPrice
        if (change > 0.5 && lastPrice > 0.05) { // 只有在原价不是极低时才拦截
          // console.warn(`[RealtimeService] 🛡️ 拦截异常波动: ${lastPrice} -> ${price} (ID: ${assetId})`)
          return null
        }
      }

      data = {
        price,
        size,
        side,
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

  /**
   * 标准化订单
   */
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

    // ✅ 修复 1：强制排序
    // Bids: 从高到低 (最优买价在 [0])
    // Asks: 从低到高 (最优卖价在 [0])
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

  /**
   * 更新内部状态
   */
  private updateInternalState(data: MarketData): void {
    const assetId = data.asset_id || ''
    if (!assetId) return

    const ts = data.timestamp || data.data?.timestamp || Date.now()
    this.lastUpdates.set(assetId, ts)

    // ✅ 核心：确保分析数据包含 asset_id，以便策略引擎能正确识别
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

        // 同时更新价格历史，取买卖中间价
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
      
      // ✅ 价格跳变保护：如果新旧价格差异过大，可能是脏数据
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

  /**
   * 分析市场
   */
  analyzeMarket(assetId: string): MarketAnalysis | null {
    const book = this.orderBooks.get(assetId)
    const history = this.priceHistory.get(assetId) || []
    
    // ✅ 改进：即使没有完整的订单簿，如果有价格历史也可以进行基础分析
    // 这有助于策略引擎在只有价格变化消息时也能工作
    const hasBook = book && book.bids && book.asks && book.bids.length > 0 && book.asks.length > 0
    
    // 只有在有完整订单簿时才使用订单簿价格，否则返回 null
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
}

export const realtimeService = new RealtimeService()
