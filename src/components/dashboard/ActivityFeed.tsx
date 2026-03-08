import React from 'react'
import { useAppStore } from '@/stores/appStore'
import { MatrixCard } from '@/components/ui/MatrixCard'
import { cn } from '@/utils/cn'

export const ActivityFeed: React.FC = () => {
  const { ui } = useAppStore()

  const getActivityColor = (type: string) => {
    switch (type) {
      case 'error':
        return 'border-matrix-error bg-matrix-error/10'
      case 'bet':
        return 'border-matrix-success bg-matrix-success/10'
      case 'sell':
        return 'border-matrix-warning bg-matrix-warning/10'
      default:
        return 'border-matrix-border-primary bg-matrix-bg-tertiary'
    }
  }

  const getActivityIcon = (type: string) => {
    switch (type) {
      case 'error':
        return '❌'
      case 'bet':
        return '💰'
      case 'sell':
        return '💸'
      case 'scan':
        return '🔍'
      case 'analysis':
        return '🤖'
      default:
        return 'ℹ️'
    }
  }

  return (
    <MatrixCard title="ACTIVITY LOG">
      <div className="max-h-96 overflow-y-auto space-y-2">
        {ui.notifications.length === 0 ? (
          <div className="text-center py-8 text-matrix-text-secondary">
            暂无活动记录
          </div>
        ) : (
          ui.notifications.slice(0, 50).map((notification) => (
            <div
              key={notification.id}
              className={cn(
                'p-3 border-l-2 rounded',
                getActivityColor(notification.type)
              )}
            >
              <div className="flex justify-between items-start mb-1">
                <span className="text-xs font-bold font-mono">
                  {getActivityIcon(notification.type)} {notification.type.toUpperCase()}
                </span>
                <span className="text-xs text-matrix-text-secondary font-mono">
                  {new Date().toLocaleTimeString()}
                </span>
              </div>
              <div className="text-sm text-matrix-text-primary font-mono">
                {notification.message}
              </div>
            </div>
          ))
        )}
      </div>
    </MatrixCard>
  )
}