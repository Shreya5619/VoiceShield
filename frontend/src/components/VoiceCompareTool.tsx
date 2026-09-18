/**
 * VoiceCompareTool
 *
 * Minimal dev tool rendered below the family-contacts list.
 * Record two voice samples, POST both to /api/compare-voices,
 * and display the cosine-similarity match percentage.
 */

import React, { useState, useCallback } from 'react'
import { VoiceSampleRecorder } from './VoiceSampleRecorder'
import { SpeakerEmbedding } from '../hooks/useFamilyContacts'
import { apiUrl } from '../config/api'

// We need the raw WAV blob, not just the embedding, for the comparison request.
// We reuse VoiceSampleRecorder but intercept the blob before it goes to the
// embedding endpoint by using a thin wrapper that captures the blob too.
// Simpler approach: just re-record both and hit /api/compare-voices directly.
//
// Since VoiceSampleRecorder only exposes the embedding (not the raw blob),
// we capture the WAV by routing through a thin in-component recorder that
// mirrors the Web Audio logic just for the blob — but that's heavy.
//
// Easiest: build two minimal inline recorders that capture the blob AND
// generate an embedding, then send both blobs to /api/compare-voices.
// We store the blob in a ref alongside the embedding state.

type SlotState =
  | { status: 'idle' }
  | { status: 'recording'; secondsLeft: number }
  | { status: 'processing' }
  | { status: 'ready'; blob: Blob; dim: number }
  | { status: 'error'; message: string }

const RECORD_MS = 5000

function useVoiceSlot() {
  const [state, setState] = useState<SlotState>({ status: 'idle' })
  const blobRef = React.useRef<Blob | null>(null)

  const audioCtxRef = React.useRef<AudioContext | null>(null)
  const processorRef = React.useRef<ScriptProcessorNode | null>(null)
  const sourceRef = React.useRef<MediaStreamAudioSourceNode | null>(null)
  const samplesRef = React.useRef<Float32Array[]>([])
  const sampleRateRef = React.useRef<number>(44100)
  const streamRef = React.useRef<MediaStream | null>(null)
  const timerRef = React.useRef<ReturnType<typeof setInterval> | null>(null)
  const stopTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null)

  const stop = useCallback(() => {
    timerRef.current && clearInterval(timerRef.current)
    stopTimeoutRef.current && clearTimeout(stopTimeoutRef.current)

    processorRef.current?.disconnect()
    sourceRef.current?.disconnect()
    const sr = sampleRateRef.current
    audioCtxRef.current?.close()
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null

    const chunks = samplesRef.current
    const total = chunks.reduce((n, c) => n + c.length, 0)
    const merged = new Float32Array(total)
    let off = 0
    for (const c of chunks) { merged.set(c, off); off += c.length }

    processorRef.current = null
    sourceRef.current = null
    audioCtxRef.current = null
    samplesRef.current = []

    const blob = encodeWav(merged, sr)
    blobRef.current = blob
    setState({ status: 'processing' })

    // Hit the embedding endpoint just to confirm it works and get the dim
    const fd = new FormData()
    fd.append('audio', blob, 'voice_sample.wav')
    fetch(apiUrl('/api/speaker-embedding'), { method: 'POST', body: fd })
      .then((r) => r.ok ? r.json() : r.json().then((e: { detail?: string }) => Promise.reject(new Error(e.detail ?? `HTTP ${r.status}`))))
      .then((d: { embedding_dim: number }) => setState({ status: 'ready', blob, dim: d.embedding_dim }))
      .catch((e: unknown) => setState({ status: 'error', message: e instanceof Error ? e.message : 'Failed' }))
  }, [])

  const start = useCallback(async () => {
    blobRef.current = null
    samplesRef.current = []
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream
      const ctx = new AudioContext()
      audioCtxRef.current = ctx
      sampleRateRef.current = ctx.sampleRate
      const src = ctx.createMediaStreamSource(stream)
      sourceRef.current = src
      const proc = ctx.createScriptProcessor(4096, 1, 1)
      processorRef.current = proc
      proc.onaudioprocess = (e) => {
        samplesRef.current.push(new Float32Array(e.inputBuffer.getChannelData(0)))
      }
      src.connect(proc)
      proc.connect(ctx.destination)

      let s = Math.ceil(RECORD_MS / 1000)
      setState({ status: 'recording', secondsLeft: s })
      timerRef.current = setInterval(() => {
        s -= 1
        setState({ status: 'recording', secondsLeft: s })
        if (s <= 0) clearInterval(timerRef.current!)
      }, 1000)
      stopTimeoutRef.current = setTimeout(stop, RECORD_MS)
    } catch {
      setState({ status: 'error', message: 'Microphone access denied' })
    }
  }, [stop])

  const clear = useCallback(() => {
    blobRef.current = null
    setState({ status: 'idle' })
  }, [])

  return { state, blobRef, start, stop, clear }
}

export const VoiceCompareTool: React.FC = () => {
  const slotA = useVoiceSlot()
  const slotB = useVoiceSlot()
  const [result, setResult] = useState<{ matchPct: number; similarity: number } | null>(null)
  const [comparing, setComparing] = useState(false)
  const [compareError, setCompareError] = useState<string | null>(null)

  const canCompare =
    slotA.state.status === 'ready' && slotB.state.status === 'ready'

  const handleCompare = useCallback(async () => {
    if (!canCompare) return
    const blobA = slotA.blobRef.current
    const blobB = slotB.blobRef.current
    if (!blobA || !blobB) return

    setComparing(true)
    setResult(null)
    setCompareError(null)

    try {
      const fd = new FormData()
      fd.append('audio_a', blobA, 'voice_a.wav')
      fd.append('audio_b', blobB, 'voice_b.wav')
      const res = await fetch(apiUrl('/api/compare-voices'), { method: 'POST', body: fd })
      if (!res.ok) {
        const e = await res.json().catch(() => ({ detail: `HTTP ${res.status}` }))
        throw new Error(e.detail)
      }
      const data = await res.json()
      setResult({ matchPct: data.match_percent, similarity: data.similarity })
    } catch (e: unknown) {
      setCompareError(e instanceof Error ? e.message : 'Comparison failed')
    } finally {
      setComparing(false)
    }
  }, [canCompare, slotA.blobRef, slotB.blobRef])

  const matchColor = result
    ? result.matchPct >= 70 ? '#4ade80' : result.matchPct >= 45 ? '#facc15' : '#ff6b6b'
    : '#4ade80'

  return (
    <div className="vct-card">
      <p className="vct-title">🧪 Voice Match Tester</p>
      <div className="vct-slots">
        <VoiceSlot label="Voice A" slot={slotA} />
        <VoiceSlot label="Voice B" slot={slotB} />
      </div>

      <div className="vct-actions">
        <button
          className="vct-btn-compare"
          onClick={handleCompare}
          disabled={!canCompare || comparing}
        >
          {comparing ? '⏳ Comparing…' : '⚖️ Compare'}
        </button>
      </div>

      {compareError && (
        <p className="vct-error">⚠️ {compareError}</p>
      )}

      {result && (
        <div className="vct-result">
          <span className="vct-match-pct" style={{ color: matchColor }}>
            {result.matchPct.toFixed(1)}%
          </span>
          <span className="vct-match-label">match</span>
          <span className="vct-similarity">(cosine similarity: {result.similarity.toFixed(4)})</span>
        </div>
      )}
    </div>
  )
}

// ── Slot sub-component ────────────────────────────────────────────────────────

interface SlotProps {
  label: string
  slot: ReturnType<typeof useVoiceSlot>
}

const VoiceSlot: React.FC<SlotProps> = ({ label, slot }) => {
  const { state, start, stop, clear } = slot
  return (
    <div className="vct-slot">
      <p className="vct-slot-label">{label}</p>

      {state.status === 'idle' && (
        <button className="voice-btn record vct-slot-btn" onClick={start}>
          ● Record
        </button>
      )}

      {state.status === 'recording' && (
        <div className="voice-recording-row">
          <span className="voice-recording-pulse">🔴</span>
          <span className="voice-recording-countdown">{state.secondsLeft}s</span>
          <button className="voice-btn stop" onClick={stop}>■ Stop</button>
        </div>
      )}

      {state.status === 'processing' && (
        <div className="voice-uploading">
          <span className="voice-spinner">⏳</span>
          <span>Processing…</span>
        </div>
      )}

      {state.status === 'ready' && (
        <div className="voice-done-row">
          <span className="voice-done-icon">✅</span>
          <span className="voice-done-text">{state.dim}d ready</span>
          <button className="voice-btn clear" onClick={clear}>✕</button>
        </div>
      )}

      {state.status === 'error' && (
        <div className="voice-error-row">
          <span>⚠️ {state.message}</span>
          <button className="voice-btn record" onClick={start}>Retry</button>
        </div>
      )}
    </div>
  )
}

// ── WAV encoder (same as VoiceSampleRecorder) ────────────────────────────────

function encodeWav(samples: Float32Array, sampleRate: number): Blob {
  const dataSize = samples.length * 2
  const buf = new ArrayBuffer(44 + dataSize)
  const v = new DataView(buf)
  const ws = (off: number, s: string) => { for (let i = 0; i < s.length; i++) v.setUint8(off + i, s.charCodeAt(i)) }
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

export default VoiceCompareTool
