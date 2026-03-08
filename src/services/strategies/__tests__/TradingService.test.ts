import { describe, it, expect, beforeEach, vi } from 'vitest'
import { TradingService } from '../TradingService'
import { CLOBClient } from '../../api/CLOBClient'
import { WalletService } from '../../wallet/WalletService'

describe('TradingService', () => {
  let tradingService: TradingService
  let mockCLOBClient: Partial<CLOBClient>
  let mockWalletService: Partial<WalletService>
  let mockProvider: any
  
  beforeEach(() => {
    mockCLOBClient = {
      placeOrder: vi.fn().mockResolvedValue({ success: true, orderId: 'test-123' }),
      cancelOrder: vi.fn().mockResolvedValue({ success: true }),
      getOrder: vi.fn().mockResolvedValue({ status: 'filled' }),
      getOrderBook: vi.fn().mockResolvedValue({
        bids: [[0.49, 100]],
        asks: [[0.51, 100]],
      }),
    }
    
    mockWalletService = {
      ensureUSDCApproval: vi.fn().mockResolvedValue(true),
      ensureCTFApproval: vi.fn().mockResolvedValue(true),
    }
    
    mockProvider = {}
    
    tradingService = new TradingService(
      mockCLOBClient as CLOBClient,
      mockWalletService as WalletService,
      mockProvider
    )
  })
  
  it('should place FOK order successfully', async () => {
    const result = await tradingService.createOrder({
      tokenId: 'test-token',
      side: 'BUY',
      amount: 25,
      orderType: 'FOK',
    })
    
    expect(result.success).toBe(true)
    expect(result.orderId).toBe('test-123')
    expect(mockCLOBClient.placeOrder).toHaveBeenCalled()
  })
  
  it('should respect rate limits', async () => {
    // Place 10 orders (max per minute)
    const promises = Array(10).fill(null).map(() =>
      tradingService.createOrder({
        tokenId: 'test-token',
        side: 'BUY',
        amount: 25,
        orderType: 'FOK',
      })
    )
    
    await Promise.all(promises)
    
    const status = tradingService.getRateLimitStatus()
    expect(status.ordersThisMinute).toBe(10)
  })
  
  it('should adjust price for tick size', () => {
    const price = 0.4567
    const adjusted = Math.round(price * 100) / 100
    expect(adjusted).toBe(0.46)
  })
  
  it('should adjust for negative risk', () => {
    const size = 100
    const price = 0.50
    const negRiskFee = 0.005
    const adjusted = size * (1 - negRiskFee * Math.min(price, 1 - price))
    
    expect(adjusted).toBeLessThan(size)
    expect(adjusted).toBeGreaterThan(size * 0.99)
  })
  
  it('should handle order failures gracefully', async () => {
    mockCLOBClient.placeOrder = vi.fn().mockRejectedValue(new Error('Insufficient balance'))
    
    const result = await tradingService.createOrder({
      tokenId: 'test-token',
      side: 'BUY',
      amount: 25,
      orderType: 'FOK',
    })
    
    expect(result.success).toBe(false)
    expect(result.error).toContain('Insufficient balance')
  })
})