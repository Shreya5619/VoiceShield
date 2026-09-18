import { useEffect, useRef, useMemo } from 'react'
import { TranscriptionSegment } from '../types'
import '../styles/TranscriptionDisplay.css'

interface TranscriptionDisplayProps {
  segments: TranscriptionSegment[]
  currentPartialResult: TranscriptionSegment | null
  isTranscribing: boolean
}

export const TranscriptionDisplay: React.FC<TranscriptionDisplayProps> = ({
  segments,
  currentPartialResult,
  isTranscribing,
}) => {
  const containerRef = useRef<HTMLDivElement>(null)
  const endRef = useRef<HTMLDivElement>(null)

  // Auto-scroll to bottom when new content arrives
  useEffect(() => {
    if (endRef.current) {
      endRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [segments.length, currentPartialResult])

  // Memoize the full transcript for performance
  const fullTranscript = useMemo(() => {
    return segments.map((seg) => seg.transcript).join(' ')
  }, [segments])

  const hasContent = segments.length > 0 || currentPartialResult !== null

  return (
    <div className="transcription-display">
      <div className="transcription-header">
        <h2>Transcription</h2>
        {isTranscribing && <span className="transcription-badge">Live</span>}
        {segments.length > 0 && (
          <span className="segment-count">{segments.length} segments</span>
        )}
      </div>

      <div className="transcription-container" ref={containerRef}>
        {!hasContent && !isTranscribing && (
          <div className="empty-state">
            <span className="empty-icon">🎙️</span>
            <p>Start recording to see transcription results</p>
          </div>
        )}

        {!hasContent && isTranscribing && (
          <div className="waiting-state">
            <div className="spinner"></div>
            <p>Listening...</p>
          </div>
        )}

        {hasContent && (
          <>
            {/* Final Results */}
            {segments.length > 0 && (
              <div className="segments-group">
                {segments.map((segment, index) => (
                  <div key={segment.id || `segment-${index}`} className="segment final">
                    <div className="segment-content">
                      <span className="segment-text">{segment.transcript}</span>
                      {segment.confidence > 0 && (
                        <span className="segment-confidence">
                          {Math.round(segment.confidence * 100)}%
                        </span>
                      )}
                    </div>
                    {segment.items.length > 0 && (
                      <div className="segment-items">
                        {segment.items.map((item: any, itemIndex: number) => (
                          <span key={`item-${itemIndex}`} className={`item ${item.type}`}>
                            {item.content}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Partial Result */}
            {currentPartialResult && (
              <div className="segment partial">
                <div className="segment-content">
                  <span className="segment-text">{currentPartialResult.transcript}</span>
                  <span className="partial-indicator">●</span>
                </div>
                {currentPartialResult.items.length > 0 && (
                  <div className="segment-items">
                    {currentPartialResult.items.map((item: any, itemIndex: number) => (
                      <span key={`partial-item-${itemIndex}`} className={`item ${item.type}`}>
                        {item.content}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Full Transcript Summary */}
            {segments.length > 0 && (
              <div className="transcript-summary">
                <strong>Full Transcript:</strong>
                <p>{fullTranscript}</p>
              </div>
            )}

            {/* Scroll Anchor */}
            <div ref={endRef} style={{ height: 0 }} />
          </>
        )}
      </div>

      {hasContent && (
        <div className="transcription-footer">
          <span className="result-count">
            {segments.length} result{segments.length !== 1 ? 's' : ''}
          </span>
          <span className="word-count">
            ~{fullTranscript.split(/\s+/).filter((w) => w.length > 0).length} words
          </span>
        </div>
      )}
    </div>
  )
}

export default TranscriptionDisplay
