/**
 * useTranscription - Direct React hook for Amazon Transcribe streaming
 * Uses official AWS SDK v3 which handles WebSocket internally
 */

import { useState, useCallback, useRef, useEffect } from 'react'
import {
  TranscribeStreamingClient,
  StartStreamTranscriptionCommand,
} from '@aws-sdk/client-transcribe-streaming'
import { TranscriptionSegment, ConnectionState } from '../types'
import AudioProcessor from '../services/AudioProcessor'
import AudioResampler from '../services/AudioResampler'
import AudioQuantizer from '../services/AudioQuantizer'

export interface UseTranscriptionConfig {
  languageCode?: string
  region?: string
  credentials?: {
    accessKeyId: string
    secretAccessKey: string
    sessionToken?: string
  }
}

export interface UseTranscriptionResult {
  isRecording: boolean
  isTranscribing: boolean
  connectionState: ConnectionState
  segments: TranscriptionSegment[]
  currentPartial: TranscriptionSegment | null
  error: Error | null
  startRecording: () => Promise<void>
  stopRecording: () => void
  reset: () => void
}

export function useTranscription(config: UseTranscriptionConfig = {}): UseTranscriptionResult {
  const [isRecording, setIsRecording] = useState(false)
  const [isTranscribing, setIsTranscribing] = useState(false)
  const [connectionState, setConnectionState] = useState(ConnectionState.Idle)
  const [segments, setSegments] = useState<TranscriptionSegment[]>([])
  const [currentPartial, setCurrentPartial] = useState<TranscriptionSegment | null>(null)
  const [error, setError] = useState<Error | null>(null)

  const audioProcessorRef = useRef<AudioProcessor | null>(null)
  const resamplerRef = useRef<AudioResampler | null>(null)
  const clientRef = useRef<TranscribeStreamingClient | null>(null)
  const abortControllerRef = useRef<AbortController | null>(null)
  const sequenceRef = useRef(0)
  const segmentIdRef = useRef(0)
  const isRecordingRef = useRef(false)

  /**
   * Create audio chunk generator
   */
  const createAudioGenerator = useCallback(function* () {
    console.log('Audio generator started')
    while (isRecordingRef.current) {
      // This will be filled by onAudioFrame callback
      yield new Promise<Uint8Array>((resolve) => {
        // Store resolver temporarily
        ;(window as any).__audioResolver = resolve
      })
    }
    console.log('Audio generator stopped')
  }, [])

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

      // Initialize audio processor
      const processor = new AudioProcessor({
        targetSampleRate: 16000,
        chunkDurationMs: 100,
        echoCancellation: true,
        noiseSuppression: true,
      })

      await processor.initialize()
      audioProcessorRef.current = processor

      // Initialize resampler
      const inputRate = processor.getAudioContext()?.sampleRate || 44100
      const resampler = new AudioResampler({
        inputSampleRate: inputRate,
        outputSampleRate: 16000,
      })
      resamplerRef.current = resampler

      isRecordingRef.current = true
      setIsRecording(true)
      sequenceRef.current = 0
      segmentIdRef.current = 0

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

      console.log('✓ Transcribe client created')
      setConnectionState(ConnectionState.Connected)
      setIsTranscribing(true)

      // Create audio stream
      const audioChunks: Uint8Array[] = []
      let audioResolver: (() => void) | null = null

      processor.onAudioFrame((frame) => {
        if (!isRecordingRef.current) return

        try {
          // Resample
          const resampled = resamplerRef.current!.resample(frame.data)

          // Quantize to int16
          const quantized = AudioQuantizer.quantize(resampled)
          const audioData = new Uint8Array(quantized.buffer)

          console.log(`🎵 Audio frame: ${audioData.length} bytes`)

          // Push to queue
          audioChunks.push(audioData)
          console.log(`📦 Queue now has ${audioChunks.length} chunks`)

          // Resolve pending promise if exists
          if (audioResolver) {
            console.log('🔔 Resolving pending audio resolver')
            audioResolver() // Just resolve - chunks are already in the queue
            audioResolver = null
          }
        } catch (err) {
          console.error('Audio processing error:', err)
        }
      })

      // Audio stream async generator
      const audioStream = async function* () {
        console.log('🔄 Audio stream generator started')
        let frameCount = 0
        while (isRecordingRef.current && !abortController.signal.aborted) {
          if (audioChunks.length > 0) {
            const chunk = audioChunks.shift()
            if (chunk) {
              frameCount++
              console.log(`📨 Yielding frame #${frameCount}: ${chunk.length} bytes (queue: ${audioChunks.length})`)
              yield { AudioEvent: { AudioChunk: chunk } }
            }
          } else {
            // Wait for more audio
            console.log(`⏳ Waiting for audio (have ${frameCount} frames so far, queue: ${audioChunks.length})`)
            await new Promise<void>((resolve) => {
              audioResolver = () => {
                resolve()
              }
              // If no audio arrives in 200ms, continue anyway (in case of silence)
              setTimeout(() => {
                if (audioResolver) {
                  console.log('⏱️ Audio timeout, continuing')
                  audioResolver = null
                }
                resolve()
              }, 200)
            })
          }
        }
        console.log(`✋ Audio stream ended after ${frameCount} frames`)
      }

      // Start capturing audio
      processor.start()
      console.log('✓ Audio capture started')

      // Send to Transcribe
      const command = new StartStreamTranscriptionCommand({
        LanguageCode: languageCode,
        MediaSampleRateHertz: 16000,
        MediaEncoding: 'pcm',
        AudioStream: audioStream(),
      })

      console.log('📤 Sending to Transcribe...')
      const response = await client.send(command, { abortSignal: abortController.signal })

      // Process results
      if (response.TranscriptResultStream) {
        console.log('🔊 Result stream received, listening for events...')
        let eventCount = 0
        for await (const event of response.TranscriptResultStream) {
          if (abortController.signal.aborted) break

          console.log(`📨 Event #${++eventCount}:`, Object.keys(event))

          if (event.TranscriptEvent) {
            console.log('✓ TranscriptEvent received')
            const transcript = event.TranscriptEvent.Transcript
            if (transcript?.Results) {
              console.log(`📊 Results: ${transcript.Results.length}`)
              for (const result of transcript.Results) {
                console.log('Result:', {
                  isPartial: result.IsPartial,
                  alternatives: result.Alternatives?.length,
                  transcript: result.Alternatives?.[0]?.Transcript,
                })
                if (result.Alternatives && result.Alternatives.length > 0) {
                  const alt = result.Alternatives[0]
                  const isPartial = result.IsPartial ?? false

                  const segment: TranscriptionSegment = {
                    id: `seg-${segmentIdRef.current++}`,
                    transcript: alt.Transcript || '',
                    isPartial,
                    confidence: 0.95,
                    items: [],
                    sequenceNumber: sequenceRef.current++,
                    timestamp: Date.now(),
                  }

                  console.log(isPartial ? '📝 Partial:' : '✓ Final:', segment.transcript)

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
        console.log(`✓ Result stream ended after ${eventCount} events`)
      } else {
        console.warn('⚠️ No TranscriptResultStream in response')
      }
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err))
      console.error('❌ Transcription error:', error)
      setError(error)
      setConnectionState(ConnectionState.Error)
    } finally {
      stopRecording()
    }
  }, [config])

  /**
   * Stop recording
   */
  const stopRecording = useCallback(() => {
    console.log('Stopping recording...')
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
    startRecording,
    stopRecording,
    reset,
  }
}

export default useTranscription
