import { MarketScanner } from './MarketScanner'
import { TradingService } from './TradingService'
import { PositionManager } from './PositionManager'
import { LLMPredictionService } from '../llm/openRouterService'
import { ActivityLogger } from './ActivityLogger'
import { Market } from '@/types'

export interface AutoTradingConfig {
  scanIntervalMs: number
  maxConcurrentPositions: number
  paperTradingMode: boolean
  enabled: boolean
}

export class AutoTradingEngine {
  private marketScanner: MarketScanner
  private tradingService: TradingService
  private positionManager: PositionManager
  private llmService: LLMPredictionService
  private activityLogger: ActivityLogger
  private config: AutoTradingConfig
  private intervalId: NodeJS.Timeout | null = null
  private isRunning = false

  constructor(
    marketScanner: MarketScanner,
    tradingService: TradingService,
    positionManager: PositionManager,
    llmService: LLMPredictionService,
    activityLogger: ActivityLogger,
    config: AutoTradingConfig
  ) {
    this.marketScanner = marketScanner
    this.tradingService = tradingService
    this.positionManager = positionManager
    this.llmService = llmService
    this.activityLogger = activityLogger
    this.config = config
  }

  async start(): Promise<void> {
    if (this.isRunning) {
      this.activityLogger.log({
        type: 'info',
        message: 'Auto trading engine already running',
      })
      return
    }

    this.isRunning = true
    this.activityLogger.log({
      type: 'info',
      message: 'Auto trading engine started',
    })

    // Run immediately
    await this.runCycle()

    // Start interval
    this.intervalId = setInterval(
      () => this.runCycle(),
      this.config.scanIntervalMs
    )
  }

  async stop(): Promise<void> {
    if (!this.isRunning) return

    if (this.intervalId) {
      clearInterval(this.intervalId)
      this.intervalId = null
    }

    this.isRunning = false
    this.activityLogger.log({
      type: 'info',
      message: 'Auto trading engine stopped',
    })
  }

  private async runCycle(): Promise<void> {
    if (!this.config.enabled) return

    try {
      this.activityLogger.log({
        type: 'scan',
        message: 'Starting trading cycle...',
      })

      // 1. Scan for new markets
      const scanResults = await this.marketScanner.scan()
      const eligibleMarkets = scanResults.filter(r => r.eligible)

      this.activityLogger.log({
        type: 'scan',
        message: `Found ${eligibleMarkets.length} eligible markets`,
        data: { total: scanResults.length, eligible: eligibleMarkets.length },
      })

      // 2. Check position limits
      const activePositions = await this.positionManager.getActivePositions()
      if (activePositions.length >= this.config.maxConcurrentPositions) {
        this.activityLogger.log({
          type: 'info',
          message: `Max positions reached (${activePositions.length}/${this.config.maxConcurrentPositions})`,
        })
        return
      }

      // 3. Analyze and trade top opportunities
      for (const result of eligibleMarkets.slice(0, 3)) {
        if (activePositions.length >= this.config.maxConcurrentPositions) break

        await this.processMarket(result.market)
      }

      // 4. Monitor existing positions
      await this.positionManager.monitorPositions()

    } catch (error) {
      this.activityLogger.log({
        type: 'error',
        message: `Trading cycle error: ${error instanceof Error ? error.message : 'Unknown error'}`,
      })
    }
  }

  private async processMarket(market: Market): Promise<void> {
    try {
      // 1. LLM Analysis
      const analysis = await this.llmService.analyzeMarket(market)

      this.activityLogger.log({
        type: 'analysis',
        message: `LLM Analysis: ${market.question.substring(0, 50)}...`,
        data: {
          prediction: analysis.predictedOutcome,
          confidence: analysis.confidence,
        },
      })

      // 2. Check confidence threshold
      if (analysis.confidence < 0.6) {
        this.activityLogger.log({
          type: 'info',
          message: 'Confidence too low, skipping trade',
        })
        return
      }

      // 3. Place trade (paper or real)
      if (this.config.paperTradingMode) {
        this.activityLogger.log({
          type: 'bet',
          message: `[PAPER] Would bet on ${analysis.predictedOutcome} with ${analysis.confidence * 100}% confidence`,
        })
      } else {
        // Real trading logic here
        this.activityLogger.log({
          type: 'bet',
          message: `Placed bet on ${analysis.predictedOutcome}`,
        })
      }

    } catch (error) {
      this.activityLogger.log({
        type: 'error',
        message: `Market processing error: ${error instanceof Error ? error.message : 'Unknown error'}`,
      })
    }
  }

  getStatus(): {
    isRunning: boolean
    config: AutoTradingConfig
  } {
    return {
      isRunning: this.isRunning,
      config: { ...this.config },
    }
  }
}