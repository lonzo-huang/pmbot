import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { AppState, Market, Position, ActivityLog, Trade, PredictionResult } from '@/types'

// ==========================================
// 初始状态 - 确保所有值都有默认值
// ==========================================
const initialState: AppState = {
  wallet: {
    address: null,
    balance: 0,
    isConnected: false,
    chainId: 137,
    approvals: { usdc: false, ctf: false }
  },
  markets: {
    activeMarkets: [],
    scannedMarkets: [],
    lastScanTime: null
  },
  positions: {
    active: [],
    history: [],
    pnl: {
      total: 0,
      today: 0,
      unrealized: 0,
      realized: 0
    }
  },
  trading: {
    isActive: false,
    activeOrders: [],
    tradeHistory: []
  },
  llm: {
    isAnalyzing: false,
    analysisHistory: [],
    totalCost: 0
  },
  settings: {
    paperTradingMode: true,
    maxBetPercent: 5,
    maxDailyLoss: 50,
    autoSellEnabled: true,
    stopLossPercent: 15,
    takeProfitPercent: 30
  },
  ui: {
    currentView: 'dashboard',
    isScanning: false,
    connectionStatus: 'offline' as 'online' | 'offline' | 'connecting',
    errors: [],
    notifications: []
  }
}

// ==========================================
// Store 接口定义
// ==========================================
interface AppStore extends AppState {
  // Wallet Actions
  connectWallet: (address: string, balance: number) => void
  disconnectWallet: () => void
  updateBalance: (balance: number) => void
  updateApprovals: (approvals: { usdc: boolean; ctf: boolean }) => void

  // Market Actions
  setMarkets: (markets: Market[]) => void
  setScanning: (isScanning: boolean) => void
  updateLastScanTime: (time: Date) => void

  // Position Actions
  addPosition: (position: Position) => void
  removePosition: (tokenId: string) => void
  updatePosition: (tokenId: string, updates: Partial<Position>) => void
  updatePositions: (positions: Position[]) => void
  clearPositions: () => void

  // Trading Actions
  setTradingActive: (active: boolean) => void
  addTrade: (trade: Trade) => void
  addOrder: (order: any) => void
  removeOrder: (orderId: string) => void

  // LLM Actions
  setAnalyzing: (analyzing: boolean) => void
  addAnalysis: (result: PredictionResult) => void
  updateLlmCost: (cost: number) => void

  // UI Actions
  setView: (view: string) => void
  setConnectionStatus: (status: 'online' | 'offline' | 'connecting') => void
  addError: (message: string, type?: string) => void
  addNotification: (message: string, type?: 'success' | 'error' | 'info') => void
  clearNotification: (id: string) => void
  clearErrors: () => void

  // Settings Actions
  updateSettings: (settings: Partial<AppState['settings']>) => void
  resetSettings: () => void

  // PnL Actions
  updatePnl: (pnl: { total?: number; today?: number; unrealized?: number }) => void
}

// ==========================================
// Create Store
// ==========================================
export const useAppStore = create<AppStore>()(
  persist(
    (set, get) => ({
      ...initialState,

      // ==========================================
      // Wallet Actions
      // ==========================================
      connectWallet: (address, balance) => {
        console.log('💼 [Store] connectWallet:', address)
        set({
          wallet: {
            ...get().wallet,
            address,
            balance: balance ?? 0,
            isConnected: true
          }
        })
      },

      disconnectWallet: () => {
        console.log('💼 [Store] disconnectWallet')
        set({ wallet: { ...initialState.wallet } })
      },

      // ✅ 新增：单独更新余额（用于定时同步）
      updateBalance: (balance) => {
        console.log('💰 [Store] updateBalance:', balance)
        set({
          wallet: {
            ...get().wallet,
            balance: balance ?? 0
          }
        })
      },

      updateApprovals: (approvals) => {
        set({
          wallet: {
            ...get().wallet,
            approvals: { ...get().wallet.approvals, ...approvals }
          }
        })
      },

      // ==========================================
      // Market Actions
      // ==========================================
      setMarkets: (markets) => {
        console.log('📊 [Store] setMarkets:', markets.length)
        set({
          markets: {
            ...get().markets,
            activeMarkets: markets ?? [],
            lastScanTime: new Date()
          }
        })
      },

      setScanning: (isScanning) => {
        console.log('🔍 [Store] setScanning:', isScanning)
        set({
          ui: {
            ...get().ui,
            isScanning: isScanning ?? false
          }
        })
      },

      updateLastScanTime: (time) => {
        set({
          markets: {
            ...get().markets,
            lastScanTime: time ?? new Date()
          }
        })
      },

      // ==========================================
      // Position Actions
      // ==========================================
      addPosition: (position) => {
        console.log('📊 [Store] addPosition:', position.tokenId)
        set({
          positions: {
            ...get().positions,
            active: [...get().positions.active, position]
          }
        })
      },

      removePosition: (tokenId) => {
        console.log('📊 [Store] removePosition:', tokenId)
        set({
          positions: {
            ...get().positions,
            active: get().positions.active.filter(p => p.tokenId !== tokenId)
          }
        })
      },

      updatePosition: (tokenId, updates) => {
        set({
          positions: {
            ...get().positions,
            active: get().positions.active.map(p =>
              p.tokenId === tokenId ? { ...p, ...updates } : p
            )
          }
        })
      },

      updatePositions: (positions) => {
        set({
          positions: {
            ...get().positions,
            active: positions ?? []
          }
        })
      },

      clearPositions: () => {
        set({
          positions: {
            ...get().positions,
            active: []
          }
        })
      },

      // ==========================================
      // Trading Actions
      // ==========================================
      setTradingActive: (active) => {
        console.log('🔄 [Store] setTradingActive:', active)
        set({
          trading: {
            ...get().trading,
            isActive: active ?? false
          }
        })
      },

      addTrade: (trade) => {
        console.log('💰 [Store] addTrade:', trade.id)
        set({
          trading: {
            ...get().trading,
            tradeHistory: [trade, ...get().trading.tradeHistory].slice(0, 100)
          }
        })
      },

      addOrder: (order) => {
        set({
          trading: {
            ...get().trading,
            activeOrders: [...get().trading.activeOrders, order]
          }
        })
      },

      removeOrder: (orderId) => {
        set({
          trading: {
            ...get().trading,
            activeOrders: get().trading.activeOrders.filter(o => o.orderId !== orderId)
          }
        })
      },

      // ==========================================
      // LLM Actions
      // ==========================================
      setAnalyzing: (analyzing) => {
        set({
          llm: {
            ...get().llm,
            isAnalyzing: analyzing ?? false
          }
        })
      },

      addAnalysis: (result) => {
        set({
          llm: {
            ...get().llm,
            analysisHistory: [result, ...get().llm.analysisHistory].slice(0, 200)
          }
        })
      },

      updateLlmCost: (cost) => {
        set({
          llm: {
            ...get().llm,
            totalCost: (get().llm.totalCost ?? 0) + (cost ?? 0)
          }
        })
      },

      // ==========================================
      // UI Actions
      // ==========================================
      setView: (view) => {
        console.log('🖼️ [Store] setView:', view)
        set({
          ui: {
            ...get().ui,
            currentView: view ?? 'dashboard'
          }
        })
      },

      setConnectionStatus: (status) => {
        set({
          ui: {
            ...get().ui,
            connectionStatus: status
          }
        })
      },

      addError: (message, type = 'error') => {
        console.error('❌ [Store] addError:', message)
        set({
          ui: {
            ...get().ui,
            errors: [...get().ui.errors, { message, type }].slice(-10)
          }
        })
      },

      addNotification: (message, type = 'info') => {
        const id = Date.now().toString() + Math.random().toString(36).substr(2, 9)
        console.log('🔔 [Store] addNotification:', message, type)

        set({
          ui: {
            ...get().ui,
            notifications: [...get().ui.notifications, { id, message, type }]
          }
        })

        // Auto-clear after 5 seconds
        setTimeout(() => {
          set({
            ui: {
              ...get().ui,
              notifications: get().ui.notifications.filter(n => n.id !== id)
            }
          })
        }, 5000)
      },

      clearNotification: (id) => {
        set({
          ui: {
            ...get().ui,
            notifications: get().ui.notifications.filter(n => n.id !== id)
          }
        })
      },

      clearErrors: () => {
        set({
          ui: {
            ...get().ui,
            errors: []
          }
        })
      },

      // ==========================================
      // Settings Actions
      // ==========================================
      updateSettings: (settings) => {
        console.log('⚙️ [Store] updateSettings:', settings)
        set({
          settings: {
            ...get().settings,
            ...settings
          }
        })
      },

      resetSettings: () => {
        set({
          settings: { ...initialState.settings }
        })
      },

      // ==========================================
      // PnL Actions
      // ==========================================
      updatePnl: (pnl) => {
        set({
          positions: {
            ...get().positions,
            pnl: {
              ...get().positions.pnl,
              total: pnl.total ?? get().positions.pnl.total,
              today: pnl.today ?? get().positions.pnl.today,
              unrealized: pnl.unrealized ?? get().positions.pnl.unrealized
            }
          }
        })
      }
    }),
    {
      name: 'polymarket-bot-storage',
      partialize: (state) => ({
        // 只持久化必要的数据
        settings: state.settings,
        wallet: {
          address: state.wallet.address,
          chainId: state.wallet.chainId
        }
      }),
      // 迁移策略（未来版本升级时使用）
      version: 1,
      migrate: (persistedState, version) => {
        // 未来可以添加版本迁移逻辑
        return persistedState as AppState
      }
    }
  )
)

// ==========================================
// 开发环境调试工具
// ==========================================
if (typeof window !== 'undefined' && import.meta.env.DEV) {
  ;(window as any).__ZUSTAND_STORE__ = useAppStore
  console.log('🔧 [Store] Zustand store exposed to window.__ZUSTAND_STORE__')
}

export default useAppStore