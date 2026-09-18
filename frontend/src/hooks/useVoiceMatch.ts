/**
 * useVoiceMatch
 *
 * Captures the first SAMPLE_DURATION_MS milliseconds of call audio, encodes it
 * as a RIFF WAV blob, and POSTs it together with the contact's stored speaker
 * embedding to /api/verify-speaker.
 *
 * Only activates when `contact` is non-null and has a `speakerEmbedding`.
 * Unknown callers are completely unaffected.
 */
import { useState, useEffect, useRef, useCallback } from 'react'
import { FamilyContact } from './useFamilyContacts'
import { apiUrl } from '../config/api'

export type VoiceMatchState =
  | 'idle'        // not started or not applicable
  | 'sampling'    // capturing mic audio
  | 'comparing'   // waiting for backend response
  | 'done'        // result available
  | 'skipped'     // no embedding / error / timeout

export interface VoiceMatchResult {
  matchPercent: number   // 0–100
  similarity: number     // cosine, -1 to 1
  verified: boolean      // matchPercent >= 60
}

const SAMPLE_DURATION_MS = 5_000
const VOICE_MATCH_THRESHOLD = Number((import.meta as any).env.VITE_VOICE_MATCH_THRESHOLD ?? 60)   // 5 seconds is enough for a reliable embedding
const COMPARE_TIMEOUT_MS = 15_000

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
    v.setInt16(off, s < 0 ? s * 0x8000 : s * 0x7fff, true); off += 2
  }
  return new Blob([buf], { type: 'audio/wav' })
}

export function useVoiceMatch(contact: FamilyContact | null) {
  const [state, setState]   = useState<VoiceMatchState>('idle')
  const [result, setResult] = useState<VoiceMatchResult | null>(null)

  // Audio capture refs
  const audioCtxRef   = useRef<AudioContext | null>(null)
  const processorRef  = useRef<ScriptProcessorNode | null>(null)
  const sourceRef     = useRef<MediaStreamAudioSourceNode | null>(null)
  const streamRef     = useRef<MediaStream | null>(null)
  const samplesRef    = useRef<Float32Array[]>([])
  const sampleRateRef = useRef<number>(44100)
  const stopTimerRef  = useRef<ReturnType<typeof setTimeout> | null>(null)
  const abortRef      = useRef<AbortController | null>(null)
  const ranRef        = useRef(false)  // ensure we only run once per mount

  const cleanup = useCallback(() => {
    stopTimerRef.current && clearTimeout(stopTimerRef.current)
    abortRef.current?.abort()
    processorRef.current?.disconnect()
    sourceRef.current?.disconnect()
    audioCtxRef.current?.close()
    streamRef.current?.getTracks().forEach((t) => t.stop())
    processorRef.current = null
    sourceRef.current    = null
    audioCtxRef.current  = null
    streamRef.current    = null
    samplesRef.current   = []
  }, [])

  const compare = useCallback(async (blob: Blob, embedding: FamilyContact['speakerEmbedding']) => {
    if (!embedding) { setState('skipped'); return }
    setState('comparing')

    const controller = new AbortController()
    abortRef.current = controller
    const timeoutId = setTimeout(() => controller.abort(), COMPARE_TIMEOUT_MS)

    try {
      const fd = new FormData()
      fd.append('live_audio', blob, 'live.wav')
      fd.append('stored_embedding', JSON.stringify(embedding))

      const res = await fetch(apiUrl('/api/verify-speaker'), {
        method: 'POST',
        body: fd,
        signal: controller.signal,
      })

      if (!res.ok) { setState('skipped'); return }
      const data = await res.json()
      setResult({
        matchPercent: data.match_percent,
        similarity:   data.similarity,
        verified:     data.verified,
      })
      setState('done')
    } catch {
      setState('skipped')
    } finally {
      clearTimeout(timeoutId)
    }
  }, [])

  const startCapture = useCallback(async (embedding: FamilyContact['speakerEmbedding']) => {
    setState('sampling')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream

      const ctx = new AudioContext()
      audioCtxRef.current  = ctx
      sampleRateRef.current = ctx.sampleRate

      const src  = ctx.createMediaStreamSource(stream)
      sourceRef.current = src
      const proc = ctx.createScriptProcessor(4096, 1, 1)
      processorRef.current = proc

      proc.onaudioprocess = (e) => {
        samplesRef.current.push(new Float32Array(e.inputBuffer.getChannelData(0)))
      }
      src.connect(proc)
      proc.connect(ctx.destination)

      stopTimerRef.current = setTimeout(() => {
        // Stop audio capture and encode
        const chunks   = samplesRef.current
        const total    = chunks.reduce((n, c) => n + c.length, 0)
        const merged   = new Float32Array(total)
        let off = 0
        for (const c of chunks) { merged.set(c, off); off += c.length }

        cleanup()

        const blob = encodeWav(merged, sampleRateRef.current)
        compare(blob, embedding)
      }, SAMPLE_DURATION_MS)
    } catch {
      cleanup()
      setState('skipped')
    }
  }, [cleanup, compare])

  useEffect(() => {
    if (ranRef.current) return
    if (!contact?.speakerEmbedding) {
      setState('skipped')
      return
    }
    ranRef.current = true
    startCapture(contact.speakerEmbedding)
    return cleanup
  }, [contact, startCapture, cleanup])

  return { voiceMatchState: state, voiceMatchResult: result }
}

