// ==========================================
// Polygon RPC 节点配置
// ==========================================

/**
 * RPC 节点配置接口
 */
export interface RpcConfig {
  name: string           // 节点名称
  url: string           // RPC URL
  priority: number      // 优先级 (1=最高)
  rateLimit?: number    // 每分钟请求限制
  timeout?: number      // 超时时间 (毫秒)
}

/**
 * Polygon RPC 节点列表 (按优先级排序)
 *
 * 说明:
 * - 公共节点可能有限制，建议按需切换
 * - 生产环境建议使用付费 RPC 服务 (如 Alchemy, Infura)
 * - 自动故障转移逻辑在 Sidebar.tsx 中实现
 *
 * ⚠️ 2026 年 3 月更新：polygon-rpc.com 已禁用 (tenant disabled)
 * - 移除 polygon-rpc.com
 * - 添加更多备用节点
 * - 增加超时时间到 15 秒
 */
export const RPC_ENDPOINTS: RpcConfig[] = [
  {
    name: 'PublicNode',
    url: 'https://polygon-bor.publicnode.com',
    priority: 1,
    rateLimit: 100,      // 约 100 请求/分钟
    timeout: 15000,      // 15 秒超时
  },
  {
    name: '1RPC',
    url: 'https://1rpc.io/matic',
    priority: 2,
    rateLimit: 100,
    timeout: 15000,
  },
  {
    name: 'Ankr',
    url: 'https://rpc.ankr.com/polygon',
    priority: 3,
    rateLimit: 100,
    timeout: 15000,
  },
  {
    name: 'Lava Network',
    url: 'https://polygon-mainnet.g.lavanet.xyz',
    priority: 4,
    rateLimit: 100,
    timeout: 15000,
  },
  {
    name: 'DRPC',
    url: 'https://polygon.drpc.org',
    priority: 5,
    rateLimit: 100,
    timeout: 15000,
  },
  {
    name: 'Alchemy Demo',
    url: 'https://polygon-mainnet.g.alchemy.com/v2/demo',
    priority: 6,
    rateLimit: 300,      // Alchemy 免费层限制
    timeout: 15000,
  },
  {
    name: 'Infura Public',
    url: 'https://polygon-mainnet.infura.io/v3/9aa3d95b3bc440fa88ea12eaa4456161',
    priority: 7,
    rateLimit: 100,
    timeout: 15000,
  },
  {
    name: 'Polygon Official (Backup)',
    url: 'https://polygon-rpc.com',
    priority: 8,         // 降级为最后备用
    rateLimit: 100,
    timeout: 15000,
  },
]

/**
 * 获取最佳可用 RPC 节点
 * @param excludeUrls 要排除的节点 URL 列表
 * @returns 最佳可用的 RPC 配置
 */
export function getBestRpc(excludeUrls: string[] = []): RpcConfig | null {
  const available = RPC_ENDPOINTS.filter(
    (rpc) => !excludeUrls.includes(rpc.url)
  )

  if (available.length === 0) {
    return null
  }

  // 按优先级排序
  available.sort((a, b) => a.priority - b.priority)

  return available[0]
}

/**
 * 获取所有 RPC 节点 URL 列表
 */
export function getAllRpcUrls(): string[] {
  return RPC_ENDPOINTS.map((rpc) => rpc.url)
}

/**
 * 获取可用的 RPC 节点数量
 */
export function getAvailableRpcCount(): number {
  return RPC_ENDPOINTS.length
}

// ==========================================
// 合约地址配置
// ==========================================

/**
 * Polygon 主网合约地址
 */
export const CONTRACT_ADDRESSES = {
  /**
   * USDC 代币合约 (Polygon)
   * 用于交易和余额查询
   *
   * 合约地址：0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174
   * 区块浏览器：https://polygonscan.com/token/0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174
   */
  USDC: '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174',

  /**
   * Conditional Token Framework (CTF)
   * 用于持仓管理和代币合并
   *
   * 合约地址：0x4D97DCd97eC945f40cF65F87097ACe5EA0476045
   * 区块浏览器：https://polygonscan.com/token/0x4D97DCd97eC945f40cF65F87097ACe5EA0476045
   */
  CTF: '0x4D97DCd97eC945f40cF65F87097ACe5EA0476045',

  /**
   * Polymarket CLOB 交易所合约
   * 用于订单提交和交易执行
   *
   * 合约地址：0x4bFB41d5B3570DeFd03C39a9A4D8dE6Bd8B8982E
   * 区块浏览器：https://polygonscan.com/address/0x4bFB41d5B3570DeFd03C39a9A4D8dE6Bd8B8982E
   */
  EXCHANGE: '0x4bFB41d5B3570DeFd03C39a9A4D8dE6Bd8B8982E',

  /**
   * WMATIC 代币合约 (Wrapped MATIC)
   * 用于 Gas 费支付
   */
  WMATIC: '0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270',

  /**
   * DAI 稳定币合约 (Polygon)
   */
  DAI: '0x8f3Cf7ad23Cd3CaDbD9735AFf958023239c6A063',
} as const

/**
 * 获取合约地址
 * @param name 合约名称
 * @returns 合约地址
 */
export function getContractAddress(name: keyof typeof CONTRACT_ADDRESSES): string {
  return CONTRACT_ADDRESSES[name]
}

/**
 * 验证合约地址是否有效
 * @param address 合约地址
 * @returns 是否有效
 */
export function isValidContractAddress(address: string): boolean {
  return Object.values(CONTRACT_ADDRESSES).includes(address as any)
}

// ==========================================
// 网络配置
// ==========================================

/**
 * Polygon 主网配置
 */
export const NETWORK_CONFIG = {
  /** 链 ID (Polygon Mainnet) */
  chainId: 137,

  /** 网络名称 */
  name: 'polygon',

  /** 原生代币符号 */
  symbol: 'MATIC',

  /** 区块浏览器 URL */
  blockExplorer: 'https://polygonscan.com',

  /** 区块浏览器 API (可选) */
  blockExplorerApi: 'https://api.polygonscan.com/api',

  /** 网络 RPC 列表 (用于 MetaMask 添加) */
  rpcUrls: ['https://polygon-bor.publicnode.com'],

  /** 网络图标 URL */
  iconUrl: 'https://polygonscan.com/assets/polygon/images/svg/logos/polygon-eth-mainnet.svg',
} as const

/**
 * Polygon Mumbai 测试网配置
 */
export const MUMBAI_CONFIG = {
  chainId: 80001,
  name: 'polygon-mumbai',
  symbol: 'MATIC',
  blockExplorer: 'https://mumbai.polygonscan.com',
  rpcUrls: ['https://rpc-mumbai.maticvigil.com'],
} as const

/**
 * 验证链 ID 是否为 Polygon 主网
 * @param chainId 链 ID
 * @returns 是否为 Polygon 主网
 */
export function isPolygonMainnet(chainId: number): boolean {
  return chainId === NETWORK_CONFIG.chainId
}

/**
 * 验证链 ID 是否为 Polygon 测试网
 * @param chainId 链 ID
 * @returns 是否为 Polygon 测试网
 */
export function isPolygonTestnet(chainId: number): boolean {
  return chainId === MUMBAI_CONFIG.chainId
}

/**
 * 获取区块浏览器交易链接
 * @param txHash 交易哈希
 * @returns 交易详情 URL
 */
export function getTxExplorerUrl(txHash: string): string {
  return `${NETWORK_CONFIG.blockExplorer}/tx/${txHash}`
}

/**
 * 获取区块浏览器地址链接
 * @param address 钱包地址
 * @returns 地址详情 URL
 */
export function getAddressExplorerUrl(address: string): string {
  return `${NETWORK_CONFIG.blockExplorer}/address/${address}`
}

/**
 * 获取区块浏览器代币链接
 * @param tokenAddress 代币合约地址
 * @returns 代币详情 URL
 */
export function getTokenExplorerUrl(tokenAddress: string): string {
  return `${NETWORK_CONFIG.blockExplorer}/token/${tokenAddress}`
}

/**
 * 获取区块浏览器区块链接
 * @param blockNumber 区块号
 * @returns 区块详情 URL
 */
export function getBlockExplorerUrl(blockNumber: number): string {
  return `${NETWORK_CONFIG.blockExplorer}/block/${blockNumber}`
}

// ==========================================
// API 端点配置
// ==========================================

/**
 * Polymarket API 端点配置
 */
export const POLYMARKET_API = {
  /** Gamma API (市场数据) */
  GAMMA: import.meta.env.VITE_GAMMA_API_URL || 'https://gamma-api.polymarket.com',

  /** CLOB API (订单簿/交易) */
  CLOB: import.meta.env.VITE_CLOB_API_URL || 'https://clob.polymarket.com',

  /** Data API (持仓/分析) */
  DATA: import.meta.env.VITE_DATA_API_URL || 'https://data-api.polymarket.com',

  /** WebSocket (实时数据) */
  WS: import.meta.env.VITE_WS_URL || 'wss://ws-subscriptions-clob.polymarket.com/ws/market',

  /** 事件 API */
  EVENTS: import.meta.env.VITE_EVENTS_API_URL || 'https://events-api.polymarket.com',

  /** 用户 API */
  USER: import.meta.env.VITE_USER_API_URL || 'https://user-api.polymarket.com',
} as const

/**
 * OpenRouter LLM API 配置
 */
export const OPENROUTER_API = {
  /** API 基础 URL */
  BASE_URL: 'https://openrouter.ai/api/v1',

  /** 默认模型 */
  DEFAULT_MODEL: 'anthropic/claude-3-sonnet',

  /** 备用模型列表 */
  FALLBACK_MODELS: [
    'anthropic/claude-3-haiku',
    'openai/gpt-3.5-turbo',
    'google/gemini-pro',
  ],

  /** 超时时间 (毫秒) */
  TIMEOUT: 30000,

  /** 最大重试次数 */
  MAX_RETRIES: 3,
} as const

/**
 * CoinGecko API 配置 (价格数据)
 */
export const COINGECKO_API = {
  BASE_URL: 'https://api.coingecko.com/api/v3',
  MATIC_ID: 'matic-network',
  USDC_ID: 'usd-coin',
} as const

// ==========================================
// 交易配置
// ==========================================

/**
 * 全局交易执行配置
 */
export const TRADING_CONFIG = {
  /** 最大订单数限制 */
  rateLimits: {
    ordersPerMinute: 10,
    ordersPerHour: 50,
    apiCallsPerMinute: 60,
  },

  /** 重试配置 */
  retry: {
    maxRetries: 3,
    initialDelay: 1000,      // 1 秒
    maxDelay: 10000,         // 10 秒
    backoffMultiplier: 2,    // 指数退避
  },

  /** 超时配置 */
  timeouts: {
    apiCall: 10000,          // 10 秒
    websocketPing: 5000,     // 5 秒
    transactionConfirm: 300000, // 5 分钟
    blockConfirmations: 3,   // 区块确认数
  },

  /** 滑点容忍度 */
  slippage: {
    default: 0.02,           // 2%
    max: 0.05,               // 5%
  },

  /** Gas 配置 */
  gas: {
    maxFeePerGas: 100000000000,  // 100 Gwei
    maxPriorityFeePerGas: 30000000000, // 30 Gwei
  },

  /** 仓位管理 */
  position: {
    maxPositions: 10,
    maxPositionSize: 0.1,  // 最大仓位 10%
  },
} as const

/**
 * 风险管理配置
 */
export const RISK_CONFIG = {
  /** 最大日亏损 */
  maxDailyLoss: 0.05,  // 5%

  /** 最大总亏损 */
  maxTotalLoss: 0.20,  // 20%

  /** 止损百分比 */
  stopLossPercent: 0.15,  // 15%

  /** 止盈百分比 */
  takeProfitPercent: 0.30,  // 30%

  /** 最大单笔交易 */
  maxSingleTrade: 0.05,  // 5%
} as const

// ==========================================
// 工具函数
// ==========================================

/**
 * 延迟执行函数
 * @param ms 延迟毫秒数
 */
export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * 带重试的异步操作
 * @param operation 要执行的操作
 * @param maxRetries 最大重试次数
 * @param delayMs 重试延迟 (毫秒)
 */
export async function withRetry<T>(
  operation: () => Promise<T>,
  maxRetries: number = 3,
  delayMs: number = 1000
): Promise<T> {
  let lastError: Error | null = null

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await operation()
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error))

      if (attempt < maxRetries) {
        console.log(`⚠️ 重试 ${attempt}/${maxRetries}: ${lastError.message}`)
        await delay(delayMs * Math.pow(2, attempt - 1)) // 指数退避
      }
    }
  }

  throw lastError || new Error('Operation failed after all retries')
}

/**
 * 带超时的异步操作
 * @param promise 要执行的 Promise
 * @param timeoutMs 超时时间 (毫秒)
 * @param errorMessage 超时错误消息
 */
export async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  errorMessage: string = 'Operation timed out'
): Promise<T> {
  const timeout = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error(errorMessage)), timeoutMs)
  })

  return Promise.race([promise, timeout])
}

/**
 * 格式化 RPC 错误消息
 * @param error 错误对象
 * @returns 友好的错误消息
 */
export function formatRpcError(error: unknown): string {
  if (error instanceof Error) {
    const message = error.message.toLowerCase()

    if (message.includes('rate limit')) {
      return 'RPC 请求频率过高，请稍后重试'
    }
    if (message.includes('timeout')) {
      return 'RPC 节点响应超时，正在切换节点'
    }
    if (message.includes('network')) {
      return '网络连接错误，请检查网络'
    }
    if (message.includes('unauthorized') || message.includes('401')) {
      return 'RPC 节点认证失败，正在切换备用节点'
    }
    if (message.includes('tenant disabled')) {
      return 'RPC 节点已禁用，正在切换备用节点'
    }
    if (message.includes('server error') || message.includes('500')) {
      return 'RPC 服务器错误，正在切换备用节点'
    }
    if (message.includes('rate limit') || message.includes('429')) {
      return '请求频率过高，请稍后重试'
    }

    return error.message
  }

  return '未知错误'
}

/**
 * 格式化金额
 * @param amount 金额
 * @param decimals 小数位数
 * @returns 格式化后的金额
 */
export function formatAmount(amount: number, decimals: number = 2): string {
  return amount.toLocaleString(undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })
}

/**
 * 格式化百分比
 * @param value 值
 * @param decimals 小数位数
 * @returns 格式化后的百分比
 */
export function formatPercent(value: number, decimals: number = 2): string {
  return `${(value * 100).toFixed(decimals)}%`
}

/**
 * 格式化时间戳
 * @param timestamp 时间戳
 * @param format 格式
 * @returns 格式化后的时间
 */
export function formatTimestamp(timestamp: number, format: 'short' | 'long' = 'short'): string {
  const date = new Date(timestamp)
  if (format === 'short') {
    return date.toLocaleString('zh-CN', {
      month: 'numeric',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }
  return date.toLocaleString('zh-CN')
}

/**
 * 生成随机 ID
 * @param length ID 长度
 * @returns 随机 ID
 */
export function generateId(length: number = 16): string {
  return Array.from({ length }, () =>
    Math.floor(Math.random() * 16).toString(16)
  ).join('')
}

/**
 * 深拷贝对象
 * @param obj 对象
 * @returns 深拷贝后的对象
 */
export function deepClone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj))
}

/**
 * 防抖函数
 * @param fn 函数
 * @param delay 延迟时间
 * @returns 防抖后的函数
 */
export function debounce<T extends (...args: any[]) => any>(
  fn: T,
  delay: number
): T {
  let timeoutId: NodeJS.Timeout
  return ((...args: Parameters<T>) => {
    clearTimeout(timeoutId)
    timeoutId = setTimeout(() => fn(...args), delay)
  }) as T
}

/**
 * 节流函数
 * @param fn 函数
 * @param limit 限制时间
 * @returns 节流后的函数
 */
export function throttle<T extends (...args: any[]) => any>(
  fn: T,
  limit: number
): T {
  let inThrottle: boolean
  return ((...args: Parameters<T>) => {
    if (!inThrottle) {
      fn(...args)
      inThrottle = true
      setTimeout(() => (inThrottle = false), limit)
    }
  }) as T
}

// ==========================================
// 本地存储键名
// ==========================================

export const STORAGE_KEYS = {
  WALLETS: 'polymarket_bot_wallets',
  CURRENT_WALLET: 'polymarket_bot_current_wallet',
  SETTINGS: 'polymarket_bot_settings',
  PREFERENCES: 'polymarket_bot_preferences',
  CACHE: 'polymarket_bot_cache',
} as const

// ==========================================
// 事件类型
// ==========================================

export const EVENT_TYPES = {
  WALLET_CONNECTED: 'wallet:connected',
  WALLET_DISCONNECTED: 'wallet:disconnected',
  TRADE_EXECUTED: 'trade:executed',
  POSITION_OPENED: 'position:opened',
  POSITION_CLOSED: 'position:closed',
  ERROR: 'error',
  NOTIFICATION: 'notification',
} as const

// ==========================================
// 导出所有配置
// ==========================================

export default {
  RPC_ENDPOINTS,
  CONTRACT_ADDRESSES,
  NETWORK_CONFIG,
  MUMBAI_CONFIG,
  POLYMARKET_API,
  OPENROUTER_API,
  COINGECKO_API,
  TRADING_CONFIG,
  RISK_CONFIG,
  STORAGE_KEYS,
  EVENT_TYPES,
  getBestRpc,
  getAllRpcUrls,
  getAvailableRpcCount,
  getContractAddress,
  isValidContractAddress,
  isPolygonMainnet,
  isPolygonTestnet,
  getTxExplorerUrl,
  getAddressExplorerUrl,
  getTokenExplorerUrl,
  getBlockExplorerUrl,
  delay,
  withRetry,
  withTimeout,
  formatRpcError,
  formatAmount,
  formatPercent,
  formatTimestamp,
  generateId,
  deepClone,
  debounce,
  throttle,
}