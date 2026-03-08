import { BaseStrategy, StrategyStats } from './baseStrategy'
import { Market, PredictionResult } from '@/types'
import { OpenRouterService } from '../llm/openRouterService'
import { GammaClient } from '../api/gammaClient'

export class LLMPredictionStrategy extends BaseStrategy {
  name = 'LLM Prediction'
  description = 'AI-powered market analysis with web search'
  strategyType = 'ai'
  
  private llmService: OpenRouterService
  private gammaClient: GammaClient
  private scanInterval: NodeJS.Timeout | null = null
  
  config = {
    scanIntervalMs: 60000,
    minConfidence: 0.6,
    maxBetPercent: 5,
    stopLossPercent: 15,
    takeProfitPercent: 30
  }
  
  private stats: StrategyStats = {
    totalTrades: 0,
    winRate: 0,
    totalPnl: 0,
    avgHoldTime: 0
  }
  
  constructor() {
    super()
    this.llmService = new OpenRouterService()
    this.gammaClient = new GammaClient()
  }
  
  async initialize(): Promise<void> {
    console.log('[LLM Strategy] Initialized')
  }
  
  async start(): Promise<void> {
    if (this.enabled) return
    this.enabled = true
    
    console.log('[LLM Strategy] Starting...')
    
    this.scanInterval = setInterval(async () => {
      await this.scanAndTrade()
    }, this.config.scanIntervalMs)
  }
  
  async stop(): Promise<void> {
    this.enabled = false
    if (this.scanInterval) {
      clearInterval(this.scanInterval)
      this.scanInterval = null
    }
    console.log('[LLM Strategy] Stopped')
  }
  
  private async scanAndTrade(): Promise<void> {
    try {
      this.emit('scan:start', {})
      
      // 获取市场
      const markets = await this.gammaClient.getMarkets({ limit: 50 })
      const eligible = this.gammaClient.filterEligibleMarkets(markets)
      
      this.emit('scan:complete', { total: markets.length, eligible: eligible.length })
      
      // 分析每个符合条件的市场
      for (const market of eligible.slice(0, 5)) { // 限制每次分析数量
        const analysis = await this.llmService.analyzeMarket(market)
        
        this.emit('analysis:complete', { market, analysis })
        
        // 如果置信度高，执行交易
        if (analysis.confidence >= this.config.minConfidence) {
          this.emit('trade:signal', { market, analysis })
          // 实际交易逻辑在 TradingService 中
        }
      }
    } catch (error) {
      console.error('[LLM Strategy] Scan error:', error)
      this.emit('error', { error })
    }
  }
  
  getStats(): StrategyStats {
    return { ...this.stats }
  }
}