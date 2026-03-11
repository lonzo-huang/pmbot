import React, { useState, useEffect } from 'react'
import { MatrixModal } from '@/components/ui/MatrixModal'
import { MatrixButton } from '@/components/ui/MatrixButton'
import { formatCurrency } from '@/utils/formatting'
import { popularMarketsService, type PopularMarket } from './PopularMarketsService'

interface PopularMarketsProps {
  isOpen: boolean
  onClose: () => void
  onAddToWatchlist: (market: PopularMarket) => void
}

export const PopularMarkets: React.FC<PopularMarketsProps> = ({
  isOpen,
  onClose,
  onAddToWatchlist,
}) => {
  const [popularMarkets, setPopularMarkets] = useState<PopularMarket[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [addedMarkets, setAddedMarkets] = useState<Set<string>>(new Set())
  // 多选状态
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  useEffect(() => {
    if (isOpen) {
      loadPopularMarkets()
      setSelectedIds(new Set())
    }
  }, [isOpen])

  const loadPopularMarkets = async () => {
    setIsLoading(true)
    const markets = await popularMarketsService.getPopularMarkets(10)
    setPopularMarkets(markets)
    setIsLoading(false)
  }

  const toggleSelect = (id: string) => {
    if (addedMarkets.has(id)) return // 已添加的不可再选
    setSelectedIds(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const selectAll = () => {
    const available = popularMarkets.filter(m => !addedMarkets.has(m.id)).map(m => m.id)
    setSelectedIds(new Set(available))
  }

  const clearSelection = () => setSelectedIds(new Set())

  const handleAddSingle = (market: PopularMarket) => {
    onAddToWatchlist(market)
    setAddedMarkets(prev => new Set(prev).add(market.id))
    setSelectedIds(prev => { const n = new Set(prev); n.delete(market.id); return n })
  }

  const handleAddSelected = () => {
    const toAdd = popularMarkets.filter(m => selectedIds.has(m.id))
    toAdd.forEach(m => {
      onAddToWatchlist(m)
      setAddedMarkets(prev => new Set(prev).add(m.id))
    })
    setSelectedIds(new Set())
  }

  const availableCount = popularMarkets.filter(m => !addedMarkets.has(m.id)).length

  return (
    <MatrixModal
      isOpen={isOpen}
      onClose={onClose}
      title="🔥 Popular Polymarket Markets"
      size="lg"
    >
      <div className="flex flex-col max-h-[75vh]">
        {/* 工具栏 */}
        <div className="flex items-center justify-between mb-3 pb-3 border-b border-matrix-border-tertiary flex-shrink-0">
          <div className="text-sm text-matrix-text-secondary font-mono">
            Top 10 by 24h volume
            {selectedIds.size > 0 && (
              <span className="ml-2 text-matrix-success">
                · {selectedIds.size} selected
              </span>
            )}
          </div>
          <div className="flex gap-2">
            {availableCount > 0 && (
              <>
                <button
                  onClick={selectedIds.size === availableCount ? clearSelection : selectAll}
                  className="text-xs font-mono text-matrix-info hover:text-matrix-text-primary px-2 py-1 border border-matrix-border-tertiary rounded"
                >
                  {selectedIds.size === availableCount ? 'Deselect All' : 'Select All'}
                </button>
                {selectedIds.size > 0 && (
                  <MatrixButton
                    size="sm"
                    variant="primary"
                    onClick={handleAddSelected}
                  >
                    + Add {selectedIds.size} Selected
                  </MatrixButton>
                )}
              </>
            )}
          </div>
        </div>

        {/* 列表 */}
        <div className="flex-1 overflow-y-auto pr-1 space-y-2">
          {isLoading ? (
            <div className="text-center py-8 text-matrix-text-secondary font-mono">
              Loading popular markets...
            </div>
          ) : popularMarkets.length === 0 ? (
            <div className="text-center py-8 text-matrix-text-muted font-mono">
              No popular markets found
            </div>
          ) : (
            popularMarkets.map((market, index) => {
              const isAdded = addedMarkets.has(market.id)
              const isSelected = selectedIds.has(market.id)

              return (
                <div
                  key={market.id}
                  onClick={() => toggleSelect(market.id)}
                  className={`p-3 border rounded transition-all ${
                    isAdded
                      ? 'border-matrix-border-tertiary opacity-50 cursor-default'
                      : isSelected
                      ? 'border-matrix-success bg-matrix-success/10 cursor-pointer'
                      : 'border-matrix-border-tertiary hover:border-matrix-border-primary cursor-pointer bg-matrix-bg-tertiary'
                  }`}
                >
                  <div className="flex justify-between items-start">
                    {/* 左侧：checkbox + 序号 + 标题 */}
                    <div className="flex items-start gap-2 flex-1 min-w-0">
                      {/* Checkbox */}
                      <div className={`mt-0.5 w-4 h-4 rounded border flex-shrink-0 flex items-center justify-center text-xs ${
                        isAdded
                          ? 'border-matrix-border-tertiary bg-matrix-bg-tertiary text-matrix-text-muted'
                          : isSelected
                          ? 'border-matrix-success bg-matrix-success text-black'
                          : 'border-matrix-border-primary bg-matrix-bg-tertiary'
                      }`}>
                        {isAdded ? '✓' : isSelected ? '✓' : ''}
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-xs px-1.5 py-0.5 bg-matrix-bg-accent rounded font-mono text-matrix-info">
                            #{index + 1}
                          </span>
                          <span className="text-xs px-1.5 py-0.5 bg-matrix-bg-accent rounded font-mono text-matrix-text-secondary">
                            {market.category.toUpperCase()}
                          </span>
                        </div>
                        <div className="text-sm text-matrix-text-primary font-semibold leading-tight">
                          {market.question}
                        </div>
                      </div>
                    </div>

                    {/* 右侧：数据 + 按钮 */}
                    <div className="flex flex-col items-end gap-2 ml-3 flex-shrink-0">
                      <MatrixButton
                        size="sm"
                        variant={isAdded ? 'success' : 'primary'}
                        onClick={(e) => { e.stopPropagation(); if (!isAdded) handleAddSingle(market) }}
                        disabled={isAdded}
                      >
                        {isAdded ? '✓ Added' : '+ Add'}
                      </MatrixButton>

                      <div className="text-xs font-mono text-right space-y-0.5">
                        <div>
                          <span className="text-matrix-text-muted">24h Vol: </span>
                          <span className="text-matrix-text-primary">${formatCurrency(market.volume24h)}</span>
                        </div>
                        <div>
                          <span className="text-matrix-text-muted">Liq: </span>
                          <span className="text-matrix-text-primary">${formatCurrency(market.liquidity)}</span>
                        </div>
                        <div>
                          <span className="text-matrix-text-muted">Ends: </span>
                          <span className="text-matrix-text-muted">{new Date(market.endDate).toLocaleDateString()}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )
            })
          )}
        </div>

        {/* 底部提示 */}
        <div className="mt-3 pt-3 border-t border-matrix-border-tertiary flex-shrink-0">
          <div className="text-xs text-matrix-info font-mono">
            💡 点击卡片多选后批量添加，或点 + Add 单独添加。添加后自动订阅实时数据。
          </div>
        </div>
      </div>
    </MatrixModal>
  )
}