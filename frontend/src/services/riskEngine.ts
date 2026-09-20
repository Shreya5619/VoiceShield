/**
 * RiskEngine — pure signal-fusion module (no React, no I/O).
 *
 * Receives three independent signals (Voice Match, AI Voice, Conversation
 * Context/scam risk) plus a Security Question outcome and fuses them into a
 * single RiskAssessment framed as *possible* impersonation.
 *
 * Fusion is a deterministic pure function so it is trivially property-testable
 * and recomputes well within the 500 ms budget (Requirement 12.9).
 *
 * The strongest claim this module ever makes is "possible impersonation" — it
 * never asserts confirmed fraud or identity theft (Requirements 9.3, 12.8).
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Per-signal classification used for display chips. */
export type SeverityLevel = 'low' | 'suspicious' | 'high' | 'failed'

/** Fused overall risk classification produced by the RiskEngine. */
export type OverallRiskLevel = 'low' | 'medium' | 'high'

/** Result of the security challenge. */
export type SecurityQuestionOutcome =
  | 'unanswered'
  | 'correct'
  | 'incorrect'
  | 'bypassed'

/**
 * A single independent signal. When unavailable (skipped, errored, or not yet
 * computed), `value` is null, `severity` is `'unavailable'`, and `available`
 * is false.
 */
export interface Signal {
  /** 0–100, or null when unavailable. */
  value: number | null
  severity: SeverityLevel | 'unavailable'
  available: boolean
}

/** The four inputs fed into the RiskEngine. */
export interface RiskInputs {
  voiceMatch: Signal
  aiVoice: Signal
  conversationContext: Signal
  securityQuestion: SecurityQuestionOutcome
}

/** The fused assessment produced by `fuseRisk`. */
export interface RiskAssessment {
  voiceMatch: Signal
  aiVoice: Signal
  conversationContext: Signal
  securityQuestion: SecurityQuestionOutcome
  overall: OverallRiskLevel
  /** Non-empty, always "possible" framing. */
  banner: string
}

// ---------------------------------------------------------------------------
// Banner text (single source of truth for wording safety)
// ---------------------------------------------------------------------------

/** Exact high-risk banner mandated by Requirement 12.8. */
export const HIGH_RISK_BANNER =
  '🚨 Possible impersonation — Multiple signals indicate that this caller may not be the person they claim to be.'

/** Tentative-tier banner used at medium risk (Requirement 9.1 wording). */
export const MEDIUM_RISK_BANNER =
  '⚠️ Possible impersonation — One signal suggests this caller may not be who they claim to be.'

/** Low-risk banner — reassuring, still non-empty (Requirement 12.1). */
export const LOW_RISK_BANNER =
  '✅ No strong impersonation signals — the available checks look consistent so far.'

// ---------------------------------------------------------------------------
// Severity mappings (values 0–100)
// ---------------------------------------------------------------------------

/**
 * Map a raw 0–100 voice-match percentage to a severity.
 *
 * Higher match = safer, so the mapping is inverted:
 *   matchPercent >= 60          → 'low'
 *   40 <= matchPercent < 60     → 'suspicious'
 *   matchPercent < 40           → 'high'
 */
export function voiceMatchSeverity(matchPercent: number): SeverityLevel {
  if (matchPercent >= 60) return 'low'
  if (matchPercent >= 40) return 'suspicious'
  return 'high'
}

/**
 * Map a 0–100 scam-risk score to a severity.
 *   scamPercent < 30            → 'low'
 *   30 <= scamPercent < 70      → 'suspicious'
 *   scamPercent >= 70           → 'high'
 */
export function scamSeverity(scamPercent: number): SeverityLevel {
  if (scamPercent >= 70) return 'high'
  if (scamPercent >= 30) return 'suspicious'
  return 'low'
}

/**
 * Map a 0–100 synthetic-indicator score to a severity.
 *   syntheticPercent < 40       → 'low'
 *   40 <= syntheticPercent < 70 → 'suspicious'
 *   syntheticPercent >= 70      → 'high'
 */
export function aiVoiceSeverity(syntheticPercent: number): SeverityLevel {
  if (syntheticPercent >= 70) return 'high'
  if (syntheticPercent >= 40) return 'suspicious'
  return 'low'
}

// ---------------------------------------------------------------------------
// Fusion
// ---------------------------------------------------------------------------

/**
 * A signal counts as "severe" for fusion when it is available and its severity
 * is `high` or `suspicious`. Voice `failed` (comparison failed) also counts as
 * severe.
 */
function isSevere(signal: Signal): boolean {
  if (!signal.available) return false
  return (
    signal.severity === 'high' ||
    signal.severity === 'suspicious' ||
    signal.severity === 'failed'
  )
}

/**
 * Deterministic fusion applying the Requirement 12 precedence rules. Rules are
 * evaluated in order and the first matching rule wins:
 *
 *   1. securityQuestion === 'incorrect'                  → high
 *   2. >= 2 available signals are severe                 → high
 *   3. exactly 1 available signal is severe              → medium
 *   4. securityQuestion is 'correct' or 'bypassed'       → low
 *   5. otherwise                                         → low
 *
 * Tolerates any combination of `unavailable` signals without throwing.
 */
export function fuseRisk(inputs: RiskInputs): RiskAssessment {
  const { voiceMatch, aiVoice, conversationContext, securityQuestion } = inputs

  const severeCount = [voiceMatch, aiVoice, conversationContext].filter(
    isSevere,
  ).length

  let overall: OverallRiskLevel
  if (securityQuestion === 'incorrect') {
    overall = 'high'
  } else if (severeCount >= 2) {
    overall = 'high'
  } else if (severeCount === 1) {
    overall = 'medium'
  } else if (securityQuestion === 'correct' || securityQuestion === 'bypassed') {
    overall = 'low'
  } else {
    overall = 'low'
  }

  const banner =
    overall === 'high'
      ? HIGH_RISK_BANNER
      : overall === 'medium'
        ? MEDIUM_RISK_BANNER
        : LOW_RISK_BANNER

  return {
    voiceMatch,
    aiVoice,
    conversationContext,
    securityQuestion,
    overall,
    banner,
  }
}
