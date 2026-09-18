import React, { useState } from 'react'
import '../styles/AppShell.css'

export type AppTab = 'call' | 'contacts' | 'inbox'

interface AppShellProps {
  activeTab: AppTab
  onTabChange: (tab: AppTab) => void
  children: React.ReactNode
}

export const AppShell: React.FC<AppShellProps> = ({ activeTab, onTabChange, children }) => {
  return (
    <div className="app-shell">
      {/* Top brand bar */}
      <div className="app-topbar">
        <div className="app-logo">
          <span className="app-logo-icon">🛡️</span>
          <span className="app-logo-text">VoiceShield</span>
        </div>
      </div>

      {/* Tab bar */}
      <nav className="app-tabbar" role="tablist">
        <button
          role="tab"
          aria-selected={activeTab === 'call'}
          className={`tab-btn ${activeTab === 'call' ? 'active' : ''}`}
          onClick={() => onTabChange('call')}
        >
          <span className="tab-icon">📞</span>
          Call
        </button>
        <button
          role="tab"
          aria-selected={activeTab === 'inbox'}
          className={`tab-btn ${activeTab === 'inbox' ? 'active' : ''}`}
          onClick={() => onTabChange('inbox')}
        >
          <span className="tab-icon">Inbox</span>
        </button>
        <button
          role="tab"
          aria-selected={activeTab === 'contacts'}
          className={`tab-btn ${activeTab === 'contacts' ? 'active' : ''}`}
          onClick={() => onTabChange('contacts')}
        >
          <span className="tab-icon">👨‍👩‍👧</span>
          Contacts
        </button>
      </nav>

      {/* Tab content */}
      <div className="app-content" role="tabpanel">
        {children}
      </div>
    </div>
  )
}

export default AppShell
