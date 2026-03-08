import React from 'react'
import { cn } from '@/utils/cn'

interface MatrixLoadingProps {
  size?: 'sm' | 'md' | 'lg'
  text?: string
  className?: string
  fullScreen?: boolean
}

export const MatrixLoading: React.FC<MatrixLoadingProps> = ({
  size = 'md',
  text = 'LOADING...',
  className,
  fullScreen = false,
}) => {
  const sizeClasses = {
    sm: 'w-4 h-4 border-2',
    md: 'w-8 h-8 border-3',
    lg: 'w-12 h-12 border-4',
  }

  const content = (
    <div className={cn('flex flex-col items-center justify-center', className)}>
      <div
        className={cn(
          'border-matrix-border-tertiary border-t-matrix-text-primary rounded-full animate-spin',
          sizeClasses[size]
        )}
        style={{
          boxShadow: '0 0 10px rgba(0, 255, 0, 0.3)',
        }}
      />
      {text && (
        <p className="mt-3 text-xs text-matrix-text-secondary font-mono animate-pulse">
          {text}
        </p>
      )}
    </div>
  )

  if (fullScreen) {
    return (
      <div className="fixed inset-0 bg-matrix-bg-primary z-50 flex items-center justify-center">
        {content}
      </div>
    )
  }

  return content
}