import React, { useState } from 'react'
import { useAppStore } from '@/stores/appStore'
import { MatrixCard } from '@/components/ui/MatrixCard'
import { MatrixButton } from '@/components/ui/MatrixButton'
import { MatrixLoading } from '@/components/ui/MatrixLoading'
import { cn } from '@/utils/cn'

export const LLMAnalysis: React.FC = () => {
  const { llm, setAnalyzing, addAnalysis, addNotification } = useAppStore()
  const [selectedMarket, setSelectedMarket] = useState<string>('')
  const [analysisResult, setAnalysisResult] = useState<any>(null)

  const handleAnalyze = async () => {
    if (!selectedMarket) {
      addNotification('请选择市场', 'error')
      return
    }

    setAnalyzing(true)
    addNotification('开始 AI 分析...', 'info')

    try {
      // 模拟 LLM 分析（实际需要调用 OpenRouter API）
      await new Promise(resolve => setTimeout(resolve, 3000))

      const result = {
        market: selectedMarket,
        prediction: Math.random() > 0.5 ? 'YES' : 'NO',
        confidence: 0.65 + Math.random() * 0.3,
        reasoning: '基于历史数据和市场情绪分析...',
        timestamp: new Date(),
      }

      setAnalysisResult(result)
      addAnalysis(result)
      addNotification('分析完成', 'success')
    } catch (error) {
      addNotification('分析失败', 'error')
    } finally {
      setAnalyzing(false)
    }
  }

  return (
    <MatrixCard title="🤖 LLM 市场分析">
      <div className="space-y-4">
        <div className="text-sm text-matrix-text-secondary font-mono">
          使用 AI 分析市场走向（需要 OpenRouter API Key）
        </div>

        <select
          value={selectedMarket}
          onChange={(e) => setSelectedMarket(e.target.value)}
          className="w-full bg-matrix-bg-tertiary border border-matrix-border-tertiary rounded px-3 py-2 text-sm font-mono text-matrix-text-primary"
        >
          <option value="">选择市场...</option>
          <option value="btc-100k">Bitcoin $100K by 2026</option>
          <option value="eth-5k">Ethereum $5K Q2 2026</option>
          <option value="fed-rates">Fed Rate Cut March 2026</option>
        </select>

        <MatrixButton
          onClick={handleAnalyze}
          loading={llm.isAnalyzing}
          fullWidth
        >
          开始分析
        </MatrixButton>

        {analysisResult && (
          <div className="p-4 border border-matrix-border-primary rounded bg-matrix-bg-accent">
            <div className="text-sm font-mono mb-2">
              预测：<span className={cn(
                analysisResult.prediction === 'YES' ? 'text-matrix-success' : 'text-matrix-error'
              )}>{analysisResult.prediction}</span>
            </div>
            <div className="text-sm font-mono mb-2">
              置信度：{(analysisResult.confidence * 100).toFixed(1)}%
            </div>
            <div className="text-xs text-matrix-text-secondary font-mono">
              {analysisResult.reasoning}
            </div>
          </div>
        )}
      </div>
    </MatrixCard>
  )
}