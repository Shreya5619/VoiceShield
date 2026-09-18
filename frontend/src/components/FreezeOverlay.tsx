import React, { useState, useCallback, useEffect, useRef } from 'react'
import { ScamAnalysisResult } from '../types'
// styles live in ActiveCallScreen.css — already imported by ActiveCallScreen

interface FreezeOverlayProps {
  result: ScamAnalysisResult | null
  isLoading: boolean
  onDismiss: () => void
}

function getRiskColor(level?: string): string {
  switch (level) {
    case 'CRITICAL': return '#ff4444'
    case 'HIGH':     return '#ff9800'
    case 'MEDIUM':   return '#ffc107'
    default:         return '#4ade80'
  }
}

/* ── Speech synthesis hook ───────────────────────────────── */
function useSpeech() {
  const [speakingIndex, setSpeakingIndex] = useState<number | null>(null)
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null)

  // Cancel speech on unmount
  useEffect(() => {
    return () => {
      window.speechSynthesis.cancel()
    }
  }, [])

  const speak = useCallback((text: string, index: number) => {
    // If this question is already playing, stop it
    if (speakingIndex === index) {
      window.speechSynthesis.cancel()
      setSpeakingIndex(null)
      return
    }

    // Cancel any current speech
    window.speechSynthesis.cancel()

    const utterance = new SpeechSynthesisUtterance(text)
    utterance.rate  = 0.92   // slightly slower — clearer for caller to hear
    utterance.pitch = 1.0
    utterance.volume = 1.0

    // Pick a natural English voice if available
    const voices = window.speechSynthesis.getVoices()
    const preferred = voices.find(
      (v) =>
        v.lang.startsWith('en') &&
        (v.name.includes('Google') || v.name.includes('Natural') || v.name.includes('Neural')),
    )
    if (preferred) utterance.voice = preferred

    utterance.onstart = () => setSpeakingIndex(index)
    utterance.onend   = () => setSpeakingIndex(null)
    utterance.onerror = () => setSpeakingIndex(null)

    utteranceRef.current = utterance
    window.speechSynthesis.speak(utterance)
  }, [speakingIndex])

  const cancel = useCallback(() => {
    window.speechSynthesis.cancel()
    setSpeakingIndex(null)
  }, [])

  return { speak, cancel, speakingIndex }
}

/* ── FreezeOverlay ───────────────────────────────────────── */
export const FreezeOverlay: React.FC<FreezeOverlayProps> = ({ result, isLoading, onDismiss }) => {
  const { speak, cancel, speakingIndex } = useSpeech()

  const hasContent      = !!(result?.summary || (result?.verification_questions?.length ?? 0) > 0)
  const showErrorBanner = !!(result?.analysis_error && !hasContent)

  const handleDismiss = useCallback(() => {
    cancel()
    onDismiss()
  }, [cancel, onDismiss])

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

        {/* ── Result content — shown as soon as result exists, regardless of isLoading ── */}
        {result && (
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
          </>
        )}
      </div>
    </div>
  )
}

export default FreezeOverlay
