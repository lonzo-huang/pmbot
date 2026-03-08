/**
 * Polymarket WebSocket 实时行情服务
 * 基于官方文档：wss://ws-subscriptions-clob.polymarket.com/ws/market
 */

export interface MarketData {
  type: 'book' | 'price_change' | 'tick_size_change' | 'last_trade_price' | 'best_bid_ask' | 'new_market' | 'market_resolved'
  asset_id?: string
  data?: any
  timestamp?: number
}

export interface OrderBook {
  bids: Array<[number, number]>  // [price, size]
  asks: Array<[number, number]>
  last_update: number
}

export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error'

export class RealtimeService {
  private ws: WebSocket | null = null
  private status: ConnectionStatus = 'disconnected'
  private subscribedAssets: Set<string> = new Set()
  private pingInterval: NodeJS.Timeout | null = null
  private reconnectAttempts = 0
  private maxReconnectAttempts = 5
  private messageHandlers: Set<(data: MarketData) => void> = new Set()
  
  // WebSocket 端点
  private readonly WS_URL = 'wss://ws-subscriptions-clob.polymarket.com/ws/market'
  
  // 热门市场资产 ID（示例）
  private readonly POPULAR_ASSETS = [
    // BTC $100K by 2026
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
          
          // 启动心跳
          this.startPing()
          
          // 发送订阅
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
          
          // 自动重连
          if (this.reconnectAttempts < this.maxReconnectAttempts) {
            this.reconnectAttempts++
            console.log(`[RealtimeService] ${this.reconnectAttempts}s 后重连...`)
            setTimeout(() => this.connect(), this.reconnectAttempts * 1000)
          }
        }

        // 连接超时
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
   * 启动心跳（每 10 秒发送 PING）
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
   * 处理接收到的消息
   */
  private handleMessage(data: string): void {
    try {
      // 处理 PONG 响应
      if (data === 'PONG') {
        console.log('[RealtimeService] 🏓 PONG')
        return
      }

      const message: MarketData = JSON.parse(data)
      console.log('[RealtimeService] 📨 收到消息:', message.type, message.asset_id ? message.asset_id.substring(0, 20) + '...' : '')

      // 通知所有监听器
      this.messageHandlers.forEach(handler => handler(message))

    } catch (error) {
      console.error('[RealtimeService] 消息解析失败:', error)
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
}

// 导出单例
export const realtimeService = new RealtimeService()