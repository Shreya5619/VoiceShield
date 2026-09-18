import { useState, useCallback } from 'react'
import ErrorBoundary from './components/ErrorBoundary'
import AppShell, { AppTab } from './components/AppShell'
import CallTab from './components/CallTab'
import ContactsTab from './components/ContactsTab'
import './App.css'

const PHONE_STORAGE_KEY = 'voiceshield_user_phone'

function normalizePhone(phone: string): string {
  return phone.replace(/[^\d+]/g, '')
}

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

  if (!phone) {
    return (
      <main className="phone-login">
        <div className="phone-login-card">
          <div className="phone-login-logo">🛡️</div>
          <h1>Welcome to VoiceShield</h1>
          <p>Enter your mobile number to access your protected call space.</p>
          <form onSubmit={handleLogin}>
            <label htmlFor="mobile-number">Mobile number</label>
            <input
              id="mobile-number"
              type="tel"
              autoComplete="tel"
              placeholder="e.g. +1 555 123 4567"
              value={phoneInput}
              onChange={(event) => setPhoneInput(event.target.value)}
              required
            />
            <button type="submit">Continue</button>
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
          <ContactsTab ownerPhone={phone} />
        )}
      </AppShell>
    </ErrorBoundary>
  )
}

export default App
