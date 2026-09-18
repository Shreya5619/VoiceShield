/**
 * VoiceMismatchOverlay
 *
 * Shown when the live voice does not match the stored embedding (< 60%).
 * - Speaks "Voice mismatch detected. <security question>" via SpeechSynthesis
 * - Displays match percentage and the security question from the contact record
 * - Listens for a spoken answer, Trust This Call → verified, End Call → end
 */
import React, { useEffect, useRef, useState, useCallback } from 'react'
import { FamilyContact } from '../hooks/useFamilyContacts'
import { VoiceMatchResult } from '../hooks/useVoiceMatch'

const DEFAULT_QUESTION = 'What is your full name?'

interface VoiceMismatchOverlayProps {
  contact: FamilyContact
  matchResult: VoiceMatchResult
  onVerified: () => void   // answer submitted OR trust override
  onEndCall: () => void    // mark as scam & end
}

export const VoiceMismatchOverlay: React.FC<VoiceMismatchOverlayProps> = ({
  contact,
  matchResult,
  onVerified,
  onEndCall,
}) => {
  const question = contact.securityQuestion?.trim() || DEFAULT_QUESTION
  const [spokenAnswer, setSpokenAnswer] = useState('')
  const [listenState, setListenState] = useState<'asking' | 'listening' | 'heard' | 'unavailable'>('asking')
  const spokenRef = useRef(false)
  const recognitionRef = useRef<any>(null)

  const startListening = useCallback(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (!SpeechRecognition) {
      setListenState('unavailable')
      return
    }

    const recognition = new SpeechRecognition()
    recognition.lang = 'en-US'
    recognition.continuous = false
    recognition.interimResults = false
    recognition.maxAlternatives = 1
    recognition.onstart = () => setListenState('listening')
    recognition.onresult = (event: any) => {
      const transcript = event.results?.[0]?.[0]?.transcript?.trim() || ''
      if (!transcript) return
      setSpokenAnswer(transcript)
      setListenState('heard')
      recognition.stop()
      onVerified()
    }
    recognition.onerror = () => setListenState('unavailable')
    recognition.onend = () => {
      recognitionRef.current = null
    }
    recognitionRef.current = recognition
    recognition.start()
  }, [onVerified])

  const askQuestion = useCallback(() => {
    window.speechSynthesis.cancel()
    window.speechSynthesis.resume()
    const utt = new SpeechSynthesisUtterance(
      `Your call is on hold due to suspicious activity because a voice mismatch was detected. Please answer this security question: ${question}`,
    )
    utt.rate = 0.9
    utt.pitch = 1.0
    utt.volume = 1.0
    const voices = window.speechSynthesis.getVoices()
    const preferred = voices.find(
      (v) => v.lang.startsWith('en') &&
        (v.name.includes('Google') || v.name.includes('Natural') || v.name.includes('Neural')),
    )
    if (preferred) utt.voice = preferred
    utt.onend = startListening
    window.speechSynthesis.speak(utt)
    setListenState('asking')
  }, [question, startListening])

  /* -- Ask the question, then listen for the caller's answer */
  useEffect(() => {
    if (spokenRef.current) return
    spokenRef.current = true
    try { askQuestion() } catch { setListenState('unavailable') }
    const retryTimer = window.setTimeout(() => {
      if (window.speechSynthesis.speaking || window.speechSynthesis.pending) return
      askQuestion()
    }, 250)
    return () => {
      window.clearTimeout(retryTimer)
      window.speechSynthesis.cancel()
      recognitionRef.current?.abort()
      recognitionRef.current = null
    }
  }, [askQuestion])

  const matchColor =
    matchResult.matchPercent >= 40 ? '#facc15' : '#ff6b6b'

  const handleTrust = useCallback(() => {
    window.speechSynthesis.cancel()
    recognitionRef.current?.abort()
    onVerified()
  }, [onVerified])

  const handleEnd = useCallback(() => {
    window.speechSynthesis.cancel()
    recognitionRef.current?.abort()
    onEndCall()
  }, [onEndCall])

  return (
    <div className="vmis-overlay" role="dialog" aria-modal="true" aria-label="Voice mismatch security check">
      <div className="vmis-card">

        {/* Header */}
        <div className="vmis-header">
          <span className="vmis-icon">⚠️</span>
          <h2 className="vmis-title">Voice Mismatch Detected</h2>
        </div>

        {/* Match percentage */}
        <div className="vmis-match-row">
          <span className="vmis-match-label">Voice similarity</span>
          <span className="vmis-match-pct" style={{ color: matchColor }}>
            {matchResult.matchPercent.toFixed(1)}%
          </span>
        </div>
        <div className="vmis-match-bar-track">
          <div
            className="vmis-match-bar-fill"
            style={{
              width: `${matchResult.matchPercent}%`,
              backgroundColor: matchColor,
            }}
          />
          {/* Threshold marker at 60% */}
          <div className="vmis-threshold-marker" style={{ left: '60%' }} />
        </div>
        <p className="vmis-threshold-note">Threshold: 60% — caller did not pass</p>

        {/* Contact info */}
        <div className="vmis-contact-row">
          <span className="vmis-contact-name">{contact.name}</span>
          {contact.relation && (
            <span className="vmis-contact-relation">{contact.relation}</span>
          )}
        </div>

        {/* Security question */}
        <div className="vmis-question-box">
          <p className="vmis-question-label">🔒 Ask the caller:</p>
          <p className="vmis-question-text">"{question}"</p>
          <button type="button" className="vmis-speak-question" onClick={askQuestion}>
            🔊 Speak question
          </button>
        </div>

        {/* Spoken answer */}
        <div className={`vmis-listening ${listenState}`} aria-live="polite">
          <span className="vmis-listening-dot" aria-hidden="true" />
          {listenState === 'asking' && 'Asking the security question…'}
          {listenState === 'listening' && 'Listening for the caller’s answer…'}
          {listenState === 'heard' && `Heard: “${spokenAnswer}”`}
          {listenState === 'unavailable' && 'Voice answering is unavailable in this browser.'}
        </div>

        {listenState === 'unavailable' && (
          <button className="vmis-btn vmis-btn-verify" onClick={askQuestion}>
            Ask question again
          </button>
        )}

        <div className="vmis-divider" />

        {/* Secondary actions */}
        <button className="vmis-btn vmis-btn-trust" onClick={handleTrust}>
          Trust This Call — Continue anyway
        </button>
        <button className="vmis-btn vmis-btn-end" onClick={handleEnd}>
          📵 Mark as Suspicious &amp; End Call
        </button>

      </div>
    </div>
  )
}

export default VoiceMismatchOverlay
