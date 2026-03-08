import React from 'react'
import { useAppStore } from '@/stores/appStore'
import { cn } from '@/utils/cn'
import { MatrixCard } from '@/components/ui/MatrixCard'

const navItems = [
  { id: 'dashboard', label: 'DASHBOARD', icon: '📊' },
  { id: 'markets', label: 'MARKETS', icon: '🔍' },
  { id: 'positions', label: 'POSITIONS', icon: '💼' },
  { id: 'activity', label: 'ACTIVITY', icon: '📝' },
  { id: 'settings', label: 'SETTINGS', icon: '⚙️' },
]

export const Sidebar: React.FC = () => {
  const { currentView, setView, wallet } = useAppStore()

  return (
    <MatrixCard className="w-64 h-screen fixed left-0 top-0 rounded-none border-r border-matrix-border-tertiary flex flex-col">
      {/* Logo */}
      <div className="p-6 border-b border-matrix-border-tertiary">
        <h1 className="text-xl font-bold text-matrix-text-primary text-glow">
          POLYMARKET
        </h1>
        <p className="text-xs text-matrix-text-secondary mt-1 font-mono">
          LLM TRADING BOT v1.0
        </p>
      </div>

      {/* Navigation */}
      <nav className="p-4 space-y-2 flex-1">
        {navItems.map((item) => (
          <button
            key={item.id}
            onClick={() => setView(item.id)}
            className={cn(
              'w-full text-left px-4 py-3 rounded border transition-all duration-300 font-mono text-sm',
              currentView === item.id
                ? 'bg-matrix-bg-accent border-matrix-border-primary text-matrix-text-primary shadow-matrix-glow-subtle'
                : 'bg-transparent border-matrix-border-tertiary text-matrix-text-secondary hover:border-matrix-border-primary hover:text-matrix-text-primary'
            )}
          >
            <span className="mr-3">{item.icon}</span>
            {item.label}
          </button>
        ))}
      </nav>

      {/* Wallet Status */}
      <div className="p-4 border-t border-matrix-border-tertiary">
        <div className="text-xs text-matrix-text-secondary mb-2 font-mono">
          WALLET STATUS
        </div>
        {wallet.isConnected ? (
          <div className="text-sm text-matrix-text-primary font-mono">
            <div className="truncate">
              {wallet.address?.slice(0, 10)}...{wallet.address?.slice(-8)}
            </div>
            <div className="text-matrix-text-secondary">
              ${wallet.balance.toFixed(2)} USDC
            </div>
          </div>
        ) : (
          <div className="text-sm text-matrix-error font-mono">
            NOT CONNECTED
          </div>
        )}
      </div>
    </MatrixCard>
  )
}