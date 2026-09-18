import React, {
  useEffect,
  useRef,
  useState,
  useCallback,
  useMemo,
} from 'react'
import { CallerInfo } from './CallerPicker'
import FreezeOverlay from './FreezeOverlay'
import VoiceMismatchOverlay from './VoiceMismatchOverlay'
import useTranscription from '../hooks/useTranscription'
import useVADDiarization, { EnrolledSpeaker, SegmentResult } from '../hooks/useVADDiarization'
import { ScamAnalysisResult } from '../types'
import '../styles/ActiveCallScreen.css'
import { apiUrl } from '../config/api'
import { useVoiceMatch } from '../hooks/useVoiceMatch'

interface ActiveCallScreenProps {
  caller: CallerInfo
  onEndCall: () => void
  /** Owner's phone number — used to load their self-embedding from localStorage */
  ownerPhone?: string
}

const SCAM_THRESHOLD = 0.8

/* ── Helpers ─────────────────────────────────────────────────────────────── */

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60).toString().padStart(2, '0')
  const s = (seconds % 60).toString().padStart(2, '0')
  return `${m}:${s}`
}

function getRiskColor(prob: number): string {
  if (prob >= 0.8) return '#ff4444'
  if (prob >= 0.6) return '#ff9800'
  if (prob >= 0.3) return '#ffc107'
  return '#4ade80'
}

function getRiskLabel(prob: number): string {
  if (prob >= 0.8) return 'HIGH RISK'
  if (prob >= 0.6) return 'ELEVATED'
  if (prob >= 0.3) return 'MEDIUM'
  if (prob > 0)    return 'LOW RISK'
  return 'Analyzing...'
}

/** Load the owner's self-embedding from localStorage (null if not enrolled). */
function loadSelfEmbedding(ownerPhone: string | undefined): number[] | null {
  if (!ownerPhone) return null
  try {
    const raw = localStorage.getItem(`voiceshield_self_embedding_${ownerPhone}`)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed?.vector) ? parsed.vector : null
  } catch {
    return null
  }
}

/* ── Component ───────────────────────────────────────────────────────────── */

export const ActiveCallScreen: React.FC<ActiveCallScreenProps> = ({
  caller,
  onEndCall,
  ownerPhone,
}) => {

  /* ── Call timer ───────────────────────────────────────────────────────── */
  const [elapsed, setElapsed] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setElapsed((s) => s + 1), 1000)
    return () => clearInterval(id)
  }, [])

  /* ── UI toggles ───────────────────────────────────────────────────────── */
  const [isMuted,   setIsMuted]   = useState(false)
  const [isSpeaker, setIsSpeaker] = useState(false)
  const [showFreeze, setShowFreeze] = useState(false)

  /* ── Voice verification state ─────────────────────────────────────────── */
  const [showMismatch, setShowMismatch] = useState(false)
  const [callVerified, setCallVerified] = useState(false)

  /* ── Scam state ───────────────────────────────────────────────────────── */
  const [scamProb,       setScamProb]       = useState(0)
  const [bedrockResult,  setBedrockResult]  = useState<ScamAnalysisResult | null>(null)
  const [bedrockLoading, setBedrockLoading] = useState(false)

  const hasRealResultRef = useRef(false)
  const analyzingRef     = useRef(false)

  useEffect(() => {
    if (bedrockResult?.summary || (bedrockResult?.verification_questions?.length ?? 0) > 0) {
      setShowFreeze(true)
    }
  }, [bedrockResult])

  /* ── Privacy / diarization state ─────────────────────────────────────── */
  const [privacyMode,  setPrivacyMode]  = useState<'active' | 'fallback' | 'off'>('off')
  const [speakerRoute, setSpeakerRoute] = useState<Record<string, number>>({}) // label → total ms
  const [lastSegments, setLastSegments] = useState<SegmentResult[]>([])

  /* ── Family contact from CallerInfo ──────────────────────────────────── */
  const familyContact = caller.isUnknown ? null : (caller.familyContact ?? null)

  /* ── Build enrolled-speakers list ────────────────────────────────────── */
  const enrolledSpeakers = useMemo<EnrolledSpeaker[]>(() => {
    const list: EnrolledSpeaker[] = []

    // 1. Owner's self-voice (SELF)
    const selfVec = loadSelfEmbedding(ownerPhone)
    if (selfVec) list.push({ label: 'SELF', embedding: selfVec })

    // 2. Caller's enrolled embedding (only for known contacts)
    //    Label: FAMILY_<name> so it gets "privacy-preserve / discard" routing
    if (familyContact?.speakerEmbedding?.vector) {
      list.push({
        label: `FAMILY_${familyContact.name}`,
        embedding: familyContact.speakerEmbedding.vector,
      })
    }

    return list
  }, [ownerPhone, familyContact])

  /* ── Transcription (externalAudio mode when diarization active) ───────── */
  const {
    segments,
    startRecording,
    stopRecording,
    isRecording,
    feedCallerAudio,
  } = useTranscription({
    languageCode: 'en-US',
    region: 'us-east-1',
    // Use external audio feed when we have enrolled speakers to filter with.
    // Falls back to raw mic capture when no embeddings exist yet.
    externalAudio: enrolledSpeakers.length > 0,
  })

  /* ── VAD / Diarization ────────────────────────────────────────────────── */
  const handleCallerAudio = useCallback((blob: Blob) => {
    feedCallerAudio(blob)
  }, [feedCallerAudio])

  const {
    isRunning:    diarizationRunning,
    isAnalyzing:  diarizationAnalyzing,
    lastSegments: diarSegments,
    speakerSummary,
    startDiarization,
    stopDiarization,
  } = useVADDiarization({
    enrolledSpeakers,
    onCallerAudio: handleCallerAudio,
    windowMs: 3000,
  })

  // Mirror diarization state into local UI state
  useEffect(() => {
    setLastSegments(diarSegments)
  }, [diarSegments])

  useEffect(() => {
    setSpeakerRoute(speakerSummary)
  }, [speakerSummary])

  /* ── Voice match (existing 5-second verification) ────────────────────── */
  const { voiceMatchState, voiceMatchResult } = useVoiceMatch(familyContact)

  /* ── Open mismatch overlay when voice check fails ────────────────────── */
  useEffect(() => {
    if (
      voiceMatchState === 'done' &&
      voiceMatchResult !== null &&
      !voiceMatchResult.verified &&
      !callVerified
    ) {
      setShowMismatch(true)
    }
  }, [voiceMatchState, voiceMatchResult, callVerified])

  /* ── Verified: stop all monitoring ───────────────────────────────────── */
  const handleVerified = useCallback(() => {
    setShowMismatch(false)
    setCallVerified(true)
    stopRecording()
    stopDiarization()
  }, [stopRecording, stopDiarization])

  /* ── Start audio pipeline on mount ───────────────────────────────────── */
  useEffect(() => {
    const hasDiarization = enrolledSpeakers.length > 0

    // Always start Transcribe streaming
    startRecording().catch(console.error)

    if (hasDiarization) {
      setPrivacyMode('active')
      startDiarization().catch((err) => {
        console.warn('[ActiveCall] Diarization start failed, falling back to raw mic', err)
        setPrivacyMode('fallback')
      })
    } else {
      setPrivacyMode('fallback')
    }

    return () => {
      stopRecording()
      stopDiarization()
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  /* ── Full transcript from caller-only segments ────────────────────────── */
  const fullTranscript = useMemo(
    () => segments.map((s) => s.transcript).filter(Boolean).join(' ').trim(),
    [segments],
  )

  /* ── Predict-scam polling (debounced 1 s) ─────────────────────────────── */
  useEffect(() => {
    if (!fullTranscript) return
    if (callVerified) return

    const timer = setTimeout(async () => {
      try {
        const res = await fetch(apiUrl('/api/predict-scam'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ transcript: fullTranscript }),
        })
        if (!res.ok) return
        const data = await res.json()
        const prob: number = data.scam_probability ?? 0
        setScamProb(prob)

        if (prob >= SCAM_THRESHOLD) {
          setIsMuted(true)
          if (hasRealResultRef.current) return
          if (analyzingRef.current) return
          analyzingRef.current = true
          setBedrockLoading(true)
          setShowFreeze(true)

          fetch(apiUrl('/api/analyze-scam'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ transcript: fullTranscript }),
          })
            .then((r) => {
              if (!r.ok) throw new Error(`HTTP ${r.status}`)
              return r.json() as Promise<ScamAnalysisResult>
            })
            .then((result) => {
              const hasContent =
                !!result.summary ||
                !!(result.verification_questions && result.verification_questions.length > 0)
              if (hasContent) {
                hasRealResultRef.current = true
                setBedrockResult({ ...result, is_scam: true })
              }
              setBedrockLoading(false)
              analyzingRef.current = false
            })
            .catch(() => {
              setBedrockLoading(false)
              analyzingRef.current = false
            })
        }
      } catch { /* ignore network errors */ }
    }, 1000)
    return () => clearTimeout(timer)
  }, [fullTranscript, callVerified])

  /* ── End call ─────────────────────────────────────────────────────────── */
  const handleEndCall = useCallback(() => {
    stopRecording()
    stopDiarization()
    hasRealResultRef.current = false
    analyzingRef.current = false
    onEndCall()
  }, [stopRecording, stopDiarization, onEndCall])

  const handleMarkAsSpam = useCallback(async () => {
    try {
      await fetch(apiUrl('/api/spam-alerts'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          owner_phone: ownerPhone,
          caller_phone: caller.phone,
          caller_name: caller.name,
          scam_probability: scamProb,
          risk_level: bedrockResult?.risk_level,
          summary: bedrockResult?.summary || '',
          idempotency_key: `${ownerPhone}-${caller.id}-${Date.now()}`,
        }),
      })
    } finally {
      handleEndCall()
    }
  }, [ownerPhone, caller, scamProb, bedrockResult, handleEndCall])

  /* ── Clock ────────────────────────────────────────────────────────────── */
  const [clockStr, setClockStr] = useState('')
  useEffect(() => {
    const tick = () =>
      setClockStr(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }))
    tick()
    const id = setInterval(tick, 10000)
    return () => clearInterval(id)
  }, [])

  /* ── Derived display values ───────────────────────────────────────────── */
  const riskColor    = getRiskColor(scamProb)
  const riskLabel    = getRiskLabel(scamProb)
  const showAlertBtn = bedrockLoading || bedrockResult !== null

  // Privacy badge: summarise who has been filtered out vs forwarded
  const privacyBadgeItems = useMemo(() => {
    return Object.entries(speakerRoute).map(([label, ms]) => ({
      label,
      seconds: Math.round(ms / 1000),
      routed: label === 'UNKNOWN' ? 'transcribed' : 'protected',
    }))
  }, [speakerRoute])

  const callerTotalMs   = speakerRoute['UNKNOWN'] ?? 0
  const filteredTotalMs = Object.entries(speakerRoute)
    .filter(([l]) => l !== 'UNKNOWN')
    .reduce((sum, [, ms]) => sum + ms, 0)

  /* ── Render ───────────────────────────────────────────────────────────── */
  return (
    <>
      <div className="active-call-screen">

        {/* Status bar */}
        <div className="call-statusbar">
          <span className="call-statusbar-time">{clockStr}</span>
          <div className="call-statusbar-icons">
            <span>📶</span>
            <span>🔋</span>
          </div>
        </div>

        {/* Call body */}
        <div className="call-body">

          {showAlertBtn && (
            <button
              className="ai-alert-btn"
              onClick={() => setShowFreeze(true)}
              aria-label="View AI scam alert"
            >
              🛡️ AI Alert
            </button>
          )}

          <div className="call-avatar-wrap">
            <div className="call-ring" />
            <div className="call-ring" />
            <div className="call-ring" />
            <div className={`call-avatar ${caller.isUnknown ? 'unknown' : ''}`}>
              {caller.isUnknown ? '❓' : caller.name.charAt(0).toUpperCase()}
            </div>
          </div>

          <h2 className="call-name">{caller.name}</h2>
          {caller.relation && <p className="call-relation">{caller.relation}</p>}
          <p className="call-number">{caller.phone}</p>
          <p className="call-timer">{formatDuration(elapsed)}</p>

          <div className="call-mic-indicator">
            <div className={`mic-dot ${isMuted ? 'muted' : ''}`} />
            <span>{isMuted ? 'Muted' : isRecording ? 'Recording' : 'Connecting…'}</span>
            {diarizationAnalyzing && (
              <span className="diarization-analyzing-dot" title="Analysing speakers…" />
            )}
          </div>

          {/* ── Privacy routing badge ─────────────────────────────────── */}
          {privacyMode !== 'off' && (
            <div
              className={`privacy-routing-badge ${privacyMode === 'active' ? 'prb-active' : 'prb-fallback'}`}
              aria-label="Speaker routing status"
            >
              {privacyMode === 'active' ? (
                <>
                  <span className="prb-icon">🔏</span>
                  <span className="prb-label">
                    {filteredTotalMs > 0
                      ? `Your voice protected · ${Math.round(filteredTotalMs / 1000)}s filtered`
                      : 'Voice filtering active'}
                  </span>
                  {diarizationRunning && (
                    <span className="prb-pulse" aria-hidden="true" />
                  )}
                </>
              ) : (
                <>
                  <span className="prb-icon">🎙️</span>
                  <span className="prb-label">Monitoring all audio (no voice profiles enrolled)</span>
                </>
              )}
            </div>
          )}

          {/* ── Speaker breakdown (shown once we have data) ───────────── */}
          {privacyMode === 'active' && privacyBadgeItems.length > 0 && (
            <div className="speaker-breakdown" aria-label="Speaker breakdown">
              {privacyBadgeItems.map(({ label, seconds, routed }) => (
                <div key={label} className={`spk-row spk-${routed}`}>
                  <span className="spk-label">
                    {label === 'UNKNOWN'
                      ? '📞 Caller'
                      : label === 'SELF'
                      ? '🙍 You'
                      : `👤 ${label.replace('FAMILY_', '')}`}
                  </span>
                  <span className="spk-time">{seconds}s</span>
                  <span className="spk-route-tag">
                    {routed === 'transcribed' ? 'analysed' : '🔒 protected'}
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* Known contact details card */}
          {familyContact && (
            <div className="contact-details-card">
              <div className="cdc-row">
                <span className="cdc-label">Name</span>
                <span className="cdc-value">{familyContact.name}</span>
              </div>
              {familyContact.relation && (
                <div className="cdc-row">
                  <span className="cdc-label">Relation</span>
                  <span className="cdc-value">{familyContact.relation}</span>
                </div>
              )}
              <div className="cdc-row">
                <span className="cdc-label">Phone</span>
                <span className="cdc-value cdc-mono">{familyContact.phone}</span>
              </div>
              {familyContact.securityQuestion && (
                <div className="cdc-row">
                  <span className="cdc-label">Security Q</span>
                  <span className="cdc-value cdc-dim">{familyContact.securityQuestion}</span>
                </div>
              )}
              <div className="cdc-row">
                <span className="cdc-label">Voice sample</span>
                <span className={`cdc-embed-badge ${familyContact.speakerEmbedding ? 'stored' : 'missing'}`}>
                  {familyContact.speakerEmbedding
                    ? `✓ ${familyContact.speakerEmbedding.dim}d embedding stored`
                    : '✗ not enrolled'}
                </span>
              </div>
            </div>
          )}

          {/* Voice match status badge */}
          {familyContact?.speakerEmbedding && (
            <div className="voice-match-badge" data-state={voiceMatchState}>
              {voiceMatchState === 'sampling' && (
                <span className="vmb-sampling">🎙️ Verifying voice…</span>
              )}
              {voiceMatchState === 'comparing' && (
                <span className="vmb-comparing">🔄 Checking identity…</span>
              )}
              {voiceMatchState === 'done' && voiceMatchResult && callVerified && (
                <span className="vmb-result" style={{ color: '#4ade80' }}>
                  ✅ Verified — {voiceMatchResult.matchPercent.toFixed(1)}%
                </span>
              )}
              {voiceMatchState === 'done' && voiceMatchResult && !callVerified && (
                <span
                  className="vmb-result"
                  style={{
                    color: voiceMatchResult.matchPercent >= 60
                      ? '#4ade80'
                      : voiceMatchResult.matchPercent >= 40
                      ? '#facc15'
                      : '#ff6b6b',
                  }}
                >
                  {voiceMatchResult.verified ? '✅' : '⚠️'}{' '}
                  Voice match: <strong>{voiceMatchResult.matchPercent.toFixed(1)}%</strong>
                  {!voiceMatchResult.verified && ' — checking security…'}
                </span>
              )}
              {voiceMatchState === 'skipped' && (
                <span className="vmb-skipped">— voice check skipped</span>
              )}
            </div>
          )}

          {/* Verified badge replaces scam indicator */}
          {callVerified && (
            <div className="call-verified-badge">
              ✅ Call Verified — monitoring stopped
            </div>
          )}

        </div>{/* end call-body */}

        {/* Action buttons */}
        <div className="call-actions">
          <div className="call-btn-row">

            <div className="call-action-with-label">
              <button
                className={`call-action-btn ${isMuted ? 'muted' : ''}`}
                onClick={() => setIsMuted((m) => !m)}
                aria-label={isMuted ? 'Unmute' : 'Mute'}
                aria-pressed={isMuted}
              >
                {isMuted ? '🔇' : '🎙️'}
              </button>
              <span className="call-action-label">{isMuted ? 'Unmute' : 'Mute'}</span>
            </div>

            <div className="call-action-with-label">
              <button
                className="call-end-btn"
                onClick={handleEndCall}
                aria-label="End call"
              >
                📵
              </button>
              <span className="call-action-label" style={{ color: '#ff6b6b' }}>End</span>
            </div>

            <div className="call-action-with-label">
              <button
                className={`call-action-btn ${isSpeaker ? 'active' : ''}`}
                onClick={() => setIsSpeaker((s) => !s)}
                aria-label={isSpeaker ? 'Speaker off' : 'Speaker on'}
                aria-pressed={isSpeaker}
              >
                {isSpeaker ? '🔊' : '🔈'}
              </button>
              <span className="call-action-label">Speaker</span>
            </div>

          </div>
        </div>

        {/* Scam risk bar — hidden once call is verified */}
        {!callVerified && (
          <div className="scam-risk-bar-wrap">
            <div className="scam-risk-header">
              <span className="scam-risk-label">🛡️ Scam Risk</span>
              <span className="scam-risk-value" style={{ color: riskColor }}>
                {riskLabel}
              </span>
              {privacyMode === 'active' && callerTotalMs > 0 && (
                <span className="scam-risk-source">caller audio only</span>
              )}
            </div>
            <div className="scam-risk-track">
              <div
                className="scam-risk-fill"
                style={{ width: `${scamProb * 100}%`, backgroundColor: riskColor }}
              />
            </div>
          </div>
        )}

      </div>

      {/* Voice mismatch overlay */}
      {showMismatch && familyContact && voiceMatchResult && (
        <VoiceMismatchOverlay
          contact={familyContact}
          matchResult={voiceMatchResult}
          onVerified={handleVerified}
          onEndCall={handleEndCall}
        />
      )}

      {/* Scam freeze overlay */}
      {showFreeze && (
        <FreezeOverlay
          result={bedrockResult}
          isLoading={bedrockLoading}
          onDismiss={() => setShowFreeze(false)}
          onResumeCall={() => {
            setIsMuted(false)
            setShowFreeze(false)
          }}
          onMarkAsSpam={handleMarkAsSpam}
        />
      )}
    </>
  )
}

export default ActiveCallScreen
