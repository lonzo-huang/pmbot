import { useEffect } from 'react'
import { useAppStore } from '@/stores/appStore'
import { MatrixContainer } from '@/components/layout/MatrixContainer'
import { Header } from '@/components/layout/Header'
import { Sidebar } from '@/components/layout/Sidebar'
import { Dashboard } from '@/components/dashboard/Dashboard'
import { SettingsPanel } from '@/components/settings/SettingsPanel'
import { ActivityFeed } from '@/components/activity/ActivityFeed'
import { MarketsView } from '@/components/dashboard/MarketsView'
import { PortfolioView } from '@/components/portfolio/PortfolioView'

function App() {
  const { currentView, setView, addNotification } = useAppStore()
  
  useEffect(() => {
    addNotification('欢迎使用 Polymarket LLM Bot', 'info')
  }, [])
  
  const renderView = () => {
    switch (currentView) {
      case 'dashboard':
        return <Dashboard />
      case 'markets':
        return <MarketsView />
      case 'positions':
        return <PortfolioView />
      case 'activity':
        return <ActivityFeed />
      case 'settings':
        return <SettingsPanel />
      default:
        return <Dashboard />
    }
  }
  
  return (
    <MatrixContainer>
      <div className="flex h-screen">
        <Sidebar />
        <div className="flex-1 flex flex-col overflow-hidden">
          <Header />
          <main className="flex-1 overflow-auto p-6">
            {renderView()}
          </main>
        </div>
      </div>
    </MatrixContainer>
  )
}

export default App