import { Market, PredictionResult } from '@/types'

export class OpenRouterService {
  private apiKey: string
  private baseUrl = 'https://openrouter.ai/api/v1'
  
  constructor() {
    this.apiKey = import.meta.env.VITE_OPENROUTER_API_KEY || ''
  }
  
  async analyzeMarket(market: Market): Promise<PredictionResult> {
    const startTime = Date.now()
    
    const prompt = this.buildPrompt(market)
    
    try {
      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
          'HTTP-Referer': window.location.origin,
          'X-Title': 'Polymarket LLM Bot'
        },
        body: JSON.stringify({
          model: 'anthropic/claude-3-sonnet',
          messages: [
            {
              role: 'system',
              content: `You are an expert prediction market analyst. 
              Analyze markets objectively and provide clear predictions with confidence levels.
              Always respond with valid JSON in the specified format.`
            },
            {
              role: 'user',
              content: prompt
            }
          ],
          temperature: 0.3,
          max_tokens: 1500,
          response_format: { type: 'json_object' }
        })
      })
      
      if (!response.ok) {
        throw new Error(`OpenRouter API error: ${response.status}`)
      }
      
      const data = await response.json()
      const content = data.choices[0]?.message?.content || '{}'
      
      const parsed = this.parseResponse(content)
      
      return {
        ...parsed,
        analysisTime: Date.now() - startTime
      }
    } catch (error) {
      console.error('LLM analysis failed:', error)
      return {
        predictedOutcome: Math.random() > 0.5 ? 'yes' : 'no',
        confidence: 0.1,
        reasoning: 'Analysis failed, using fallback',
        sources: [],
        analysisTime: Date.now() - startTime
      }
    }
  }
  
  private buildPrompt(market: Market): string {
    return `Analyze this prediction market and predict the most likely outcome.

Market Question: "${market.question}"

Current Odds:
- ${market.outcomes[0] || 'Yes'}: ${(market.outcomePrices[0] * 100).toFixed(1)}%
- ${market.outcomes[1] || 'No'}: ${(market.outcomePrices[1] * 100).toFixed(1)}%

Market Info:
- Created: ${new Date(market.createdAt).toLocaleDateString()}
- Volume: $${(market.volume || 0).toLocaleString()}
- Liquidity: $${(market.liquidity || 0).toLocaleString()}

Respond in this JSON format:
{
  "prediction": "yes" or "no",
  "confidence": 0-100,
  "reasoning": "detailed explanation",
  "sources": ["source1", "source2"]
}`
  }
  
  private parseResponse(content: string): PredictionResult {
    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/)
      if (!jsonMatch) throw new Error('No JSON found')
      
      const parsed = JSON.parse(jsonMatch[0])
      
      return {
        predictedOutcome: parsed.prediction === 'yes' ? 'yes' : 'no',
        confidence: Math.max(0, Math.min(1, (parsed.confidence || 50) / 100)),
        reasoning: parsed.reasoning || 'No reasoning provided',
        sources: Array.isArray(parsed.sources) ? parsed.sources : []
      }
    } catch (error) {
      console.error('Failed to parse LLM response:', error)
      return {
        predictedOutcome: 'yes',
        confidence: 0.5,
        reasoning: 'Parse error',
        sources: []
      }
    }
  }
}