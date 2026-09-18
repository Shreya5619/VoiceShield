import React, {
  useEffect,
  useRef,
  useState,
  useCallback,
  useMemo,
} from 'react'
import { CallerInfo } from './CallerPicker'
import FreezeOverlay from './FreezeOverlay'
import useTranscription from '../hooks/useTranscription'
import { ScamAnalysisResult } from '../types'
import '../styles/ActiveCallScreen.css'

interface ActiveCallScreenProps {
  caller: CallerInfo
  onEndCall: () => void
}

const SCAM_THRESHOLD = 0.8

/* ── helpers ─────────────────────────────────────────────── */
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
  return 'Analyzing…'
}

/* ── component ───────────────────────────────────────────── */
export const ActiveCallScreen: React.FC<ActiveCallScreenProps> = ({ caller, onEndCall }) => {

  /* ── call timer ──────────────────────────────────────── */
  const [elapsed, setElapsed] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setElapsed((s) => s + 1), 1000)
    return () => clearInterval(id)
  }, [])

  /* ── UI toggles ──────────────────────────────────────── */
  const [isMuted,        setIsMuted]        = useState(false)
  const [isSpeaker,      setIsSpeaker]      = useState(false)
  const [showFreeze,     setShowFreeze]     = useState(false)

  /* ── scam state ──────────────────────────────────────── */
  const [scamProb,       setScamProb]       = useState(0)
  const [bedrockResult,  setBedrockResult]  = useState<ScamAnalysisResult | null>(null)
  const [bedrockLoading, setBedrockLoading] = useState(false)

  /**
   * hasRealResultRef — flipped true once we receive a response that contains
   * a summary or verification questions. Once we have real content we never
   * overwrite it with a cooldown-skipped response.
   */
  const hasRealResultRef = useRef(false)

  /**
   * analyzingRef — true while an analyze-scam fetch is in-flight.
   * Prevents concurrent fetches from being fired by overlapping transcript polls.
   */
  const analyzingRef = useRef(false)

  /* Auto-open overlay when real Bedrock content arrives */
  useEffect(() => {
    if (bedrockResult?.summary || (bedrockResult?.verification_questions?.length ?? 0) > 0) {
      setShowFreeze(true)
    }
  }, [bedrockResult])

  /* ── transcription ───────────────────────────────────── */
  const { segments, startRecording, stopRecording, isRecording } =
    useTranscription({ languageCode: 'en-US', region: 'us-east-1' })

  useEffect(() => {
    startRecording().catch(console.error)
    return () => stopRecording()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const fullTranscript = useMemo(
    () => segments.map((s) => s.transcript).filter(Boolean).join(' ').trim(),
    [segments],
  )

  /* ── predict-scam polling (debounced 1 s) ────────────── */
  useEffect(() => {
    if (!fullTranscript) return

    const timer = setTimeout(async () => {
      try {
        const res = await fetch('http://localhost:5000/api/predict-scam', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ transcript: fullTranscript }),
        })
        if (!res.ok) return
        const data = await res.json()
        const prob: number = data.scam_probability ?? 0
        setScamProb(prob)

        // When threshold crossed, auto-mute and call analyze-scam.
        // The backend cooldown ensures agentcore is only called once per window.
        // We keep calling until we get real content (backend returns it when ready).
        if (prob >= SCAM_THRESHOLD) {
          setIsMuted(true)

          // Real result already stored — nothing more to do
          if (hasRealResultRef.current) return

          // Another analyze-scam is already in-flight — skip this tick
          if (analyzingRef.current) return

          analyzingRef.current = true
          setBedrockLoading(true)
          setShowFreeze(true)

          fetch('http://localhost:5000/api/analyze-scam', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ transcript: fullTranscript }),
          })
            .then((r) => {
              if (!r.ok) throw new Error(`HTTP ${r.status}`)
              return r.json() as Promise<ScamAnalysisResult>
            })
            .then((data) => {
              const hasContent =
                !!data.summary ||
                !!(data.verification_questions && data.verification_questions.length > 0)

              if (hasContent) {
                hasRealResultRef.current = true
                setBedrockResult({ ...data, is_scam: true })
              }
              // Always clear — if no content, next transcript poll will retry
              setBedrockLoading(false)
              analyzingRef.current = false
            })
            .catch(() => {
              setBedrockLoading(false)
              analyzingRef.current = false
            })
        }
      } catch { /* ignore network errors during call */ }
    }, 1000)

    return () => clearTimeout(timer)
  }, [fullTranscript])

  /* ── end call ────────────────────────────────────────── */
  const handleEndCall = useCallback(() => {
    stopRecording()
    hasRealResultRef.current = false
    analyzingRef.current = false
    onEndCall()
  }, [stopRecording, onEndCall])

  /* ── clock string ────────────────────────────────────── */
  const [clockStr, setClockStr] = useState('')
  useEffect(() => {
    const tick = () =>
      setClockStr(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }))
    tick()
    const id = setInterval(tick, 10000)
    return () => clearInterval(id)
  }, [])

  /* ── derived ─────────────────────────────────────────── */
  const riskColor    = getRiskColor(scamProb)
  const riskLabel    = getRiskLabel(scamProb)
  const showAlertBtn = bedrockLoading || bedrockResult !== null

  return (
    <>
      <div className="active-call-screen">

        {/* ── Status bar ──────────────────────────────── */}
        <div className="call-statusbar">
          <span className="call-statusbar-time">{clockStr}</span>
          <div className="call-statusbar-icons">
            <span>📶</span>
            <span>🔋</span>
          </div>
        </div>

        {/* ── Call body ───────────────────────────────── */}
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
          </div>
        </div>

        {/* ── Action buttons ──────────────────────────── */}
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

        {/* ── Scam risk bar ────────────────────────────── */}
        <div className="scam-risk-bar-wrap">
          <div className="scam-risk-header">
            <span className="scam-risk-label">🛡️ Scam Risk</span>
            <span className="scam-risk-value" style={{ color: riskColor }}>
              {riskLabel}
            </span>
          </div>
          <div className="scam-risk-track">
            <div
              className="scam-risk-fill"
              style={{ width: `${scamProb * 100}%`, backgroundColor: riskColor }}
            />
          </div>
        </div>
      </div>

      {/* ── Freeze overlay ──────────────────────────────── */}
      {showFreeze && (
        <FreezeOverlay
          result={bedrockResult}
          isLoading={bedrockLoading}
          onDismiss={() => setShowFreeze(false)}
          onResumeCall={() => {
            setIsMuted(false)
            setShowFreeze(false)
          }}
          onMarkAsSpam={handleEndCall}
        />
      )}
    </>
  )
}

export default ActiveCallScreen
