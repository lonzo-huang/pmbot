import React from 'react'
import { useAppStore } from '@/stores/appStore'
import { MatrixCard } from '@/components/ui/MatrixCard'
import { MatrixButton } from '@/components/ui/MatrixButton'
import { Market } from '@/types'

export const MarketsView: React.FC = () => {
  const { markets, ui, setScanning, addNotification } = useAppStore()

  const handleScan = () => {
    setScanning(true)
    addNotification('开始扫描市场...', 'info')
    setTimeout(() => {
      setScanning(false)
      addNotification('扫描完成', 'success')
    }, 3000)
  }

  return (
    <div className="space-y-6">
      <MatrixCard title="MARKET SCANNER" glow={ui.isScanning}>
        <div className="flex justify-between items-center mb-4">
          <div className="text-sm text-matrix-text-secondary font-mono">
            状态：{ui.isScanning ? (
              <span className="text-matrix-success animate-pulse">扫描中...</span>
            ) : (
              <span className="text-matrix-text-muted">空闲</span>
            )}
          </div>
          <MatrixButton onClick={handleScan} disabled={ui.isScanning}>
            {ui.isScanning ? 'SCANNING...' : 'SCAN MARKETS'}
          </MatrixButton>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {markets.activeMarkets.slice(0, 9).map((market: Market) => (
            <div
              key={market.id}
              className="p-4 border border-matrix-border-tertiary rounded hover:border-matrix-border-primary transition-colors cursor-pointer"
            >
              <h4 className="text-matrix-text-primary font-semibold text-sm mb-2 line-clamp-2">
                {market.question}
              </h4>
              <div className="flex justify-between text-xs text-matrix-text-secondary font-mono">
                <span>流动性：${market.liquidity?.toLocaleString()}</span>
                <span>
                  {market.outcomePrices?.[0]
                    ? `${(market.outcomePrices[0] * 100).toFixed(0)}%`
                    : 'N/A'}
                </span>
              </div>
            </div>
          ))}
        </div>
      </MatrixCard>
    </div>
  )
}