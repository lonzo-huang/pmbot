import React from 'react'
import { useAppStore } from '@/stores/appStore'
import { MatrixCard } from '@/components/ui/MatrixCard'
import { cn } from '@/utils/cn'

export const ActivityFeed: React.FC = () => {
  const { trading } = useAppStore()

  const getActivityColor = (type: string) => {
    switch (type) {
      case 'error':
        return 'border-matrix-error bg-matrix-error/10'
      case 'trade':
        return 'border-matrix-success bg-matrix-success/10'
      case 'sell':
        return 'border-matrix-warning bg-matrix-warning/10'
      case 'signal':
        return 'border-matrix-primary bg-matrix-primary/10'
      default:
        return 'border-matrix-border-primary bg-matrix-bg-tertiary'
    }
  }

  const getActivityIcon = (type: string) => {
    switch (type) {
      case 'error':
        return '❌'
      case 'trade':
        return '💰'
      case 'sell':
        return '💸'
      case 'scan':
        return '🔍'
      case 'analysis':
        return '🤖'
      case 'signal':
        return '📡'
      default:
        return 'ℹ️'
    }
  }

  return (
    <MatrixCard title="ACTIVITY LOG">
      <div className="max-h-96 overflow-y-auto space-y-2">
        {trading.activityLogs.length === 0 ? (
          <div className="text-center py-8 text-matrix-text-secondary">
            暂无活动记录
          </div>
        ) : (
          trading.activityLogs.map((log) => (
            <div
              key={log.id}
              className={cn(
                'p-3 border-l-2 rounded',
                getActivityColor(log.type)
              )}
            >
              <div className="flex justify-between items-start mb-1">
                <span className="text-xs font-bold font-mono">
                  {getActivityIcon(log.type)} {log.type.toUpperCase()}
                </span>
                <span className="text-xs text-matrix-text-secondary font-mono">
                  {new Date(log.timestamp).toLocaleTimeString()}
                </span>
              </div>
              <div className="text-sm text-matrix-text-primary font-mono">
                {log.message}
              </div>
            </div>
          ))
        )}
      </div>
    </MatrixCard>
  )
}