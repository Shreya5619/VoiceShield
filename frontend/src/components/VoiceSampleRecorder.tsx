/**
 * VoiceSampleRecorder
 *
 * Renders a compact recorder inside the contact form. The user presses
 * "Record" and has 5 seconds to say "hello world". When the timer
 * finishes (or they press Stop early) the recording is POSTed to
 * /api/speaker-embedding. On success the component calls onEmbeddingReady
 * with the embedding vector. The WAV is sent only to the backend and is not stored.
 *
 * Recording uses the Web Audio API (AudioContext + ScriptProcessorNode) to
 * capture raw Float32 PCM samples and encode them as a proper RIFF WAV blob.
 * This replaces the former MediaRecorder approach which mislabeled WebM/Opus
 * chunks as 'audio/wav', causing torchaudio on the backend to reject them.
 *
 * All state is local; the parent form just receives the result.
 */

import React, { useRef, useState, useCallback, useEffect } from 'react'
import { SpeakerEmbedding } from '../hooks/useFamilyContacts'
import { apiUrl } from '../config/api'
import { encodeWav } from '../utils/wav'
import '../styles/VoiceSampleRecorder.css'

const RECORD_DURATION_MS = 5000
// Use the same base URL pattern as other panels in this project

export type VoiceSampleState =
  | { status: 'idle' }
  | { status: 'recording'; secondsLeft: number }
  | { status: 'uploading' }
  | { status: 'done'; embedding: SpeakerEmbedding }
  | { status: 'error'; message: string }

interface VoiceSampleRecorderProps {
  /** Called whenever a successful embedding is obtained (or cleared) */
  onEmbeddingReady: (embedding: SpeakerEmbedding | null) => void
  /** Optionally pre-populate from an existing contact */
  initialEmbedding?: SpeakerEmbedding
}

export const VoiceSampleRecorder: React.FC<VoiceSampleRecorderProps> = ({
  onEmbeddingReady,
  initialEmbedding,
}) => {
  const [recState, setRecState] = useState<VoiceSampleState>(
    initialEmbedding
      ? { status: 'done', embedding: initialEmbedding }
      : { status: 'idle' },
  )

  // Web Audio API refs
  const audioCtxRef = useRef<AudioContext | null>(null)
  const processorRef = useRef<ScriptProcessorNode | null>(null)
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null)
  const samplesRef = useRef<Float32Array[]>([])
  const sampleRateRef = useRef<number>(44100)
  const streamRef = useRef<MediaStream | null>(null)

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const stopTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      timerRef.current && clearInterval(timerRef.current)
      stopTimeoutRef.current && clearTimeout(stopTimeoutRef.current)
      processorRef.current?.disconnect()
      sourceRef.current?.disconnect()
      audioCtxRef.current?.close()
      streamRef.current?.getTracks().forEach((t) => t.stop())
    }
  }, [])

  const uploadAndEmbed = useCallback(
    async (wavBlob: Blob) => {
      setRecState({ status: 'uploading' })

      try {
        // Upload WAV to backend
        const formData = new FormData()
        formData.append('audio', wavBlob, 'voice_sample.wav')

        const res = await fetch(apiUrl('/api/speaker-embedding'), {
          method: 'POST',
          body: formData,
        })

        if (!res.ok) {
          const err = await res.json().catch(() => ({ detail: 'Unknown error' }))
          throw new Error(err.detail ?? `HTTP ${res.status}`)
        }

        const data = await res.json()
        const embedding: SpeakerEmbedding = {
          vector: data.embedding,
          dim: data.embedding_dim,
          generatedAt: new Date().toISOString(),
        }

        setRecState({ status: 'done', embedding })
        onEmbeddingReady(embedding)
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Embedding failed'
        setRecState({ status: 'error', message })
        onEmbeddingReady(null)
      }
    },
    [onEmbeddingReady],
  )

  const stopRecording = useCallback(() => {
    timerRef.current && clearInterval(timerRef.current)
    stopTimeoutRef.current && clearTimeout(stopTimeoutRef.current)

    // Disconnect Web Audio nodes
    const processor = processorRef.current
    const source = sourceRef.current
    const audioCtx = audioCtxRef.current

    processor?.disconnect()
    source?.disconnect()

    // Capture sample rate before closing context
    const sampleRate = sampleRateRef.current
    audioCtx?.close()

    // Stop the microphone stream
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null

    // Merge all captured Float32Array chunks into one buffer
    const allChunks = samplesRef.current
    const totalLength = allChunks.reduce((acc, s) => acc + s.length, 0)
    const merged = new Float32Array(totalLength)
    let offset = 0
    for (const chunk of allChunks) {
      merged.set(chunk, offset)
      offset += chunk.length
    }

    // Reset refs
    processorRef.current = null
    sourceRef.current = null
    audioCtxRef.current = null
    samplesRef.current = []

    // Encode to a real RIFF WAV blob and upload
    const wavBlob = encodeWav(merged, sampleRate)
    uploadAndEmbed(wavBlob)
  }, [uploadAndEmbed])

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream
      samplesRef.current = []

      const audioCtx = new AudioContext()
      audioCtxRef.current = audioCtx
      sampleRateRef.current = audioCtx.sampleRate

      const source = audioCtx.createMediaStreamSource(stream)
      sourceRef.current = source

      // ScriptProcessorNode: deprecated but universally supported
      const processor = audioCtx.createScriptProcessor(4096, 1, 1)
      processorRef.current = processor

      processor.onaudioprocess = (e) => {
        // Copy — the underlying buffer is reused each callback
        samplesRef.current.push(new Float32Array(e.inputBuffer.getChannelData(0)))
      }

      source.connect(processor)
      processor.connect(audioCtx.destination)

      // Countdown timer
      let secondsLeft = Math.ceil(RECORD_DURATION_MS / 1000)
      setRecState({ status: 'recording', secondsLeft })

      timerRef.current = setInterval(() => {
        secondsLeft -= 1
        setRecState({ status: 'recording', secondsLeft })
        if (secondsLeft <= 0) {
          clearInterval(timerRef.current!)
        }
      }, 1000)

      // Auto-stop after duration
      stopTimeoutRef.current = setTimeout(stopRecording, RECORD_DURATION_MS)
    } catch {
      setRecState({ status: 'error', message: 'Microphone access denied' })
    }
  }, [stopRecording])

  const handleClear = useCallback(() => {
    setRecState({ status: 'idle' })
    onEmbeddingReady(null)
  }, [onEmbeddingReady])

  return (
    <div className="voice-recorder">
      <div className="voice-recorder-label">
        <span>🎙️</span>
        <span>Voice Sample</span>
        <span className="voice-recorder-hint">(optional — say "hello world")</span>
      </div>

      {recState.status === 'idle' && (
        <button type="button" className="voice-btn record" onClick={startRecording}>
          ● Start 5-second recording
        </button>
      )}

      {recState.status === 'recording' && (
        <div className="voice-recording-row">
          <span className="voice-recording-pulse">🔴</span>
          <span className="voice-recording-countdown">
            Recording… {recState.secondsLeft}s
          </span>
          <button type="button" className="voice-btn stop" onClick={stopRecording}>
            ■ Stop
          </button>
        </div>
      )}

      {recState.status === 'uploading' && (
        <div className="voice-uploading">
          <span className="voice-spinner">⏳</span>
          <span>Generating speaker embedding…</span>
        </div>
      )}

      {recState.status === 'done' && (
        <div className="voice-done-row">
          <span className="voice-done-icon">✅</span>
          <span className="voice-done-text">
            Voice sample ready · {recState.embedding.dim}d embedding
          </span>
          <button type="button" className="voice-btn clear" onClick={handleClear}>
            ✕ Clear
          </button>
        </div>
      )}

      {recState.status === 'error' && (
        <div className="voice-error-row">
          <span>⚠️ {recState.message}</span>
          <button type="button" className="voice-btn record" onClick={startRecording}>
            Retry
          </button>
        </div>
      )}
    </div>
  )
}

export default VoiceSampleRecorder
