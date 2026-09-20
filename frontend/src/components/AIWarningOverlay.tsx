import { useEffect, useRef } from 'react'
import { ShieldAlert, AlertTriangle, CheckCircle } from 'lucide-react'
import '../styles/AIWarningOverlay.css'

export interface AIWarningData {
  is_ai_generated: boolean
  ai_probability: number
  human_probability: number
  confidence_level: 'HIGH' | 'MEDIUM' | 'LOW' | 'NONE'
  warnings?: string[]
}

interface AIWarningOverlayProps {
  data: AIWarningData
  onAcknowledge: () => void
}

export const AIWarningOverlay: React.FC<AIWarningOverlayProps> = ({
  data,
  onAcknowledge,
}) => {
  const hasAlertedRef = useRef(false)

  useEffect(() => {
    // Deepfake detection is a silent, non-disruptive alert: vibrate the device
    // (if supported) and show this overlay. We intentionally do NOT play any
    // sound or speak aloud, and the call is never stopped or muted here.
    if (data.is_ai_generated && data.confidence_level === 'HIGH' && !hasAlertedRef.current) {
      hasAlertedRef.current = true
      vibrateAlert()
    }
  }, [data])

  const vibrateAlert = () => {
    // Vibration API — silently buzz the device in an urgent pattern.
    // Not supported on all browsers/desktops; degrade gracefully if absent.
    try {
      if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
        // Pattern: buzz, pause, buzz, pause, buzz (milliseconds)
        navigator.vibrate([300, 150, 300, 150, 300])
      }
    } catch (err) {
      console.warn('Vibration not available:', err)
    }
  }

  const getAlertLevelClass = () => {
    if (!data.is_ai_generated) return 'none'
    if (data.confidence_level === 'HIGH') return 'critical'
    if (data.confidence_level === 'MEDIUM') return 'warning'
    return 'info'
  }

  return (
    <div className={`ai-warning-overlay ${getAlertLevelClass()}`}>
      <div className="ai-warning-content">
        <div className="ai-warning-icon">
          {data.confidence_level === 'HIGH' ? <ShieldAlert size={48} /> : data.confidence_level === 'MEDIUM' ? <AlertTriangle size={48} /> : <CheckCircle size={48} />}
        </div>

        <h2 className="ai-warning-title">
          {data.confidence_level === 'HIGH' ? 'CRITICAL: AI-GENERATED SPEECH DETECTED!' : 
           data.confidence_level === 'MEDIUM' ? 'WARNING: LIKELY AI-GENERATED' : 'Audio Analysis Results'}
        </h2>

        {data.is_ai_generated && (
          <div className="ai-warning-details">
            <div className="ai-warning-card">
              <h3>Detection Results</h3>
              
              <div className="ai-warning-stat">
                <span className="stat-label">AI-Generated Probability</span>
                <span 
                  className="stat-value" 
                  style={{ 
                    color: data.ai_probability >= 0.7 ? '#ff4444' : '#ff9800',
                    fontWeight: 'bold',
                    fontSize: '1.5em'
                  }}
                >
                  {(data.ai_probability * 100).toFixed(1)}%
                </span>
              </div>

              <div className="ai-warning-stat">
                <span className="stat-label">Human Probability</span>
                <span 
                  className="stat-value" 
                  style={{ 
                    color: data.human_probability >= 0.7 ? '#4caf50' : '#9e9e9e',
                  }}
                >
                  {(data.human_probability * 100).toFixed(1)}%
                </span>
              </div>

              <div className="ai-warning-stat">
                <span className="stat-label">Confidence</span>
                <span className="stat-value">
                  <span 
                    className="confidence-badge"
                    style={{
                      backgroundColor: data.confidence_level === 'HIGH' ? '#ff4444' : 
                                     data.confidence_level === 'MEDIUM' ? '#ff9800' : '#2196f3',
                      color: 'white',
                      padding: '4px 12px',
                      borderRadius: '12px',
                      marginLeft: '8px'
                    }}
                  >
                    {data.confidence_level}
                  </span>
                </span>
              </div>
            </div>

            <div className="ai-warning-advice">
              <h3>Recommended Actions</h3>
              <ul>
                <li><strong>DO NOT TRUST</strong> what you hear - this may be automated speech</li>
                <li><strong>HANG UP IMMEDIATELY</strong> if you suspect fraud</li>
                <li>Do NOT provide any personal or financial information</li>
                <li>Do NOT click on any links or download files</li>
                <li>Verify the caller's identity through independent channels</li>
              </ul>
            </div>

            {data.warnings && data.warnings.length > 0 && (
              <div className="ai-warning-warnings">
                <h3>Additional Alerts</h3>
                <ul>
                  {data.warnings.map((warning, idx) => (
                    <li key={idx}>{warning}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        <div className="ai-warning-actions">
          <button 
            className="ai-warning-ack-btn"
            onClick={onAcknowledge}
            aria-label="Acknowledge warning and continue monitoring"
          >
            Acknowledge & Continue
          </button>
        </div>
      </div>
    </div>
  )
}

export default AIWarningOverlay
