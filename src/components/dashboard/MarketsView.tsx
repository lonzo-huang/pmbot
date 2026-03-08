import React, { useState, useEffect } from 'react'
import { useAppStore } from '@/stores/appStore'
import { MatrixCard } from '@/components/ui/MatrixCard'
import { MatrixButton } from '@/components/ui/MatrixButton'
import { MatrixLoading } from '@/components/ui/MatrixLoading'
import { MatrixInput } from '@/components/ui/MatrixInput'
import { MatrixModal } from '@/components/ui/MatrixModal'
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

// 预设市场模板（用于快速选择）
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
  {
    id: 'sol-outperform',
    question: 'Will Solana outperform Ethereum in 2026?',
    volume: 450000,
    liquidity: 35000,
    outcomePrices: [0.28, 0.72],
    endDate: '2026-12-31T23:59:59Z',
    active: true,
    category: 'crypto',
  },
  {
    id: 'trump-2028',
    question: 'Will Trump announce 2028 campaign before July?',
    volume: 3200000,
    liquidity: 220000,
    outcomePrices: [0.55, 0.45],
    endDate: '2026-07-31T23:59:59Z',
    active: true,
    category: 'politics',
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

  // 市场选择功能
  const [showMarketSelector, setShowMarketSelector] = useState(false)
  const [selectedTemplates, setSelectedTemplates] = useState<string[]>(['btc-100k-2026', 'eth-5k-q2', 'fed-rates-march'])
  const [customAssetIds, setCustomAssetIds] = useState<string>('')

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

    connectWebSocket()

    return () => {
      if (unsubscribe) unsubscribe()
      realtimeService.disconnect()
    }
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
            liquidity: book.bids.reduce((sum, b) => sum + b[1], 0) + book.asks.reduce((sum, a) => sum + a[1], 0),
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
          outcomePrices: market.outcomePrices.map(p =>
            p === market.lastTradePrice ? data.data.price : p
          ),
          lastTradePrice: data.data.price,
        }
      }
      return market
    }))
  }

  const loadSelectedMarkets = () => {
    const selectedMarkets = MARKET_TEMPLATES.filter(m => selectedTemplates.includes(m.id))

    if (customAssetIds.trim()) {
      const ids = customAssetIds.trim().split(',').map(s => s.trim()).filter(Boolean)
      if (ids.length >= 2) {
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

    const allAssetIds = selectedMarkets.flatMap(m => m.assetIds || []).filter(Boolean)
    if (allAssetIds.length > 0) {
      realtimeService.subscribe(allAssetIds)
      addLog(`📡 已订阅 ${allAssetIds.length} 个资产`)
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

  const toggleTemplate = (templateId: string) => {
    setSelectedTemplates(prev =>
      prev.includes(templateId)
        ? prev.filter(id => id !== templateId)
        : [...prev, templateId]
    )
  }

  const saveMarketSelection = () => {
    loadSelectedMarkets()
    setShowMarketSelector(false)
    addNotification(`已选择 ${selectedTemplates.length} 个市场`, 'success')
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
    <div className="flex flex-col h-screen overflow-hidden p-6 space-y-4">
      {/* Scanner Control - 固定高度 */}
      <div className="flex-shrink-0">
        <MatrixCard title="MARKET SCANNER" subtitle="Real-time Polymarket data via WebSocket">
          <div className="flex justify-between items-center mb-4">
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

          {scanLog.length > 0 && (
            <div className="text-xs font-mono p-3 border border-matrix-border-tertiary rounded bg-matrix-bg-tertiary max-h-32 overflow-y-auto">
              {scanLog.slice(-20).map((log, index) => (
                <div key={index} className="py-1 text-matrix-text-secondary">{log}</div>
              ))}
            </div>
          )}

          <div className="mt-4 text-xs text-matrix-text-muted font-mono p-3 border border-matrix-border-tertiary rounded bg-matrix-bg-accent">
            ℹ️ 实时数据来自 Polymarket WebSocket: wss://ws-subscriptions-clob.polymarket.com/ws/market
          </div>
        </MatrixCard>
      </div>

      {/* Filters - 固定高度 */}
      {markets.length > 0 && (
        <div className="flex-shrink-0">
          <MatrixCard title="MARKET FILTERS">
            <div className="flex gap-4 flex-wrap items-center">
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
              <div className="flex items-center gap-2 ml-auto">
                <span className="text-xs text-matrix-text-secondary font-mono">当前市场:</span>
                <span className="text-sm text-matrix-success font-mono">{markets.length} 个</span>
              </div>
            </div>
          </MatrixCard>
        </div>
      )}

      {/* Markets List - ✅ 关键修复：使用 flex-1 和 overflow-auto */}
      {scanStatus === 'scanning' ? (
        <MatrixCard>
          <MatrixLoading text="正在连接实时行情..." fullScreen={false} />
        </MatrixCard>
      ) : markets.length === 0 ? (
        <MatrixCard title="MARKETS">
          <div className="text-center py-12">
            <div className="text-4xl mb-4">📡</div>
            <div className="text-matrix-text-secondary font-mono mb-4">暂无市场数据</div>
            <div className="flex gap-4 justify-center">
              <MatrixButton onClick={handleScan} variant="primary">连接实时行情</MatrixButton>
              <MatrixButton onClick={() => setShowMarketSelector(true)} variant="secondary">选择市场</MatrixButton>
            </div>
          </div>
        </MatrixCard>
      ) : (
        <div className="flex-1 min-h-0 overflow-hidden">
          <MatrixCard title={`MARKETS (${filteredMarkets.length}) - 实时更新`} className="h-full">
            {/* ✅ 关键修复：独立滚动容器，使用 max-height 而非固定高度 */}
            <div
              className="overflow-y-auto pr-2"
              style={{ maxHeight: 'calc(100% - 60px)' }}
            >
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 pb-4">
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
        <div className="space-y-4">
          <div className="text-sm text-matrix-text-secondary font-mono">
            选择要订阅的市场（可多选）：
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-60 overflow-y-auto">
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
                    'w-4 h-4 rounded border flex items-center justify-center',
                    selectedTemplates.includes(template.id)
                      ? 'bg-matrix-success border-matrix-success'
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

          <div className="border-t border-matrix-border-tertiary pt-4">
            <div className="text-sm text-matrix-text-secondary font-mono mb-2">
              或输入自定义资产 ID（逗号分隔）：
            </div>
            <MatrixInput
              value={customAssetIds}
              onChange={setCustomAssetIds}
              placeholder="asset_id_1,asset_id_2,asset_id_3..."
              label="自定义资产 ID"
            />
            <div className="text-xs text-matrix-text-muted font-mono mt-2">
              💡 提示：从 Polymarket 网站获取资产 ID，至少需要 2 个（YES/NO）
            </div>
          </div>
        </div>
      </MatrixModal>
    </div>
  )
}