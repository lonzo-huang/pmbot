import React from 'react'
import { useAppStore } from '@/stores/appStore'
import { cn } from '@/utils/cn'
import { MatrixButton } from '@/components/ui/MatrixButton'

export const Header: React.FC = () => {
  const { ui, trading, setTradingActive, addNotification } = useAppStore()

  const toggleTrading = () => {
    const newState = !trading.isActive
    setTradingActive(newState)
    addNotification(
      newState ? '交易已启动' : '交易已停止',
      newState ? 'success' : 'info'
    )
  }

  return (
    <header className="h-16 border-b border-matrix-border-tertiary bg-matrix-bg-secondary/50 backdrop-blur flex items-center justify-between px-6">
      {/* Left - Status Indicators */}
      <div className="flex items-center space-x-4">
        <div className="flex items-center space-x-2">
          <div
            className={cn(
              'w-2 h-2 rounded-full',
              ui.connectionStatus === 'online' ? 'bg-matrix-success' : 'bg-matrix-error'
            )}
          />
          <span className="text-xs text-matrix-text-secondary font-mono">
            {ui.connectionStatus?.toUpperCase() || 'OFFLINE'}
          </span>
        </div>

        <div className="flex items-center space-x-2">
          <div
            className={cn(
              'w-2 h-2 rounded-full',
              trading.isActive ? 'bg-matrix-success animate-pulse' : 'bg-matrix-warning'
            )}
          />
          <span className="text-xs text-matrix-text-secondary font-mono">
            {trading.isActive ? 'TRADING ACTIVE' : 'TRADING PAUSED'}
          </span>
        </div>
      </div>

      {/* Center - Date/Time */}
      <div className="text-center hidden md:block">
        <h2 className="text-sm text-matrix-text-primary font-mono">
          {new Date().toLocaleDateString('en-US', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric',
          })}
        </h2>
        <p className="text-xs text-matrix-text-secondary font-mono">
          {new Date().toLocaleTimeString()}
        </p>
      </div>

      {/* Right - Actions */}
      <div className="flex items-center space-x-3">
        <MatrixButton
          size="sm"
          variant={trading.isActive ? 'danger' : 'primary'}
          onClick={toggleTrading}
        >
          {trading.isActive ? 'STOP' : 'START'}
        </MatrixButton>
      </div>
    </header>
  )
}