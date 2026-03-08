import { BaseApiClient } from './baseClient'
import { ethers } from 'ethers'

export interface OrderBook {
  market_id: string
  bids: Array<[number, number]>
  asks: Array<[number, number]>
  last_update: number
}

export interface OrderResult {
  success: boolean
  order_id?: string
  tx_hash?: string
  error?: string
}

export class CLOBClient extends BaseApiClient {
  private signer: ethers.Signer | null = null

  constructor() {
    super({
      baseURL: import.meta.env.VITE_CLOB_API_URL || 'https://clob.polymarket.com',
    })
  }

  async setSigner(signer: ethers.Signer): Promise<void> {
    this.signer = signer
  }

  async getOrderBook(tokenId: string): Promise<OrderBook | null> {
    try {
      const response = await this.get<OrderBook>('/book', { token_id: tokenId })
      return response
    } catch (error) {
      console.error('Failed to get order book:', error)
      return null
    }
  }

  async placeOrder(params: {
    token_id: string
    price: number
    size: number
    side: 'BUY' | 'SELL'
    type: 'FOK' | 'FAK' | 'GTC' | 'GTD'
    expiration?: number
    signer: ethers.Signer
  }): Promise<OrderResult> {
    try {
      const signature = await this.generateSignature(params)

      const response = await this.post<OrderResult>('/order', {
        ...params,
        signature,
      })

      return response
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Order placement failed'
      return { success: false, error: errorMessage }
    }
  }

  async cancelOrder(orderId: string): Promise<OrderResult> {
    try {
      const response = await this.delete<OrderResult>(`/order/${orderId}`)
      return response
    } catch (error) {
      return { success: false, error: 'Cancel order failed' }
    }
  }

  async getOrder(orderId: string): Promise<any> {
    try {
      return await this.get(`/order/${orderId}`)
    } catch (error) {
      return null
    }
  }

  async getTrades(params: {
    market_id?: string
    limit?: number
  }): Promise<any[]> {
    try {
      const response = await this.get('/trades', params)
      return response.trades || []
    } catch (error) {
      return []
    }
  }

  private async generateSignature(params: any): Promise<string> {
    if (!this.signer) {
      throw new Error('Signer not set')
    }

    const message = JSON.stringify(params)
    const signature = await this.signer.signMessage(message)
    return signature
  }
}