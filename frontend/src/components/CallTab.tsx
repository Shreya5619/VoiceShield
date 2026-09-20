/**
 * CallTab — state machine: picker → incoming → active
 *   'picking'  : CallerPicker shown
 *   'incoming' : IncomingCallScreen shown (full-screen)
 *   'active'   : ActiveCallScreen shown (full-screen)
 */
import React, { useState, useCallback, useEffect } from 'react'
import CallerPicker, { CallerInfo } from './CallerPicker'
import IncomingCallScreen from './IncomingCallScreen'
import ActiveCallScreen from './ActiveCallScreen'
import { apiUrl } from '../config/api'

type CallPhase = 'picking' | 'incoming' | 'active'

interface CallTabProps {
  ownerPhone: string
  ownerName?: string
  onGoToContacts: () => void
}

export const CallTab: React.FC<CallTabProps> = ({ ownerPhone, ownerName, onGoToContacts }) => {
  const [phase, setPhase] = useState<CallPhase>('picking')
  const [caller, setCaller] = useState<CallerInfo | null>(null)
  const [languageCode, setLanguageCode] = useState('en')
  const [isLanguageLoaded, setIsLanguageLoaded] = useState(false)

  // Load language preference on mount
  useEffect(() => {
    const loadLanguagePreference = async () => {
      try {
        const response = await fetch(apiUrl(`/api/language-preference?user_phone=${encodeURIComponent(ownerPhone)}`))
        if (response.ok) {
          const data = await response.json()
          if (data && data.language_code) {
            setLanguageCode(data.language_code)
          }
        }
      } catch (err) {
        console.error('Failed to load language preference:', err)
      } finally {
        setIsLanguageLoaded(true)
      }
    }
    loadLanguagePreference()
  }, [ownerPhone])

  const handleStartCall = useCallback((selected: CallerInfo) => {
    setCaller(selected)
    setPhase('incoming')
  }, [])

  const handleAnswer = useCallback(() => {
    // Prime speech synthesis from the user's gesture so the later voice
    // mismatch announcement is not blocked by browser autoplay policy.
    if ('speechSynthesis' in window) {
      window.speechSynthesis.resume()
      const unlockUtterance = new SpeechSynthesisUtterance('')
      unlockUtterance.volume = 0
      window.speechSynthesis.speak(unlockUtterance)
      window.speechSynthesis.cancel()
    }
    setPhase('active')
  }, [])

  const handleDecline = useCallback(() => {
    setCaller(null)
    setPhase('picking')
  }, [])

  const handleEndCall = useCallback(() => {
    setCaller(null)
    setPhase('picking')
  }, [])

  const handleLanguageChange = useCallback(async (lang: string) => {
    setLanguageCode(lang)
    try {
      await fetch(apiUrl('/api/language-preference'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_phone: ownerPhone, language_code: lang }),
      })
    } catch (err) {
      console.error('Failed to save language preference:', err)
      // Revert on error
      setLanguageCode(languageCode)
    }
  }, [ownerPhone, languageCode])

  if (!isLanguageLoaded) {
    return <div className="loading-screen">Loading...</div>
  }

  if (phase === 'incoming' && caller) {
    return (
      <IncomingCallScreen
        caller={caller}
        onAnswer={handleAnswer}
        onDecline={handleDecline}
      />
    )
  }

  if (phase === 'active' && caller) {
    return (
      <ActiveCallScreen
        caller={caller}
        ownerPhone={ownerPhone}
        ownerName={ownerName}
        onEndCall={handleEndCall}
        languageCode={languageCode}
      />
    )
  }

  // default: picking
  return (
    <CallerPicker
      ownerPhone={ownerPhone}
      onStartCall={handleStartCall}
      onGoToContacts={onGoToContacts}
      languageCode={languageCode}
      onLanguageChange={handleLanguageChange}
    />
  )
}

export default CallTab
