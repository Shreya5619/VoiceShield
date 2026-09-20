/**
 * CallSecurityContext — shared state for the Protected/Caller ScreenView toggle.
 *
 * The impersonation-verification demo has two views that must operate on the
 * SAME live state:
 *
 *   - the **protected** view (what the protected device shows), and
 *   - the **caller** view (a caller-simulation used during a demo).
 *
 * Both views read and write through this single React context, so a change
 * made on one view is reflected immediately on the other with no page reload
 * (Requirements 14.2, 14.7). ActiveCallScreen (task 10) drives the escalation
 * stage, verification state, verification result, and fused risk assessment;
 * the caller view calls `submitCallerAnswer` to record a security-question
 * answer, which updates `securityQuestionOutcome` (a wrong answer → `incorrect`).
 *
 * Intended wiring
 * ---------------
 * ActiveCallScreen owns the authoritative call/verification/risk state and
 * feeds it into <CallSecurityProvider> as *controlled* props. The provider is a
 * controlled/uncontrolled hybrid:
 *
 *   - Any field passed as a prop is treated as controlled — the provider mirrors
 *     the prop into its internal state whenever the prop changes, so the owner
 *     (ActiveCallScreen) remains the source of truth for escalationStage,
 *     verificationState, verificationResult, and assessment.
 *   - Fields not passed as props fall back to internal defaults, so the provider
 *     can also be used standalone (e.g. in tests or the ScreenViewToggle demo)
 *     without an external owner.
 *
 * `screenView` and `securityQuestionOutcome` are managed internally by default
 * (the toggle and the caller answer flip them locally), but they can also be
 * controlled by passing `screenView` / `securityQuestionOutcome` props plus the
 * corresponding change callbacks.
 */
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import type {
  VerificationState,
  VoiceVerificationResult,
  // NOTE: `../hooks/useVoiceVerification` is created by the parallel task 2.1.
  // Until that file lands, a type-check may report this import as missing —
  // that is an expected cross-task dependency, not a defect in this file.
} from '../hooks/useVoiceVerification'
import type {
  RiskAssessment,
  SecurityQuestionOutcome,
} from '../services/riskEngine'

// ---------------------------------------------------------------------------
// Local types (owned by this module)
// ---------------------------------------------------------------------------

/** The active side of the two-way demo toggle. */
export type ScreenView = 'protected' | 'caller'

/**
 * The deliberate escalation narrative for an unknown call. Stages only ever
 * advance one step in this fixed order (enforced by ActiveCallScreen's reducer
 * in task 10). Defined here so both views can render the current stage.
 */
export type EscalationStage =
  | 'detect'
  | 'suspect'
  | 'identify'
  | 'challenge'
  | 'verify'
  | 'protect'

/**
 * The shared value exposed to both the protected and caller views. Every field
 * reads from the SAME underlying state, so updates propagate across views.
 */
export interface CallSecurityContextValue {
  /** Which view is currently active. */
  screenView: ScreenView
  /** Switch views without a page reload (Requirement 14.1). */
  setScreenView: (v: ScreenView) => void
  /** Current escalation stage, reflected on the protected view (14.8). */
  escalationStage: EscalationStage
  /** Current voice-verification state. */
  verificationState: VerificationState
  /** Latest voice-verification result, or null before any comparison. */
  verificationResult: VoiceVerificationResult | null
  /** The fused RiskEngine assessment shared across both views. */
  assessment: RiskAssessment
  /** Outcome of the security challenge. */
  securityQuestionOutcome: SecurityQuestionOutcome
  /**
   * Called from the caller view when the caller submits an answer to the
   * security question. `correct === false` sets the outcome to `incorrect`
   * (Requirement 14.6); a correct answer sets it to `correct`. The raw answer
   * text is forwarded to the optional owner callback so ActiveCallScreen can
   * feed it into the comparison flow (Requirement 14.5).
   */
  submitCallerAnswer: (answer: string, correct: boolean) => void
}

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

/**
 * A neutral, low-risk default assessment used when the provider is uncontrolled
 * (e.g. before ActiveCallScreen has computed a real assessment, or in tests).
 * All signals start unavailable and the security question unanswered.
 */
const DEFAULT_ASSESSMENT: RiskAssessment = {
  voiceMatch: { value: null, severity: 'unavailable', available: false },
  aiVoice: { value: null, severity: 'unavailable', available: false },
  conversationContext: { value: null, severity: 'unavailable', available: false },
  securityQuestion: 'unanswered',
  overall: 'low',
  banner: '',
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

const CallSecurityContext = createContext<CallSecurityContextValue | null>(null)

/**
 * Props for {@link CallSecurityProvider}. Controlled fields are optional — pass
 * them to have ActiveCallScreen drive the value, or omit them to let the
 * provider manage the field internally.
 */
export interface CallSecurityProviderProps {
  children: ReactNode

  // --- Controlled inputs (ActiveCallScreen drives these in task 10) ---------
  /** Controlled escalation stage. Defaults to `'detect'` when omitted. */
  escalationStage?: EscalationStage
  /** Controlled verification state. Defaults to `'idle'` when omitted. */
  verificationState?: VerificationState
  /** Controlled verification result. Defaults to `null` when omitted. */
  verificationResult?: VoiceVerificationResult | null
  /** Controlled fused assessment. Defaults to a neutral low-risk value. */
  assessment?: RiskAssessment

  // --- ScreenView (controlled/uncontrolled) ---------------------------------
  /** Controlled active view. When omitted the provider manages it internally. */
  screenView?: ScreenView
  /** Initial view when uncontrolled. Defaults to `'protected'`. */
  defaultScreenView?: ScreenView
  /** Notified whenever the active view changes (both controlled + uncontrolled). */
  onScreenViewChange?: (v: ScreenView) => void

  // --- Security question outcome (controlled/uncontrolled) ------------------
  /** Controlled outcome. When omitted the provider manages it internally. */
  securityQuestionOutcome?: SecurityQuestionOutcome
  /** Initial outcome when uncontrolled. Defaults to `'unanswered'`. */
  defaultSecurityQuestionOutcome?: SecurityQuestionOutcome
  /**
   * Notified whenever the caller submits an answer. Receives the raw answer
   * text and the derived outcome so the owner can drive the comparison flow
   * (Requirement 14.5) and keep any controlled outcome in sync.
   */
  onCallerAnswer?: (answer: string, outcome: SecurityQuestionOutcome) => void
}

/**
 * Provides the shared call-security state to both the protected and caller
 * views. See the file header for the intended controlled/uncontrolled wiring.
 */
export function CallSecurityProvider({
  children,
  escalationStage,
  verificationState,
  verificationResult,
  assessment,
  screenView: controlledScreenView,
  defaultScreenView = 'protected',
  onScreenViewChange,
  securityQuestionOutcome: controlledOutcome,
  defaultSecurityQuestionOutcome = 'unanswered',
  onCallerAnswer,
}: CallSecurityProviderProps) {
  // ScreenView: controlled if a `screenView` prop is supplied, else internal.
  const isScreenViewControlled = controlledScreenView !== undefined
  const [internalScreenView, setInternalScreenView] =
    useState<ScreenView>(defaultScreenView)
  const screenView = isScreenViewControlled
    ? controlledScreenView
    : internalScreenView

  const setScreenView = useCallback(
    (v: ScreenView) => {
      if (!isScreenViewControlled) setInternalScreenView(v)
      onScreenViewChange?.(v)
    },
    [isScreenViewControlled, onScreenViewChange],
  )

  // SecurityQuestionOutcome: controlled if a prop is supplied, else internal.
  const isOutcomeControlled = controlledOutcome !== undefined
  const [internalOutcome, setInternalOutcome] =
    useState<SecurityQuestionOutcome>(defaultSecurityQuestionOutcome)
  const securityQuestionOutcome = isOutcomeControlled
    ? controlledOutcome
    : internalOutcome

  const submitCallerAnswer = useCallback(
    (answer: string, correct: boolean) => {
      // A wrong answer flips the outcome to `incorrect` (Requirement 14.6);
      // a correct answer marks it `correct`.
      const outcome: SecurityQuestionOutcome = correct ? 'correct' : 'incorrect'
      if (!isOutcomeControlled) setInternalOutcome(outcome)
      // Forward the raw answer + derived outcome so the owner can drive the
      // comparison flow and keep any controlled state in sync (Requirement 14.5).
      onCallerAnswer?.(answer, outcome)
    },
    [isOutcomeControlled, onCallerAnswer],
  )

  // Controlled inputs fall back to internal defaults when not supplied. These
  // are mirrored (rather than stored) so ActiveCallScreen stays the source of
  // truth; a re-render with a new prop immediately updates every consumer.
  const value = useMemo<CallSecurityContextValue>(
    () => ({
      screenView,
      setScreenView,
      escalationStage: escalationStage ?? 'detect',
      verificationState: verificationState ?? 'idle',
      verificationResult: verificationResult ?? null,
      assessment: assessment ?? DEFAULT_ASSESSMENT,
      securityQuestionOutcome,
      submitCallerAnswer,
    }),
    [
      screenView,
      setScreenView,
      escalationStage,
      verificationState,
      verificationResult,
      assessment,
      securityQuestionOutcome,
      submitCallerAnswer,
    ],
  )

  return (
    <CallSecurityContext.Provider value={value}>
      {children}
    </CallSecurityContext.Provider>
  )
}

/**
 * Read the shared call-security context. Throws a clear error when used outside
 * a {@link CallSecurityProvider} so misuse is caught immediately.
 */
export function useCallSecurity(): CallSecurityContextValue {
  const ctx = useContext(CallSecurityContext)
  if (ctx === null) {
    throw new Error(
      'useCallSecurity must be used within a <CallSecurityProvider>. ' +
        'Wrap the Protected/Caller views (ScreenViewToggle) in the provider.',
    )
  }
  return ctx
}

export { CallSecurityContext }
