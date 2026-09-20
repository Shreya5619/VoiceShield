import React, { useState } from 'react'
import {
  useCallSecurity,
  type ScreenView,
  type EscalationStage,
} from '../context/CallSecurityContext'
import '../styles/ScreenViewToggle.css'

/**
 * ScreenViewToggle — the two-way `protected` ⇆ `caller` demo toggle.
 *
 * Renders a toggle control plus the currently-active view's content. Switching
 * views only flips the shared context's `screenView` (via `setScreenView`); it
 * never reloads the page (Requirement 14.1). Because both views read/write the
 * SAME shared `CallSecurityContext`, an action on one view is reflected on the
 * other with no reset and no reload (Requirements 14.2, 14.7).
 *
 * The protected view content is supplied by the parent (ActiveCallScreen passes
 * its existing UI as `protectedView`), while the caller view is rendered by this
 * component (see {@link CallerSimulationView}). A compact EscalationStage
 * indicator is rendered in the toggle chrome so the protected view reflects each
 * stage transition as it occurs (Requirement 14.8).
 *
 * MUST be rendered inside a `<CallSecurityProvider>` (task 8.1).
 */
export interface ScreenViewToggleProps {
  /**
   * The protected-device view content. ActiveCallScreen passes its existing
   * call UI here; this component renders it when `screenView === 'protected'`.
   */
  protectedView: React.ReactNode
  /**
   * The exact security question the caller is challenged to answer. Defaults to
   * the scripted demo challenge "What was the name of your first school?"
   * (Requirement 14.3).
   */
  securityQuestion?: string
  /**
   * The answer treated as correct when the caller submits. When the submitted
   * answer differs (case-insensitively, trimmed), the outcome becomes
   * `incorrect` (Requirement 14.6).
   *
   * When OMITTED (the real-call case — FamilyContact stores a security question
   * but no expected answer), the primary "Submit answer" treats any non-empty
   * answer as `correct`; the dedicated "Submit wrong answer" affordance is the
   * way to drive `incorrect` for the demo (BUG 1 fix).
   */
  expectedAnswer?: string
}

/** The scripted identity challenge posed on the caller view (Requirement 14.3). */
export const DEFAULT_SECURITY_QUESTION =
  'What was the name of your first school?'

/** The scripted caller lines shown on the caller view (Requirement 14.3). */
export const SCRIPTED_CALLER_LINES: readonly string[] = [
  'Hey, I\u2019m your brother. I need money urgently.',
  'Please, can you send it right now? I\u2019ll explain later.',
]

/** Human-readable labels for each escalation stage (Requirement 14.8). */
const STAGE_LABELS: Record<EscalationStage, string> = {
  detect: 'Detect',
  suspect: 'Suspect',
  identify: 'Identify',
  challenge: 'Challenge',
  verify: 'Verify',
  protect: 'Protect',
}

/** Fixed order of the escalation narrative, for the stage indicator. */
const STAGE_ORDER: readonly EscalationStage[] = [
  'detect',
  'suspect',
  'identify',
  'challenge',
  'verify',
  'protect',
]

/**
 * A small, always-visible EscalationStage indicator. Reads `escalationStage`
 * from the shared context so the protected view reflects each transition as it
 * occurs (Requirement 14.8).
 */
const EscalationStageIndicator: React.FC = () => {
  const { escalationStage } = useCallSecurity()
  const activeIndex = STAGE_ORDER.indexOf(escalationStage)

  return (
    <div
      className="svt-stage-indicator"
      role="status"
      aria-label={`Escalation stage: ${STAGE_LABELS[escalationStage]}`}
    >
      {STAGE_ORDER.map((stage, i) => {
        const state =
          i < activeIndex ? 'done' : i === activeIndex ? 'active' : 'upcoming'
        return (
          <span
            key={stage}
            className={`svt-stage svt-stage--${state}`}
            aria-current={state === 'active' ? 'step' : undefined}
          >
            {STAGE_LABELS[stage]}
          </span>
        )
      })}
    </div>
  )
}

/**
 * CallerSimulationView — the caller side of the demo toggle.
 *
 * Shows the scripted caller lines and poses the identity challenge, then lets
 * the caller submit a typed ANSWER to the active security question (rather than
 * a generic voice sample — Requirement 14.4). On submit the raw answer is
 * forwarded via `submitCallerAnswer(answer, correct)` so the comparison flow can
 * use it (Requirement 14.5). A dedicated "Submit wrong answer" affordance always
 * drives the SecurityQuestionOutcome to `incorrect` (Requirement 14.6); the
 * primary submit compares against `expectedAnswer`.
 */
export interface CallerSimulationViewProps {
  securityQuestion: string
  /**
   * Expected answer for the primary submit. When omitted, any non-empty answer
   * is treated as correct (see {@link ScreenViewToggleProps.expectedAnswer}).
   */
  expectedAnswer?: string
}

export const CallerSimulationView: React.FC<CallerSimulationViewProps> = ({
  securityQuestion,
  expectedAnswer,
}) => {
  const { submitCallerAnswer, securityQuestionOutcome } = useCallSecurity()
  const [answer, setAnswer] = useState('')

  const normalize = (s: string) => s.trim().toLowerCase()

  const handleSubmit = () => {
    // When no expected answer is configured (real call — FamilyContact has no
    // stored answer), any non-empty submission counts as correct; otherwise
    // compare case-insensitively/trimmed (Requirement 14.6).
    const correct =
      expectedAnswer === undefined
        ? answer.trim().length > 0
        : normalize(answer) === normalize(expectedAnswer)
    // Forward the raw (untrimmed) answer so the comparison flow can use it.
    submitCallerAnswer(answer, correct)
  }

  const handleSubmitWrong = () => {
    // Explicit wrong-answer affordance → outcome becomes `incorrect` (14.6).
    submitCallerAnswer(answer, false)
  }

  const canSubmit = answer.trim().length > 0

  return (
    <section className="svt-caller-view" aria-label="Caller simulation">
      <div className="svt-caller-banner" role="note" aria-label="Caller-facing screen">
        📞 Caller's View
        <span className="svt-caller-banner-sub">This is what the caller sees</span>
      </div>
      <header className="svt-caller-header">
        <span className="svt-caller-avatar" aria-hidden="true">
          👤
        </span>
        <div className="svt-caller-id">
          <span className="svt-caller-name">Unknown Caller</span>
          <span className="svt-caller-sub">claims to be family</span>
        </div>
      </header>

      <div className="svt-caller-script" aria-label="Caller lines">
        {SCRIPTED_CALLER_LINES.map((line, i) => (
          <p key={i} className="svt-caller-line">
            {line}
          </p>
        ))}
      </div>

      <div className="svt-challenge">
        <p className="svt-challenge-label">Identity challenge</p>
        <p className="svt-challenge-question">{securityQuestion}</p>
      </div>

      <div className="svt-answer">
        <label className="svt-answer-label" htmlFor="svt-answer-input">
          Your answer
        </label>
        <input
          id="svt-answer-input"
          className="svt-answer-input"
          type="text"
          value={answer}
          placeholder="Type the answer to the security question"
          onChange={(e) => setAnswer(e.target.value)}
          aria-label="Answer to the security question"
        />
        <div className="svt-answer-actions">
          <button
            type="button"
            className="svt-btn svt-btn--primary"
            onClick={handleSubmit}
            disabled={!canSubmit}
            aria-label="Submit answer to the security question"
          >
            Submit answer
          </button>
          <button
            type="button"
            className="svt-btn svt-btn--danger"
            onClick={handleSubmitWrong}
            aria-label="Submit a wrong answer to the security question"
          >
            Submit wrong answer
          </button>
        </div>
      </div>

      <p className="svt-outcome" aria-live="polite">
        Security question outcome:{' '}
        <strong className={`svt-outcome--${securityQuestionOutcome}`}>
          {securityQuestionOutcome}
        </strong>
      </p>
    </section>
  )
}

export const ScreenViewToggle: React.FC<ScreenViewToggleProps> = ({
  protectedView,
  securityQuestion = DEFAULT_SECURITY_QUESTION,
  expectedAnswer,
}) => {
  const { screenView, setScreenView } = useCallSecurity()

  const select = (view: ScreenView) => () => setScreenView(view)

  return (
    <div className="svt-root">
      <div
        className="svt-toggle"
        role="tablist"
        aria-label="Switch between protected and caller views"
      >
        <button
          type="button"
          role="tab"
          className={`svt-toggle-btn${
            screenView === 'protected' ? ' svt-toggle-btn--active' : ''
          }`}
          aria-selected={screenView === 'protected'}
          onClick={select('protected')}
        >
          🛡️ Protected
        </button>
        <button
          type="button"
          role="tab"
          className={`svt-toggle-btn${
            screenView === 'caller' ? ' svt-toggle-btn--active' : ''
          }`}
          aria-selected={screenView === 'caller'}
          onClick={select('caller')}
        >
          📞 Caller
        </button>
      </div>

      <EscalationStageIndicator />

      <div className="svt-view">
        {screenView === 'protected' ? (
          <div className="svt-protected-view">{protectedView}</div>
        ) : (
          <CallerSimulationView
            securityQuestion={securityQuestion}
            expectedAnswer={expectedAnswer}
          />
        )}
      </div>
    </div>
  )
}

export default ScreenViewToggle
