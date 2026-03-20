import React from 'react'
import { MatrixCard } from '@/components/ui/MatrixCard'
import { MatrixButton } from '@/components/ui/MatrixButton'
import { cn } from '@/utils/cn'
import { formatCurrency } from '@/utils/formatting'
import { useAppStore } from '@/stores/appStore'
import { realtimeService } from '@/services/realtime/RealtimeService'
import { binanceBtcService } from '@/services/marketdata/BinanceBtcService'
import { btc5mAutoStrategy, TradeSignal } from '@/services/strategies/Btc5mAutoStrategy'
import type { PolymarketMarketMetadata } from '@/services/platforms/polymarketUtils'
import { 
  getCurrentBtc5mUrl, 
  extractSlugFromUrl, 
  fetchMarketDataFromSlug,
  toMarket 
} from '@/services/platforms/polymarketUtils'

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
  const { ui, polymarket, setStrategyRunning, setMarkets, setPolymarketBtc5mState } = useAppStore()
  const [snap, setSnap] = React.useState<StatusSnapshot | null>(null)
  const [connectionStatus, setConnectionStatus] = React.useState<string>('disconnected')
  const [lastSignal, setLastSignal] = React.useState<TradeSignal | null>(null)
  const [signalCount, setSignalCount] = React.useState(0)
  const [isStrategyRunning, setIsStrategyRunning] = React.useState(false)
  
  // ✅ 追踪当前 slug 用于自动切换
  const lastSlugRef = React.useRef<string | null>(null)
  const switchingRef = React.useRef<boolean>(false)
  
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

  // ✅ 监听交易信号
  React.useEffect(() => {
    const unsubscribe = btc5mAutoStrategy.onSignal((signal) => {
      setLastSignal(signal)
      setSignalCount(prev => prev + 1)
    })
    
    // 检查策略是否已经在运行
    setIsStrategyRunning(btc5mAutoStrategy.isRunning())
    
    return unsubscribe
  }, [])

  // ✅ 定期同步策略状态
  React.useEffect(() => {
    const interval = setInterval(() => {
      setIsStrategyRunning(btc5mAutoStrategy.isRunning())
    }, 1000)
    return () => clearInterval(interval)
  }, [])

  // ✅ 启动/停止策略 - 同时更新全局状态
  const toggleStrategy = () => {
    if (isStrategyRunning) {
      btc5mAutoStrategy.stop()
      setIsStrategyRunning(false)
      if (setStrategyRunning) {
        setStrategyRunning(false)
      }
    } else {
      // 更新策略配置
      const store = useAppStore.getState()
      btc5mAutoStrategy.updateConfig({
        bankroll: store.trading?.capital || 1000,
      })
      btc5mAutoStrategy.start(1000)
      setIsStrategyRunning(true)
      if (setStrategyRunning) {
        setStrategyRunning(true)
      }
    }
  }

  React.useEffect(() => {
    if (ui.currentView !== 'markets-polymarket') return

    let alive = true
    let debugCount = 0
    let lastFixAttempt = 0
    
    const timer = setInterval(async () => {
      try {
        const state = await binanceBtcService.getBtc5mState()
        if (!alive) return
        if (!state) {
          setSnap(null)
          return
        }

        // ✅ 在 interval 内部重新获取最新的 Store 状态
        const currentStore = useAppStore.getState()
        const currentActiveMarkets = currentStore.markets.activeMarkets || []
        const currentMetadata = currentStore.polymarket.btc5m.metadata

        // ✅ 使用 metadata 获取 token IDs
        const yesTokenId = currentMetadata?.assetIds?.[0] || null
        const noTokenId = currentMetadata?.assetIds?.[1] || null
        const marketLabel = currentMetadata?.question || 'BTC 5m'

        // 查找 activeMarkets 中匹配的市场
        const matchingMarket = currentActiveMarkets.find(m => 
          m.assetIds?.includes(yesTokenId!) || m.assetIds?.includes(noTokenId!)
        )

        const subscribedAssets = realtimeService.getSubscribedAssets()
        
        // ✅ 自动修复订阅：每 3 秒最多尝试一次
        const now = Date.now()
        const marketAssetIds = matchingMarket?.assetIds || currentMetadata?.assetIds || []
        if (marketAssetIds.length > 0 && now - lastFixAttempt > 3000) {
          const allSubscribed = marketAssetIds.every((id: string) => subscribedAssets.includes(id))
          if (!allSubscribed && realtimeService.getStatus() === 'connected') {
            console.log('[BTC5mStatus] ⚠️ 检测到订阅丢失，自动修复中...')
            console.log('[BTC5mStatus]   期望:', marketAssetIds.map((id: string) => id.substring(0, 12) + '...'))
            console.log('[BTC5mStatus]   实际:', subscribedAssets.map(id => id.substring(0, 12) + '...'))
            
            // 清空并重新订阅
            realtimeService.clearSubscriptions()
            realtimeService.subscribe(marketAssetIds)
            
            // ✅ 验证订阅是否成功
            await new Promise(r => setTimeout(r, 200))
            const newSubscribed = realtimeService.getSubscribedAssets()
            const success = marketAssetIds.every((id: string) => newSubscribed.includes(id))
            
            lastFixAttempt = now
            if (success) {
              console.log('[BTC5mStatus] ✅ 订阅修复成功')
            } else {
              console.log('[BTC5mStatus] ⚠️ 订阅修复可能失败，将在下次检查重试')
            }
          }
        }
        
        // ✅ 独立的区间切换检测
        if (!switchingRef.current) {
          try {
            const currentUrl = getCurrentBtc5mUrl()
            const slugResult = extractSlugFromUrl(currentUrl)
            const currentSlug = typeof slugResult === 'string' ? slugResult : slugResult?.slug
            
            // 初始化
            if (!lastSlugRef.current && currentSlug) {
              lastSlugRef.current = currentSlug
              console.log(`[BTC5mStatus] 🏁 初始化 slug: ${currentSlug}`)
            }
            
            // 检测切换
            if (lastSlugRef.current && currentSlug && lastSlugRef.current !== currentSlug) {
              // ✅ 先检查 MarketsView 是否已经完成切换
              const storeMarket = currentActiveMarkets.find(m => 
                m.slug?.startsWith('btc-updown-5m') ||
                (m.question?.toLowerCase().includes('bitcoin up or down') &&
                (m.question?.includes('AM') || m.question?.includes('PM')))
              )
              
              // 如果 Store 中的市场 slug 已经是新的，说明 MarketsView 已经完成切换
              if (storeMarket?.slug === currentSlug) {
                console.log(`[BTC5mStatus] 📝 MarketsView 已完成切换，跳过重复操作`)
                lastSlugRef.current = currentSlug
                // 只需要验证订阅状态（在上面的订阅修复逻辑中处理）
              } else {
                console.log(`\n[BTC5mStatus] 🔄🔄🔄 检测到区间切换 🔄🔄🔄`)
                console.log(`[BTC5mStatus]   旧: ${lastSlugRef.current}`)
                console.log(`[BTC5mStatus]   新: ${currentSlug}`)
                
                switchingRef.current = true
                
                // ✅ 等待一小段时间，让 MarketsView 有机会先执行
                await new Promise(r => setTimeout(r, 500))
                
                // 再次检查是否已被 MarketsView 处理
                const recheckStore = useAppStore.getState()
                const recheckMarket = recheckStore.markets.activeMarkets?.find(m => 
                  m.slug?.startsWith('btc-updown-5m')
                )
                if (recheckMarket?.slug === currentSlug) {
                  console.log(`[BTC5mStatus] 📝 MarketsView 已完成切换（延迟检查），跳过`)
                  lastSlugRef.current = currentSlug
                  switchingRef.current = false
                } else {
                  // 获取新市场数据
                  const newData = await fetchMarketDataFromSlug(currentSlug, 'btc-5m', {
                    logger: (msg) => console.log('[BTC5mStatus]', msg)
                  })
                  
                  if (newData) {
                    console.log(`[BTC5mStatus] ✅ 获取到新市场: ${newData.question}`)
                    
                    // 更新 Store
                    const store = useAppStore.getState()
                    const markets = store.markets.activeMarkets || []
                    const btc5mMarketIndex = markets.findIndex(m => 
                      m.slug?.startsWith('btc-updown-5m') ||
                      (m.question?.toLowerCase().includes('bitcoin up or down') &&
                      (m.question?.includes('AM') || m.question?.includes('PM')))
                    )
                    
                    if (btc5mMarketIndex >= 0) {
                      const updatedMarkets = [...markets]
                      updatedMarkets[btc5mMarketIndex] = {
                        ...updatedMarkets[btc5mMarketIndex],
                        id: newData.id,
                        conditionId: newData.conditionId,
                        question: newData.question,
                        slug: newData.slug,
                        assetIds: newData.assetIds,
                        endDate: newData.endDate,
                        volume: newData.volume,
                        liquidity: newData.liquidity,
                        outcomePrices: [0.5, 0.5],
                      }
                      setMarkets(updatedMarkets)
                    } else {
                      // 添加新市场
                      const newMarket = toMarket(newData)
                      setMarkets([...markets, newMarket])
                    }
                    
                    // 更新 metadata
                    setPolymarketBtc5mState({
                      metadata: newData,
                      subscribed: true,
                    })
                    
                    // 更新订阅
                    realtimeService.clearSubscriptions()
                    if (newData.assetIds?.length) {
                      realtimeService.subscribe(newData.assetIds)
                      
                      // ✅ 验证订阅
                      await new Promise(r => setTimeout(r, 200))
                      const verifySubscribed = realtimeService.getSubscribedAssets()
                      const allOk = newData.assetIds.every(id => verifySubscribed.includes(id))
                      
                      if (allOk) {
                        console.log(`[BTC5mStatus] ✅ 已订阅新 assets:`, newData.assetIds.map(id => id.substring(0, 12) + '...'))
                      } else {
                        console.log(`[BTC5mStatus] ⚠️ 订阅可能不完整，将在下次检查修复`)
                      }
                    }
                    
                    lastSlugRef.current = currentSlug
                    console.log(`[BTC5mStatus] ✅✅✅ 切换完成 ✅✅✅\n`)
                  } else {
                    console.log(`[BTC5mStatus] ❌ 无法获取新市场数据`)
                    lastSlugRef.current = currentSlug  // 避免重复尝试
                  }
                  
                  switchingRef.current = false
                }
              }
            }
          } catch (switchErr) {
            console.error('[BTC5mStatus] 切换检测错误:', switchErr)
            switchingRef.current = false
          }
        }
        
        debugCount++
        if (debugCount <= 5 || debugCount % 30 === 0) {
          console.log('[BTC5mStatus] 数据来源:', {
            activeMarketsCount: currentActiveMarkets.length,
            metadata: currentMetadata ? { question: currentMetadata.question?.substring(0, 40) } : null,
            matchingMarket: matchingMarket ? { question: matchingMarket.question?.substring(0, 40), outcomePrices: matchingMarket.outcomePrices } : null,
            yesTokenId: yesTokenId?.substring(0, 20) + '...',
            subscribedCount: subscribedAssets.length,
            wsStatus: realtimeService.getStatus(),
          })
        }

        const elapsedSec = clamp((now - state.startTimeMs) / 1000, 0, 300)
        const remainingSec = Math.max(0, 300 - elapsedSec)

        const delta = Math.log(state.currentPrice / state.startPrice)
        const sigmaRem = state.sigmaPerSecond * Math.sqrt(Math.max(1, remainingSec))
        const z = sigmaRem > 0 ? delta / sigmaRem : 0
        const pYes = normalCdf(z)

        // ✅ 从 matchingMarket.outcomePrices 获取价格
        let oYes: number | null = null
        let oNo: number | null = null

        if (matchingMarket?.outcomePrices && matchingMarket.outcomePrices.length >= 2) {
          const rawYes = matchingMarket.outcomePrices[0]
          const rawNo = matchingMarket.outcomePrices[1]
          const yesPrice = typeof rawYes === 'string' ? parseFloat(rawYes) : rawYes
          const noPrice = typeof rawNo === 'string' ? parseFloat(rawNo) : rawNo
          
          if (!isNaN(yesPrice) && yesPrice > 0) oYes = yesPrice
          if (!isNaN(noPrice) && noPrice > 0) oNo = noPrice
        }
        
        // 备选 - 从 realtimeService 获取
        if (oYes === null && yesTokenId) {
          oYes = bestAsk(yesTokenId)
        }
        if (oNo === null && noTokenId) {
          oNo = bestAsk(noTokenId)
        }

        const edgeYes = oYes != null ? pYes - oYes : null
        const edgeNo = oNo != null ? (1 - pYes) - oNo : null

        const usingStorePrice = matchingMarket?.outcomePrices && matchingMarket.outcomePrices.length >= 2
        const orderbookAgeYesSec = usingStorePrice ? 0 : (yesTokenId ? ageSec(realtimeService.getLastUpdate(yesTokenId)) : null)
        const orderbookAgeNoSec = usingStorePrice ? 0 : (noTokenId ? ageSec(realtimeService.getLastUpdate(noTokenId)) : null)

        const currentTrading = currentStore.trading
        const currentPositions = currentStore.positions

        const realizedPnl = sumRealized(currentTrading?.tradeHistory || [], state.startTimeMs, state.startTimeMs + 300_000)
        const unrealizedPnl = sumUnrealized(currentPositions?.active || [], yesTokenId, noTokenId)

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
  }, [ui.currentView])

  if (ui.currentView !== 'markets-polymarket') return null

  const hasMetadata = !!metadata?.assetIds?.length
  const wsConnected = connectionStatus === 'connected'

  // 计算时间区域
  const getTimeZone = () => {
    if (!snap) return 'unknown'
    if (snap.elapsedSec < 60) return 'noise'
    if (snap.elapsedSec < 240) return 'sweet'
    if (snap.elapsedSec < 290) return 'danger'
    return 'closed'
  }

  const timeZone = getTimeZone()
  const timeZoneLabel = {
    noise: '📊 噪音期',
    sweet: '🎯 甜点区',
    danger: '⚠️ 危险期',
    closed: '🔒 结算期',
    unknown: '⏳ 等待中'
  }[timeZone]

  const timeZoneColor = {
    noise: 'text-matrix-text-muted',
    sweet: 'text-matrix-success',
    danger: 'text-matrix-warning',
    closed: 'text-matrix-error',
    unknown: 'text-matrix-text-muted'
  }[timeZone]

  return (
    <MatrixCard
      title="📈 BTC 5M STATUS"
      subtitle={snap ? snap.marketLabel : 'No data'}
      headerExtra={
        <div className="flex items-center gap-4">
          <div className={cn('text-xs font-mono', timeZoneColor)}>
            {timeZoneLabel}
          </div>
          <div className="text-[10px] text-matrix-text-secondary font-mono text-right">
            <div>{snap ? `T-${Math.round(snap.remainingSec)}s` : 'T-—'}</div>
            <div>{snap ? new Date(snap.updatedAtMs).toLocaleTimeString() : '—'}</div>
          </div>
        </div>
      }
    >
      {/* 连接状态提示 */}
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
      
      {/* 即将切换提示 */}
      {snap && snap.remainingSec <= 30 && snap.remainingSec > 0 && (
        <div className="text-matrix-info font-mono text-sm mb-2 animate-pulse">
          ⏰ 当前区间即将结束，{Math.round(snap.remainingSec)}s 后自动切换...
        </div>
      )}
      {snap && snap.remainingSec <= 0 && (
        <div className="text-matrix-success font-mono text-sm mb-2 animate-pulse">
          🔄 正在切换到下一个5分钟市场...
        </div>
      )}

      {/* 交易信号面板 */}
      {lastSignal && lastSignal.type !== 'HOLD' && (
        <div className={cn(
          'p-3 rounded border mb-4 font-mono',
          lastSignal.type === 'BUY_YES' 
            ? 'bg-green-900/30 border-green-500/50' 
            : 'bg-red-900/30 border-red-500/50'
        )}>
          <div className="flex justify-between items-center mb-2">
            <span className={cn(
              'text-lg font-bold',
              lastSignal.type === 'BUY_YES' ? 'text-green-400' : 'text-red-400'
            )}>
              {lastSignal.type === 'BUY_YES' ? '🟢 BUY YES' : '🔴 BUY NO'}
            </span>
            <span className="text-xs text-matrix-text-secondary">
              {new Date(lastSignal.timestamp).toLocaleTimeString()}
            </span>
          </div>
          <div className="text-sm text-matrix-text-primary mb-2">
            {lastSignal.reason}
          </div>
          <div className="grid grid-cols-3 gap-2 text-xs">
            <div>
              <span className="text-matrix-text-muted">Edge: </span>
              <span className="text-matrix-success">{(lastSignal.edge * 100).toFixed(1)}%</span>
            </div>
            <div>
              <span className="text-matrix-text-muted">建议仓位: </span>
              <span className="text-matrix-info">${lastSignal.suggestedSize}</span>
            </div>
            <div>
              <span className="text-matrix-text-muted">期望收益: </span>
              <span className="text-matrix-success">${lastSignal.expectedValue}</span>
            </div>
          </div>
        </div>
      )}
      
      {!snap ? (
        <div className="text-matrix-text-muted font-mono text-sm">
          {subscriptionError ? `订阅失败: ${subscriptionError}` : subscribed ? '等待 BTC 与盘口数据…' : '尚未订阅 BTC 5m 市场'}
        </div>
      ) : (
        <div className="space-y-4">
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
                vClass={snap.edgeYes != null ? (snap.edgeYes > 0.05 ? 'text-matrix-success animate-pulse' : snap.edgeYes > 0 ? 'text-matrix-success' : 'text-matrix-warning') : undefined}
              />
              <Row
                k="edge_no"
                v={snap.edgeNo != null ? `${(snap.edgeNo * 100).toFixed(1)}%` : '—'}
                vClass={snap.edgeNo != null ? (snap.edgeNo > 0.05 ? 'text-matrix-success animate-pulse' : snap.edgeNo > 0 ? 'text-matrix-success' : 'text-matrix-warning') : undefined}
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

          {/* 策略控制面板 */}
          <div className="flex items-center justify-between p-3 bg-matrix-bg-tertiary/50 rounded border border-matrix-border-tertiary">
            <div className="flex items-center gap-4">
              <MatrixButton
                onClick={toggleStrategy}
                variant={isStrategyRunning ? 'danger' : 'primary'}
                size="sm"
              >
                {isStrategyRunning ? '⏹️ 停止策略' : '▶️ 启动策略'}
              </MatrixButton>
              <span className="text-xs font-mono text-matrix-text-secondary">
                信号数: <span className="text-matrix-info">{signalCount}</span>
              </span>
            </div>
            <div className="text-xs font-mono text-matrix-text-muted">
              阈值: 5% edge | Kelly ≤ 25%
            </div>
          </div>
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
  
  let historyPrice: number | null = null
  if (history.length > 0) {
    const last = history[history.length - 1]
    if (last > 0 && last < 1) historyPrice = last
    else if (last > 1 && last <= 100) historyPrice = last / 100
  }
  
  if (historyPrice !== null) {
    return historyPrice
  }
  
  if (book?.asks && book.asks.length > 0) {
    const ask = book.asks[0][0]
    if (ask > 0 && ask < 1) return ask
    if (ask > 1 && ask <= 100) return ask / 100
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