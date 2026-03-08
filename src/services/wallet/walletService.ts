import { ethers } from 'ethers'
import { WalletState } from '@/types'

export class WalletService {
  private provider: ethers.Provider | null = null
  private signer: ethers.Signer | null = null
  private wallet: ethers.Wallet | null = null
  
  // Polygon Mainnet
  private readonly POLYGON_CHAIN_ID = 137
  private readonly RPC_URL = 'https://polygon-rpc.com'
  
  // Contract Addresses
  private readonly USDC_ADDRESS = '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174'
  private readonly CTF_ADDRESS = '0x4D97DCd97eC945f40cF65F87097ACe5EA0476045'
  private readonly EXCHANGE_ADDRESS = '0x4bFB41d5B3570DeFd03C39a9A4D8dE6Bd8B8982E'
  
  async connectWithSeedPhrase(seedPhrase: string): Promise<WalletState> {
    try {
      this.provider = new ethers.JsonRpcProvider(this.RPC_URL)
      this.wallet = ethers.Wallet.fromPhrase(seedPhrase, this.provider)
      this.signer = this.wallet
      
      const address = await this.wallet.getAddress()
      const balance = await this.getUSDCBalance(address)
      const chainId = (await this.provider.getNetwork()).chainId
      
      // 检查代币授权
      const approvals = await this.checkApprovals(address)
      
      return {
        address,
        balance: Number(ethers.formatUnits(balance, 6)),
        isConnected: true,
        chainId: Number(chainId),
        approvals
      }
    } catch (error) {
      console.error('Wallet connection failed:', error)
      throw error
    }
  }
  
  async getUSDCBalance(address: string): Promise<bigint> {
    const usdcAbi = ['function balanceOf(address) view returns (uint256)']
    const contract = new ethers.Contract(this.USDC_ADDRESS, usdcAbi, this.provider!)
    return await contract.balanceOf(address)
  }
  
  async checkApprovals(address: string): Promise<{ usdc: boolean; ctf: boolean }> {
    // 简化版本 - 实际实现需要调用合约检查
    return { usdc: false, ctf: false }
  }
  
  async approveUSDC(amount: bigint): Promise<string> {
    const usdcAbi = ['function approve(address spender, uint256 amount) returns (bool)']
    const contract = new ethers.Contract(this.USDC_ADDRESS, usdcAbi, this.signer!)
    const tx = await contract.approve(this.EXCHANGE_ADDRESS, amount)
    await tx.wait()
    return tx.hash
  }
  
  async approveCTF(): Promise<string> {
    const ctfAbi = ['function setApprovalForAll(address operator, bool approved) returns (bool)']
    const contract = new ethers.Contract(this.CTF_ADDRESS, ctfAbi, this.signer!)
    const tx = await contract.setApprovalForAll(this.EXCHANGE_ADDRESS, true)
    await tx.wait()
    return tx.hash
  }
  
  getSigner(): ethers.Signer | null {
    return this.signer
  }
  
  getAddress(): string | null {
    return this.wallet?.address || null
  }
  
  disconnect() {
    this.wallet = null
    this.signer = null
  }
}