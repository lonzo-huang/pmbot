import { Market } from '@/types'
import { GammaClient } from '../api/gammaClient'

export interface ScanResult {
  market: Market
  eligible: boolean
  score: number
  reason?: string
}

export class MarketScanner {
  private gammaClient: GammaClient
  private lastScanTime: Date | null = null
  private scannedMarketIds = new Set<string>()

  constructor(gammaClient: GammaClient) {
    this.gammaClient = gammaClient
  }

  async scan(): Promise<ScanResult[]> {
    try {
      const markets = await this.gammaClient.getMarkets({
        active: true,
        closed: false,
        limit: 100,
        sort: 'createdAt',
        order: 'desc',
      })

      const results: ScanResult[] = markets.map(market => ({
        market,
        eligible: this.isEligible(market),
        score: this.calculateScore(market),
        reason: this.getEligibilityReason(market),
      }))

      this.lastScanTime = new Date()
      return results
    } catch (error) {
      console.error('Market scan failed:', error)
      return []
    }
  }

  private isEligible(market: Market): boolean {
    if (!market.active || market.closed) return false
    if (market.outcomePrices.length !== 2) return false

    const avgPrice = (market.outcomePrices[0] + market.outcomePrices[1]) / 2
    const isNear5050 = avgPrice >= 0.4 && avgPrice <= 0.6

    const hasLiquidity = (market.liquidity || 0) >= 1000

    return isNear5050 && hasLiquidity
  }

  private calculateScore(market: Market): number {
    let score = 0

    // Liquidity score (0-40)
    const liquidityScore = Math.min((market.liquidity || 0) / 5000, 1) * 40
    score += liquidityScore

    // Volume score (0-30)
    const volumeScore = Math.min((market.volume || 0) / 10000, 1) * 30
    score += volumeScore

    // Odds balance score (0-30)
    const avgPrice = (market.outcomePrices[0] + market.outcomePrices[1]) / 2
    const oddsScore = (1 - Math.abs(0.5 - avgPrice) * 2) * 30
    score += oddsScore

    return score
  }

  private getEligibilityReason(market: Market): string {
    if (!market.active) return 'Market not active'
    if (market.closed) return 'Market closed'
    if (market.outcomePrices.length !== 2) return 'Not binary market'

    const avgPrice = (market.outcomePrices[0] + market.outcomePrices[1]) / 2
    if (avgPrice < 0.4 || avgPrice > 0.6) return 'Odds not balanced'

    if ((market.liquidity || 0) < 1000) return 'Insufficient liquidity'

    return 'Eligible'
  }

  getLastScanTime(): Date | null {
    return this.lastScanTime
  }
}