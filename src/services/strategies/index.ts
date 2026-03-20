/**
 * Strategies Index - 导出所有策略模块
 */

// BTC 5分钟自动策略 (新增)
export { 
  btc5mAutoStrategy, 
  BTC5M_STRATEGY_DEFAULT_CONFIG,
  type StrategyConfig as Btc5mStrategyConfig,
  type TradeSignal as Btc5mTradeSignal 
} from './Btc5mAutoStrategy'

// 其他策略 - 使用 export * 避免具名导出错误
export * from './StrategyManager'
export * from './baseStrategy'
export * from './StrategyService'
export * from './DipArbStrategy'
export * from './DipDetector'
export * from './llmPredictionStrategy'
export * from './PolymarketEdgeStrategyService'