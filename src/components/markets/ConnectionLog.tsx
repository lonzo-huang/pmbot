import React, { useRef, useEffect } from 'react'
import { MatrixCard } from '@/components/ui/MatrixCard'
import { cn } from '@/utils/cn'

interface ConnectionLogProps {
  logs: string[]
}

export const ConnectionLog: React.FC<ConnectionLogProps> = ({ logs }) => {
  const logRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight
    }
  }, [logs])

  return (
    <MatrixCard title="CONNECTION LOG" className="h-full flex flex-col">
      <div
        ref={logRef}
        className="flex-1 overflow-y-auto pr-2 font-mono text-xs"
      >
        {logs.length === 0 ? (
          <div className="text-matrix-text-muted text-center py-4">
            Waiting for connection logs...
          </div>
        ) : (
          logs.slice(-100).map((log, index) => (
            <div
              key={index}
              className={cn(
                'py-0.5',
                log.includes('✅') ? 'text-matrix-success' :
                log.includes('❌') ? 'text-matrix-error' :
                log.includes('⚠️') ? 'text-matrix-warning' :
                log.includes('📊') ? 'text-matrix-info' :
                log.includes('🔍') ? 'text-matrix-info' :
                'text-matrix-text-secondary'
              )}
            >
              {log}
            </div>
          ))
        )}
      </div>
    </MatrixCard>
  )
}