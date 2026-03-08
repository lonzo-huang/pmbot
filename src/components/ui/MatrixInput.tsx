import React from 'react'
import { cn } from '@/utils/cn'

interface MatrixInputProps {
  value: string | number
  onChange: (value: string) => void
  type?: 'text' | 'number' | 'password' | 'email'
  placeholder?: string
  label?: string
  error?: string
  disabled?: boolean
  className?: string
  min?: number
  max?: number
  step?: number
}

export const MatrixInput: React.FC<MatrixInputProps> = ({
  value,
  onChange,
  type = 'text',
  placeholder,
  label,
  error,
  disabled = false,
  className,
  min,
  max,
  step,
}) => {
  return (
    <div className={cn('space-y-1', className)}>
      {label && (
        <label className="text-xs text-matrix-text-secondary font-mono block">
          {label}
        </label>
      )}
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        min={min}
        max={max}
        step={step}
        className={cn(
          'w-full bg-matrix-bg-secondary border rounded px-3 py-2 font-mono text-sm',
          'text-matrix-text-primary placeholder-matrix-text-muted',
          'border-matrix-border-tertiary focus:border-matrix-border-primary focus:outline-none',
          'focus:shadow-matrix-glow-subtle transition-all duration-300',
          disabled && 'opacity-50 cursor-not-allowed',
          error && 'border-matrix-border-error focus:border-matrix-border-error'
        )}
        style={{
          boxShadow: error
            ? '0 0 5px #ff0040'
            : '0 0 5px rgba(0, 255, 0, 0.1)',
        }}
      />
      {error && (
        <p className="text-xs text-matrix-error font-mono">{error}</p>
      )}
    </div>
  )
}