import { useState, useEffect } from 'react'
import '../styles/ErrorAlert.css'

interface ErrorAlertProps {
  type: 'error' | 'warning' | 'info' | 'success'
  title: string
  message: string
  details?: string
  dismissible?: boolean
  autoClose?: number // milliseconds, 0 = no auto-close
  onDismiss?: () => void
  actions?: Array<{
    label: string
    onClick: () => void
    variant?: 'primary' | 'secondary'
  }>
}

export const ErrorAlert: React.FC<ErrorAlertProps> = ({
  type = 'error',
  title,
  message,
  details,
  dismissible = true,
  autoClose = 0,
  onDismiss,
  actions,
}) => {
  const [isVisible, setIsVisible] = useState(true)

  useEffect(() => {
    if (autoClose > 0 && isVisible) {
      const timer = setTimeout(() => {
        handleDismiss()
      }, autoClose)
      return () => clearTimeout(timer)
    }
  }, [isVisible, autoClose])

  const handleDismiss = () => {
    setIsVisible(false)
    onDismiss?.()
  }

  if (!isVisible) {
    return null
  }

  const getIcon = (): string => {
    switch (type) {
      case 'error':
        return '✕'
      case 'warning':
        return '⚠'
      case 'info':
        return 'ℹ'
      case 'success':
        return '✓'
      default:
        return '●'
    }
  }

  return (
    <div className={`error-alert alert-${type}`}>
      <div className="alert-header">
        <span className="alert-icon">{getIcon()}</span>
        <h3 className="alert-title">{title}</h3>
        {dismissible && (
          <button className="alert-close" onClick={handleDismiss} aria-label="Dismiss alert">
            ✕
          </button>
        )}
      </div>

      <div className="alert-body">
        <p className="alert-message">{message}</p>
        {details && <p className="alert-details">{details}</p>}
      </div>

      {actions && actions.length > 0 && (
        <div className="alert-actions">
          {actions.map((action, index) => (
            <button
              key={index}
              className={`alert-action-button ${action.variant || 'secondary'}`}
              onClick={() => {
                action.onClick()
                if (dismissible) {
                  handleDismiss()
                }
              }}
            >
              {action.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export default ErrorAlert
