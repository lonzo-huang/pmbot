import React from 'react'
import { useAppStore } from '@/stores/appStore'
import { MatrixCard } from '@/components/ui/MatrixCard'
import { formatCurrency, formatPercent } from '@/utils/formatting'
import { cn } from '@/utils/cn'

export const PnLStats: React.FC = () => {
  const { positions, trading } = useAppStore()

  const totalTrades = trading.tradeHistory?.length || 0
  const winningTrades = trading.tradeHistory?.filter(t => (t.pnl || 0) > 0).length || 0
  const winRate = totalTrades > 0 ? (winningTrades / totalTrades) * 100 : 0

  const winningPnL = trading.tradeHistory
    ?.filter(t => (t.pnl || 0) > 0)
    .reduce((sum, t) => sum + (t.pnl || 0), 0) || 0
  const losingPnL = trading.tradeHistory
    ?.filter(t => (t.pnl || 0) <= 0)
    .reduce((sum, t) => sum + (t.pnl || 0), 0) || 0

  const avgWin = winningTrades > 0 ? winningPnL / winningTrades : 0
  const avgLoss = (totalTrades - winningTrades) > 0 ? losingPnL / (totalTrades - winningTrades) : 0

  return (
    <MatrixCard title="💰 PnL 统计" subtitle="交易盈亏统计分析">
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <div className="p-3 border border-matrix-border-tertiary rounded bg-matrix-bg-tertiary/50">
          <div className="text-xs text-matrix-text-secondary font-mono mb-1">总盈亏</div>
          <div className={cn(
            'text-lg font-bold font-mono',
            (positions.pnl?.total ?? 0) >= 0 ? 'text-matrix-success' : 'text-matrix-error'
          )}>
            {formatCurrency(positions.pnl?.total ?? 0)}
          </div>
        </div>

        <div className="p-3 border border-matrix-border-tertiary rounded bg-matrix-bg-tertiary/50">
          <div className="text-xs text-matrix-text-secondary font-mono mb-1">未实现盈亏</div>
          <div className={cn(
            'text-lg font-bold font-mono',
            (positions.pnl?.unrealized ?? 0) >= 0 ? 'text-matrix-success' : 'text-matrix-error'
          )}>
            {formatCurrency(positions.pnl?.unrealized ?? 0)}
          </div>
        </div>

        <div className="p-3 border border-matrix-border-tertiary rounded bg-matrix-bg-tertiary/50">
          <div className="text-xs text-matrix-text-secondary font-mono mb-1">胜率</div>
          <div className={cn(
            'text-lg font-bold font-mono',
            winRate >= 50 ? 'text-matrix-success' : 'text-matrix-warning'
          )}>
            {winRate.toFixed(1)}%
          </div>
        </div>

        <div className="p-3 border border-matrix-border-tertiary rounded bg-matrix-bg-tertiary/50">
          <div className="text-xs text-matrix-text-secondary font-mono mb-1">交易次数</div>
          <div className="text-lg font-bold font-mono text-matrix-text-primary">
            {totalTrades}
          </div>
        </div>

        <div className="p-3 border border-matrix-border-tertiary rounded bg-matrix-bg-tertiary/50">
          <div className="text-xs text-matrix-text-secondary font-mono mb-1">平均盈利</div>
          <div className="text-lg font-bold font-mono text-matrix-success">
            {formatCurrency(avgWin)}
          </div>
        </div>

        <div className="p-3 border border-matrix-border-tertiary rounded bg-matrix-bg-tertiary/50">
          <div className="text-xs text-matrix-text-secondary font-mono mb-1">平均亏损</div>
          <div className="text-lg font-bold font-mono text-matrix-error">
            {formatCurrency(avgLoss)}
          </div>
        </div>
      </div>

      {totalTrades === 0 && (
        <div className="text-center py-4 text-matrix-text-muted font-mono text-sm">
          暂无交易数据，开始交易后显示统计
        </div>
      )}
    </MatrixCard>
  )
}