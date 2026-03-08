import React from 'react'
import { useAppStore } from '@/stores/appStore'
import { MatrixCard } from '@/components/ui/MatrixCard'
import { MatrixButton } from '@/components/ui/MatrixButton'
import { MatrixInput } from '@/components/ui/MatrixInput'
import { cn } from '@/utils/cn'

export const SettingsPanel: React.FC = () => {
  const { settings, updateSettings, addNotification } = useAppStore()
  const [localSettings, setLocalSettings] = React.useState(settings)
  const [hasChanges, setHasChanges] = React.useState(false)

  const handleChange = (key: string, value: any) => {
    setLocalSettings((prev) => ({ ...prev, [key]: value }))
    setHasChanges(true)
  }

  const handleSave = () => {
    updateSettings(localSettings)
    addNotification('设置已保存', 'success')
    setHasChanges(false)
  }

  const handleReset = () => {
    setLocalSettings(settings)
    addNotification('设置已重置', 'info')
    setHasChanges(false)
  }

  return (
    <div className="space-y-6">
      {/* Risk Management */}
      <MatrixCard title="RISK MANAGEMENT" subtitle="Position sizing and loss limits">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <MatrixInput
            label="Max Bet Percent (%)"
            type="number"
            value={localSettings.maxBetPercent}
            onChange={(v) => handleChange('maxBetPercent', Number(v))}
            min={1}
            max={50}
          />
          <MatrixInput
            label="Stop Loss Percent (%)"
            type="number"
            value={localSettings.stopLossPercent}
            onChange={(v) => handleChange('stopLossPercent', Number(v))}
            min={5}
            max={50}
          />
          <MatrixInput
            label="Take Profit Percent (%)"
            type="number"
            value={localSettings.takeProfitPercent}
            onChange={(v) => handleChange('takeProfitPercent', Number(v))}
            min={10}
            max={100}
          />
          <MatrixInput
            label="Max Daily Loss ($)"
            type="number"
            value={localSettings.maxDailyLoss}
            onChange={(v) => handleChange('maxDailyLoss', Number(v))}
            min={10}
            max={10000}
          />
        </div>
      </MatrixCard>

      {/* Trading Mode */}
      <MatrixCard title="TRADING MODE" subtitle="Paper trading vs real money">
        <div className="flex items-center gap-4">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={localSettings.paperTradingMode}
              onChange={(e) => handleChange('paperTradingMode', e.target.checked)}
              className="w-4 h-4 accent-matrix-success"
            />
            <span className="font-mono text-matrix-text-primary">Paper Trading Mode</span>
          </label>
          <span
            className={cn(
              'px-2 py-1 rounded text-xs font-mono',
              localSettings.paperTradingMode
                ? 'bg-matrix-success/20 text-matrix-success'
                : 'bg-matrix-error/20 text-matrix-error'
            )}
          >
            {localSettings.paperTradingMode ? 'SAFE' : 'REAL MONEY'}
          </span>
        </div>
      </MatrixCard>

      {/* Auto-Sell */}
      <MatrixCard title="AUTO-SELL" subtitle="Automatic position exit rules">
        <div className="space-y-4">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={localSettings.autoSellEnabled}
              onChange={(e) => handleChange('autoSellEnabled', e.target.checked)}
              className="w-4 h-4 accent-matrix-success"
            />
            <span className="font-mono text-matrix-text-primary">Enable Auto-Sell</span>
          </label>

          {localSettings.autoSellEnabled && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pl-6">
              <MatrixInput
                label="Auto Stop Loss (%)"
                type="number"
                value={localSettings.stopLossPercent}
                onChange={(v) => handleChange('stopLossPercent', Number(v))}
              />
              <MatrixInput
                label="Auto Take Profit (%)"
                type="number"
                value={localSettings.takeProfitPercent}
                onChange={(v) => handleChange('takeProfitPercent', Number(v))}
              />
            </div>
          )}
        </div>
      </MatrixCard>

      {/* Actions */}
      <div className="flex gap-4">
        <MatrixButton
          variant="primary"
          onClick={handleSave}
          disabled={!hasChanges}
        >
          💾 SAVE SETTINGS
        </MatrixButton>
        <MatrixButton variant="secondary" onClick={handleReset}>
          🔄 RESET
        </MatrixButton>
      </div>
    </div>
  )
}