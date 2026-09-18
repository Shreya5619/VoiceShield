/**
 * CallTab â€” state machine: picker â†’ incoming â†’ active
 *   'picking'  : CallerPicker shown
 *   'incoming' : IncomingCallScreen shown (full-screen)
 *   'active'   : ActiveCallScreen shown (full-screen)
 */
import React, { useState, useCallback } from 'react'
import CallerPicker, { CallerInfo } from './CallerPicker'
import IncomingCallScreen from './IncomingCallScreen'
import ActiveCallScreen from './ActiveCallScreen'

type CallPhase = 'picking' | 'incoming' | 'active'

interface CallTabProps {
  ownerPhone: string
  onGoToContacts: () => void
}

export const CallTab: React.FC<CallTabProps> = ({ ownerPhone, onGoToContacts }) => {
  const [phase, setPhase] = useState<CallPhase>('picking')
  const [caller, setCaller] = useState<CallerInfo | null>(null)

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
        onEndCall={handleEndCall}
      />
    )
  }

  // default: picking
  return (
    <CallerPicker
      ownerPhone={ownerPhone}
      onStartCall={handleStartCall}
      onGoToContacts={onGoToContacts}
    />
  )
}

export default CallTab


