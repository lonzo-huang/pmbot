import React from 'react'
import { useAppStore } from '@/stores/appStore'
import { MatrixCard } from '@/components/ui/MatrixCard'
import { cn } from '@/utils/cn'
import { formatTimestamp } from '@/utils/formatting'

interface ActivityItem {
  id: string
  timestamp: Date
  type: 'scan' | 'bet' | 'sell' | 'error' | 'info' | 'analysis'
  message: string
  data?: any
}

export const ActivityView: React.FC = () => {
  const { ui } = useAppStore()
  const [filter, setFilter] = React.useState<string>('all')
  const [searchTerm, setSearchTerm] = React.useState('')
  
  const getActivityColor = (type: string) => {
    switch (type) {
      case 'error':
        return 'border-matrix-error bg-matrix-error/10 text-matrix-error'
      case 'bet':
        return 'border-matrix-success bg-matrix-success/10 text-matrix-success'
      case 'sell':
        return 'border-matrix-warning bg-matrix-warning/10 text-matrix-warning'
      case 'analysis':
        return 'border-matrix-info bg-matrix-info/10 text-matrix-info'
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
  
  const filteredActivities = ui.notifications.filter((item) => {
    const matchesFilter = filter === 'all' || item.type === filter
    const matchesSearch = item.message.toLowerCase().includes(searchTerm.toLowerCase())
    return matchesFilter && matchesSearch
  })
  
  return (
    <div className="space-y-6">
      <MatrixCard title="ACTIVITY LOG" subtitle="Complete system activity history">
        {/* Filters */}
        <div className="flex gap-4 mb-6">
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="bg-matrix-bg-tertiary border border-matrix-border-tertiary rounded px-3 py-2 text-sm font-mono text-matrix-text-primary"
          >
            <option value="all">All Types</option>
            <option value="scan">Scans</option>
            <option value="bet">Bets</option>
            <option value="sell">Sells</option>
            <option value="analysis">Analysis</option>
            <option value="error">Errors</option>
            <option value="info">Info</option>
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
                    {formatTimestamp(new Date())}
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
                {ui.notifications.filter((n) => n.type === 'bet').length}
              </div>
              <div className="text-xs text-matrix-text-secondary font-mono">BETS</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-matrix-success font-mono">
                {ui.notifications.filter((n) => n.type === 'sell' && n.message.includes('profit')).length}
              </div>
              <div className="text-xs text-matrix-text-secondary font-mono">WINS</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-matrix-error font-mono">
                {ui.notifications.filter((n) => n.type === 'error').length}
              </div>
              <div className="text-xs text-matrix-text-secondary font-mono">ERRORS</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-matrix-info font-mono">
                {ui.notifications.filter((n) => n.type === 'analysis').length}
              </div>
              <div className="text-xs text-matrix-text-secondary font-mono">ANALYSIS</div>
            </div>
          </div>
        </div>
      </MatrixCard>
    </div>
  )
}