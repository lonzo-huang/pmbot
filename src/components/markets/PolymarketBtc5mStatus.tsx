import React from 'react'
import { MatrixCard } from '@/components/ui/MatrixCard'
import { cn } from '@/utils/cn'
import { formatCurrency } from '@/utils/formatting'
import { useAppStore } from '@/stores/appStore'
import { realtimeService } from '@/services/realtime/RealtimeService'
import { binanceBtcService } from '@/services/marketdata/BinanceBtcService'
import type { PolymarketMarketMetadata } from '@/services/platforms/polymarketUtils'

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
  const { ui, polymarket } = useAppStore()
  const [snap, setSnap] = React.useState<StatusSnapshot | null>(null)
  const [connectionStatus, setConnectionStatus] = React.useState<string>('disconnected')
  const metadata = polymarket.btc5m.metadata
  const subscribed = polymarket.btc5m.subscribed
  const subscriptionError = polymarket.btc5m.lastError

  // ✅ 监听 WebSocket 连接状态
  React.useEffect(() => {
    const unsubscribe = realtimeService.onConnectionChange((status) => {
      setConnectionStatus(status)
    })
    return unsubscribe
  }, [])

  React.useEffect(() => {
    if (ui.currentView !== 'markets-polymarket') return

    let alive = true
    let debugCount = 0
    
    const timer = setInterval(async () => {
      try {
        const state = await binanceBtcService.getBtc5mState()
        if (!alive) return
        if (!state) {
          setSnap(null)
          return
        }

        // ✅ 核心修复：在 interval 内部重新获取最新的 Store 状态
        // 不能使用闭包中的 markets.activeMarkets，因为它可能是过时的
        const currentStore = useAppStore.getState()
        const currentActiveMarkets = currentStore.markets.activeMarkets || []
        const currentMetadata = currentStore.polymarket.btc5m.metadata

        // ✅ 使用 metadata 获取 token IDs
        const yesTokenId = currentMetadata?.assetIds?.[0] || null
        const noTokenId = currentMetadata?.assetIds?.[1] || null
        const marketLabel = currentMetadata?.question || 'BTC 5m'

        // 查找 activeMarkets 中匹配的市场（用于获取实时价格）
        const matchingMarket = currentActiveMarkets.find(m => 
          m.assetIds?.includes(yesTokenId!) || m.assetIds?.includes(noTokenId!)
        )

        // ✅ 调试
        const subscribedAssets = realtimeService.getSubscribedAssets()
        
        debugCount++
        if (debugCount <= 5 || debugCount % 10 === 0) {
          console.log('[BTC5mStatus] 数据来源:', {
            activeMarketsCount: currentActiveMarkets.length,
            metadata: currentMetadata ? { question: currentMetadata.question?.substring(0, 40) } : null,
            matchingMarket: matchingMarket ? { question: matchingMarket.question?.substring(0, 40), outcomePrices: matchingMarket.outcomePrices } : null,
            yesTokenId: yesTokenId?.substring(0, 20) + '...',
            subscribedCount: subscribedAssets.length,
            wsStatus: realtimeService.getStatus(),
          })
        }

        const now = Date.now()
        const elapsedSec = clamp((now - state.startTimeMs) / 1000, 0, 300)
        const remainingSec = Math.max(0, 300 - elapsedSec)

        const delta = Math.log(state.currentPrice / state.startPrice)
        const sigmaRem = state.sigmaPerSecond * Math.sqrt(Math.max(1, remainingSec))
        const z = sigmaRem > 0 ? delta / sigmaRem : 0
        const pYes = normalCdf(z)

        // ✅ 核心修复：直接从 matchingMarket.outcomePrices 获取价格
        // 这与 MARKETS 面板使用相同的数据源，确保同步
        let oYes: number | null = null
        let oNo: number | null = null

        // 🔍 调试：检查 matchingMarket 的完整结构
        if (debugCount <= 5 || debugCount % 10 === 0) {
          console.log('[BTC5mStatus] matchingMarket 数据:', {
            found: !!matchingMarket,
            question: matchingMarket?.question?.substring(0, 40),
            outcomePrices: matchingMarket?.outcomePrices,
          })
        }

        // 方法1: 从 matchingMarket.outcomePrices 获取（与 MARKETS 面板同步）
        if (matchingMarket?.outcomePrices && matchingMarket.outcomePrices.length >= 2) {
          const rawYes = matchingMarket.outcomePrices[0]
          const rawNo = matchingMarket.outcomePrices[1]
          const yesPrice = typeof rawYes === 'string' ? parseFloat(rawYes) : rawYes
          const noPrice = typeof rawNo === 'string' ? parseFloat(rawNo) : rawNo
          
          if (debugCount <= 5 || debugCount % 10 === 0) {
            console.log('[BTC5mStatus] outcomePrices 解析:', {
              rawYes, rawNo,
              parsedYes: yesPrice,
              parsedNo: noPrice,
            })
          }
          
          if (!isNaN(yesPrice) && yesPrice > 0) oYes = yesPrice
          if (!isNaN(noPrice) && noPrice > 0) oNo = noPrice
        }
        
        // 方法2: 备选 - 从 realtimeService 获取
        if (oYes === null && yesTokenId) {
          oYes = bestAsk(yesTokenId)
          if (debugCount <= 5) console.log('[BTC5mStatus] ⚠️ YES 使用 realtimeService fallback:', oYes)
        }
        if (oNo === null && noTokenId) {
          oNo = bestAsk(noTokenId)
          if (debugCount <= 5) console.log('[BTC5mStatus] ⚠️ NO 使用 realtimeService fallback:', oNo)
        }

        if (debugCount <= 5 || debugCount % 10 === 0) {
          console.log('[BTC5mStatus] 最终价格:', { oYes, oNo, pYes: pYes.toFixed(3) })
        }

        const edgeYes = oYes != null ? pYes - oYes : null
        const edgeNo = oNo != null ? (1 - pYes) - oNo : null

        // ✅ 如果从 Store 获取价格，age 显示为 0（实时）
        // 只有当 fallback 到 realtimeService 时才显示真实的 age
        const usingStorePrice = matchingMarket?.outcomePrices && matchingMarket.outcomePrices.length >= 2
        const orderbookAgeYesSec = usingStorePrice ? 0 : (yesTokenId ? ageSec(realtimeService.getLastUpdate(yesTokenId)) : null)
        const orderbookAgeNoSec = usingStorePrice ? 0 : (noTokenId ? ageSec(realtimeService.getLastUpdate(noTokenId)) : null)

        // ✅ 从 Store 获取最新的 trading 和 positions 状态
        const currentTrading = currentStore.trading
        const currentPositions = currentStore.positions

        const realizedPnl = sumRealized(currentTrading.tradeHistory || [], state.startTimeMs, state.startTimeMs + 300_000)
        const unrealizedPnl = sumUnrealized(currentPositions.active || [], yesTokenId, noTokenId)

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
      } catch (err) {
        console.error('[BTC5mStatus] 更新错误:', err)
        if (!alive) return
      }
    }, 1000)

    return () => {
      alive = false
      clearInterval(timer)
    }
  }, [ui.currentView]) // ✅ 简化 dependencies，因为我们在 interval 内部获取最新状态

  if (ui.currentView !== 'markets-polymarket') return null

  // ✅ 检查是否有 BTC 5m 市场数据
  const hasMetadata = !!metadata?.assetIds?.length
  const wsConnected = connectionStatus === 'connected'

  return (
    <MatrixCard
      title="📈 BTC 5M STATUS"
      subtitle={snap ? snap.marketLabel : 'No data'}
      headerExtra={
        <div className="text-[10px] text-matrix-text-secondary font-mono text-right">
          <div>{snap ? `T-${Math.round(snap.remainingSec)}s` : 'T-—'}</div>
          <div>{snap ? new Date(snap.updatedAtMs).toLocaleTimeString() : '—'}</div>
        </div>
      }
    >
      {/* ✅ 显示连接状态提示 */}
      {!wsConnected && hasMetadata && (
        <div className="text-matrix-warning font-mono text-sm mb-2">
          ⚠️ WebSocket 未连接，请点击 CONNECT 并订阅 BTC 5m 市场
        </div>
      )}
      {!hasMetadata && (
        <div className="text-matrix-warning font-mono text-sm mb-2">
          ⚠️ 未找到 BTC 5m 市场数据
        </div>
      )}
      
      {!snap ? (
        <div className="text-matrix-text-muted font-mono text-sm">
          {subscriptionError ? `订阅失败: ${subscriptionError}` : subscribed ? '等待 BTC 与盘口数据…' : '尚未订阅 BTC 5m 市场'}
        </div>
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
            <Row
              k="Δ price"
              v={(snap.currentPrice - snap.startPrice).toFixed(2)}
              vClass={snap.currentPrice >= snap.startPrice ? 'text-matrix-success' : 'text-matrix-error'}
            />
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

function bestAsk(tokenId: string): number | null {
  const book = realtimeService.getOrderBook(tokenId)
  const history = realtimeService.getPriceHistory(tokenId)
  const lastUpdate = realtimeService.getLastUpdate(tokenId) || 0
  
  // 获取订单簿的 best ask
  let bookAsk: number | null = null
  let bookTime = 0
  if (book?.asks && book.asks.length > 0) {
    const ask = book.asks[0][0]
    if (ask > 0 && ask < 1) bookAsk = ask
    else if (ask > 1 && ask <= 100) bookAsk = ask / 100
    bookTime = book.last_update || 0
  }
  
  // 获取价格历史的最新价格
  let historyPrice: number | null = null
  if (history.length > 0) {
    const last = history[history.length - 1]
    if (last > 0 && last < 1) historyPrice = last
    else if (last > 1 && last <= 100) historyPrice = last / 100
  }
  
  // ✅ 核心修复：优先使用 priceHistory（因为它被 price_change 消息实时更新）
  // 订单簿数据只在初始连接时收到，之后不再更新
  if (historyPrice !== null) {
    return historyPrice
  }
  
  // fallback 到订单簿
  if (bookAsk !== null) {
    return bookAsk
  }
  
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