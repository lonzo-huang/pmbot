import { EventEmitter } from 'events'

export interface PriceUpdate {
  tokenId: string
  marketId: string
  price: number
  bid: number
  ask: number
  volume: number
  timestamp: number
}

export interface OrderBookUpdate {
  tokenId: string
  bids: Array<[number, number]>  // [price, size]
  asks: Array<[number, number]>
  timestamp: number
}

export interface TradeUpdate {
  tokenId: string
  price: number
  size: number
  side: 'BUY' | 'SELL'
  timestamp: number
}

interface WebSocketMessage {
  type: 'price' | 'orderbook' | 'trade' | 'ping' | 'pong'
  data: any
}

export class RealtimeService extends EventEmitter {
  private ws: WebSocket | null = null
  private wsUrl: string
  private subscriptions: Set<string> = new Set()
  private priceCache: Map<string, PriceUpdate> = new Map()
  private orderBookCache: Map<string, OrderBookUpdate> = new Map()
  
  private reconnectAttempts: number = 0
  private maxReconnectAttempts: number = 10
  private reconnectDelay: number = 1000
  private pingInterval: number = 5000
  private pingTimer: NodeJS.Timeout | null = null
  private lastPongTime: number = 0
  
  private isConnected: boolean = false
  private isConnecting: boolean = false
  
  constructor(wsUrl: string = 'wss://ws.polymarket.com') {
    super()
    this.wsUrl = wsUrl
  }
  
  async connect(): Promise<void> {
    if (this.isConnected || this.isConnecting) {
      return
    }
    
    this.isConnecting = true
    this.emit('connecting')
    
    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(this.wsUrl)
        
        this.ws.onopen = () => {
          console.log('[WebSocket] Connected')
          this.isConnected = true
          this.isConnecting = false
          this.reconnectAttempts = 0
          this.lastPongTime = Date.now()
          this.startPingInterval()
          this.emit('connected')
          this.resubscribeAll()
          resolve()
        }
        
        this.ws.onmessage = (event) => {
          this.handleMessage(event.data)
        }
        
        this.ws.onclose = (event) => {
          console.log(`[WebSocket] Disconnected: ${event.code} ${event.reason}`)
          this.isConnected = false
          this.isConnecting = false
          this.stopPingInterval()
          this.emit('disconnected', { code: event.code, reason: event.reason })
          this.attemptReconnect()
        }
        
        this.ws.onerror = (error) => {
          console.error('[WebSocket] Error:', error)
          this.emit('error', { error })
          reject(error)
        }
        
        // Connection timeout
        setTimeout(() => {
          if (this.isConnecting && !this.isConnected) {
            reject(new Error('WebSocket connection timeout'))
          }
        }, 10000)
        
      } catch (error) {
        this.isConnecting = false
        reject(error)
      }
    })
  }
  
  private handleMessage(data: string): void {
    try {
      const message: WebSocketMessage = JSON.parse(data)
      
      switch (message.type) {
        case 'price':
          this.handlePriceUpdate(message.data)
          break
        case 'orderbook':
          this.handleOrderBookUpdate(message.data)
          break
        case 'trade':
          this.handleTradeUpdate(message.data)
          break
        case 'pong':
          this.lastPongTime = Date.now()
          break
      }
    } catch (error) {
      console.error('[WebSocket] Failed to parse message:', error)
    }
  }
  
  private handlePriceUpdate(data: any): void {
    const update: PriceUpdate = {
      tokenId: data.token_id,
      marketId: data.market_id,
      price: data.price,
      bid: data.bid,
      ask: data.ask,
      volume: data.volume,
      timestamp: data.timestamp || Date.now(),
    }
    
    this.priceCache.set(update.tokenId, update)
    this.emit('priceUpdate', update)
  }
  
  private handleOrderBookUpdate(data: any): void {
    const update: OrderBookUpdate = {
      tokenId: data.token_id,
      bids: data.bids,
      asks: data.asks,
      timestamp: data.timestamp || Date.now(),
    }
    
    this.orderBookCache.set(update.tokenId, update)
    this.emit('orderBookUpdate', update)
  }
  
  private handleTradeUpdate(data: any): void {
    const update: TradeUpdate = {
      tokenId: data.token_id,
      price: data.price,
      size: data.size,
      side: data.side,
      timestamp: data.timestamp || Date.now(),
    }
    
    this.emit('tradeUpdate', update)
  }
  
  async subscribe(tokenId: string): Promise<void> {
    if (!this.isConnected) {
      throw new Error('WebSocket not connected')
    }
    
    this.subscriptions.add(tokenId)
    
    const message = {
      type: 'subscribe',
      token_ids: [tokenId],
    }
    
    this.ws?.send(JSON.stringify(message))
    console.log(`[WebSocket] Subscribed to ${tokenId}`)
  }
  
  async unsubscribe(tokenId: string): Promise<void> {
    this.subscriptions.delete(tokenId)
    
    const message = {
      type: 'unsubscribe',
      token_ids: [tokenId],
    }
    
    this.ws?.send(JSON.stringify(message))
    console.log(`[WebSocket] Unsubscribed from ${tokenId}`)
  }
  
  private async resubscribeAll(): Promise<void> {
    for (const tokenId of this.subscriptions) {
      await this.subscribe(tokenId)
    }
  }
  
  private attemptReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('[WebSocket] Max reconnection attempts reached')
      this.emit('maxReconnectAttemptsReached')
      return
    }
    
    this.reconnectAttempts++
    const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1)
    
    console.log(`[WebSocket] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`)
    
    setTimeout(async () => {
      try {
        await this.connect()
      } catch (error) {
        console.error('[WebSocket] Reconnection failed:', error)
      }
    }, delay)
  }
  
  private startPingInterval(): void {
    this.stopPingInterval()
    
    this.pingTimer = setInterval(() => {
      if (!this.isConnected) return
      
      const timeSinceLastPong = Date.now() - this.lastPongTime
      
      if (timeSinceLastPong > this.pingInterval * 3) {
        console.warn('[WebSocket] Connection stale, reconnecting...')
        this.ws?.close()
        return
      }
      
      this.ws?.send(JSON.stringify({ type: 'ping' }))
    }, this.pingInterval)
  }
  
  private stopPingInterval(): void {
    if (this.pingTimer) {
      clearInterval(this.pingTimer)
      this.pingTimer = null
    }
  }
  
  getPrice(tokenId: string): PriceUpdate | null {
    return this.priceCache.get(tokenId) || null
  }
  
  getOrderBook(tokenId: string): OrderBookUpdate | null {
    return this.orderBookCache.get(tokenId) || null
  }
  
  getAllPrices(): Map<string, PriceUpdate> {
    return new Map(this.priceCache)
  }
  
  disconnect(): void {
    this.stopPingInterval()
    this.ws?.close()
    this.ws = null
    this.isConnected = false
    this.subscriptions.clear()
    this.priceCache.clear()
    this.orderBookCache.clear()
  }
  
  getStatus(): {
    isConnected: boolean
    subscriptions: number
    cachedPrices: number
    reconnectAttempts: number
  } {
    return {
      isConnected: this.isConnected,
      subscriptions: this.subscriptions.size,
      cachedPrices: this.priceCache.size,
      reconnectAttempts: this.reconnectAttempts,
    }
  }
}