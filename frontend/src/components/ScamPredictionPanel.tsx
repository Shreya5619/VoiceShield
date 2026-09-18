import { useEffect, useState } from 'react'
import '../styles/ScamPredictionPanel.css'
import { apiUrl } from '../config/api'

export interface ScamPredictionResult {
  is_scam: boolean
  scam_probability: number
  safe_probability: number
  confidence_level: 'HIGH' | 'MEDIUM' | 'LOW'
  triggers_detected: string[]
}

interface ScamPredictionPanelProps {
  transcript?: string
  isVisible?: boolean
  onPredictionUpdate?: (result: ScamPredictionResult | null) => void
}

export const ScamPredictionPanel: React.FC<ScamPredictionPanelProps> = ({
  transcript = '',
  isVisible = true,
  onPredictionUpdate,
}) => {
  const [prediction, setPrediction] = useState<ScamPredictionResult | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!transcript || !transcript.trim()) {
      setPrediction(null)
      setError(null)
      return
    }

    // Debounce the prediction request
    const timer = setTimeout(() => {
      predictScam(transcript)
    }, 500)

    return () => clearTimeout(timer)
  }, [transcript])

  const predictScam = async (text: string) => {
    setIsLoading(true)
    setError(null)

    try {
      // Try the Node.js server first (which now proxies to Python backend)
      const response = await fetch(apiUrl('/api/predict-scam'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ transcript: text }),
      })

      if (!response.ok) {
        throw new Error(`API error: ${response.statusText}`)
      }

      const result = await response.json()
      setPrediction(result)
      onPredictionUpdate?.(result)
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Unknown error'
      setError(errorMsg)
      console.error('Scam prediction error:', errorMsg)
      setPrediction(null)
    } finally {
      setIsLoading(false)
    }
  }

  if (!isVisible) return null

  const getRiskColor = (probability: number) => {
    if (probability >= 0.8) return '#ff4444'
    if (probability >= 0.6) return '#ff9800'
    if (probability >= 0.4) return '#ffc107'
    return '#4caf50'
  }

  const getRiskLabel = (probability: number) => {
    if (probability >= 0.8) return 'CRITICAL'
    if (probability >= 0.6) return 'HIGH RISK'
    if (probability >= 0.4) return 'MEDIUM RISK'
    return 'SAFE'
  }

  return (
    <div className="scam-prediction-panel">
      <div className="panel-header">
        <h3>🛡️ Scam Detection</h3>
        {isLoading && <span className="loading-spinner">Analyzing...</span>}
      </div>

      {error && (
        <div className="error-message">
          <span className="error-icon">⚠️</span>
          <span>{error}</span>
        </div>
      )}

      {prediction && (
        <div className="prediction-content">
          {/* Risk Score */}
          <div className="risk-section">
            <div className="risk-gauge">
              <div
                className="risk-indicator"
                style={{
                  backgroundColor: getRiskColor(prediction.scam_probability),
                  width: `${prediction.scam_probability * 100}%`,
                }}
              />
            </div>

            <div className="risk-stats">
              <div className="stat-item">
                <span className="stat-label">Scam Probability</span>
                <span className="stat-value" style={{ color: getRiskColor(prediction.scam_probability) }}>
                  {(prediction.scam_probability * 100).toFixed(1)}%
                </span>
              </div>
              <div className="stat-item">
                <span className="stat-label">Safe Probability</span>
                <span className="stat-value" style={{ color: '#4caf50' }}>
                  {(prediction.safe_probability * 100).toFixed(1)}%
                </span>
              </div>
            </div>
          </div>

          {/* Classification Result */}
          <div className="classification-result">
            <div
              className={`classification-badge ${prediction.is_scam ? 'scam' : 'safe'}`}
              style={{
                backgroundColor: prediction.is_scam ? 'rgba(255, 68, 68, 0.1)' : 'rgba(76, 175, 80, 0.1)',
                borderColor: prediction.is_scam ? '#ff4444' : '#4caf50',
              }}
            >
              <span className="badge-icon">{prediction.is_scam ? '🚨' : '✅'}</span>
              <div className="badge-text">
                <span className="badge-label">Verdict</span>
                <span className="badge-value" style={{ color: prediction.is_scam ? '#ff4444' : '#4caf50' }}>
                  {prediction.is_scam ? 'LIKELY SCAM' : 'APPEARS SAFE'}
                </span>
              </div>
            </div>

            <div className="confidence-badge">
              <span className="confidence-label">Confidence</span>
              <span
                className="confidence-value"
                style={{
                  backgroundColor:
                    prediction.confidence_level === 'HIGH' ? '#ff9800' : '#2196f3',
                  color: 'white',
                }}
              >
                {prediction.confidence_level}
              </span>
            </div>
          </div>

          {/* Triggers Detected */}
          {prediction.triggers_detected.length > 0 && (
            <div className="triggers-section">
              <h4>🔍 Scam Indicators Detected</h4>
              <div className="triggers-list">
                {prediction.triggers_detected.map((trigger, idx) => (
                  <div key={idx} className="trigger-tag">
                    {trigger}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Risk Level Summary */}
          <div className="risk-level-summary">
            <span className="risk-label">Risk Level:</span>
            <span
              className="risk-value"
              style={{
                color: getRiskColor(prediction.scam_probability),
                fontWeight: 'bold',
              }}
            >
              {getRiskLabel(prediction.scam_probability)}
            </span>
          </div>
        </div>
      )}

      {!prediction && !isLoading && !error && (
        <div className="empty-state">
          <p>Awaiting transcript to analyze...</p>
        </div>
      )}
    </div>
  )
}

export default ScamPredictionPanel
