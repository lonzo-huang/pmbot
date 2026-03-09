import { useEffect } from 'react'
import { useAppStore } from '@/stores/appStore'
import { MatrixContainer } from '@/components/layout/MatrixContainer'
import { Header } from '@/components/layout/Header'
import { Sidebar } from '@/components/layout/Sidebar'
import { Dashboard } from '@/components/dashboard/Dashboard'
import { SettingsPanel } from '@/components/settings/SettingsPanel'
import { ActivityView } from '@/components/activity/ActivityView'
import { MarketsView } from '@/components/dashboard/MarketsView'
import { PortfolioView } from '@/components/portfolio/PortfolioView'

function App() {
  // 使用选择器模式订阅状态
  const currentView = useAppStore((state) => state.ui.currentView)
  const addNotification = useAppStore((state) => state.addNotification)
  const setView = useAppStore((state) => state.setView)

  // 初始化
  useEffect(() => {
    console.log('🚀 [App] 应用初始化')
    addNotification('欢迎使用 Polymarket LLM Bot', 'info')
  }, [])

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
        <div className="flex h-screen">
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
        </div>
      </MatrixContainer>
    )
  } catch (error) {
    console.error('❌ [App] 渲染错误:', error)
    return (
      <MatrixContainer>
        <div className="flex items-center justify-center h-screen">
          <div className="text-center">
            <h1 className="text-2xl text-matrix-error mb-4">应用加载失败</h1>
            <p className="text-matrix-text-secondary mb-4">
              {error instanceof Error ? error.message : '未知错误'}
            </p>
            <button
              onClick={() => window.location.reload()}
              className="px-4 py-2 bg-matrix-bg-accent border border-matrix-border-primary text-matrix-text-primary rounded hover:bg-matrix-bg-tertiary"
            >
              刷新页面
            </button>
          </div>
        </div>
      </MatrixContainer>
    )
  }
}

export default App