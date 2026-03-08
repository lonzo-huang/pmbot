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
  const currentView = useAppStore((state) => state.ui.currentView)
  const addNotification = useAppStore((state) => state.addNotification)

  useEffect(() => {
    console.log('🔄 [App] currentView 变化:', currentView)
    addNotification('欢迎使用 Polymarket LLM Bot', 'info')
  }, [])

  const renderView = () => {
    console.log('📺 [App] 渲染视图:', currentView)

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

  return (
    <MatrixContainer>
      {/* ✅ 关键：侧边栏 */}
      <Sidebar />

      {/* ✅ 关键：主内容区域，添加 ml-64 给侧边栏留空间 */}
      <div className="flex-1 flex flex-col overflow-hidden" style={{ marginLeft: '16rem' }}>
        <Header />
        <main className="flex-1 overflow-auto p-6 relative" style={{ zIndex: 10 }}>
          {renderView()}
        </main>
      </div>
    </MatrixContainer>
  )
}

export default App