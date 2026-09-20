/**
 * SecurityQuestionOverlay
 *
 * Evolved from VoiceMismatchOverlay. Rendered when VerificationState === 'fail'
 * for the SELECTED claimed identity on an unknown call.
 *
 * - Speaks "Possible impersonation detected. {question}" via SpeechSynthesis
 *   (tentative wording — identity is NOT yet confirmed). Wrapped in try/catch so
 *   the overlay still renders if speechSynthesis is unavailable or throws (Req 4.8).
 * - Falls back to "What is your full name?" when the contact's securityQuestion
 *   is blank/whitespace (Req 4.7).
 * - Shows the match % and a tentative "⚠️ Possible impersonation" banner while the
 *   challenge is incomplete (Req 4.3) — never definitive/confirmed-fraud wording.
 * - Provides a typed-answer input + "Submit Answer" (enabled only for non-empty
 *   trimmed input) → onAnswerSubmitted (Req 4.4), plus "Trust This Call"
 *   (Req 4.6) and "Mark as Scam & End Call" (Req 4.5).
 * - Keeps the optional SpeechRecognition listening convenience from the prior
 *   overlay; the typed input + submit is the required path.
 */
import React, { useEffect, useRef, useState, useCallback } from 'react'
import { AlertTriangle, Lock, Volume2, PhoneOff } from 'lucide-react'
import { FamilyContact } from '../hooks/useFamilyContacts'
// useVoiceVerification is being created in parallel (task 2.1). Prefer importing
// the result type from it once available.
import type { VoiceVerificationResult } from '../hooks/useVoiceVerification'

const DEFAULT_QUESTION = 'What is your full name?'

interface SecurityQuestionOverlayProps {
  /** The SELECTED claimed identity. */
  contact: FamilyContact
  /** Result of the on-demand voice comparison. */
  verificationResult: VoiceVerificationResult
  /** Called with the typed answer when a non-empty answer is submitted. */
  onAnswerSubmitted: (answer: string) => void
  /** "Trust This Call" — dismiss + stop monitoring without an answer. */
  onTrustCall: () => void
  /** "Mark as Scam & End Call" — treat failed verification as a scam. */
  onMarkAsScam: () => void
}

export const SecurityQuestionOverlay: React.FC<SecurityQuestionOverlayProps> = ({
  contact,
  verificationResult,
  onAnswerSubmitted,
  onTrustCall,
  onMarkAsScam,
}) => {
  const question = contact.securityQuestion?.trim() || DEFAULT_QUESTION
  const [typedAnswer, setTypedAnswer] = useState('')
  const [spokenAnswer, setSpokenAnswer] = useState('')
  const [listenState, setListenState] = useState<'asking' | 'listening' | 'heard' | 'unavailable'>('asking')
  const spokenRef = useRef(false)
  const recognitionRef = useRef<any>(null)

  const answerIsValid = typedAnswer.trim().length > 0

  /* -- Optional convenience: listen for a spoken answer via SpeechRecognition */
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
      setTypedAnswer(transcript)
      setListenState('heard')
      recognition.stop()
    }
    recognition.onerror = () => setListenState('unavailable')
    recognition.onend = () => {
      recognitionRef.current = null
    }
    recognitionRef.current = recognition
    recognition.start()
  }, [])

  const askQuestion = useCallback(() => {
    // Guard the entire SpeechSynthesis path — if the API is unavailable or
    // throws, the overlay must still render (Req 4.8).
    try {
      window.speechSynthesis.cancel()
      window.speechSynthesis.resume()
      const utt = new SpeechSynthesisUtterance(`Possible impersonation detected. ${question}`)
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
    } catch {
      setListenState('unavailable')
    }
  }, [question, startListening])

  /* -- Ask the question once on mount, then listen for the caller's answer */
  useEffect(() => {
    if (spokenRef.current) return
    spokenRef.current = true
    askQuestion()
    let retryTimer = 0
    try {
      retryTimer = window.setTimeout(() => {
        try {
          if (window.speechSynthesis.speaking || window.speechSynthesis.pending) return
          askQuestion()
        } catch {
          setListenState('unavailable')
        }
      }, 250)
    } catch {
      setListenState('unavailable')
    }
    return () => {
      if (retryTimer) window.clearTimeout(retryTimer)
      try { window.speechSynthesis.cancel() } catch { /* ignore */ }
      recognitionRef.current?.abort?.()
      recognitionRef.current = null
    }
  }, [askQuestion])

  const matchColor = verificationResult.matchPercent >= 40 ? '#facc15' : '#ff6b6b'

  const stopSpeechAndListening = useCallback(() => {
    try { window.speechSynthesis.cancel() } catch { /* ignore */ }
    recognitionRef.current?.abort?.()
  }, [])

  const handleSubmit = useCallback(() => {
    const answer = typedAnswer.trim()
    if (!answer) return
    stopSpeechAndListening()
    onAnswerSubmitted(answer)
  }, [typedAnswer, stopSpeechAndListening, onAnswerSubmitted])

  const handleTrust = useCallback(() => {
    stopSpeechAndListening()
    onTrustCall()
  }, [stopSpeechAndListening, onTrustCall])

  const handleEnd = useCallback(() => {
    stopSpeechAndListening()
    onMarkAsScam()
  }, [stopSpeechAndListening, onMarkAsScam])

  return (
    <div className="vmis-overlay" role="dialog" aria-modal="true" aria-label="Possible impersonation security check">
      <div className="vmis-card">

        {/* Header — tentative wording only */}
        <div className="vmis-header">
          <span className="vmis-icon"><AlertTriangle size={22} /></span>
          <h2 className="vmis-title">Possible impersonation</h2>
        </div>

        {/* Tentative banner shown while the challenge is incomplete */}
        <div className="sqo-banner" role="status">
          <AlertTriangle size={14} /> Possible impersonation
        </div>

        {/* Match percentage */}
        <div className="vmis-match-row">
          <span className="vmis-match-label">Voice similarity</span>
          <span className="vmis-match-pct" style={{ color: matchColor }}>
            {verificationResult.matchPercent.toFixed(1)}%
          </span>
        </div>
        <div className="vmis-match-bar-track">
          <div
            className="vmis-match-bar-fill"
            style={{
              width: `${verificationResult.matchPercent}%`,
              backgroundColor: matchColor,
            }}
          />
          {/* Threshold marker at 60% */}
          <div className="vmis-threshold-marker" style={{ left: '60%' }} />
        </div>
        <p className="vmis-threshold-note">Threshold: 60% — caller may not match this contact</p>

        {/* Contact info */}
        <div className="vmis-contact-row">
          <span className="vmis-contact-name">{contact.name}</span>
          {contact.relation && (
            <span className="vmis-contact-relation">{contact.relation}</span>
          )}
        </div>

        {/* Security question */}
        <div className="vmis-question-box">
          <p className="vmis-question-label"><Lock size={13} /> Ask the caller:</p>
          <p className="vmis-question-text">"{question}"</p>
          <button type="button" className="vmis-speak-question" onClick={askQuestion}>
            <Volume2 size={14} /> Speak question
          </button>
        </div>

        {/* Optional spoken-answer status (convenience) */}
        <div className={`vmis-listening ${listenState}`} aria-live="polite">
          <span className="vmis-listening-dot" aria-hidden="true" />
          {listenState === 'asking' && 'Asking the security question…'}
          {listenState === 'listening' && 'Listening for the caller’s answer…'}
          {listenState === 'heard' && `Heard: “${spokenAnswer}”`}
          {listenState === 'unavailable' && 'Voice answering is unavailable — type the answer below.'}
        </div>

        {/* Typed answer + submit (required path) */}
        <div className="sqo-answer">
          <input
            type="text"
            className="sqo-input"
            placeholder="Type the caller's answer…"
            value={typedAnswer}
            onChange={(e) => setTypedAnswer(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && answerIsValid) handleSubmit() }}
            aria-label="Security question answer"
          />
          <button
            type="button"
            className="vmis-btn vmis-btn-verify"
            onClick={handleSubmit}
            disabled={!answerIsValid}
          >
            Submit Answer
          </button>
        </div>

        <div className="vmis-divider" />

        {/* Secondary actions */}
        <button type="button" className="vmis-btn vmis-btn-trust" onClick={handleTrust}>
          Trust This Call
        </button>
        <button type="button" className="vmis-btn vmis-btn-end" onClick={handleEnd}>
          <PhoneOff size={15} /> Mark as Scam &amp; End Call
        </button>

      </div>
    </div>
  )
}

export default SecurityQuestionOverlay
