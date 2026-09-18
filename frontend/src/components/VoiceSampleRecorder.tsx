/**
 * VoiceSampleRecorder
 *
 * Renders a compact recorder inside the contact form. The user presses
 * "Record" and has 5 seconds to say "hello world". When the timer
 * finishes (or they press Stop early) the recording is POSTed to
 * /api/speaker-embedding. On success the component calls onEmbeddingReady
 * with the base64 WAV and the embedding vector.
 *
 * All state is local; the parent form just receives the result.
 */

import React, { useRef, useState, useCallback, useEffect } from 'react'
import { SpeakerEmbedding } from '../hooks/useFamilyContacts'

const RECORD_DURATION_MS = 5000
// Use the same base URL pattern as other panels in this project
const BACKEND_URL = 'http://localhost:5000'

export type VoiceSampleState =
  | { status: 'idle' }
  | { status: 'recording'; secondsLeft: number }
  | { status: 'uploading' }
  | { status: 'done'; base64: string; embedding: SpeakerEmbedding }
  | { status: 'error'; message: string }

interface VoiceSampleRecorderProps {
  /** Called whenever a successful embedding is obtained (or cleared) */
  onEmbeddingReady: (base64: string | null, embedding: SpeakerEmbedding | null) => void
  /** Optionally pre-populate from an existing contact */
  initialBase64?: string
  initialEmbedding?: SpeakerEmbedding
}

export const VoiceSampleRecorder: React.FC<VoiceSampleRecorderProps> = ({
  onEmbeddingReady,
  initialBase64,
  initialEmbedding,
}) => {
  const [recState, setRecState] = useState<VoiceSampleState>(
    initialBase64 && initialEmbedding
      ? { status: 'done', base64: initialBase64, embedding: initialEmbedding }
      : { status: 'idle' },
  )

  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const stopTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      timerRef.current && clearInterval(timerRef.current)
      stopTimeoutRef.current && clearTimeout(stopTimeoutRef.current)
      mediaRecorderRef.current?.stream?.getTracks().forEach((t) => t.stop())
    }
  }, [])

  const uploadAndEmbed = useCallback(
    async (wavBlob: Blob) => {
      setRecState({ status: 'uploading' })

      try {
        // Convert blob to base64 for localStorage storage
        const base64 = await blobToBase64(wavBlob)

        // Upload WAV to backend
        const formData = new FormData()
        formData.append('audio', wavBlob, 'voice_sample.wav')

        const res = await fetch(`${BACKEND_URL}/api/speaker-embedding`, {
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

        setRecState({ status: 'done', base64, embedding })
        onEmbeddingReady(base64, embedding)
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Embedding failed'
        setRecState({ status: 'error', message })
        onEmbeddingReady(null, null)
      }
    },
    [onEmbeddingReady],
  )

  const stopRecording = useCallback(() => {
    timerRef.current && clearInterval(timerRef.current)
    stopTimeoutRef.current && clearTimeout(stopTimeoutRef.current)

    const mr = mediaRecorderRef.current
    if (mr && mr.state !== 'inactive') {
      mr.stop() // triggers ondataavailable + onstop
    }
  }, [])

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      chunksRef.current = []

      const mr = new MediaRecorder(stream)
      mediaRecorderRef.current = mr

      mr.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data)
      }

      mr.onstop = () => {
        stream.getTracks().forEach((t) => t.stop())
        const wavBlob = new Blob(chunksRef.current, { type: 'audio/wav' })
        uploadAndEmbed(wavBlob)
      }

      mr.start()

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
  }, [stopRecording, uploadAndEmbed])

  const handleClear = useCallback(() => {
    setRecState({ status: 'idle' })
    onEmbeddingReady(null, null)
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

// ── Helpers ──────────────────────────────────────────────────────────────────

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve((reader.result as string).split(',')[1])
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
}

export default VoiceSampleRecorder
