import { useEffect } from 'react'
import { useAppStore } from '@/stores/appStore'
import { MatrixContainer } from '@/components/layout/MatrixContainer'
import { Header } from '@/components/layout/Header'
import { Sidebar } from '@/components/layout/Sidebar'
import { Dashboard } from '@/components/dashboard/Dashboard'
import { SettingsPanel } from '@/components/settings/SettingsPanel'
import { ActivityView } from '@/components/activity/ActivityView'
import { MarketsView } from '@/components/markets/MarketsView'
import { PortfolioView } from '@/components/portfolio/PortfolioView'
// ✅ 新增：导入心跳循环和记忆管理器
import { heartbeatLoop } from '@/services/agent/HeartbeatLoop'
import { memoryManager } from '@/services/agent/MemoryManager'
import { realtimeService } from '@/services/realtime/RealtimeService'
import '@/services/trading/TradingService'


function App() {
  // 使用选择器模式订阅状态
  const currentView = useAppStore((state) => state.ui.currentView)
  const addNotification = useAppStore((state) => state.addNotification)
  const setView = useAppStore((state) => state.setView)
  const handleMarketData = useAppStore((state) => state.handleMarketData)

  // ✅ 新增：获取策略状态和钱包信息
  const strategy = useAppStore((state) => state.strategy)
  const wallet = useAppStore((state) => state.wallet)
  const settings = useAppStore((state) => state.settings)

  // 初始化
  useEffect(() => {
    console.log('🚀 [App] 应用初始化')
    addNotification('欢迎使用 Polymarket LLM Bot', 'info')

    // MemoryManager 使用 localStorage，无需目录初始化
    // 预加载默认记忆内容（首次运行时自动创建）
    memoryManager.read('strategy').catch(() => {})

    // ✅ 新增：全局监听实时数据更新 Store
    const unsubscribe = realtimeService.onMessage((data) => {
      handleMarketData(data)
    })

    return () => {
      unsubscribe()
    }
  }, [])

  // ✅ 启动/停止心跳循环（自主决策核心）
  useEffect(() => {
    // 仅在纸面交易模式且策略引擎运行时启动心跳
    if (strategy.isRunning && settings.paperTradingMode) {
      // 更新心跳的本金（从钱包余额）
      heartbeatLoop.setBankroll(wallet.balance || 1000)

      // 启动自主决策循环（每分钟执行一次）
      heartbeatLoop.start(60000)
      console.log('[App] 🫀 心跳循环已启动 - 自主决策模式')
    }

    // 清理：组件卸载时停止心跳
    return () => {
      heartbeatLoop.stop()
      console.log('[App] ⏹️ 心跳循环已停止')
    }
  }, [strategy.isRunning, settings.paperTradingMode, wallet.balance])

  // 视图变化日志
  useEffect(() => {
    console.log('📺 [App] currentView 变化:', currentView)
  }, [currentView])

  // 视图渲染函数
  const renderView = () => {
    console.log('🎬 [App] 渲染视图:', currentView)
    switch (currentView) {
      case 'dashboard':
        return <Dashboard />
      case 'markets':
        return <MarketsView />
      case 'markets-polymarket':
        return <MarketsView />
      case 'markets-stockmarket':
        return <MarketsView />
      case 'positions':
        return <PortfolioView />
      case 'activity':
        return <ActivityView />
      case 'settings':
        return <SettingsPanel />
      default:
        return <Dashboard />
    }
  }

  // 错误处理
  try {
    return (
      <MatrixContainer>
        {/* 侧边栏 */}
        <Sidebar />

        {/* 主内容区域 */}
        <div
          className="flex-1 flex flex-col overflow-hidden"
          style={{ marginLeft: '16rem' }}
        >
          {/* 顶部 Header */}
          <Header />

          {/* 主内容 */}
          <main className="flex-1 overflow-auto p-6 relative" style={{ zIndex: 10 }}>
            {renderView()}
          </main>
        </div>
      </MatrixContainer>
    )
  } catch (error) {
    console.error('❌ [App] 渲染错误:', error)
    return (
      <div className="p-4 text-matrix-error">
        应用加载失败: {error instanceof Error ? error.message : '未知错误'}
        <button
          onClick={() => window.location.reload()}
          className="ml-4 px-4 py-2 bg-matrix-bg-accent border border-matrix-border-primary text-matrix-text-primary rounded hover:bg-matrix-bg-tertiary"
        >
          刷新页面
        </button>
      </div>
    )
  }
}

export default App
