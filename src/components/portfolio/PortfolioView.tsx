import React from 'react'
import { useAppStore } from '@/stores/appStore'
import { MatrixCard } from '@/components/ui/MatrixCard'
import { MatrixButton } from '@/components/ui/MatrixButton'
import { PositionTable } from '@/components/dashboard/PositionTable'
import { formatCurrency, formatPercent } from '@/utils/formatting'

export const PortfolioView: React.FC = () => {
  const { positions, trading, clearTradeStats } = useAppStore()
  
  const totalValue = positions.active.reduce(
    (sum, pos) => sum + pos.amount * pos.currentPrice,
    0
  )
  
  const totalCost = positions.active.reduce(
    (sum, pos) => sum + pos.amount * pos.entryPrice,
    0
  )
  
  const totalPnL = positions.pnl.total
  const totalTrades = trading.tradeHistory?.filter(t => t.type === 'sell' && typeof t.pnl === 'number').length || 0
  const winRate = totalTrades > 0
    ? (trading.tradeHistory.filter((t) => (t.pnl || 0) > 0).length / totalTrades) * 100
    : 0
  
  return (
    <div className="space-y-6">
      {/* Portfolio Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <MatrixCard title="TOTAL VALUE" glow>
          <div className="text-3xl font-bold text-matrix-text-primary font-mono">
            {formatCurrency(totalValue)}
          </div>
          <div className="text-xs text-matrix-text-secondary font-mono mt-2">
            USDC Equivalent
          </div>
        </MatrixCard>
        
        <MatrixCard title="TOTAL COST">
          <div className="text-3xl font-bold text-matrix-text-secondary font-mono">
            {formatCurrency(totalCost)}
          </div>
          <div className="text-xs text-matrix-text-secondary font-mono mt-2">
            Entry Value
          </div>
        </MatrixCard>
        
        <MatrixCard title="TOTAL P&L" glow={totalPnL !== 0}>
          <div
            className={cn(
              'text-3xl font-bold font-mono',
              totalPnL >= 0 ? 'text-matrix-success' : 'text-matrix-error'
            )}
          >
            {formatCurrency(totalPnL)}
          </div>
          <div className="text-xs text-matrix-text-secondary font-mono mt-2">
            {formatPercent(positions.pnl.total / (totalCost || 1))}
          </div>
        </MatrixCard>
        
        <MatrixCard title="WIN RATE">
          <div
            className={cn(
              'text-3xl font-bold font-mono',
              winRate >= 50 ? 'text-matrix-success' : 'text-matrix-warning'
            )}
          >
            {winRate.toFixed(1)}%
          </div>
          <div className="text-xs text-matrix-text-secondary font-mono mt-2">
            {totalTrades} 已平仓交易
          </div>
        </MatrixCard>
      </div>
      
      {/* Active Positions */}
      <PositionTable
        positions={positions.active}
        onSell={(tokenId) => console.log('Sell:', tokenId)}
      />
      
      {/* Trade History */}
      <MatrixCard 
        title="TRADE HISTORY"
        headerExtra={
          <MatrixButton 
            variant="danger" 
            size="sm"
            disabled={totalTrades === 0}
            onClick={() => {
              if (confirm('确定要清除所有交易记录和统计吗？此操作不可恢复。')) {
                clearTradeStats()
              }
            }}
          >
            🗑️ 清除统计
          </MatrixButton>
        }
      >
        {trading.tradeHistory.length === 0 ? (
          <div className="text-center py-8 text-matrix-text-secondary font-mono">
            暂无交易记录
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-matrix-border-tertiary">
                  <th className="text-left p-3 text-matrix-text-secondary font-mono text-sm">
                    Time
                  </th>
                  <th className="text-left p-3 text-matrix-text-secondary font-mono text-sm">
                    Market
                  </th>
                  <th className="text-left p-3 text-matrix-text-secondary font-mono text-sm">
                    Side
                  </th>
                  <th className="text-right p-3 text-matrix-text-secondary font-mono text-sm">
                    Size
                  </th>
                  <th className="text-right p-3 text-matrix-text-secondary font-mono text-sm">
                    Price
                  </th>
                  <th className="text-right p-3 text-matrix-text-secondary font-mono text-sm">
                    P&L
                  </th>
                </tr>
              </thead>
              <tbody>
                {trading.tradeHistory.slice(0, 20).map((trade, index) => (
                  <tr
                    key={index}
                    className="border-b border-matrix-border-tertiary hover:bg-matrix-bg-accent"
                  >
                    <td className="p-3 text-matrix-text-secondary font-mono text-sm">
                      {new Date(trade.timestamp).toLocaleTimeString()}
                    </td>
                    <td className="p-3 text-matrix-text-primary font-mono text-sm truncate max-w-xs">
                      {trade.marketId?.substring(0, 12) || 'N/A'}...
                    </td>
                    <td
                      className={cn(
                        'p-3 font-mono text-sm',
                        trade.type === 'buy' ? 'text-matrix-success' : 'text-matrix-error'
                      )}
                    >
                      {trade.type?.toUpperCase()}
                    </td>
                    <td className="p-3 text-right text-matrix-text-primary font-mono text-sm">
                      {(trade.amount || 0).toFixed(2)}
                    </td>
                    <td className="p-3 text-right text-matrix-text-primary font-mono text-sm">
                      ${(trade.price * 100).toFixed(1)}¢
                    </td>
                    <td
                      className={cn(
                        'p-3 text-right font-mono text-sm',
                        (trade.pnl || 0) >= 0 ? 'text-matrix-success' : 'text-matrix-error'
                      )}
                    >
                      {typeof trade.pnl === 'number' ? formatCurrency(trade.pnl) : '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </MatrixCard>
    </div>
  )
}

function cn(...classes: (string | boolean | undefined)[]) {
  return classes.filter(Boolean).join(' ')
}
