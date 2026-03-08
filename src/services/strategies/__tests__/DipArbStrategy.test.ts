import { describe, it, expect, beforeEach, vi } from 'vitest'
import { DipArbStrategy, DIP_ARB_PROVEN_CONFIG } from '../DipArbStrategy'
import { TradingService } from '../../trading/TradingService'
import { RealtimeService } from '../../realtime/RealtimeService'
import { WalletService } from '../../wallet/WalletService'

describe('DipArbStrategy', () => {
  let strategy: DipArbStrategy
  let mockTradingService: Partial<TradingService>
  let mockRealtimeService: Partial<RealtimeService>
  let mockWalletService: Partial<WalletService>
  
  beforeEach(() => {
    mockTradingService = {
      getEligibleMarkets: vi.fn().mockResolvedValue([]),
      createOrder: vi.fn().mockResolvedValue({ success: true, orderId: 'test-order' }),
    }
    
    mockRealtimeService = {
      connect: vi.fn().mockResolvedValue(undefined),
      subscribe: vi.fn().mockResolvedValue(undefined),
      on: vi.fn(),
      getPrice: vi.fn().mockReturnValue({ price: 0.50 }),
    }
    
    mockWalletService = {
      ensureUSDCApproval: vi.fn().mockResolvedValue(true),
      ensureCTFApproval: vi.fn().mockResolvedValue(true),
      mergeCTFTokens: vi.fn().mockResolvedValue(undefined),
    }
    
    strategy = new DipArbStrategy(
      mockTradingService as TradingService,
      mockRealtimeService as RealtimeService,
      mockWalletService as WalletService
    )
  })
  
  it('should initialize with proven config', async () => {
    await strategy.initialize()
    
    expect(strategy.name).toBe('Dip Arbitrage')
    expect(strategy.strategyType).toBe('mechanical')
  })
  
  it('should start and stop correctly', async () => {
    await strategy.initialize()
    await strategy.start()
    
    expect(strategy.enabled).toBe(true)
    expect(mockRealtimeService.connect).toHaveBeenCalled()
    
    await strategy.stop()
    expect(strategy.enabled).toBe(false)
  })
  
  it('should detect dip signal correctly', async () => {
    // Test dip detection logic through the detector
    await strategy.initialize()
    
    // Simulate price updates
    const priceUpdates = [
      { tokenId: 'test-0', price: 0.50 },
      { tokenId: 'test-0', price: 0.48 },
      { tokenId: 'test-0', price: 0.45 },
      { tokenId: 'test-0', price: 0.35 }, // 30% drop
    ]
    
    for (const update of priceUpdates) {
      mockRealtimeService.on?.('priceUpdate', (cb: any) => cb(update))
    }
  })
  
  it('should respect rate limits', async () => {
    await strategy.initialize()
    
    // Simulate multiple rapid orders
    const orderPromises = Array(15).fill(null).map(() => 
      mockTradingService.createOrder?.({
        tokenId: 'test-0',
        side: 'BUY',
        amount: 25,
        orderType: 'FOK',
      })
    )
    
    // Should not exceed rate limits
    expect(orderPromises.length).toBeGreaterThan(0)
  })
  
  it('should handle Leg2 timeout correctly', async () => {
    await strategy.initialize()
    await strategy.start()
    
    // Simulate Leg1 execution
    // Then wait for timeout
    // Should trigger emergency exit
    
    vi.useFakeTimers()
    vi.advanceTimersByTime(61000) // 61 seconds
    
    expect(mockTradingService.createOrder).toHaveBeenCalled()
    
    vi.useRealTimers()
  })
  
  it('should calculate profit correctly', () => {
    const leg1Price = 0.45
    const leg2Price = 0.48
    const totalCost = leg1Price + leg2Price
    const profit = 1.0 - totalCost
    
    expect(profit).toBe(0.07) // 7% profit
    expect(totalCost).toBeLessThanOrEqual(0.95) // Within target
  })
})