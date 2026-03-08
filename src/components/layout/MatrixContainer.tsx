import React, { useEffect, useState } from 'react'
import { cn } from '@/utils/cn'

interface MatrixContainerProps {
  children: React.ReactNode
  className?: string
  showRain?: boolean
}

export const MatrixContainer: React.FC<MatrixContainerProps> = ({
  children,
  className,
  showRain = true,
}) => {
  const [columns, setColumns] = useState<string[]>([])

  useEffect(() => {
    const chars = '01アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワヲン'
    const columnCount = Math.floor(window.innerWidth / 20)

    const newColumns = Array.from({ length: columnCount }, (_, i) => {
      const char = chars[Math.floor(Math.random() * chars.length)]
      const delay = Math.random() * 10
      const duration = 8 + Math.random() * 4
      return `${char}|${delay}|${duration}`
    })

    setColumns(newColumns)

    const handleResize = () => {
      const newColumnCount = Math.floor(window.innerWidth / 20)
      if (newColumnCount !== columns.length) {
        setColumns(
          Array.from({ length: newColumnCount }, (_, i) => {
            const char = chars[Math.floor(Math.random() * chars.length)]
            const delay = Math.random() * 10
            const duration = 8 + Math.random() * 4
            return `${char}|${delay}|${duration}`
          })
        )
      }
    }

    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [columns.length])

  return (
    <div className={cn('relative min-h-screen bg-matrix-bg-primary text-matrix-text-primary font-mono', className)}>
      {/* Matrix Rain Background */}
      {showRain && (
        <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
          {columns.map((column, index) => {
            const [char, delay, duration] = column.split('|')
            return (
              <span
                key={index}
                className="absolute text-matrix-text-tertiary opacity-20 text-sm"
                style={{
                  left: `${(index / columns.length) * 100}%`,
                  top: '-100px',
                  animation: `matrix-rain ${duration}s linear infinite`,
                  animationDelay: `${delay}s`,
                }}
              >
                {Array.from({ length: 50 }, (_, i) => (
                  <div key={i}>{char}</div>
                ))}
              </span>
            )
          })}
        </div>
      )}

      {/* Content */}
      <div className="relative z-10">
        {children}
      </div>
    </div>
  )
}