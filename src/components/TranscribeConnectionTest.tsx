import { useState } from 'react'
import { testTranscribeConnection } from '../services/TranscribeTest'

interface TestStatus {
  state: 'idle' | 'testing' | 'success' | 'error'
  message: string
  details?: Record<string, any>
}

export function TranscribeConnectionTest() {
  const [testStatus, setTestStatus] = useState<TestStatus>({
    state: 'idle',
    message: 'Click to test Transcribe connection',
  })

  const handleTest = async () => {
    setTestStatus({ state: 'testing', message: '🧪 Testing connection...' })

    // Get credentials from env
    const credentials = {
      accessKeyId: (import.meta as any).env.VITE_AWS_ACCESS_KEY_ID || 'mock-key',
      secretAccessKey: (import.meta as any).env.VITE_AWS_SECRET_ACCESS_KEY || 'mock-secret',
      sessionToken: (import.meta as any).env.VITE_AWS_SESSION_TOKEN,
      region: (import.meta as any).env.VITE_AWS_REGION || 'us-east-1',
      languageCode: (import.meta as any).env.VITE_AWS_LANGUAGE || 'en-US',
    }

    const result = await testTranscribeConnection(credentials)

    if (result.success) {
      setTestStatus({
        state: 'success',
        message: result.message,
        details: result.details,
      })
    } else {
      setTestStatus({
        state: 'error',
        message: result.message,
        details: result.error ? { error: result.error, ...result.details } : result.details,
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
        {testStatus.state === 'testing' ? '🧪 Testing...' : '🧪 Test Transcribe Connection'}
      </button>

      {testStatus.state !== 'idle' && (
        <div style={getStatusStyle()}>
          <div style={{ fontWeight: 'bold', marginBottom: '0.5rem' }}>{testStatus.message}</div>
          {testStatus.details && (
            <div>
              {Object.entries(testStatus.details).map(([key, value]) => (
                <div key={key} style={{ marginTop: '0.25rem', opacity: 0.8 }}>
                  <span style={{ color: 'rgba(255,255,255,0.6)' }}>{key}:</span> {String(value)}
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
