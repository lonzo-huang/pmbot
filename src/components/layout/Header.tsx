import React from 'react'
import { useAppStore } from '@/stores/appStore'
import { cn } from '@/utils/cn'
import { MatrixButton } from '@/components/ui/MatrixButton'
import { realtimeService } from '@/services/realtime/RealtimeService'

export const Header: React.FC = () => {
  const { trading, setTradingActive, addNotification, positions } = useAppStore()
  const [wsStatus, setWsStatus] = React.useState(realtimeService.getStatus())
  const [now, setNow] = React.useState(Date.now())

  const toggleTrading = () => {
    const newState = !trading.isActive
    setTradingActive(newState)
    addNotification(
      newState ? '交易已启动' : '交易已停止',
      newState ? 'success' : 'info'
    )
  }

  React.useEffect(() => {
    const unsub = realtimeService.onConnectionChange((status) => setWsStatus(status))
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => {
      unsub()
      clearInterval(timer)
    }
  }, [])

  const firstPosition = positions.active?.[0]
  const lastUpdate = firstPosition ? realtimeService.getLastUpdate(firstPosition.tokenId) : undefined
  const ageSec = lastUpdate ? Math.max(0, Math.round((now - lastUpdate) / 1000)) : null
  const dataLabel =
    !firstPosition ? 'DATA N/A' :
    ageSec == null ? 'DATA NO BOOK' :
    ageSec <= 15 ? `DATA OK ${ageSec}s` :
    `DATA STALE ${ageSec}s`

  return (
    // ✅ 关键：添加正确的背景和边框
    <header className="h-16 border-b border-matrix-border-tertiary bg-matrix-bg-secondary/80 backdrop-blur flex items-center justify-between px-6" style={{ zIndex: 20 }}>
      {/* Left - Status Indicators */}
      <div className="flex items-center space-x-4">
        <div className="flex items-center space-x-2">
          <div className={cn('w-2 h-2 rounded-full', wsStatus === 'connected' ? 'bg-matrix-success animate-pulse' : 'bg-matrix-error')} />
          <span className="text-xs text-matrix-text-secondary font-mono">
            {wsStatus === 'connected' ? 'ONLINE' : 'OFFLINE'}
          </span>
        </div>

        <div className="flex items-center space-x-2">
          <div className={cn('w-2 h-2 rounded-full', trading.isActive ? 'bg-matrix-success animate-pulse' : 'bg-matrix-warning')} />
          <span className="text-xs text-matrix-text-secondary font-mono">
            {trading.isActive ? 'TRADING ACTIVE' : 'TRADING PAUSED'}
          </span>
        </div>

        <div className="flex items-center space-x-2">
          <div className={cn('w-2 h-2 rounded-full', dataLabel.includes('OK') ? 'bg-matrix-success' : 'bg-matrix-warning')} />
          <span className="text-xs text-matrix-text-secondary font-mono">
            {dataLabel}
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
          {new Date(now).toLocaleTimeString()}
        </p>
      </div>

      {/* Right - Actions */}
      <div className="flex items-center space-x-3">
        <MatrixButton
          size="sm"
          variant={trading.isActive ? 'danger' : 'success'}
          onClick={toggleTrading}
        >
          {trading.isActive ? 'STOP' : 'START'}
        </MatrixButton>
      </div>
    </header>
  )
}
