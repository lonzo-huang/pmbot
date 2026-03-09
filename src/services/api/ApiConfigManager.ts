/**
 * API 配置管理服务
 * - 支持多个 AI API 厂家
 * - 加密存储 API Key
 * - 自动选择最佳 API
 */

export interface ApiProvider {
  id: string
  name: string
  baseUrl: string
  models: string[]
  defaultModel: string
  pricePer1kTokens: {
    input: number
    output: number
  }
  enabled: boolean
}

export interface ApiConfig {
  providerId: string
  apiKey: string
  model: string
  maxTokens: number
  temperature: number
}

// ✅ 主流 AI API 厂家配置
export const API_PROVIDERS: ApiProvider[] = [
  {
    id: 'openrouter',
    name: 'OpenRouter',
    baseUrl: 'https://openrouter.ai/api/v1',
    models: [
      'anthropic/claude-3-5-sonnet',
      'anthropic/claude-3-opus',
      'openai/gpt-4o',
      'openai/gpt-4-turbo',
      'google/gemini-pro-1.5',
      'meta-llama/llama-3-70b-instruct',
      'mistralai/mistral-large',
    ],
    defaultModel: 'anthropic/claude-3-5-sonnet',
    pricePer1kTokens: { input: 0.003, output: 0.015 },
    enabled: true,
  },
  {
    id: 'anthropic',
    name: 'Anthropic (Claude)',
    baseUrl: 'https://api.anthropic.com/v1',
    models: [
      'claude-3-5-sonnet-20241022',
      'claude-3-opus-20240229',
      'claude-3-sonnet-20240229',
      'claude-3-haiku-20240307',
    ],
    defaultModel: 'claude-3-5-sonnet-20241022',
    pricePer1kTokens: { input: 0.003, output: 0.015 },
    enabled: true,
  },
  {
    id: 'openai',
    name: 'OpenAI (GPT)',
    baseUrl: 'https://api.openai.com/v1',
    models: [
      'gpt-4o',
      'gpt-4o-mini',
      'gpt-4-turbo',
      'gpt-4',
      'gpt-3.5-turbo',
    ],
    defaultModel: 'gpt-4o',
    pricePer1kTokens: { input: 0.005, output: 0.015 },
    enabled: true,
  },
  {
    id: 'google',
    name: 'Google (Gemini)',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    models: [
      'gemini-1.5-pro',
      'gemini-1.5-flash',
      'gemini-pro',
    ],
    defaultModel: 'gemini-1.5-pro',
    pricePer1kTokens: { input: 0.00025, output: 0.0005 },
    enabled: true,
  },
  {
    id: 'deepseek',
    name: 'DeepSeek',
    baseUrl: 'https://api.deepseek.com/v1',
    models: [
      'deepseek-chat',
      'deepseek-coder',
    ],
    defaultModel: 'deepseek-chat',
    pricePer1kTokens: { input: 0.00014, output: 0.00028 },
    enabled: true,
  },
  {
    id: 'groq',
    name: 'Groq',
    baseUrl: 'https://api.groq.com/openai/v1',
    models: [
      'llama-3.1-70b-versatile',
      'llama-3.1-8b-instant',
      'mixtral-8x7b-32768',
    ],
    defaultModel: 'llama-3.1-70b-versatile',
    pricePer1kTokens: { input: 0.00059, output: 0.00079 },
    enabled: true,
  },
  {
    id: 'together',
    name: 'Together AI',
    baseUrl: 'https://api.together.xyz/v1',
    models: [
      'meta-llama/Llama-3-70b-chat-hf',
      'mistralai/Mixtral-8x7B-Instruct-v0.1',
      'Qwen/Qwen2-72B-Instruct',
    ],
    defaultModel: 'meta-llama/Llama-3-70b-chat-hf',
    pricePer1kTokens: { input: 0.0009, output: 0.0009 },
    enabled: true,
  },
  {
    id: 'perplexity',
    name: 'Perplexity',
    baseUrl: 'https://api.perplexity.ai',
    models: [
      'llama-3.1-sonar-small-128k-online',
      'llama-3.1-sonar-large-128k-online',
    ],
    defaultModel: 'llama-3.1-sonar-large-128k-online',
    pricePer1kTokens: { input: 0.001, output: 0.001 },
    enabled: true,
  },
  {
    id: 'moonshot',
    name: 'Moonshot (月之暗面)',
    baseUrl: 'https://api.moonshot.cn/v1',
    models: [
      'moonshot-v1-8k',
      'moonshot-v1-32k',
      'moonshot-v1-128k',
    ],
    defaultModel: 'moonshot-v1-32k',
    pricePer1kTokens: { input: 0.012, output: 0.012 },
    enabled: true,
  },
  {
    id: 'zhipu',
    name: 'Zhipu (智谱 AI)',
    baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    models: [
      'glm-4',
      'glm-4-flash',
      'glm-3-turbo',
    ],
    defaultModel: 'glm-4',
    pricePer1kTokens: { input: 0.005, output: 0.005 },
    enabled: true,
  },
]

const STORAGE_KEY = 'polymarket_bot_api_config'

class ApiConfigManager {
  /**
   * 加密 API Key
   */
  private async encryptKey(key: string): Promise<string> {
    const encoder = new TextEncoder()
    const keyMaterial = await crypto.subtle.importKey(
      'raw',
      encoder.encode('polymarket_bot_api_key_v1'),
      { name: 'PBKDF2' },
      false,
      ['deriveKey']
    )

    const cryptoKey = await crypto.subtle.deriveKey(
      {
        name: 'PBKDF2',
        salt: encoder.encode('salt_v1'),
        iterations: 100000,
        hash: 'SHA-256',
      },
      keyMaterial,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt']
    )

    const iv = crypto.getRandomValues(new Uint8Array(12))
    const encrypted = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      cryptoKey,
      encoder.encode(key)
    )

    const combined = new Uint8Array(iv.length + encrypted.byteLength)
    combined.set(iv, 0)
    combined.set(new Uint8Array(encrypted), iv.length)

    return btoa(String.fromCharCode(...combined))
  }

  /**
   * 解密 API Key
   */
  private async decryptKey(encrypted: string): Promise<string> {
    const encoder = new TextEncoder()
    const keyMaterial = await crypto.subtle.importKey(
      'raw',
      encoder.encode('polymarket_bot_api_key_v1'),
      { name: 'PBKDF2' },
      false,
      ['deriveKey']
    )

    const cryptoKey = await crypto.subtle.deriveKey(
      {
        name: 'PBKDF2',
        salt: encoder.encode('salt_v1'),
        iterations: 100000,
        hash: 'SHA-256',
      },
      keyMaterial,
      { name: 'AES-GCM', length: 256 },
      false,
      ['decrypt']
    )

    const combined = Uint8Array.from(atob(encrypted), c => c.charCodeAt(0))
    const iv = combined.slice(0, 12)
    const data = combined.slice(12)

    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      cryptoKey,
      data
    )

    const decoder = new TextDecoder()
    return decoder.decode(decrypted)
  }

  /**
   * 保存配置
   */
  async saveConfig(config: Record<string, ApiConfig>): Promise<void> {
    const encryptedConfig: Record<string, any> = {}

    for (const [providerId, apiConfig] of Object.entries(config)) {
      encryptedConfig[providerId] = {
        ...apiConfig,
        apiKey: await this.encryptKey(apiConfig.apiKey),
      }
    }

    localStorage.setItem(STORAGE_KEY, JSON.stringify(encryptedConfig))
  }

  /**
   * 获取配置
   */
  async getConfig(): Promise<Record<string, ApiConfig>> {
    try {
      const data = localStorage.getItem(STORAGE_KEY)
      if (!data) return {}

      const encryptedConfig = JSON.parse(data)
      const config: Record<string, ApiConfig> = {}

      for (const [providerId, apiConfig] of Object.entries(encryptedConfig)) {
        config[providerId] = {
          ...apiConfig,
          apiKey: await this.decryptKey(apiConfig.apiKey),
        }
      }

      return config
    } catch {
      return {}
    }
  }

  /**
   * 获取单个 Provider 配置
   */
  async getProviderConfig(providerId: string): Promise<ApiConfig | null> {
    const config = await this.getConfig()
    return config[providerId] || null
  }

  /**
   * 保存单个 Provider 配置
   */
  async saveProviderConfig(providerId: string, config: ApiConfig): Promise<void> {
    const allConfig = await this.getConfig()
    allConfig[providerId] = config
    await this.saveConfig(allConfig)
  }

  /**
   * 删除 Provider 配置
   */
  async deleteProviderConfig(providerId: string): Promise<void> {
    const config = await this.getConfig()
    delete config[providerId]
    await this.saveConfig(config)
  }

  /**
   * 获取所有已配置的 Provider
   */
  async getConfiguredProviders(): Promise<ApiProvider[]> {
    const config = await this.getConfig()
    return API_PROVIDERS.filter(p => config[p.id] && config[p.id].apiKey)
  }

  /**
   * 获取最佳可用 Provider
   */
  async getBestProvider(): Promise<ApiProvider | null> {
    const configured = await this.getConfiguredProviders()
    if (configured.length === 0) return null
    return configured[0]
  }

  /**
   * 验证 API Key
   */
  async validateApiKey(providerId: string, apiKey: string): Promise<boolean> {
    const provider = API_PROVIDERS.find(p => p.id === providerId)
    if (!provider) return false

    try {
      const response = await fetch(`${provider.baseUrl}/models`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        timeout: 5000,
      })

      return response.ok
    } catch {
      return false
    }
  }

  /**
   * 清除所有配置
   */
  async clearAllConfig(): Promise<void> {
    localStorage.removeItem(STORAGE_KEY)
  }
}

export const apiConfigManager = new ApiConfigManager()
export default apiConfigManager