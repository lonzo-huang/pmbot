/**
 * 钱包管理服务
 * - 加密存储钱包助记词
 * - 支持多个钱包
 * - 本地存储
 */

import { ethers } from 'ethers'

export interface WalletProfile {
  id: string
  name: string
  address: string
  createdAt: number
  lastUsed?: number
}

export interface EncryptedWallet {
  id: string
  name: string
  encryptedPhrase: string
  address: string
  createdAt: number
  lastUsed?: number
}

const STORAGE_KEY = 'polymarket_bot_wallets'
const CURRENT_WALLET_KEY = 'polymarket_bot_current_wallet'

class WalletManager {
  /**
   * 生成加密密钥（从主密码派生）
   */
  private async deriveKey(password: string): Promise<CryptoKey> {
    const encoder = new TextEncoder()
    const keyMaterial = await crypto.subtle.importKey(
      'raw',
      encoder.encode(password),
      { name: 'PBKDF2' },
      false,
      ['deriveBits', 'deriveKey']
    )

    return crypto.subtle.deriveKey(
      {
        name: 'PBKDF2',
        salt: encoder.encode('polymarket_bot_salt_v1'),
        iterations: 100000,
        hash: 'SHA-256',
      },
      keyMaterial,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt']
    )
  }

  /**
   * 加密助记词
   */
  async encryptMnemonic(mnemonic: string, password: string): Promise<string> {
    try {
      const key = await this.deriveKey(password)
      const encoder = new TextEncoder()
      const iv = crypto.getRandomValues(new Uint8Array(12))

      const encrypted = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv },
        key,
        encoder.encode(mnemonic)
      )

      // 组合 IV + 密文 + 认证标签
      const combined = new Uint8Array(iv.length + encrypted.byteLength)
      combined.set(iv, 0)
      combined.set(new Uint8Array(encrypted), iv.length)

      return btoa(String.fromCharCode(...combined))
    } catch (error) {
      console.error('加密失败:', error)
      throw new Error('加密失败')
    }
  }

  /**
   * 解密助记词
   */
  async decryptMnemonic(encrypted: string, password: string): Promise<string> {
    try {
      const key = await this.deriveKey(password)
      const combined = Uint8Array.from(atob(encrypted), c => c.charCodeAt(0))

      const iv = combined.slice(0, 12)
      const data = combined.slice(12)

      const decrypted = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv },
        key,
        data
      )

      const decoder = new TextDecoder()
      return decoder.decode(decrypted)
    } catch (error) {
      console.error('解密失败:', error)
      throw new Error('密码错误或数据损坏')
    }
  }

  /**
   * 保存钱包
   */
  async saveWallet(
    name: string,
    mnemonic: string,
    password: string
  ): Promise<WalletProfile> {
    const provider = new ethers.JsonRpcProvider('https://polygon-rpc.com')
    const wallet = ethers.Wallet.fromPhrase(mnemonic, provider)
    const address = await wallet.getAddress()

    const encryptedPhrase = await this.encryptMnemonic(mnemonic, password)

    const walletData: EncryptedWallet = {
      id: crypto.randomUUID(),
      name,
      encryptedPhrase,
      address,
      createdAt: Date.now(),
    }

    // 获取现有钱包列表
    const wallets = this.getWallets()
    wallets.push(walletData)

    // 保存到本地存储
    localStorage.setItem(STORAGE_KEY, JSON.stringify(wallets))

    return {
      id: walletData.id,
      name: walletData.name,
      address: walletData.address,
      createdAt: walletData.createdAt,
    }
  }

  /**
   * 获取所有钱包（不_decrypt 助记词）
   */
  getWallets(): EncryptedWallet[] {
    try {
      const data = localStorage.getItem(STORAGE_KEY)
      return data ? JSON.parse(data) : []
    } catch {
      return []
    }
  }

  /**
   * 获取钱包助记词（需要密码）
   */
  async getWalletMnemonic(
    walletId: string,
    password: string
  ): Promise<string | null> {
    const wallets = this.getWallets()
    const wallet = wallets.find(w => w.id === walletId)

    if (!wallet) {
      return null
    }

    try {
      const mnemonic = await this.decryptMnemonic(wallet.encryptedPhrase, password)

      // 更新最后使用时间
      wallet.lastUsed = Date.now()
      localStorage.setItem(STORAGE_KEY, JSON.stringify(wallets))
      localStorage.setItem(CURRENT_WALLET_KEY, walletId)

      return mnemonic
    } catch {
      return null
    }
  }

  /**
   * 删除钱包
   */
  deleteWallet(walletId: string): boolean {
    const wallets = this.getWallets()
    const filtered = wallets.filter(w => w.id !== walletId)

    if (filtered.length === wallets.length) {
      return false
    }

    localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered))
    return true
  }

  /**
   * 获取当前选中的钱包 ID
   */
  getCurrentWalletId(): string | null {
    return localStorage.getItem(CURRENT_WALLET_KEY)
  }

  /**
   * 设置当前钱包
   */
  setCurrentWallet(walletId: string): void {
    localStorage.setItem(CURRENT_WALLET_KEY, walletId)
  }

  /**
   * 验证密码是否正确
   */
  async verifyPassword(walletId: string, password: string): Promise<boolean> {
    const mnemonic = await this.getWalletMnemonic(walletId, password)
    return mnemonic !== null
  }

  /**
   * 获取钱包数量
   */
  getWalletCount(): number {
    return this.getWallets().length
  }
}

export const walletManager = new WalletManager()
export default walletManager