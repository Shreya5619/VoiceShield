import React, { useCallback, useState } from 'react'
import type {
  RiskAssessment,
  SecurityQuestionOutcome,
  SeverityLevel,
  Signal,
} from '../services/riskEngine'
import './CombinedRiskPanel.css'

/**
 * CombinedRiskPanel (NEW) — rendered when EscalationStage === 'protect'.
 *
 * Shows the four fused signals side by side with severity chips, the
 * RiskAssessment summary banner, and exactly four user-control actions
 * (Continue Call, Mute, End Call, Report).
 *
 * Wording safety: this panel only ever surfaces the "possible impersonation"
 * framing produced by the RiskEngine — it never asserts confirmed fraud.
 *
 * Requirements: 13.1–13.12
 */
export interface CombinedRiskPanelProps {
  assessment: RiskAssessment
  isMuted: boolean
  onContinue: () => void
  onToggleMute: () => void
  onEndCall: () => void
  /** Rejects → show error and retain the panel so the user can retry. */
  onReport: () => Promise<void>
}

/** Fixed, exact row labels mandated by Requirement 13.2. */
const VOICE_MATCH_LABEL = 'VOICE MATCH'
const AI_VOICE_LABEL = 'AI VOICE'
const SCAM_RISK_LABEL = 'SCAM RISK'
const SECURITY_QUESTION_LABEL = 'SECURITY QUESTION'

/** Icon + text for each severity chip (Requirement 13.3). */
const SEVERITY_CHIP: Record<SeverityLevel, { icon: string; text: string; className: string }> = {
  low: { icon: '⚠️', text: 'Low', className: 'crp-chip--low' },
  suspicious: { icon: '⚠️', text: 'Suspicious', className: 'crp-chip--suspicious' },
  high: { icon: '🔴', text: 'High', className: 'crp-chip--high' },
  failed: { icon: '🔴', text: 'Failed', className: 'crp-chip--failed' },
}

/** Map a SecurityQuestionOutcome to a display value + severity chip. */
function securityQuestionDisplay(
  outcome: SecurityQuestionOutcome,
): { value: string; severity: SeverityLevel | null } {
  switch (outcome) {
    case 'correct':
      return { value: 'Answered correctly', severity: 'low' }
    case 'incorrect':
      return { value: 'Answered incorrectly', severity: 'failed' }
    case 'bypassed':
      return { value: 'Trusted / bypassed', severity: 'low' }
    case 'unanswered':
    default:
      return { value: 'Not answered', severity: null }
  }
}

/** A single severity chip, or the "unavailable" indicator. */
const SeverityChip: React.FC<{ severity: SeverityLevel | 'unavailable' | null }> = ({
  severity,
}) => {
  if (severity === null || severity === 'unavailable') {
    return (
      <span className="crp-chip crp-chip--unavailable" data-testid="crp-chip">
        unavailable
      </span>
    )
  }
  const chip = SEVERITY_CHIP[severity]
  return (
    <span className={`crp-chip ${chip.className}`} data-testid="crp-chip">
      <span aria-hidden="true">{chip.icon}</span> {chip.text}
    </span>
  )
}

/** A signal-backed row (Voice Match / AI Voice / Scam Risk). */
const SignalRow: React.FC<{ label: string; signal: Signal }> = ({ label, signal }) => {
  const available = signal.available && signal.value !== null
  return (
    <div className="crp-row" data-testid="crp-row" data-label={label}>
      <span className="crp-row-label">{label}</span>
      <span className="crp-row-value">
        {available ? (
          `${Math.round(signal.value as number)}%`
        ) : (
          <span className="crp-unavailable" data-testid="crp-unavailable">
            unavailable
          </span>
        )}
      </span>
      <SeverityChip severity={available ? signal.severity : 'unavailable'} />
    </div>
  )
}

export const CombinedRiskPanel: React.FC<CombinedRiskPanelProps> = ({
  assessment,
  isMuted,
  onContinue,
  onToggleMute,
  onEndCall,
  onReport,
}) => {
  const [reportState, setReportState] = useState<'idle' | 'reporting' | 'done' | 'error'>('idle')
  const [reportError, setReportError] = useState<string | null>(null)

  const sq = securityQuestionDisplay(assessment.securityQuestion)

  const handleReport = useCallback(async () => {
    setReportState('reporting')
    setReportError(null)
    try {
      await onReport()
      setReportState('done')
    } catch (err) {
      // Requirement 13.11 — show an error and keep the panel mounted for retry.
      setReportState('error')
      setReportError(
        err instanceof Error && err.message
          ? err.message
          : 'Could not submit the report. Please try again.',
      )
    }
  }, [onReport])

  return (
    <div
      className={`crp-overlay crp-overlay--${assessment.overall}`}
      role="dialog"
      aria-modal="true"
      aria-label="Combined risk assessment"
    >
      <div className="crp-card">
        <h2 className="crp-title">Risk assessment</h2>

        {/* ── Signal rows (Requirement 13.2, 13.3, 13.12) ── */}
        <div className="crp-rows">
          <SignalRow label={VOICE_MATCH_LABEL} signal={assessment.voiceMatch} />
          <SignalRow label={AI_VOICE_LABEL} signal={assessment.aiVoice} />
          <SignalRow label={SCAM_RISK_LABEL} signal={assessment.conversationContext} />

          {/* Security question is an outcome, not a numeric signal. */}
          <div className="crp-row" data-testid="crp-row" data-label={SECURITY_QUESTION_LABEL}>
            <span className="crp-row-label">{SECURITY_QUESTION_LABEL}</span>
            <span className="crp-row-value">{sq.value}</span>
            <SeverityChip severity={sq.severity} />
          </div>
        </div>

        {/* ── Summary banner (Requirement 13.4) ── */}
        <p className="crp-banner" data-testid="crp-banner" role="status">
          {assessment.banner}
        </p>

        {/* ── Report feedback (Requirements 13.10, 13.11) ── */}
        {reportState === 'done' && (
          <p className="crp-report-confirm" role="status" data-testid="crp-report-confirm">
            ✅ Report submitted. Thank you for helping keep the community safe.
          </p>
        )}
        {reportState === 'error' && (
          <p className="crp-report-error" role="alert" data-testid="crp-report-error">
            ⚠️ {reportError}
          </p>
        )}

        {/* ── Exactly four actions (Requirement 13.5) ── */}
        <div className="crp-actions">
          <button
            type="button"
            className="crp-btn crp-btn--continue"
            onClick={onContinue}
          >
            Continue Call
          </button>

          <button
            type="button"
            className={`crp-btn crp-btn--mute ${isMuted ? 'crp-btn--muted' : ''}`}
            onClick={onToggleMute}
            aria-pressed={isMuted}
          >
            {isMuted ? (
              <>
                <span aria-hidden="true">🔇</span> Muted
              </>
            ) : (
              'Mute'
            )}
          </button>

          <button
            type="button"
            className="crp-btn crp-btn--end"
            onClick={onEndCall}
          >
            End Call
          </button>

          <button
            type="button"
            className="crp-btn crp-btn--report"
            onClick={handleReport}
            disabled={reportState === 'reporting'}
          >
            {reportState === 'reporting' ? 'Reporting…' : 'Report'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default CombinedRiskPanel
