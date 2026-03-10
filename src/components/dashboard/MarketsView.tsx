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
  conditionId?: string
  slug?: string
  lastTradePrice?: number
}

// 预设市场模板
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
      const slug = decodeURIComponent(pathParts[eventIndex + 1])
      return slug
    }

    const lastPart = pathParts.filter(Boolean).pop()
    if (lastPart) {
      return decodeURIComponent(lastPart)
    }

    return null
  } catch (error) {
    console.error('URL 解析失败:', error)
    return null
  }
}

const fetchMarketDataFromSlug = async (
  slug: string,
  addLog: (msg: string) => void
): Promise<{
  conditionId: string
  assetIds: string[]
  question: string
} | null> => {
  try {
    addLog(`🔍 查询 Gamma API: slug=${slug}`)
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 15000)

    // 使用 Vite 本地代理
    const gammaUrl = `/api/gamma/markets?slug=${slug}`

    try {
      const response = await fetch(gammaUrl, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
        },
        signal: controller.signal,
      })

      clearTimeout(timeoutId)

      if (!response.ok) {
        throw new Error(`API 响应失败：${response.status} ${response.statusText}`)
      }

      const text = await response.text()

      let markets: any[]
      try {
        markets = JSON.parse(text)
      } catch {
        addLog(`❌ 响应不是有效的 JSON`)
        return null
      }

      if (!Array.isArray(markets) || markets.length === 0) {
        addLog(`❌ 未找到 slug 为 '${slug}' 的市场`)
        return null
      }

      const market = markets[0]
      addLog(`✅ 找到市场：${market.question || market.title || '未知'}`)

      const conditionId = market.conditionId || market.condition_id || market.conditionID
      if (conditionId) {
        addLog(`📋 Condition ID: ${conditionId.substring(0, 20)}...`)
      }

      const tokens = market.tokens || market.outcomes || market.clobTokenIds || []

      let assetIds: string[] = []

      if (Array.isArray(tokens)) {
        assetIds = tokens
          .map((t: any) => {
            if (typeof t === 'string') return t
            return t.id || t.token_id || t.assetId || t.tokenId || ''
          })
          .filter(Boolean)
      }

      if (assetIds.length === 0 && market.clobTokenIds) {
        assetIds = Array.isArray(market.clobTokenIds)
          ? market.clobTokenIds
          : [market.clobTokenIds]
      }

      if (assetIds.length < 2) {
        addLog(`⚠️ 资产 ID 数量不足：${assetIds.length}`)
        console.log('完整市场响应:', JSON.stringify(market, null, 2))

        if (assetIds.length === 0) {
          return null
        }
      }

      addLog(`✅ 获取到 ${assetIds.length} 个资产 ID`)
      assetIds.forEach((id: string, i: number) => {
        addLog(`   ${i + 1}. ${id.substring(0, 24)}...`)
      })

      return {
        conditionId: conditionId || '',
        assetIds,
        question: market.question || market.title || '未知市场',
      }

    } catch (fetchError: any) {
      clearTimeout(timeoutId)

      if (fetchError.name === 'AbortError') {
        addLog(`❌ 请求超时（15 秒）`)
      } else {
        throw fetchError
      }
      return null
    }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : '未知错误'
    addLog(`❌ 获取失败：${errorMsg}`)
    return null
  }
}

// ============================================
// 主组件
// ============================================

export const MarketsView: React.FC = () => {
  // ✅ 修改：从 Store 获取策略状态（而不是本地 state）
  const {
    setScanning,
    addNotification,
    setMarkets,
    strategy,              // ✅ 新增：获取全局策略状态
    setStrategyRunning     // ✅ 新增：获取设置策略状态的方法
  } = useAppStore()

  const [markets, setMarketsData] = useState<Market[]>([])
  const [scanStatus, setScanStatus] = useState<'idle' | 'scanning' | 'connected' | 'error'>('idle')
  const [scanLog, setScanLog] = useState<string[]>([])
  const [filter, setFilter] = useState('all')
  const [sortBy, setSortBy] = useState('volume')
  const [wsStatus, setWsStatus] = useState('disconnected')
  const [messageCount, setMessageCount] = useState(0)
  const [showMarketSelector, setShowMarketSelector] = useState(false)
  const [selectedTemplates, setSelectedTemplates] = useState<string[]>(['btc-100k-2026', 'eth-5k-q2', 'fed-rates-march'])
  const [customAssetIds, setCustomAssetIds] = useState('')
  const [eventUrl, setEventUrl] = useState('')
  const [isFetchingAssets, setIsFetchingAssets] = useState(false)
  const [showManualGuide, setShowManualGuide] = useState(false)

  // ❌ 删除这行：const [strategyEnabled, setStrategyEnabled] = useState(false)
  // ✅ 改用 Store 状态代替本地 state
  const strategyEnabled = strategy.isRunning

  const [tradeSignals, setTradeSignals] = useState<TradeSignal[]>([])

  // ✅ 保留：测试持仓自定义参数
  const [showTestPositionModal, setShowTestPositionModal] = useState(false)
  const [testPositionParams, setTestPositionParams] = useState({
    marketId: 'btc-100k-2026',
    outcome: 'yes' as 'yes' | 'no',
    amount: 50,
    entryPrice: 0.42,
    currentPrice: 0.45,
  })

  // 日志自动滚动
  const logRef = useRef<HTMLDivElement>(null)

  const addLog = (message: string) => {
    setScanLog((prev) => [...prev, `[${new Date().toLocaleTimeString()}] ${message}`])
    // 自动滚动到底部
    setTimeout(() => {
      if (logRef.current) {
        logRef.current.scrollTop = logRef.current.scrollHeight
      }
    }, 50)
  }

  // ✅ 保留：添加测试持仓函数
  const addTestPosition = () => {
    const store = useAppStore.getState()
    const pnl = (testPositionParams.currentPrice - testPositionParams.entryPrice) * testPositionParams.amount *
                (testPositionParams.outcome === 'yes' ? 1 : -1)

    const position = {
      tokenId: `test-${Date.now()}`,
      marketId: testPositionParams.marketId,
      outcome: testPositionParams.outcome,
      amount: testPositionParams.amount,
      entryPrice: testPositionParams.entryPrice,
      currentPrice: testPositionParams.currentPrice,
      pnl,
      openedAt: Date.now(),
    }

    store.addPosition(position)
    addLog(`✅ Test position added: ${testPositionParams.outcome.toUpperCase()} @ ${(testPositionParams.entryPrice * 100).toFixed(1)}¢`)
    addNotification('Test position added successfully', 'success')
    setShowTestPositionModal(false)
  }

  const handleImportEventUrl = async () => {
    const trimmedUrl = eventUrl.trim()
    if (!trimmedUrl) {
      addNotification('Please enter event URL', 'error')
      return
    }

    setIsFetchingAssets(true)
    addLog('🌐 Parsing event URL...')
    addLog(`   Input: ${trimmedUrl}`)

    const slug = extractSlugFromUrl(trimmedUrl)

    if (!slug) {
      addLog('❌ Failed to extract slug from URL')
      addLog('   Please check URL format, e.g.:')
      addLog('   https://polymarket.com/event/btc-updown-15m-1773011700')
      addNotification('Invalid URL format, please check and retry', 'error')
      setIsFetchingAssets(false)
      return
    }

    addLog(`📋 Extracted slug: ${slug}`)

    const marketData = await fetchMarketDataFromSlug(slug, addLog)

    if (marketData && marketData.assetIds.length >= 1) {
      const existingIds = customAssetIds
        .split(',')
        .map(s => s.trim())
        .filter(Boolean)

      const newIds = marketData.assetIds.filter(id => !existingIds.includes(id))
      const allIds = [...existingIds, ...newIds]

      setCustomAssetIds(allIds.join(','))
      addNotification(
        `Successfully imported ${newIds.length} new asset IDs (total: ${allIds.length})`,
        'success'
      )
      addLog(`✅ Import complete! Market: ${marketData.question}`)
      setEventUrl('')
    } else {
      addNotification('Failed to fetch, check logs or enter asset IDs manually', 'error')
      addLog('💡 Tip: Try using browser DevTools to manually get asset IDs')
    }

    setIsFetchingAssets(false)
  }

  // ✅ 连接 WebSocket
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
        // 连接成功后加载市场
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
      addNotification(`Strategy signal: ${signal.reason}`, 'info')

      // ✅ 保留：执行交易
      if (signal.confidence >= 0.7) {
        addLog(`📝 Executing trade: ${signal.strategy}`)

        const result = await tradingService.createOrder({
          tokenId: signal.asset_id,
          side: signal.action === 'buy' ? 'BUY' : 'SELL',
          amount: signal.size,
          orderType: 'GTC',
          price: signal.price,
          reason: signal.reason,
          signal: signal,
        })

        if (result.success) {
          addLog(`✅ Trade successful: ${result.orderId}`)
          addNotification('Trade executed successfully', 'success')
          // 更新持仓显示
          const positions = tradingService.getPositions()
          // 这里可以添加更新 Store 的逻辑
        } else {
          addLog(`❌ Trade failed: ${result.error}`)
        }
      }
    })

    connectWebSocket()

    return () => {
      if (unsubscribe) unsubscribe()
      if (strategyUnsubscribe) strategyUnsubscribe()
      realtimeService.disconnect()
      // ❌ 删除这行：strategyManager.stop()
      // 策略由 Store 统一管理，不在组件卸载时停止
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const updateMarketFromOrderBook = (data: MarketData) => {
    if (!data.data) return
    setMarketsData(prev => prev.map(market => {
      if (market.assetIds?.includes(data.asset_id || '')) {
        const book = data.data as OrderBook
        if (book.bids && book.bids.length > 0) {
          const bestBid = book.bids[0][0]
          const bestAsk = book.asks?.[0]?.[0] || bestBid

          return {
            ...market,
            outcomePrices: [bestBid, bestAsk],
            liquidity: book.bids.reduce((sum, b) => sum + b[1], 0) + (book.asks?.reduce((sum, a) => sum + a[1], 0) || 0),
          }
        }
      }
      return market
    }))
  }

  const updateMarketFromTrade = (data: MarketData) => {
    if (!data.data?.price) return
    setMarketsData(prev => prev.map(market => {
      if (market.assetIds?.includes(data.asset_id || '')) {
        return {
          ...market,
          outcomePrices: market.outcomePrices.map((p, i) =>
            i === 0 ? data.data.price : p
          ),
          lastTradePrice: data.data.price,
        }
      }
      return market
    }))
  }

  // ✅ 加载选择的市场
  const loadSelectedMarkets = () => {
    const selectedMarkets = MARKET_TEMPLATES.filter(m => selectedTemplates.includes(m.id))

    if (customAssetIds.trim()) {
      const ids = customAssetIds.trim().split(',').map(s => s.trim()).filter(Boolean)
      if (ids.length >= 1) {
        selectedMarkets.push({
          id: `custom-${Date.now()}`,
          question: `Custom Market (${ids[0].substring(0, 10)}...)`,
          volume: 0,
          liquidity: 0,
          outcomePrices: [0.5, 0.5],
          endDate: '2026-12-31T23:59:59Z',
          active: true,
          category: 'custom',
          assetIds: ids,
        })
      }
    }

    setMarketsData(selectedMarkets)
    setMarkets(selectedMarkets)

    // ✅ 修复：只有在已连接状态下才订阅
    const allAssetIds = selectedMarkets.flatMap(m => m.assetIds || []).filter(Boolean)
    const status = realtimeService.getStatus()

    if (allAssetIds.length > 0 && status === 'connected') {
      realtimeService.subscribe(allAssetIds)
      addLog(`📡 Subscribed to ${allAssetIds.length} assets`)
    } else if (allAssetIds.length > 0) {
      addLog(`⚠️ WebSocket not connected (${status}), assets will be subscribed after connection`)
    }
  }

  const handleScan = async () => {
    if (scanStatus === 'scanning') return
    setScanStatus('scanning')
    setScanning(true)
    setMarketsData([])
    setScanLog([])
    setMessageCount(0)
    addLog('🔍 Reconnecting market data...')
    addNotification('Reconnecting real-time data', 'info')

    realtimeService.disconnect()
    await new Promise(resolve => setTimeout(resolve, 1000))

    const connected = await realtimeService.connect()

    if (connected) {
      setWsStatus(realtimeService.getStatus())
      loadSelectedMarkets()
      setScanStatus('connected')
      addLog('✅ Reconnection successful')
      addNotification('Real-time data refreshed', 'success')
    } else {
      setScanStatus('error')
      addLog('❌ Reconnection failed')
      addNotification('Reconnection failed', 'error')
    }

    setScanning(false)
  }

  // ✅ 修改：使用 Store action 而不是直接操作 strategyManager
  const toggleStrategy = () => {
    // ✅ 调用 Store action，而不是直接操作 strategyManager
    setStrategyRunning(!strategyEnabled)

    if (!strategyEnabled) {
      addLog('🚀 Strategy engine started')
      addNotification('Strategy engine started', 'success')
    } else {
      addLog('⏹️ Strategy engine stopped')
      addNotification('Strategy engine stopped', 'info')
    }
  }

  const toggleTemplate = (templateId: string) => {
    setSelectedTemplates(prev =>
      prev.includes(templateId)
        ? prev.filter(id => id !== templateId)
        : [...prev, templateId]
    )
  }

  // ✅ 保存市场选择
  const saveMarketSelection = async () => {
    loadSelectedMarkets()
    setShowMarketSelector(false)
    addNotification(`Selected ${selectedTemplates.length} markets`, 'success')
    // 如果 WebSocket 未连接，自动重连
    const status = realtimeService.getStatus()
    if (status !== 'connected') {
      addLog('🔄 WebSocket not connected, reconnecting...')
      await handleScan()
    }
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

  return (
    <div className="flex flex-col h-full overflow-hidden p-4 space-y-3">
      {/* 顶部区域：Scanner Control */}
      <div className="flex-shrink-0">
        <MatrixCard title="MARKET SCANNER" subtitle="Real-time Polymarket data via WebSocket">
          <div className="flex justify-between items-center mb-3">
            <div className="text-sm text-matrix-text-secondary font-mono">
              Status:
              <span className={cn(
                'ml-2',
                scanStatus === 'idle' ? 'text-matrix-text-muted' :
                scanStatus === 'scanning' ? 'text-matrix-warning' :
                scanStatus === 'connected' ? 'text-matrix-success' :
                'text-matrix-error'
              )}>
                {scanStatus === 'idle' && 'Idle'}
                {scanStatus === 'scanning' && 'Connecting...'}
                {scanStatus === 'connected' && '● Connected'}
                {scanStatus === 'error' && 'Error'}
              </span>
            </div>
            <div className="flex gap-2">
              {/* ✅ 按钮状态直接使用 Store 状态 */}
              <MatrixButton
                variant={strategyEnabled ? 'success' : 'secondary'}
                onClick={toggleStrategy}
              >
                {strategyEnabled ? '🤖 Strategy Running' : '🤖 Start Strategy'}
              </MatrixButton>

              {/* ✅ 保留：测试持仓按钮 */}
              <MatrixButton
                variant="secondary"
                onClick={() => setShowTestPositionModal(true)}
              >
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
            <div className="p-2 border border-matrix-border-tertiary rounded bg-matrix-bg-tertiary/50">
              <div className="text-xs text-matrix-text-secondary font-mono">WebSocket Status</div>
              <div className={cn(
                'text-base font-bold font-mono',
                wsStatus === 'connected' ? 'text-matrix-success' : 'text-matrix-error'
              )}>
                {wsStatus.toUpperCase()}
              </div>
            </div>
            <div className="p-2 border border-matrix-border-tertiary rounded bg-matrix-bg-tertiary/50">
              <div className="text-xs text-matrix-text-secondary font-mono">Subscribed Assets</div>
              <div className="text-base font-bold font-mono text-matrix-text-primary">
                {realtimeService.getSubscribedAssets().length}
              </div>
            </div>
            <div className="p-2 border border-matrix-border-tertiary rounded bg-matrix-bg-tertiary/50">
              <div className="text-xs text-matrix-text-secondary font-mono">Messages Received</div>
              <div className="text-base font-bold font-mono text-matrix-info">
                {messageCount}
              </div>
            </div>
            <div className="p-2 border border-matrix-border-tertiary rounded bg-matrix-bg-tertiary/50">
              <div className="text-xs text-matrix-text-secondary font-mono">Strategy Signals</div>
              <div className={cn(
                'text-base font-bold font-mono',
                strategyEnabled ? 'text-matrix-success' : 'text-matrix-text-muted'
              )}>
                {tradeSignals.length}
              </div>
            </div>
          </div>
        </MatrixCard>
      </div>

      {/* 中间区域：市场列表 */}
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
                <MatrixButton onClick={handleScan} variant="primary">
                  Connect Real-time Data
                </MatrixButton>
                <MatrixButton onClick={() => setShowMarketSelector(true)} variant="secondary">
                  Select Markets
                </MatrixButton>
              </div>
            </div>
          </MatrixCard>
        ) : (
          <MatrixCard
            title={`MARKETS (${filteredMarkets.length}) - Real-time Updates`}
            className="h-full flex flex-col"
            headerExtra={
              <div className="flex gap-3 items-center text-xs">
                <select
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                  className="bg-matrix-bg-tertiary border border-matrix-border-tertiary rounded px-2 py-1 text-xs font-mono text-matrix-text-primary"
                >
                  {categories.map(cat => (
                    <option key={cat} value={cat}>
                      {cat === 'all' ? 'All' : cat.toUpperCase()}
                    </option>
                  ))}
                </select>
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value)}
                  className="bg-matrix-bg-tertiary border border-matrix-border-tertiary rounded px-2 py-1 text-xs font-mono text-matrix-text-primary"
                >
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
                  <div
                    key={market.id}
                    className="p-3 border border-matrix-border-tertiary rounded hover:border-matrix-border-primary transition-all cursor-pointer bg-matrix-bg-tertiary/50"
                    onClick={() => {
                      addNotification(`Selected market: ${market.question.substring(0, 50)}...`, 'info')
                    }}
                  >
                    <div className="flex justify-between items-start mb-2">
                      <span className="text-xs px-1.5 py-0.5 bg-matrix-bg-accent border border-matrix-border-primary rounded text-matrix-text-secondary font-mono">
                        {market.category?.toUpperCase() || 'CRYPTO'}
                      </span>
                      <span className="text-xs text-matrix-text-muted font-mono">
                        {new Date(market.endDate).toLocaleDateString()}
                      </span>
                    </div>

                    <h4 className="text-matrix-text-primary font-semibold text-xs mb-2 line-clamp-2">
                      {market.question}
                    </h4>

                    <div className="grid grid-cols-2 gap-1.5 mb-2">
                      {market.outcomePrices.slice(0, 2).map((price, index) => (
                        <div
                          key={index}
                          className={cn(
                            'p-1.5 rounded text-center font-mono text-xs',
                            index === 0
                              ? 'bg-matrix-success/10 text-matrix-success border border-matrix-success/30'
                              : 'bg-matrix-error/10 text-matrix-error border border-matrix-error/30'
                          )}
                        >
                          <div className="text-xs opacity-70">
                            {index === 0 ? 'YES' : 'NO'}
                          </div>
                          <div className="text-sm font-bold">
                            {(price * 100).toFixed(1)}¢
                          </div>
                        </div>
                      ))}
                    </div>

                    <div className="flex justify-between text-xs text-matrix-text-secondary font-mono pt-2 border-t border-matrix-border-tertiary">
                      <span>Vol: {formatCurrency(market.volume)}</span>
                      <span>Liq: {formatCurrency(market.liquidity)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </MatrixCard>
        )}
      </div>

      {/* 底部区域：日志面板 */}
      <div className="flex-shrink-0 h-44">
        <MatrixCard title="CONNECTION LOG" className="h-full flex flex-col">
          <div
            ref={logRef}
            className="flex-1 overflow-y-auto pr-2 font-mono text-xs"
          >
            {scanLog.length === 0 ? (
              <div className="text-matrix-text-muted text-center py-4">
                Waiting for connection logs...
              </div>
            ) : (
              scanLog.slice(-100).map((log, index) => (
                <div
                  key={index}
                  className={cn(
                    'py-0.5',
                    log.includes('✅') ? 'text-matrix-success' :
                    log.includes('❌') ? 'text-matrix-error' :
                    log.includes('⚠️') ? 'text-matrix-warning' :
                    log.includes('📊') ? 'text-matrix-info' :
                    log.includes('🔍') ? 'text-matrix-info' :
                    'text-matrix-text-secondary'
                  )}
                >
                  {log}
                </div>
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
                <div
                  key={`${signal.timestamp}-${index}`}
                  className="flex items-center gap-2 py-1 text-xs font-mono border-b border-matrix-border-tertiary/50"
                >
                  <span className="text-matrix-text-muted">
                    {new Date(signal.timestamp).toLocaleTimeString()}
                  </span>
                  <span className={cn(
                    'font-bold',
                    signal.action === 'buy' ? 'text-matrix-success' : 'text-matrix-error'
                  )}>
                    {signal.action.toUpperCase()} {signal.side.toUpperCase()}
                  </span>
                  <span className="text-matrix-info">
                    {(signal.price * 100).toFixed(1)}¢
                  </span>
                  <span className={cn(
                    signal.confidence > 0.7 ? 'text-matrix-success' : 'text-matrix-warning'
                  )}>
                    {(signal.confidence * 100).toFixed(0)}%
                  </span>
                </div>
              ))}
            </div>
          </MatrixCard>
        </div>
      )}

      {/* ✅ 保留：测试持仓自定义模态框 */}
      <MatrixModal
        isOpen={showTestPositionModal}
        onClose={() => setShowTestPositionModal(false)}
        title="Add Test Position"
        size="md"
        actions={
          <>
            <MatrixButton variant="secondary" onClick={() => setShowTestPositionModal(false)}>
              Cancel
            </MatrixButton>
            <MatrixButton variant="primary" onClick={addTestPosition}>
              Add Position
            </MatrixButton>
          </>
        }
      >
        <div className="space-y-4">
          <div className="text-xs text-matrix-text-muted font-mono">
            Customize test position parameters for testing:
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-matrix-text-secondary font-mono mb-1 block">
                Market
              </label>
              <select
                value={testPositionParams.marketId}
                onChange={(e) => setTestPositionParams(prev => ({ ...prev, marketId: e.target.value }))}
                className="w-full px-3 py-2 bg-matrix-bg-tertiary border border-matrix-border-tertiary rounded text-sm font-mono"
              >
                {MARKET_TEMPLATES.map(m => (
                  <option key={m.id} value={m.id}>{m.question.substring(0, 30)}...</option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs text-matrix-text-secondary font-mono mb-1 block">
                Direction
              </label>
              <select
                value={testPositionParams.outcome}
                onChange={(e) => setTestPositionParams(prev => ({ ...prev, outcome: e.target.value as 'yes' | 'no' }))}
                className="w-full px-3 py-2 bg-matrix-bg-tertiary border border-matrix-border-tertiary rounded text-sm font-mono"
              >
                <option value="yes">YES</option>
                <option value="no">NO</option>
              </select>
            </div>

            <div>
              <label className="text-xs text-matrix-text-secondary font-mono mb-1 block">
                Amount (USDC)
              </label>
              <input
                type="number"
                value={testPositionParams.amount}
                onChange={(e) => setTestPositionParams(prev => ({ ...prev, amount: Number(e.target.value) }))}
                className="w-full px-3 py-2 bg-matrix-bg-tertiary border border-matrix-border-tertiary rounded text-sm font-mono"
              />
            </div>

            <div>
              <label className="text-xs text-matrix-text-secondary font-mono mb-1 block">
                Entry Price (¢)
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                max="1"
                value={testPositionParams.entryPrice}
                onChange={(e) => setTestPositionParams(prev => ({ ...prev, entryPrice: Number(e.target.value) }))}
                className="w-full px-3 py-2 bg-matrix-bg-tertiary border border-matrix-border-tertiary rounded text-sm font-mono"
              />
            </div>

            <div>
              <label className="text-xs text-matrix-text-secondary font-mono mb-1 block">
                Current Price (¢)
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                max="1"
                value={testPositionParams.currentPrice}
                onChange={(e) => setTestPositionParams(prev => ({ ...prev, currentPrice: Number(e.target.value) }))}
                className="w-full px-3 py-2 bg-matrix-bg-tertiary border border-matrix-border-tertiary rounded text-sm font-mono"
              />
            </div>
          </div>

          {/* 预览盈亏 */}
          <div className="p-3 border border-matrix-border-tertiary rounded bg-matrix-bg-tertiary">
            <div className="text-xs text-matrix-text-secondary font-mono mb-1">
              Estimated PnL:
            </div>
            <div className={cn(
              'text-lg font-bold font-mono',
              (testPositionParams.currentPrice - testPositionParams.entryPrice) *
              (testPositionParams.outcome === 'yes' ? 1 : -1) * testPositionParams.amount >= 0
                ? 'text-matrix-success' : 'text-matrix-error'
            )}>
              ${((testPositionParams.currentPrice - testPositionParams.entryPrice) *
                (testPositionParams.outcome === 'yes' ? 1 : -1) *
                testPositionParams.amount).toFixed(2)}
            </div>
          </div>
        </div>
      </MatrixModal>

      {/* 市场选择模态框 */}
      <MatrixModal
        isOpen={showMarketSelector}
        onClose={() => setShowMarketSelector(false)}
        title="Select Markets"
        size="lg"
        actions={
          <>
            <MatrixButton variant="secondary" onClick={() => setShowMarketSelector(false)}>
              Cancel
            </MatrixButton>
            <MatrixButton variant="primary" onClick={saveMarketSelection}>
              Save Selection ({selectedTemplates.length})
            </MatrixButton>
          </>
        }
      >
        <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-2">
          {/* 事件 URL 导入 */}
          <div className="p-3 border border-matrix-border-primary rounded bg-matrix-bg-accent">
            <div className="text-sm text-matrix-text-primary font-mono mb-2">
              🌐 Import from Polymarket Event URL
            </div>
            <div className="flex gap-2">
              <MatrixInput
                value={eventUrl}
                onChange={setEventUrl}
                placeholder="https://polymarket.com/event/btc-updown-15m-..."
                disabled={isFetchingAssets}
                className="flex-1"
              />
              <MatrixButton
                onClick={handleImportEventUrl}
                loading={isFetchingAssets}
                variant="primary"
              >
                Fetch
              </MatrixButton>
            </div>
            <div className="text-xs text-matrix-text-muted font-mono mt-2">
              💡 Use Vite proxy to fetch Gamma API data
            </div>
          </div>

          {/* 预设市场选择 */}
          <div>
            <div className="text-sm text-matrix-text-secondary font-mono mb-2">
              Or select preset markets (multi-select):
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {MARKET_TEMPLATES.map((template) => (
                <button
                  key={template.id}
                  onClick={() => toggleTemplate(template.id)}
                  className={cn(
                    'p-3 border rounded text-left transition-all',
                    selectedTemplates.includes(template.id)
                      ? 'border-matrix-success bg-matrix-success/10'
                      : 'border-matrix-border-tertiary bg-matrix-bg-tertiary hover:border-matrix-border-primary'
                  )}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <div className={cn(
                      'w-4 h-4 rounded border flex items-center justify-center text-xs',
                      selectedTemplates.includes(template.id)
                        ? 'bg-matrix-success border-matrix-success text-black'
                        : 'border-matrix-border-tertiary'
                    )}>
                      {selectedTemplates.includes(template.id) && '✓'}
                    </div>
                    <span className="text-xs px-2 py-0.5 bg-matrix-bg-accent rounded font-mono">
                      {template.category?.toUpperCase()}
                    </span>
                  </div>
                  <div className="text-sm text-matrix-text-primary font-mono line-clamp-2">
                    {template.question}
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* 自定义资产 ID */}
          <div className="border-t border-matrix-border-tertiary pt-4">
            <div className="text-sm text-matrix-text-secondary font-mono mb-2">
              Or manually enter asset IDs (comma separated):
            </div>
            <MatrixInput
              value={customAssetIds}
              onChange={setCustomAssetIds}
              placeholder="asset_id_1,asset_id_2,asset_id_3..."
              label="Custom Asset IDs"
            />

            <div className="mt-3">
              <button
                onClick={() => setShowManualGuide(true)}
                className="text-xs text-matrix-info font-mono hover:underline flex items-center gap-1"
              >
                📖 View Detailed Tutorial
              </button>
            </div>
          </div>

          {/* 当前选择 */}
          {customAssetIds && (
            <div className="p-3 border border-matrix-border-primary rounded bg-matrix-bg-tertiary">
              <div className="text-xs text-matrix-text-secondary font-mono mb-1">Current Asset IDs:</div>
              <div className="text-xs text-matrix-success font-mono break-all">
                {customAssetIds.length > 100 ? customAssetIds.substring(0, 100) + '...' : customAssetIds}
              </div>
            </div>
          )}
        </div>
      </MatrixModal>

      {/* 手动查找教程模态框 */}
      <MatrixModal
        isOpen={showManualGuide}
        onClose={() => setShowManualGuide(false)}
        title="📖 How to Find Asset IDs Manually"
        size="lg"
      >
        <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-2 text-sm">
          <div className="p-4 border border-matrix-border-primary rounded bg-matrix-bg-accent">
            <h4 className="text-matrix-text-primary font-mono mb-2">Method: Using Browser DevTools</h4>
            <ol className="space-y-2 text-matrix-text-secondary font-mono text-xs">
              <li>1. Open Polymarket event page</li>
              <li>2. Press F12 to open DevTools</li>
              <li>3. Switch to Network tab</li>
              <li>4. Refresh page (Ctrl+R)</li>
              <li>5. Filter by "gamma" or "markets"</li>
              <li>6. Find gamma-api.polymarket.com/markets request</li>
              <li>7. Switch to Response tab</li>
              <li>8. Copy id from tokens array</li>
            </ol>
          </div>

          <div className="p-4 border border-matrix-warning/30 rounded bg-matrix-warning/10">
            <h4 className="text-matrix-warning font-mono mb-2">⚠️ Notes</h4>
            <ul className="space-y-1 text-matrix-text-muted font-mono text-xs">
              <li>• Asset ID is a very long numeric string (~80 chars)</li>
              <li>• At least 1 ID required</li>
              <li>• Separate with commas, no spaces</li>
            </ul>
          </div>
        </div>
      </MatrixModal>
    </div>
  )
}

export default MarketsView