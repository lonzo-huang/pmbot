import React from 'react'
import { MatrixCard } from '@/components/ui/MatrixCard'
import { MatrixButton } from '@/components/ui/MatrixButton'
import { cn } from '@/utils/cn'
// ✅ 架构核心：从 Store 获取状态
import { useAppStore } from '@/stores/appStore'
import { strategyManager } from '@/services/strategies/StrategyService'

interface StrategyInfo {
  name: string
  enabled: boolean
  description: string
  minConfidence: number
  maxPositionSize: number
  cooldownMs: number
}

export const StrategyConfig: React.FC = () => {
  // ✅ 从 Store 获取策略状态（与 MarketsView 共享）
  const { strategy, setStrategyRunning } = useAppStore()
  const [strategies, setStrategies] = React.useState<StrategyInfo[]>([])

  // ✅ 使用 Store 状态代替本地 state
  const { isRunning } = strategy

  React.useEffect(() => {
    loadStrategies()
  }, [])

  const loadStrategies = () => {
    const strategyList = strategyManager.getStrategies()
    setStrategies(strategyList.map(s => ({
      name: s.name,
      enabled: s.enabled,
      description: getStrategyDescription(s.name),
      minConfidence: s.config.minConfidence,
      maxPositionSize: s.config.maxPositionSize,
      cooldownMs: s.config.cooldownMs,
    })))
  }

  const toggleStrategy = (name: string) => {
    const strategy = strategies.find(s => s.name === name)
    if (strategy?.enabled) {
      strategyManager.disableStrategy(name)
    } else {
      strategyManager.enableStrategy(name)
    }
    loadStrategies()
  }

  // ✅ 架构核心：调用 Store action
  const toggleEngine = () => {
    setStrategyRunning(!isRunning)
  }

  return (
    <MatrixCard
      title="🤖 Strategy Configuration"
      subtitle="Configure automated trading strategies"
    >
      <div className="space-y-4">
        {/* Engine Status */}
        <div className="flex items-center justify-between p-4 border border-matrix-border-tertiary rounded bg-matrix-bg-tertiary">
          <div>
            <div className="text-sm text-matrix-text-primary font-mono mb-1">
              Strategy Engine
            </div>
            <div className="text-xs text-matrix-text-secondary font-mono">
              {isRunning ? 'Running' : 'Stopped'}
            </div>
          </div>
          <MatrixButton
            variant={isRunning ? 'success' : 'primary'}
            onClick={toggleEngine}
          >
            {isRunning ? '⏹️ Stop Engine' : '▶️ Start Engine'}
          </MatrixButton>
        </div>

        {/* Strategy List */}
        <div className="space-y-2">
          {strategies.map((strategy) => (
            <div
              key={strategy.name}
              className={cn(
                'p-4 border rounded transition-all',
                strategy.enabled
                  ? 'border-matrix-success bg-matrix-success/5'
                  : 'border-matrix-border-tertiary bg-matrix-bg-tertiary'
              )}
            >
              <div className="flex items-center justify-between mb-2">
                <div>
                  <div className="text-sm text-matrix-text-primary font-mono">
                    {strategy.name}
                  </div>
                  <div className="text-xs text-matrix-text-secondary font-mono mt-1">
                    {strategy.description}
                  </div>
                </div>
                <button
                  onClick={() => toggleStrategy(strategy.name)}
                  className={cn(
                    'px-3 py-1.5 rounded text-xs font-mono transition-all',
                    strategy.enabled
                      ? 'bg-matrix-success text-black'
                      : 'bg-matrix-bg-accent text-matrix-text-secondary'
                  )}
                >
                  {strategy.enabled ? '● ON' : '○ OFF'}
                </button>
              </div>

              <div className="grid grid-cols-3 gap-2 text-xs font-mono mt-3">
                <div>
                  <span className="text-matrix-text-muted">Min Confidence:</span>
                  <span className="text-matrix-text-primary ml-2">
                    {(strategy.minConfidence * 100).toFixed(0)}%
                  </span>
                </div>
                <div>
                  <span className="text-matrix-text-muted">Max Position:</span>
                  <span className="text-matrix-text-primary ml-2">
                    ${strategy.maxPositionSize}
                  </span>
                </div>
                <div>
                  <span className="text-matrix-text-muted">Cooldown:</span>
                  <span className="text-matrix-text-primary ml-2">
                    {strategy.cooldownMs / 1000}s
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Info */}
        <div className="p-3 border border-matrix-info/30 rounded bg-matrix-info/10">
          <div className="text-xs text-matrix-info font-mono">
            💡 Strategies analyze real-time order book data and generate trading signals.
            Enable strategies and start the engine to begin automatic analysis.
          </div>
        </div>
      </div>
    </MatrixCard>
  )
}

function getStrategyDescription(name: string): string {
  const descriptions: Record<string, string> = {
    'Arbitrage': 'Exploits price differences between YES/NO shares',
    'OrderBookImbalance': 'Trades based on buy/sell pressure imbalance',
    'SpreadCapture': 'Profits from wide bid-ask spreads',
    'MeanReversion': 'Trades when price deviates from average',
    'Momentum': 'Follows price trend momentum',
  }
  return descriptions[name] || 'Unknown strategy'
}

export default StrategyConfig