/**
 * Polymarket 热门市场服务
 * 放置位置：src/components/markets/PopularMarketsService.ts
 *
 * 修复（根据 API 实际返回数据）：
 * 1. clobTokenIds 是 JSON 字符串不是数组，需 JSON.parse()
 * 2. 24h 成交量字段是 volume24hr，不是 volume24h
 * 3. liquidity/volume 是字符串，用 liquidityNum/volumeNum 取数值
 */

export interface PopularMarket {
  id: string
  question: string
  slug: string
  volume24h: number
  liquidity: number
  category: string
  assetIds: string[]
  endDate: string
  imageUrl?: string
}

export class PopularMarketsService {
  private readonly GAMMA_API = '/api/gamma/markets'

  async getPopularMarkets(limit: number = 10): Promise<PopularMarket[]> {
    try {
      const response = await fetch(
        `${this.GAMMA_API}?limit=200&active=true&closed=false`,
        {
          method: 'GET',
          headers: { 'Accept': 'application/json' },
        }
      )

      if (!response.ok) {
        throw new Error(`API request failed: ${response.status}`)
      }

      const raw = await response.json()

      // API 直接返回数组
      const markets: any[] = Array.isArray(raw) ? raw : (raw.data ?? raw.markets ?? [])

      if (markets.length === 0) {
        console.warn('[PopularMarketsService] Empty markets array. Raw keys:', Object.keys(raw))
        return []
      }

      const popular = markets
        .filter((m: any) => {
          if (m.active === false || m.closed === true) return false
          if (!m.acceptingOrders) return false

          // volumeNum / liquidityNum 是数值型字段
          const vol = m.volumeNum ?? 0
          const liq = m.liquidityNum ?? 0

          if (vol < 1000) return false
          if (liq < 100) return false

          const assetIds = this.extractAssetIds(m)
          return assetIds.length >= 1
        })
        // 综合评分排序：24h成交量(50%) + 流动性(30%) + 总成交量(20%)
        .sort((a: any, b: any) => {
          const scoreOf = (m: any) => {
            const vol24h = m.volume24hr ?? 0
            const liq = m.liquidityNum ?? 0
            const volTotal = m.volumeNum ?? 0
            // 归一化后加权，避免某个超大值完全主导
            return vol24h * 0.5 + liq * 0.3 + volTotal * 0.001 * 0.2
          }
          return scoreOf(b) - scoreOf(a)
        })
        .slice(0, limit)
        .map((m: any) => ({
          id: m.id ?? m.conditionId ?? '',
          question: m.question ?? m.title ?? 'Unknown Market',
          slug: m.slug ?? '',
          volume24h: m.volume24hr ?? m.volumeNum ?? 0,
          liquidity: m.liquidityNum ?? 0,
          category: this.inferCategory(m),
          assetIds: this.extractAssetIds(m),
          endDate: m.endDateIso ?? m.endDate ?? '',
          imageUrl: m.image ?? m.icon,
        }))

      console.log(`[PopularMarketsService] Found ${popular.length} popular markets`)
      return popular
    } catch (error) {
      console.error('[PopularMarketsService] Failed to fetch popular markets:', error)
      return []
    }
  }

  private extractAssetIds(market: any): string[] {
    // 【核心修复】clobTokenIds 是 JSON 字符串，必须先 JSON.parse()
    // API 返回格式：'["75467...", "38429..."]'，不是数组
    const raw = market.clobTokenIds
    if (raw) {
      try {
        const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw
        if (Array.isArray(parsed)) {
          return parsed.filter((id: any) => typeof id === 'string' && id.length > 0)
        }
      } catch {
        console.warn('[PopularMarketsService] Failed to parse clobTokenIds:', raw)
      }
    }

    // fallback：tokens / outcomes 数组格式
    const tokens = market.tokens ?? market.outcomes ?? []
    if (Array.isArray(tokens)) {
      return tokens
        .map((t: any) => {
          if (typeof t === 'string') return t
          return t.token_id ?? t.id ?? t.assetId ?? t.tokenId ?? ''
        })
        .filter(Boolean)
    }

    return []
  }

  private inferCategory(market: any): string {
    if (market.category) return market.category

    const question = (market.question ?? '').toLowerCase()
    if (/bitcoin|ethereum|crypto|btc|eth|sol|polygon/.test(question)) return 'crypto'
    if (/election|president|congress|senate|vote/.test(question)) return 'politics'
    if (/fed|rate|gdp|inflation|economy/.test(question)) return 'economics'
    if (/nba|nfl|mlb|soccer|sport/.test(question)) return 'sports'
    return 'other'
  }
}

export const popularMarketsService = new PopularMarketsService()