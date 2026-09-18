import { useState, useCallback, useMemo } from 'react'
import { ConnectionState, TranscriptionSegment } from '../types'
import AudioRecorder from './AudioRecorder'
import TranscriptionDisplay from './TranscriptionDisplay'
import ConnectionStatus from './ConnectionStatus'
import ErrorAlert from './ErrorAlert'
import TranscribeConnectionTest from './TranscribeConnectionTest'
import ScamPredictionPanel from './ScamPredictionPanel'
import ScamAnalysisPanel from './ScamAnalysisPanel'
import '../styles/TranscriptionPage.css'

interface TranscriptionPageProps {
  connectionState?: ConnectionState
  connectionError?: Error | null
  onConnectionRetry?: () => void
  isTranscribing?: boolean
  segments?: TranscriptionSegment[]
  currentPartialResult?: TranscriptionSegment | null
  onStartRecording?: () => Promise<void>
  onStopRecording?: () => void
  isRecording?: boolean
}

export const TranscriptionPage: React.FC<TranscriptionPageProps> = ({
  connectionState = ConnectionState.Idle,
  connectionError = null,
  onConnectionRetry,
  isTranscribing = false,
  segments = [],
  currentPartialResult = null,
  onStartRecording,
  onStopRecording,
  isRecording = false,
}) => {
  const [dismissedErrors, setDismissedErrors] = useState<Set<string>>(new Set())

  const handleErrorDismiss = useCallback((errorId: string) => {
    setDismissedErrors((prev) => new Set(prev).add(errorId))
  }, [])

  const isConnected = connectionState === ConnectionState.Connected
  const isConnecting = connectionState === ConnectionState.Connecting

  const handleRecordingToggle = useCallback(async () => {
    if (isRecording) {
      onStopRecording?.()
    } else {
      await onStartRecording?.()
    }
  }, [isRecording, onStartRecording, onStopRecording])

  // Get combined transcript from all final segments
  const fullTranscript = useMemo(() => {
    return segments
      .map((seg) => seg.transcript)
      .filter(Boolean)
      .join(' ')
      .trim()
  }, [segments])

  return (
    <div className="transcription-page">
      {/* Header */}
      <header className="page-header">
        <div className="header-content">
          <h1 className="app-title">
            <span className="title-icon">🎙️</span>
            VoiceShield
          </h1>
          <p className="app-subtitle">Real-Time Voice Transcription with Amazon Transcribe</p>
        </div>
      </header>

      {/* Main Content */}
      <main className="page-main">
        <div className="page-container">
          {/* Connection Status - Top Right */}
          <aside className="status-panel">
            <ConnectionStatus
              state={connectionState}
              error={
                connectionError
                  ? {
                      code: 'CONNECTION_ERROR',
                      message: connectionError.message,
                      severity: 'high' as any,
                      recoverable: true,
                      timestamp: Date.now(),
                    }
                  : null
              }
              onRetry={onConnectionRetry}
            />
          </aside>

          {/* Error Alerts */}
          {connectionError && !dismissedErrors.has('connection') && (
            <div className="error-container">
              <ErrorAlert
                type="error"
                title="Connection Error"
                message={connectionError.message}
                dismissible
                onDismiss={() => handleErrorDismiss('connection')}
              />
            </div>
          )}

          {/* Recording Section */}
          <section className="recording-section">
            <div className="section-header">
              <h2>Recording</h2>
              {isRecording && <span className="recording-badge">● Recording</span>}
            </div>
            <div
              style={{
                padding: '2rem',
                textAlign: 'center',
                background: 'rgba(100, 108, 255, 0.1)',
                border: '1px solid rgba(100, 108, 255, 0.2)',
                borderRadius: '12px',
              }}
            >
              <button
                onClick={handleRecordingToggle}
                style={{
                  padding: '1rem 2rem',
                  fontSize: '1rem',
                  fontWeight: 'bold',
                  border: 'none',
                  borderRadius: '8px',
                  background: isRecording ? '#ff6b6b' : '#646cff',
                  color: 'white',
                  cursor: 'pointer',
                }}
              >
                {isRecording ? '⏹ Stop Recording' : '🎤 Start Recording'}
              </button>
              {isConnecting && <p style={{ marginTop: '1rem' }}>Connecting to Transcribe...</p>}
              {isConnected && !isRecording && <p style={{ marginTop: '1rem' }}>Ready to record</p>}
              
              {/* Add test button */}
              <TranscribeConnectionTest />
            </div>
          </section>

          {/* Scam Prediction Panel */}
          {fullTranscript && (
            <section className="scam-detection-section">
              <ScamPredictionPanel
                transcript={fullTranscript}
                isVisible={true}
              />
            </section>
          )}

          {/* AI Analysis Panel — shows LLM summary + verification questions when scam detected */}
          <section className="scam-detection-section">
            <ScamAnalysisPanel
              transcript={fullTranscript}
              isVisible={true}
            />
          </section>

          {/* Transcription Display Section */}
          <section className="transcription-section">
            <div className="section-header">
              <h2>Live Transcription</h2>
              {isTranscribing && <span className="live-badge">● Live</span>}
            </div>
            <TranscriptionDisplay
              segments={segments}
              currentPartialResult={currentPartialResult}
              isTranscribing={isTranscribing}
            />
          </section>
        </div>
      </main>

      {/* Footer */}
      <footer className="page-footer">
        <div className="footer-content">
          <p>
            VoiceShield &copy; {new Date().getFullYear()} - Real-Time Transcription with Amazon
            Transcribe
          </p>
          <p className="footer-status">
            {isConnected ? '✓ Connected' : isConnecting ? '⟳ Connecting' : '◯ Disconnected'}
          </p>
        </div>
      </footer>
    </div>
  )
}

export default TranscriptionPage
