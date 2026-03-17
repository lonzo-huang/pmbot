export type TradingPlatformId = 'polymarket' | 'stocks'

export type OrderSide = 'BUY' | 'SELL'
export type OrderType = 'FOK' | 'FAK' | 'GTC' | 'GTD'

export interface PlaceOrderParams {
  instrumentId: string
  side: OrderSide
  amount: number
  orderType: OrderType
  price?: number
  maxSlippage?: number
  reason?: string
}

export interface PlaceOrderResult {
  success: boolean
  orderId?: string
  error?: string
}

export interface TradingPlatform {
  id: TradingPlatformId
  placeOrder(params: PlaceOrderParams): Promise<PlaceOrderResult>
}

