/**
 * useVoiceVerification
 *
 * On-demand refactor of `useVoiceMatch`. Instead of auto-capturing a fixed
 * 5-second window and comparing immediately, this hook owns a
 * `RollingSnippetBuffer` fed by the caller-only audio already emitted by
 * `useVADDiarization.onCallerAudio` (~3 s windows). Comparison happens only
 * when a claimed identity is selected (`verifyAgainst`).
 *
 * Gating: the entire capture/verify flow is only active while
 * `isUnknown === true`. Known contacts (`isUnknown === false`) are never
 * disrupted — `ingestCallerAudio` is a no-op and nothing is ever pushed to the
 * buffer or POSTed to the backend.
 *
 * This file implements the hook shell plus caller-audio ingestion (task 2.1),
 * the on-demand comparison body `verifyAgainst` against `/api/verify-speaker`
 * (task 2.2), and the `markVerified` / `reset` lifecycle (task 2.3).
 *
 * _Requirements: 1.7, 2.1, 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 6.2, 6.3, 6.4, 8.3, 2.6_
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { FamilyContact } from './useFamilyContacts'
import { apiUrl } from '../config/api'
import {
  RollingSnippetBuffer,
  decodeWavBlobToSnippet,
} from '../services/RollingSnippetBuffer'

/** Threshold (percent) at or above which a voice comparison is a pass. */
const MATCH_THRESHOLD = 60
/** Abort an in-flight /api/verify-speaker request after this many ms. */
const VERIFY_TIMEOUT_MS = 15_000
/** Poll interval (ms) while waiting for enough buffered audio to build a segment. */
const SEGMENT_POLL_INTERVAL_MS = 500
/** Give up waiting for a FreshSegment after this many ms → 'skipped'. */
const SEGMENT_WAIT_TIMEOUT_MS = 6_000

export type VerificationState =
  | 'idle'        // no selection yet (default while merely monitoring)
  | 'capturing'   // buffer is being filled (unknown call in progress)
  | 'comparing'   // FreshSegment posted to /api/verify-speaker
  | 'pass'        // match_percent >= 60  OR  answered/trusted
  | 'fail'        // match_percent < 60
  | 'skipped'     // user skipped, no segment, HTTP error, or timeout

export interface VoiceVerificationResult {
  matchPercent: number   // 0–100  (from match_percent)
  similarity: number     // -1..1  (from similarity)
  verified: boolean      // matchPercent >= 60
}

export interface UseVoiceVerificationOptions {
  isUnknown: boolean
  /** Emits caller-only snippets (wire to useVADDiarization.onCallerAudio). */
  onCallerSnippet?: (blob: Blob) => void
}

export interface UseVoiceVerificationReturn {
  verificationState: VerificationState
  verificationResult: VoiceVerificationResult | null
  /** Feed a caller-audio blob into the rolling buffer (from diarization). */
  ingestCallerAudio: (blob: Blob) => void
  /** On-demand: select FreshSegment + POST verify-speaker for this contact. */
  verifyAgainst: (contact: FamilyContact) => void
  /** Force 'pass' (answered security question / Trust This Call). */
  markVerified: () => void
  /** Release audio, clear buffer, abort in-flight, reset to idle. */
  reset: () => void
}

export function useVoiceVerification(
  o: UseVoiceVerificationOptions,
): UseVoiceVerificationReturn {
  const { isUnknown, onCallerSnippet } = o

  const [verificationState, setVerificationState] =
    useState<VerificationState>('idle')
  const [verificationResult, setVerificationResult] =
    useState<VoiceVerificationResult | null>(null)

  // The hook owns a single RollingSnippetBuffer for the lifetime of the mount.
  const bufferRef = useRef<RollingSnippetBuffer>(new RollingSnippetBuffer())
  // In-flight verify request controller (used by task 2.2 / 2.3).
  const abortRef = useRef<AbortController | null>(null)
  // Pending "wait for enough buffered audio" retry loop. Cleared on reset()
  // and whenever a new verifyAgainst() supersedes the previous attempt so a
  // stale poll can never resurrect a cancelled comparison.
  const segmentPollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const segmentTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  /** Cancel any pending segment-wait retry loop (poll + timeout). */
  const cancelSegmentWait = useCallback(() => {
    if (segmentPollRef.current !== null) {
      clearInterval(segmentPollRef.current)
      segmentPollRef.current = null
    }
    if (segmentTimeoutRef.current !== null) {
      clearTimeout(segmentTimeoutRef.current)
      segmentTimeoutRef.current = null
    }
  }, [])
  // Keep the latest onCallerSnippet callback without re-creating ingest.
  const onCallerSnippetRef = useRef(onCallerSnippet)
  useEffect(() => {
    onCallerSnippetRef.current = onCallerSnippet
  }, [onCallerSnippet])

  // While an unknown call is in progress we are in `capturing` (unless a
  // terminal/comparison state has already been reached via verifyAgainst).
  useEffect(() => {
    if (isUnknown) {
      setVerificationState((prev) => (prev === 'idle' ? 'capturing' : prev))
    } else {
      setVerificationState('idle')
    }
  }, [isUnknown])

  /**
   * Feed a caller-audio WAV blob into the rolling buffer.
   *
   * No-op when the caller is not unknown — known contacts are never captured.
   * While unknown, the blob is decoded to a snippet and pushed, and the raw
   * blob is forwarded to any `onCallerSnippet` subscriber. Keeps the hook in
   * `capturing` while filling the buffer.
   */
  const ingestCallerAudio = useCallback(
    (blob: Blob) => {
      if (!isUnknown) return

      // Forward the raw caller snippet to any subscriber (e.g. deepfake path).
      onCallerSnippetRef.current?.(blob)

      // Reflect that we are actively capturing (unless a comparison/terminal
      // state has already been reached for the current selection).
      setVerificationState((prev) => (prev === 'idle' ? 'capturing' : prev))

      // Decode + push asynchronously; ignore decode failures for a single
      // malformed snippet so capture keeps flowing.
      decodeWavBlobToSnippet(blob)
        .then((snippet) => {
          bufferRef.current.push(snippet)
        })
        .catch(() => {
          /* ignore a single undecodable snippet */
        })
    },
    [isUnknown],
  )

  /**
   * On-demand comparison against /api/verify-speaker (Req 3.2–3.8).
   *
   * Selects the freshest clean segment from the RollingSnippetBuffer and POSTs
   * it, together with the selected contact's stored SpeakerEmbedding, to the
   * VerifySpeakerEndpoint. Any path that cannot yield a definite match result —
   * a contact without an embedding, no assemblable FreshSegment (Req 3.6), an
   * HTTP error (Req 3.7), or a timeout/abort/network failure (Req 3.8) —
   * degrades gracefully to `skipped` so the call is never disrupted.
   *
   * The FreshSegment WAV blob is only referenced while the request is being
   * built and submitted; it is never stored on the hook, so it is released as
   * soon as this call returns (Req 6.4). Terminal states (`pass`/`fail`/
   * `skipped`) never restart a comparison on their own — only another
   * `verifyAgainst` call does (Req 6.2).
   */
  /**
   * POST an assembled FreshSegment's WAV blob + the stored embedding to
   * /api/verify-speaker and resolve the terminal state. Extracted so it can be
   * invoked either immediately (segment already available) or from the
   * segment-wait retry loop once enough audio has been buffered.
   */
  const postComparison = useCallback(
    (wavBlob: Blob, embedding: FamilyContact['speakerEmbedding']) => {
      // A new comparison supersedes any in-flight one.
      abortRef.current?.abort()
      const controller = new AbortController()
      abortRef.current = controller

      setVerificationState('comparing')

      const timeoutId = setTimeout(() => controller.abort(), VERIFY_TIMEOUT_MS)

      // Build the multipart body. `wavBlob` is intentionally referenced only
      // within this scope so it is not retained after submission (Req 6.4).
      const fd = new FormData()
      fd.append('live_audio', wavBlob, 'live.wav')
      fd.append('stored_embedding', JSON.stringify(embedding))

      console.log('[useVoiceVerification] POST /api/verify-speaker firing')

      void (async () => {
        try {
          const res = await fetch(apiUrl('/api/verify-speaker'), {
            method: 'POST',
            body: fd,
            signal: controller.signal,
          })

          // HTTP error → skipped, no overlay, remaining signals still flow (3.7).
          if (!res.ok) {
            setVerificationState('skipped')
            return
          }

          const data = await res.json()
          const matchPercent = Number(data.match_percent)
          const similarity = Number(data.similarity)
          const verified = matchPercent >= MATCH_THRESHOLD

          setVerificationResult({ matchPercent, similarity, verified })
          // Match threshold drives the terminal state (Req 3.3, 3.4, 3.5).
          setVerificationState(verified ? 'pass' : 'fail')
        } catch {
          // Abort (timeout / new selection / call end) or network error →
          // skipped so a backend failure never disrupts the call (Req 3.8).
          setVerificationState('skipped')
        } finally {
          clearTimeout(timeoutId)
          // Clear the ref only if this controller is still the active one.
          if (abortRef.current === controller) {
            abortRef.current = null
          }
        }
      })()
    },
    [],
  )

  const verifyAgainst = useCallback(
    (contact: FamilyContact) => {
      const embedding = contact.speakerEmbedding
      // No stored embedding → nothing to compare against (Req 8.3 / 3.6).
      if (!embedding) {
        setVerificationState('skipped')
        return
      }

      // A new selection supersedes any pending retry loop or in-flight compare.
      cancelSegmentWait()
      abortRef.current?.abort()
      abortRef.current = null

      // Select the freshest clean caller segment. If one is already available,
      // POST immediately.
      const segment = bufferRef.current.selectFreshSegment()
      if (segment) {
        postComparison(segment.wavBlob, embedding)
        return
      }

      // Not enough audio buffered YET. Don't give up — show `comparing` and
      // poll the buffer until a FreshSegment can be assembled, up to
      // SEGMENT_WAIT_TIMEOUT_MS, then fall through to `skipped`.
      setVerificationState('comparing')

      segmentPollRef.current = setInterval(() => {
        const seg = bufferRef.current.selectFreshSegment()
        if (seg) {
          cancelSegmentWait()
          postComparison(seg.wavBlob, embedding)
        }
      }, SEGMENT_POLL_INTERVAL_MS)

      segmentTimeoutRef.current = setTimeout(() => {
        cancelSegmentWait()
        console.log(
          '[useVoiceVerification] no caller audio buffered in time → skipped',
        )
        setVerificationState('skipped')
      }, SEGMENT_WAIT_TIMEOUT_MS)
    },
    [cancelSegmentWait, postComparison],
  )

  /**
   * Force the verification into `pass` (answered security question / "Trust
   * This Call") — Req 2.6 / 6.3 lifecycle companion.
   *
   * Cancels any in-flight comparison (the user has decided the caller is
   * trusted, so a pending result is moot), then forces state `pass` and
   * publishes a verified VoiceVerificationResult so downstream fusion treats
   * the caller as trusted. An existing result is preserved but forced to
   * `verified === true`; when there is none (trusted without a prior compare)
   * a synthetic full-confidence result is synthesized.
   */
  const markVerified = useCallback(() => {
    cancelSegmentWait()
    abortRef.current?.abort()
    abortRef.current = null

    setVerificationResult((prev) =>
      prev
        ? { ...prev, verified: true }
        : { matchPercent: 100, similarity: 1, verified: true },
    )
    setVerificationState('pass')
  }, [])

  /**
   * Release capture resources and return to `idle` (call end / cleanup) —
   * Req 6.3, 2.6, 6.4.
   *
   * Aborts any in-flight comparison, clears the RollingSnippetBuffer (releasing
   * all retained caller audio and any assemblable FreshSegment), clears the
   * result, and returns the lifecycle to `idle`. Called by the ActiveCallScreen
   * on call end so no audio or in-flight request outlives the call.
   */
  const reset = useCallback(() => {
    cancelSegmentWait()
    abortRef.current?.abort()
    abortRef.current = null
    bufferRef.current.clear()
    setVerificationResult(null)
    setVerificationState('idle')
  }, [cancelSegmentWait])

  return {
    verificationState,
    verificationResult,
    ingestCallerAudio,
    verifyAgainst,
    markVerified,
    reset,
  }
}
