import { create } from 'zustand'
import { persist } from 'zustand/middleware'
// ✅ 新增：导入 strategyManager（用于策略引擎控制）
import { strategyManager } from '@/services/strategies'

// ==========================================
// 类型定义
// ==========================================
export interface WalletState {
  address: string | null
  balance: number
  isConnected: boolean
  chainId: number
  approvals: {
    usdc: boolean
    ctf: boolean
  }
}

export interface Market {
  id: string
  conditionId?: string
  slug?: string
  type?: 'event' | 'market'
  question: string
  volume: number
  liquidity: number
  outcomePrices: number[]
  endDate: string
  active: boolean
  category?: string
  assetIds?: string[]
}

export interface Position {
  tokenId: string
  marketId: string
  outcome: string
  amount: number
  entryPrice: number
  currentPrice: number
  pnl: number
  openedAt: number
}

export interface Trade {
  id: string
  marketId: string
  type: 'buy' | 'sell'
  outcome: string
  amount: number
  price: number
  timestamp: number
  pnl?: number
}

export interface PredictionResult {
  marketId: string
  prediction: 'yes' | 'no'
  confidence: number
  reasoning: string
  timestamp: number
}

export interface ActivityLog {
  id: string
  type: string
  message: string
  timestamp: number
  data?: any
}

export interface Notification {
  id: string
  message: string
  type: 'success' | 'error' | 'info'
}

export interface ErrorItem {
  message: string
  type: string
}

// ==========================================
// 主应用状态接口
// ==========================================
export interface AppState {
  // 钱包状态
  wallet: WalletState

  // 市场状态
  markets: {
    activeMarkets: Market[]
    scannedMarkets: Market[]
    lastScanTime: Date | null
  }

  // 持仓状态
  positions: {
    active: Position[]
    history: Position[]
    pnl: {
      total: number
      today: number
      unrealized: number
      realized: number
    }
  }

  // 交易状态
  trading: {
    isActive: boolean
    activeOrders: any[]
    tradeHistory: Trade[]
    activityLogs: ActivityLog[]
  }

  // LLM 状态
  llm: {
    isAnalyzing: boolean
    analysisHistory: PredictionResult[]
    totalCost: number
  }

  // API 配置状态
  api: {
    selectedProvider: string
    configs: Record<string, { apiKey: string; model: string }>
  }

  // 设置状态
  settings: {
    paperTradingMode: boolean
    maxBetPercent: number
    maxDailyLoss: number
    autoSellEnabled: boolean
    stopLossPercent: number
    takeProfitPercent: number
  }

  // UI 状态
  ui: {
    currentView: string
    isScanning: boolean
    connectionStatus: 'online' | 'offline' | 'connecting'
    messageCount: number
    scanStatus: 'idle' | 'scanning' | 'connected' | 'error'
    errors: ErrorItem[]
    notifications: Notification[]
  }

  // ✅ 新增：策略引擎状态（用于自主决策架构）
  strategy: {
    isRunning: boolean
    lastActiveAt?: number
  }
}

// ==========================================
// Store 接口定义（包含所有 actions）
// ==========================================
interface AppStore extends AppState {
  // Wallet Actions
  connectWallet: (address: string, balance: number) => void
  disconnectWallet: () => void
  updateBalance: (balance: number) => void
  updateApprovals: (approvals: { usdc: boolean; ctf: boolean }) => void

  // Market Actions
  setMarkets: (markets: Market[]) => void
  handleMarketData: (data: any) => void
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
  addActivityLog: (log: Omit<ActivityLog, 'id' | 'timestamp'>) => void
  addOrder: (order: any) => void
  removeOrder: (orderId: string) => void
  clearTradeStats: () => void

  // LLM Actions
  setAnalyzing: (analyzing: boolean) => void
  addAnalysis: (result: PredictionResult) => void
  updateLlmCost: (cost: number) => void

  // API Actions
  updateApiConfig: (providerId: string, config: { apiKey: string; model: string }) => void
  clearApiConfig: (providerId: string) => void
  setSelectedProvider: (providerId: string) => void

  // UI Actions
  setView: (view: string) => void
  setConnectionStatus: (status: 'online' | 'offline' | 'connecting') => void
  setScanStatus: (status: 'idle' | 'scanning' | 'connected' | 'error') => void
  setMessageCount: (count: number) => void
  incrementMessageCount: () => void
  addError: (message: string, type?: string) => void
  addNotification: (message: string, type?: 'success' | 'error' | 'info') => void
  clearNotification: (id: string) => void
  clearErrors: () => void

  // Settings Actions
  updateSettings: (settings: Partial<AppState['settings']>) => void
  resetSettings: () => void

  // PnL Actions
  updatePnl: (pnl: { total?: number; today?: number; unrealized?: number }) => void

  // ✅ 新增：策略引擎 Action
  setStrategyRunning: (running: boolean) => void
}

// ==========================================
// 初始状态
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
    tradeHistory: [],
    activityLogs: []
  },
  llm: {
    isAnalyzing: false,
    analysisHistory: [],
    totalCost: 0
  },
  api: {
    selectedProvider: 'openrouter',
    configs: {}
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
    connectionStatus: 'offline',
    messageCount: 0,
    scanStatus: 'idle',
    errors: [],
    notifications: []
  },
  // ✅ 新增：策略引擎初始状态
  strategy: {
    isRunning: false,
    lastActiveAt: undefined
  }
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

      handleMarketData: (data) => {
        if (!data || !data.data) return
        const messageAssetId = (data.asset_id || '').toLowerCase()
        const { activeMarkets } = get().markets
        
        // ✅ 优化匹配逻辑：尝试 ID, ConditionId 和 AssetIds (全部转为小写对比)
        set((state) => ({
          markets: {
            ...state.markets,
            activeMarkets: state.markets.activeMarkets.map(market => {
              const marketId = (market.id || '').toLowerCase()
              const conditionId = (market.conditionId || '').toLowerCase()
              const assetIds = (market.assetIds || []).map(id => id.toLowerCase())

              let assetIndex = -1
              
              // 1. 严格匹配 AssetId (不区分大小写)
              assetIndex = assetIds.indexOf(messageAssetId)
              
              // ✅ 修复：移除 MarketId 兜底逻辑，防止 ID 混淆导致的 1-99 跳变
              if (assetIndex === -1) return market

              let tokenPrice = 0
              const payload = data.data

              if (payload.price !== undefined) {
                tokenPrice = parseFloat(payload.price)
              } else if (payload.bids && payload.asks && payload.bids.length > 0 && payload.asks.length > 0) {
                // ✅ 修复 3：使用中间价而不是单边价，消除 YES/NO token 极高/极低价带来的跳变
                const bestBid = payload.bids[0][0]
                const bestAsk = payload.asks[0][0]
                tokenPrice = (bestBid + bestAsk) / 2
              } else if (payload.bids || payload.asks) {
                const bestAsk = payload.asks?.[0]?.[0] || 0
                const bestBid = payload.bids?.[0]?.[0] || 0
                tokenPrice = bestAsk > 0 ? bestAsk : bestBid
              }
              
              const liquidity = payload.bids 
                ? (payload.bids.reduce((s: number, b: any) => s + (parseFloat(b[1]) || 0), 0) + (payload.asks?.reduce((s: number, a: any) => s + (parseFloat(a[1]) || 0), 0) || 0))
                : market.liquidity
              
              // ✅ 允许更新流动性，即使价格暂时为 0
              if (tokenPrice <= 0) {
                return { ...market, liquidity: liquidity > 0 ? liquidity : market.liquidity }
              }

              const newPrices = [...(market.outcomePrices || [0.5, 0.5])]
              const oldPrice = newPrices[assetIndex]
              
              // ✅ 修复 4：跳变保护逻辑修正
              // 只有当旧价格在 3%-97% 之间（非归零或必中状态）时才启动大幅跳变保护
              if (oldPrice > 0.03 && oldPrice < 0.97 && Math.abs(tokenPrice - oldPrice) > 0.4) {
                const otherIndex = assetIndex === 0 ? 1 : 0
                const otherPrice = newPrices[otherIndex]
                
                // 检查是否发生了 YES/NO 价格互换 (例如旧 YES 是 0.11, 新 YES 变成了 0.89)
                if (Math.abs(tokenPrice - otherPrice) < 0.05) {
                   // console.warn(`[Store] 🛡️ 拦截到 Token 价格互换`)
                   return market
                }
                
                // 任何单次 tick > 40% 的跳变都视为脏数据直接拦截
                return market
              }

              newPrices[assetIndex] = tokenPrice
              
              const otherIndex = assetIndex === 0 ? 1 : 0
              newPrices[otherIndex] = parseFloat((1 - tokenPrice).toFixed(4))
              
              return { 
                ...market, 
                outcomePrices: newPrices, 
                liquidity: liquidity > 0 ? liquidity : market.liquidity,
                lastUpdate: new Date()
              }
            })
          }
        }))
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

      setScanStatus: (status) => {
        set({
          ui: {
            ...get().ui,
            scanStatus: status
          }
        })
      },

      setMessageCount: (count) => {
        set({
          ui: {
            ...get().ui,
            messageCount: count
          }
        })
      },

      incrementMessageCount: () => {
        set({
          ui: {
            ...get().ui,
            messageCount: get().ui.messageCount + 1
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

      addActivityLog: (log) => {
        const id = Math.random().toString(36).substr(2, 9)
        const timestamp = Date.now()
        set({
          trading: {
            ...get().trading,
            activityLogs: [{ ...log, id, timestamp }, ...get().trading.activityLogs].slice(0, 100)
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

      clearTradeStats: () => {
        console.log('🧹 [Store] clearTradeStats')
        set({
          trading: {
            ...get().trading,
            tradeHistory: [],
            activityLogs: []
          },
          positions: {
            ...get().positions,
            pnl: {
              total: 0,
              today: 0,
              unrealized: 0,
              realized: 0
            }
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
      // API Actions
      // ==========================================
      updateApiConfig: (providerId, config) => {
        console.log('🔑 [Store] updateApiConfig:', providerId)
        set({
          api: {
            ...get().api,
            configs: {
              ...get().api.configs,
              [providerId]: config
            }
          }
        })
      },

      clearApiConfig: (providerId) => {
        const newConfigs = { ...get().api.configs }
        delete newConfigs[providerId]
        set({
          api: {
            ...get().api,
            configs: newConfigs
          }
        })
      },

      setSelectedProvider: (providerId) => {
        set({
          api: {
            ...get().api,
            selectedProvider: providerId
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
      },

      // ==========================================
      // ✅ 新增：策略引擎 Action
      // ==========================================
      setStrategyRunning: (running) => {
        console.log('🤖 [Store] setStrategyRunning:', running)

        // 调用 strategyManager 实际启动/停止
        if (running) {
          strategyManager.start()
        } else {
          strategyManager.stop()
        }

        // ✅ 同步：当策略引擎启动时，默认也开启自动交易执行
        set({
          strategy: {
            isRunning: running,
            lastActiveAt: running ? Date.now() : get().strategy.lastActiveAt
          },
          trading: {
            ...get().trading,
            isActive: running // 同步自动交易状态
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
        },
        api: {
          selectedProvider: state.api.selectedProvider,
          configs: state.api.configs
        },
        // ✅ 新增：持久化策略状态（刷新页面后保持）
        strategy: {
          isRunning: state.strategy.isRunning,
          lastActiveAt: state.strategy.lastActiveAt
        }
      }),
      version: 1
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
