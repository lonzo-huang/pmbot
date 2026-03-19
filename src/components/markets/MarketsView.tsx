import React, { useState, useEffect, useRef, useCallback } from 'react'
import { useAppStore } from '@/stores/appStore'
import type { Market as StoreMarket } from '@/stores/appStore'
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
import {
  BTC_5M_EVENT_URL,
  BTC_5M_DEFAULT_METADATA,
  extractSlugFromUrl,
  fetchMarketDataFromSlug,
  toMarket,
  type PolymarketMarketMetadata,
  getRollingBtc5mSlugs,
  getBtc5mUrlFromSlug,
  getCurrentBtc5mUrl,
} from '@/services/platforms/polymarketUtils'

type Market = StoreMarket

const PRESET_TEMPLATE_ID = 'btc-5m-polymarket'
const DEFAULT_PRESET_MARKET = toMarket(BTC_5M_DEFAULT_METADATA)

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
  const setPolymarketBtc5mState = useAppStore((state) => state.setPolymarketBtc5mState)
  
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

  const [selectedTemplates, setSelectedTemplates] = useState<string[]>([])
  const [customAssetIds, setCustomAssetIds] = useState('')
  const [eventUrl, setEventUrl] = useState('')

  const clearAllMarkets = () => {
    setMarkets([])
    setImportedMarkets([])
    setCustomAssetIds('')
    setSelectedTemplates([])
    realtimeService.clearSubscriptions()
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

  const addLog = useCallback((message: string) => {
    setScanLog((prev) => [...prev, `[${new Date().toLocaleTimeString()}] ${message}`])
    setTimeout(() => {
      if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight
    }, 50)
  }, [])

  const presetMetadataRef = useRef<PolymarketMarketMetadata>(BTC_5M_DEFAULT_METADATA)
  const [presetMarket, setPresetMarket] = useState<Market>(DEFAULT_PRESET_MARKET)
  const [presetLoading, setPresetLoading] = useState(false)
  const [presetError, setPresetError] = useState<string | null>(null)

  const refreshPresetMarket = useCallback(async () => {
    setPresetLoading(true)
    setPresetError(null)
    setPolymarketBtc5mState({ isLoading: true, lastError: null })

    try {
      addLog('🔄 Loading BTC 5m preset market metadata...')

      const candidateSlugs = getRollingBtc5mSlugs(6)
      let metadata: PolymarketMarketMetadata | null = null
      let usedSlug: string | null = null

      for (const slug of candidateSlugs) {
        addLog(`🔍 Trying BTC 5m slug: ${slug}`)
        const result = await fetchMarketDataFromSlug(slug, 'market', { logger: addLog })
        if (result) {
          metadata = result
          usedSlug = slug
          break
        }
      }

      if (!metadata) {
        addLog('⚠️ Rolling slug lookup failed; trying parent event fallback')
        metadata = await fetchMarketDataFromSlug('btc-updown-5m', 'event', { logger: addLog })
        if (metadata) {
          usedSlug = metadata.slug
        }
      }

      if (metadata) {
        const market = toMarket(metadata)
        setPresetMarket(market)
        addLog(`✅ Loaded BTC 5m preset via ${usedSlug || metadata.slug}`)
        presetMetadataRef.current = metadata
        setPolymarketBtc5mState({
          metadata,
          isLoading: false,
          lastError: null,
        })
        setPresetError(null)
        return market
      }

      const attempted = candidateSlugs.join(', ')
      const message = `⚠️ Failed to load BTC 5m metadata from API (attempted slugs: ${attempted})`
      setPresetMarket(DEFAULT_PRESET_MARKET)
      setPresetError(message)
      addLog(message)
      presetMetadataRef.current = BTC_5M_DEFAULT_METADATA
      setPolymarketBtc5mState({
        metadata: BTC_5M_DEFAULT_METADATA,
        lastError: message,
        isLoading: false,
      })
      return DEFAULT_PRESET_MARKET
    } catch (error: any) {
      const message = `❌ BTC 5m preset load failed: ${error?.message || error}`
      setPresetError(message)
      addLog(message)
      setPresetMarket(DEFAULT_PRESET_MARKET)
      presetMetadataRef.current = BTC_5M_DEFAULT_METADATA
      setPolymarketBtc5mState({
        metadata: BTC_5M_DEFAULT_METADATA,
        lastError: message,
        isLoading: false,
      })
      return DEFAULT_PRESET_MARKET
    } finally {
      setPresetLoading(false)
    }
  }, [addLog])

  useEffect(() => {
    if (!presetMarket || presetMarket.assetIds?.length === 0) {
      void refreshPresetMarket()
    }
  }, [])

  useEffect(() => {
    if (selectedTemplates.includes(PRESET_TEMPLATE_ID)) {
      void refreshPresetMarket()
    }
  }, [selectedTemplates, refreshPresetMarket])

  useEffect(() => {
    const checkExistingConnection = async () => {
      const status = realtimeService.getStatus()
      setWsStatus(status)
      if (status === 'connected') {
        setScanStatus('connected')
        const allAssetIds = activeMarkets.flatMap(m => m.assetIds || [])
        if (allAssetIds.length > 0) {
          realtimeService.subscribe(allAssetIds)
        }
      }
    }

    const strategyUnsubscribe = strategyManager.onSignal(async (signal: TradeSignal) => {
      setTradeSignals(prev => [signal, ...prev.slice(0, 19)])
      addLog(`📊 [${signal.strategy}] ${signal.action.toUpperCase()} ${signal.side.toUpperCase()} @ ${(signal.price * 100).toFixed(1)}¢`)
    })

    checkExistingConnection()

    return () => {
      strategyUnsubscribe()
    }
  }, [])

  // ============================================================
  // ✅✅✅ 核心修复：监听 WebSocket 消息并同步更新 Store 中的价格 ✅✅✅
  // ============================================================
  useEffect(() => {
    console.log('[MarketsView] 📝 注册 WebSocket 消息监听器')
    
    const unsubscribe = realtimeService.onMessage((data: MarketData) => {
      // 1. 更新消息计数
      setMessageCount(prev => prev + 1)
      incrementGlobalMessageCount()

      // 2. ✅ 核心：更新 Store 中 activeMarkets 的价格
      const assetId = data.asset_id
      if (!assetId) return

      // 获取当前 Store 状态
      const currentMarkets = useAppStore.getState().markets.activeMarkets
      if (!currentMarkets || currentMarkets.length === 0) return

      // 找到包含此 assetId 的市场
      const marketIndex = currentMarkets.findIndex(m => m.assetIds?.includes(assetId))
      if (marketIndex === -1) {
        // 调试：打印未匹配的资产 ID
        console.log(`[MarketsView] ⚠️ 未找到匹配的市场，asset_id: ${assetId.substring(0, 20)}...`)
        return
      }

      const market = currentMarkets[marketIndex]
      const assetIndex = market.assetIds?.indexOf(assetId) ?? -1
      if (assetIndex === -1) return

      let newPrice: number | null = null

      // 从订单簿获取价格 (使用 best ask 作为买入价)
      if (data.type === 'book' || data.type === 'best_bid_ask') {
        const book = data.data as OrderBook
        if (book?.asks?.length > 0 && book.asks[0][0] > 0 && book.asks[0][0] < 1) {
          newPrice = book.asks[0][0]
          console.log(`[MarketsView] 📖 订单簿价格: asks[0]=${newPrice}, assetIndex=${assetIndex}`)
        } else if (book?.bids?.length > 0 && book.bids[0][0] > 0 && book.bids[0][0] < 1) {
          newPrice = book.bids[0][0]
          console.log(`[MarketsView] 📖 订单簿价格: bids[0]=${newPrice}, assetIndex=${assetIndex}`)
        }
      }

      // 从成交价获取价格
      if (data.type === 'last_trade_price' || data.type === 'price_change') {
        if (data.data?.price && data.data.price > 0 && data.data.price < 1) {
          newPrice = data.data.price
          console.log(`[MarketsView] 💰 成交价格: ${newPrice}, assetIndex=${assetIndex}, bestAsk=${data.data.bestAsk}`)
        }
      }

      // 如果有新价格，更新 Store
      if (newPrice !== null && newPrice > 0 && newPrice < 1) {
        const updatedMarkets = [...currentMarkets]
        const updatedPrices = [...(market.outcomePrices || [0.5, 0.5])]
        
        const oldPrice = updatedPrices[assetIndex]
        updatedPrices[assetIndex] = newPrice
        
        console.log(`[MarketsView] ✅ 更新价格: market=${market.question?.substring(0, 30)}, index=${assetIndex}, ${oldPrice?.toFixed(2)} -> ${newPrice.toFixed(2)}`)

        updatedMarkets[marketIndex] = {
          ...market,
          outcomePrices: updatedPrices,
          lastTradePrice: newPrice,
        }

        // ✅ 更新 Store
        setMarkets(updatedMarkets)
      }
    })

    return () => {
      console.log('[MarketsView] 🗑️ 移除 WebSocket 消息监听器')
      unsubscribe()
    }
  }, [incrementGlobalMessageCount, setMarkets])
  // ============================================================

  const [importedMarkets, setImportedMarkets] = useState<Market[]>([])

  const loadSelectedMarkets = async () => {
    let effectivePreset = presetMarket
    if (selectedTemplates.includes(PRESET_TEMPLATE_ID)) {
      if (!effectivePreset.assetIds || effectivePreset.assetIds.length === 0) {
        effectivePreset = await refreshPresetMarket()
      }

      const presetEnd = effectivePreset.endDate ? new Date(effectivePreset.endDate).getTime() : 0
      if (presetEnd && presetEnd < Date.now() - 60_000) {
        addLog(`⚠️ BTC 5m preset appears stale (${effectivePreset.endDate}), refreshing...`)
        effectivePreset = await refreshPresetMarket()
      }
    }

    const selectedPresetAssetIds = selectedTemplates.includes(PRESET_TEMPLATE_ID) && effectivePreset.assetIds?.length
      ? effectivePreset.assetIds
      : []

    const manualIds = customAssetIds.trim()
      ? customAssetIds.trim().split(',').map(s => s.trim()).filter(Boolean)
      : []

    const allAssetIds = [...new Set([...selectedPresetAssetIds, ...manualIds])]

    if (allAssetIds.length === 0) {
      addLog('ℹ️ No markets selected')
      setMarkets([])
      setPolymarketBtc5mState({ subscribed: false })
      return
    }

    addLog(`🔍 Loading ${allAssetIds.length} assets...`)

    try {
      const selectedMarkets: Market[] = []

      if (selectedTemplates.includes(PRESET_TEMPLATE_ID)) {
        if (!effectivePreset.assetIds || effectivePreset.assetIds.length === 0) {
          addLog('⚠️ BTC 5m preset has no asset IDs; skipping preset selection')
        } else if (!selectedMarkets.some(m => m.id === effectivePreset.id)) {
          selectedMarkets.push(effectivePreset)
        }
      }

      importedMarkets.forEach(m => {
        if (!selectedMarkets.some(sm => sm.id === m.id)) {
          selectedMarkets.push(m)
        }
      })

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

      setMarkets(selectedMarkets)

      if (realtimeService.getStatus() === 'connected') {
        realtimeService.subscribe(allAssetIds)
        addLog(`📡 Subscribed to ${allAssetIds.length} assets`)
      }

      if (selectedTemplates.includes(PRESET_TEMPLATE_ID)) {
        setPolymarketBtc5mState({
          metadata: presetMetadataRef.current,
          subscribed: true,
          isLoading: false,
          lastError: presetError,
        })
      } else {
        setPolymarketBtc5mState({ subscribed: false })
      }
    } catch (error: any) {
      addLog(`❌ Failed to load markets: ${error.message}`)
      setPolymarketBtc5mState({ lastError: error.message, isLoading: false })
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

  const addPopularMarket = (market: PopularMarket) => {
    if (addedPopularIds.has(market.id)) {
      addLog(`⚠️ Market already added: ${market.question.substring(0, 30)}...`)
      return
    }

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

    const existingIndex = activeMarkets.findIndex(m => m.id === market.id)
    if (existingIndex === -1) {
      setMarkets([...activeMarkets, newMarket])
      
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

    const uniqueNewMarkets = newMarkets.filter(nm => !activeMarkets.some(am => am.id === nm.id))
    
    if (uniqueNewMarkets.length > 0) {
      setMarkets([...activeMarkets, ...uniqueNewMarkets])
      
      const newAssetIds = uniqueNewMarkets.flatMap(m => m.assetIds || [])
      if (newAssetIds.length > 0 && realtimeService.getStatus() === 'connected') {
        realtimeService.subscribe(newAssetIds)
      }
    }

    setShowPopularMarkets(false)
    addNotification(`Added ${uniqueNewMarkets.length} markets`, 'success')
    addLog(`✅ Added ${uniqueNewMarkets.length} markets from popular`)
  }

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
    const marketData = await fetchMarketDataFromSlug(slug, type, { logger: addLog })
    
    if (marketData && marketData.assetIds && marketData.assetIds.length >= 1) {
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

      if (!activeMarkets.some(m => m.id === newMarket.id)) {
        setMarkets([...activeMarkets, newMarket])
      }

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

  const handleToggleConnection = async () => {
    if (scanStatus === 'scanning') return

    if (scanStatus === 'connected') {
      addLog('⏹️ Manually stopping real-time connection...')
      realtimeService.disconnect()
      setScanStatus('idle')
      setGlobalScanStatus('idle')
      setWsStatus('disconnected')
      setPolymarketBtc5mState({ subscribed: false })
      addNotification('Connection stopped', 'info')
      return
    }

    setScanStatus('scanning')
    setGlobalScanStatus('scanning')
    setScanning(true)
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
          if (!expired.slug || !expired.type) continue

          const newData = await fetchMarketDataFromSlug(expired.slug, expired.type, { logger: addLog })
          if (newData && newData.id !== expired.id) {
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
    }, 30000)

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
              <button
                type="button"
                key={PRESET_TEMPLATE_ID}
                disabled={presetLoading || !presetMarket}
                onClick={() => toggleTemplate(PRESET_TEMPLATE_ID)}
                className={cn(
                  'p-3 border rounded text-left transition-all disabled:opacity-60 disabled:cursor-not-allowed',
                  selectedTemplates.includes(PRESET_TEMPLATE_ID)
                    ? 'border-matrix-success bg-matrix-success/10'
                    : 'border-matrix-border-tertiary bg-matrix-bg-tertiary hover:border-matrix-border-primary'
                )}
              >
                <div className="flex items-center gap-2 mb-1">
                  <div
                    className={cn(
                      'w-4 h-4 rounded border flex items-center justify-center text-xs',
                      selectedTemplates.includes(PRESET_TEMPLATE_ID)
                        ? 'bg-matrix-success border-matrix-success text-black'
                        : 'border-matrix-border-tertiary'
                    )}
                  >
                    {selectedTemplates.includes(PRESET_TEMPLATE_ID) && '✓'}
                  </div>
                  <span className="text-xs px-2 py-0.5 bg-matrix-bg-accent rounded font-mono">CRYPTO</span>
                  {presetLoading && <span className="text-[10px] text-matrix-info">loading…</span>}
                </div>
                <div className="text-sm text-matrix-text-primary font-mono line-clamp-2">
                  {presetMarket?.question || 'BTC 5m UP/DOWN Interval'}
                </div>
                {presetError && (
                  <div className="mt-2 text-[10px] text-matrix-warning font-mono">{presetError}</div>
                )}
              </button>
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