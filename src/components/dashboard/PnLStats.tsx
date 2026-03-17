import React from 'react'
import { useAppStore } from '@/stores/appStore'
import { MatrixCard } from '@/components/ui/MatrixCard'
import { MatrixButton } from '@/components/ui/MatrixButton'
import { formatCurrency, formatPercent } from '@/utils/formatting'
import { cn } from '@/utils/cn'

export const PnLStats: React.FC = () => {
  const { positions, trading, clearTradeStats } = useAppStore()

  const closedTrades = trading.tradeHistory?.filter(t => t.type === 'sell' && typeof t.pnl === 'number') || []
  const totalTrades = closedTrades.length
  const winningTrades = closedTrades.filter(t => (t.pnl || 0) > 0).length
  const winRate = totalTrades > 0 ? (winningTrades / totalTrades) * 100 : 0

  const winningPnL = closedTrades
    .filter(t => (t.pnl || 0) > 0)
    .reduce((sum, t) => sum + (t.pnl || 0), 0)
  const losingPnL = closedTrades
    .filter(t => (t.pnl || 0) <= 0)
    .reduce((sum, t) => sum + (t.pnl || 0), 0)

  const avgWin = winningTrades > 0 ? winningPnL / winningTrades : 0
  const avgLoss = (totalTrades - winningTrades) > 0 ? losingPnL / (totalTrades - winningTrades) : 0
  
  // ✅ 新增：计算盈亏比 (Risk/Reward Ratio)
  const riskRewardRatio = Math.abs(avgLoss) > 0.001 
    ? Math.abs(avgWin / avgLoss) 
    : (avgWin > 0 ? Infinity : 0)

  return (
    <MatrixCard 
      title="💰 PnL 统计" 
      subtitle="交易盈亏统计分析"
      headerExtra={
        <MatrixButton 
          variant="danger" 
          size="sm"
          disabled={totalTrades === 0}
          onClick={() => {
            if (confirm('确定要清除所有交易统计吗？此操作不可恢复。')) {
              clearTradeStats()
            }
          }}
        >
          🗑️ 清除统计
        </MatrixButton>
      }
    >
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
          <div className="text-xs text-matrix-text-secondary font-mono mb-1">盈亏比 (R/R)</div>
          <div className={cn(
            'text-lg font-bold font-mono',
            riskRewardRatio >= 2 ? 'text-matrix-success' : 
              riskRewardRatio >= 1.5 ? 'text-matrix-warning' : 
                riskRewardRatio > 0 ? 'text-matrix-error' : 'text-matrix-text-muted'
          )}>
            {riskRewardRatio === Infinity ? '∞' : riskRewardRatio.toFixed(2)}
          </div>
          <div className="text-xs text-matrix-text-muted font-mono mt-1">
            {riskRewardRatio >= 2 ? '优秀' : riskRewardRatio >= 1.5 ? '一般' : riskRewardRatio > 0 ? '偏低' : '—'}
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
