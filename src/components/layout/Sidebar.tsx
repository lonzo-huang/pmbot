import React, { useState } from 'react'
import { useAppStore } from '@/stores/appStore'
import { cn } from '@/utils/cn'
import { MatrixModal } from '@/components/ui/MatrixModal'
import { MatrixButton } from '@/components/ui/MatrixButton'
import { MatrixInput } from '@/components/ui/MatrixInput'

const navItems = [
  { id: 'dashboard', label: 'DASHBOARD', icon: '📊' },
  { id: 'markets', label: 'MARKETS', icon: '🔍' },
  { id: 'positions', label: 'POSITIONS', icon: '💼' },
  { id: 'activity', label: 'ACTIVITY', icon: '📝' },
  { id: 'settings', label: 'SETTINGS', icon: '⚙️' },
]

export const Sidebar: React.FC = () => {
  const currentView = useAppStore((state) => state.ui.currentView)
  const setView = useAppStore((state) => state.setView)
  const wallet = useAppStore((state) => state.wallet)
  const connectWallet = useAppStore((state) => state.connectWallet)
  const disconnectWallet = useAppStore((state) => state.disconnectWallet)
  const addNotification = useAppStore((state) => state.addNotification)

  const [showWalletModal, setShowWalletModal] = useState(false)
  const [seedPhrase, setSeedPhrase] = useState('')
  const [isConnecting, setIsConnecting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleClick = (viewId: string) => {
    console.log('🖱️ [Sidebar] 按钮点击:', viewId)
    setView(viewId)
  }

  const handleWalletClick = () => {
    if (wallet.isConnected) {
      if (confirm('确定要断开钱包连接吗？')) {
        disconnectWallet()
        addNotification('钱包已断开', 'info')
      }
    } else {
      setShowWalletModal(true)
    }
  }

  const handleConnect = async () => {
    setError(null)

    if (!seedPhrase.trim()) {
      setError('请输入助记词')
      addNotification('请输入助记词', 'error')
      return
    }

    // 验证助记词格式（12 或 24 个单词）
    const words = seedPhrase.trim().split(/\s+/)
    if (words.length !== 12 && words.length !== 24) {
      setError('助记词必须是 12 或 24 个单词')
      addNotification('助记词格式错误，需要 12 或 24 个单词', 'error')
      return
    }

    setIsConnecting(true)

    try {
      console.log('🔐 [Wallet] 开始连接钱包...')

      // 动态导入 ethers（避免 SSR 问题）
      const { ethers } = await import('ethers')

      // 使用 Polygon RPC
      const provider = new ethers.JsonRpcProvider('https://polygon-rpc.com')

      // ✅ ethers v6 正确用法：fromPhrase
      let walletInstance: ethers.Wallet

      try {
        walletInstance = ethers.Wallet.fromPhrase(seedPhrase.trim(), provider)
        console.log('✅ [Wallet] 钱包创建成功')
      } catch (phraseError) {
        console.error('助记词错误:', phraseError)
        throw new Error('助记词无效，请检查是否正确')
      }

      // 获取钱包地址
      const address = await walletInstance.getAddress()
      console.log('📍 [Wallet] 钱包地址:', address)

      // 获取 MATIC 余额（用于 Gas）
      const maticBalance = await provider.getBalance(address)
      const maticBalanceFormatted = Number(ethers.formatEther(maticBalance))

      // 获取 USDC 余额
      const usdcAddress = '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174'
      const usdcAbi = ['function balanceOf(address) view returns (uint256)']
      const usdcContract = new ethers.Contract(usdcAddress, usdcAbi, provider)
      const usdcBalance = await usdcContract.balanceOf(address)
      const usdcBalanceFormatted = Number(ethers.formatUnits(usdcBalance, 6))

      console.log('💰 [Wallet] MATIC 余额:', maticBalanceFormatted)
      console.log('💰 [Wallet] USDC 余额:', usdcBalanceFormatted)

      // 连接到 store
      connectWallet(address, usdcBalanceFormatted)

      addNotification(
        `钱包已连接：${address.slice(0, 6)}...${address.slice(-4)} | USDC: $${usdcBalanceFormatted.toFixed(2)}`,
        'success'
      )

      setShowWalletModal(false)
      setSeedPhrase('')

    } catch (error) {
      console.error('❌ [Wallet] 连接失败:', error)
      const errorMessage = error instanceof Error ? error.message : '连接失败'
      setError(errorMessage)
      addNotification(`钱包连接失败：${errorMessage}`, 'error')
    } finally {
      setIsConnecting(false)
    }
  }

  const formatAddress = (address: string | null) => {
    if (!address) return ''
    return `${address.slice(0, 6)}...${address.slice(-8)}`
  }

  return (
    <>
      <div
        className="w-64 h-screen fixed left-0 top-0 bg-matrix-bg-secondary border-r border-matrix-border-tertiary flex flex-col"
        style={{ zIndex: 100 }}
      >
        {/* Logo */}
        <div className="p-6 border-b border-matrix-border-tertiary flex-shrink-0">
          <h1 className="text-xl font-bold text-matrix-text-primary text-glow font-mono">
            POLYMARKET
          </h1>
          <p className="text-xs text-matrix-text-secondary mt-1 font-mono">
            LLM TRADING BOT v1.0
          </p>
        </div>

        {/* Navigation */}
        <nav className="p-4 space-y-2 flex-1 overflow-y-auto">
          {navItems.map((item) => (
            <button
              key={item.id}
              onClick={() => handleClick(item.id)}
              className={cn(
                'w-full text-left px-4 py-3 rounded border transition-all duration-300 font-mono text-sm',
                currentView === item.id
                  ? 'bg-matrix-bg-accent border-matrix-border-primary text-matrix-text-primary'
                  : 'bg-transparent border-matrix-border-tertiary text-matrix-text-secondary hover:border-matrix-border-primary hover:text-matrix-text-primary'
              )}
              style={{
                cursor: 'pointer',
                pointerEvents: 'auto',
              }}
            >
              <span className="mr-3">{item.icon}</span>
              {item.label}
            </button>
          ))}
        </nav>

        {/* 钱包状态 - 可点击按钮 */}
        <button
          onClick={handleWalletClick}
          className={cn(
            'p-4 border-t border-matrix-border-tertiary w-full text-left',
            'hover:bg-matrix-bg-accent transition-all duration-300',
            wallet.isConnected ? 'bg-matrix-success/10' : 'bg-matrix-error/10'
          )}
          style={{
            cursor: 'pointer',
            pointerEvents: 'auto',
          }}
        >
          <div className="text-xs text-matrix-text-secondary mb-2 font-mono">
            WALLET STATUS
          </div>
          {wallet.isConnected ? (
            <div className="space-y-1">
              <div className="text-sm text-matrix-success font-mono flex items-center justify-between">
                <span>● CONNECTED</span>
                <span className="text-xs">✕ 断开</span>
              </div>
              <div className="text-xs text-matrix-text-primary font-mono truncate">
                {formatAddress(wallet.address)}
              </div>
              <div className="text-xs text-matrix-text-secondary font-mono">
                ${wallet.balance.toFixed(2)} USDC
              </div>
            </div>
          ) : (
            <div className="text-sm text-matrix-error font-mono flex items-center justify-between">
              <span>○ NOT CONNECTED</span>
              <span className="text-xs text-matrix-text-primary">点击连接 →</span>
            </div>
          )}
        </button>
      </div>

      {/* 钱包连接模态框 */}
      <MatrixModal
        isOpen={showWalletModal}
        onClose={() => setShowWalletModal(false)}
        title="CONNECT WALLET"
        size="md"
        actions={
          <>
            <MatrixButton
              variant="secondary"
              onClick={() => setShowWalletModal(false)}
            >
              取消
            </MatrixButton>
            <MatrixButton
              variant="primary"
              onClick={handleConnect}
              loading={isConnecting}
            >
              {isConnecting ? '连接中...' : '连接钱包'}
            </MatrixButton>
          </>
        }
      >
        <div className="space-y-4">
          <div className="text-sm text-matrix-text-secondary font-mono">
            请输入您的 MetaMask 助记词（12 或 24 个单词）：
          </div>
          <MatrixInput
            value={seedPhrase}
            onChange={setSeedPhrase}
            type="password"
            placeholder="word1 word2 word3 ... word12"
            label="助记词"
            error={error || undefined}
          />
          <div className="text-xs text-matrix-warning font-mono p-3 border border-matrix-warning/30 rounded bg-matrix-warning/10">
            ⚠️ 安全提示：助记词仅存储在本地，不会上传到任何服务器。但仍建议使用专用测试钱包。
          </div>
          <div className="text-xs text-matrix-info font-mono p-3 border border-matrix-info/30 rounded bg-matrix-info/10">
            💡 提示：需要 Polygon 网络上的 USDC 余额才能交易。请确保钱包有足够余额。
          </div>
        </div>
      </MatrixModal>
    </>
  )
}