import { useEffect, useState, useRef, useCallback } from 'react'
import { ScamAnalysisResult } from '../types'
import '../styles/ScamAnalysisPanel.css'
import { apiUrl } from '../config/api'

interface ScamAnalysisPanelProps {
  transcript: string
  isVisible?: boolean
}

const API_URL = apiUrl('/api/analyze-scam')
const DEBOUNCE_MS = 800
const TIMEOUT_MS = 30000

export const ScamAnalysisPanel: React.FC<ScamAnalysisPanelProps> = ({
  transcript,
  isVisible = true,
}) => {
  const [result, setResult] = useState<ScamAnalysisResult | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const abortControllerRef = useRef<AbortController | null>(null)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const cancelPending = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (timeoutRef.current) clearTimeout(timeoutRef.current)
    if (abortControllerRef.current) abortControllerRef.current.abort()
  }, [])

  const analyzeTranscript = useCallback(async (text: string) => {
    cancelPending()

    const controller = new AbortController()
    abortControllerRef.current = controller
    setIsLoading(true)
    setError(null)

    // 30-second timeout
    timeoutRef.current = setTimeout(() => {
      controller.abort()
      setIsLoading(false)
      setError('Analysis timed out after 30 seconds')
    }, TIMEOUT_MS)

    try {
      const response = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transcript: text }),
        signal: controller.signal,
      })

      if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`)

      const data: ScamAnalysisResult = await response.json()
      clearTimeout(timeoutRef.current!)

      if (!data.is_scam) {
        // Not a scam — clear analysis, let ScamPredictionPanel handle display
        setResult(null)
        setError(null)
      } else {
        setResult(data)
        if (data.analysis_error) {
          setError(data.analysis_error)
        }
      }
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') return // cancelled by timeout or new request
      const msg = err instanceof Error ? err.message : 'Unknown error'
      setError(msg)
    } finally {
      clearTimeout(timeoutRef.current!)
      setIsLoading(false)
    }
  }, [cancelPending])

  useEffect(() => {
    if (!transcript?.trim()) {
      cancelPending()
      setResult(null)
      setError(null)
      setIsLoading(false)
      return
    }

    // Debounce
    debounceRef.current = setTimeout(() => {
      analyzeTranscript(transcript)
    }, DEBOUNCE_MS)

    return () => cancelPending()
  }, [transcript, analyzeTranscript, cancelPending])

  if (!isVisible) return null

  // Only render when there's something to show
  if (!isLoading && !result && !error) return null

  const getRiskColor = (level?: string) => {
    switch (level) {
      case 'CRITICAL': return '#ff4444'
      case 'HIGH': return '#ff9800'
      case 'MEDIUM': return '#ffc107'
      default: return '#4caf50'
    }
  }

  return (
    <div className="scam-analysis-panel">
      <div className="panel-header">
        <h3>🤖 AI Scam Analysis</h3>
        {isLoading && <span className="loading-spinner">Analyzing with AI...</span>}
      </div>

      {/* Loading state */}
      {isLoading && !result && (
        <div className="analysis-loading" data-testid="loading-indicator">
          <p>Sending to Amazon Bedrock for deep analysis...</p>
        </div>
      )}

      {/* AgentCore error (graceful degradation) */}
      {error && (
        <div className="analysis-error" data-testid="analysis-error">
          <span>⚠️</span>
          <span>{error}</span>
        </div>
      )}

      {/* Analysis results */}
      {result?.is_scam && result.summary && (
        <div className="analysis-content">
          {/* Risk level badge */}
          {result.risk_level && (
            <div
              className="risk-level-badge"
              style={{ borderColor: getRiskColor(result.risk_level), color: getRiskColor(result.risk_level) }}
            >
              🚨 Risk Level: <strong>{result.risk_level}</strong>
            </div>
          )}

          {/* Summary */}
          <div className="analysis-summary">
            <h4>Why this call was flagged</h4>
            <p data-testid="summary-text">
              {result.summary.slice(0, 500)}
              {result.summary.length > 500 ? '…' : ''}
            </p>
          </div>

          {/* Verification questions */}
          {result.verification_questions && result.verification_questions.length > 0 && (
            <div className="verification-questions">
              <h4>🔎 Ask the caller these questions</h4>
              <ol data-testid="questions-list">
                {result.verification_questions.slice(0, 10).map((q, i) => (
                  <li key={i}>{q}</li>
                ))}
              </ol>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default ScamAnalysisPanel
