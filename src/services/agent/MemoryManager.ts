/**
 * 智能体记忆管理器 - 浏览器兼容版
 * 放置位置：src/services/agent/MemoryManager.ts
 * 功能：使用 localStorage 存储策略/上下文/日志（替代文件系统）
 */

export type MemoryType = 'strategy' | 'context' | 'journal' | 'soul'

export interface MemoryFile {
  type: MemoryType
  content: string
  lastModified: number
}

export class MemoryManager {
  private readonly STORAGE_PREFIX = 'pmbot_memory_'

  /**
   * 获取 localStorage 的 key
   */
  private getKey(type: MemoryType): string {
    return `${this.STORAGE_PREFIX}${type}`
  }

  /**
   * 读取记忆内容
   */
  async read(type: MemoryType): Promise<string> {
    try {
      const key = this.getKey(type)
      const stored = localStorage.getItem(key)

      if (stored) {
        const parsed: MemoryFile = JSON.parse(stored)
        return parsed.content
      }

      // 文件不存在，创建默认内容
      await this.createDefaultFile(type)
      return this.read(type)
    } catch (error) {
      console.error(`[MemoryManager] 读取 ${type} 失败:`, error)
      return ''
    }
  }

  /**
   * 追加内容到记忆
   */
  async append(type: MemoryType, content: string, timestamp: boolean = true): Promise<void> {
    try {
      const current = await this.read(type)
      const prefix = timestamp ? `\n\n---\n**${new Date().toISOString()}**\n\n` : '\n\n'
      const updated = current + prefix + content

      await this.write(type, updated)
      console.log(`[MemoryManager] ✅ 已追加到 ${type}`)
    } catch (error) {
      console.error(`[MemoryManager] 追加 ${type} 失败:`, error)
    }
  }

  /**
   * 写入（覆盖）记忆内容
   */
  async write(type: MemoryType, content: string): Promise<void> {
    try {
      const key = this.getKey(type)
      const header = this.getFileHeader(type)
      const memoryFile: MemoryFile = {
        type,
        content: header + '\n\n' + content,
        lastModified: Date.now()
      }

      localStorage.setItem(key, JSON.stringify(memoryFile))
      console.log(`[MemoryManager] ✅ 已更新 ${type}`)
    } catch (error) {
      console.error(`[MemoryManager] 写入 ${type} 失败:`, error)
    }
  }

  /**
   * 获取文件头部模板
   */
  private getFileHeader(type: MemoryType): string {
    const headers: Record<MemoryType, string> = {
      strategy: `# 🎯 Trading Strategy\n\n> 最后更新: ${new Date().toISOString()}\n\n## 当前策略风格`,
      context: `# 🌐 Market Context\n\n> 最后更新: ${new Date().toISOString()}\n\n## 实时市场摘要`,
      journal: `# 📓 Trading Journal\n\n> 自动生成的交易日志，用于复盘和学习`,
      soul: `# 🧬 Core Principles (SOUL)\n\n> AI 的核心原则，通过复盘不断进化`
    }
    return headers[type]
  }

  /**
   * 创建默认文件内容
   */
  private async createDefaultFile(type: MemoryType): Promise<void> {
    const defaults: Record<MemoryType, string> = {
      strategy: `## 策略风格
- 类型: 对冲套利型
- 最大单笔风险: 2% 本金
- 最小置信度: 0.6
- 偏好市场: 高流动性事件

## 当前规则
1. 不在重大新闻发布前 5 分钟开新仓
2. 单市场最大持仓不超过 $200
3. 每日最大亏损 $50 后停止交易`,

      context: `## 当前重点关注
- [待更新] 通过 Analyst 智能体自动填充

## 市场情绪
- [待更新]

## 异常信号
- [待更新]`,

      journal: `## 交易记录

| 时间 | 市场 | 操作 | 价格 | 仓位 | 结果 | 复盘 |
|------|------|------|------|------|------|------|
| - | - | - | - | - | - | - |`,

      soul: `## 核心原则

1. **本金保护优先**: 任何交易前必须计算凯利仓位
2. **不确定性溢价**: 对低流动性市场要求更高置信度
3. **学习导向**: 每笔交易都是数据，无论盈亏

## 已学习的经验
- [待复盘后自动填充]`
    }

    await this.write(type, defaults[type])
    console.log(`[MemoryManager] ✅ 已创建默认 ${type}`)
  }

  /**
   * 解析策略为结构化数据
   */
  async parseStrategy(): Promise<{
    style: string
    maxRisk: number
    minConfidence: number
    rules: string[]
  }> {
    const content = await this.read('strategy')

    const maxRiskMatch = content.match(/最大单笔风险[:：]\s*([\d.]+)%/)
    const minConfMatch = content.match(/最小置信度[:：]\s*([\d.]+)/)
    const rulesMatch = content.match(/## 当前规则[\s\S]*?(?=##|$)/)

    return {
      style: content.includes('对冲套利') ? 'arbitrage' :
             content.includes('追随热点') ? 'momentum' : 'balanced',
      maxRisk: maxRiskMatch ? parseFloat(maxRiskMatch[1]) / 100 : 0.02,
      minConfidence: minConfMatch ? parseFloat(minConfMatch[1]) : 0.6,
      rules: rulesMatch
        ? rulesMatch[0].split('\n').filter(l => l.trim().startsWith('-')).map(l => l.trim().slice(2))
        : []
    }
  }

  /**
   * 清除所有记忆（用于重置）
   */
  async clearAll(): Promise<void> {
    const types: MemoryType[] = ['strategy', 'context', 'journal', 'soul']
    types.forEach(type => {
      localStorage.removeItem(this.getKey(type))
    })
    console.log('[MemoryManager] ✅ 已清除所有记忆')
  }
}

export const memoryManager = new MemoryManager()