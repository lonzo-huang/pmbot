import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { AppState, Market, Position, ActivityLog } from '@/types'

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
    pnl: { total: 0, today: 0, unrealized: 0 }
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
    errors: [],
    notifications: []
  }
}

interface AppStore extends AppState {
  connectWallet: (address: string, balance: number) => void
  disconnectWallet: () => void
  updateBalance: (balance: number) => void
  setMarkets: (markets: Market[]) => void
  setScanning: (isScanning: boolean) => void
  addPosition: (position: Position) => void
  removePosition: (tokenId: string) => void
  updatePosition: (tokenId: string, updates: Partial<Position>) => void
  setTradingActive: (active: boolean) => void
  addTrade: (trade: any) => void
  setAnalyzing: (analyzing: boolean) => void
  addAnalysis: (result: any) => void
  setView: (view: string) => void
  addError: (message: string, type?: string) => void
  addNotification: (message: string, type?: 'success' | 'error' | 'info') => void
  clearNotification: (id: string) => void
  updateSettings: (settings: Partial<AppState['settings']>) => void
}

export const useAppStore = create<AppStore>()(
  persist(
    (set, get) => ({
      ...initialState,
      
      connectWallet: (address, balance) => set({
        wallet: { ...get().wallet, address, balance, isConnected: true }
      }),
      disconnectWallet: () => set({ wallet: initialState.wallet }),
      updateBalance: (balance) => set({ 
        wallet: { ...get().wallet, balance } 
      }),
      
      setMarkets: (markets) => set({ 
        markets: { ...get().markets, activeMarkets: markets } 
      }),
      setScanning: (isScanning) => set({ 
        ui: { ...get().ui, isScanning } 
      }),
      
      addPosition: (position) => set({
        positions: {
          ...get().positions,
          active: [...get().positions.active, position]
        }
      }),
      removePosition: (tokenId) => set({
        positions: {
          ...get().positions,
          active: get().positions.active.filter(p => p.tokenId !== tokenId)
        }
      }),
      updatePosition: (tokenId, updates) => set({
        positions: {
          ...get().positions,
          active: get().positions.active.map(p =>
            p.tokenId === tokenId ? { ...p, ...updates } : p
          )
        }
      }),
      
      setTradingActive: (active) => set({ trading: { ...get().trading, isActive: active } }),
      addTrade: (trade) => set({
        trading: {
          ...get().trading,
          tradeHistory: [trade, ...get().trading.tradeHistory].slice(0, 100)
        }
      }),
      
      setAnalyzing: (analyzing) => set({ llm: { ...get().llm, isAnalyzing: analyzing } }),
      addAnalysis: (result) => set({
        llm: {
          ...get().llm,
          analysisHistory: [result, ...get().llm.analysisHistory].slice(0, 200)
        }
      }),
      
      setView: (view) => set({ ui: { ...get().ui, currentView: view } }),
      addError: (message, type = 'error') => set({
        ui: {
          ...get().ui,
          errors: [...get().ui.errors, { message, type }].slice(-10)
        }
      }),
      addNotification: (message, type = 'info') => {
        const id = Date.now().toString()
        set({
          ui: {
            ...get().ui,
            notifications: [...get().ui.notifications, { id, message, type }]
          }
        })
        setTimeout(() => {
          set({
            ui: {
              ...get().ui,
              notifications: get().ui.notifications.filter(n => n.id !== id)
            }
          })
        }, 5000)
      },
      clearNotification: (id) => set({
        ui: {
          ...get().ui,
          notifications: get().ui.notifications.filter(n => n.id !== id)
        }
      }),
      
      updateSettings: (settings) => set({
        settings: { ...get().settings, ...settings }
      })
    }),
    {
      name: 'polymarket-bot-storage',
      partialize: (state) => ({
        settings: state.settings,
        wallet: { address: state.wallet.address, chainId: state.wallet.chainId }
      })
    }
  )
)