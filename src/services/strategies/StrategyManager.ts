import { BaseStrategy } from './baseStrategy'
import { StrategyStats } from './baseStrategy'

export class StrategyManager {
  private strategies: Map<string, BaseStrategy> = new Map()
  private eventHandlers: Map<string, Function[]> = new Map()

  registerStrategy(strategy: BaseStrategy): void {
    this.strategies.set(strategy.name, strategy)
    console.log(`[StrategyManager] Registered strategy: ${strategy.name}`)
  }

  enableStrategy(name: string): void {
    const strategy = this.strategies.get(name)
    if (strategy) {
      strategy.enabled = true
      strategy.start()
      this.emit('strategy:enabled', { name })
    }
  }

  disableStrategy(name: string): void {
    const strategy = this.strategies.get(name)
    if (strategy) {
      strategy.enabled = false
      strategy.stop()
      this.emit('strategy:disabled', { name })
    }
  }

  toggleStrategy(name: string): void {
    const strategy = this.strategies.get(name)
    if (strategy) {
      if (strategy.enabled) {
        this.disableStrategy(name)
      } else {
        this.enableStrategy(name)
      }
    }
  }

  getAllStrategies(): BaseStrategy[] {
    return Array.from(this.strategies.values())
  }

  getStrategy(name: string): BaseStrategy | undefined {
    return this.strategies.get(name)
  }

  getStrategyStats(name: string): StrategyStats | null {
    const strategy = this.strategies.get(name)
    return strategy ? strategy.getStats() : null
  }

  getAllStrategyStats(): Record<string, StrategyStats> {
    const stats: Record<string, StrategyStats> = {}
    for (const [name, strategy] of this.strategies.entries()) {
      stats[name] = strategy.getStats()
    }
    return stats
  }

  async startAll(): Promise<void> {
    for (const strategy of this.strategies.values()) {
      if (strategy.enabled) {
        await strategy.start()
      }
    }
  }

  async stopAll(): Promise<void> {
    for (const strategy of this.strategies.values()) {
      if (strategy.enabled) {
        await strategy.stop()
      }
    }
  }

  on(event: string, handler: Function): void {
    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, [])
    }
    this.eventHandlers.get(event)!.push(handler)
  }

  private emit(event: string, data: any): void {
    const handlers = this.eventHandlers.get(event) || []
    handlers.forEach(handler => handler(data))
  }
}