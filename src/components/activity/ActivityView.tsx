import React from 'react'
import { useAppStore } from '@/stores/appStore'
import { MatrixCard } from '@/components/ui/MatrixCard'
import { cn } from '@/utils/cn'

export const ActivityView: React.FC = () => {
  const { trading } = useAppStore()
  const [filter, setFilter] = React.useState<string>('all')
  const [searchTerm, setSearchTerm] = React.useState('')
  
  const getActivityColor = (type: string) => {
    switch (type) {
      case 'error':
        return 'border-matrix-error bg-matrix-error/10 text-matrix-error'
      case 'trade':
        return 'border-matrix-success bg-matrix-success/10 text-matrix-success'
      case 'sell':
        return 'border-matrix-warning bg-matrix-warning/10 text-matrix-warning'
      case 'analysis':
        return 'border-matrix-info bg-matrix-info/10 text-matrix-info'
      case 'signal':
        return 'border-matrix-primary bg-matrix-primary/10 text-matrix-primary'
      case 'scan':
        return 'border-matrix-text-primary bg-matrix-bg-accent text-matrix-text-primary'
      default:
        return 'border-matrix-border-primary bg-matrix-bg-tertiary text-matrix-text-secondary'
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
  
  const filteredActivities = trading.activityLogs.filter((item) => {
    const matchesFilter = filter === 'all' || item.type === filter
    const matchesSearch = item.message.toLowerCase().includes(searchTerm.toLowerCase())
    return matchesFilter && matchesSearch
  })
  
  return (
    <div className="space-y-6">
      <MatrixCard
        title="ACTIVITY LOG"
        subtitle="Complete system activity history"
        headerExtra={
          <div className="text-[10px] text-matrix-text-secondary font-mono text-right">
            <div>LOGS: {trading.activityLogs.length}</div>
            <div>
              LAST: {trading.activityLogs[0]?.timestamp ? new Date(trading.activityLogs[0].timestamp).toLocaleTimeString() : 'N/A'}
            </div>
          </div>
        }
      >
        {/* Filters */}
        <div className="flex gap-4 mb-6">
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="bg-matrix-bg-tertiary border border-matrix-border-tertiary rounded px-3 py-2 text-sm font-mono text-matrix-text-primary"
          >
            <option value="all">All Types</option>
            <option value="signal">Signals</option>
            <option value="trade">Trades</option>
            <option value="sell">Sells</option>
            <option value="analysis">Analysis</option>
            <option value="error">Errors</option>
          </select>
          
          <input
            type="text"
            placeholder="Search activities..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="flex-1 bg-matrix-bg-tertiary border border-matrix-border-tertiary rounded px-3 py-2 text-sm font-mono text-matrix-text-primary"
          />
        </div>
        
        {/* Activity List */}
        <div className="max-h-[600px] overflow-y-auto space-y-2">
          {filteredActivities.length === 0 ? (
            <div className="text-center py-8 text-matrix-text-secondary font-mono">
              暂无活动记录
            </div>
          ) : (
            filteredActivities.slice(0, 100).map((activity) => (
              <div
                key={activity.id}
                className={cn(
                  'p-4 border-l-4 rounded transition-all hover:translate-x-1',
                  getActivityColor(activity.type)
                )}
              >
                <div className="flex justify-between items-start mb-2">
                  <span className="text-xs font-bold font-mono flex items-center gap-2">
                    <span>{getActivityIcon(activity.type)}</span>
                    {activity.type.toUpperCase()}
                  </span>
                  <span className="text-xs text-matrix-text-secondary font-mono">
                    {new Date(activity.timestamp).toLocaleTimeString()}
                  </span>
                </div>
                <div className="text-sm font-mono">{activity.message}</div>
                {activity.data && (
                  <details className="mt-2">
                    <summary className="text-xs text-matrix-text-secondary cursor-pointer font-mono">
                      Show Details
                    </summary>
                    <pre className="text-xs text-matrix-text-muted mt-2 overflow-x-auto bg-matrix-bg-primary p-2 rounded">
                      {JSON.stringify(activity.data, null, 2)}
                    </pre>
                  </details>
                )}
              </div>
            ))
          )}
        </div>
        
        {/* Stats */}
        <div className="mt-6 pt-4 border-t border-matrix-border-tertiary">
          <div className="grid grid-cols-4 gap-4 text-center">
            <div>
              <div className="text-2xl font-bold text-matrix-text-primary font-mono">
                {trading.activityLogs.filter((n) => n.type === 'trade').length}
              </div>
              <div className="text-xs text-matrix-text-secondary font-mono">TRADES</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-matrix-success font-mono">
                {trading.activityLogs.filter((n) => n.type === 'signal').length}
              </div>
              <div className="text-xs text-matrix-text-secondary font-mono">SIGNALS</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-matrix-error font-mono">
                {trading.activityLogs.filter((n) => n.type === 'error').length}
              </div>
              <div className="text-xs text-matrix-text-secondary font-mono">ERRORS</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-matrix-info font-mono">
                {trading.activityLogs.filter((n) => n.type === 'analysis').length}
              </div>
              <div className="text-xs text-matrix-text-secondary font-mono">ANALYSIS</div>
            </div>
          </div>
        </div>
      </MatrixCard>
    </div>
  )
}
