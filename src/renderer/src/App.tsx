import { useState } from 'react'
import Dashboard from './pages/Dashboard'
import Downloads from './pages/Downloads'
import Settings from './pages/Settings'

type Tab = 'dashboard' | 'downloads' | 'settings'

export default function App() {
  const [activeTab, setActiveTab] = useState<Tab>('dashboard')

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      <header style={{
        background: '#fff',
        borderBottom: '1px solid #e5e7eb',
        padding: '0 24px',
        display: 'flex',
        alignItems: 'center',
        gap: 32,
        height: 52,
        flexShrink: 0,
      }}>
        <span style={{ fontWeight: 700, fontSize: 16, color: '#111' }}>🧾 Belegio</span>
        <nav style={{ display: 'flex', gap: 4 }}>
          <TabButton active={activeTab === 'dashboard'} onClick={() => setActiveTab('dashboard')}>
            Konnektoren
          </TabButton>
          <TabButton active={activeTab === 'downloads'} onClick={() => setActiveTab('downloads')}>
            Verlauf
          </TabButton>
        </nav>
        <div style={{ marginLeft: 'auto' }}>
          <TabButton active={activeTab === 'settings'} onClick={() => setActiveTab('settings')}>
            ⚙ Einstellungen
          </TabButton>
        </div>
      </header>

      <main style={{ flex: 1, overflow: 'auto', padding: 24 }}>
        {activeTab === 'dashboard' && <Dashboard />}
        {activeTab === 'downloads' && <Downloads />}
        {activeTab === 'settings' && <Settings />}
      </main>
    </div>
  )
}

function TabButton({ active, onClick, children }: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      style={{
        background: active ? '#eff6ff' : 'transparent',
        color: active ? '#2563eb' : '#6b7280',
        fontWeight: active ? 600 : 400,
        borderRadius: 6,
        padding: '4px 12px',
        border: 'none',
        cursor: 'pointer',
        fontSize: 14,
      }}
    >
      {children}
    </button>
  )
}
