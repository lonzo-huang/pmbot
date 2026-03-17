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

  async getBtc5mState(): Promise<Btc5mState | null> {
    const now = Date.now()
    await Promise.all([
      this.refreshTicker(now),
      this.refresh5mCandle(now),
      this.refreshSigma(now),
    ])

    if (!this.startTimeMs || !this.startPrice || !this.currentPrice || !this.sigmaPerSecond) return null
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
      if (!res.ok) return
      const json = await res.json()
      const price = Number(json?.price)
      if (Number.isFinite(price) && price > 0) this.currentPrice = price
    } catch {}
  }

  private async refresh5mCandle(now: number): Promise<void> {
    if (now - this.lastCandleAt < 10_000) return
    this.lastCandleAt = now
    try {
      const res = await fetch('https://api.binance.com/api/v3/klines?symbol=BTCUSDT&interval=5m&limit=2')
      if (!res.ok) return
      const klines = await res.json()
      const last = Array.isArray(klines) ? klines[klines.length - 1] : null
      if (!Array.isArray(last)) return
      const openTime = Number(last[0])
      const open = Number(last[1])
      if (Number.isFinite(openTime) && Number.isFinite(open) && open > 0) {
        this.startTimeMs = openTime
        this.startPrice = open
      }
    } catch {}
  }

  private async refreshSigma(now: number): Promise<void> {
    if (now - this.lastSigmaAt < 60_000) return
    this.lastSigmaAt = now
    try {
      const res = await fetch('https://api.binance.com/api/v3/klines?symbol=BTCUSDT&interval=1m&limit=120')
      if (!res.ok) return
      const klines = await res.json()
      if (!Array.isArray(klines) || klines.length < 20) return

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
    } catch {}
  }
}

function stddev(values: number[]): number {
  if (values.length < 2) return 0
  const mean = values.reduce((a, b) => a + b, 0) / values.length
  const v = values.reduce((sum, x) => sum + (x - mean) * (x - mean), 0) / (values.length - 1)
  return Math.sqrt(v)
}

export const binanceBtcService = new BinanceBtcService()

