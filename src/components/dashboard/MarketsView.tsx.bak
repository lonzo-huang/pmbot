import React, { useState, useEffect, useRef } from 'react'
import { useAppStore } from '@/stores/appStore'
import { MatrixCard } from '@/components/ui/MatrixCard'
import { MatrixButton } from '@/components/ui/MatrixButton'
import { MatrixLoading } from '@/components/ui/MatrixLoading'
import { MatrixInput } from '@/components/ui/MatrixInput'
import { MatrixModal } from '@/components/ui/MatrixModal'
import { cn } from '@/utils/cn'
import { formatCurrency } from '@/utils/formatting'
import { realtimeService, MarketData, OrderBook } from '@/services/realtime/RealtimeService'
import { strategyManager, TradeSignal } from '@/services/strategies'
import { tradingService } from '@/services/trading/TradingService'
import { popularMarketsService, type PopularMarket } from '../markets/PopularMarketsService'

interface Market {
  id: string
  question: string
  volume: number
  liquidity: number
  outcomePrices: number[]
  endDate: string
  active: boolean
  category?: string
  assetIds?: string[]
}

const MARKET_TEMPLATES: Market[] = [
  {
    id: 'btc-100k-2026',
    question: 'Will Bitcoin reach $100,000 by end of 2026?',
    volume: 1250000,
    liquidity: 85000,
    outcomePrices: [0.42, 0.58],
    endDate: '2026-12-31T23:59:59Z',
    active: true,
    category: 'crypto',
    assetIds: [
      '21742633143463906290569050155826241533067272736897614950488156847949938836455',
      '48331043336612883890938759509493159234755048973500640148014422747788308965732',
    ],
  },
  {
    id: 'eth-5k-q2',
    question: 'Will Ethereum hit $5,000 in Q2 2026?',
    volume: 890000,
    liquidity: 62000,
    outcomePrices: [0.35, 0.65],
    endDate: '2026-06-30T23:59:59Z',
    active: true,
    category: 'crypto',
  },
  {
    id: 'fed-rates-march',
    question: 'Will the Fed cut rates in March 2026?',
    volume: 2100000,
    liquidity: 150000,
    outcomePrices: [0.68, 0.32],
    endDate: '2026-03-31T23:59:59Z',
    active: true,
    category: 'economics',
  },
]

// ============================================
// 工具函数
// ============================================

const extractSlugFromUrl = (url: string): string | null => {
  try {
    let cleanUrl = url.trim()
    if (!cleanUrl.startsWith('http://') && !cleanUrl.startsWith('https://')) {
      cleanUrl = 'https://' + cleanUrl
    }
    const urlObj = new URL(cleanUrl)
    const pathname = urlObj.pathname.replace(/^\/+|\/+$/g, '')
    const pathParts = pathname.split('/')
    const eventIndex = pathParts.findIndex(p => p === 'event' || p === 'market')
    if (eventIndex !== -1 && pathParts[eventIndex + 1]) {
      return decodeURIComponent(pathParts[eventIndex + 1])
    }
    const lastPart = pathParts.filter(Boolean).pop()
    return lastPart ? decodeURIComponent(lastPart) : null
  } catch {
    return null
  }
}

const fetchMarketDataFromSlug = async (slug: string, addLog: (msg: string) => void) => {
  try {
    addLog(`🔍 Query Gamma API: slug=${slug}`)
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 15000)
    const gammaUrl = `/api/gamma/markets?slug=${slug}`

    const response = await fetch(gammaUrl, {
      method: 'GET',
      headers: { 'Accept': 'application/json' },
      signal: controller.signal,
    })
    clearTimeout(timeoutId)

    if (!response.ok) throw new Error(`API failed: ${response.status}`)
    const markets: any[] = await response.json()

    if (!Array.isArray(markets) || markets.length === 0) {
      addLog(`❌ No market found for slug: ${slug}`)
      return null
    }

    const market = markets[0]
    addLog(`✅ Found market: ${market.question || 'Unknown'}`)
    const conditionId = market.conditionId || market.condition_id || ''
    const tokens = market.tokens || market.outcomes || market.clobTokenIds || []

    const assetIds = Array.isArray(tokens)
      ? tokens.map((t: any) => typeof t === 'string' ? t : t.id || t.token_id || '').filter(Boolean)
      : []

    return { conditionId, assetIds, question: market.question || 'Unknown' }
  } catch (error: any) {
    addLog(`❌ Fetch failed: ${error.message}`)
    return null
  }
}

// ============================================
// 主组件
// ============================================

export const MarketsView: React.FC = () => {
  const { setScanning, addNotification, setMarkets } = useAppStore()

  // 状态管理
  const [markets, setMarketsData] = useState<Market[]>([])
  const [scanStatus, setScanStatus] = useState<'idle' | 'scanning' | 'connected' | 'error'>('idle')
  const [scanLog, setScanLog] = useState<string[]>([])
  const [filter, setFilter] = useState('all')
  const [sortBy, setSortBy] = useState('volume')
  const [wsStatus, setWsStatus] = useState('disconnected')
  const [messageCount, setMessageCount] = useState(0)

  // 模态框状态
  const [showMarketSelector, setShowMarketSelector] = useState(false)
  const [showPopularMarkets, setShowPopularMarkets] = useState(false)
  const [showTestPosition, setShowTestPosition] = useState(false)
  const [showManualGuide, setShowManualGuide] = useState(false)

  // 数据状态
  const [selectedTemplates, setSelectedTemplates] = useState<string[]>(['btc-100k-2026', 'eth-5k-q2', 'fed-rates-march'])
  const [customAssetIds, setCustomAssetIds] = useState('')
  const [eventUrl, setEventUrl] = useState('')
  const [isFetchingAssets, setIsFetchingAssets] = useState(false)
  const [strategyEnabled, setStrategyEnabled] = useState(false)
  const [tradeSignals, setTradeSignals] = useState<TradeSignal[]>([])

  // 测试持仓
  const [testPositionParams, setTestPositionParams] = useState({
    marketId: 'btc-100k-2026',
    outcome: 'yes' as 'yes' | 'no',
    amount: 50,
    entryPrice: 0.42,
    currentPrice: 0.45,
  })

  // 热门市场
  const [popularMarkets, setPopularMarkets] = useState<PopularMarket[]>([])
  const [isScanningPopular, setIsScanningPopular] = useState(false)
  const [selectedPopularIds, setSelectedPopularIds] = useState<Set<string>>(new Set())

  const logRef = useRef<HTMLDivElement>(null)

  const addLog = (message: string) => {
    setScanLog((prev) => [...prev, `[${new Date().toLocaleTimeString()}] ${message}`])
    setTimeout(() => {
      if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight
    }, 50)
  }

  // ============================================
  // WebSocket 连接
  // ============================================
  useEffect(() => {
    let unsubscribe: (() => void) | undefined
    let strategyUnsubscribe: (() => void) | undefined

    const connectWebSocket = async () => {
      addLog('🔌 Connecting to Polymarket WebSocket...')
      const connected = await realtimeService.connect()

      if (connected) {
        setWsStatus(realtimeService.getStatus())
        addLog('✅ WebSocket connected successfully')
        setScanStatus('connected')
        addNotification('Real-time data connected', 'success')
        loadSelectedMarkets()
      } else {
        setWsStatus('error')
        setScanStatus('error')
        addLog('❌ WebSocket connection failed')
        addNotification('Real-time data connection failed', 'error')
      }
    }

    unsubscribe = realtimeService.onMessage((data: MarketData) => {
      setMessageCount(prev => prev + 1)
      if (data.type === 'book' || data.type === 'best_bid_ask') {
        updateMarketFromOrderBook(data)
      } else if (data.type === 'last_trade_price') {
        updateMarketFromTrade(data)
      }
    })

    strategyUnsubscribe = strategyManager.onSignal(async (signal: TradeSignal) => {
      setTradeSignals(prev => [signal, ...prev.slice(0, 19)])
      addLog(`📊 [${signal.strategy}] ${signal.action.toUpperCase()} ${signal.side.toUpperCase()} @ ${(signal.price * 100).toFixed(1)}¢`)

      if (signal.confidence >= 0.7) {
        const result = await tradingService.createOrder({
          tokenId: signal.asset_id,
          side: signal.action === 'buy' ? 'BUY' : 'SELL',
          amount: signal.size,
          orderType: 'GTC',
          price: signal.price,
          reason: signal.reason,
          signal,
        })

        if (result.success) {
          addLog(`✅ Trade successful: ${result.orderId}`)
          addNotification('Trade executed successfully', 'success')
        }
      }
    })

    connectWebSocket()

    return () => {
      if (unsubscribe) unsubscribe()
      if (strategyUnsubscribe) strategyUnsubscribe()
      realtimeService.disconnect()
    }
  }, [])

  // ============================================
  // 市场数据更新
  // ============================================
  const updateMarketFromOrderBook = (data: MarketData) => {
    if (!data.data) return
    setMarketsData(prev => prev.map(market => {
      const assetIndex = market.assetIds?.indexOf(data.asset_id || '')
      if (assetIndex === undefined || assetIndex === -1) return market

      const book = data.data as OrderBook
      if (!book.bids?.length && !book.asks?.length) return market

      // Polymarket: YES price = best ask of YES token (what you pay to buy YES)
      // NO price = 1 - YES best ask  (since YES + NO = $1)
      // assetIds[0] = YES token, assetIds[1] = NO token
      const bestAsk = book.asks?.[0]?.[0] || 0
      const bestBid = book.bids?.[0]?.[0] || 0
      // mid price as the displayed price for this token
      const tokenPrice = bestAsk > 0 ? bestAsk : bestBid

      const newPrices = [...(market.outcomePrices || [0.5, 0.5])]
      if (assetIndex === 0) {
        // YES token update
        newPrices[0] = tokenPrice
        newPrices[1] = parseFloat((1 - tokenPrice).toFixed(4))
      } else {
        // NO token update
        newPrices[1] = tokenPrice
        newPrices[0] = parseFloat((1 - tokenPrice).toFixed(4))
      }

      const liquidity = (book.bids?.reduce((s, b) => s + b[1], 0) || 0)
                      + (book.asks?.reduce((s, a) => s + a[1], 0) || 0)

      return { ...market, outcomePrices: newPrices, liquidity: liquidity || market.liquidity }
    }))
  }

  const updateMarketFromTrade = (data: MarketData) => {
    if (!data.data?.price) return
    setMarketsData(prev => prev.map(market => {
      const assetIndex = market.assetIds?.indexOf(data.asset_id || '')
      if (assetIndex === undefined || assetIndex === -1) return market

      const tradePrice = data.data.price
      const newPrices = [...(market.outcomePrices || [0.5, 0.5])]
      if (assetIndex === 0) {
        newPrices[0] = tradePrice
        newPrices[1] = parseFloat((1 - tradePrice).toFixed(4))
      } else {
        newPrices[1] = tradePrice
        newPrices[0] = parseFloat((1 - tradePrice).toFixed(4))
      }
      return { ...market, outcomePrices: newPrices, lastTradePrice: tradePrice }
    }))
  }


  // ============================================
  // 市场加载
  // ============================================
  const loadSelectedMarkets = async () => {
    if (customAssetIds.trim()) {
      const ids = customAssetIds.trim().split(',').map(s => s.trim()).filter(Boolean)
      if (ids.length >= 1) {
        const customMarket: Market = {
          id: `custom-${Date.now()}`,
          question: `Custom Market (${ids[0].substring(0, 10)}...)`,
          volume: 0, liquidity: 0, outcomePrices: [0.5, 0.5],
          endDate: '2026-12-31T23:59:59Z', active: true, category: 'custom', assetIds: ids,
        }
        setMarketsData([customMarket])
        setMarkets([customMarket])
        if (realtimeService.getStatus() === 'connected') {
          realtimeService.subscribe(ids)
          addLog(`📡 Subscribed to ${ids.length} custom assets`)
        }
        return
      }
    }
    addLog('🔍 Auto-loading real markets from Gamma API...')
    try {
      const popular = await popularMarketsService.getPopularMarkets(5)
      if (popular.length === 0) { addLog('⚠️ No markets found, add via 🔥 Popular Markets'); return }
      const realMarkets: Market[] = popular.map(m => ({
        id: m.id, question: m.question, volume: m.volume24h, liquidity: m.liquidity,
        outcomePrices: [0.5, 0.5], endDate: m.endDate, active: true,
        category: m.category, assetIds: m.assetIds,
      }))
      setMarketsData(realMarkets)
      setMarkets(realMarkets)
      const allAssetIds = realMarkets.flatMap(m => m.assetIds || []).filter(Boolean)
      if (allAssetIds.length > 0 && realtimeService.getStatus() === 'connected') {
        realtimeService.subscribe(allAssetIds)
        addLog(`📡 Subscribed to ${allAssetIds.length} real assets from ${realMarkets.length} markets`)
      }
    } catch (error: any) {
      addLog(`❌ Failed to load markets: ${error.message}`)
    }
  }

  // ============================================
  // 扫描热门市场
  // ============================================
  const scanPopularMarkets = async () => {
    setIsScanningPopular(true)
    addLog('🔍 Scanning popular Polymarket markets...')

    try {
      const markets = await popularMarketsService.getPopularMarkets(10)
      setPopularMarkets(markets)
      addLog(`✅ Found ${markets.length} popular markets`)
      addNotification(`Found ${markets.length} popular markets`, 'success')
    } catch (error: any) {
      addLog(`❌ Scan failed: ${error.message}`)
      addNotification('Failed to scan popular markets', 'error')
    } finally {
      setIsScanningPopular(false)
    }
  }

  const addPopularMarket = (market: PopularMarket) => {
    const newMarket: Market = {
      id: market.id,
      question: market.question,
      volume: market.volume24h,
      liquidity: market.liquidity,
      outcomePrices: [0.5, 0.5],
      endDate: market.endDate,
      active: true,
      category: market.category,
      assetIds: market.assetIds,
    }

    setMarketsData(prev => [...prev, newMarket])

    const existingIds = customAssetIds.split(',').filter(Boolean)
    const newIds = market.assetIds.filter(id => !existingIds.includes(id))
    setCustomAssetIds([...existingIds, ...newIds].join(','))

    if (realtimeService.getStatus() === 'connected') {
      realtimeService.subscribe(newIds)
    }

    addNotification(`Added ${market.question.substring(0, 30)}... to watchlist`, 'success')
  }

  // ============================================
  // 测试持仓
  // ============================================
  const addTestPosition = () => {
    const store = useAppStore.getState()
    const pnl = (testPositionParams.currentPrice - testPositionParams.entryPrice) *
                testPositionParams.amount *
                (testPositionParams.outcome === 'yes' ? 1 : -1)

    store.addPosition({
      tokenId: `test-${Date.now()}`,
      marketId: testPositionParams.marketId,
      outcome: testPositionParams.outcome,
      amount: testPositionParams.amount,
      entryPrice: testPositionParams.entryPrice,
      currentPrice: testPositionParams.currentPrice,
      pnl,
      openedAt: Date.now(),
    })

    addLog(`✅ Test position added: ${testPositionParams.outcome.toUpperCase()} @ ${(testPositionParams.entryPrice * 100).toFixed(1)}¢`)
    addNotification('Test position added successfully', 'success')
    setShowTestPosition(false)
  }

  // ============================================
  // URL 导入
  // ============================================
  const handleImportEventUrl = async () => {
    const trimmedUrl = eventUrl.trim()
    if (!trimmedUrl) {
      addNotification('Please enter event URL', 'error')
      return
    }

    setIsFetchingAssets(true)
    addLog('🌐 Parsing event URL...')
    const slug = extractSlugFromUrl(trimmedUrl)

    if (!slug) {
      addLog('❌ Failed to extract slug from URL')
      addNotification('Invalid URL format', 'error')
      setIsFetchingAssets(false)
      return
    }

    const marketData = await fetchMarketDataFromSlug(slug, addLog)
    if (marketData && marketData.assetIds.length >= 1) {
      const existingIds = customAssetIds.split(',').map(s => s.trim()).filter(Boolean)
      const newIds = marketData.assetIds.filter(id => !existingIds.includes(id))
      setCustomAssetIds([...existingIds, ...newIds].join(','))
      addNotification(`Imported ${newIds.length} new asset IDs`, 'success')
      setEventUrl('')
    }
    setIsFetchingAssets(false)
  }

  // ============================================
  // 控制函数
  // ============================================
  const handleScan = async () => {
    if (scanStatus === 'scanning') return
    setScanStatus('scanning')
    setScanning(true)
    setMarketsData([])
    setScanLog([])
    setMessageCount(0)
    addLog('🔍 Reconnecting market data...')

    realtimeService.disconnect()
    await new Promise(resolve => setTimeout(resolve, 1000))

    const connected = await realtimeService.connect()
    if (connected) {
      setWsStatus(realtimeService.getStatus())
      loadSelectedMarkets()
      setScanStatus('connected')
      addLog('✅ Reconnection successful')
    } else {
      setScanStatus('error')
      addLog('❌ Reconnection failed')
    }
    setScanning(false)
  }

  const toggleStrategy = () => {
    if (strategyEnabled) {
      strategyManager.stop()
      setStrategyEnabled(false)
      addLog('⏹️ Strategy engine stopped')
    } else {
      strategyManager.start()
      setStrategyEnabled(true)
      addLog('🚀 Strategy engine started')
    }
  }

  const toggleTemplate = (templateId: string) => {
    setSelectedTemplates(prev =>
      prev.includes(templateId) ? prev.filter(id => id !== templateId) : [...prev, templateId]
    )
  }

  const saveMarketSelection = async () => {
    loadSelectedMarkets()
    setShowMarketSelector(false)
    addNotification(`Selected ${selectedTemplates.length} markets`, 'success')
  }

  const filteredMarkets = markets
    .filter(m => filter === 'all' || m.category === filter)
    .sort((a, b) => {
      if (sortBy === 'volume') return b.volume - a.volume
      if (sortBy === 'liquidity') return b.liquidity - a.liquidity
      if (sortBy === 'endDate') return new Date(a.endDate).getTime() - new Date(b.endDate).getTime()
      return 0
    })

  const categories = ['all', 'crypto', 'economics', 'politics', 'stocks', 'custom']

  // ============================================
  // 渲染
  // ============================================
  return (
    <div className="flex flex-col h-full overflow-hidden p-4 space-y-3">
      {/* 顶部：市场扫描器 */}
      <div className="flex-shrink-0">
        <MatrixCard title="MARKET SCANNER" subtitle="Real-time Polymarket data via WebSocket">
          <div className="flex justify-between items-center mb-3">
            <div className="text-sm text-matrix-text-secondary font-mono">
              Status:
              <span className={cn(
                'ml-2',
                scanStatus === 'idle' ? 'text-matrix-text-muted' :
                scanStatus === 'scanning' ? 'text-matrix-warning' :
                scanStatus === 'connected' ? 'text-matrix-success' : 'text-matrix-error'
              )}>
                {scanStatus === 'idle' && 'Idle'}
                {scanStatus === 'scanning' && 'Connecting...'}
                {scanStatus === 'connected' && '● Connected'}
                {scanStatus === 'error' && 'Error'}
              </span>
            </div>
            <div className="flex gap-2">
              <MatrixButton variant="secondary" onClick={() => setShowPopularMarkets(true)}>
                🔥 Popular Markets
              </MatrixButton>
              <MatrixButton
                variant={strategyEnabled ? 'success' : 'secondary'}
                onClick={toggleStrategy}
              >
                {strategyEnabled ? '🤖 Strategy Running' : '🤖 Start Strategy'}
              </MatrixButton>
              <MatrixButton variant="secondary" onClick={() => setShowTestPosition(true)}>
                🧪 Add Test Position
              </MatrixButton>
              <MatrixButton variant="secondary" onClick={() => setShowMarketSelector(true)}>
                📋 Select Markets
              </MatrixButton>
              <MatrixButton
                onClick={handleScan}
                disabled={scanStatus === 'scanning'}
                variant={scanStatus === 'connected' ? 'success' : 'primary'}
              >
                {scanStatus === 'connected' ? '● CONNECTED' : 'CONNECT'}
              </MatrixButton>
            </div>
          </div>

          <div className="grid grid-cols-4 gap-3">
            <StatCard label="WebSocket Status" value={wsStatus} success={wsStatus === 'connected'} />
            <StatCard label="Subscribed Assets" value={realtimeService.getSubscribedAssets().length} />
            <StatCard label="Messages Received" value={messageCount} info />
            <StatCard label="Strategy Signals" value={tradeSignals.length} success={strategyEnabled} />
          </div>
        </MatrixCard>
      </div>

      {/* 中间：市场列表 */}
      <div className="flex-1 min-h-0 max-h-[50vh] overflow-hidden">
        {scanStatus === 'scanning' ? (
          <MatrixCard className="h-full">
            <MatrixLoading text="Connecting to real-time data..." fullScreen={false} />
          </MatrixCard>
        ) : markets.length === 0 ? (
          <MatrixCard title="MARKETS" className="h-full">
            <div className="text-center py-8">
              <div className="text-4xl mb-4">📡</div>
              <div className="text-matrix-text-secondary font-mono mb-4">No market data available</div>
              <div className="flex gap-4 justify-center">
                <MatrixButton onClick={handleScan} variant="primary">Connect Real-time Data</MatrixButton>
                <MatrixButton onClick={() => setShowMarketSelector(true)} variant="secondary">Select Markets</MatrixButton>
                <MatrixButton onClick={() => setShowPopularMarkets(true)} variant="secondary">🔥 Browse Popular</MatrixButton>
              </div>
            </div>
          </MatrixCard>
        ) : (
          <MatrixCard
            title={`MARKETS (${filteredMarkets.length}) - Real-time Updates`}
            className="h-full flex flex-col"
            headerExtra={
              <div className="flex gap-3 items-center text-xs">
                <select value={filter} onChange={(e) => setFilter(e.target.value)}
                  className="bg-matrix-bg-tertiary border border-matrix-border-tertiary rounded px-2 py-1 text-xs font-mono">
                  {categories.map(cat => <option key={cat} value={cat}>{cat === 'all' ? 'All' : cat.toUpperCase()}</option>)}
                </select>
                <select value={sortBy} onChange={(e) => setSortBy(e.target.value)}
                  className="bg-matrix-bg-tertiary border border-matrix-border-tertiary rounded px-2 py-1 text-xs font-mono">
                  <option value="volume">Volume</option>
                  <option value="liquidity">Liquidity</option>
                  <option value="endDate">End Date</option>
                </select>
              </div>
            }
          >
            <div className="flex-1 overflow-y-auto pr-2">
              <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-3">
                {filteredMarkets.map((market) => (
                  <MarketCard key={market.id} market={market} onClick={() => addNotification(`Selected: ${market.question.substring(0, 50)}...`, 'info')} />
                ))}
              </div>
            </div>
          </MatrixCard>
        )}
      </div>

      {/* 底部：日志面板 */}
      <div className="flex-shrink-0 h-44">
        <MatrixCard title="CONNECTION LOG" className="h-full flex flex-col">
          <div ref={logRef} className="flex-1 overflow-y-auto pr-2 font-mono text-xs">
            {scanLog.length === 0 ? (
              <div className="text-matrix-text-muted text-center py-4">Waiting for connection logs...</div>
            ) : (
              scanLog.slice(-100).map((log, index) => (
                <div key={index} className={cn(
                  'py-0.5',
                  log.includes('✅') ? 'text-matrix-success' :
                  log.includes('❌') ? 'text-matrix-error' :
                  log.includes('⚠️') ? 'text-matrix-warning' :
                  log.includes('📊') ? 'text-matrix-info' :
                  'text-matrix-text-secondary'
                )}>{log}</div>
              ))
            )}
          </div>
        </MatrixCard>
      </div>

      {/* 策略信号浮动面板 */}
      {strategyEnabled && tradeSignals.length > 0 && (
        <div className="fixed bottom-4 right-4 w-96 z-50">
          <MatrixCard title={`📊 Strategy Signals (${tradeSignals.length})`} className="shadow-lg">
            <div className="max-h-48 overflow-y-auto">
              {tradeSignals.slice(0, 5).map((signal, index) => (
                <div key={`${signal.timestamp}-${index}`} className="flex items-center gap-2 py-1 text-xs font-mono border-b border-matrix-border-tertiary/50">
                  <span className="text-matrix-text-muted">{new Date(signal.timestamp).toLocaleTimeString()}</span>
                  <span className={cn('font-bold', signal.action === 'buy' ? 'text-matrix-success' : 'text-matrix-error')}>
                    {signal.action.toUpperCase()} {signal.side.toUpperCase()}
                  </span>
                  <span className="text-matrix-info">{(signal.price * 100).toFixed(1)}¢</span>
                  <span className={cn(signal.confidence > 0.7 ? 'text-matrix-success' : 'text-matrix-warning')}>
                    {(signal.confidence * 100).toFixed(0)}%
                  </span>
                </div>
              ))}
            </div>
          </MatrixCard>
        </div>
      )}

      {/* 热门市场模态框 */}
      <MatrixModal isOpen={showPopularMarkets} onClose={() => setShowPopularMarkets(false)} title="🔥 Popular Polymarket Markets" size="lg">
        <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-2">
          <div className="text-sm text-matrix-text-secondary font-mono">
            Top 10 markets by 24h volume. Click "Add to Watchlist" to subscribe.
          </div>
          {isScanningPopular ? (
            <div className="text-center py-8 text-matrix-text-secondary font-mono">Loading popular markets...</div>
          ) : popularMarkets.length === 0 ? (
            <div className="text-center py-8">
              <MatrixButton onClick={scanPopularMarkets} variant="primary">Scan Popular Markets</MatrixButton>
            </div>
          ) : (
            <div className="space-y-3">
              {popularMarkets.map((market, index) => (
                <div key={market.id} className="p-4 border border-matrix-border-tertiary rounded bg-matrix-bg-tertiary hover:border-matrix-border-primary transition-all">
                  <div className="flex justify-between items-start mb-2">
                    <div className="flex items-center gap-2">
                      <span className="text-xs px-2 py-1 bg-matrix-bg-accent rounded font-mono text-matrix-info">#{index + 1}</span>
                      <span className="text-xs px-2 py-1 bg-matrix-bg-accent rounded font-mono">{market.category.toUpperCase()}</span>
                    </div>
                    <MatrixButton
                      size="sm"
                      variant={selectedPopularIds.has(market.id) ? 'success' : 'primary'}
                      onClick={(e) => { e.stopPropagation(); addPopularMarket(market); setSelectedPopularIds(prev => { const n = new Set(prev); n.add(market.id); return n }) }}
                    >
                      {selectedPopularIds.has(market.id) ? '\u2713 Added' : '+ Add'}
                    </MatrixButton>
                  </div>
                  <h4 className="text-matrix-text-primary font-semibold text-sm mb-3">{market.question}</h4>
                  <div className="grid grid-cols-3 gap-3 text-xs font-mono">
                    <div><span className="text-matrix-text-muted">24h Volume:</span><div className="text-matrix-text-primary font-bold">${formatCurrency(market.volume24h)}</div></div>
                    <div><span className="text-matrix-text-muted">Liquidity:</span><div className="text-matrix-text-primary font-bold">${formatCurrency(market.liquidity)}</div></div>
                    <div><span className="text-matrix-text-muted">Assets:</span><div className="text-matrix-text-primary font-bold">{market.assetIds.length}</div></div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </MatrixModal>

      {/* 测试持仓模态框 */}
      <MatrixModal isOpen={showTestPosition} onClose={() => setShowTestPosition(false)} title="Add Test Position" size="md"
        actions={<>
          <MatrixButton variant="secondary" onClick={() => setShowTestPosition(false)}>Cancel</MatrixButton>
          <MatrixButton variant="primary" onClick={addTestPosition}>Add Position</MatrixButton>
        </>}>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-matrix-text-secondary font-mono mb-1 block">Market</label>
              <select value={testPositionParams.marketId} onChange={(e) => setTestPositionParams(prev => ({ ...prev, marketId: e.target.value }))}
                className="w-full px-3 py-2 bg-matrix-bg-tertiary border border-matrix-border-tertiary rounded text-sm font-mono">
                {MARKET_TEMPLATES.map(m => <option key={m.id} value={m.id}>{m.question.substring(0, 30)}...</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-matrix-text-secondary font-mono mb-1 block">Direction</label>
              <select value={testPositionParams.outcome} onChange={(e) => setTestPositionParams(prev => ({ ...prev, outcome: e.target.value as 'yes' | 'no' }))}
                className="w-full px-3 py-2 bg-matrix-bg-tertiary border border-matrix-border-tertiary rounded text-sm font-mono">
                <option value="yes">YES</option><option value="no">NO</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-matrix-text-secondary font-mono mb-1 block">Amount (USDC)</label>
              <input type="number" value={testPositionParams.amount} onChange={(e) => setTestPositionParams(prev => ({ ...prev, amount: Number(e.target.value) }))}
                className="w-full px-3 py-2 bg-matrix-bg-tertiary border border-matrix-border-tertiary rounded text-sm font-mono" />
            </div>
            <div>
              <label className="text-xs text-matrix-text-secondary font-mono mb-1 block">Entry Price (¢)</label>
              <input type="number" step="0.01" min="0" max="1" value={testPositionParams.entryPrice} onChange={(e) => setTestPositionParams(prev => ({ ...prev, entryPrice: Number(e.target.value) }))}
                className="w-full px-3 py-2 bg-matrix-bg-tertiary border border-matrix-border-tertiary rounded text-sm font-mono" />
            </div>
            <div>
              <label className="text-xs text-matrix-text-secondary font-mono mb-1 block">Current Price (¢)</label>
              <input type="number" step="0.01" min="0" max="1" value={testPositionParams.currentPrice} onChange={(e) => setTestPositionParams(prev => ({ ...prev, currentPrice: Number(e.target.value) }))}
                className="w-full px-3 py-2 bg-matrix-bg-tertiary border border-matrix-border-tertiary rounded text-sm font-mono" />
            </div>
          </div>
          <div className="p-3 border border-matrix-border-tertiary rounded bg-matrix-bg-tertiary">
            <div className="text-xs text-matrix-text-secondary font-mono mb-1">Estimated PnL:</div>
            <div className={cn('text-lg font-bold font-mono',
              (testPositionParams.currentPrice - testPositionParams.entryPrice) * (testPositionParams.outcome === 'yes' ? 1 : -1) * testPositionParams.amount >= 0 ? 'text-matrix-success' : 'text-matrix-error'
            )}>${((testPositionParams.currentPrice - testPositionParams.entryPrice) * (testPositionParams.outcome === 'yes' ? 1 : -1) * testPositionParams.amount).toFixed(2)}</div>
          </div>
        </div>
      </MatrixModal>

      {/* 市场选择模态框 */}
      <MatrixModal isOpen={showMarketSelector} onClose={() => setShowMarketSelector(false)} title="Select Markets" size="lg"
        actions={<>
          <MatrixButton variant="secondary" onClick={() => setShowMarketSelector(false)}>Cancel</MatrixButton>
          <MatrixButton variant="primary" onClick={saveMarketSelection}>Save Selection ({selectedTemplates.length})</MatrixButton>
        </>}>
        <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-2">
          <div className="p-3 border border-matrix-border-primary rounded bg-matrix-bg-accent">
            <div className="text-sm text-matrix-text-primary font-mono mb-2">🌐 Import from Polymarket Event URL</div>
            <div className="flex gap-2">
              <MatrixInput value={eventUrl} onChange={setEventUrl} placeholder="https://polymarket.com/event/btc-updown-15m-..." disabled={isFetchingAssets} className="flex-1" />
              <MatrixButton onClick={handleImportEventUrl} loading={isFetchingAssets} variant="primary">Fetch</MatrixButton>
            </div>
          </div>
          <div>
            <div className="text-sm text-matrix-text-secondary font-mono mb-2">Or select preset markets (multi-select):</div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {MARKET_TEMPLATES.map((template) => (
                <button key={template.id} onClick={() => toggleTemplate(template.id)} className={cn('p-3 border rounded text-left transition-all',
                  selectedTemplates.includes(template.id) ? 'border-matrix-success bg-matrix-success/10' : 'border-matrix-border-tertiary bg-matrix-bg-tertiary hover:border-matrix-border-primary'
                )}>
                  <div className="flex items-center gap-2 mb-1">
                    <div className={cn('w-4 h-4 rounded border flex items-center justify-center text-xs',
                      selectedTemplates.includes(template.id) ? 'bg-matrix-success border-matrix-success text-black' : 'border-matrix-border-tertiary'
                    )}>{selectedTemplates.includes(template.id) && '✓'}</div>
                    <span className="text-xs px-2 py-0.5 bg-matrix-bg-accent rounded font-mono">{template.category?.toUpperCase()}</span>
                  </div>
                  <div className="text-sm text-matrix-text-primary font-mono line-clamp-2">{template.question}</div>
                </button>
              ))}
            </div>
          </div>
          <div className="border-t border-matrix-border-tertiary pt-4">
            <div className="text-sm text-matrix-text-secondary font-mono mb-2">Or manually enter asset IDs (comma separated):</div>
            <MatrixInput value={customAssetIds} onChange={setCustomAssetIds} placeholder="asset_id_1,asset_id_2,asset_id_3..." label="Custom Asset IDs" />
          </div>
        </div>
      </MatrixModal>
    </div>
  )
}

// ============================================
// 子组件
// ============================================

const StatCard: React.FC<{ label: string; value: string | number; success?: boolean; info?: boolean }> = ({ label, value, success, info }) => (
  <div className="p-2 border border-matrix-border-tertiary rounded bg-matrix-bg-tertiary/50">
    <div className="text-xs text-matrix-text-secondary font-mono">{label}</div>
    <div className={cn('text-base font-bold font-mono',
      success ? 'text-matrix-success' : info ? 'text-matrix-info' : 'text-matrix-text-primary'
    )}>{value}</div>
  </div>
)

const MarketCard: React.FC<{ market: Market; onClick: () => void }> = ({ market, onClick }) => {
  const { addPosition, addNotification: notify } = useAppStore()
  const [activePanel, setActivePanel] = React.useState<'YES' | 'NO' | null>(null)
  const [amount, setAmount] = React.useState('50')
  const yesPrice = market.outcomePrices[0] ?? 0.5
  const noPrice = market.outcomePrices[1] ?? 0.5

  const openPanel = (e: React.MouseEvent, side: 'YES' | 'NO') => {
    e.stopPropagation()
    setActivePanel(prev => prev === side ? null : side)
    setAmount('50')
  }

  const handleBuy = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (!activePanel) return
    const price = activePanel === 'YES' ? yesPrice : noPrice
    const priceIndex = activePanel === 'YES' ? 0 : 1
    const amt = parseFloat(amount)
    if (isNaN(amt) || amt <= 0) { notify('Please enter a valid amount', 'error'); return }
    const tokenId = market.assetIds?.[priceIndex] ?? market.assetIds?.[0] ?? market.id
    addPosition({
      tokenId,
      marketId: market.id,
      marketQuestion: market.question,
      outcome: activePanel,
      outcomeIndex: priceIndex,
      size: amt,
      entryPrice: price,
      currentPrice: price,
      pnl: { dollar: 0, percent: 0 },
      entryTime: new Date(),
      lastUpdate: new Date(),
    })
    notify(`Added ${activePanel} @ ${(price*100).toFixed(1)}c: ${market.question.substring(0, 35)}...`, 'success')
    setActivePanel(null)
  }

  return (
    <div
      className={cn('border rounded transition-all bg-matrix-bg-tertiary/50',
        activePanel ? 'border-matrix-border-primary' : 'border-matrix-border-tertiary hover:border-matrix-border-primary cursor-pointer'
      )}
      onClick={() => !activePanel && onClick()}
    >
      <div className="p-3">
        <div className="flex justify-between items-start mb-2">
          <span className="text-xs px-1.5 py-0.5 bg-matrix-bg-accent border border-matrix-border-primary rounded text-matrix-text-secondary font-mono">
            {market.category?.toUpperCase() || 'CRYPTO'}
          </span>
          <span className="text-xs text-matrix-text-muted font-mono">{new Date(market.endDate).toLocaleDateString()}</span>
        </div>
        <h4 className="text-matrix-text-primary font-semibold text-xs mb-2 line-clamp-2 min-h-[2rem]">{market.question}</h4>

        <div className="grid grid-cols-2 gap-1.5 mb-1.5">
          <div className="p-1.5 rounded text-center font-mono bg-matrix-success/10 text-matrix-success border border-matrix-success/30">
            <div className="text-xs opacity-70">YES</div>
            <div className="text-sm font-bold">{(yesPrice * 100).toFixed(1)}&#162;</div>
          </div>
          <div className="p-1.5 rounded text-center font-mono bg-matrix-error/10 text-matrix-error border border-matrix-error/30">
            <div className="text-xs opacity-70">NO</div>
            <div className="text-sm font-bold">{(noPrice * 100).toFixed(1)}&#162;</div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-1.5 mb-2">
          <button
            onClick={(e) => openPanel(e, 'YES')}
            className={cn('w-full py-1 rounded text-xs font-mono transition-all border',
              activePanel === 'YES'
                ? 'bg-matrix-success text-black border-matrix-success'
                : 'bg-matrix-success/10 text-matrix-success border-matrix-success/40 hover:bg-matrix-success/20'
            )}
          >{activePanel === 'YES' ? '✓ YES' : '+ Buy YES'}</button>
          <button
            onClick={(e) => openPanel(e, 'NO')}
            className={cn('w-full py-1 rounded text-xs font-mono transition-all border',
              activePanel === 'NO'
                ? 'bg-matrix-error text-black border-matrix-error'
                : 'bg-matrix-error/10 text-matrix-error border-matrix-error/40 hover:bg-matrix-error/20'
            )}
          >{activePanel === 'NO' ? '✓ NO' : '+ Buy NO'}</button>
        </div>

        {activePanel && (
          <div
            className={cn('p-2 rounded border mb-2',
              activePanel === 'YES' ? 'border-matrix-success/40 bg-matrix-success/5' : 'border-matrix-error/40 bg-matrix-error/5'
            )}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex gap-2">
              <div className="flex-1 flex items-center bg-matrix-bg-tertiary border border-matrix-border-primary rounded px-2">
                <span className="text-xs text-matrix-text-muted font-mono mr-1">$</span>
                <input
                  type="number" value={amount} onChange={(e) => setAmount(e.target.value)}
                  onClick={(e) => e.stopPropagation()}
                  className="w-full bg-transparent text-xs font-mono text-matrix-text-primary py-1 focus:outline-none"
                  placeholder="50" min="1" step="10" autoFocus
                />
              </div>
              <button onClick={handleBuy}
                className={cn('px-3 py-1 rounded text-xs font-mono font-bold',
                  activePanel === 'YES' ? 'bg-matrix-success text-black' : 'bg-matrix-error text-black'
                )}
              >Confirm</button>
              <button
                onClick={(e) => { e.stopPropagation(); setActivePanel(null) }}
                className="px-2 py-1 rounded text-xs font-mono text-matrix-text-muted border border-matrix-border-tertiary"
              >✕</button>
            </div>
            {parseFloat(amount) > 0 && (
              <div className="mt-1 text-xs font-mono text-matrix-text-muted">
                Shares: <span className="text-matrix-text-primary">{(parseFloat(amount) / ((activePanel === 'YES' ? yesPrice : noPrice) || 0.5)).toFixed(2)}</span>
                {'  ·  '}Max profit: <span className="text-matrix-success">${(parseFloat(amount) / ((activePanel === 'YES' ? yesPrice : noPrice) || 0.5) - parseFloat(amount)).toFixed(2)}</span>
              </div>
            )}
          </div>
        )}

        <div className="flex justify-between text-xs text-matrix-text-secondary font-mono pt-2 border-t border-matrix-border-tertiary">
          <span>Vol: {formatCurrency(market.volume)}</span>
          <span>Liq: {formatCurrency(market.liquidity)}</span>
        </div>
      </div>
    </div>
  )
}
export default MarketsView