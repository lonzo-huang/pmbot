export interface DipSignal {
  tokenId: string
  marketId: string
  currentPrice: number
  previousPrice: number
  dipPercent: number
  timestamp: number
  confidence: number
}

export class DipDetector {
  private slidingWindowMs: number
  private dipThreshold: number
  private minPricePoints: number
  
  private priceWindows: Map<string, Array<{ price: number; timestamp: number }>> = new Map()
  
  constructor(
    slidingWindowMs: number = 10000,
    dipThreshold: number = 0.30,
    minPricePoints: number = 3
  ) {
    this.slidingWindowMs = slidingWindowMs
    this.dipThreshold = dipThreshold
    this.minPricePoints = minPricePoints
  }
  
  addPricePoint(tokenId: string, price: number): void {
    const now = Date.now()
    const window = this.priceWindows.get(tokenId) || []
    
    window.push({ price, timestamp: now })
    
    // Remove old points outside sliding window
    const cutoff = now - this.slidingWindowMs
    const filtered = window.filter(point => point.timestamp > cutoff)
    
    this.priceWindows.set(tokenId, filtered)
  }
  
  detectDip(tokenId: string): DipSignal | null {
    const window = this.priceWindows.get(tokenId)
    
    if (!window || window.length < this.minPricePoints) {
      return null
    }
    
    // Find highest price in window
    const maxPrice = Math.max(...window.map(p => p.price))
    const currentPrice = window[window.length - 1].price
    
    // Calculate dip percentage
    const dipPercent = (maxPrice - currentPrice) / maxPrice
    
    if (dipPercent >= this.dipThreshold) {
      const confidence = this.calculateConfidence(window, dipPercent)
      
      return {
        tokenId,
        marketId: this.extractMarketId(tokenId),
        currentPrice,
        previousPrice: maxPrice,
        dipPercent,
        timestamp: Date.now(),
        confidence,
      }
    }
    
    return null
  }
  
  private calculateConfidence(window: Array<{ price: number; timestamp: number }>, dipPercent: number): number {
    // Higher confidence for:
    // 1. Larger dips
    // 2. More data points
    // 3. Recent price action
    
    const dipFactor = Math.min(dipPercent / this.dipThreshold, 1.5)
    const pointsFactor = Math.min(window.length / 10, 1)
    const recencyFactor = this.calculateRecencyFactor(window)
    
    return Math.min((dipFactor * 0.5 + pointsFactor * 0.3 + recencyFactor * 0.2), 1)
  }
  
  private calculateRecencyFactor(window: Array<{ price: number; timestamp: number }>): number {
    const now = Date.now()
    const oldestPoint = window[0]
    const newestPoint = window[window.length - 1]
    
    if (!oldestPoint || !newestPoint) return 0
    
    const windowAge = newestPoint.timestamp - oldestPoint.timestamp
    const idealWindow = this.slidingWindowMs * 0.8
    
    return Math.min(windowAge / idealWindow, 1)
  }
  
  private extractMarketId(tokenId: string): string {
    // Token ID format: conditionId-outcomeIndex
    const parts = tokenId.split('-')
    return parts[0] || tokenId
  }
  
  clear(tokenId?: string): void {
    if (tokenId) {
      this.priceWindows.delete(tokenId)
    } else {
      this.priceWindows.clear()
    }
  }
  
  getWindow(tokenId: string): Array<{ price: number; timestamp: number }> {
    return this.priceWindows.get(tokenId) || []
  }
}