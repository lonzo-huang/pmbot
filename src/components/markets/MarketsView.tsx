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
import { popularMarketsService, type PopularMarket } from './PopularMarketsService'
import { MarketScanner } from './MarketScanner'
import { MarketList } from './MarketList'
import { PopularMarkets } from './PopularMarkets'
import { TestPositionModal } from './TestPositionModal'
import { ConnectionLog } from './ConnectionLog'
import { PolymarketBtc5mStatus } from './PolymarketBtc5mStatus'

interface Market {
  id: string
  conditionId?: string
  slug?: string
  type?: 'event' | 'market'
  question: string
  volume: number
  liquidity: number
  outcomePrices: number[]
  endDate: string
  active: boolean
  category?: string
  assetIds: string[]
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
    assetIds: [],
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
    assetIds: [],
  },
]

const extractSlugFromUrl = (url: string): { slug: string, type: 'event' | 'market' } | null => {
  try {
    let cleanUrl = url.trim()
    if (!cleanUrl.startsWith('http://') && !cleanUrl.startsWith('https://')) {
      cleanUrl = 'https://' + cleanUrl
    }
    const urlObj = new URL(cleanUrl)
    const pathname = urlObj.pathname.replace(/^\/+|\/+$/g, '')
    const pathParts = pathname.split('/')
    
    // 查找 event 或 market 关键字
    const typeIndex = pathParts.findIndex(p => p === 'event' || p === 'market')
    if (typeIndex !== -1 && pathParts[typeIndex + 1]) {
      return {
        slug: decodeURIComponent(pathParts[typeIndex + 1]),
        type: pathParts[typeIndex] as 'event' | 'market'
      }
    }
    
    // 兜底：取最后一部分作为 slug，默认为 market
    const lastPart = pathParts.filter(Boolean).pop()
    return lastPart ? { slug: decodeURIComponent(lastPart), type: 'market' } : null
  } catch {
    return null
  }
}

const fetchMarketDataFromSlug = async (slug: string, type: 'event' | 'market', addLog: (msg: string) => void) => {
  try {
    const endpoint = type === 'event' ? '/events' : '/markets'
    addLog(`🔍 Query Gamma API: ${endpoint}?slug=${slug}`)
    
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 15000)
    
    const gammaUrl = `/api/gamma${endpoint}?slug=${slug}`
    const response = await fetch(gammaUrl, {
      method: 'GET',
      headers: { 'Accept': 'application/json' },
      signal: controller.signal,
    })
    
    clearTimeout(timeoutId)
    
    if (!response.ok) throw new Error(`API failed: ${response.status}`)
    
    const rawData: any = await response.json()
    const results = Array.isArray(rawData) ? rawData : [rawData]
    
    if (results.length === 0 || !results[0]) {
      addLog(`❌ No ${type} found for slug: ${slug}`)
      if (type === 'market') return fetchMarketDataFromSlug(slug, 'event', addLog)
      return null
    }

    const firstResult = results[0]
    const now = Date.now()
    
    // ✅ 核心：使用 UTC 时间进行判定，消除本地时区干扰
    // Polymarket API 返回的 endDate 通常是 ISO 格式 (UTC)
    const getUtcTime = (dateStr: string) => {
      if (!dateStr) return 0
      const d = new Date(dateStr)
      return isNaN(d.getTime()) ? 0 : d.getTime()
    }

    const marketEnd = getUtcTime(firstResult.endDateIso || firstResult.endDate || firstResult.end_date)
    const isOldMarket = (marketEnd > 0 && marketEnd < now) || !firstResult.active || firstResult.closed || firstResult.resolved
    
    if (type === 'market' && isOldMarket) {
      const eventSlug = firstResult.event?.slug || firstResult.eventSlug
      if (eventSlug && eventSlug !== slug) {
        addLog(`⚠️ Current market interval has expired (UTC check). Redirecting to parent event: ${eventSlug}`)
        return fetchMarketDataFromSlug(eventSlug, 'event', addLog)
      }
    }

    let market = firstResult
    if (type === 'event' && firstResult.markets && firstResult.markets.length > 0) {
      // ✅ 优化：更智能地选择“当前”市场 (基于 UTC 时间)
      const sortedMarkets = [...firstResult.markets].sort((a: any, b: any) => {
        // 1. 优先考虑未解析且未关闭的市场
        const activeA = !a.resolved && !a.closed
        const activeB = !b.resolved && !b.closed
        if (activeA !== activeB) return activeA ? -1 : 1
        
        // 2. 检查交易时间 (使用 UTC 比较)
        const startA = getUtcTime(a.startDateIso || a.startDate || a.start_date)
        const startB = getUtcTime(b.startDateIso || b.startDate || b.start_date)
        const endA = getUtcTime(a.endDateIso || a.endDate || a.end_date)
        const endB = getUtcTime(b.endDateIso || b.endDate || b.end_date)
        
        const isCurrentA = now >= startA && now < endA
        const isCurrentB = now >= startB && now < endB
        
        if (isCurrentA !== isCurrentB) return isCurrentA ? -1 : 1
        
        // 3. 如果状态相同，寻找最接近“现在”且未结束的市场
        const diffA = endA - now
        const diffB = endB - now
        
        // 如果 A 在未来，B 在过去，A 优先
        if (diffA > 0 && diffB <= 0) return -1
        if (diffB > 0 && diffA <= 0) return 1
        
        // 如果都在未来，选择最快结束的（当前正在进行的 interval）
        if (diffA > 0 && diffB > 0) return diffA - diffB
        
        // 如果都在过去，选择最晚结束的（最近结束的）
        return endB - endA
      })
      
      market = sortedMarkets[0]
      addLog(`📦 Event contains ${firstResult.markets.length} markets. Automatically selected current interval (UTC Sync).`)
      console.log('📊 UTC Market selection info:', {
        selected: market.question || market.title,
        id: market.id,
        endDate: market.endDateIso || market.endDate,
        now: new Date().toISOString(),
        allMarketsCount: firstResult.markets.length
      })
    }

    addLog(`✅ Found market: ${market.question || market.title || 'Unknown'}`)
    
    const conditionId = market.conditionId || market.condition_id || ''
    
    let assetIds: string[] = []
    if (market.clobTokenIds) {
      try {
        const parsed = typeof market.clobTokenIds === 'string' 
          ? JSON.parse(market.clobTokenIds) 
          : market.clobTokenIds
        if (Array.isArray(parsed)) assetIds = parsed
      } catch (e) {
        console.warn('Failed to parse clobTokenIds', e)
      }
    }
    
    if (assetIds.length === 0) {
      const tokens = market.tokens || market.outcomes || []
      assetIds = Array.isArray(tokens)
        ? tokens.map((t: any) => typeof t === 'string' ? t : t.id || t.token_id || t.clobTokenId || '').filter(Boolean)
        : []
    }

    addLog(`🔍 Extracted ${assetIds.length} asset IDs: ${assetIds.join(', ').substring(0, 100)}...`)
    console.log('📦 Polymarket Asset IDs:', assetIds)

    // ✅ 修复：返回更完整的元数据
    return { 
      id: market.id || conditionId,
      conditionId, 
      slug: market.slug || slug,
      type: market.slug ? 'market' : type, // 如果 market 自带 slug 则是 market 类型
      assetIds, 
      question: market.question || market.title || 'Unknown',
      volume: market.volumeNum || market.volume || 0,
      liquidity: market.liquidityNum || market.liquidity || 0,
      endDate: market.endDateIso || market.endDate || '2026-12-31T23:59:59Z',
      category: market.category || 'custom'
    }
  } catch (error: any) {
    addLog(`❌ Fetch failed: ${error.message}`)
    return null
  }
}

export const MarketsView: React.FC = () => {
  const { 
    setScanning, 
    addNotification, 
    setMarkets, 
    setStrategyRunning,
    setScanStatus: setGlobalScanStatus,
    setMessageCount: setGlobalMessageCount,
    incrementMessageCount: incrementGlobalMessageCount
  } = useAppStore()
  
  // ✅ 核心：从全局 Store 获取状态
  const activeMarkets = useAppStore((state) => state.markets.activeMarkets)
  const isStrategyRunning = useAppStore((state) => state.strategy.isRunning)
  const globalScanStatus = useAppStore((state) => state.ui.scanStatus)
  const globalMessageCount = useAppStore((state) => state.ui.messageCount)

  const [scanStatus, setScanStatus] = useState<'idle' | 'scanning' | 'connected' | 'error'>(globalScanStatus)
  const [scanLog, setScanLog] = useState<string[]>([])
  const [filter, setFilter] = useState('all')
  const [sortBy, setSortBy] = useState('volume')
  const [wsStatus, setWsStatus] = useState('disconnected')
  const [messageCount, setMessageCount] = useState(globalMessageCount)

  const [showMarketSelector, setShowMarketSelector] = useState(false)
  const [showPopularMarkets, setShowPopularMarkets] = useState(false)
  const [showTestPosition, setShowTestPosition] = useState(false)
  const [showManualGuide, setShowManualGuide] = useState(false)

  // ✅ 调试优化：默认不选中任何预设市场
  const [selectedTemplates, setSelectedTemplates] = useState<string[]>([])
  const [customAssetIds, setCustomAssetIds] = useState('')
  const [eventUrl, setEventUrl] = useState('')

  // ✅ 新增：清空当前所有市场
  const clearAllMarkets = () => {
    setMarkets([])
    setImportedMarkets([])
    setCustomAssetIds('')
    setSelectedTemplates([])
    realtimeService.clearSubscriptions() // ✅ 核心：同时清空 WS 内部订阅缓存
    addLog('🧹 Cleared all markets and subscription cache')
    addNotification('All markets cleared', 'info')
  }
  const [isFetchingAssets, setIsFetchingAssets] = useState(false)
  const [tradeSignals, setTradeSignals] = useState<TradeSignal[]>([])

  const [testPositionParams, setTestPositionParams] = useState({
    marketId: 'btc-100k-2026',
    outcome: 'yes' as 'yes' | 'no',
    amount: 50,
    entryPrice: 0.42,
    currentPrice: 0.45,
  })

  const [popularMarkets, setPopularMarkets] = useState<PopularMarket[]>([])
  const [isScanningPopular, setIsScanningPopular] = useState(false)
  const [addedPopularIds, setAddedPopularIds] = useState<Set<string>>(new Set())

  const logRef = useRef<HTMLDivElement>(null)

  const addLog = (message: string) => {
    setScanLog((prev) => [...prev, `[${new Date().toLocaleTimeString()}] ${message}`])
    setTimeout(() => {
      if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight
    }, 50)
  }

  useEffect(() => {
    const checkExistingConnection = async () => {
      const status = realtimeService.getStatus()
      setWsStatus(status)
      if (status === 'connected') {
        setScanStatus('connected')
        // 如果已经连接，同步一次市场订阅（防止漏订）
        const allAssetIds = activeMarkets.flatMap(m => m.assetIds || [])
        if (allAssetIds.length > 0) {
          realtimeService.subscribe(allAssetIds)
        }
      }
    }

    const strategyUnsubscribe = strategyManager.onSignal(async (signal: TradeSignal) => {
      setTradeSignals(prev => [signal, ...prev.slice(0, 19)])
      addLog(`📊 [${signal.strategy}] ${signal.action.toUpperCase()} ${signal.side.toUpperCase()} @ ${(signal.price * 100).toFixed(1)}¢`)
      // ✅ 修复：不再这里直接执行交易，由 TradingService 统一处理自动交易逻辑
      // 避免重复执行和状态不一致
    })

    checkExistingConnection()

    return () => {
      strategyUnsubscribe()
    }
  }, [])

  // 移除了 updateMarketFromOrderBook 和 updateMarketFromTrade，因为逻辑已移至 Store

  const [importedMarkets, setImportedMarkets] = useState<Market[]>([])

  const loadSelectedMarkets = async () => {
    // 1. 获取预设资产 ID
    const selectedTemplateIds = MARKET_TEMPLATES
      .filter(t => selectedTemplates.includes(t.id))
      .flatMap(t => t.assetIds || [])

    // 2. 获取自定义资产 ID
    const manualIds = customAssetIds.trim()
      ? customAssetIds.trim().split(',').map(s => s.trim()).filter(Boolean)
      : []

    // 3. 合并所有资产 ID (去重)
    const allAssetIds = [...new Set([...selectedTemplateIds, ...manualIds])]
    
    if (allAssetIds.length === 0) {
      addLog('ℹ️ No markets selected')
      setMarkets([]) // 清空 Store 中的 activeMarkets
      return
    }

    addLog(`🔍 Loading ${allAssetIds.length} assets...`)

    try {
      const selectedMarkets: Market[] = []
      
      // 先从预设模板中找匹配的市场
      MARKET_TEMPLATES.forEach(t => {
        if (selectedTemplates.includes(t.id)) {
          selectedMarkets.push(t)
        }
      })

      // 加入通过 URL 导入的真实市场元数据
      importedMarkets.forEach(m => {
        if (!selectedMarkets.some(sm => sm.id === m.id)) {
          selectedMarkets.push(m)
        }
      })

      // 如果还有剩余的纯 ID（手动输入），创建一个虚拟容器
      const accountedIds = new Set(selectedMarkets.flatMap(m => m.assetIds || []))
      const remainingIds = manualIds.filter(id => !accountedIds.has(id))

      if (remainingIds.length > 0) {
        const manualMarket: Market = {
          id: `custom-${Date.now()}`,
          question: `Manual Assets (${remainingIds.length})`,
          volume: 0,
          liquidity: 0,
          outcomePrices: [0.5, 0.5],
          endDate: '2026-12-31T23:59:59Z',
          active: true,
          category: 'custom',
          assetIds: remainingIds,
        }
        selectedMarkets.push(manualMarket)
      }

      // ✅ 更新 Store
      setMarkets(selectedMarkets)

      if (realtimeService.getStatus() === 'connected') {
        realtimeService.subscribe(allAssetIds)
        addLog(`📡 Subscribed to ${allAssetIds.length} assets`)
      }
    } catch (error: any) {
      addLog(`❌ Failed to load markets: ${error.message}`)
    }
  }

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

  // ✅ 修复：添加热门市场（核心修复）
  const addPopularMarket = (market: PopularMarket) => {
    // 1. 检查是否已添加
    if (addedPopularIds.has(market.id)) {
      addLog(`⚠️ Market already added: ${market.question.substring(0, 30)}...`)
      return
    }

    // 2. 构建新市场对象
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

    // 3. 更新市场列表（防重复）
    const existingIndex = activeMarkets.findIndex(m => m.id === market.id)
    if (existingIndex === -1) {
      setMarkets([...activeMarkets, newMarket])
      
      // ✅ 立即订阅
      if (market.assetIds && market.assetIds.length > 0 && realtimeService.getStatus() === 'connected') {
        realtimeService.subscribe(market.assetIds)
        addLog(`📡 Subscribed to new popular market: ${market.question}`)
      }
    }
    
    setAddedPopularIds(prev => new Set(prev).add(market.id))
    addNotification(`Added market: ${market.question.substring(0, 30)}...`, 'success')
    addLog(`✅ Added market: ${market.question}`)
  }

  const handleAddSelected = (marketsToAdd: PopularMarket[]) => {
    const newMarkets: Market[] = marketsToAdd.map(m => ({
      id: m.id,
      question: m.question,
      volume: m.volume24h,
      liquidity: m.liquidity,
      outcomePrices: [0.5, 0.5],
      endDate: m.endDate,
      active: true,
      category: m.category,
      assetIds: m.assetIds,
    }))

    // 过滤掉已经存在的市场
    const uniqueNewMarkets = newMarkets.filter(nm => !activeMarkets.some(am => am.id === nm.id))
    
    if (uniqueNewMarkets.length > 0) {
      setMarkets([...activeMarkets, ...uniqueNewMarkets])
      
      // 订阅新资产
      const newAssetIds = uniqueNewMarkets.flatMap(m => m.assetIds || [])
      if (newAssetIds.length > 0 && realtimeService.getStatus() === 'connected') {
        realtimeService.subscribe(newAssetIds)
      }
    }

    setShowPopularMarkets(false)
    addNotification(`Added ${uniqueNewMarkets.length} markets`, 'success')
    addLog(`✅ Added ${uniqueNewMarkets.length} markets from popular`)
  }

  // ✅ 修复：监听 customAssetIds 变化确保订阅同步
  useEffect(() => {
    if (!customAssetIds || realtimeService.getStatus() !== 'connected') return
    const timer = setTimeout(() => {
      const ids = customAssetIds.split(',').map(s => s.trim()).filter(Boolean)
      if (ids.length > 0) {
        realtimeService.subscribe(ids)
        addLog(`🔄 Synced subscription for ${ids.length} assets`)
      }
    }, 300)
    return () => clearTimeout(timer)
  }, [customAssetIds])

  const addTestPosition = () => {
    const store = useAppStore.getState()
    const pnl = (testPositionParams.currentPrice - testPositionParams.entryPrice) * testPositionParams.amount * (testPositionParams.outcome === 'yes' ? 1 : -1)
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

  const handleImportEventUrl = async () => {
    const trimmedUrl = eventUrl.trim()
    if (!trimmedUrl) {
      addNotification('Please enter event URL', 'error')
      return
    }
    setIsFetchingAssets(true)
    addLog(`🌐 Parsing event URL: ${trimmedUrl.substring(0, 40)}...`)
    
    const result = extractSlugFromUrl(trimmedUrl)
    if (!result) {
      addLog('❌ Failed to extract slug from URL')
      addNotification('Invalid URL format', 'error')
      setIsFetchingAssets(false)
      return
    }
    
    const { slug, type } = result
    addLog(`🔍 Searching Gamma API for ${type} slug: ${slug}`)
    const marketData = await fetchMarketDataFromSlug(slug, type, addLog)
    
    if (marketData && marketData.assetIds && marketData.assetIds.length >= 1) {
      // ✅ 修复：将完整的市场信息保存到导入列表中
      const newMarket: Market = {
        id: marketData.id,
        conditionId: marketData.conditionId,
        slug: marketData.slug,
        type: marketData.type,
        question: marketData.question,
        volume: marketData.volume,
        liquidity: marketData.liquidity,
        outcomePrices: [0.5, 0.5],
        endDate: marketData.endDate,
        active: true,
        category: marketData.category,
        assetIds: marketData.assetIds,
      }

      setImportedMarkets(prev => {
        if (prev.some(m => m.id === newMarket.id)) return prev
        return [...prev, newMarket]
      })

      // ✅ 立即更新 Store 的 activeMarkets 列表
      if (!activeMarkets.some(m => m.id === newMarket.id)) {
        setMarkets([...activeMarkets, newMarket])
      }

      // ✅ 立即订阅资产
      if (realtimeService.getStatus() === 'connected') {
        realtimeService.subscribe(marketData.assetIds)
        addLog(`📡 Subscribed to imported market: ${marketData.question}`)
      }

      const existingIds = customAssetIds.split(',').map(s => s.trim()).filter(Boolean)
      const newIds = marketData.assetIds.filter(id => !existingIds.includes(id))
      
      if (newIds.length > 0) {
        const updatedIds = [...existingIds, ...newIds].join(',')
        setCustomAssetIds(updatedIds)
        addLog(`✅ Successfully imported ${newIds.length} asset IDs`)
        addNotification(`Imported ${newIds.length} new asset IDs`, 'success')
      }
      setEventUrl('')
    } else {
      addLog('❌ Could not find valid asset IDs for this event')
      addNotification('No assets found for this URL', 'error')
    }
    setIsFetchingAssets(false)
  }

  // ✅ 同步监听全局消息计数
  useEffect(() => {
    const unsubscribe = realtimeService.onMessage(() => {
      setMessageCount(prev => prev + 1)
      incrementGlobalMessageCount()
    })
    return unsubscribe
  }, [])

  const handleToggleConnection = async () => {
    if (scanStatus === 'scanning') return

    if (scanStatus === 'connected') {
      // ✅ 手动停止：清除订阅并断开连接
      addLog('⏹️ Manually stopping real-time connection...')
      realtimeService.disconnect()
      setScanStatus('idle')
      setGlobalScanStatus('idle')
      setWsStatus('disconnected')
      addNotification('Connection stopped', 'info')
      return
    }

    // 启动连接
    setScanStatus('scanning')
    setGlobalScanStatus('scanning')
    setScanning(true)
    // setMarketsData([]) // 不再清空本地，而是通过 Store 管理
    setScanLog([])
    setMessageCount(0)
    setGlobalMessageCount(0)
    addLog('🔍 Connecting to market data...')
    
    const connected = await realtimeService.connect()
    if (connected) {
      setWsStatus(realtimeService.getStatus())
      loadSelectedMarkets()
      setScanStatus('connected')
      setGlobalScanStatus('connected')
      addLog('✅ Connection successful')
    } else {
      setScanStatus('error')
      setGlobalScanStatus('error')
      addLog('❌ Connection failed')
    }
    setScanning(false)
  }

  // ✅ 自动刷新过期市场 (5分钟轮询)
  useEffect(() => {
    if (scanStatus !== 'connected') return

    const checkInterval = setInterval(async () => {
      const now = Date.now()
      const expiredMarkets = activeMarkets.filter(m => {
        const end = new Date(m.endDate).getTime()
        return end > 0 && end < now
      })

      if (expiredMarkets.length > 0) {
        addLog(`⏳ ${expiredMarkets.length} markets expired. Refreshing for new intervals...`)
        
        let hasChanges = false
        const updatedMarkets = [...activeMarkets]

        for (const expired of expiredMarkets) {
          // 如果没有 slug，则无法自动刷新
          if (!expired.slug || !expired.type) continue

          // 重新抓取最新的
          const newData = await fetchMarketDataFromSlug(expired.slug, expired.type, addLog)
          if (newData && newData.id !== expired.id) {
            // 发现新 ID
            const idx = updatedMarkets.findIndex(m => m.id === expired.id)
            if (idx !== -1) {
              updatedMarkets[idx] = {
                ...updatedMarkets[idx],
                id: newData.id,
                conditionId: newData.conditionId,
                question: newData.question,
                assetIds: newData.assetIds,
                endDate: newData.endDate,
                volume: newData.volume,
                liquidity: newData.liquidity,
                outcomePrices: [0.5, 0.5],
              }
              hasChanges = true
              
              // 订阅新资产
              if (newData.assetIds && newData.assetIds.length > 0) {
                realtimeService.subscribe(newData.assetIds)
                addLog(`🔄 Switched to new active interval: ${newData.question}`)
              }
            }
          }
        }

        if (hasChanges) {
          setMarkets(updatedMarkets)
        }
      }
    }, 30000) // 30秒检查一次，灵敏度高一些

    return () => clearInterval(checkInterval)
  }, [scanStatus, activeMarkets])

  const toggleStrategy = () => {
    if (isStrategyRunning) {
      setStrategyRunning(false)
      addLog('⏹️ Strategy engine stopped')
    } else {
      setStrategyRunning(true)
      addLog('🚀 Strategy engine started')
    }
  }

  const toggleTemplate = (templateId: string) => {
    setSelectedTemplates(prev => prev.includes(templateId) ? prev.filter(id => id !== templateId) : [...prev, templateId])
  }

  const saveMarketSelection = async () => {
    loadSelectedMarkets()
    setShowMarketSelector(false)
    addNotification(`Selected ${selectedTemplates.length} markets`, 'success')
  }

  const filteredMarkets = activeMarkets
    .filter(m => filter === 'all' || m.category === filter)
    .sort((a, b) => {
      if (sortBy === 'volume') return b.volume - a.volume
      if (sortBy === 'liquidity') return b.liquidity - a.liquidity
      if (sortBy === 'endDate') return new Date(a.endDate).getTime() - new Date(b.endDate).getTime()
      return 0
    })

  const categories = ['all', 'crypto', 'economics', 'politics', 'stocks', 'custom']

  return (
    <div className="flex flex-col h-full overflow-hidden p-4 space-y-4">
      <div className="flex-shrink-0">
        <MarketScanner
          scanStatus={scanStatus}
          wsStatus={wsStatus}
          messageCount={messageCount}
          strategyEnabled={isStrategyRunning}
          tradeSignalsCount={tradeSignals.length}
          onToggleStrategy={toggleStrategy}
          onShowMarketSelector={() => setShowMarketSelector(true)}
          onShowPopularMarkets={() => setShowPopularMarkets(true)}
          onScan={handleToggleConnection}
          onClear={clearAllMarkets}
        />
      </div>

      <div className="flex-shrink-0">
        <PolymarketBtc5mStatus />
      </div>

      <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
        {scanStatus === 'scanning' ? (
          <MatrixCard className="h-full">
            <MatrixLoading text="Connecting to real-time data..." fullScreen={false} />
          </MatrixCard>
        ) : activeMarkets.length === 0 ? (
          <MatrixCard title="MARKETS" className="h-full flex flex-col">
            <div className="flex-1 flex flex-col items-center justify-center py-8">
              <div className="text-4xl mb-4 text-matrix-text-muted">📡</div>
              <div className="text-matrix-text-secondary font-mono mb-4 text-center">No market data available</div>
              <div className="flex flex-wrap gap-4 justify-center">
                <MatrixButton onClick={handleToggleConnection} variant="primary">Connect Real-time Data</MatrixButton>
                <MatrixButton onClick={() => setShowMarketSelector(true)} variant="secondary">Select Markets</MatrixButton>
                <MatrixButton onClick={() => setShowPopularMarkets(true)} variant="secondary">🔥 Browse Popular</MatrixButton>
              </div>
            </div>
          </MatrixCard>
        ) : (
          <div className="flex-1 min-h-0">
            <MarketList
              markets={activeMarkets}
              filter={filter}
              sortBy={sortBy}
              onFilterChange={setFilter}
              onSortChange={setSortBy}
              onMarketClick={(m) => addNotification(`Selected: ${m.question.substring(0, 50)}...`, 'info')}
            />
          </div>
        )}
      </div>

      <div className="flex-shrink-0 h-40">
        <ConnectionLog logs={scanLog} />
      </div>

      {isStrategyRunning && tradeSignals.length > 0 && (
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

      <PopularMarkets
        isOpen={showPopularMarkets}
        onClose={() => { setShowPopularMarkets(false) }}
        onAddToWatchlist={addPopularMarket}
        addedIds={addedPopularIds}
        onSetAddedIds={setAddedPopularIds}
      />

      <TestPositionModal
        isOpen={showTestPosition}
        onClose={() => setShowTestPosition(false)}
        markets={activeMarkets.map(m => ({
          id: m.id,
          question: m.question,
          outcomePrices: m.outcomePrices,
          assetIds: m.assetIds || []
        }))}
      />

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

export default MarketsView
