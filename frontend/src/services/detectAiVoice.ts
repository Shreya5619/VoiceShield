import { apiUrl } from '../config/api'
import { aiVoiceSeverity, type Signal, type SeverityLevel } from './riskEngine'

/**
 * AI-voice detection signal.
 *
 * Shaped exactly like the RiskEngine `Signal` ({ value, severity, available }).
 * On success it carries the synthetic-indicator percentage (0–100) and a
 * derived {@link SeverityLevel}. On any failure it is marked `unavailable`
 * with a `null` value so callers (and the RiskEngine) can degrade gracefully.
 */
export type AIVoiceSignal = Signal

/** Timeout for the deepfake request; matches the 15 s budget in Requirement 11.6. */
const DETECT_AI_VOICE_TIMEOUT_MS = 15_000

/** Shape of the (reused) `/api/detect-deepfake` response we depend on. */
interface DetectDeepfakeResponse {
  ai_probability?: number
}

/**
 * POST a caller-audio WAV blob to the existing `/api/detect-deepfake` endpoint
 * and adapt the result into an {@link AIVoiceSignal}.
 *
 * Maps `ai_probability` (0–1) → `synthetic_percent` (0–100) and derives a
 * SeverityLevel via {@link aiVoiceSeverity} (<40 low, 40–69 suspicious, >=70 high).
 *
 * Never throws: on HTTP error, empty/invalid response, or a 15 s timeout the
 * returned signal is marked `available: false` with `value: null`, so the
 * caller and the remaining signals are never disrupted.
 *
 * Requirements: 11.1, 11.2, 11.3, 11.5, 11.6
 */
export async function detectAiVoice(wavBlob: Blob): Promise<AIVoiceSignal> {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), DETECT_AI_VOICE_TIMEOUT_MS)

  try {
    const formData = new FormData()
    formData.append('audio', wavBlob, 'caller_audio.wav')

    const res = await fetch(apiUrl('/api/detect-deepfake'), {
      method: 'POST',
      body: formData,
      signal: controller.signal,
    })

    if (!res.ok) {
      return makeUnavailable()
    }

    let data: DetectDeepfakeResponse
    try {
      data = (await res.json()) as DetectDeepfakeResponse
    } catch {
      // Empty or non-JSON response body.
      return makeUnavailable()
    }

    if (
      data == null ||
      typeof data.ai_probability !== 'number' ||
      Number.isNaN(data.ai_probability)
    ) {
      return makeUnavailable()
    }

    const syntheticPercent = clampPercent(data.ai_probability * 100)
    const severity: SeverityLevel = aiVoiceSeverity(syntheticPercent)

    return {
      value: syntheticPercent,
      severity,
      available: true,
    }
  } catch {
    // AbortError (timeout) or any network/other error → unavailable.
    return makeUnavailable()
  } finally {
    clearTimeout(timeoutId)
  }
}

/** Build the unavailable signal (value null, not counted by the RiskEngine). */
function makeUnavailable(): AIVoiceSignal {
  return { value: null, severity: 'unavailable', available: false }
}

/** Constrain a percentage into the [0, 100] range. */
function clampPercent(value: number): number {
  if (value < 0) return 0
  if (value > 100) return 100
  return value
}
