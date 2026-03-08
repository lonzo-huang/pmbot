import React from 'react'
import { Position } from '@/types'
import { MatrixCard } from '@/components/ui/MatrixCard'
import { MatrixButton } from '@/components/ui/MatrixButton'
import { formatCurrency, formatPercent } from '@/utils/formatting'

interface PositionTableProps {
  positions: Position[]
  onSell: (tokenId: string) => void
}

export const PositionTable: React.FC<PositionTableProps> = ({
  positions,
  onSell,
}) => {
  if (positions.length === 0) {
    return (
      <MatrixCard title="ACTIVE POSITIONS">
        <div className="text-center py-8 text-matrix-text-secondary">
          暂无活跃持仓
        </div>
      </MatrixCard>
    )
  }

  return (
    <MatrixCard title="ACTIVE POSITIONS" glow={positions.length > 0}>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-matrix-border-tertiary">
              <th className="text-left p-3 text-matrix-text-secondary font-mono text-sm">
                Market
              </th>
              <th className="text-left p-3 text-matrix-text-secondary font-mono text-sm">
                Outcome
              </th>
              <th className="text-right p-3 text-matrix-text-secondary font-mono text-sm">
                Size
              </th>
              <th className="text-right p-3 text-matrix-text-secondary font-mono text-sm">
                Entry
              </th>
              <th className="text-right p-3 text-matrix-text-secondary font-mono text-sm">
                Current
              </th>
              <th className="text-right p-3 text-matrix-text-secondary font-mono text-sm">
                P&L
              </th>
              <th className="text-center p-3 text-matrix-text-secondary font-mono text-sm">
                Actions
              </th>
            </tr>
          </thead>
          <tbody>
            {positions.map((position) => (
              <tr
                key={position.tokenId}
                className="border-b border-matrix-border-tertiary hover:bg-matrix-bg-accent transition-colors"
              >
                <td className="p-3">
                  <div className="text-matrix-text-primary font-semibold text-sm max-w-xs truncate">
                    {position.marketQuestion}
                  </div>
                  <div className="text-matrix-text-muted text-xs font-mono">
                    {position.tokenId.substring(0, 8)}...
                  </div>
                </td>
                <td className="p-3">
                  <span className="px-2 py-1 bg-matrix-bg-accent border border-matrix-border-primary rounded text-xs font-mono">
                    {position.outcome}
                  </span>
                </td>
                <td className="p-3 text-right font-mono text-matrix-text-primary">
                  {position.size.toFixed(2)}
                </td>
                <td className="p-3 text-right font-mono text-matrix-text-primary">
                  ${(position.entryPrice * 100).toFixed(1)}¢
                </td>
                <td className="p-3 text-right font-mono text-matrix-text-primary">
                  ${(position.currentPrice * 100).toFixed(1)}¢
                </td>
                <td
                  className={`p-3 text-right font-mono ${
                    position.pnl.percent >= 0
                      ? 'text-matrix-success'
                      : 'text-matrix-error'
                  }`}
                >
                  {formatPercent(position.pnl.percent)}
                  <div className="text-xs text-matrix-text-secondary">
                    {formatCurrency(position.pnl.dollar)}
                  </div>
                </td>
                <td className="p-3 text-center">
                  <MatrixButton size="sm" variant="danger" onClick={() => onSell(position.tokenId)}>
                    SELL
                  </MatrixButton>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </MatrixCard>
  )
}