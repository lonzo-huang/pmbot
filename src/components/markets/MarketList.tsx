import React, { useState } from 'react'
import { MatrixCard } from '@/components/ui/MatrixCard'
import { cn } from '@/utils/cn'
import { formatCurrency } from '@/utils/formatting'
import { useAppStore } from '@/stores/appStore'

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

interface MarketListProps {
  markets: Market[]
  filter: string
  sortBy: string
  onFilterChange: (filter: string) => void
  onSortChange: (sortBy: string) => void
  onMarketClick: (market: Market) => void
}

interface BuyPanel {
  marketId: string
  side: 'YES' | 'NO'
}

const categories = ['all', 'crypto', 'economics', 'politics', 'sports', 'other']

export const MarketList: React.FC<MarketListProps> = ({
  markets,
  filter,
  sortBy,
  onFilterChange,
  onSortChange,
  onMarketClick,
}) => {
  const { addPosition, addNotification } = useAppStore()

  // ✅ 关键：内联买入面板状态
  const [activePanel, setActivePanel] = useState<BuyPanel | null>(null)
  const [amount, setAmount] = useState('50')

  const filteredMarkets = markets
    .filter(m => filter === 'all' || m.category === filter)
    .sort((a, b) => {
      if (sortBy === 'volume') return b.volume - a.volume
      if (sortBy === 'liquidity') return b.liquidity - a.liquidity
      if (sortBy === 'endDate') return new Date(a.endDate).getTime() - new Date(b.endDate).getTime()
      return 0
    })

  // ✅ 关键：打开/关闭买入面板
  const openPanel = (e: React.MouseEvent, marketId: string, side: 'YES' | 'NO') => {
    e.stopPropagation()
    if (activePanel?.marketId === marketId && activePanel?.side === side) {
      setActivePanel(null)
    } else {
      setActivePanel({ marketId, side })
      setAmount('50')
    }
  }

  // ✅ 关键：执行买入
  const handleBuy = (e: React.MouseEvent, market: Market) => {
    e.stopPropagation()
    if (!activePanel) return

    const side = activePanel.side
    const priceIndex = side === 'YES' ? 0 : 1
    const entryPrice = market.outcomePrices[priceIndex] ?? 0.5
    const amt = parseFloat(amount)

    if (isNaN(amt) || amt <= 0) {
      addNotification('请输入有效金额', 'error')
      return
    }

    const tokenId = market.assetIds?.[priceIndex] ?? market.assetIds?.[0] ?? market.id

    addPosition({
      tokenId,
      marketId: market.id,
      outcome: side.toLowerCase(),
      amount: amt,
      entryPrice,
      currentPrice: entryPrice,
      pnl: 0,
      openedAt: Date.now(),
    })

    addNotification(`已添加 ${side} 仓位: ${market.question.substring(0, 35)}...`, 'success')
    setActivePanel(null)
  }

  return (
    <MatrixCard
      title={`MARKETS (${filteredMarkets.length}) - Real-time Updates`}
      className="h-full flex flex-col"
      headerExtra={
        <div className="flex gap-3 items-center text-xs">
          <select
            value={filter}
            onChange={(e) => onFilterChange(e.target.value)}
            className="bg-matrix-bg-tertiary border border-matrix-border-tertiary rounded px-2 py-1 text-xs font-mono text-matrix-text-primary"
          >
            {categories.map(cat => (
              <option key={cat} value={cat}>{cat === 'all' ? 'All' : cat.toUpperCase()}</option>
            ))}
          </select>
          <select
            value={sortBy}
            onChange={(e) => onSortChange(e.target.value)}
            className="bg-matrix-bg-tertiary border border-matrix-border-tertiary rounded px-2 py-1 text-xs font-mono text-matrix-text-primary"
          >
            <option value="volume">Volume</option>
            <option value="liquidity">Liquidity</option>
            <option value="endDate">End Date</option>
          </select>
        </div>
      }
    >
      <div className="flex-1 overflow-y-auto pr-2 min-h-0 custom-scrollbar">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 pb-4">
          {filteredMarkets.map((market) => {
            const yesPrice = market.outcomePrices[0] ?? 0.5
            const noPrice = market.outcomePrices[1] ?? 0.5
            const isYesPanelOpen = activePanel?.marketId === market.id && activePanel?.side === 'YES'
            const isNoPanelOpen = activePanel?.marketId === market.id && activePanel?.side === 'NO'
            const isPanelOpen = isYesPanelOpen || isNoPanelOpen

            return (
              <div
                key={market.id}
                className={cn(
                  'border rounded transition-all bg-matrix-bg-tertiary/50',
                  isPanelOpen
                    ? 'border-matrix-border-primary'
                    : 'border-matrix-border-tertiary hover:border-matrix-border-primary cursor-pointer'
                )}
                onClick={() => !isPanelOpen && onMarketClick(market)}
              >
                <div className="p-3">
                  {/* 头部：分类 + 日期 */}
                  <div className="flex justify-between items-start mb-2">
                    <span className="text-xs px-1.5 py-0.5 bg-matrix-bg-accent border border-matrix-border-primary rounded text-matrix-text-secondary font-mono">
                      {market.category?.toUpperCase() || 'OTHER'}
                    </span>
                    <span className="text-xs text-matrix-text-muted font-mono">
                      {new Date(market.endDate).toLocaleDateString()}
                    </span>
                  </div>

                  {/* 市场问题 */}
                  <h4 className="text-matrix-text-primary font-semibold text-xs mb-3 line-clamp-2 min-h-[2.5rem]">
                    {market.question}
                  </h4>

                  {/* YES/NO 价格 + Buy 按钮 */}
                  <div className="grid grid-cols-2 gap-1.5 mb-2">
                    {/* YES */}
                    <div className="flex flex-col gap-1">
                      <div className="p-1.5 rounded text-center font-mono bg-matrix-success/10 text-matrix-success border border-matrix-success/30">
                        <div className="text-xs opacity-70">YES</div>
                        <div className="text-sm font-bold">{(yesPrice * 100).toFixed(1)}¢</div>
                      </div>
                      <button
                        onClick={(e) => openPanel(e, market.id, 'YES')}
                        className={cn(
                          'w-full py-1 rounded text-xs font-mono transition-all border',
                          isYesPanelOpen
                            ? 'bg-matrix-success text-black border-matrix-success'
                            : 'bg-matrix-success/10 text-matrix-success border-matrix-success/40 hover:bg-matrix-success/20'
                        )}
                      >
                        {isYesPanelOpen ? '✓ YES' : '+ Buy YES'}
                      </button>
                    </div>

                    {/* NO */}
                    <div className="flex flex-col gap-1">
                      <div className="p-1.5 rounded text-center font-mono bg-matrix-error/10 text-matrix-error border border-matrix-error/30">
                        <div className="text-xs opacity-70">NO</div>
                        <div className="text-sm font-bold">{(noPrice * 100).toFixed(1)}¢</div>
                      </div>
                      <button
                        onClick={(e) => openPanel(e, market.id, 'NO')}
                        className={cn(
                          'w-full py-1 rounded text-xs font-mono transition-all border',
                          isNoPanelOpen
                            ? 'bg-matrix-error text-black border-matrix-error'
                            : 'bg-matrix-error/10 text-matrix-error border-matrix-error/40 hover:bg-matrix-error/20'
                        )}
                      >
                        {isNoPanelOpen ? '✓ NO' : '+ Buy NO'}
                      </button>
                    </div>
                  </div>

                  {/* ✅ 关键：内联买入面板 */}
                  {isPanelOpen && (
                    <div
                      className={cn(
                        'mt-2 p-2 rounded border',
                        isYesPanelOpen
                          ? 'border-matrix-success/40 bg-matrix-success/5'
                          : 'border-matrix-error/40 bg-matrix-error/5'
                      )}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-xs font-mono text-matrix-text-secondary">
                          Buy {activePanel!.side} @ {((activePanel!.side === 'YES' ? yesPrice : noPrice) * 100).toFixed(1)}¢
                        </span>
                      </div>
                      <div className="flex gap-2">
                        <div className="flex-1 flex items-center bg-matrix-bg-tertiary border border-matrix-border-primary rounded px-2">
                          <span className="text-xs text-matrix-text-muted font-mono mr-1">$</span>
                          <input
                            type="number"
                            value={amount}
                            onChange={(e) => setAmount(e.target.value)}
                            onClick={(e) => e.stopPropagation()}
                            className="w-full bg-transparent text-xs font-mono text-matrix-text-primary py-2 focus:outline-none"
                            placeholder="50"
                            min="1"
                            step="10"
                            autoFocus
                          />
                        </div>
                        <button
                          onClick={(e) => handleBuy(e, market)}
                          className={cn(
                            'px-4 py-2 rounded text-xs font-mono font-bold transition-all shadow-md',
                            isYesPanelOpen
                              ? 'bg-matrix-success text-black hover:bg-green-400 active:scale-95'
                              : 'bg-matrix-error text-black hover:bg-red-400 active:scale-95'
                          )}
                        >
                          CONFIRM
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); setActivePanel(null) }}
                          className="px-2 py-2 rounded text-xs font-mono text-matrix-text-muted hover:text-matrix-text-primary border border-matrix-border-tertiary"
                        >
                          ✕
                        </button>
                      </div>
                      {/* 预估盈亏 */}
                      {parseFloat(amount) > 0 && (
                        <div className="mt-1.5 text-xs font-mono text-matrix-text-muted">
                          预计获得:{' '}
                          <span className="text-matrix-text-primary">
                            {(parseFloat(amount) / ((activePanel!.side === 'YES' ? yesPrice : noPrice) || 0.5)).toFixed(2)} shares
                          </span>
                          {' · '}最大收益:{' '}
                          <span className="text-matrix-success">
                            ${(parseFloat(amount) / ((activePanel!.side === 'YES' ? yesPrice : noPrice) || 0.5) - parseFloat(amount)).toFixed(2)}
                          </span>
                        </div>
                      )}
                    </div>
                  )}

                  {/* 底部统计 */}
                  <div className="flex justify-between text-xs text-matrix-text-secondary font-mono pt-2 border-t border-matrix-border-tertiary mt-2">
                    <span>Vol: {formatCurrency(market.volume)}</span>
                    <span>Liq: {formatCurrency(market.liquidity)}</span>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </MatrixCard>
  )
}
