import { ActivityLog } from '@/types'

export class ActivityLogger {
  private logs: ActivityLog[] = []
  private maxLogs = 1000

  log(entry: Omit<ActivityLog, 'id' | 'timestamp'>): ActivityLog {
    const logEntry: ActivityLog = {
      id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
      timestamp: new Date(),
      ...entry,
    }

    this.logs.unshift(logEntry)

    // Keep only recent logs
    if (this.logs.length > this.maxLogs) {
      this.logs = this.logs.slice(0, this.maxLogs)
    }

    return logEntry
  }

  getLogs(limit: number = 100): ActivityLog[] {
    return this.logs.slice(0, limit)
  }

  clear(): void {
    this.logs = []
  }

  export(): string {
    return JSON.stringify(this.logs, null, 2)
  }
}

export const activityLogger = new ActivityLogger()