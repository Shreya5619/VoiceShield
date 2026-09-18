import { useState } from 'react'
import { apiUrl } from '../config/api'

interface TestStatus {
  state: 'idle' | 'testing' | 'success' | 'error'
  message: string
  details?: Record<string, any>
}

export function TranscribeConnectionTest() {
  const [testStatus, setTestStatus] = useState<TestStatus>({
    state: 'idle',
    message: 'Click to test backend connection',
  })

  const handleTest = async () => {
    setTestStatus({ state: 'testing', message: '🧪 Testing backend connection...' })

    try {
      // Test backend health endpoint
      const response = await fetch(apiUrl('/health'))
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
      }

      const data = await response.json()

      setTestStatus({
        state: 'success',
        message: '✓ Backend connection successful!',
        details: {
          status: data.status,
          transcribeProxy: data.message,
          pythonBackendReady: data.pythonBackendReady ? 'Yes' : 'No',
          url: 'ws://localhost:5000',
        },
      })
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error)
      setTestStatus({
        state: 'error',
        message: '❌ Backend connection failed',
        details: {
          error: errorMsg,
          checkpoints: [
            '1. Is backend running? (node server.mjs)',
            '2. Check port 5000 is available',
            '3. Check if Python backend started',
          ],
        },
      })
    }
  }

  const getStatusStyle = (): React.CSSProperties => {
    const baseStyle: React.CSSProperties = {
      padding: '1rem',
      borderRadius: '8px',
      marginTop: '1rem',
      fontFamily: 'monospace',
      fontSize: '0.85rem',
    }

    switch (testStatus.state) {
      case 'success':
        return {
          ...baseStyle,
          background: 'rgba(76, 175, 80, 0.1)',
          border: '1px solid rgba(76, 175, 80, 0.3)',
          color: '#4caf50',
        }
      case 'error':
        return {
          ...baseStyle,
          background: 'rgba(255, 107, 107, 0.1)',
          border: '1px solid rgba(255, 107, 107, 0.3)',
          color: '#ff6b6b',
        }
      case 'testing':
        return {
          ...baseStyle,
          background: 'rgba(255, 193, 7, 0.1)',
          border: '1px solid rgba(255, 193, 7, 0.3)',
          color: '#ffc107',
        }
      default:
        return {
          ...baseStyle,
          background: 'rgba(100, 108, 255, 0.1)',
          border: '1px solid rgba(100, 108, 255, 0.3)',
          color: '#646cff',
        }
    }
  }

  return (
    <div style={{ marginTop: '2rem' }}>
      <button
        onClick={handleTest}
        disabled={testStatus.state === 'testing'}
        style={{
          padding: '0.75rem 1.5rem',
          fontSize: '0.9rem',
          fontWeight: 'bold',
          border: 'none',
          borderRadius: '8px',
          background: testStatus.state === 'testing' ? '#999' : '#646cff',
          color: 'white',
          cursor: testStatus.state === 'testing' ? 'not-allowed' : 'pointer',
          opacity: testStatus.state === 'testing' ? 0.7 : 1,
        }}
      >
        {testStatus.state === 'testing' ? '🧪 Testing...' : '🧪 Test Backend Connection'}
      </button>

      {testStatus.state !== 'idle' && (
        <div style={getStatusStyle()}>
          <div style={{ fontWeight: 'bold', marginBottom: '0.5rem' }}>{testStatus.message}</div>
          {testStatus.details && (
            <div>
              {Object.entries(testStatus.details).map(([key, value]) => (
                <div key={key} style={{ marginTop: '0.25rem', opacity: 0.8 }}>
                  {Array.isArray(value) ? (
                    <div>
                      <span style={{ color: 'rgba(255,255,255,0.6)' }}>{key}:</span>
                      <ul style={{ margin: '0.25rem 0 0 1.5rem', padding: 0 }}>
                        {value.map((item, i) => (
                          <li key={i}>{item}</li>
                        ))}
                      </ul>
                    </div>
                  ) : (
                    <>
                      <span style={{ color: 'rgba(255,255,255,0.6)' }}>{key}:</span> {String(value)}
                    </>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default TranscribeConnectionTest
