/**
 * 测试仓位弹窗
 * 放置位置：src/components/markets/TestPositionModal.tsx
 *
 * 功能：手动添加一个测试仓位，用于验证 PnL 计算和持仓面板显示
 */

import React, { useState, useMemo } from 'react'
import { MatrixModal } from '@/components/ui/MatrixModal'
import { MatrixButton } from '@/components/ui/MatrixButton'
import { useAppStore } from '@/stores/appStore'

interface MarketOption {
  id: string
  question: string
  outcomePrices: number[]
  assetIds: string[]
}

interface TestPositionModalProps {
  isOpen: boolean
  onClose: () => void
  markets: MarketOption[]
}

export const TestPositionModal: React.FC<TestPositionModalProps> = ({
  isOpen,
  onClose,
  markets,
}) => {
  const { addPosition, addNotification } = useAppStore()

  const [selectedMarketId, setSelectedMarketId] = useState('')
  const [direction, setDirection] = useState<'YES' | 'NO'>('YES')
  const [amount, setAmount] = useState('50')
  const [entryPrice, setEntryPrice] = useState('0.42')
  const [currentPrice, setCurrentPrice] = useState('0.45')

  const selectedMarket = useMemo(
    () => markets.find(m => m.id === selectedMarketId),
    [markets, selectedMarketId]
  )

  // 当选择市场时，自动填入当前价格
  const handleMarketChange = (id: string) => {
    setSelectedMarketId(id)
    const market = markets.find(m => m.id === id)
    if (market) {
      const priceIndex = direction === 'YES' ? 0 : 1
      const price = market.outcomePrices[priceIndex] ?? 0.5
      setCurrentPrice(price.toFixed(4))
      setEntryPrice(price.toFixed(4))
    }
  }

  const handleDirectionChange = (dir: 'YES' | 'NO') => {
    setDirection(dir)
    if (selectedMarket) {
      const priceIndex = dir === 'YES' ? 0 : 1
      const price = selectedMarket.outcomePrices[priceIndex] ?? 0.5
      setCurrentPrice(price.toFixed(4))
    }
  }

  // 计算预估 PnL
  const estimatedPnL = useMemo(() => {
    const entry = parseFloat(entryPrice) || 0
    const current = parseFloat(currentPrice) || 0
    const amt = parseFloat(amount) || 0
    if (entry <= 0) return 0
    // PnL = (current - entry) / entry * amount
    return ((current - entry) / entry) * amt
  }, [entryPrice, currentPrice, amount])

  const handleAddPosition = () => {
    if (!selectedMarket) {
      addNotification('Please select a market', 'error')
      return
    }

    const entry = parseFloat(entryPrice)
    const current = parseFloat(currentPrice)
    const amt = parseFloat(amount)

    if (isNaN(entry) || entry <= 0 || entry > 1) {
      addNotification('Entry price must be between 0 and 1', 'error')
      return
    }
    if (isNaN(amt) || amt <= 0) {
      addNotification('Amount must be greater than 0', 'error')
      return
    }

    const tokenId = selectedMarket.assetIds[direction === 'YES' ? 0 : 1]
      ?? selectedMarket.assetIds[0]
      ?? selectedMarket.id

    const position = {
      tokenId,
      marketId: selectedMarket.id,
      marketQuestion: selectedMarket.question,
      outcome: direction,
      outcomeIndex: direction === 'YES' ? 0 : 1,
      size: amt,
      entryPrice: entry,
      currentPrice: isNaN(current) ? entry : current,
      pnl: {
        dollar: estimatedPnL,
        percent: entry > 0 ? (estimatedPnL / (entry * amt)) : 0,
      },
      entryTime: new Date(),
      lastUpdate: new Date(),
    }

    addPosition(position)
    addNotification(
      `Test position added: ${selectedMarket.question.substring(0, 40)}...`,
      'success'
    )
    handleClose()
  }

  const handleClose = () => {
    setSelectedMarketId('')
    setDirection('YES')
    setAmount('50')
    setEntryPrice('0.42')
    setCurrentPrice('0.45')
    onClose()
  }

  return (
    <MatrixModal
      isOpen={isOpen}
      onClose={handleClose}
      title="Add Test Position"
      size="md"
    >
      <div className="space-y-4">
        {/* Market 选择 */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs text-matrix-text-secondary font-mono mb-1">
              Market
            </label>
            <select
              value={selectedMarketId}
              onChange={e => handleMarketChange(e.target.value)}
              className="w-full bg-matrix-bg-tertiary border border-matrix-border-primary rounded px-3 py-2 text-xs font-mono text-matrix-text-primary focus:outline-none focus:border-matrix-success"
            >
              <option value="">Select a market...</option>
              {markets.length === 0 ? (
                <option disabled value="">
                  No markets loaded — add from Popular Markets first
                </option>
              ) : (
                markets.map(m => (
                  <option key={m.id} value={m.id}>
                    {m.question.length > 50
                      ? m.question.substring(0, 50) + '...'
                      : m.question}
                  </option>
                ))
              )}
            </select>
            {markets.length === 0 && (
              <p className="text-matrix-warning text-xs font-mono mt-1">
                ⚠️ Add markets via 🔥 Popular Markets first
              </p>
            )}
          </div>

          {/* Direction */}
          <div>
            <label className="block text-xs text-matrix-text-secondary font-mono mb-1">
              Direction
            </label>
            <select
              value={direction}
              onChange={e => handleDirectionChange(e.target.value as 'YES' | 'NO')}
              className="w-full bg-matrix-bg-tertiary border border-matrix-border-primary rounded px-3 py-2 text-xs font-mono text-matrix-text-primary focus:outline-none focus:border-matrix-success"
            >
              <option value="YES">YES</option>
              <option value="NO">NO</option>
            </select>
          </div>
        </div>

        {/* Amount + Entry Price */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs text-matrix-text-secondary font-mono mb-1">
              Amount (USDC)
            </label>
            <input
              type="number"
              value={amount}
              onChange={e => setAmount(e.target.value)}
              min="1"
              step="1"
              className="w-full bg-matrix-bg-tertiary border border-matrix-border-primary rounded px-3 py-2 text-sm font-mono text-matrix-text-primary focus:outline-none focus:border-matrix-success"
            />
          </div>

          <div>
            <label className="block text-xs text-matrix-text-secondary font-mono mb-1">
              Entry Price (¢)
            </label>
            <input
              type="number"
              value={entryPrice}
              onChange={e => setEntryPrice(e.target.value)}
              min="0.001"
              max="0.999"
              step="0.001"
              className="w-full bg-matrix-bg-tertiary border border-matrix-border-primary rounded px-3 py-2 text-sm font-mono text-matrix-text-primary focus:outline-none focus:border-matrix-success"
            />
          </div>
        </div>

        {/* Current Price */}
        <div>
          <label className="block text-xs text-matrix-text-secondary font-mono mb-1">
            Current Price (¢)
          </label>
          <input
            type="number"
            value={currentPrice}
            onChange={e => setCurrentPrice(e.target.value)}
            min="0.001"
            max="0.999"
            step="0.001"
            className="w-full bg-matrix-bg-tertiary border border-matrix-border-primary rounded px-3 py-2 text-sm font-mono text-matrix-text-primary focus:outline-none focus:border-matrix-success"
          />
        </div>

        {/* Estimated PnL */}
        <div className={`p-4 rounded border ${estimatedPnL >= 0 ? 'border-matrix-success/40 bg-matrix-success/5' : 'border-matrix-error/40 bg-matrix-error/5'}`}>
          <div className="text-xs text-matrix-text-secondary font-mono mb-1">
            Estimated PnL:
          </div>
          <div className={`text-xl font-bold font-mono ${estimatedPnL >= 0 ? 'text-matrix-success' : 'text-matrix-error'}`}>
            {estimatedPnL >= 0 ? '+' : ''}${estimatedPnL.toFixed(2)}
          </div>
          {parseFloat(entryPrice) > 0 && (
            <div className={`text-xs font-mono mt-1 ${estimatedPnL >= 0 ? 'text-matrix-success' : 'text-matrix-error'}`}>
              {(((parseFloat(currentPrice) - parseFloat(entryPrice)) / parseFloat(entryPrice)) * 100).toFixed(2)}%
            </div>
          )}
        </div>

        {/* Buttons */}
        <div className="flex justify-end gap-3 pt-2 border-t border-matrix-border-tertiary">
          <MatrixButton variant="secondary" onClick={handleClose}>
            Cancel
          </MatrixButton>
          <MatrixButton
            variant="primary"
            onClick={handleAddPosition}
            disabled={!selectedMarketId}
          >
            Add Position
          </MatrixButton>
        </div>
      </div>
    </MatrixModal>
  )
}