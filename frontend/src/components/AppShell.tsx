import React from 'react'
import '../styles/AppShell.css'

export type AppTab = 'call' | 'contacts' | 'inbox'

interface AppShellProps {
  activeTab: AppTab
  onTabChange: (tab: AppTab) => void
  children: React.ReactNode
}

// SVG Icon Components
const PhoneIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
  </svg>
)

const InboxIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="22 12 16 12 14 15 10 15 8 12 2 12" />
    <path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" />
  </svg>
)

const ContactsIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
    <path d="M16 3.13a4 4 0 0 1 0 7.75" />
  </svg>
)

const ShieldIcon = () => (
  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    <path d="M9 12l2 2 4-4" />
  </svg>
)

export const AppShell: React.FC<AppShellProps> = ({ activeTab, onTabChange, children }) => {
  return (
    <div className="app-shell">
      {/* Top brand bar */}
      <div className="app-topbar">
        <div className="app-logo">
          <span className="app-logo-icon">
            <ShieldIcon />
          </span>
          <span className="app-logo-text">VoiceShield</span>
        </div>
        <div className="app-status-indicator">
          <span className="status-dot"></span>
          <span className="status-text">Protected</span>
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
          <span className="tab-icon">
            <PhoneIcon />
          </span>
          <span className="tab-label">Call</span>
          {activeTab === 'call' && <span className="tab-indicator" />}
        </button>
        <button
          role="tab"
          aria-selected={activeTab === 'inbox'}
          className={`tab-btn ${activeTab === 'inbox' ? 'active' : ''}`}
          onClick={() => onTabChange('inbox')}
        >
          <span className="tab-icon">
            <InboxIcon />
          </span>
          <span className="tab-label">Inbox</span>
          {activeTab === 'inbox' && <span className="tab-indicator" />}
        </button>
        <button
          role="tab"
          aria-selected={activeTab === 'contacts'}
          className={`tab-btn ${activeTab === 'contacts' ? 'active' : ''}`}
          onClick={() => onTabChange('contacts')}
        >
          <span className="tab-icon">
            <ContactsIcon />
          </span>
          <span className="tab-label">Contacts</span>
          {activeTab === 'contacts' && <span className="tab-indicator" />}
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
