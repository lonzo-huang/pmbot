import React from 'react'

interface MatrixCardProps {
  title?: string
  subtitle?: string
  headerExtra?: React.ReactNode // ✅ 新增：支持标题右侧额外内容
  glow?: boolean
  error?: boolean
  children: React.ReactNode
  className?: string
}

export const MatrixCard: React.FC<MatrixCardProps> = ({
  title,
  subtitle,
  headerExtra,
  glow = false,
  error = false,
  children,
  className = ''
}) => {
  return (
    <div
      className={`
        bg-gray-900 border rounded-lg p-6
        ${glow ? 'animate-pulse' : ''}
        ${error ? 'border-red-500' : 'border-green-500'}
        ${className}
      `}
      style={{
        boxShadow: error 
          ? '0 0 10px #ff0040, 0 0 20px rgba(255, 0, 64, 0.4)' 
          : glow 
            ? '0 0 10px #00ff00, 0 0 20px rgba(0, 255, 0, 0.4)'
            : '0 4px 8px rgba(0, 255, 0, 0.2)'
      }}
    >
      {title && (
        <div className="flex justify-between items-center mb-4">
          <div>
            <h3 className="text-green-400 font-bold font-mono uppercase tracking-wider">
              {title}
            </h3>
            {subtitle && (
              <div className="text-xs text-matrix-text-secondary font-mono mt-1">
                {subtitle}
              </div>
            )}
          </div>
          {headerExtra && (
            <div className="flex-shrink-0">
              {headerExtra}
            </div>
          )}
        </div>
      )}
      {children}
    </div>
  )
}
