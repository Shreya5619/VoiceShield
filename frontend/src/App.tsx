import { useState, useCallback } from 'react'
import ErrorBoundary from './components/ErrorBoundary'
import AppShell, { AppTab } from './components/AppShell'
import CallTab from './components/CallTab'
import ContactsTab from './components/ContactsTab'
import InboxTab from './components/InboxTab'
import DesignSystemDemo from './components/DesignSystemDemo'
import './App.css'

// Temporary: Set to true to view design system demo
const SHOW_DESIGN_DEMO = false

const PHONE_STORAGE_KEY = 'voiceshield_user_phone'

function normalizePhone(phone: string): string {
  return phone.replace(/[^\d+]/g, '')
}

// Shield Icon Component
const ShieldIcon = () => (
  <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    <path d="M9 12l2 2 4-4" />
  </svg>
)

function App() {
  const [phone, setPhone] = useState(() => localStorage.getItem(PHONE_STORAGE_KEY) ?? '')
  const [phoneInput, setPhoneInput] = useState(phone)
  const [activeTab, setActiveTab] = useState<AppTab>('call')

  const handleLogin = (event: React.FormEvent) => {
    event.preventDefault()
    const normalized = normalizePhone(phoneInput)
    if (normalized.length < 7) return
    localStorage.setItem(PHONE_STORAGE_KEY, normalized)
    setPhone(normalized)
  }

  const handleGoToContacts = useCallback(() => {
    setActiveTab('contacts')
  }, [])

  // Temporary: Show design system demo
  if (SHOW_DESIGN_DEMO) {
    return <DesignSystemDemo />
  }

  if (!phone) {
    return (
      <main className="phone-login">
        <div className="phone-login-card">
          <div className="phone-login-logo">
            <ShieldIcon />
          </div>
          <h1>Welcome to VoiceShield</h1>
          <p>Protect your calls with AI-powered scam detection and voice verification.</p>
          <form onSubmit={handleLogin}>
            <div>
              <label htmlFor="mobile-number">Mobile number</label>
              <input
                id="mobile-number"
                type="tel"
                autoComplete="tel"
                placeholder="+1 (555) 123-4567"
                value={phoneInput}
                onChange={(event) => setPhoneInput(event.target.value)}
                required
              />
            </div>
            <button type="submit">Get Started</button>
          </form>
        </div>
      </main>
    )
  }

  return (
    <ErrorBoundary>
      <AppShell activeTab={activeTab} onTabChange={setActiveTab}>
        {activeTab === 'call' ? (
          <CallTab ownerPhone={phone} onGoToContacts={handleGoToContacts} />
        ) : (
          activeTab === 'contacts' ? <ContactsTab ownerPhone={phone} /> : <InboxTab ownerPhone={phone} />
        )}
      </AppShell>
    </ErrorBoundary>
  )
}

export default App
