/**
 * Application Constants
 */

// Network Configuration
export const NETWORK_CONFIG = {
  POLYGON_CHAIN_ID: 137,
  POLYGON_RPC_URL: 'https://polygon-rpc.com',
  POLYGON_EXPLORER: 'https://polygonscan.com',
} as const

// Contract Addresses
export const CONTRACT_ADDRESSES = {
  USDC: '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174',
  CTF: '0x4D97DCd97eC945f40cF65F87097ACe5EA0476045',
  EXCHANGE: '0x4bFB41d5B3570DeFd03C39a9A4D8dE6Bd8B8982E',
} as const

// API Endpoints
export const API_ENDPOINTS = {
  GAMMA: import.meta.env.VITE_GAMMA_API_URL || 'https://gamma-api.polymarket.com',
  CLOB: import.meta.env.VITE_CLOB_API_URL || 'https://clob.polymarket.com',
  DATA: import.meta.env.VITE_DATA_API_URL || 'https://data-api.polymarket.com',
  WS: import.meta.env.VITE_WS_URL || 'wss://ws.polymarket.com',
  OPENROUTER: 'https://openrouter.ai/api/v1',
} as const

// Rate Limits
export const RATE_LIMITS = {
  ORDERS_PER_MINUTE: 10,
  ORDERS_PER_HOUR: 50,
  API_CALLS_PER_MINUTE: 60,
  API_CALLS_PER_HOUR: 300,
} as const

// Trading Defaults
export const TRADING_DEFAULTS = {
  MAX_BET_PERCENT: 5,
  MAX_CONCURRENT_POSITIONS: 5,
  MAX_DAILY_LOSS: 50,
  STOP_LOSS_PERCENT: 15,
  TAKE_PROFIT_PERCENT: 30,
  SCAN_INTERVAL_SECONDS: 60,
} as const

// UI Constants
export const UI_CONSTANTS = {
  REFRESH_INTERVAL_MS: 5000,
  TOAST_DURATION_MS: 5000,
  ANIMATION_DURATION_MS: 300,
  LOADING_TIMEOUT_MS: 30000,
} as const

// LLM Configuration
export const LLM_CONFIG = {
  MODEL: 'anthropic/claude-3-sonnet',
  TEMPERATURE: 0.3,
  MAX_TOKENS: 1500,
  MIN_CONFIDENCE: 0.6,
} as const

// Dip Arbitrage Proven Config
export const DIP_ARB_CONFIG = {
  SHARES: 25,
  SUM_TARGET: 0.95,
  DIP_THRESHOLD: 0.3,
  WINDOW_MINUTES: 14,
  SLIDING_WINDOW_MS: 10000,
  LEG2_TIMEOUT_SECONDS: 60,
  MAX_SLIPPAGE: 0.02,
  EXECUTION_COOLDOWN_MS: 500,
} as const

// Error Messages
export const ERROR_MESSAGES = {
  WALLET_NOT_CONNECTED: 'Wallet not connected',
  INSUFFICIENT_BALANCE: 'Insufficient balance',
  ORDER_FAILED: 'Order placement failed',
  API_ERROR: 'API request failed',
  NETWORK_ERROR: 'Network connection error',
  LLM_ERROR: 'LLM analysis failed',
} as const

// Local Storage Keys
export const STORAGE_KEYS = {
  SETTINGS: 'settings',
  WALLET: 'wallet',
  POSITIONS: 'positions',
  ACTIVITY: 'activity',
  STRATEGIES: 'strategies',
} as const