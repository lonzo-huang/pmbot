import React, { useState, useEffect } from 'react'
import { useAppStore } from '@/stores/appStore'
import { MatrixCard } from '@/components/ui/MatrixCard'
import { MatrixButton } from '@/components/ui/MatrixButton'
import { MatrixInput } from '@/components/ui/MatrixInput'
import { MatrixModal } from '@/components/ui/MatrixModal'
import { cn } from '@/utils/cn'
import apiConfigManager, { API_PROVIDERS, type ApiProvider, type ApiConfig } from '@/services/api/ApiConfigManager'

export const SettingsPanel: React.FC = () => {
  const { settings, updateSettings, addNotification } = useAppStore()

  const [apiConfigs, setApiConfigs] = useState<Record<string, ApiConfig>>({})
  const [selectedProvider, setSelectedProvider] = useState<string>('openrouter')
  const [showApiKeyModal, setShowApiKeyModal] = useState(false)
  const [editingProvider, setEditingProvider] = useState<ApiProvider | null>(null)
  const [apiKeyInput, setApiKeyInput] = useState('')
  const [isTesting, setIsTesting] = useState(false)
  const [testResult, setTestResult] = useState<'success' | 'error' | null>(null)

  // 加载 API 配置
  useEffect(() => {
    loadApiConfigs()
  }, [])

  const loadApiConfigs = async () => {
    const config = await apiConfigManager.getConfig()
    setApiConfigs(config)
  }

  const handleSaveApiKey = async () => {
    if (!editingProvider || !apiKeyInput.trim()) {
      addNotification('请输入 API Key', 'error')
      return
    }

    setIsTesting(true)
    setTestResult(null)

    // 验证 API Key
    const isValid = await apiConfigManager.validateApiKey(editingProvider.id, apiKeyInput.trim())

    if (!isValid) {
      setTestResult('error')
      setIsTesting(false)
      addNotification('API Key 验证失败', 'error')
      return
    }

    setTestResult('success')

    // 保存配置
    await apiConfigManager.saveProviderConfig(editingProvider.id, {
      providerId: editingProvider.id,
      apiKey: apiKeyInput.trim(),
      model: editingProvider.defaultModel,
      maxTokens: 4096,
      temperature: 0.7,
    })

    await loadApiConfigs()
    setIsTesting(false)
    setShowApiKeyModal(false)
    setApiKeyInput('')
    setEditingProvider(null)
    addNotification(`${editingProvider.name} API Key 已保存`, 'success')
  }

  const handleDeleteApiKey = async (providerId: string) => {
    if (confirm('确定要删除这个 API Key 吗？')) {
      await apiConfigManager.deleteProviderConfig(providerId)
      await loadApiConfigs()
      addNotification('API Key 已删除', 'info')
    }
  }

  const handleClearAll = async () => {
    if (confirm('确定要清除所有 API 配置吗？此操作不可恢复！')) {
      await apiConfigManager.clearAllConfig()
      await loadApiConfigs()
      addNotification('所有 API 配置已清除', 'info')
    }
  }

  const handleSettingChange = (key: keyof typeof settings, value: any) => {
    updateSettings({ [key]: value })
    addNotification('设置已保存', 'success')
  }

  const getProviderStatus = (providerId: string) => {
    if (apiConfigs[providerId]) {
      return { configured: true, model: apiConfigs[providerId].model }
    }
    return { configured: false, model: null }
  }

  return (
    <div className="space-y-6">
      {/* 交易设置 */}
      <MatrixCard title="⚙️ 交易设置" subtitle="配置交易策略参数">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <div>
            <label className="text-xs text-matrix-text-secondary font-mono mb-2 block">
              纸面交易模式
            </label>
            <button
              onClick={() => handleSettingChange('paperTradingMode', !settings.paperTradingMode)}
              className={cn(
                'w-full px-4 py-3 rounded border font-mono text-sm transition-all',
                settings.paperTradingMode
                  ? 'bg-matrix-success/10 border-matrix-success text-matrix-success'
                  : 'bg-matrix-bg-tertiary border-matrix-border-tertiary text-matrix-text-secondary'
              )}
            >
              {settings.paperTradingMode ? '● ON' : '○ OFF'}
            </button>
          </div>

          <div>
            <label className="text-xs text-matrix-text-secondary font-mono mb-2 block">
              最大投注比例 (%)
            </label>
            <input
              type="number"
              value={settings.maxBetPercent}
              onChange={(e) => handleSettingChange('maxBetPercent', Number(e.target.value))}
              className="w-full px-4 py-3 bg-matrix-bg-tertiary border border-matrix-border-tertiary rounded font-mono text-sm text-matrix-text-primary"
            />
          </div>

          <div>
            <label className="text-xs text-matrix-text-secondary font-mono mb-2 block">
              止损比例 (%)
            </label>
            <input
              type="number"
              value={settings.stopLossPercent}
              onChange={(e) => handleSettingChange('stopLossPercent', Number(e.target.value))}
              className="w-full px-4 py-3 bg-matrix-bg-tertiary border border-matrix-border-tertiary rounded font-mono text-sm text-matrix-error"
            />
          </div>

          <div>
            <label className="text-xs text-matrix-text-secondary font-mono mb-2 block">
              止盈比例 (%)
            </label>
            <input
              type="number"
              value={settings.takeProfitPercent}
              onChange={(e) => handleSettingChange('takeProfitPercent', Number(e.target.value))}
              className="w-full px-4 py-3 bg-matrix-bg-tertiary border border-matrix-border-tertiary rounded font-mono text-sm text-matrix-success"
            />
          </div>

          <div>
            <label className="text-xs text-matrix-text-secondary font-mono mb-2 block">
              每日最大亏损 ($)
            </label>
            <input
              type="number"
              value={settings.maxDailyLoss}
              onChange={(e) => handleSettingChange('maxDailyLoss', Number(e.target.value))}
              className="w-full px-4 py-3 bg-matrix-bg-tertiary border border-matrix-border-tertiary rounded font-mono text-sm text-matrix-error"
            />
          </div>

          <div>
            <label className="text-xs text-matrix-text-secondary font-mono mb-2 block">
              自动卖出
            </label>
            <button
              onClick={() => handleSettingChange('autoSellEnabled', !settings.autoSellEnabled)}
              className={cn(
                'w-full px-4 py-3 rounded border font-mono text-sm transition-all',
                settings.autoSellEnabled
                  ? 'bg-matrix-success/10 border-matrix-success text-matrix-success'
                  : 'bg-matrix-bg-tertiary border-matrix-border-tertiary text-matrix-text-secondary'
              )}
            >
              {settings.autoSellEnabled ? '● ON' : '○ OFF'}
            </button>
          </div>
        </div>
      </MatrixCard>

      {/* API 配置 */}
      <MatrixCard
        title="🤖 AI API 配置"
        subtitle="配置 AI 分析服务的 API Key"
        actions={
          <MatrixButton variant="danger" size="sm" onClick={handleClearAll}>
            🗑️ 清除所有
          </MatrixButton>
        }
      >
        <div className="space-y-4">
          <div className="text-xs text-matrix-text-muted font-mono mb-4">
            💡 支持 10 个主流 AI API 厂家，API Key 将加密存储在本地
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {API_PROVIDERS.map((provider) => {
              const status = getProviderStatus(provider.id)
              return (
                <div
                  key={provider.id}
                  className={cn(
                    'p-4 border rounded transition-all',
                    status.configured
                      ? 'border-matrix-success bg-matrix-success/5'
                      : 'border-matrix-border-tertiary bg-matrix-bg-tertiary'
                  )}
                >
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="text-sm font-mono text-matrix-text-primary">{provider.name}</h4>
                    {status.configured && (
                      <span className="text-xs text-matrix-success font-mono">● 已配置</span>
                    )}
                  </div>

                  <div className="text-xs text-matrix-text-secondary font-mono mb-3">
                    模型：{status.model || provider.defaultModel}
                  </div>

                  <div className="text-xs text-matrix-text-muted font-mono mb-3">
                    价格：${provider.pricePer1kTokens.input}/1K (输入) | ${provider.pricePer1kTokens.output}/1K (输出)
                  </div>

                  <div className="flex gap-2">
                    <MatrixButton
                      size="sm"
                      variant={status.configured ? 'secondary' : 'primary'}
                      onClick={() => {
                        setEditingProvider(provider)
                        setApiKeyInput(apiConfigs[provider.id]?.apiKey || '')
                        setShowApiKeyModal(true)
                      }}
                      className="flex-1"
                    >
                      {status.configured ? '✏️ 编辑' : '➕ 配置'}
                    </MatrixButton>
                    {status.configured && (
                      <MatrixButton
                        size="sm"
                        variant="danger"
                        onClick={() => handleDeleteApiKey(provider.id)}
                      >
                        🗑️
                      </MatrixButton>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </MatrixCard>

      {/* 关于 */}
      <MatrixCard title="ℹ️ 关于" subtitle="系统信息">
        <div className="space-y-2 text-xs text-matrix-text-secondary font-mono">
          <div className="flex justify-between">
            <span>版本:</span>
            <span className="text-matrix-text-primary">v1.0.0</span>
          </div>
          <div className="flex justify-between">
            <span>构建时间:</span>
            <span className="text-matrix-text-primary">2026-03-09</span>
          </div>
          <div className="flex justify-between">
            <span>网络:</span>
            <span className="text-matrix-text-primary">Polygon Mainnet</span>
          </div>
          <div className="flex justify-between">
            <span>链 ID:</span>
            <span className="text-matrix-text-primary">137</span>
          </div>
        </div>
      </MatrixCard>

      {/* API Key 配置模态框 */}
      <MatrixModal
        isOpen={showApiKeyModal}
        onClose={() => {
          setShowApiKeyModal(false)
          setEditingProvider(null)
          setApiKeyInput('')
          setTestResult(null)
        }}
        title={editingProvider ? `配置 ${editingProvider.name}` : '配置 API'}
        size="md"
        actions={
          <>
            <MatrixButton
              variant="secondary"
              onClick={() => {
                setShowApiKeyModal(false)
                setEditingProvider(null)
                setApiKeyInput('')
                setTestResult(null)
              }}
            >
              取消
            </MatrixButton>
            <MatrixButton
              variant="primary"
              onClick={handleSaveApiKey}
              loading={isTesting}
            >
              {isTesting ? '验证中...' : '保存'}
            </MatrixButton>
          </>
        }
      >
        <div className="space-y-4">
          {editingProvider && (
            <>
              <div className="text-sm text-matrix-text-secondary font-mono">
                请输入 {editingProvider.name} 的 API Key：
              </div>

              <MatrixInput
                value={apiKeyInput}
                onChange={setApiKeyInput}
                type="password"
                placeholder="sk-..."
                label="API Key"
              />

              {/* 模型选择 */}
              <div>
                <label className="text-xs text-matrix-text-secondary font-mono mb-2 block">
                  选择模型
                </label>
                <select
                  value={apiConfigs[editingProvider.id]?.model || editingProvider.defaultModel}
                  onChange={(e) => {
                    if (apiConfigs[editingProvider.id]) {
                      apiConfigs[editingProvider.id].model = e.target.value
                      setApiConfigs({ ...apiConfigs })
                    }
                  }}
                  className="w-full px-4 py-3 bg-matrix-bg-tertiary border border-matrix-border-tertiary rounded font-mono text-sm text-matrix-text-primary"
                >
                  {editingProvider.models.map((model) => (
                    <option key={model} value={model}>
                      {model}
                    </option>
                  ))}
                </select>
              </div>

              {/* 测试结果 */}
              {testResult === 'success' && (
                <div className="p-3 border border-matrix-success/30 rounded bg-matrix-success/10 text-matrix-success font-mono text-sm">
                  ✅ API Key 验证成功！
                </div>
              )}
              {testResult === 'error' && (
                <div className="p-3 border border-matrix-error/30 rounded bg-matrix-error/10 text-matrix-error font-mono text-sm">
                  ❌ API Key 验证失败，请检查后重试
                </div>
              )}

              {/* 获取 API Key 链接 */}
              <div className="p-3 border border-matrix-border-tertiary rounded bg-matrix-bg-tertiary">
                <div className="text-xs text-matrix-text-muted font-mono mb-2">
                  📖 如何获取 API Key：
                </div>
                <a
                  href={getApiKeyUrl(editingProvider.id)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-matrix-info font-mono hover:underline"
                >
                  点击前往 {editingProvider.name} 官网获取 API Key →
                </a>
              </div>
            </>
          )}
        </div>
      </MatrixModal>
    </div>
  )
}

// 获取 API Key 申请链接
function getApiKeyUrl(providerId: string): string {
  const urls: Record<string, string> = {
    openrouter: 'https://openrouter.ai/keys',
    anthropic: 'https://console.anthropic.com/settings/keys',
    openai: 'https://platform.openai.com/api-keys',
    google: 'https://makersuite.google.com/app/apikey',
    deepseek: 'https://platform.deepseek.com/api_keys',
    groq: 'https://console.groq.com/keys',
    together: 'https://api.together.xyz/settings/api-keys',
    perplexity: 'https://www.perplexity.ai/settings/api',
    moonshot: 'https://platform.moonshot.cn/console/api-keys',
    zhipu: 'https://open.bigmodel.cn/usercenter/apikeys',
  }
  return urls[providerId] || '#'
}

export default SettingsPanel