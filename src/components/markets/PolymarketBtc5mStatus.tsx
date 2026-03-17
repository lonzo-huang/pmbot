import React from 'react'
import { MatrixCard } from '@/components/ui/MatrixCard'
import { cn } from '@/utils/cn'
import { formatCurrency } from '@/utils/formatting'
import { useAppStore } from '@/stores/appStore'
import { realtimeService } from '@/services/realtime/RealtimeService'
import { binanceBtcService } from '@/services/marketdata/BinanceBtcService'

type StatusSnapshot = {
  updatedAtMs: number
  startTimeMs: number
  elapsedSec: number
  remainingSec: number
  startPrice: number
  currentPrice: number
  delta: number
  sigmaPerSecond: number
  sigmaRem: number
  z: number
  pYes: number
  oYes: number | null
  oNo: number | null
  edgeYes: number | null
  edgeNo: number | null
  marketLabel: string
  yesTokenId: string | null
  noTokenId: string | null
  orderbookAgeYesSec: number | null
  orderbookAgeNoSec: number | null
  realizedPnl: number
  unrealizedPnl: number
}

export const PolymarketBtc5mStatus: React.FC = () => {
  const { ui, markets, positions, trading } = useAppStore()
  const [snap, setSnap] = React.useState<StatusSnapshot | null>(null)

  React.useEffect(() => {
    if (ui.currentView !== 'markets-polymarket') return

    let alive = true
    const timer = setInterval(async () => {
      try {
        const state = await binanceBtcService.getBtc5mState()
        if (!alive) return
        if (!state) {
          setSnap(null)
          return
        }

        const market = pickBtc5mMarket(markets.activeMarkets || [])
        const yesTokenId = market?.assetIds?.[0] || null
        const noTokenId = market?.assetIds?.[1] || null
        const marketLabel = market?.question || 'BTC 5m'

        const now = Date.now()
        const elapsedSec = clamp((now - state.startTimeMs) / 1000, 0, 300)
        const remainingSec = Math.max(0, 300 - elapsedSec)

        const delta = Math.log(state.currentPrice / state.startPrice)
        const sigmaRem = state.sigmaPerSecond * Math.sqrt(Math.max(1, remainingSec))
        const z = sigmaRem > 0 ? delta / sigmaRem : 0
        const pYes = normalCdf(z)

        const oYes = yesTokenId ? bestAsk(yesTokenId) : null
        const oNo = noTokenId ? bestAsk(noTokenId) : null
        const edgeYes = oYes != null ? pYes - oYes : null
        const edgeNo = oNo != null ? (1 - pYes) - oNo : null

        const orderbookAgeYesSec = yesTokenId ? ageSec(realtimeService.getLastUpdate(yesTokenId)) : null
        const orderbookAgeNoSec = noTokenId ? ageSec(realtimeService.getLastUpdate(noTokenId)) : null

        const realizedPnl = sumRealized(trading.tradeHistory || [], state.startTimeMs, state.startTimeMs + 300_000)
        const unrealizedPnl = sumUnrealized(positions.active || [], yesTokenId, noTokenId)

        setSnap({
          updatedAtMs: state.updatedAtMs,
          startTimeMs: state.startTimeMs,
          elapsedSec,
          remainingSec,
          startPrice: state.startPrice,
          currentPrice: state.currentPrice,
          delta,
          sigmaPerSecond: state.sigmaPerSecond,
          sigmaRem,
          z,
          pYes,
          oYes,
          oNo,
          edgeYes,
          edgeNo,
          marketLabel,
          yesTokenId,
          noTokenId,
          orderbookAgeYesSec,
          orderbookAgeNoSec,
          realizedPnl,
          unrealizedPnl,
        })
      } catch {
        if (!alive) return
      }
    }, 1000)

    return () => {
      alive = false
      clearInterval(timer)
    }
  }, [ui.currentView, markets.activeMarkets, positions.active, trading.tradeHistory])

  if (ui.currentView !== 'markets-polymarket') return null

  return (
    <MatrixCard
      title="📈 BTC 5m STATUS"
      subtitle={snap ? snap.marketLabel : 'No data'}
      headerExtra={
        <div className="text-[10px] text-matrix-text-secondary font-mono text-right">
          <div>{snap ? `T-${Math.round(snap.remainingSec)}s` : 'T-—'}</div>
          <div>{snap ? new Date(snap.updatedAtMs).toLocaleTimeString() : '—'}</div>
        </div>
      }
    >
      {!snap ? (
        <div className="text-matrix-text-muted font-mono text-sm">等待 BTC 与盘口数据…</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 font-mono text-xs">
          <Box title="MODEL">
            <Row k="P_yes" v={`${(snap.pYes * 100).toFixed(1)}%`} vClass="text-matrix-success" />
            <Row k="Z" v={snap.z.toFixed(2)} />
            <Row k="σ/sec" v={snap.sigmaPerSecond.toExponential(2)} />
            <Row k="σ_rem" v={snap.sigmaRem.toExponential(2)} />
            <Row k="ΔlnP" v={snap.delta.toExponential(2)} />
          </Box>

          <Box title="MARKET ODDS">
            <Row k="O_yes" v={snap.oYes != null ? `${(snap.oYes * 100).toFixed(1)}¢` : '—'} />
            <Row k="O_no" v={snap.oNo != null ? `${(snap.oNo * 100).toFixed(1)}¢` : '—'} />
            <Row
              k="edge_yes"
              v={snap.edgeYes != null ? `${(snap.edgeYes * 100).toFixed(1)}%` : '—'}
              vClass={snap.edgeYes != null ? (snap.edgeYes > 0 ? 'text-matrix-success' : 'text-matrix-warning') : undefined}
            />
            <Row
              k="edge_no"
              v={snap.edgeNo != null ? `${(snap.edgeNo * 100).toFixed(1)}%` : '—'}
              vClass={snap.edgeNo != null ? (snap.edgeNo > 0 ? 'text-matrix-success' : 'text-matrix-warning') : undefined}
            />
            <Row k="YES age" v={snap.orderbookAgeYesSec != null ? `${snap.orderbookAgeYesSec}s` : '—'} />
            <Row k="NO age" v={snap.orderbookAgeNoSec != null ? `${snap.orderbookAgeNoSec}s` : '—'} />
          </Box>

          <Box title="ROUND PNL">
            <Row k="Realized" v={formatCurrency(snap.realizedPnl)} vClass={snap.realizedPnl >= 0 ? 'text-matrix-success' : 'text-matrix-error'} />
            <Row k="Unrealized" v={formatCurrency(snap.unrealizedPnl)} vClass={snap.unrealizedPnl >= 0 ? 'text-matrix-success' : 'text-matrix-error'} />
            <Row k="Start" v={snap.startPrice.toFixed(2)} />
            <Row k="Now" v={snap.currentPrice.toFixed(2)} />
            <Row k="t" v={`${Math.round(snap.elapsedSec)}s / 300s`} />
          </Box>
        </div>
      )}
    </MatrixCard>
  )
}

const Box: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => {
  return (
    <div className="p-3 border border-matrix-border-tertiary rounded bg-matrix-bg-tertiary/50">
      <div className="text-matrix-text-secondary mb-2">{title}</div>
      <div className="space-y-1">{children}</div>
    </div>
  )
}

const Row: React.FC<{ k: string; v: string; vClass?: string }> = ({ k, v, vClass }) => {
  return (
    <div className="flex justify-between">
      <span className="text-matrix-text-muted">{k}</span>
      <span className={cn('text-matrix-text-primary', vClass)}>{v}</span>
    </div>
  )
}

function pickBtc5mMarket(markets: Array<{ question?: string; assetIds?: string[] }>): { question?: string; assetIds?: string[] } | null {
  for (const m of markets) {
    const q = (m.question || '').toLowerCase()
    const isBtc = q.includes('bitcoin') || q.includes('btc')
    const is5m = /(5\s*(min|m)\b|5-minute)/i.test(q)
    if (isBtc && is5m && (m.assetIds?.length || 0) >= 2) return m
  }
  return null
}

function bestAsk(tokenId: string): number | null {
  const book = realtimeService.getOrderBook(tokenId)
  const ask = book?.asks?.[0]?.[0] || 0
  if (ask > 0 && ask < 1) return ask
  if (ask > 1 && ask <= 100) return ask / 100
  const history = realtimeService.getPriceHistory(tokenId)
  const last = history.length > 0 ? history[history.length - 1] : 0
  if (last > 0 && last < 1) return last
  if (last > 1 && last <= 100) return last / 100
  return null
}

function ageSec(ts?: number): number | null {
  if (!ts) return null
  return Math.max(0, Math.round((Date.now() - ts) / 1000))
}

function sumRealized(trades: Array<{ timestamp: number; type: string; pnl?: number }>, startMs: number, endMs: number): number {
  return trades
    .filter(t => t.timestamp >= startMs && t.timestamp < endMs)
    .filter(t => t.type === 'sell' && typeof t.pnl === 'number')
    .reduce((sum, t) => sum + (t.pnl || 0), 0)
}

function sumUnrealized(active: Array<{ tokenId: string; pnl: number }>, yesTokenId: string | null, noTokenId: string | null): number {
  const ids = new Set([yesTokenId, noTokenId].filter(Boolean) as string[])
  if (ids.size === 0) return 0
  return active.filter(p => ids.has(p.tokenId)).reduce((sum, p) => sum + (p.pnl || 0), 0)
}

function normalCdf(z: number): number {
  return 0.5 * (1 + erf(z / Math.SQRT2))
}

function erf(x: number): number {
  const sign = x >= 0 ? 1 : -1
  const ax = Math.abs(x)
  const a1 = 0.254829592
  const a2 = -0.284496736
  const a3 = 1.421413741
  const a4 = -1.453152027
  const a5 = 1.061405429
  const p = 0.3275911
  const t = 1 / (1 + p * ax)
  const y = 1 - (((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t) * Math.exp(-ax * ax)
  return sign * y
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v))
}

