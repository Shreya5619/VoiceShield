import { useEffect, useRef } from 'react'
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
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const hasPlayedRef = useRef(false)

  useEffect(() => {
    // Play warning alert sound when AI-generated speech is detected with HIGH confidence
    if (data.is_ai_generated && data.confidence_level === 'HIGH' && !hasPlayedRef.current) {
      hasPlayedRef.current = true
      playAlertSound()
    }
  }, [data])

  const playAlertSound = () => {
    // Create alert sound programmatically using Web Audio API
    try {
      const AudioContext = window.AudioContext || (window as any).webkitAudioContext
      if (!AudioContext) return
      
      const ctx = new AudioContext()
      const oscillator = ctx.createOscillator()
      const gainNode = ctx.createGain()

      oscillator.connect(gainNode)
      gainNode.connect(ctx.destination)

      // Create a harsh alarm-like sound
      oscillator.type = 'sawtooth'
      oscillator.frequency.setValueAtTime(880, ctx.currentTime) // A5
      oscillator.frequency.exponentialRampToValueAtTime(440, ctx.currentTime + 0.5)
      oscillator.frequency.setValueAtTime(880, ctx.currentTime + 1.0)
      oscillator.frequency.exponentialRampToValueAtTime(440, ctx.currentTime + 1.5)

      // Volume envelope
      gainNode.gain.setValueAtTime(0.8, ctx.currentTime)
      gainNode.gain.exponentialRampToValueAtTime(0.1, ctx.currentTime + 0.3)
      gainNode.gain.setValueAtTime(0.8, ctx.currentTime + 0.5)
      gainNode.gain.exponentialRampToValueAtTime(0.1, ctx.currentTime + 0.8)
      gainNode.gain.setValueAtTime(0.8, ctx.currentTime + 1.0)
      gainNode.gain.exponentialRampToValueAtTime(0.1, ctx.currentTime + 1.3)

      oscillator.start()
      oscillator.stop(ctx.currentTime + 1.5)

      // Speak warning
      speakWarning()
    } catch (err) {
      console.warn('Audio alert failed:', err)
    }
  }

  const speakWarning = () => {
    // Check if browser supports speech synthesis
    if ('speechSynthesis' in window) {
      // Cancel any pending speech
      window.speechSynthesis.cancel()

      const warningText = "CRITICAL WARNING: AI-generated speech detected. This call is likely automated or synthetic. DO NOT TRUST what you hear. HANG UP IMMEDIATELY."

      const utterance = new SpeechSynthesisUtterance(warningText)
      utterance.volume = 1.0
      utterance.rate = 0.9
      utterance.pitch = 1.2

      // Try to find a good voice for warnings
      const voices = window.speechSynthesis.getVoices()
      const warningVoice = voices.find(v => 
        v.name.includes('Google') || v.name.includes('Zira') || v.name.includes('David')
      ) || voices[0]
      
      if (warningVoice) {
        utterance.voice = warningVoice
      }

      window.speechSynthesis.speak(utterance)
    }
  }

  const getAlertLevelClass = () => {
    if (!data.is_ai_generated) return 'none'
    if (data.confidence_level === 'HIGH') return 'critical'
    if (data.confidence_level === 'MEDIUM') return 'warning'
    return 'info'
  }

  const getAlertTitle = () => {
    if (!data.is_ai_generated) return 'Audio Analysis Complete'
    if (data.confidence_level === 'HIGH') return 'CRITICAL: AI-GENERATED SPEECH DETECTED!'
    if (data.confidence_level === 'MEDIUM') return 'WARNING: LIKELY AI-GENERATED'
    return 'Audio Analysis Results'
  }

  const getAlertIcon = () => {
    if (data.confidence_level === 'HIGH') return 'CRITICAL'
    if (data.confidence_level === 'MEDIUM') return 'WARNING'
    return 'SUCCESS'
  }

  return (
    <div className={`ai-warning-overlay ${getAlertLevelClass()}`}>
      <div className="ai-warning-content">
        <div className="ai-warning-icon">
          {data.confidence_level === 'HIGH' ? '🚨' : data.confidence_level === 'MEDIUM' ? '⚠️' : '✅'}
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
