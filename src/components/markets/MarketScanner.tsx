import React from 'react'
import { MatrixCard } from '@/components/ui/MatrixCard'
import { MatrixButton } from '@/components/ui/MatrixButton'
import { cn } from '@/utils/cn'
import { realtimeService } from '@/services/realtime/RealtimeService'

interface MarketScannerProps {
  scanStatus: 'idle' | 'scanning' | 'connected' | 'error'
  wsStatus: string
  messageCount: number
  strategyEnabled: boolean
  tradeSignalsCount: number
  onToggleStrategy: () => void
  onShowMarketSelector: () => void
  onScan: () => void
  onShowPopularMarkets: () => void
}

export const MarketScanner: React.FC<MarketScannerProps> = ({
  scanStatus,
  wsStatus,
  messageCount,
  strategyEnabled,
  tradeSignalsCount,
  onToggleStrategy,
  onShowMarketSelector,
  onScan,
  onShowPopularMarkets,
}) => {
  return (
    <MatrixCard title="MARKET SCANNER" subtitle="Real-time Polymarket data via WebSocket">
      <div className="flex justify-between items-center mb-3">
        <div className="text-sm text-matrix-text-secondary font-mono">
          Status:
          <span className={cn(
            'ml-2',
            scanStatus === 'idle' ? 'text-matrix-text-muted' :
            scanStatus === 'scanning' ? 'text-matrix-warning' :
            scanStatus === 'connected' ? 'text-matrix-success' :
            'text-matrix-error'
          )}>
            {scanStatus === 'idle' && 'Idle'}
            {scanStatus === 'scanning' && 'Connecting...'}
            {scanStatus === 'connected' && '● Connected'}
            {scanStatus === 'error' && 'Error'}
          </span>
        </div>
        <div className="flex gap-2">
          <MatrixButton
            variant="secondary"
            onClick={onShowPopularMarkets}
          >
            🔥 Popular Markets
          </MatrixButton>
          <MatrixButton
            variant={strategyEnabled ? 'success' : 'secondary'}
            onClick={onToggleStrategy}
          >
            {strategyEnabled ? '🤖 Strategy Running' : '🤖 Start Strategy'}
          </MatrixButton>
          <MatrixButton variant="secondary" onClick={onShowMarketSelector}>
            📋 Select Markets
          </MatrixButton>
          <MatrixButton
            onClick={onScan}
            disabled={scanStatus === 'scanning'}
            variant={scanStatus === 'connected' ? 'success' : 'primary'}
          >
            {scanStatus === 'connected' ? '● CONNECTED' : 'CONNECT'}
          </MatrixButton>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-3">
        <div className="p-2 border border-matrix-border-tertiary rounded bg-matrix-bg-tertiary/50">
          <div className="text-xs text-matrix-text-secondary font-mono">WebSocket Status</div>
          <div className={cn(
            'text-base font-bold font-mono',
            wsStatus === 'connected' ? 'text-matrix-success' : 'text-matrix-error'
          )}>
            {wsStatus.toUpperCase()}
          </div>
        </div>
        <div className="p-2 border border-matrix-border-tertiary rounded bg-matrix-bg-tertiary/50">
          <div className="text-xs text-matrix-text-secondary font-mono">Subscribed Assets</div>
          <div className="text-base font-bold font-mono text-matrix-text-primary">
            {realtimeService.getSubscribedAssets().length}
          </div>
        </div>
        <div className="p-2 border border-matrix-border-tertiary rounded bg-matrix-bg-tertiary/50">
          <div className="text-xs text-matrix-text-secondary font-mono">Messages Received</div>
          <div className="text-base font-bold font-mono text-matrix-info">
            {messageCount}
          </div>
        </div>
        <div className="p-2 border border-matrix-border-tertiary rounded bg-matrix-bg-tertiary/50">
          <div className="text-xs text-matrix-text-secondary font-mono">Strategy Signals</div>
          <div className={cn(
            'text-base font-bold font-mono',
            strategyEnabled ? 'text-matrix-success' : 'text-matrix-text-muted'
          )}>
            {tradeSignalsCount}
          </div>
        </div>
      </div>
    </MatrixCard>
  )
}