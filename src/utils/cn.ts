import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

/**
 * Utility function to merge Tailwind CSS classes with clsx
 * Handles class conflicts and deduplication
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs))
}

/**
 * Conditional class name helper
 */
export function conditionalClass(
  baseClass: string,
  conditions: Record<string, boolean>
): string {
  const activeClasses = Object.entries(conditions)
    .filter(([_, isActive]) => isActive)
    .map(([className]) => className)

  return cn(baseClass, ...activeClasses)
}

/**
 * Variant class name helper for component variants
 */
export function variantClass(
  baseClass: string,
  variant: string,
  variants: Record<string, string>
): string {
  return cn(baseClass, variants[variant] || variants.default)
}