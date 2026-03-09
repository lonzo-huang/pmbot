import React, { useState, useEffect } from 'react'
import { useAppStore } from '@/stores/appStore'
import { cn } from '@/utils/cn'
import { MatrixModal } from '@/components/ui/MatrixModal'
import { MatrixButton } from '@/components/ui/MatrixButton'
import { MatrixInput } from '@/components/ui/MatrixInput'
import { RPC_ENDPOINTS, CONTRACT_ADDRESSES, formatRpcError, withRetry, withTimeout } from '@/utils/rpcConfig'
import walletManager from '@/services/wallet/WalletManager'
import type { EncryptedWallet } from '@/services/wallet/WalletManager'

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
  const updateBalance = useAppStore((state) => state.updateBalance)
  const addNotification = useAppStore((state) => state.addNotification)

  const [showWalletModal, setShowWalletModal] = useState(false)
  const [showSavedWallets, setShowSavedWallets] = useState(false)
  const [seedPhrase, setSeedPhrase] = useState('')
  const [walletName, setWalletName] = useState('')
  const [walletPassword, setWalletPassword] = useState('')
  const [isConnecting, setIsConnecting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [savedWallets, setSavedWallets] = useState<EncryptedWallet[]>([])
  const [unlockPassword, setUnlockPassword] = useState('')
  const [selectedWalletId, setSelectedWalletId] = useState<string | null>(null)
  const [connectionLogs, setConnectionLogs] = useState<string[]>([])
  const [lastConnectedRpc, setLastConnectedRpc] = useState<string>('')

  // ✅ 新增：自动同步状态
  const [autoSyncEnabled, setAutoSyncEnabled] = useState(true)
  const [lastSyncTime, setLastSyncTime] = useState<Date | null>(null)
  const [maticBalance, setMaticBalance] = useState<number>(0)

  // 添加日志
  const addConnectionLog = (message: string) => {
    const timestamp = new Date().toLocaleTimeString()
    setConnectionLogs((prev) => [...prev.slice(-50), `[${timestamp}] ${message}`])
  }

  const handleClick = (viewId: string) => {
    console.log('🖱️ [Sidebar] 按钮点击:', viewId)
    setView(viewId)
  }

  const handleWalletClick = () => {
    if (wallet.isConnected) {
      if (confirm('确定要断开钱包连接吗？')) {
        disconnectWallet()
        addNotification('钱包已断开', 'info')
        addConnectionLog('钱包已断开')
      }
    } else {
      const wallets = walletManager.getWallets()
      if (wallets.length > 0) {
        setSavedWallets(wallets)
        setShowSavedWallets(true)
        addConnectionLog('打开已保存钱包列表')
      } else {
        setShowWalletModal(true)
        addConnectionLog('打开新钱包连接窗口')
      }
    }
  }

  // ✅ 完全重写的余额获取函数（带重试和超时）
  const getBalances = async (
    address: string,
    provider: any
  ): Promise<{ usdc: number; matic: number }> => {
    const result = { usdc: 0, matic: 0 }
    const ethers = await import('ethers')

    // 获取 USDC 余额（带重试）
    try {
      addConnectionLog('正在获取 USDC 余额...')
      const usdcAbi = ['function balanceOf(address) view returns (uint256)']
      const usdcContract = new ethers.Contract(CONTRACT_ADDRESSES.USDC, usdcAbi, provider)

      const balance = await withTimeout(
        withRetry(
          () => usdcContract.balanceOf(address),
          3,
          1000
        ),
        10000,
        'USDC 余额查询超时'
      )

      result.usdc = Number(ethers.formatUnits(balance, 6))
      addConnectionLog(`✅ USDC 余额：$${result.usdc.toFixed(2)}`)
    } catch (e: any) {
      console.warn('❌ USDC 余额获取失败:', e.message)
      addConnectionLog(`⚠️ USDC 余额：$0.00 (未持有)`)
      result.usdc = 0
    }

    // 获取 MATIC 余额（带重试）
    try {
      addConnectionLog('正在获取 MATIC 余额...')
      const balance = await withTimeout(
        withRetry(
          () => provider.getBalance(address),
          3,
          1000
        ),
        10000,
        'MATIC 余额查询超时'
      )

      result.matic = Number(ethers.formatEther(balance))
      addConnectionLog(`✅ MATIC 余额：${result.matic.toFixed(4)} MATIC`)
    } catch (e: any) {
      console.warn('❌ MATIC 余额获取失败:', e.message)
      addConnectionLog(`❌ MATIC 余额查询失败：${e.message}`)
      result.matic = 0
    }

    return result
  }

  // ✅ 余额同步函数（可重复调用）
  const syncBalance = async () => {
    if (!wallet.isConnected || !wallet.address) {
      return
    }

    try {
      const ethers = await import('ethers')

      // 尝试所有 RPC 节点
      for (const rpc of RPC_ENDPOINTS) {
        try {
          const provider = new ethers.JsonRpcProvider(
            rpc.url,
            { chainId: 137, name: 'polygon' },
            { staticNetwork: true, timeout: rpc.timeout }
          )
          await provider.getNetwork()

          const balances = await getBalances(wallet.address!, provider)

          // 更新 Store（只更新余额，不改变连接状态）
          updateBalance(balances.usdc)
          setMaticBalance(balances.matic)
          setLastSyncTime(new Date())

          addConnectionLog(`🔄 余额已同步：USDC $${balances.usdc.toFixed(2)} | MATIC ${balances.matic.toFixed(4)}`)
          break
        } catch {
          continue
        }
      }
    } catch (e: any) {
      addConnectionLog(`❌ 余额同步失败：${e.message}`)
    }
  }

  // ✅ 定时同步余额（每 30 秒）
  useEffect(() => {
    if (!autoSyncEnabled || !wallet.isConnected || !wallet.address) {
      return
    }

    addConnectionLog('⏰ 启用余额自动同步（每 30 秒）')

    const syncInterval = setInterval(() => {
      syncBalance()
    }, 30000) // 30 秒

    // 初始同步
    syncBalance()

    return () => {
      clearInterval(syncInterval)
      addConnectionLog('⏰ 余额自动同步已停止')
    }
  }, [autoSyncEnabled, wallet.isConnected, wallet.address])

  // ✅ 完全重写的连接函数（带详细日志和错误处理）
  const handleConnect = async () => {
    setError(null)
    setConnectionLogs([])

    if (!seedPhrase.trim()) {
      setError('请输入助记词')
      addNotification('请输入助记词', 'error')
      return
    }

    if (!walletPassword.trim()) {
      setError('请设置钱包密码')
      addNotification('请设置钱包密码', 'error')
      return
    }

    const words = seedPhrase.trim().split(/\s+/)
    if (words.length !== 12 && words.length !== 24) {
      setError('助记词必须是 12 或 24 个单词')
      addNotification('助记词格式错误', 'error')
      return
    }

    setIsConnecting(true)
    addConnectionLog('🔐 开始连接钱包...')
    addConnectionLog(`📝 助记词长度：${words.length} 个单词`)

    try {
      const ethers = await import('ethers')

      // ✅ 逐个尝试 RPC 节点
      let provider: any = null
      let successfulRpc = ''
      const failedRpcs: string[] = []

      addConnectionLog(`🔄 开始尝试 ${RPC_ENDPOINTS.length} 个 RPC 节点...`)

      for (const rpc of RPC_ENDPOINTS) {
        try {
          addConnectionLog(`🔄 尝试 RPC: ${rpc.name}`)

          const testProvider = new ethers.JsonRpcProvider(
            rpc.url,
            { chainId: 137, name: 'polygon' },
            { staticNetwork: true, timeout: rpc.timeout }
          )

          // 测试连接
          await withTimeout(
            testProvider.getNetwork(),
            rpc.timeout,
            `${rpc.name} 连接超时`
          )

          // 测试获取区块号（验证是否真正可用）
          const blockNumber = await testProvider.getBlockNumber()
          addConnectionLog(`✅ ${rpc.name} 连接成功 (区块号：${blockNumber})`)

          provider = testProvider
          successfulRpc = rpc.name
          setLastConnectedRpc(rpc.name)
          break

        } catch (e: any) {
          const errorMsg = e.message || '未知错误'
          console.warn(`❌ RPC 失败：${rpc.name} - ${errorMsg}`)
          addConnectionLog(`❌ ${rpc.name} 失败：${errorMsg}`)
          failedRpcs.push(rpc.name)
          continue
        }
      }

      if (!provider) {
        const errorMessage = `所有 ${RPC_ENDPOINTS.length} 个 RPC 节点都不可用`
        addConnectionLog(`❌ ${errorMessage}`)
        throw new Error(errorMessage)
      }

      addConnectionLog(`✅ 成功连接到 RPC: ${successfulRpc}`)

      // 创建钱包
      addConnectionLog('🔑 正在创建钱包实例...')
      const walletInstance = ethers.Wallet.fromPhrase(seedPhrase.trim(), provider)
      const address = await walletInstance.getAddress()
      addConnectionLog(`📍 钱包地址：${address}`)

      // 获取余额
      addConnectionLog('💰 正在查询余额...')
      const balances = await getBalances(address, provider)

      addConnectionLog(`💰 余额查询完成：USDC $${balances.usdc.toFixed(2)} | MATIC ${balances.matic.toFixed(4)}`)

      // 保存钱包
      if (walletName.trim()) {
        addConnectionLog(`💾 正在保存钱包 "${walletName}"...`)
        await walletManager.saveWallet(walletName.trim(), seedPhrase.trim(), walletPassword)
        addNotification(`钱包 "${walletName}" 已保存`, 'success')
        addConnectionLog(`✅ 钱包 "${walletName}" 已保存到本地`)
      }

      // 连接到 store
      connectWallet(address, balances.usdc)
      setMaticBalance(balances.matic)
      setLastSyncTime(new Date())

      const successMessage = `✅ 钱包已连接！${address.slice(0, 6)}...${address.slice(-4)} | USDC: $${balances.usdc.toFixed(2)} | MATIC: ${balances.matic.toFixed(4)}`
      addConnectionLog(successMessage)
      addNotification(successMessage, 'success')

      setShowWalletModal(false)
      setSeedPhrase('')
      setWalletName('')
      setWalletPassword('')
      setError(null)

    } catch (error: any) {
      const errorMessage = error.message || '连接失败'
      console.error('❌ 连接失败:', error)
      addConnectionLog(`❌ 连接失败：${errorMessage}`)
      setError(errorMessage)
      addNotification(`❌ 钱包连接失败：${errorMessage}`, 'error')
    } finally {
      setIsConnecting(false)
    }
  }

  // ✅ 加载已保存的钱包
  const handleLoadSavedWallet = async (walletId: string, password: string) => {
    setIsConnecting(true)
    setError(null)
    setConnectionLogs([])
    addConnectionLog(`🔐 正在加载钱包 ID: ${walletId}`)

    try {
      const mnemonic = await walletManager.getWalletMnemonic(walletId, password)

      if (!mnemonic) {
        setError('密码错误')
        addNotification('密码错误', 'error')
        addConnectionLog('❌ 密码错误，解密失败')
        setIsConnecting(false)
        return
      }

      addConnectionLog('✅ 助记词解密成功')

      const ethers = await import('ethers')

      let provider: any = null
      let successfulRpc = ''

      for (const rpc of RPC_ENDPOINTS) {
        try {
          const testProvider = new ethers.JsonRpcProvider(
            rpc.url,
            { chainId: 137, name: 'polygon' },
            { staticNetwork: true }
          )
          await testProvider.getNetwork()
          await testProvider.getBlockNumber()
          provider = testProvider
          successfulRpc = rpc.name
          addConnectionLog(`✅ 连接到 RPC: ${rpc.name}`)
          break
        } catch (e: any) {
          addConnectionLog(`❌ RPC 失败：${rpc.name} - ${e.message}`)
          continue
        }
      }

      if (!provider) {
        throw new Error('所有 RPC 节点都不可用')
      }

      const walletInstance = ethers.Wallet.fromPhrase(mnemonic, provider)
      const address = await walletInstance.getAddress()
      addConnectionLog(`📍 钱包地址：${address}`)

      const balances = await getBalances(address, provider)

      connectWallet(address, balances.usdc)
      setMaticBalance(balances.matic)
      setLastSyncTime(new Date())
      walletManager.setCurrentWallet(walletId)

      const successMessage = `✅ 钱包已加载 | USDC: $${balances.usdc.toFixed(2)} | MATIC: ${balances.matic.toFixed(4)}`
      addConnectionLog(successMessage)
      addNotification(successMessage, 'success')

      setShowSavedWallets(false)
      setUnlockPassword('')

    } catch (error: any) {
      console.error('❌ 加载失败:', error)
      addConnectionLog(`❌ 加载失败：${error.message}`)
      setError(error.message || '加载失败')
      addNotification(`❌ 加载失败：${error.message}`, 'error')
    } finally {
      setIsConnecting(false)
    }
  }

  const handleDeleteWallet = (walletId: string) => {
    if (confirm('确定要删除这个钱包吗？此操作不可恢复！')) {
      walletManager.deleteWallet(walletId)
      setSavedWallets(walletManager.getWallets())
      addNotification('钱包已删除', 'info')
      addConnectionLog('🗑️ 钱包已删除')
    }
  }

  const formatAddress = (address: string | null) => {
    if (!address) return ''
    return `${address.slice(0, 6)}...${address.slice(-8)}`
  }

  // ✅ 手动同步余额
  const handleManualSync = () => {
    addConnectionLog('🔄 手动触发余额同步...')
    syncBalance()
    addNotification('余额同步中...', 'info')
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
              style={{ cursor: 'pointer', pointerEvents: 'auto' }}
            >
              <span className="mr-3">{item.icon}</span>
              {item.label}
            </button>
          ))}
        </nav>

        {/* 钱包状态 */}
        <div className="border-t border-matrix-border-tertiary">
          <button
            onClick={handleWalletClick}
            className={cn(
              'p-4 w-full text-left',
              'hover:bg-matrix-bg-accent transition-all duration-300',
              wallet.isConnected ? 'bg-matrix-success/10' : 'bg-matrix-error/10'
            )}
            style={{ cursor: 'pointer', pointerEvents: 'auto' }}
          >
            <div className="text-xs text-matrix-text-secondary mb-2 font-mono">
              WALLET STATUS
            </div>
            {wallet.isConnected ? (
              <div className="space-y-1">
                <div className="text-sm text-matrix-success font-mono flex items-center justify-between">
                  <span>● CONNECTED</span>
                  <span className="text-xs cursor-pointer hover:text-matrix-error" onClick={(e) => {
                    e.stopPropagation()
                    disconnectWallet()
                    addNotification('钱包已断开', 'info')
                  }}>✕ 断开</span>
                </div>
                <div className="text-xs text-matrix-text-primary font-mono truncate">
                  {formatAddress(wallet.address)}
                </div>
                <div className="text-xs text-matrix-text-secondary font-mono">
                  USDC: ${wallet.balance.toFixed(2)}
                </div>
                {/* ✅ 显示 MATIC 余额 */}
                <div className="text-xs text-matrix-info font-mono">
                  MATIC: {maticBalance.toFixed(4)}
                </div>
                {/* ✅ 显示最后同步时间 */}
                {lastSyncTime && (
                  <div className="text-xs text-matrix-text-muted font-mono">
                    同步：{lastSyncTime.toLocaleTimeString()}
                  </div>
                )}
                {/* ✅ 显示自动同步状态 */}
                <div className="text-xs font-mono flex items-center gap-2 mt-1">
                  <span className={cn(
                    'w-2 h-2 rounded-full',
                    autoSyncEnabled ? 'bg-matrix-success animate-pulse' : 'bg-matrix-text-muted'
                  )} />
                  <span className="text-matrix-text-muted">自动同步：{autoSyncEnabled ? 'ON' : 'OFF'}</span>
                </div>
              </div>
            ) : (
              <div className="text-sm text-matrix-error font-mono flex items-center justify-between">
                <span>○ NOT CONNECTED</span>
                <span className="text-xs text-matrix-text-primary">点击连接 →</span>
              </div>
            )}
          </button>

          {/* ✅ 手动同步按钮（仅连接时显示） */}
          {wallet.isConnected && (
            <div className="p-2 border-t border-matrix-border-tertiary flex gap-2">
              <button
                onClick={handleManualSync}
                className="flex-1 text-xs text-matrix-text-secondary font-mono py-2 hover:bg-matrix-bg-accent rounded transition-all"
              >
                🔄 刷新余额
              </button>
              <button
                onClick={() => setAutoSyncEnabled(!autoSyncEnabled)}
                className="flex-1 text-xs text-matrix-text-secondary font-mono py-2 hover:bg-matrix-bg-accent rounded transition-all"
              >
                {autoSyncEnabled ? '⏸️ 暂停同步' : '▶️ 启用同步'}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* 新钱包连接模态框 */}
      <MatrixModal
        isOpen={showWalletModal}
        onClose={() => setShowWalletModal(false)}
        title="CONNECT WALLET"
        size="md"
        actions={
          <>
            <MatrixButton variant="secondary" onClick={() => setShowWalletModal(false)}>
              取消
            </MatrixButton>
            <MatrixButton variant="primary" onClick={handleConnect} loading={isConnecting}>
              {isConnecting ? '连接中...' : '连接钱包'}
            </MatrixButton>
          </>
        }
      >
        <div className="space-y-4">
          <MatrixInput
            value={walletName}
            onChange={setWalletName}
            placeholder="My Wallet"
            label="钱包名称（可选）"
          />
          <MatrixInput
            value={seedPhrase}
            onChange={setSeedPhrase}
            type="password"
            placeholder="word1 word2 ... word12"
            label="助记词"
            error={error || undefined}
          />
          <MatrixInput
            value={walletPassword}
            onChange={setWalletPassword}
            type="password"
            placeholder="用于加密存储"
            label="钱包密码"
          />
          <div className="text-xs text-matrix-warning font-mono p-3 border border-matrix-warning/30 rounded bg-matrix-warning/10">
            ⚠️ 助记词将加密存储在本地，密码用于解密
          </div>
          {connectionLogs.length > 0 && (
            <div className="text-xs font-mono p-3 border border-matrix-border-tertiary rounded bg-matrix-bg-tertiary max-h-40 overflow-y-auto">
              {connectionLogs.slice(-10).map((log, index) => (
                <div
                  key={index}
                  className={cn(
                    'py-0.5',
                    log.includes('✅') ? 'text-matrix-success' :
                    log.includes('❌') ? 'text-matrix-error' :
                    log.includes('⚠️') ? 'text-matrix-warning' :
                    'text-matrix-text-secondary'
                  )}
                >
                  {log}
                </div>
              ))}
            </div>
          )}
        </div>
      </MatrixModal>

      {/* 已保存钱包列表模态框 */}
      <MatrixModal
        isOpen={showSavedWallets}
        onClose={() => {
          setShowSavedWallets(false)
          setSelectedWalletId(null)
          setUnlockPassword('')
        }}
        title="选择钱包"
        size="md"
      >
        <div className="space-y-4">
          {savedWallets.length === 0 ? (
            <div className="text-center py-8 text-matrix-text-secondary">
              暂无保存的钱包
            </div>
          ) : (
            <div className="space-y-2">
              {savedWallets.map((w) => (
                <div
                  key={w.id}
                  className={cn(
                    'p-3 border rounded flex items-center justify-between',
                    selectedWalletId === w.id
                      ? 'border-matrix-success bg-matrix-success/10'
                      : 'border-matrix-border-tertiary bg-matrix-bg-tertiary'
                  )}
                >
                  <div onClick={() => setSelectedWalletId(w.id)} className="flex-1 cursor-pointer">
                    <div className="text-sm text-matrix-text-primary font-mono">{w.name}</div>
                    <div className="text-xs text-matrix-text-secondary font-mono">
                      {w.address.slice(0, 10)}...{w.address.slice(-8)}
                    </div>
                    {w.lastUsed && (
                      <div className="text-xs text-matrix-text-muted font-mono">
                        上次使用：{new Date(w.lastUsed).toLocaleString('zh-CN')}
                      </div>
                    )}
                  </div>
                  <MatrixButton
                    size="sm"
                    variant="danger"
                    onClick={() => handleDeleteWallet(w.id)}
                  >
                    🗑️
                  </MatrixButton>
                </div>
              ))}
            </div>
          )}

          {selectedWalletId && (
            <div className="border-t border-matrix-border-tertiary pt-4">
              <MatrixInput
                value={unlockPassword}
                onChange={setUnlockPassword}
                type="password"
                placeholder="输入密码解锁"
                label="钱包密码"
              />
              <div className="flex gap-2 mt-4">
                <MatrixButton
                  variant="secondary"
                  onClick={() => setSelectedWalletId(null)}
                  className="flex-1"
                >
                  取消
                </MatrixButton>
                <MatrixButton
                  variant="primary"
                  onClick={() => handleLoadSavedWallet(selectedWalletId, unlockPassword)}
                  loading={isConnecting}
                  className="flex-1"
                >
                  解锁钱包
                </MatrixButton>
              </div>
            </div>
          )}

          <div className="border-t border-matrix-border-tertiary pt-4">
            <MatrixButton
              variant="secondary"
              onClick={() => {
                setShowSavedWallets(false)
                setShowWalletModal(true)
              }}
              fullWidth
            >
              ➕ 添加新钱包
            </MatrixButton>
          </div>
        </div>
      </MatrixModal>
    </>
  )
}