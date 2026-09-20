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
import AIWarningOverlay from './AIWarningOverlay'
import useTranscription from '../hooks/useTranscription'
import useVADDiarization, { EnrolledSpeaker, SegmentResult } from '../hooks/useVADDiarization'
import { ScamAnalysisResult } from '../types'
import AudioProcessor from '../services/AudioProcessor'
import AudioQuantizer from '../services/AudioQuantizer'
import AudioResampler from '../services/AudioResampler'
import '../styles/ActiveCallScreen.css'
import { apiUrl } from '../config/api'
import { useVoiceMatch } from '../hooks/useVoiceMatch'

interface ActiveCallScreenProps {
  caller: CallerInfo
  onEndCall: () => void
  /** Owner's phone number — used to load their self-embedding from localStorage */
  ownerPhone?: string
  /** Owner's name — included in alerts sent to emergency contacts */
  ownerName?: string
  /** User's preferred language for AI responses: 'en' or 'hi' */
  languageCode?: string
}

const SCAM_THRESHOLD = 0.70  // 70% - matches backend AgentCore threshold

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

/** Encode Float32Array samples as WAV blob */
function encodeWav(samples: Float32Array, sampleRate: number): Blob {
  const dataSize = samples.length * 2
  const buf = new ArrayBuffer(44 + dataSize)
  const v = new DataView(buf)
  const ws = (off: number, s: string) => {
    for (let i = 0; i < s.length; i++) v.setUint8(off + i, s.charCodeAt(i))
  }
  ws(0, 'RIFF'); v.setUint32(4, 36 + dataSize, true); ws(8, 'WAVE')
  ws(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true)
  v.setUint32(24, sampleRate, true); v.setUint32(28, sampleRate * 2, true)
  v.setUint16(32, 2, true); v.setUint16(34, 16, true)
  ws(36, 'data'); v.setUint32(40, dataSize, true)
  let off = 44
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]))
    v.setInt16(off, s < 0 ? s * 0x8000 : s * 0x7fff, true)
    off += 2
  }
  return new Blob([buf], { type: 'audio/wav' })
}

/* ── Component ───────────────────────────────────────────────────────────── */

export const ActiveCallScreen: React.FC<ActiveCallScreenProps> = ({
  caller,
  onEndCall,
  ownerPhone,
  ownerName,
  languageCode = 'en',  // default to English
}) => {

  // Log language preference for debugging
  useEffect(() => {
    console.log('🌐 ActiveCallScreen language preference:', languageCode)
  }, [languageCode])

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
  const isRecordingRef = useRef(false)

  /* ── Voice verification state ─────────────────────────────────────────── */
  const [showMismatch, setShowMismatch] = useState(false)
  const [callVerified, setCallVerified] = useState(false)

  /* ── Scam state ───────────────────────────────────────────────────────── */
  const [scamProb,       setScamProb]       = useState(0)
  const [bedrockResult,  setBedrockResult]  = useState<ScamAnalysisResult | null>(null)
  const [bedrockLoading, setBedrockLoading] = useState(false)

  /* ── Deepfake/AI detection state ──────────────────────────────────────── */
  const [aiWarningData, setAiWarningData] = useState<null | {
    is_ai_generated: boolean
    ai_probability: number
    human_probability: number
    confidence_level: 'HIGH' | 'MEDIUM' | 'LOW' | 'NONE'
  }>(null)
  const [showAiWarning, setShowAiWarning] = useState(false)
  const aiWarningTriggeredRef = useRef(false)

  const hasRealResultRef = useRef(false)
  const analyzingRef     = useRef(false)
  // Guard so the emergency-contact alert is sent only once per call
  const spamAlertSentRef = useRef(false)

  /* ── Notify emergency contacts (fire-and-forget, deduped) ─────────────── */
  const sendSpamAlert = useCallback(
    async (result: ScamAnalysisResult | null) => {
      if (spamAlertSentRef.current) return
      if (!ownerPhone) return
      spamAlertSentRef.current = true
      try {
        await fetch(apiUrl('/api/spam-alerts'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            owner_phone: ownerPhone,
            owner_name: ownerName || 'A VoiceShield user',
            caller_phone: caller.phone,
            caller_name: caller.name,
            scam_probability: scamProb,
            risk_level: result?.risk_level,
            summary: result?.summary || '',
            idempotency_key: `${ownerPhone}-${caller.id}`,
          }),
        })
      } catch {
        // Allow a retry on a later trigger if this request failed
        spamAlertSentRef.current = false
      }
    },
    [ownerPhone, ownerName, caller, scamProb],
  )

  useEffect(() => {
    if (bedrockResult?.summary || (bedrockResult?.verification_questions?.length ?? 0) > 0) {
      setShowFreeze(true)
      // Alert emergency contacts as soon as a scam is confirmed — independent
      // of whether the user later continues the call or marks it as spam.
      void sendSpamAlert(bedrockResult)
    }
  }, [bedrockResult, sendSpamAlert])

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
    detectedLanguage,
  } = useTranscription({
    region: 'us-east-1',
    // multiLanguage: true is the default — enables Hindi+English auto-detect
    // Use external audio feed when we have enrolled speakers to filter with.
    // Falls back to raw mic capture when no embeddings exist yet.
    externalAudio: enrolledSpeakers.length > 0,
    userLanguage: languageCode,  // Pass user's preferred language for AI responses
  })

  /* ── VAD / Diarization ────────────────────────────────────────────────── */
  const handleCallerAudio = useCallback(async (blob: Blob) => {
    // Debug: Log when caller audio is received
    console.log('[ActiveCall] Caller audio received, blob size:', blob.size, 'type:', blob.type)
    
    // Run deepfake detection on caller audio (only once per call)
    if (!aiWarningTriggeredRef.current && !callVerified) {
      console.log('[ActiveCall] Running deepfake detection...')
      aiWarningTriggeredRef.current = true
      try {
        const formData = new FormData()
        formData.append('audio', blob, 'caller_audio.wav')
        
        const url = apiUrl('/api/detect-deepfake')
        console.log('[ActiveCall] Calling deepfake endpoint:', url)

        const res = await fetch(url, {
          method: 'POST',
          body: formData,
        })

        console.log('[ActiveCall] Deepfake response status:', res.status)
        
        if (res.ok) {
          const data = await res.json()
          console.log('[ActiveCall] Deepfake detection result:', data)
          setAiWarningData(data)
          if (data.is_ai_generated && data.confidence_level === 'HIGH') {
            console.log('[ActiveCall] AI-generated speech detected with HIGH confidence!')
            setShowAiWarning(true)
          }
        } else {
          console.warn('[ActiveCall] Deepfake detection failed:', await res.text())
        }
      } catch (err) {
        console.error('[ActiveCall] Deepfake detection error:', err)
      }
    } else {
      console.log('[ActiveCall] Skipping deepfake detection:', {
        alreadyTriggered: aiWarningTriggeredRef.current,
        callVerified: callVerified
      })
    }

    feedCallerAudio(blob)
  }, [feedCallerAudio, callVerified])

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

  /* ── Deepfake detection audio processor ───────────────────────────────── */
  // Separate audio processor for deepfake detection (captures all audio)
  const deepfakeAudioProcessorRef = useRef<AudioProcessor | null>(null)
  const deepfakeAudioChunksRef = useRef<Uint8Array[]>([])
  const deepfakeAudioResolverRef = useRef<(() => void) | null>(null)

  useEffect(() => {
    // Only set up deepfake audio processor for unknown callers
    // (known contacts will use diarization which provides caller-only audio)
    if (caller.isUnknown) {
      const setupDeepfakeProcessor = async () => {
        try {
          const processor = new AudioProcessor({
            targetSampleRate: 16000,
            chunkDurationMs: 100,
            echoCancellation: true,
            noiseSuppression: true,
          })
          await processor.initialize()
          deepfakeAudioProcessorRef.current = processor

          const inputRate = processor.getAudioContext()?.sampleRate || 44100
          const resampler = new AudioResampler({
            inputSampleRate: inputRate,
            outputSampleRate: 16000,
          })

          processor.onAudioFrame((frame) => {
            if (!isRecordingRef.current) return
            try {
              const resampled = resampler.resample(frame.data)
              const quantized = AudioQuantizer.quantize(resampled)
              const audioData = new Uint8Array(quantized.buffer)
              
              // Buffer chunks for deepfake detection
              deepfakeAudioChunksRef.current.push(audioData)
              if (deepfakeAudioResolverRef.current) {
                deepfakeAudioResolverRef.current()
                deepfakeAudioResolverRef.current = null
              }
            } catch (err) {
              console.error('Deepfake audio processing error:', err)
            }
          })

          processor.start()
          console.log('[ActiveCall] Deepfake audio processor started for unknown caller')
        } catch (err) {
          console.error('[ActiveCall] Failed to start deepfake audio processor:', err)
        }
      }

      setupDeepfakeProcessor()

      return () => {
        if (deepfakeAudioProcessorRef.current) {
          deepfakeAudioProcessorRef.current.stop()
          deepfakeAudioProcessorRef.current.cleanup()
          deepfakeAudioProcessorRef.current = null
        }
      }
    }
  }, [caller.isUnknown])

  /* ── Process deepfake audio chunks and run detection ──────────────────── */
  useEffect(() => {
    if (!caller.isUnknown) return  // Only for unknown callers

    const processChunks = async () => {
      if (!isRecordingRef.current || aiWarningTriggeredRef.current || callVerified) return

      // Accumulate audio chunks for ~2 seconds
      const chunks = deepfakeAudioChunksRef.current.splice(0)
      if (chunks.length === 0) return

      // Convert chunks to WAV blob
      try {
        const totalSamples = chunks.reduce((sum, c) => sum + c.length / 2, 0) // 16-bit = 2 bytes per sample
        const samples = new Float32Array(totalSamples)
        let offset = 0
        for (const chunk of chunks) {
          for (let i = 0; i < chunk.length; i += 2) {
            const int16 = new DataView(chunk.buffer, chunk.byteOffset + i, 2).getInt16(0, true)
            samples[offset++] = int16 / 32768.0
          }
        }

        if (samples.length < 16000) return  // Need at least 1 second of audio

        // Encode to WAV
        const wavBlob = encodeWav(samples, 16000)
        
        // Run deepfake detection
        aiWarningTriggeredRef.current = true
        try {
          const formData = new FormData()
          formData.append('audio', wavBlob, 'caller_audio.wav')

          const res = await fetch(apiUrl('/api/detect-deepfake'), {
            method: 'POST',
            body: formData,
          })

          console.log('[ActiveCall] Deepfake response status:', res.status)
          
          if (res.ok) {
            const data = await res.json()
            console.log('[ActiveCall] Deepfake detection result:', data)
            setAiWarningData(data)
            if (data.is_ai_generated && data.confidence_level === 'HIGH') {
              console.log('[ActiveCall] AI-generated speech detected with HIGH confidence!')
              setShowAiWarning(true)
            }
          } else {
            console.warn('[ActiveCall] Deepfake detection failed:', await res.text())
          }
        } catch (err) {
          console.error('[ActiveCall] Deepfake detection error:', err)
        }
      } catch (err) {
        console.error('[ActiveCall] Audio chunk processing error:', err)
      }
    }

    // Process chunks every 2 seconds
    const intervalId = setInterval(processChunks, 2000)
    return () => clearInterval(intervalId)
  }, [caller.isUnknown, callVerified])

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

    // Always start deepfake detection (runs on all audio)
    aiWarningTriggeredRef.current = false
    setShowAiWarning(false)
    setAiWarningData(null)
    isRecordingRef.current = true

    if (hasDiarization) {
      setPrivacyMode('active')
      startDiarization().catch((err) => {
        console.warn('[ActiveCall] Diarization start failed, falling back to raw mic', err)
        setPrivacyMode('fallback')
      })
    } else {
      setPrivacyMode('fallback')
      // For unknown callers without diarization, we still run deepfake detection
      // but we need to capture audio from somewhere
      console.log('[ActiveCall] No enrolled speakers - diarization not running')
      console.log('[ActiveCall] Deepfake detection will run when audio is available')
    }

    return () => {
      stopRecording()
      stopDiarization()
      isRecordingRef.current = false
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  /* ── Full transcript from caller-only segments ────────────────────────── */
  // For display: show the original spoken text (Hindi or English as-is)
  const fullTranscript = useMemo(
    () => segments.map((s) => s.transcript).filter(Boolean).join(' ').trim(),
    [segments],
  )

  // For scam detection: use the translated English text when available,
  // otherwise fall back to the original (which is already English).
  const fullTranscriptForScam = useMemo(
    () =>
      segments
        .map((s) => s.translatedTranscript ?? s.transcript)
        .filter(Boolean)
        .join(' ')
        .trim(),
    [segments],
  )

  // The dominant detected language across all segments (last known value)
  const isHindi = detectedLanguage?.startsWith('hi') ?? false

  /* ── Predict-scam polling (debounced 1 s) ─────────────────────────────── */
  useEffect(() => {
    if (!fullTranscriptForScam) return
    if (callVerified) return

    const timer = setTimeout(async () => {
      try {
        const res = await fetch(apiUrl('/api/predict-scam'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            transcript: fullTranscriptForScam,
            source_language: detectedLanguage ?? undefined,
          }),
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
            body: JSON.stringify({
              transcript: fullTranscriptForScam,
              source_language: detectedLanguage ?? undefined,
              user_language: languageCode,
            }),
          })
            .then((r) => {
              console.log('🌐 Sent analyze-scam request with user_language:', languageCode)
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
  }, [fullTranscriptForScam, callVerified, detectedLanguage])

  /* ── End call ─────────────────────────────────────────────────────────── */
  const handleEndCall = useCallback(() => {
    stopRecording()
    stopDiarization()
    hasRealResultRef.current = false
    analyzingRef.current = false
    aiWarningTriggeredRef.current = false
    spamAlertSentRef.current = false
    setShowAiWarning(false)
    setAiWarningData(null)
    onEndCall()
  }, [stopRecording, stopDiarization, onEndCall])

  const handleMarkAsSpam = useCallback(async () => {
    try {
      // The alert is normally sent automatically when the scam is detected.
      // This is a safety net in case that hasn't happened yet (guarded so it
      // won't create a duplicate). The stable idempotency_key also prevents
      // the backend from creating a second alert for the same call.
      await sendSpamAlert(bedrockResult)
    } finally {
      handleEndCall()
    }
  }, [sendSpamAlert, bedrockResult, handleEndCall])

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

          {/* Circular risk gauge */}
          {!callVerified && scamProb > 0 && (
            <div className="risk-gauge-container">
              <svg className="risk-gauge" width="80" height="80" viewBox="0 0 80 80">
                <circle
                  className="risk-gauge-bg"
                  cx="40"
                  cy="40"
                  r="34"
                  fill="none"
                  stroke="rgba(255,255,255,0.1)"
                  strokeWidth="6"
                />
                <circle
                  className="risk-gauge-fill"
                  cx="40"
                  cy="40"
                  r="34"
                  fill="none"
                  stroke={riskColor}
                  strokeWidth="6"
                  strokeDasharray={`${scamProb * 213.6} 213.6`}
                  strokeLinecap="round"
                  transform="rotate(-90 40 40)"
                  style={{
                    filter: `drop-shadow(0 0 6px ${riskColor})`,
                    transition: 'stroke-dasharray 0.6s ease, stroke 0.4s ease'
                  }}
                />
                <text
                  x="40"
                  y="40"
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fill={riskColor}
                  fontSize="18"
                  fontWeight="800"
                  fontFamily="'Courier New', monospace"
                  style={{ textShadow: `0 0 8px ${riskColor}` }}
                >
                  {(scamProb * 100).toFixed(0)}%
                </text>
              </svg>
              <span className="risk-gauge-label">{riskLabel}</span>
            </div>
          )}

          <div className="call-mic-indicator">
            <div className={`mic-dot ${isMuted ? 'muted' : ''}`} />
            <span>{isMuted ? 'Muted' : isRecording ? 'Recording' : 'Connecting…'}</span>
            {diarizationAnalyzing && (
              <span className="diarization-analyzing-dot" title="Analysing speakers…" />
            )}
          </div>

          {/* ── Language badge ───────────────────────────────── */}
          {detectedLanguage && (
            <div
              className={`language-badge ${isHindi ? 'lang-hindi' : 'lang-english'}`}
              aria-label={`Detected language: ${isHindi ? 'Hindi' : 'English'}`}
            >
              {isHindi ? '🇮🇳 हिंदी → EN' : '🇺🇸 English'}
            </div>
          )}

          {/* ── AI Response Language indicator ───────────────── */}
          <div className="ai-response-language-badge">
            🤖 AI responses in: {languageCode === 'hi' ? 'हिंदी (Hindi)' : 'English'}
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
              <span className="scam-risk-percentage" style={{ color: riskColor }}>
                {(scamProb * 100).toFixed(1)}%
              </span>
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

      {/* AI-generated speech warning overlay */}
      {showAiWarning && aiWarningData && (
        <AIWarningOverlay
          data={{
            is_ai_generated: aiWarningData.is_ai_generated,
            ai_probability: aiWarningData.ai_probability,
            human_probability: aiWarningData.human_probability,
            confidence_level: aiWarningData.confidence_level,
          }}
          onAcknowledge={() => {
            setShowAiWarning(false)
            // Continue monitoring but don't show warning again
          }}
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
          languageCode={languageCode}
        />
      )}
    </>
  )
}

export default ActiveCallScreen
