import { tradingService } from '@/services/trading/TradingService'
import type { PlaceOrderParams, PlaceOrderResult, TradingPlatform } from './types'

export class PolymarketPlatform implements TradingPlatform {
  id: TradingPlatform['id'] = 'polymarket'

  async placeOrder(params: PlaceOrderParams): Promise<PlaceOrderResult> {
    const result = await tradingService.createOrder({
      tokenId: params.instrumentId,
      side: params.side,
      amount: params.amount,
      orderType: params.orderType,
      price: params.price,
      maxSlippage: params.maxSlippage,
      reason: params.reason,
    })

    return {
      success: result.success,
      orderId: result.orderId,
      error: result.error,
    }
  }
}

export const polymarketPlatform = new PolymarketPlatform()

