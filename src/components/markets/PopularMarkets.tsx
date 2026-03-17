import React, { useState, useEffect } from 'react'
import { MatrixModal } from '@/components/ui/MatrixModal'
import { MatrixButton } from '@/components/ui/MatrixButton'
import { formatCurrency } from '@/utils/formatting'
import { popularMarketsService, type PopularMarket } from './PopularMarketsService'

interface PopularMarketsProps {
  isOpen: boolean
  onClose: () => void
  onAddToWatchlist: (market: PopularMarket) => void
  addedIds: Set<string>
  onSetAddedIds: (ids: Set<string>) => void
}

export const PopularMarkets: React.FC<PopularMarketsProps> = ({
  isOpen,
  onClose,
  onAddToWatchlist,
  addedIds,
  onSetAddedIds,
}) => {
  const [popularMarkets, setPopularMarkets] = useState<PopularMarket[]>([])
  const [isLoading, setIsLoading] = useState(false)
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
    if (addedIds.has(id)) return
    setSelectedIds(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const selectAll = () => {
    const available = popularMarkets.filter(m => !addedIds.has(m.id)).map(m => m.id)
    setSelectedIds(new Set(available))
  }

  const clearSelection = () => setSelectedIds(new Set())

  const handleAddSingle = (market: PopularMarket) => {
    onAddToWatchlist(market)
  }

  const handleAddSelected = () => {
    const toAdd = popularMarkets.filter(m => selectedIds.has(m.id) && !addedIds.has(m.id))
    toAdd.forEach(market => {
      onAddToWatchlist(market)
    })
    onSetAddedIds(new Set([...addedIds, ...toAdd.map(m => m.id)]))
    setSelectedIds(new Set())
  }

  const availableCount = popularMarkets.filter(m => !addedIds.has(m.id)).length

  return (
    <MatrixModal isOpen={isOpen} onClose={onClose} title="🔥 Popular Polymarket Markets" size="lg">
      <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-2">
        <div className="flex justify-between items-center">
          <div className="text-sm text-matrix-text-secondary font-mono">
            Top 10 by 24h volume
            {selectedIds.size > 0 && <span className="ml-2 text-matrix-info">· {selectedIds.size} selected</span>}
          </div>
          {availableCount > 0 && (
            <>
              <button onClick={selectedIds.size === availableCount ? clearSelection : selectAll} className="text-xs font-mono text-matrix-info hover:text-matrix-text-primary px-2 py-1 border border-matrix-border-tertiary rounded">
                {selectedIds.size === availableCount ? 'Deselect All' : 'Select All'}
              </button>
              {selectedIds.size > 0 && (
                <MatrixButton size="sm" variant="primary" onClick={handleAddSelected}>
                  + Add {selectedIds.size} Selected
                </MatrixButton>
              )}
            </>
          )}
        </div>
        <div className="flex-1 overflow-y-auto pr-1 space-y-2">
          {isLoading ? (
            <div className="text-center py-8 text-matrix-text-secondary font-mono">Loading popular markets...</div>
          ) : popularMarkets.length === 0 ? (
            <div className="text-center py-8 text-matrix-text-muted font-mono">No popular markets found</div>
          ) : (
            popularMarkets.map((market, index) => {
              const isAdded = addedIds.has(market.id)
              const isSelected = selectedIds.has(market.id)
              return (
                <div 
                  key={market.id} 
                  onClick={() => toggleSelect(market.id)} 
                  className={`p-3 border rounded transition-all select-none ${
                    isAdded ? 'border-matrix-border-tertiary opacity-60 cursor-default' :
                    isSelected ? 'border-matrix-success bg-matrix-success/10 cursor-pointer shadow-[0_0_10px_rgba(0,255,0,0.1)]' :
                    'border-matrix-border-tertiary hover:border-matrix-border-primary cursor-pointer bg-matrix-bg-tertiary'
                  }`}
                >
                  <div className="flex justify-between items-center">
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      {/* 复选框视觉效果 */}
                      {!isAdded && (
                        <div className={`w-5 h-5 rounded-sm border-2 flex-shrink-0 flex items-center justify-center transition-all ${
                          isSelected ? 'border-matrix-success bg-matrix-success text-black' : 'border-matrix-border-primary'
                        }`}>
                          {isSelected && <span className="text-xs font-bold leading-none">✓</span>}
                        </div>
                      )}
                      {isAdded && (
                        <div className="w-5 h-5 rounded-full bg-matrix-success/20 text-matrix-success flex items-center justify-center text-xs flex-shrink-0">
                          ✓
                        </div>
                      )}
                      
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-[10px] px-1.5 py-0.5 bg-matrix-bg-accent rounded font-mono text-matrix-info border border-matrix-info/30">#{index + 1}</span>
                          <span className="text-[10px] px-1.5 py-0.5 bg-matrix-bg-accent rounded font-mono text-matrix-text-secondary border border-matrix-border-tertiary">{market.category.toUpperCase()}</span>
                        </div>
                        <div className="text-sm text-matrix-text-primary font-bold leading-tight line-clamp-2">{market.question}</div>
                      </div>
                    </div>

                    <div className="flex items-center gap-4 ml-3 flex-shrink-0">
                      <div className="text-xs font-mono text-right hidden sm:block">
                        <div className="text-matrix-text-muted">Vol: <span className="text-matrix-text-primary">${formatCurrency(market.volume24h)}</span></div>
                        <div className="text-matrix-text-muted">Liq: <span className="text-matrix-text-primary">${formatCurrency(market.liquidity)}</span></div>
                      </div>
                      <MatrixButton 
                        size="sm" 
                        variant={isAdded ? 'secondary' : isSelected ? 'primary' : 'primary'} 
                        onClick={(e: React.MouseEvent<HTMLButtonElement>) => { e.stopPropagation(); if (!isAdded) handleAddSingle(market) }} 
                        disabled={isAdded}
                        className="min-w-[70px]"
                      >
                        {isAdded ? 'Added' : '+ Add'}
                      </MatrixButton>
                    </div>
                  </div>
                </div>
              )
            })
          )}
        </div>
        <div className="mt-3 pt-3 border-t border-matrix-border-tertiary flex-shrink-0">
          <div className="text-xs text-matrix-info font-mono">💡 点击卡片多选后批量添加，或点 + Add 单独添加。添加后自动订阅实时数据。</div>
        </div>
      </div>
    </MatrixModal>
  )
}
