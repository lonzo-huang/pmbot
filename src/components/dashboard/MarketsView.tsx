import React, { useState, useEffect } from 'react'
import { useAppStore } from '@/stores/appStore'
import { MatrixCard } from '@/components/ui/MatrixCard'
import { MatrixButton } from '@/components/ui/MatrixButton'
import { MatrixLoading } from '@/components/ui/MatrixLoading'
import { cn } from '@/utils/cn'
import { formatCurrency } from '@/utils/formatting'
import { realtimeService, MarketData, OrderBook } from '@/services/realtime/RealtimeService'

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
  orderBook?: OrderBook
  lastTradePrice?: number
}

// 预设市场列表（带真实资产 ID）
const PREDEFINED_MARKETS: Market[] = [
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
    assetIds: [
      '12345678901234567890123456789012345678901234567890123456789012345678',
      '87654321098765432109876543210987654321098765432109876543210987654321',
    ],
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
    assetIds: [
      '11111111111111111111111111111111111111111111111111111111111111111111',
      '22222222222222222222222222222222222222222222222222222222222222222222',
    ],
  },
]

export const MarketsView: React.FC = () => {
  const { setScanning, addNotification, setMarkets } = useAppStore()
  const [markets, setMarketsData] = useState<Market[]>([])
  const [scanStatus, setScanStatus] = useState<'idle' | 'scanning' | 'connected' | 'error'>('idle')
  const [scanLog, setScanLog] = useState<string[]>([])
  const [filter, setFilter] = useState<string>('all')
  const [sortBy, setSortBy] = useState<string>('volume')
  const [wsStatus, setWsStatus] = useState<string>('disconnected')
  const [messageCount, setMessageCount] = useState(0)

  const addLog = (message: string) => {
    setScanLog((prev) => [...prev, `[${new Date().toLocaleTimeString()}] ${message}`])
  }

  // 连接 WebSocket
  useEffect(() => {
    let unsubscribe: (() => void) | undefined

    const connectWebSocket = async () => {
      addLog('🔌 正在连接 Polymarket WebSocket...')

      const connected = await realtimeService.connect()

      if (connected) {
        setWsStatus(realtimeService.getStatus())
        addLog('✅ WebSocket 连接成功')
        setScanStatus('connected')
        addNotification('实时行情已连接', 'success')

        // 订阅预设市场
        const allAssetIds = PREDEFINED_MARKETS
          .flatMap(m => m.assetIds || [])
          .filter(Boolean)

        if (allAssetIds.length > 0) {
          realtimeService.subscribe(allAssetIds)
          addLog(`📡 已订阅 ${allAssetIds.length} 个资产`)
        }

        // 加载初始市场数据
        setMarketsData(PREDEFINED_MARKETS)
        setMarkets(PREDEFINED_MARKETS)
      } else {
        setWsStatus('error')
        setScanStatus('error')
        addLog('❌ WebSocket 连接失败')
        addNotification('实时行情连接失败', 'error')
      }
    }

    // 监听实时消息
    unsubscribe = realtimeService.onMessage((data: MarketData) => {
      setMessageCount(prev => prev + 1)

      // 根据消息类型更新市场数据
      if (data.type === 'book' || data.type === 'best_bid_ask') {
        updateMarketFromOrderBook(data)
      } else if (data.type === 'last_trade_price') {
        updateMarketFromTrade(data)
      }
    })

    connectWebSocket()

    // 清理
    return () => {
      if (unsubscribe) unsubscribe()
      realtimeService.disconnect()
    }
  }, [])

  // 从订单簿更新市场价格
  const updateMarketFromOrderBook = (data: MarketData) => {
    if (!data.data) return

    setMarketsData(prev => prev.map(market => {
      if (market.assetIds?.includes(data.asset_id || '')) {
        const book = data.data as OrderBook
        if (book.bids && book.bids.length > 0) {
          const bestBid = book.bids[0][0]
          const bestAsk = book.asks?.[0]?.[0] || bestBid
          const midPrice = (bestBid + bestAsk) / 2

          return {
            ...market,
            outcomePrices: [bestBid, bestAsk],
            liquidity: book.bids.reduce((sum, b) => sum + b[1], 0) + book.asks.reduce((sum, a) => sum + a[1], 0),
          }
        }
      }
      return market
    }))
  }

  // 从交易更新市场价格
  const updateMarketFromTrade = (data: MarketData) => {
    if (!data.data?.price) return

    setMarketsData(prev => prev.map(market => {
      if (market.assetIds?.includes(data.asset_id || '')) {
        return {
          ...market,
          outcomePrices: market.outcomePrices.map(p =>
            p === market.lastTradePrice ? data.data.price : p
          ),
          lastTradePrice: data.data.price,
        }
      }
      return market
    }))
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

    // 断开并重连
    realtimeService.disconnect()
    await new Promise(resolve => setTimeout(resolve, 1000))

    const connected = await realtimeService.connect()

    if (connected) {
      const allAssetIds = PREDEFINED_MARKETS.flatMap(m => m.assetIds || []).filter(Boolean)
      realtimeService.subscribe(allAssetIds)
      setMarketsData(PREDEFINED_MARKETS)
      setMarkets(PREDEFINED_MARKETS)
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

  const filteredMarkets = markets
    .filter(m => filter === 'all' || m.category === filter)
    .sort((a, b) => {
      if (sortBy === 'volume') return b.volume - a.volume
      if (sortBy === 'liquidity') return b.liquidity - a.liquidity
      if (sortBy === 'endDate') return new Date(a.endDate).getTime() - new Date(b.endDate).getTime()
      return 0
    })

  const categories = ['all', 'crypto', 'economics', 'politics', 'stocks']

  return (
    <div className="space-y-6">
      {/* Scanner Control */}
      <MatrixCard
        title="MARKET SCANNER"
        subtitle="Real-time Polymarket data via WebSocket"
        glow={scanStatus === 'connected'}
      >
        <div className="flex justify-between items-center mb-4">
          <div className="text-sm text-matrix-text-secondary font-mono">
            状态：
            <span className={cn(
              'ml-2',
              scanStatus === 'idle' ? 'text-matrix-text-muted' :
              scanStatus === 'scanning' ? 'text-matrix-warning animate-pulse' :
              scanStatus === 'connected' ? 'text-matrix-success' :
              'text-matrix-error'
            )}>
              {scanStatus === 'idle' && '空闲'}
              {scanStatus === 'scanning' && '连接中...'}
              {scanStatus === 'connected' && `● 实时连接中`}
              {scanStatus === 'error' && '错误'}
            </span>
          </div>
          <MatrixButton
            onClick={handleScan}
            disabled={scanStatus === 'scanning'}
            variant={scanStatus === 'connected' ? 'success' : 'primary'}
          >
            {scanStatus === 'connected' ? '● CONNECTED' : 'CONNECT'}
          </MatrixButton>
        </div>

        {/* Connection Stats */}
        <div className="grid grid-cols-3 gap-4 mb-4">
          <div className="p-3 border border-matrix-border-tertiary rounded bg-matrix-bg-tertiary/50">
            <div className="text-xs text-matrix-text-secondary font-mono mb-1">WebSocket 状态</div>
            <div className={cn(
              'text-lg font-bold font-mono',
              wsStatus === 'connected' ? 'text-matrix-success' : 'text-matrix-error'
            )}>
              {wsStatus.toUpperCase()}
            </div>
          </div>
          <div className="p-3 border border-matrix-border-tertiary rounded bg-matrix-bg-tertiary/50">
            <div className="text-xs text-matrix-text-secondary font-mono mb-1">订阅资产</div>
            <div className="text-lg font-bold font-mono text-matrix-text-primary">
              {realtimeService.getSubscribedAssets().length}
            </div>
          </div>
          <div className="p-3 border border-matrix-border-tertiary rounded bg-matrix-bg-tertiary/50">
            <div className="text-xs text-matrix-text-secondary font-mono mb-1">接收消息</div>
            <div className="text-lg font-bold font-mono text-matrix-info">
              {messageCount}
            </div>
          </div>
        </div>

        {/* Scan Log */}
        {scanLog.length > 0 && (
          <div className="text-xs font-mono p-3 border border-matrix-border-tertiary rounded bg-matrix-bg-tertiary max-h-40 overflow-y-auto">
            {scanLog.slice(-20).map((log, index) => (
              <div
                key={index}
                className={cn(
                  'py-1',
                  log.includes('✅') ? 'text-matrix-success' :
                  log.includes('❌') ? 'text-matrix-error' :
                  log.includes('⚠️') ? 'text-matrix-warning' :
                  'text-matrix-text-secondary'
                )}
              >
                {log}
              </div>
            ))}
          </div>
        )}

        {/* 说明 */}
        <div className="mt-4 text-xs text-matrix-text-muted font-mono p-3 border border-matrix-border-tertiary rounded bg-matrix-bg-accent">
          ℹ️ 实时数据来自 Polymarket WebSocket: wss://ws-subscriptions-clob.polymarket.com/ws/market
        </div>
      </MatrixCard>

      {/* Filters */}
      {markets.length > 0 && (
        <MatrixCard title="MARKET FILTERS">
          <div className="flex gap-4 flex-wrap">
            <div className="flex items-center gap-2">
              <span className="text-xs text-matrix-text-secondary font-mono">Category:</span>
              <select
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                className="bg-matrix-bg-tertiary border border-matrix-border-tertiary rounded px-3 py-1.5 text-sm font-mono text-matrix-text-primary"
              >
                {categories.map(cat => (
                  <option key={cat} value={cat}>
                    {cat === 'all' ? '全部' : cat.toUpperCase()}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-matrix-text-secondary font-mono">Sort By:</span>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
                className="bg-matrix-bg-tertiary border border-matrix-border-tertiary rounded px-3 py-1.5 text-sm font-mono text-matrix-text-primary"
              >
                <option value="volume">Volume</option>
                <option value="liquidity">Liquidity</option>
                <option value="endDate">End Date</option>
              </select>
            </div>
          </div>
        </MatrixCard>
      )}

      {/* Markets List */}
      {scanStatus === 'scanning' ? (
        <MatrixCard>
          <MatrixLoading text="正在连接实时行情..." fullScreen={false} />
        </MatrixCard>
      ) : markets.length === 0 ? (
        <MatrixCard title="MARKETS">
          <div className="text-center py-12">
            <div className="text-4xl mb-4">📡</div>
            <div className="text-matrix-text-secondary font-mono mb-4">
              暂无市场数据
            </div>
            <MatrixButton onClick={handleScan} variant="primary">
              连接实时行情
            </MatrixButton>
          </div>
        </MatrixCard>
      ) : (
        <MatrixCard title={`MARKETS (${filteredMarkets.length}) - 实时更新`}>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {filteredMarkets.map((market) => (
              <div
                key={market.id}
                className="p-4 border border-matrix-border-tertiary rounded hover:border-matrix-border-primary transition-all cursor-pointer bg-matrix-bg-tertiary/50"
                onClick={() => {
                  addNotification(`选中市场：${market.question.substring(0, 50)}...`, 'info')
                }}
              >
                <div className="flex justify-between items-start mb-3">
                  <span className="text-xs px-2 py-1 bg-matrix-bg-accent border border-matrix-border-primary rounded text-matrix-text-secondary font-mono">
                    {market.category?.toUpperCase() || 'CRYPTO'}
                  </span>
                  <span className="text-xs text-matrix-text-muted font-mono">
                    {new Date(market.endDate).toLocaleDateString()}
                  </span>
                </div>

                <h4 className="text-matrix-text-primary font-semibold text-sm mb-3 line-clamp-2">
                  {market.question}
                </h4>

                <div className="grid grid-cols-2 gap-2 mb-3">
                  {market.outcomePrices.slice(0, 2).map((price, index) => (
                    <div
                      key={index}
                      className={cn(
                        'p-2 rounded text-center font-mono text-sm',
                        index === 0
                          ? 'bg-matrix-success/10 text-matrix-success border border-matrix-success/30'
                          : 'bg-matrix-error/10 text-matrix-error border border-matrix-error/30'
                      )}
                    >
                      <div className="text-xs text-matrix-text-secondary mb-1">
                        {index === 0 ? 'YES' : 'NO'}
                      </div>
                      <div className="text-lg font-bold">
                        {(price * 100).toFixed(1)}¢
                      </div>
                    </div>
                  ))}
                </div>

                <div className="flex justify-between text-xs text-matrix-text-secondary font-mono pt-3 border-t border-matrix-border-tertiary">
                  <span>Volume: {formatCurrency(market.volume)}</span>
                  <span>Liquidity: {formatCurrency(market.liquidity)}</span>
                </div>

                {market.lastTradePrice && (
                  <div className="text-xs text-matrix-info font-mono mt-2">
                    最新成交价：{(market.lastTradePrice * 100).toFixed(1)}¢
                  </div>
                )}
              </div>
            ))}
          </div>
        </MatrixCard>
      )}
    </div>
  )
}