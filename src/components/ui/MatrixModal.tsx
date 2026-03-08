import React, { useEffect } from 'react'
import { cn } from '@/utils/cn'
import { MatrixButton } from './MatrixButton'

interface MatrixModalProps {
  isOpen: boolean
  onClose: () => void
  title: string
  children: React.ReactNode
  actions?: React.ReactNode
  size?: 'sm' | 'md' | 'lg' | 'xl'
  closeOnBackdrop?: boolean
}

export const MatrixModal: React.FC<MatrixModalProps> = ({
  isOpen,
  onClose,
  title,
  children,
  actions,
  size = 'md',
  closeOnBackdrop = true,
}) => {
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }

    if (isOpen) {
      document.addEventListener('keydown', handleEscape)
      document.body.style.overflow = 'hidden'
    }

    return () => {
      document.removeEventListener('keydown', handleEscape)
      document.body.style.overflow = 'unset'
    }
  }, [isOpen, onClose])

  if (!isOpen) return null

  const sizeClasses = {
    sm: 'max-w-md',
    md: 'max-w-lg',
    lg: 'max-w-2xl',
    xl: 'max-w-4xl',
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className={cn(
          'absolute inset-0 bg-matrix-bg-primary/80 backdrop-blur-sm',
          closeOnBackdrop ? 'cursor-pointer' : ''
        )}
        onClick={closeOnBackdrop ? onClose : undefined}
      />

      {/* Modal */}
      <div
        className={cn(
          'relative bg-matrix-bg-secondary border border-matrix-border-primary rounded-lg p-6',
          'shadow-matrix-glow-normal',
          sizeClasses[size],
          'w-full max-h-[90vh] overflow-auto'
        )}
        style={{
          boxShadow: '0 0 20px rgba(0, 255, 0, 0.3)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex justify-between items-center mb-4 pb-4 border-b border-matrix-border-tertiary">
          <h3 className="text-lg font-bold text-matrix-text-primary font-mono text-glow">
            {title}
          </h3>
          <button
            onClick={onClose}
            className="text-matrix-text-secondary hover:text-matrix-text-primary transition-colors text-xl"
          >
            ✕
          </button>
        </div>

        {/* Content */}
        <div className="mb-6">{children}</div>

        {/* Actions */}
        {actions && (
          <div className="flex justify-end space-x-3 pt-4 border-t border-matrix-border-tertiary">
            {actions}
          </div>
        )}
      </div>
    </div>
  )
}