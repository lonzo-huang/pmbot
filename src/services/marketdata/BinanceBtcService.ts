export interface Btc5mState {
  startTimeMs: number
  startPrice: number
  currentPrice: number
  sigmaPerSecond: number
  updatedAtMs: number
}

export class BinanceBtcService {
  private lastTickerAt = 0
  private lastCandleAt = 0
  private lastSigmaAt = 0

  private startTimeMs = 0
  private startPrice = 0
  private currentPrice = 0
  private sigmaPerSecond = 0
  
  // ✅ 调试：记录最后一次成功更新的时间
  private lastSuccessfulTickerAt = 0
  private lastSuccessfulCandleAt = 0

  async getBtc5mState(): Promise<Btc5mState | null> {
    const now = Date.now()
    await Promise.all([
      this.refreshTicker(now),
      this.refresh5mCandle(now),
      this.refreshSigma(now),
    ])

    if (!this.startTimeMs || !this.startPrice || !this.currentPrice || !this.sigmaPerSecond) {
      console.warn('[BinanceBtcService] 数据不完整:', {
        startTimeMs: this.startTimeMs,
        startPrice: this.startPrice,
        currentPrice: this.currentPrice,
        sigmaPerSecond: this.sigmaPerSecond,
      })
      return null
    }
    
    return {
      startTimeMs: this.startTimeMs,
      startPrice: this.startPrice,
      currentPrice: this.currentPrice,
      sigmaPerSecond: this.sigmaPerSecond,
      updatedAtMs: now,
    }
  }

  private async refreshTicker(now: number): Promise<void> {
    if (now - this.lastTickerAt < 1000) return
    this.lastTickerAt = now
    
    try {
      const res = await fetch('https://api.binance.com/api/v3/ticker/price?symbol=BTCUSDT')
      if (!res.ok) {
        console.warn('[BinanceBtcService] Ticker 请求失败:', res.status)
        return
      }
      const json = await res.json()
      const price = Number(json?.price)
      if (Number.isFinite(price) && price > 0) {
        this.currentPrice = price
        this.lastSuccessfulTickerAt = now
      }
    } catch (error) {
      console.warn('[BinanceBtcService] Ticker 请求异常:', error)
    }
  }

  private async refresh5mCandle(now: number): Promise<void> {
    if (now - this.lastCandleAt < 10_000) return
    this.lastCandleAt = now
    
    try {
      const res = await fetch('https://api.binance.com/api/v3/klines?symbol=BTCUSDT&interval=5m&limit=2')
      if (!res.ok) {
        console.warn('[BinanceBtcService] K线请求失败:', res.status)
        return
      }
      const klines = await res.json()
      const last = Array.isArray(klines) ? klines[klines.length - 1] : null
      if (!Array.isArray(last)) {
        console.warn('[BinanceBtcService] K线数据格式错误')
        return
      }
      
      const openTime = Number(last[0])
      const open = Number(last[1])
      
      if (Number.isFinite(openTime) && Number.isFinite(open) && open > 0) {
        this.startTimeMs = openTime
        this.startPrice = open
        this.lastSuccessfulCandleAt = now
        
        // ✅ 调试日志
        console.log('[BinanceBtcService] K线更新:', {
          openTime: new Date(openTime).toISOString(),
          open,
          currentPrice: this.currentPrice,
        })
      }
    } catch (error) {
      console.warn('[BinanceBtcService] K线请求异常:', error)
    }
  }

  private async refreshSigma(now: number): Promise<void> {
    if (now - this.lastSigmaAt < 60_000) return
    this.lastSigmaAt = now
    
    try {
      const res = await fetch('https://api.binance.com/api/v3/klines?symbol=BTCUSDT&interval=1m&limit=120')
      if (!res.ok) {
        console.warn('[BinanceBtcService] Sigma K线请求失败:', res.status)
        return
      }
      const klines = await res.json()
      if (!Array.isArray(klines) || klines.length < 20) {
        console.warn('[BinanceBtcService] Sigma K线数据不足')
        return
      }

      const closes: number[] = []
      for (const k of klines) {
        if (!Array.isArray(k)) continue
        const close = Number(k[4])
        if (Number.isFinite(close) && close > 0) closes.push(close)
      }
      if (closes.length < 20) return

      const rets: number[] = []
      for (let i = 1; i < closes.length; i++) {
        rets.push(Math.log(closes[i] / closes[i - 1]))
      }
      const sd = stddev(rets)
      if (!Number.isFinite(sd) || sd <= 0) return
      this.sigmaPerSecond = sd / Math.sqrt(60)
      
      console.log('[BinanceBtcService] Sigma 更新:', this.sigmaPerSecond.toExponential(2))
    } catch (error) {
      console.warn('[BinanceBtcService] Sigma 请求异常:', error)
    }
  }
  
  // ✅ 调试方法
  getDebugInfo(): { lastTickerAge: number; lastCandleAge: number } {
    const now = Date.now()
    return {
      lastTickerAge: this.lastSuccessfulTickerAt ? Math.round((now - this.lastSuccessfulTickerAt) / 1000) : -1,
      lastCandleAge: this.lastSuccessfulCandleAt ? Math.round((now - this.lastSuccessfulCandleAt) / 1000) : -1,
    }
  }
}

function stddev(values: number[]): number {
  if (values.length < 2) return 0
  const mean = values.reduce((a, b) => a + b, 0) / values.length
  const v = values.reduce((sum, x) => sum + (x - mean) * (x - mean), 0) / (values.length - 1)
  return Math.sqrt(v)
}

export const binanceBtcService = new BinanceBtcService()