import { BaseApiClient } from './baseClient'
import { Market } from '@/types'

interface MarketQuery {
  active?: boolean
  closed?: boolean
  limit?: number
  sort?: 'volume24hr' | 'createdAt' | 'liquidity'
  order?: 'asc' | 'desc'
}

export class GammaClient extends BaseApiClient {
  constructor() {
    super({
      baseURL: import.meta.env.VITE_GAMMA_API_URL || 'https://gamma-api.polymarket.com'
    })
  }
  
  async getMarkets(query: MarketQuery = {}): Promise<Market[]> {
    const params = {
      active: true,
      closed: false,
      limit: 100,
      sort: 'createdAt',
      order: 'desc',
      ...query
    }
    
    const response = await this.get<{ markets: Market[] }>('/markets', params)
    return response.markets || []
  }
  
  async getMarket(marketId: string): Promise<Market | null> {
    try {
      const market = await this.get<Market>(`/markets/${marketId}`)
      return market
    } catch (error) {
      console.error(`Failed to fetch market ${marketId}:`, error)
      return null
    }
  }
  
  async searchMarkets(query: string, limit = 20): Promise<Market[]> {
    const response = await this.get<{ markets: Market[] }>('/search', { q: query, limit })
    return response.markets || []
  }
  
  // 过滤符合条件的市场 (50/50 赔率)
  filterEligibleMarkets(markets: Market[]): Market[] {
    return markets.filter(market => {
      if (!market.active || market.closed) return false
      if (market.outcomePrices.length !== 2) return false
      
      const avgPrice = (market.outcomePrices[0] + market.outcomePrices[1]) / 2
      const isNear5050 = avgPrice >= 0.4 && avgPrice <= 0.6
      
      const hasLiquidity = (market.liquidity || 0) >= 1000
      
      const isRecent = {
        createdAt: new Date(market.createdAt),
        hoursOld: (Date.now() - new Date(market.createdAt).getTime()) / (1000 * 60 * 60)
      }
      const isRecentEnough = isRecent.hoursOld <= 48
      
      return isNear5050 && hasLiquidity && isRecentEnough
    })
  }
}