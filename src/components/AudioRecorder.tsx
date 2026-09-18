import { useState, useCallback, useRef, useEffect } from 'react'
import '../styles/AudioRecorder.css'

interface AudioRecorderProps {
  onRecordingStateChange?: (isRecording: boolean) => void
  onAudioData?: (audioData: Float32Array, sampleRate: number) => void
  disabled?: boolean
}

export const AudioRecorder: React.FC<AudioRecorderProps> = ({
  onRecordingStateChange,
  onAudioData,
  disabled = false,
}) => {
  const [isRecording, setIsRecording] = useState(false)
  const [permissionDenied, setPermissionDenied] = useState(false)
  const [permissionError, setPermissionError] = useState<string>('')
  const mediaStreamRef = useRef<MediaStream | null>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const analyzerRef = useRef<AnalyserNode | null>(null)

  const requestMicrophonePermission = useCallback(async (): Promise<boolean> => {
    try {
      setPermissionError('')
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: false,
        },
        video: false,
      })
      mediaStreamRef.current = stream
      setPermissionDenied(false)
      return true
    } catch (error) {
      if (error instanceof DOMException) {
        if (error.name === 'NotAllowedError') {
          setPermissionError('Microphone permission was denied. Please allow microphone access.')
          setPermissionDenied(true)
        } else if (error.name === 'NotFoundError') {
          setPermissionError('No microphone found on your device.')
          setPermissionDenied(true)
        } else if (error.name === 'NotReadableError') {
          setPermissionError(
            'Microphone is already in use by another application. Please close other apps using the microphone.'
          )
          setPermissionDenied(true)
        } else {
          setPermissionError(`Error accessing microphone: ${error.message}`)
          setPermissionDenied(true)
        }
      }
      return false
    }
  }, [])

  const startRecording = useCallback(async () => {
    try {
      // Request microphone permission if not already granted
      if (!mediaStreamRef.current) {
        const hasPermission = await requestMicrophonePermission()
        if (!hasPermission) {
          return
        }
      }

      // Initialize Web Audio API
      if (!audioContextRef.current) {
        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)()
      }

      const audioContext = audioContextRef.current
      const stream = mediaStreamRef.current!

      // Resume audio context if suspended
      if (audioContext.state === 'suspended') {
        await audioContext.resume()
      }

      // Create analyser for visual feedback
      const analyser = audioContext.createAnalyser()
      analyzerRef.current = analyser

      // Create source from media stream
      const source = audioContext.createMediaStreamSource(stream)
      source.connect(analyser)

      setIsRecording(true)
      setPermissionDenied(false)
      onRecordingStateChange?.(true)
    } catch (error) {
      console.error('Error starting recording:', error)
      setPermissionError('Failed to start recording. Please try again.')
    }
  }, [requestMicrophonePermission, onRecordingStateChange])

  const stopRecording = useCallback(() => {
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop())
      mediaStreamRef.current = null
    }

    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      audioContextRef.current.close()
      audioContextRef.current = null
    }

    analyzerRef.current = null
    setIsRecording(false)
    onRecordingStateChange?.(false)
  }, [onRecordingStateChange])

  const toggleRecording = useCallback(async () => {
    if (isRecording) {
      stopRecording()
    } else {
      await startRecording()
    }
  }, [isRecording, startRecording, stopRecording])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (isRecording) {
        stopRecording()
      }
    }
  }, [isRecording, stopRecording])

  return (
    <div className="audio-recorder">
      <div className="recorder-controls">
        <button
          className={`record-button ${isRecording ? 'recording' : ''}`}
          onClick={toggleRecording}
          disabled={disabled || permissionDenied}
          aria-label={isRecording ? 'Stop recording' : 'Start recording'}
        >
          <span className="record-icon">{isRecording ? '⏹' : '🎤'}</span>
          <span className="record-text">{isRecording ? 'Stop Recording' : 'Start Recording'}</span>
        </button>
      </div>

      {isRecording && (
        <div className="recording-indicator">
          <span className="pulse"></span>
          <span>Recording...</span>
        </div>
      )}

      {permissionDenied && (
        <div className="permission-error">
          <div className="error-icon">⚠️</div>
          <div className="error-message">{permissionError}</div>
          <button className="retry-button" onClick={() => requestMicrophonePermission()}>
            Try Again
          </button>
        </div>
      )}

      {permissionError && !permissionDenied && (
        <div className="permission-warning">
          <div className="warning-icon">ℹ️</div>
          <div className="warning-message">{permissionError}</div>
        </div>
      )}
    </div>
  )
}

export default AudioRecorder
