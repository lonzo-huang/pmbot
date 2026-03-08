// 市场数据类型
export interface Market {
  id: string
  question: string
  description: string
  outcomes: string[]
  clobTokenIds: string[]
  active: boolean
  closed: boolean
  endDate: string
  createdAt: string
  volume: number
  liquidity: number
  outcomePrices: number[]
  conditionId?: string
}

// 持仓数据
export interface Position {
  tokenId: string
  marketId: string
  marketQuestion: string
  outcome: string
  outcomeIndex: number
  size: number
  entryPrice: number
  currentPrice: number
  pnl: {
    dollar: number
    percent: number
  }
  entryTime: Date
  lastUpdate: Date
  autoSellSettings?: AutoSellConfig
}

// LLM 分析结果
export interface PredictionResult {
  predictedOutcome: 'yes' | 'no'
  confidence: number
  reasoning: string
  sources: string[]
  analysisTime: number
}

// 订单数据
export interface Order {
  orderId: string
  tokenId: string
  side: 'BUY' | 'SELL'
  price: number
  size: number
  type: 'FOK' | 'FAK' | 'GTC' | 'GTD'
  status: 'pending' | 'filled' | 'cancelled' | 'expired'
  timestamp: Date
}

// 交易记录
export interface Trade {
  id: string
  marketId: string
  tokenId: string
  side: 'BUY' | 'SELL'
  size: number
  price: number
  fee: number
  timestamp: string
  transactionHash: string
  pnl?: number
}

// 活动日志
export interface ActivityLog {
  id: string
  timestamp: Date
  type: 'scan' | 'bet' | 'sell' | 'error' | 'info' | 'analysis'
  message: string
  data?: any
}

// 钱包状态
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

// 自动卖出配置
export interface AutoSellConfig {
  enabled: boolean
  lossThreshold: number
  profitThreshold: number
  oddsMovementThreshold: number
  maxHoldTime: number
  timeBasedExit: boolean
  trailingStopEnabled: boolean
  trailingStopDistance: number
}

// 策略配置
export interface StrategyConfig {
  enabled: boolean
  name: string
  type: 'mechanical' | 'ai' | 'arbitrage'
  parameters: Record<string, any>
}

// 全局应用状态
export interface AppState {
  wallet: WalletState
  markets: {
    activeMarkets: Market[]
    scannedMarkets: Market[]
    lastScanTime: Date | null
  }
  positions: {
    active: Position[]
    history: Position[]
    pnl: {
      total: number
      today: number
      unrealized: number
    }
  }
  trading: {
    isActive: boolean
    activeOrders: Order[]
    tradeHistory: Trade[]
  }
  llm: {
    isAnalyzing: boolean
    analysisHistory: PredictionResult[]
    totalCost: number
  }
  settings: {
    paperTradingMode: boolean
    maxBetPercent: number
    maxDailyLoss: number
    autoSellEnabled: boolean
    stopLossPercent: number
    takeProfitPercent: number
  }
  ui: {
    currentView: string
    isScanning: boolean
    errors: Array<{ message: string; type: string }>
    notifications: Array<{ message: string; type: 'success' | 'error' | 'info' }>
  }
}