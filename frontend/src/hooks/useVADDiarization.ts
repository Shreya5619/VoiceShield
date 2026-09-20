/**
 * useVADDiarization
 *
 * Continuously accumulates live microphone audio into rolling "analysis windows"
 * (default 3 seconds), then POSTs each window to POST /api/analyze-audio-segment.
 *
 * The backend runs:
 *   Energy VAD → Speech region detection → ECAPA-TDNN speaker ID → Routing
 *
 * Routing result for each window:
 *   SELF          → discard (own voice, never transcribed)
 *   FAMILY_<name> → discard (privacy-preserved enrolled contact)
 *   UNKNOWN       → emit callerAudioBlob for the Transcribe pipeline
 *
 * The hook fires onCallerAudio(blob) whenever caller-only audio is ready.
 * It also surfaces the most recent segment breakdown for debugging / privacy UI.
 *
 * Usage:
 *   const { speakerSummary, isAnalyzing, startDiarization, stopDiarization } =
 *     useVADDiarization({ enrolledSpeakers, onCallerAudio })
 */
import { useState, useRef, useCallback, useEffect } from 'react'
import { apiUrl } from '../config/api'
import AudioResampler from '../services/AudioResampler'
import { encodeWav } from '../utils/wav'

// ─── Public types ─────────────────────────────────────────────────────────────

/** Matches the EnrolledSpeaker model on the backend */
export interface EnrolledSpeaker {
  /** "SELF" for the device owner, "FAMILY_<name>" for a contact */
  label: string
  /** 192-d ECAPA-TDNN float vector from /api/speaker-embedding */
  embedding: number[]
}

export interface SegmentResult {
  speaker_label: string   // SELF | FAMILY_<name> | UNKNOWN
  start_ms: number
  end_ms: number
  duration_ms: number
  similarity: number | null
  route: 'discard' | 'transcribe'
}

export interface AudioAnalysisResponse {
  segments: SegmentResult[]
  caller_audio_b64: string | null   // base64 WAV, caller-only
  caller_duration_ms: number
  has_speech: boolean
  speaker_summary: Record<string, number>  // label → total ms
}

export interface UseVADDiarizationConfig {
  /** Enrolled speaker vectors to compare against (SELF + family contacts) */
  enrolledSpeakers: EnrolledSpeaker[]
  /** Called whenever caller-only audio is ready to pipe to Transcribe */
  onCallerAudio: (blob: Blob) => void
  /** How many ms of audio to accumulate before analysing (default 3000) */
  windowMs?: number
  /** Cosine similarity threshold for speaker match (default 0.10 ≈ 55 % match) */
  identificationThreshold?: number
}

export interface UseVADDiarizationResult {
  isAnalyzing: boolean
  isRunning: boolean
  /** Latest per-segment breakdown from the backend */
  lastSegments: SegmentResult[]
  /** Running total of ms attributed to each speaker label */
  speakerSummary: Record<string, number>
  startDiarization: () => Promise<void>
  stopDiarization: () => void
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useVADDiarization({
  enrolledSpeakers,
  onCallerAudio,
  windowMs = 3000,
  identificationThreshold = 0.10,
}: UseVADDiarizationConfig): UseVADDiarizationResult {

  const [isRunning,   setIsRunning]   = useState(false)
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [lastSegments, setLastSegments] = useState<SegmentResult[]>([])
  const [speakerSummary, setSpeakerSummary] = useState<Record<string, number>>({})

  // Audio capture refs
  const audioCtxRef    = useRef<AudioContext | null>(null)
  const processorRef   = useRef<ScriptProcessorNode | null>(null)
  const sourceRef      = useRef<MediaStreamAudioSourceNode | null>(null)
  const streamRef      = useRef<MediaStream | null>(null)
  const resamplerRef   = useRef<AudioResampler | null>(null)

  // Rolling audio buffer (16 kHz float32)
  const bufferRef      = useRef<Float32Array[]>([])
  const bufferMsRef    = useRef<number>(0)
  const isRunningRef   = useRef(false)
  const windowTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Keep a stable ref to the callback so we don't re-trigger effects
  const onCallerAudioRef = useRef(onCallerAudio)
  useEffect(() => { onCallerAudioRef.current = onCallerAudio }, [onCallerAudio])

  const enrolledRef = useRef(enrolledSpeakers)
  useEffect(() => { enrolledRef.current = enrolledSpeakers }, [enrolledSpeakers])

  // ── POST window to backend ───────────────────────────────────────────────
  const analyzeWindow = useCallback(async (samples: Float32Array) => {
    if (samples.length === 0) return

    setIsAnalyzing(true)
    try {
      const wavBlob = encodeWav(samples, 16000)

      const fd = new FormData()
      fd.append('audio', wavBlob, 'window.wav')
      fd.append('enrolled_speakers', JSON.stringify(
        enrolledRef.current.map(s => ({ label: s.label, embedding: s.embedding }))
      ))
      fd.append('identification_threshold', String(identificationThreshold))

      const res = await fetch(apiUrl('/api/analyze-audio-segment'), {
        method: 'POST',
        body: fd,
      })

      if (!res.ok) {
        console.warn('[VADDiarization] analyze-audio-segment returned', res.status)
        // Fall back: treat whole window as UNKNOWN so we don't drop caller audio
        onCallerAudioRef.current(wavBlob)
        return
      }

      const data = (await res.json()) as AudioAnalysisResponse

      setLastSegments(data.segments)
      setSpeakerSummary(prev => {
        const next = { ...prev }
        for (const [label, ms] of Object.entries(data.speaker_summary)) {
          next[label] = (next[label] ?? 0) + ms
        }
        return next
      })

      // Emit caller-only audio if present
      if (data.caller_audio_b64 && data.caller_duration_ms > 0) {
        const binaryStr = atob(data.caller_audio_b64)
        const bytes = new Uint8Array(binaryStr.length)
        for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i)
        const callerBlob = new Blob([bytes], { type: 'audio/wav' })
        onCallerAudioRef.current(callerBlob)
      }
    } catch (err) {
      console.error('[VADDiarization] analysis error', err)
      // On error fall back to forwarding the whole window
      const wavBlob = encodeWav(samples, 16000)
      onCallerAudioRef.current(wavBlob)
    } finally {
      setIsAnalyzing(false)
    }
  }, [identificationThreshold])

  // ── Flush current buffer and schedule next window ────────────────────────
  const flushAndSchedule = useCallback(() => {
    if (!isRunningRef.current) return

    // Merge accumulated chunks
    const chunks = bufferRef.current.splice(0)
    bufferMsRef.current = 0

    if (chunks.length > 0) {
      const total = chunks.reduce((n, c) => n + c.length, 0)
      const merged = new Float32Array(total)
      let off = 0
      for (const c of chunks) { merged.set(c, off); off += c.length }
      analyzeWindow(merged)   // fire-and-forget
    }

    // Schedule the next flush
    windowTimerRef.current = setTimeout(flushAndSchedule, windowMs)
  }, [analyzeWindow, windowMs])

  // ── Cleanup ──────────────────────────────────────────────────────────────
  const cleanup = useCallback(() => {
    windowTimerRef.current && clearTimeout(windowTimerRef.current)
    processorRef.current?.disconnect()
    sourceRef.current?.disconnect()
    audioCtxRef.current?.close().catch(() => {})
    streamRef.current?.getTracks().forEach(t => t.stop())
    processorRef.current = null
    sourceRef.current    = null
    audioCtxRef.current  = null
    streamRef.current    = null
    resamplerRef.current = null
    bufferRef.current    = []
    bufferMsRef.current  = 0
  }, [])

  // ── Start ────────────────────────────────────────────────────────────────
  const startDiarization = useCallback(async () => {
    if (isRunningRef.current) return

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: false },
      })
      streamRef.current = stream

      const ctx = new AudioContext()
      audioCtxRef.current = ctx

      // Build resampler: browser native rate → 16 kHz
      const nativeRate = ctx.sampleRate
      resamplerRef.current = new AudioResampler({
        inputSampleRate:  nativeRate,
        outputSampleRate: 16000,
      })

      const src  = ctx.createMediaStreamSource(stream)
      sourceRef.current = src
      // Buffer size = ~100 ms at native rate, rounded to power of 2
      const bufSize = Math.pow(2, Math.round(Math.log2(nativeRate * 0.1)))
      const proc = ctx.createScriptProcessor(bufSize, 1, 1)
      processorRef.current = proc

      proc.onaudioprocess = (e) => {
        if (!isRunningRef.current) return
        const raw     = e.inputBuffer.getChannelData(0)
        const resampled = resamplerRef.current!.resample(new Float32Array(raw))
        bufferRef.current.push(resampled)
        bufferMsRef.current += (resampled.length / 16000) * 1000
      }

      src.connect(proc)
      proc.connect(ctx.destination)

      isRunningRef.current = true
      setIsRunning(true)
      bufferRef.current   = []
      bufferMsRef.current = 0

      // First window fires after windowMs
      windowTimerRef.current = setTimeout(flushAndSchedule, windowMs)

    } catch (err) {
      cleanup()
      throw err
    }
  }, [cleanup, flushAndSchedule, windowMs])

  // ── Stop ─────────────────────────────────────────────────────────────────
  const stopDiarization = useCallback(() => {
    isRunningRef.current = false
    setIsRunning(false)
    cleanup()
  }, [cleanup])

  // Cleanup on unmount
  useEffect(() => () => {
    isRunningRef.current = false
    cleanup()
  }, [cleanup])

  return {
    isAnalyzing,
    isRunning,
    lastSegments,
    speakerSummary,
    startDiarization,
    stopDiarization,
  }
}

export default useVADDiarization
