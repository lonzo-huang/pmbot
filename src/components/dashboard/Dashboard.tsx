import React from 'react'
import { useAppStore } from '@/stores/appStore'
import { MatrixCard } from '@/components/ui/MatrixCard'
import { MatrixButton } from '@/components/ui/MatrixButton'
import { PositionTable } from './PositionTable'
import { ActivityFeed } from './ActivityFeed'
import { PnLStats } from './PnLStats'
import { cn } from '@/utils/cn'
import { formatCurrency } from '@/utils/formatting'

export const Dashboard: React.FC = () => {
  const {
    wallet,
    positions,
    trading,
    settings,
    setTradingActive,
    addNotification,
  } = useAppStore()

  const toggleTrading = () => {
    const newState = !trading.isActive
    setTradingActive(newState)
    addNotification(
      newState ? '交易已启动' : '交易已停止',
      newState ? 'success' : 'info'
    )
  }

  return (
    <div className="space-y-6">
      {/* Top Stats Row */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {/* Wallet Card */}
        <MatrixCard title="WALLET" glow={wallet.isConnected}>
          <div className="space-y-2 font-mono">
            <div className="flex justify-between">
              <span className="text-matrix-text-secondary">Address:</span>
              <span className="text-matrix-text-primary">
                {wallet.address
                  ? `${wallet.address.slice(0, 6)}...${wallet.address.slice(-4)}`
                  : 'Not Connected'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-matrix-text-secondary">Balance:</span>
              <span className="text-matrix-text-primary">
                ${(wallet.balance ?? 0).toFixed(2)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-matrix-text-secondary">Network:</span>
              <span className="text-matrix-text-primary">Polygon</span>
            </div>
          </div>
        </MatrixCard>

        {/* Trading Status Card */}
        <MatrixCard title="TRADING" glow={trading.isActive}>
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <span className="text-matrix-text-secondary font-mono">Status:</span>
              <span
                className={cn(
                  'font-mono',
                  trading.isActive ? 'text-matrix-success' : 'text-matrix-error'
                )}
              >
                {trading.isActive ? 'ACTIVE' : 'STOPPED'}
              </span>
            </div>
            <MatrixButton
              variant={trading.isActive ? 'danger' : 'primary'}
              onClick={toggleTrading}
            >
              {trading.isActive ? 'STOP TRADING' : 'START TRADING'}
            </MatrixButton>
            <div className="text-xs text-matrix-text-secondary font-mono">
              纸面交易：{settings.paperTradingMode ? 'ON' : 'OFF'}
            </div>
          </div>
        </MatrixCard>

        {/* Positions Card */}
        <MatrixCard title="POSITIONS">
          <div className="space-y-2 font-mono">
            <div className="flex justify-between">
              <span className="text-matrix-text-secondary">Active:</span>
              <span className="text-matrix-text-primary">
                {positions.active?.length ?? 0}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-matrix-text-secondary">Total P&L:</span>
              <span
                className={cn(
                  (positions.pnl?.total ?? 0) >= 0 ? 'text-matrix-success' : 'text-matrix-error'
                )}
              >
                ${(positions.pnl?.total ?? 0).toFixed(2)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-matrix-text-secondary">Unrealized:</span>
              <span
                className={cn(
                  (positions.pnl?.unrealized ?? 0) >= 0 ? 'text-matrix-success' : 'text-matrix-error'
                )}
              >
                ${(positions.pnl?.unrealized ?? 0).toFixed(2)}
              </span>
            </div>
          </div>
        </MatrixCard>

        {/* Strategy Config Card */}
        <MatrixCard title="STRATEGY">
          <div className="grid grid-cols-2 gap-4 font-mono">
            <div>
              <div className="text-matrix-text-secondary text-xs">Max Bet %</div>
              <div className="text-matrix-text-primary text-xl">
                {settings.maxBetPercent ?? 5}%
              </div>
            </div>
            <div>
              <div className="text-matrix-text-secondary text-xs">Stop Loss</div>
              <div className="text-matrix-error text-xl">
                {settings.stopLossPercent ?? 15}%
              </div>
            </div>
            <div>
              <div className="text-matrix-text-secondary text-xs">Take Profit</div>
              <div className="text-matrix-success text-xl">
                {settings.takeProfitPercent ?? 30}%
              </div>
            </div>
            <div>
              <div className="text-matrix-text-secondary text-xs">Daily Limit</div>
              <div className="text-matrix-error text-xl">
                ${settings.maxDailyLoss ?? 50}
              </div>
            </div>
          </div>
        </MatrixCard>
      </div>

      {/* PnL Stats - 新增 */}
      <PnLStats />

      {/* Positions Table */}
      <PositionTable
        positions={positions.active ?? []}
        onSell={(tokenId) => addNotification(`卖出：${tokenId}`, 'info')}
      />

      {/* Activity Feed */}
      <ActivityFeed />
    </div>
  )
}