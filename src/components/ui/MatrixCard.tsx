import React from 'react'

interface MatrixCardProps {
  title?: string
  glow?: boolean
  error?: boolean
  children: React.ReactNode
  className?: string
}

export const MatrixCard: React.FC<MatrixCardProps> = ({
  title,
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
        <h3 className="text-green-400 font-bold mb-4 font-mono">
          {title}
        </h3>
      )}
      {children}
    </div>
  )
}