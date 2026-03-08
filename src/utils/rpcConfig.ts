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
 */
export const RPC_ENDPOINTS: RpcConfig[] = [
  {
    name: 'Polygon Official',
    url: 'https://polygon-rpc.com',
    priority: 1,
    rateLimit: 100,      // 约 100 请求/分钟
    timeout: 10000,      // 10 秒超时
  },
  {
    name: 'PublicNode',
    url: 'https://polygon-bor.publicnode.com',
    priority: 2,
    rateLimit: 100,
    timeout: 10000,
  },
  {
    name: '1RPC',
    url: 'https://1rpc.io/matic',
    priority: 3,
    rateLimit: 100,
    timeout: 10000,
  },
  {
    name: 'Ankr',
    url: 'https://rpc.ankr.com/polygon',
    priority: 4,
    rateLimit: 100,
    timeout: 10000,
  },
  {
    name: 'Alchemy Demo',
    url: 'https://polygon-mainnet.g.alchemy.com/v2/demo',
    priority: 5,
    rateLimit: 300,      // Alchemy 免费层限制
    timeout: 10000,
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
   */
  USDC: '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174',

  /**
   * Conditional Token Framework (CTF)
   * 用于持仓管理和代币合并
   */
  CTF: '0x4D97DCd97eC945f40cF65F87097ACe5EA0476045',

  /**
   * Polymarket CLOB 交易所合约
   * 用于订单提交和交易执行
   */
  EXCHANGE: '0x4bFB41d5B3570DeFd03C39a9A4D8dE6Bd8B8982E',
} as const

/**
 * 获取合约地址
 * @param name 合约名称
 * @returns 合约地址
 */
export function getContractAddress(name: keyof typeof CONTRACT_ADDRESSES): string {
  return CONTRACT_ADDRESSES[name]
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
  WS: import.meta.env.VITE_WS_URL || 'wss://ws.polymarket.com',
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
  ],
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
  },

  /** 滑点容忍度 */
  slippage: {
    default: 0.02,           // 2%
    max: 0.05,               // 5%
  },
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
      return 'RPC 节点认证失败，正在切换节点'
    }

    return error.message
  }

  return '未知错误'
}

// ==========================================
// 导出所有配置
// ==========================================

export default {
  RPC_ENDPOINTS,
  CONTRACT_ADDRESSES,
  NETWORK_CONFIG,
  POLYMARKET_API,
  OPENROUTER_API,
  TRADING_CONFIG,
  getBestRpc,
  getAllRpcUrls,
  getContractAddress,
  isPolygonMainnet,
  getTxExplorerUrl,
  getAddressExplorerUrl,
  getTokenExplorerUrl,
  delay,
  withRetry,
  withTimeout,
  formatRpcError,
}