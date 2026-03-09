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
        addLog(`❌ 请求超时（15秒）`)
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
  const { setScanning, addNotification, setMarkets } = useAppStore()
  const [markets, setMarketsData] = useState<Market[]>([])
  const [scanStatus, setScanStatus] = useState<'idle' | 'scanning' | 'connected' | 'error'>('idle')
  const [scanLog, setScanLog] = useState<string[]>([])
  const [filter, setFilter] = useState<string>('all')
  const [sortBy, setSortBy] = useState<string>('volume')
  const [wsStatus, setWsStatus] = useState<string>('disconnected')
  const [messageCount, setMessageCount] = useState(0)

  const [showMarketSelector, setShowMarketSelector] = useState(false)
  const [selectedTemplates, setSelectedTemplates] = useState<string[]>(['btc-100k-2026', 'eth-5k-q2', 'fed-rates-march'])
  const [customAssetIds, setCustomAssetIds] = useState<string>('')
  const [eventUrl, setEventUrl] = useState<string>('')
  const [isFetchingAssets, setIsFetchingAssets] = useState(false)
  const [showManualGuide, setShowManualGuide] = useState(false)

  const [strategyEnabled, setStrategyEnabled] = useState(false)
  const [tradeSignals, setTradeSignals] = useState<TradeSignal[]>([])

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

  const handleImportEventUrl = async () => {
    const trimmedUrl = eventUrl.trim()

    if (!trimmedUrl) {
      addNotification('请输入事件 URL', 'error')
      return
    }

    setIsFetchingAssets(true)
    addLog('🌐 正在解析事件 URL...')
    addLog(`   输入: ${trimmedUrl}`)

    const slug = extractSlugFromUrl(trimmedUrl)

    if (!slug) {
      addLog('❌ 无法从 URL 中提取 slug')
      addLog('   请检查 URL 格式，例如:')
      addLog('   https://polymarket.com/event/btc-updown-15m-1773011700')
      addNotification('无效的 URL 格式，请检查并重试', 'error')
      setIsFetchingAssets(false)
      return
    }

    addLog(`📋 提取的 slug: ${slug}`)

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
        `成功导入 ${newIds.length} 个新资产 ID（共 ${allIds.length} 个）`,
        'success'
      )
      addLog(`✅ 导入完成！市场: ${marketData.question}`)
      setEventUrl('')
    } else {
      addNotification('获取失败，请查看日志或手动输入资产 ID', 'error')
      addLog('💡 提示: 可以尝试使用浏览器开发者工具手动获取资产 ID')
    }

    setIsFetchingAssets(false)
  }

  // ✅ 连接 WebSocket
  useEffect(() => {
    let unsubscribe: (() => void) | undefined
    let strategyUnsubscribe: (() => void) | undefined

    const connectWebSocket = async () => {
      addLog('🔌 正在连接 Polymarket WebSocket...')

      const connected = await realtimeService.connect()

      if (connected) {
        setWsStatus(realtimeService.getStatus())
        addLog('✅ WebSocket 连接成功')
        setScanStatus('connected')
        addNotification('实时行情已连接', 'success')
        // 连接成功后加载市场
        loadSelectedMarkets()
      } else {
        setWsStatus('error')
        setScanStatus('error')
        addLog('❌ WebSocket 连接失败')
        addNotification('实时行情连接失败', 'error')
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

    strategyUnsubscribe = strategyManager.onSignal((signal: TradeSignal) => {
      setTradeSignals(prev => [signal, ...prev.slice(0, 19)])
      addLog(`📊 [${signal.strategy}] ${signal.action.toUpperCase()} ${signal.side.toUpperCase()} @ ${(signal.price * 100).toFixed(1)}¢`)
      addNotification(`策略信号: ${signal.reason}`, 'info')
    })

    connectWebSocket()

    return () => {
      if (unsubscribe) unsubscribe()
      if (strategyUnsubscribe) strategyUnsubscribe()
      realtimeService.disconnect()
      strategyManager.stop()
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

  // ✅ 加载选择的市场（修复：添加连接状态检查）
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
      addLog(`📡 已订阅 ${allAssetIds.length} 个资产`)
    } else if (allAssetIds.length > 0) {
      addLog(`⚠️ WebSocket 未连接 (${status})，资产将在连接后订阅`)
    }
  }

  const handleScan = async () => {
    if (scanStatus === 'scanning') return

    setScanStatus('scanning')
    setScanning(true)
    setMarketsData([])
    setScanLog([])
    setMessageCount(0)
    addLog('🔍 重新连接市场数据...')
    addNotification('重新连接实时行情', 'info')

    realtimeService.disconnect()
    await new Promise(resolve => setTimeout(resolve, 1000))

    const connected = await realtimeService.connect()

    if (connected) {
      setWsStatus(realtimeService.getStatus())
      loadSelectedMarkets()
      setScanStatus('connected')
      addLog('✅ 重新连接成功')
      addNotification('实时行情已刷新', 'success')
    } else {
      setScanStatus('error')
      addLog('❌ 重新连接失败')
      addNotification('重新连接失败', 'error')
    }

    setScanning(false)
  }

  const toggleStrategy = () => {
    if (strategyEnabled) {
      strategyManager.stop()
      setStrategyEnabled(false)
      addLog('⏹️ 策略引擎已停止')
      addNotification('策略引擎已停止', 'info')
    } else {
      strategyManager.start()
      setStrategyEnabled(true)
      addLog('🚀 策略引擎已启动')
      addNotification('策略引擎已启动', 'success')
    }
  }

  const toggleTemplate = (templateId: string) => {
    setSelectedTemplates(prev =>
      prev.includes(templateId)
        ? prev.filter(id => id !== templateId)
        : [...prev, templateId]
    )
  }

  // ✅ 保存市场选择（修复：保存后尝试订阅）
  const saveMarketSelection = async () => {
    loadSelectedMarkets()
    setShowMarketSelector(false)
    addNotification(`已选择 ${selectedTemplates.length} 个市场`, 'success')

    // 如果 WebSocket 未连接，自动重连
    const status = realtimeService.getStatus()
    if (status !== 'connected') {
      addLog('🔄 WebSocket 未连接，正在重新连接...')
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
      {/* 顶部区域：Scanner Control - 更紧凑 */}
      <div className="flex-shrink-0">
        <MatrixCard title="MARKET SCANNER" subtitle="Real-time Polymarket data via WebSocket">
          <div className="flex justify-between items-center mb-3">
            <div className="text-sm text-matrix-text-secondary font-mono">
              状态：
              <span className={cn(
                'ml-2',
                scanStatus === 'idle' ? 'text-matrix-text-muted' :
                scanStatus === 'scanning' ? 'text-matrix-warning' :
                scanStatus === 'connected' ? 'text-matrix-success' :
                'text-matrix-error'
              )}>
                {scanStatus === 'idle' && '空闲'}
                {scanStatus === 'scanning' && '连接中...'}
                {scanStatus === 'connected' && '● 实时连接中'}
                {scanStatus === 'error' && '错误'}
              </span>
            </div>
            <div className="flex gap-2">
              <MatrixButton
                variant={strategyEnabled ? 'success' : 'secondary'}
                onClick={toggleStrategy}
              >
                {strategyEnabled ? '🤖 策略运行中' : '🤖 启动策略'}
              </MatrixButton>
              <MatrixButton variant="secondary" onClick={() => setShowMarketSelector(true)}>
                📋 选择市场
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
              <div className="text-xs text-matrix-text-secondary font-mono">WebSocket 状态</div>
              <div className={cn(
                'text-base font-bold font-mono',
                wsStatus === 'connected' ? 'text-matrix-success' : 'text-matrix-error'
              )}>
                {wsStatus.toUpperCase()}
              </div>
            </div>
            <div className="p-2 border border-matrix-border-tertiary rounded bg-matrix-bg-tertiary/50">
              <div className="text-xs text-matrix-text-secondary font-mono">订阅资产</div>
              <div className="text-base font-bold font-mono text-matrix-text-primary">
                {realtimeService.getSubscribedAssets().length}
              </div>
            </div>
            <div className="p-2 border border-matrix-border-tertiary rounded bg-matrix-bg-tertiary/50">
              <div className="text-xs text-matrix-text-secondary font-mono">接收消息</div>
              <div className="text-base font-bold font-mono text-matrix-info">
                {messageCount}
              </div>
            </div>
            <div className="p-2 border border-matrix-border-tertiary rounded bg-matrix-bg-tertiary/50">
              <div className="text-xs text-matrix-text-secondary font-mono">策略信号</div>
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

      {/* 中间区域：市场列表 - 限制高度，确保日志可见 */}
      <div className="flex-1 min-h-0 max-h-[50vh] overflow-hidden">
        {scanStatus === 'scanning' ? (
          <MatrixCard className="h-full">
            <MatrixLoading text="正在连接实时行情..." fullScreen={false} />
          </MatrixCard>
        ) : markets.length === 0 ? (
          <MatrixCard title="MARKETS" className="h-full">
            <div className="text-center py-8">
              <div className="text-4xl mb-4">📡</div>
              <div className="text-matrix-text-secondary font-mono mb-4">暂无市场数据</div>
              <div className="flex gap-4 justify-center">
                <MatrixButton onClick={handleScan} variant="primary">连接实时行情</MatrixButton>
                <MatrixButton onClick={() => setShowMarketSelector(true)} variant="secondary">选择市场</MatrixButton>
              </div>
            </div>
          </MatrixCard>
        ) : (
          <MatrixCard
            title={`MARKETS (${filteredMarkets.length}) - 实时更新`}
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
                      {cat === 'all' ? '全部' : cat.toUpperCase()}
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
                      addNotification(`选中市场：${market.question.substring(0, 50)}...`, 'info')
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

      {/* 底部区域：日志面板 - 始终显示，固定高度 */}
      <div className="flex-shrink-0 h-44">
        <MatrixCard title="CONNECTION LOG" className="h-full flex flex-col">
          <div
            ref={logRef}
            className="flex-1 overflow-y-auto pr-2 font-mono text-xs"
          >
            {scanLog.length === 0 ? (
              <div className="text-matrix-text-muted text-center py-4">
                等待连接日志...
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
          <MatrixCard title={`📊 策略信号 (${tradeSignals.length})`} className="shadow-lg">
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

      {/* 市场选择模态框 */}
      <MatrixModal
        isOpen={showMarketSelector}
        onClose={() => setShowMarketSelector(false)}
        title="选择市场"
        size="lg"
        actions={
          <>
            <MatrixButton variant="secondary" onClick={() => setShowMarketSelector(false)}>
              取消
            </MatrixButton>
            <MatrixButton variant="primary" onClick={saveMarketSelection}>
              保存选择 ({selectedTemplates.length}个)
            </MatrixButton>
          </>
        }
      >
        <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-2">
          {/* 事件 URL 导入 */}
          <div className="p-3 border border-matrix-border-primary rounded bg-matrix-bg-accent">
            <div className="text-sm text-matrix-text-primary font-mono mb-2">
              🌐 从 Polymarket 事件 URL 导入
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
                获取
              </MatrixButton>
            </div>
            <div className="text-xs text-matrix-text-muted font-mono mt-2">
              💡 使用 Vite 代理获取 Gamma API 数据
            </div>
          </div>

          {/* 预设市场选择 */}
          <div>
            <div className="text-sm text-matrix-text-secondary font-mono mb-2">
              或选择预设市场（可多选）：
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
              或手动输入资产 ID（逗号分隔）：
            </div>
            <MatrixInput
              value={customAssetIds}
              onChange={setCustomAssetIds}
              placeholder="asset_id_1,asset_id_2,asset_id_3..."
              label="自定义资产 ID"
            />

            <div className="mt-3">
              <button
                onClick={() => setShowManualGuide(true)}
                className="text-xs text-matrix-info font-mono hover:underline flex items-center gap-1"
              >
                📖 点击查看详细教程
              </button>
            </div>
          </div>

          {/* 当前选择 */}
          {customAssetIds && (
            <div className="p-3 border border-matrix-border-primary rounded bg-matrix-bg-tertiary">
              <div className="text-xs text-matrix-text-secondary font-mono mb-1">当前资产 ID:</div>
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
        title="📖 手动查找资产 ID 教程"
        size="lg"
      >
        <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-2 text-sm">
          <div className="p-4 border border-matrix-border-primary rounded bg-matrix-bg-accent">
            <h4 className="text-matrix-text-primary font-mono mb-2">方法：通过浏览器开发者工具</h4>
            <ol className="space-y-2 text-matrix-text-secondary font-mono text-xs">
              <li>1. 打开 Polymarket 事件页面</li>
              <li>2. 按 F12 打开开发者工具</li>
              <li>3. 切换到 Network（网络）标签</li>
              <li>4. 刷新页面（Ctrl+R）</li>
              <li>5. 在过滤框输入 gamma 或 markets</li>
              <li>6. 找到 gamma-api.polymarket.com/markets 请求</li>
              <li>7. 切换到 Response（响应）标签</li>
              <li>8. 复制 tokens 数组中的 id</li>
            </ol>
          </div>

          <div className="p-4 border border-matrix-warning/30 rounded bg-matrix-warning/10">
            <h4 className="text-matrix-warning font-mono mb-2">⚠️ 注意事项</h4>
            <ul className="space-y-1 text-matrix-text-muted font-mono text-xs">
              <li>• 资产 ID 是非常长的数字字符串（约 80 位）</li>
              <li>• 至少需要 1 个 ID</li>
              <li>• 用逗号分隔，不要有空格</li>
            </ul>
          </div>
        </div>
      </MatrixModal>
    </div>
  )
}

export default MarketsView