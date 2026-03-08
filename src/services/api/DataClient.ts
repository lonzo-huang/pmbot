import { BaseApiClient } from './baseClient'

export interface Position {
  asset: string
  conditionId: string
  title: string
  size: number
  avgPrice: number
  curPrice?: number
  cashPnl: number
  percentPnl: number
  outcomeIndex: number
  lastUpdated: string
}

export interface Trade {
  id: string
  marketId: string
  tokenId: string
  side: 'BUY' | 'SELL'
  size: number
  price: number
  fee: number
  timestamp: string
  transactionHash: string
}

export class DataClient extends BaseApiClient {
  constructor() {
    super({
      baseURL: import.meta.env.VITE_DATA_API_URL || 'https://data-api.polymarket.com',
    })
  }

  async getPositions(walletAddress: string): Promise<Position[]> {
    try {
      const response = await this.get<{ positions: Position[] }>('/positions', {
        user: walletAddress,
      })
      return response.positions || []
    } catch (error) {
      console.error('Failed to get positions:', error)
      return []
    }
  }

  async getTrades(
    walletAddress: string,
    limit: number = 100
  ): Promise<Trade[]> {
    try {
      const response = await this.get<{ trades: Trade[] }>('/trades', {
        user: walletAddress,
        limit,
      })
      return response.trades || []
    } catch (error) {
      console.error('Failed to get trades:', error)
      return []
    }
  }

  async getPortfolio(walletAddress: string): Promise<any> {
    try {
      return await this.get('/portfolio', { user: walletAddress })
    } catch (error) {
      return null
    }
  }

  async getMarketDetails(conditionId: string): Promise<any> {
    try {
      return await this.get(`/markets/${conditionId}`)
    } catch (error) {
      return null
    }
  }
}