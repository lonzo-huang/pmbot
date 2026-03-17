import type { PlaceOrderParams, PlaceOrderResult, TradingPlatform } from './types'

export class StockPlatform implements TradingPlatform {
  id: TradingPlatform['id'] = 'stocks'

  async placeOrder(_params: PlaceOrderParams): Promise<PlaceOrderResult> {
    return { success: false, error: 'Stock platform not implemented' }
  }
}

export const stockPlatform = new StockPlatform()

