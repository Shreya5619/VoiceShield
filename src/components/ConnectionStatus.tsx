import { ConnectionState, ErrorResponse } from '../types'
import '../styles/ConnectionStatus.css'

interface ConnectionStatusProps {
  state: ConnectionState
  error?: ErrorResponse | null
  retryCountdown?: number
  onRetry?: () => void
}

export const ConnectionStatus: React.FC<ConnectionStatusProps> = ({
  state,
  error,
  retryCountdown,
  onRetry,
}) => {
  const getStatusLabel = (): string => {
    switch (state) {
      case ConnectionState.Idle:
        return 'Idle'
      case ConnectionState.Connecting:
        return 'Connecting...'
      case ConnectionState.Connected:
        return 'Connected'
      case ConnectionState.Reconnecting:
        return `Reconnecting... ${retryCountdown ? `(${retryCountdown}s)` : ''}`
      case ConnectionState.Disconnected:
        return 'Disconnected'
      case ConnectionState.Error:
        return 'Error'
      default:
        return 'Unknown'
    }
  }

  const getStatusIcon = (): string => {
    switch (state) {
      case ConnectionState.Idle:
        return '●'
      case ConnectionState.Connecting:
        return '◐'
      case ConnectionState.Connected:
        return '✓'
      case ConnectionState.Reconnecting:
        return '⟳'
      case ConnectionState.Disconnected:
        return '◯'
      case ConnectionState.Error:
        return '✕'
      default:
        return '?'
    }
  }

  const getStatusClass = (): string => {
    switch (state) {
      case ConnectionState.Connected:
        return 'connected'
      case ConnectionState.Connecting:
        return 'connecting'
      case ConnectionState.Reconnecting:
        return 'reconnecting'
      case ConnectionState.Error:
        return 'error'
      case ConnectionState.Disconnected:
        return 'disconnected'
      default:
        return 'idle'
    }
  }

  return (
    <div className={`connection-status ${getStatusClass()}`}>
      <div className="status-indicator">
        <span className={`status-icon ${state === ConnectionState.Connecting || state === ConnectionState.Reconnecting ? 'animate' : ''}`}>
          {getStatusIcon()}
        </span>
        <span className="status-label">{getStatusLabel()}</span>
      </div>

      {error && (
        <div className="error-section">
          <div className="error-header">
            <span className="error-icon">⚠️</span>
            <span className="error-code">{error.code}</span>
          </div>
          <p className="error-message">{error.message}</p>
          {error.recoverable && onRetry && (
            <button className="retry-button" onClick={onRetry}>
              Retry Connection
            </button>
          )}
          {!error.recoverable && (
            <p className="error-note">This error may be permanent. Please refresh the page or contact support.</p>
          )}
        </div>
      )}

      {state === ConnectionState.Reconnecting && retryCountdown !== undefined && (
        <div className="reconnect-info">
          <p>Attempting to reconnect in {retryCountdown} seconds...</p>
        </div>
      )}
    </div>
  )
}

export default ConnectionStatus
