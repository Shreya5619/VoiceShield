/**
 * useTranscription - Direct React hook for Amazon Transcribe streaming
 * Uses official AWS SDK v3 which handles WebSocket internally
 */
import { useState, useCallback, useRef, useEffect } from 'react'
import {
  TranscribeStreamingClient,
  StartStreamTranscriptionCommand,
  type StartStreamTranscriptionCommandInput,
} from '@aws-sdk/client-transcribe-streaming'
import { TranscriptionSegment, ConnectionState } from '../types'
import AudioProcessor from '../services/AudioProcessor'
import AudioResampler from '../services/AudioResampler'
import AudioQuantizer from '../services/AudioQuantizer'
import { apiUrl } from '../config/api'

export interface UseTranscriptionConfig {
  languageCode?: string
  region?: string
  credentials?: {
    accessKeyId: string
    secretAccessKey: string
    sessionToken?: string
  }
  /**
   * When true, the hook does NOT start its own mic capture.
   * Instead, call feedCallerAudio(blob) to push caller-only WAV blobs
   * produced by useVADDiarization.
   */
  externalAudio?: boolean
  /**
   * When true, enables AWS Transcribe multi-language identification
   * (en-US + hi-IN). The detected language is stored per segment and
   * the hook surfaces the latest detected language via detectedLanguage.
   * Mutually exclusive with a fixed languageCode.
   */
  multiLanguage?: boolean
  /**
   * User's preferred language for AI responses: 'en' or 'hi'
   */
  userLanguage?: string
}

export interface UseTranscriptionResult {
  isRecording: boolean
  isTranscribing: boolean
  connectionState: ConnectionState
  segments: TranscriptionSegment[]
  currentPartial: TranscriptionSegment | null
  error: Error | null
  /** BCP-47 code of the last detected language, e.g. 'en-US' or 'hi-IN' */
  detectedLanguage: string | null
  startRecording: () => Promise<void>
  stopRecording: () => void
  reset: () => void
  sendToBackend: (transcript: string) => Promise<any>
  /**
   * Feed a caller-only WAV blob (from useVADDiarization) into the
   * Transcribe stream.  No-op if the stream is not yet started.
   */
  feedCallerAudio: (blob: Blob) => void
}

export function useTranscription(config: UseTranscriptionConfig = {}): UseTranscriptionResult {
  const [isRecording, setIsRecording] = useState(false)
  const [isTranscribing, setIsTranscribing] = useState(false)
  const [connectionState, setConnectionState] = useState(ConnectionState.Idle)
  const [segments, setSegments] = useState<TranscriptionSegment[]>([])
  const [currentPartial, setCurrentPartial] = useState<TranscriptionSegment | null>(null)
  const [error, setError] = useState<Error | null>(null)
  const [detectedLanguage, setDetectedLanguage] = useState<string | null>(null)

  const audioProcessorRef = useRef<AudioProcessor | null>(null)
  const resamplerRef = useRef<AudioResampler | null>(null)
  const clientRef = useRef<TranscribeStreamingClient | null>(null)
  const abortControllerRef = useRef<AbortController | null>(null)
  const sequenceRef = useRef(0)
  const segmentIdRef = useRef(0)
  const isRecordingRef = useRef(false)

  // Shared audio queue fed by EITHER the mic processor OR feedCallerAudio
  const audioChunksRef = useRef<Uint8Array[]>([])
  const audioResolverRef = useRef<(() => void) | null>(null)

  /**
   * Start recording and streaming to Transcribe
   */
  const startRecording = useCallback(async () => {
    try {
      setError(null)
      setConnectionState(ConnectionState.Connecting)

      // Get credentials
      const region = config.region || (import.meta as any).env.VITE_AWS_REGION || 'us-east-1'
      const languageCode = config.languageCode || (import.meta as any).env.VITE_AWS_LANGUAGE || 'en-US'
      const useMultiLanguage = config.multiLanguage ?? true // default ON for Hindi+English

      const credentials = config.credentials || {
        accessKeyId:
          (import.meta as any).env.VITE_AWS_ACCESS_KEY_ID || localStorage.getItem('AWS_ACCESS_KEY_ID') || 'mock',
        secretAccessKey:
          (import.meta as any).env.VITE_AWS_SECRET_ACCESS_KEY ||
          localStorage.getItem('AWS_SECRET_ACCESS_KEY') ||
          'mock',
        sessionToken:
          (import.meta as any).env.VITE_AWS_SESSION_TOKEN ||
          localStorage.getItem('AWS_SESSION_TOKEN'),
      }

      if (credentials.accessKeyId === 'mock') {
        throw new Error('AWS credentials not configured. Add VITE_AWS_ACCESS_KEY_ID to .env.local')
      }

      isRecordingRef.current = true
      setIsRecording(true)
      sequenceRef.current = 0
      segmentIdRef.current = 0
      audioChunksRef.current = []
      audioResolverRef.current = null

      // ── Mic capture (only when NOT in externalAudio mode) ────────────────
      if (!config.externalAudio) {
        const processor = new AudioProcessor({
          targetSampleRate: 16000,
          chunkDurationMs: 100,
          echoCancellation: true,
          noiseSuppression: true,
        })
        await processor.initialize()
        audioProcessorRef.current = processor

        const inputRate = processor.getAudioContext()?.sampleRate || 44100
        const resampler = new AudioResampler({
          inputSampleRate: inputRate,
          outputSampleRate: 16000,
        })
        resamplerRef.current = resampler

        processor.onAudioFrame((frame) => {
          if (!isRecordingRef.current) return
          try {
            const resampled = resamplerRef.current!.resample(frame.data)
            const quantized = AudioQuantizer.quantize(resampled)
            const audioData = new Uint8Array(quantized.buffer)
            audioChunksRef.current.push(audioData)
            if (audioResolverRef.current) {
              audioResolverRef.current()
              audioResolverRef.current = null
            }
          } catch (err) {
            console.error('Audio processing error:', err)
          }
        })

        processor.start()
      }

      // Create abort controller
      const abortController = new AbortController()
      abortControllerRef.current = abortController

      // Create Transcribe client
      const client = new TranscribeStreamingClient({
        region,
        credentials: {
          accessKeyId: credentials.accessKeyId,
          secretAccessKey: credentials.secretAccessKey,
          sessionToken: credentials.sessionToken,
        },
      })
      clientRef.current = client

      // Audio stream async generator — reads from shared audioChunksRef
      const audioStream = async function* () {
        let frameCount = 0
        while (isRecordingRef.current && !abortController.signal.aborted) {
          if (audioChunksRef.current.length > 0) {
            const chunk = audioChunksRef.current.shift()
            if (chunk) {
              frameCount++
              yield { AudioEvent: { AudioChunk: chunk } }
            }
          } else {
            await new Promise<void>((resolve) => {
              audioResolverRef.current = resolve
              setTimeout(() => {
                if (audioResolverRef.current) {
                  audioResolverRef.current = null
                }
                resolve()
              }, 200)
            })
          }
        }
        console.log(`✋ Audio stream ended after ${frameCount} frames`)
      }

      // Send to Transcribe
      // When multiLanguage is enabled (default), use IdentifyLanguage so AWS
      // automatically detects whether each segment is English or Hindi.
      // NOTE: IdentifyLanguage and LanguageCode are mutually exclusive.
      const transcribeParams: StartStreamTranscriptionCommandInput = useMultiLanguage
        ? {
            IdentifyLanguage: true,
            LanguageOptions: 'en-US,hi-IN',
            PreferredLanguage: 'en-US',
            MediaSampleRateHertz: 16000,
            MediaEncoding: 'pcm',
            AudioStream: audioStream(),
          }
        : {
            LanguageCode: languageCode as 'en-US',
            MediaSampleRateHertz: 16000,
            MediaEncoding: 'pcm',
            AudioStream: audioStream(),
          }
      const command = new StartStreamTranscriptionCommand(transcribeParams)

      const response = await client.send(command, { abortSignal: abortController.signal })
      setConnectionState(ConnectionState.Connected)
      setIsTranscribing(true)

      // Process results
      if (response.TranscriptResultStream) {
        for await (const event of response.TranscriptResultStream) {
          if (abortController.signal.aborted) break

          if (event.TranscriptEvent) {
            const transcript = event.TranscriptEvent.Transcript
            if (transcript?.Results) {
              for (const result of transcript.Results) {
                if (result.Alternatives && result.Alternatives.length > 0) {
                  const alt = result.Alternatives[0]
                  const isPartial = result.IsPartial ?? false
                  // Capture language detected by Transcribe for this result
                  const lang = result.LanguageCode ?? null
                  if (lang) setDetectedLanguage(lang)
                  console.log('Result details:', { isPartial, transcript: alt.Transcript, detectedLanguage: lang })
                  const segment: TranscriptionSegment = {
                    id: `seg-${segmentIdRef.current++}`,
                    transcript: alt.Transcript || '',
                    detectedLanguage: lang ?? undefined,
                    isPartial,
                    confidence: 0.95,
                    items: [],
                    sequenceNumber: sequenceRef.current++,
                    timestamp: Date.now(),
                  }

                  console.log(isPartial ? '📝 Partial:' : '✓ Final:', segment.transcript, lang ? `[${lang}]` : '')

                  if (isPartial) {
                    setCurrentPartial(segment)
                  } else {
                    setCurrentPartial(null)
                    setSegments((prev) => [...prev, segment])
                  }
                }
              }
            }
          }
        }
      } else {
        console.warn('⚠️ No TranscriptResultStream in response')
      }
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err))
      const awsError = err as {
        name?: string
        Code?: string
        $metadata?: { httpStatusCode?: number; requestId?: string }
      }
      console.error('❌ Transcription error:', {
        message: error.message,
        name: awsError.name,
        code: awsError.Code,
        status: awsError.$metadata?.httpStatusCode,
        requestId: awsError.$metadata?.requestId,
        error,
      })
      setError(error)
      setConnectionState(ConnectionState.Error)
    } finally {
      stopRecording()
    }
  }, [config])

  /**
   * Feed a caller-only WAV blob (produced by useVADDiarization) into the
   * running Transcribe stream.  Decodes the WAV to 16-bit PCM and queues it
   * exactly like frames from the mic processor would be.
   *
   * No-op if the stream has not been started (isRecordingRef.current === false).
   */
  const feedCallerAudio = useCallback((blob: Blob) => {
    if (!isRecordingRef.current) return

    blob.arrayBuffer().then((buf) => {
      try {
        // The WAV from the backend is 16 kHz mono 16-bit PCM.
        // We need to strip the 44-byte RIFF header and hand the raw PCM bytes
        // straight to the Transcribe queue.
        const WAV_HEADER_BYTES = 44
        const pcmBuf = buf.byteLength > WAV_HEADER_BYTES
          ? buf.slice(WAV_HEADER_BYTES)
          : buf

        const audioData = new Uint8Array(pcmBuf)
        if (audioData.length === 0) return

        audioChunksRef.current.push(audioData)
        if (audioResolverRef.current) {
          audioResolverRef.current()
          audioResolverRef.current = null
        }
      } catch (err) {
        console.error('[Transcription] feedCallerAudio error', err)
      }
    }).catch((err) => console.error('[Transcription] blob.arrayBuffer error', err))
  }, [])

  /**
   * Send transcribed text to backend for scam prediction
   */
  const sendToBackend = useCallback(async (transcript: string) => {
    try {
      const backendUrl = apiUrl('')
      console.log(`📤 Using apiUrl: ${backendUrl}`)
      console.log(`📤 Sending to backend: "${transcript}"`)
      
      const response = await fetch(apiUrl('/api/analyze-scam'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          transcript,
          user_language: config.userLanguage,
        }),
      })

      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      
      const prediction = await response.json()
      console.log('🔍 Scam detection result:', prediction)
      return prediction
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err))
      console.error('❌ Backend error:', error)
      throw error
    }
  }, [config.userLanguage])

  /**
   * Stop recording
   */
  const stopRecording = useCallback(() => {
    isRecordingRef.current = false
    setIsRecording(false)
    setIsTranscribing(false)

    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
    }

    if (audioProcessorRef.current) {
      audioProcessorRef.current.stop()
      audioProcessorRef.current.cleanup()
      audioProcessorRef.current = null
    }

    if (clientRef.current) {
      clientRef.current.destroy()
      clientRef.current = null
    }

    setConnectionState(ConnectionState.Idle)
  }, [])

  /**
   * Reset state
   */
  const reset = useCallback(() => {
    stopRecording()
    setSegments([])
    setCurrentPartial(null)
    setError(null)
    setDetectedLanguage(null)
    sequenceRef.current = 0
    segmentIdRef.current = 0
  }, [stopRecording])

  /**
   * Cleanup on unmount
   */
  useEffect(() => {
    return () => {
      stopRecording()
    }
  }, [stopRecording])

  return {
    isRecording,
    isTranscribing,
    connectionState,
    segments,
    currentPartial,
    error,
    detectedLanguage,
    startRecording,
    stopRecording,
    reset,
    sendToBackend,
    feedCallerAudio,
  }
}

export default useTranscription
