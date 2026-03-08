import { useState, useEffect, useCallback } from 'react'
import { useAppStore } from '@/stores/appStore'
import { WalletService } from '@/services/wallet/walletService'
import { formatAddress } from '@/utils/formatting'

const walletService = new WalletService()

export function useWallet() {
  const { wallet, connectWallet, disconnectWallet, updateBalance } = useAppStore()
  const [isConnecting, setIsConnecting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  
  // Connect with seed phrase
  const connectWithSeedPhrase = useCallback(
    async (seedPhrase: string) => {
      setIsConnecting(true)
      setError(null)

      try {
        const walletState = await walletService.connectWithSeedPhrase(seedPhrase)
        connectWallet(walletState.address!, walletState.balance)
        return { success: true }
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Connection failed'
        setError(errorMessage)
        return { success: false, error: errorMessage }
      } finally {
        setIsConnecting(false)
      }
    },
    [connectWallet]
  )
  
  // Disconnect wallet
  const disconnect = useCallback(() => {
    walletService.disconnect()
    disconnectWallet()
    setError(null)
  }, [disconnectWallet])
  
  // Refresh balance
  const refreshBalance = useCallback(async () => {
    if (!wallet.address) return

    try {
      const balance = await walletService.getUSDCBalance(wallet.address)
      updateBalance(Number(balance))
    } catch (err) {
      console.error('Failed to refresh balance:', err)
    }
  }, [wallet.address, updateBalance])
  
  // Auto-refresh balance every 30 seconds
  useEffect(() => {
    if (!wallet.isConnected) return

    refreshBalance()
    const interval = setInterval(refreshBalance, 30000)

    return () => clearInterval(interval)
  }, [wallet.isConnected, refreshBalance])
  
  // Check approvals
  const checkApprovals = useCallback(async () => {
    if (!wallet.address) return { usdc: false, ctf: false }

    try {
      return await walletService.checkApprovals(wallet.address)
    } catch (err) {
      console.error('Failed to check approvals:', err)
      return { usdc: false, ctf: false }
    }
  }, [wallet.address])
  
  // Approve USDC
  const approveUSDC = useCallback(
    async (amount: number) => {
      try {
        const txHash = await walletService.approveUSDC(BigInt(Math.floor(amount * 1e6)))
        return { success: true, txHash }
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Approval failed'
        return { success: false, error: errorMessage }
      }
    },
    []
  )
  
  // Approve CTF
  const approveCTF = useCallback(async () => {
    try {
      const txHash = await walletService.approveCTF()
      return { success: true, txHash }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Approval failed'
      return { success: false, error: errorMessage }
    }
  }, [])
  
  return {
    // State
    wallet,
    isConnecting,
    error,

    // Actions
    connectWithSeedPhrase,
    disconnect,
    refreshBalance,
    checkApprovals,
    approveUSDC,
    approveCTF,

    // Formatters
    formattedAddress: wallet.address ? formatAddress(wallet.address) : null,
  }
}