import React from 'react'
import { MatrixCard } from '@/components/ui/MatrixCard'
import { MatrixButton } from '@/components/ui/MatrixButton'
import { MatrixInput } from '@/components/ui/MatrixInput'

interface StrategyControlProps {
  strategyName: string
  enabled: boolean
  stats: {
    totalTrades: number
    winRate: number
    totalPnl: number
  }
  onToggle: (enabled: boolean) => void
  config: Record<string, any>
  onConfigChange: (key: string, value: any) => void
}

export const StrategyControl: React.FC<StrategyControlProps> = ({
  strategyName,
  enabled,
  stats,
  onToggle,
  config,
  onConfigChange,
}) => {
  return (
    <MatrixCard title={strategyName.toUpperCase()} glow={enabled}>
      <div className="space-y-4">
        {/* Status */}
        <div className="flex justify-between items-center">
          <span className="text-gray-400 font-mono">Status:</span>
          <span className={`font-mono ${enabled ? 'text-green-400' : 'text-red-400'}`}>
            {enabled ? 'ACTIVE' : 'STOPPED'}
          </span>
        </div>
        
        {/* Toggle */}
        <MatrixButton
          variant={enabled ? 'danger' : 'primary'}
          onClick={() => onToggle(!enabled)}
        >
          {enabled ? 'STOP STRATEGY' : 'START STRATEGY'}
        </MatrixButton>
        
        {/* Stats */}
        <div className="grid grid-cols-3 gap-4 pt-4 border-t border-green-900">
          <div>
            <div className="text-gray-500 text-xs font-mono">Trades</div>
            <div className="text-green-400 text-xl font-mono">{stats.totalTrades}</div>
          </div>
          <div>
            <div className="text-gray-500 text-xs font-mono">Win Rate</div>
            <div className="text-green-400 text-xl font-mono">{stats.winRate.toFixed(1)}%</div>
          </div>
          <div>
            <div className="text-gray-500 text-xs font-mono">P&L</div>
            <div className={`text-xl font-mono ${stats.totalPnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
              ${stats.totalPnl.toFixed(2)}
            </div>
          </div>
        </div>
        
        {/* Config */}
        <div className="pt-4 border-t border-green-900">
          <div className="text-gray-400 font-mono text-sm mb-3">Configuration</div>
          <div className="space-y-2">
            {Object.entries(config).slice(0, 5).map(([key, value]) => (
              <div key={key} className="flex justify-between items-center">
                <span className="text-gray-500 text-xs font-mono">{key}</span>
                <MatrixInput
                  value={String(value)}
                  onChange={(v) => onConfigChange(key, v)}
                  className="w-24 text-xs"
                />
              </div>
            ))}
          </div>
        </div>
      </div>
    </MatrixCard>
  )
}