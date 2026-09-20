import React, { useState, useCallback, useEffect, useRef } from 'react'
import { ScamAnalysisResult } from '../types'
import type { FamilyContact } from '../hooks/useFamilyContacts'
import '../styles/IdentityPrompt.css'
// styles live in ActiveCallScreen.css — already imported by ActiveCallScreen

interface FreezeOverlayProps {
  result: ScamAnalysisResult | null
  isLoading: boolean
  onDismiss: () => void
  onResumeCall: () => void
  onMarkAsSpam: () => void
  languageCode?: string  // 'en' or 'hi'
  /**
   * Enrolled contacts (already filtered to those with a speakerEmbedding by the
   * parent). When provided and non-empty, the "Who does this caller claim to be?"
   * picker renders inside the freeze card. Omit to keep the overlay unchanged.
   */
  enrolledContacts?: FamilyContact[]
  /** Selecting a contact triggers on-demand voice verification. */
  onSelectClaimedIdentity?: (contact: FamilyContact) => void
  /** Skip dismisses verification and continues monitoring. */
  onSkipVerification?: () => void
  /** Name of the contact already selected — shows a status line instead of the picker. */
  claimedContactName?: string | null
  /** Whether a comparison is currently in progress (verificationState === 'comparing'). */
  verificationInProgress?: boolean
}

function getRiskColor(level?: string): string {
  switch (level) {
    case 'CRITICAL': return '#ff4444'
    case 'HIGH':     return '#ff9800'
    case 'MEDIUM':   return '#ffc107'
    default:         return '#4ade80'
  }
}

function isHindi(languageCode: string): boolean {
  return languageCode.toLowerCase().startsWith('hi')
}

function getVoicesWhenReady(): Promise<SpeechSynthesisVoice[]> {
  const synthesis = window.speechSynthesis
  const voices = synthesis.getVoices()
  if (voices.length > 0) return Promise.resolve(voices)

  return new Promise((resolve) => {
    let settled = false
    const finish = () => {
      if (settled) return
      settled = true
      synthesis.removeEventListener('voiceschanged', finish)
      resolve(synthesis.getVoices())
    }
    synthesis.addEventListener('voiceschanged', finish)
    window.setTimeout(finish, 1000)
  })
}

function selectVoice(voices: SpeechSynthesisVoice[], languageCode: string): SpeechSynthesisVoice | undefined {
  if (isHindi(languageCode)) {
    return voices.find((voice) => voice.lang.toLowerCase().startsWith('hi'))
      ?? voices.find((voice) => voice.name.toLowerCase().includes('hindi'))
  }

  return voices.find((voice) =>
    voice.lang.toLowerCase().startsWith('en') &&
    /google|natural|neural/i.test(voice.name),
  ) ?? voices.find((voice) => voice.lang.toLowerCase().startsWith('en'))
}

/* ── Speech synthesis hook ───────────────────────────────── */
function useSpeech(languageCode: string = 'en') {
  const [speakingIndex, setSpeakingIndex] = useState<number | null>(null)
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null)
  const speechRequestRef = useRef(0)
  const speakingIndexRef = useRef<number | null>(null)

  const updateSpeakingIndex = useCallback((index: number | null) => {
    speakingIndexRef.current = index
    setSpeakingIndex(index)
  }, [])

  // Cancel speech on unmount
  useEffect(() => {
    return () => {
      speechRequestRef.current += 1
      window.speechSynthesis.cancel()
    }
  }, [])

  const speak = useCallback(async (text: string, index: number) => {
    // If this question is already playing, stop it
    if (speakingIndexRef.current === index) {
      speechRequestRef.current += 1
      window.speechSynthesis.cancel()
      updateSpeakingIndex(null)
      return
    }

    // Cancel any current speech
    const requestId = ++speechRequestRef.current
    window.speechSynthesis.cancel()

    const utterance = new SpeechSynthesisUtterance(text)
    utterance.rate  = 0.92   // slightly slower — clearer for caller to hear
    utterance.pitch = 1.0
    utterance.volume = 1.0

    utterance.lang = isHindi(languageCode) ? 'hi-IN' : 'en-US'
    const voices = await getVoicesWhenReady()
    if (requestId !== speechRequestRef.current) return
    const voice = selectVoice(voices, languageCode)
    if (voice) utterance.voice = voice

    utterance.onstart = () => updateSpeakingIndex(index)
    utterance.onend   = () => {
      if (requestId === speechRequestRef.current) updateSpeakingIndex(null)
    }
    utterance.onerror = () => {
      if (requestId === speechRequestRef.current) updateSpeakingIndex(null)
    }

    utteranceRef.current = utterance
    window.speechSynthesis.resume()
    window.speechSynthesis.speak(utterance)
  }, [languageCode, updateSpeakingIndex])

  const cancel = useCallback(() => {
    speechRequestRef.current += 1
    window.speechSynthesis.cancel()
    updateSpeakingIndex(null)
  }, [updateSpeakingIndex])

  return { speak, cancel, speakingIndex }
}

/* ── FreezeOverlay ───────────────────────────────────────── */
export const FreezeOverlay: React.FC<FreezeOverlayProps> = ({
  result,
  isLoading,
  onDismiss,
  onResumeCall,
  onMarkAsSpam,
  languageCode = 'en',
  enrolledContacts,
  onSelectClaimedIdentity,
  onSkipVerification,
  claimedContactName = null,
  verificationInProgress = false,
}) => {
  const { speak, cancel, speakingIndex } = useSpeech(languageCode)
  const [activeView, setActiveView] = useState<'protected' | 'caller'>('protected')

  // The claimed-identity picker is available only when the parent wires up the
  // handlers and provides at least one enrolled contact. Everything below is
  // guarded on this flag so the overlay renders exactly as before when omitted.
  const canPickIdentity =
    !!onSelectClaimedIdentity &&
    !!onSkipVerification &&
    Array.isArray(enrolledContacts) &&
    enrolledContacts.length > 0

  const renderIdentityPicker = () => {
    if (!canPickIdentity) return null

    const hindi = isHindi(languageCode)
    const heading = hindi
      ? 'यह कॉलर कौन होने का दावा करता है?'
      : 'Who does this caller claim to be?'
    const skipLabel = hindi ? 'सत्यापन छोड़ें' : 'Skip verification'

    // A contact has already been selected → show status instead of the picker.
    if (claimedContactName) {
      const verifyingText = hindi
        ? `कॉलर को ${claimedContactName} के रूप में सत्यापित किया जा रहा है…`
        : `Verifying caller as ${claimedContactName}…`
      return (
        <div className="freeze-section freeze-identity-status" role="status">
          <p className="freeze-section-title">
            {verificationInProgress ? '🔄 ' : '🔎 '}{verifyingText}
          </p>
        </div>
      )
    }

    return (
      <div className="freeze-section freeze-identity-picker">
        <p className="freeze-section-title">{heading}</p>
        <ul className="identity-prompt-list" aria-label={heading}>
          {enrolledContacts!.map((contact) => (
            <li key={contact.id}>
              <button
                type="button"
                className="identity-prompt-contact"
                onClick={() => onSelectClaimedIdentity!(contact)}
                aria-label={`Verify caller as ${contact.name}${
                  contact.relation ? `, ${contact.relation}` : ''
                }`}
              >
                <span className="identity-prompt-avatar" aria-hidden="true">
                  {contact.name.charAt(0).toUpperCase()}
                </span>
                <span className="identity-prompt-contact-info">
                  <span className="identity-prompt-contact-name">{contact.name}</span>
                  {contact.relation && (
                    <span className="identity-prompt-contact-relation">
                      {contact.relation}
                    </span>
                  )}
                </span>
              </button>
            </li>
          ))}
        </ul>
        <button
          type="button"
          className="identity-prompt-skip"
          onClick={() => onSkipVerification!()}
          aria-label="Skip verification and continue the call"
        >
          {skipLabel}
        </button>
      </div>
    )
  }

  const hasContent      = !!(result?.summary || (result?.verification_questions?.length ?? 0) > 0)
  const showErrorBanner = !!(result?.analysis_error && !hasContent)

  useEffect(() => {
    if (!hasContent) return

    const hindi = isHindi(languageCode)
    const summary = result?.summary?.slice(0, 600) ?? ''
    const speechText = activeView === 'protected'
      ? hindi
        ? `${summary} कृपया नीचे दिए गए किसी एक सत्यापन प्रश्न को चुनें।`
        : `${summary} Please select one of the verification questions below.`
      : hindi
        ? 'संदिग्ध गतिविधि के कारण आपकी कॉल रोक दी गई है। कृपया सत्यापन प्रश्नों का उत्तर दें।'
        : 'Your call has been put on hold due to suspicious activity. Please answer the verification questions.'

    speak(speechText, -1)
  }, [activeView, hasContent, languageCode, result?.summary, speak])

  const handleDismiss = useCallback(() => {
    cancel()
    onDismiss()
  }, [cancel, onDismiss])

  const handleResumeCall = useCallback(() => {
    cancel()
    onResumeCall()
  }, [cancel, onResumeCall])

  const handleMarkAsSpam = useCallback(() => {
    cancel()
    onMarkAsSpam()
  }, [cancel, onMarkAsSpam])

  return (
    <div className="freeze-overlay" role="dialog" aria-modal="true" aria-label="AI Scam Alert">
      <div className="freeze-card">

        {/* ── Header ──────────────────────────────── */}
        <div className="freeze-header">
          <h2 className="freeze-title">
            <span>🚨</span> AI Scam Alert
          </h2>
          <button className="freeze-dismiss" onClick={handleDismiss} aria-label="Dismiss alert">
            Dismiss
          </button>
        </div>

        {/* ── Loading spinner ──────────────────────── */}
        {isLoading && !hasContent && (
          <div className="freeze-loading">
            <p>Analyzing with Amazon Bedrock</p>
            <p>
              <span className="freeze-loading-dot">●</span>{' '}
              <span className="freeze-loading-dot">●</span>{' '}
              <span className="freeze-loading-dot">●</span>
            </p>
          </div>
        )}

        {hasContent && (
          <div className="freeze-view-switcher" role="tablist" aria-label="Call views">
            <button
              type="button"
              role="tab"
              aria-selected={activeView === 'protected'}
              className={`freeze-view-tab ${activeView === 'protected' ? 'active' : ''}`}
              onClick={() => setActiveView('protected')}
            >
              {isHindi(languageCode) ? '🛡️ आपकी स्क्रीन' : '🛡️ Protected View'}
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeView === 'caller'}
              className={`freeze-view-tab ${activeView === 'caller' ? 'active' : ''}`}
              onClick={() => setActiveView('caller')}
            >
              {isHindi(languageCode) ? '📞 कॉलर स्क्रीन' : '📞 Caller View'}
            </button>
          </div>
        )}

        {/* ── Result content — shown as soon as result exists, regardless of isLoading ── */}
        {result && activeView === 'protected' && (
          <>
            {/* Risk level badge */}
            {result.risk_level && (
              <div
                className="freeze-risk-badge"
                style={{
                  borderColor: getRiskColor(result.risk_level),
                  color:       getRiskColor(result.risk_level),
                  background:  `${getRiskColor(result.risk_level)}18`,
                }}
              >
                <span>⚠️</span>
                Risk Level: {result.risk_level}
              </div>
            )}

            {/* Probability fallback when no risk_level — always show scam prob */}
            {!result.risk_level && result.scam_probability > 0 && (
              <div
                className="freeze-risk-badge"
                style={{
                  borderColor: result.scam_probability >= 0.75 ? '#ff4444' : '#ff9800',
                  color:       result.scam_probability >= 0.75 ? '#ff4444' : '#ff9800',
                  background:  result.scam_probability >= 0.75 ? '#ff444418' : '#ff980018',
                }}
              >
                <span>⚠️</span>
                Scam Probability: {(result.scam_probability * 100).toFixed(1)}%
              </div>
            )}

            {/* Summary */}
            {result.summary && (
              <div className="freeze-section">
                <p className="freeze-section-title">Why this call was flagged</p>
                <p className="freeze-summary-text">
                  {result.summary.slice(0, 600)}
                  {result.summary.length > 600 ? '…' : ''}
                </p>
              </div>
            )}

            {/* Verification questions — each is tappable to speak */}
            {result.verification_questions && result.verification_questions.length > 0 && (
              <>
                <div className="freeze-divider" />
                <div className="freeze-section">
                  <p className="freeze-section-title">
                    🔎 Ask the caller — tap a question to read it aloud
                  </p>
                  <ol className="freeze-questions" style={{ listStyle: 'none', paddingLeft: 0 }}>
                    {result.verification_questions.slice(0, 10).map((q, i) => {
                      const isPlaying = speakingIndex === i
                      return (
                        <li key={i}>
                          <button
                            className={`question-speak-btn ${isPlaying ? 'speaking' : ''}`}
                            onClick={() => speak(q, i)}
                            aria-label={isPlaying ? `Stop reading question ${i + 1}` : `Read question ${i + 1} aloud`}
                            aria-pressed={isPlaying}
                          >
                            {/* Number bubble */}
                            <span className="question-number">{i + 1}</span>

                            {/* Question text */}
                            <span className="question-text">{q}</span>

                            {/* Speaker icon */}
                            <span className="question-speaker-icon" aria-hidden="true">
                              {isPlaying ? '🔊' : '🔈'}
                            </span>
                          </button>
                        </li>
                      )
                    })}
                  </ol>
                </div>
              </>
            )}

            {/* Error / info banner — shown whenever analysis_error is present */}
            {showErrorBanner && (
              <div style={{
                padding: '0.75rem 1rem',
                background: 'rgba(255,152,0,0.08)',
                border: '1px solid rgba(255,152,0,0.3)',
                borderRadius: '8px',
                fontSize: '0.85rem',
                color: '#ffb74d',
                marginTop: hasContent ? '0.75rem' : '0.25rem',
                lineHeight: 1.5,
              }}>
                ⚠️ {result.analysis_error}
              </div>
            )}

            {/* Claimed-identity picker (unknown callers only, when wired) */}
            {canPickIdentity && (
              <>
                <div className="freeze-divider" />
                {renderIdentityPicker()}
              </>
            )}

            {hasContent && (
              <div className="freeze-actions">
                <button className="freeze-resume-btn" onClick={handleResumeCall}>
                  Continue call
                </button>
                <button className="freeze-spam-btn" onClick={handleMarkAsSpam}>
                  Mark as spam &amp; end call
                </button>
              </div>
            )}
          </>
        )}

        {result && activeView === 'caller' && (
          <section className="caller-hold-view" aria-label="Caller view">
            <div className="caller-hold-icon" aria-hidden="true">⏸</div>
            <p className="caller-hold-eyebrow">{isHindi(languageCode) ? 'कॉल रोक दी गई है' : 'Call temporarily paused'}</p>
            <h3 className="caller-hold-title">
              {isHindi(languageCode)
                ? 'संदिग्ध गतिविधि के कारण आपकी कॉल रोक दी गई है।'
                : 'Your call has been put on hold due to suspicious activity.'}
            </h3>
            <p className="caller-hold-message">
              {isHindi(languageCode)
                ? 'कृपया सत्यापन प्रश्नों का उत्तर दें।'
                : 'Please answer the verification questions.'}
            </p>
            <button
              type="button"
              className="caller-speak-btn"
              onClick={() => speak(
                isHindi(languageCode)
                  ? 'संदिग्ध गतिविधि के कारण आपकी कॉल रोक दी गई है। कृपया सत्यापन प्रश्नों का उत्तर दें।'
                  : 'Your call has been put on hold due to suspicious activity. Please answer the verification questions.',
                -1,
              )}
            >
              🔊 {isHindi(languageCode) ? 'संदेश पढ़कर सुनाएं' : 'Read hold message aloud'}
            </button>

            {/* Same claimed-identity picker surfaced on the caller view */}
            {canPickIdentity && (
              <>
                <div className="freeze-divider" />
                {renderIdentityPicker()}
              </>
            )}
          </section>
        )}
      </div>
    </div>
  )
}

export default FreezeOverlay
