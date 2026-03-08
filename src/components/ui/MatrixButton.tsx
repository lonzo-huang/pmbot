import React from 'react'

interface MatrixButtonProps {
  variant?: 'primary' | 'secondary' | 'danger'
  size?: 'sm' | 'md' | 'lg'
  loading?: boolean
  disabled?: boolean
  onClick: () => void
  children: React.ReactNode
  className?: string
}

export const MatrixButton: React.FC<MatrixButtonProps> = ({
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled = false,
  onClick,
  children,
  className = ''
}) => {
  const baseClasses = "font-mono border rounded transition-all duration-300 font-bold"
  
  const sizeClasses = {
    sm: "px-3 py-1 text-sm",
    md: "px-4 py-2",
    lg: "px-6 py-3 text-lg"
  }
  
  const variantClasses = {
    primary: "bg-green-900 border-green-500 text-green-400 hover:bg-green-800 hover:shadow-lg hover:shadow-green-500/50",
    secondary: "bg-gray-800 border-gray-600 text-gray-400 hover:border-green-500",
    danger: "bg-red-900 border-red-500 text-red-400 hover:bg-red-800 hover:shadow-lg hover:shadow-red-500/50"
  }
  
  return (
    <button
      className={`${baseClasses} ${sizeClasses[size]} ${variantClasses[variant]} ${className} ${
        disabled || loading ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'
      }`}
      onClick={onClick}
      disabled={disabled || loading}
    >
      {loading ? (
        <span className="animate-pulse">PROCESSING...</span>
      ) : (
        children
      )}
    </button>
  )
}