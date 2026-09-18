import { useState, useCallback } from 'react'
import ErrorBoundary from './components/ErrorBoundary'
import AppShell, { AppTab } from './components/AppShell'
import CallTab from './components/CallTab'
import ContactsTab from './components/ContactsTab'

function App() {
  const [activeTab, setActiveTab] = useState<AppTab>('call')

  const handleGoToContacts = useCallback(() => {
    setActiveTab('contacts')
  }, [])

  return (
    <ErrorBoundary>
      <AppShell activeTab={activeTab} onTabChange={setActiveTab}>
        {activeTab === 'call' ? (
          <CallTab onGoToContacts={handleGoToContacts} />
        ) : (
          <ContactsTab />
        )}
      </AppShell>
    </ErrorBoundary>
  )
}

export default App
