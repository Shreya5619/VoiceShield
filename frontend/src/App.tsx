import { useState, useCallback } from 'react'
import { Check } from 'lucide-react'
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
const NAME_STORAGE_KEY = 'voiceshield_user_name'

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
  const [name, setName] = useState(() => localStorage.getItem(NAME_STORAGE_KEY) ?? '')
  const [phoneInput, setPhoneInput] = useState(phone)
  const [nameInput, setNameInput] = useState(name)
  const [activeTab, setActiveTab] = useState<AppTab>('call')
  const [authMode, setAuthMode] = useState<'login' | 'signup'>('login')
  const [authError, setAuthError] = useState('')

  const handleLogin = (event: React.FormEvent) => {
    event.preventDefault()
    setAuthError('')
    const normalized = normalizePhone(phoneInput)
    if (normalized.length < 7) {
      setAuthError('Please enter a valid mobile number.')
      return
    }
    const trimmedName = nameInput.trim()
    if (!trimmedName) {
      setAuthError('Please enter your name.')
      return
    }
    localStorage.setItem(PHONE_STORAGE_KEY, normalized)
    localStorage.setItem(NAME_STORAGE_KEY, trimmedName)
    setPhone(normalized)
    setName(trimmedName)
  }

  const handleGoToContacts = useCallback(() => {
    setActiveTab('contacts')
  }, [])

  // Temporary: Show design system demo
  if (SHOW_DESIGN_DEMO) {
    return <DesignSystemDemo />
  }

  if (!phone) {
    const isSignup = authMode === 'signup'
    return (
      <main className="vs-landing">
        <div className="vs-landing-grid">
          {/* ── Left: pitch ─────────────────────────────── */}
          <section className="vs-hero">
            <div className="vs-brand">
              <span className="vs-brand-mark">
                <ShieldIcon />
              </span>
              <span className="vs-brand-name">VoiceShield</span>
              <span className="vs-brand-badge">BETA</span>
            </div>

            <h1 className="vs-hero-title">
              Know who&apos;s really<br />
              <span className="vs-accent">on the line.</span>
            </h1>
            <p className="vs-hero-sub">
              Real-time scam detection and voice verification for every call.
              VoiceShield listens, scores the risk, and confirms the caller is
              who they claim to be — before you say a word.
            </p>

            <ul className="vs-hero-points">
              <li>
                <span className="vs-tick"><Check size={14} strokeWidth={3} /></span>
                Live scam scoring while the call is happening
              </li>
              <li>
                <span className="vs-tick"><Check size={14} strokeWidth={3} /></span>
                Voice fingerprint verification for trusted contacts
              </li>
              <li>
                <span className="vs-tick"><Check size={14} strokeWidth={3} /></span>
                Instant alerts the moment something sounds off
              </li>
            </ul>
          </section>

          {/* ── Right: auth card ────────────────────────── */}
          <section className="vs-auth-card">
            <div className="vs-auth-head">
              <h2>{isSignup ? 'Create your account' : 'Welcome back'}</h2>
              <p>
                {isSignup
                  ? 'Set up your profile to start protecting your calls.'
                  : 'Log in with your name and mobile number to continue.'}
              </p>
            </div>

            <div className="vs-auth-toggle" role="tablist" aria-label="Authentication mode">
              <button
                type="button"
                role="tab"
                aria-selected={!isSignup}
                className={!isSignup ? 'active' : ''}
                onClick={() => { setAuthMode('login'); setAuthError('') }}
              >
                Log in
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={isSignup}
                className={isSignup ? 'active' : ''}
                onClick={() => { setAuthMode('signup'); setAuthError('') }}
              >
                Sign up
              </button>
            </div>

            <form className="vs-auth-form" onSubmit={handleLogin}>
              <div className="vs-field">
                <label htmlFor="full-name">Your name</label>
                <input
                  id="full-name"
                  type="text"
                  autoComplete="name"
                  placeholder="Jane Doe"
                  value={nameInput}
                  onChange={(event) => setNameInput(event.target.value)}
                  required
                />
              </div>
              <div className="vs-field">
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

              {authError && <p className="vs-auth-error" role="alert">{authError}</p>}

              <button type="submit" className="vs-auth-submit">
                {isSignup ? 'Create account' : 'Log in'}
              </button>
            </form>

            <p className="vs-auth-switch">
              {isSignup ? 'Already have an account?' : 'New to VoiceShield?'}{' '}
              <button
                type="button"
                onClick={() => {
                  setAuthMode(isSignup ? 'login' : 'signup')
                  setAuthError('')
                }}
              >
                {isSignup ? 'Log in' : 'Create one'}
              </button>
            </p>
          </section>
        </div>
      </main>
    )
  }

  return (
    <ErrorBoundary>
      <AppShell activeTab={activeTab} onTabChange={setActiveTab}>
        {activeTab === 'call' ? (
          <CallTab ownerPhone={phone} ownerName={name} onGoToContacts={handleGoToContacts} />
        ) : (
          activeTab === 'contacts' ? <ContactsTab ownerPhone={phone} /> : <InboxTab ownerPhone={phone} />
        )}
      </AppShell>
    </ErrorBoundary>
  )
}

export default App
