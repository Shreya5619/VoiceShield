# Implementation Plan: Voice Verification & Security

## Overview

This plan turns the layered multi-signal impersonation-verification flow into incremental coding steps. It is an **update** to the existing VoiceShield call experience, not a greenfield build. The backend endpoints (`/api/verify-speaker`, `/api/detect-deepfake`, `/api/predict-scam`, `/api/analyze-scam`, `/api/speaker-embedding`) already exist and are **reused** — no new backend endpoints are created. The frontend refactors and extends existing plumbing: the duplicated `encodeWav` helper, the `useVoiceMatch` hook, the `VoiceMismatchOverlay`, and the caller-only audio stream already emitted by `useVADDiarization.onCallerAudio` (3 s windows).

Each task builds on the previous ones and ends by wiring new pieces into `ActiveCallScreen`, so there is no orphaned code. Property-based tests (fast-check / Hypothesis, min. 100 iterations) validate the pure/threshold logic; example and integration tests cover wiring, timeouts, and rendering.

## Tasks

- [x] 1. Extract shared WAV util and build the RollingSnippetBuffer service
  - [x] 1.1 Extract a shared `encodeWav` utility
    - Create `frontend/src/utils/wav.ts` exporting `encodeWav(samples: Float32Array, sampleRate: number): Blob` (mono RIFF, 16-bit PCM), matching the enrollment recorder's format
    - Re-export/replace the duplicated copies in `ActiveCallScreen.tsx`, `useVoiceMatch.ts`, `useVADDiarization.ts`, `VoiceCompareTool.tsx`, `VoiceSampleRecorder.tsx` to import from the shared util (no behavior change)
    - _Requirements: 2.4, 2.5_

  - [x] 1.2 Implement `RollingSnippetBuffer` service
    - Create `frontend/src/services/RollingSnippetBuffer.ts` with `Snippet`, `RollingSnippetBufferConfig`, `FreshSegment`, and the `RollingSnippetBuffer` class per the design
    - Implement `push` (FIFO, evict oldest until `size <= maxSnippets` and `totalDurationMs <= maxDurationMs`), `totalDurationMs`, `size`, `canAssembleSegment` (>= `minSegmentMs`), `clear`
    - Implement `selectFreshSegment()` to assemble the freshest contiguous span >= `minSegmentMs`, re-encode via shared `encodeWav`, return `FreshSegment` (or `null` when insufficient)
    - Decode incoming WAV blobs back to `Float32Array` samples for re-assembly
    - _Requirements: 2.2, 2.3, 6.1_

  - [ ]* 1.3 Write property test for RollingSnippetBuffer bounds
    - **Property 7: RollingSnippetBuffer stays bounded and keeps the newest audio**
    - After each push, `size <= maxSnippets` and `totalDurationMs <= maxDurationMs`, retaining only the most recent snippets (oldest evicted first)
    - **Validates: Requirements 2.2, 2.3, 6.1**

  - [ ]* 1.4 Write property test for FreshSegment WAV encoding
    - **Property 8: FreshSegment encodes as a valid mono WAV** — header declares 1 channel and `data` chunk size == `numSamples × 2`
    - **Validates: Requirements 2.4, 2.5**

- [x] 2. Refactor `useVoiceMatch` into on-demand `useVoiceVerification`
  - [x] 2.1 Create the `useVoiceVerification` hook
    - Create `frontend/src/hooks/useVoiceVerification.ts` with `VerificationState`, `VoiceVerificationResult`, `UseVoiceVerificationOptions`, `UseVoiceVerificationReturn` per the design
    - Own a `RollingSnippetBuffer`; expose `ingestCallerAudio(blob)` (push while `isUnknown`), `verifyAgainst(contact)`, `markVerified()`, `reset()`
    - While `isUnknown === true`, state is `capturing`; ingested blobs are pushed to the buffer
    - _Requirements: 1.7, 2.1, 3.1, 6.2_

  - [x] 2.2 Implement on-demand comparison against `/api/verify-speaker`
    - `verifyAgainst(contact)`: select FreshSegment (none → `skipped`); else `comparing`, POST `live_audio` (FreshSegment WAV) + `stored_embedding` (contact `speakerEmbedding`) with a 15 s `AbortController` timeout
    - `match_percent >= 60` → `pass` + `verified = true`; `< 60` → `fail` + `verified = false`; HTTP error/timeout → `skipped`
    - Do not retain the FreshSegment blob after submission; terminal states do not restart until a new `verifyAgainst`
    - _Requirements: 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 6.2, 6.4, 8.3_

  - [x] 2.3 Implement `markVerified` and `reset` lifecycle
    - `markVerified()` forces `pass` (answered / trust)
    - `reset()` clears the buffer, aborts in-flight fetch, releases audio, sets `idle` (call end)
    - _Requirements: 2.6, 6.3, 6.4_

  - [ ]* 2.4 Write property test for match-threshold state derivation
    - **Property 10: Match threshold drives verification state** — `match_percent >= 60` → `pass`/`verified`; `< 60` → `fail`/`!verified`
    - **Validates: Requirements 3.3, 3.4, 3.5**

  - [ ]* 2.5 Write unit tests for degrade-to-skipped and lifecycle
    - **Property 11: Missing segment or backend failure degrades to skipped** — no segment / HTTP error / 15 s timeout → `skipped`, no overlay, remaining signals still forwarded
    - **Property 16: Call end releases all capture resources** — buffer cleared, in-flight aborted, state `idle`, no retained blob
    - Cover on-demand-only (no POST until `verifyAgainst`), terminal idempotence, `markVerified`
    - **Validates: Requirements 3.6, 3.7, 3.8, 6.3, 6.4**

- [x] 3. Implement the RiskEngine pure module
  - [x] 3.1 Implement severity mappings and `fuseRisk`
    - Create `frontend/src/services/riskEngine.ts` with `SeverityLevel`, `OverallRiskLevel`, `SecurityQuestionOutcome`, `Signal`, `RiskInputs`, `RiskAssessment` types
    - Implement `voiceMatchSeverity`, `scamSeverity`, `aiVoiceSeverity` per the documented thresholds
    - Implement `fuseRisk` with the Requirement 12 precedence (incorrect → high; ≥2 severe → high; exactly 1 severe → medium; correct/bypassed → low; else low), tolerating `unavailable` signals; produce a non-empty "possible impersonation" banner
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5, 12.1, 12.2, 12.3, 12.4, 12.5, 12.6, 12.7, 12.8_

  - [ ]* 3.2 Write property test for severity band mapping
    - **Property 17: Signal value maps to a stable severity band** — for any value in `[0,100]` each mapper returns the documented band; synthetic `>= 70` → `suspicious` or `high`
    - **Validates: Requirements 10.2, 10.3, 10.4, 11.2, 11.3**

  - [ ]* 3.3 Write property test for fusion precedence and unavailable tolerance
    - **Property 18: RiskEngine tolerates any combination of unavailable signals** — never throws, marks unavailable, computes from remaining
    - **Property 19: Fusion precedence is correct and complete** — matches the reference precedence; assessment always contains all four inputs, three severities, overall level, non-empty banner
    - **Validates: Requirements 10.5, 11.6, 12.1, 12.2, 12.3, 12.4, 12.5, 12.6, 12.7, 13.12**

  - [ ]* 3.4 Write property test for wording safety
    - **Property 20: Wording never asserts confirmed fraud** — banner never contains "confirmed"/"identity theft"/"fraud"; `high` uses the "🚨 Possible impersonation — …" message; tentative tier uses "⚠️ Possible impersonation"
    - **Validates: Requirements 9.1, 9.2, 9.3, 9.4, 9.5, 12.8**

- [x] 4. Implement the AI-voice detection adapter
  - [x] 4.1 Create `detectAiVoice` frontend adapter
    - Create `frontend/src/services/detectAiVoice.ts` that POSTs a WAV to the existing `/api/detect-deepfake`, maps `ai_probability → synthetic_percent (× 100)`, derives severity, and returns an `AIVoiceSignal`
    - On HTTP error / empty / 15 s timeout, mark the signal `unavailable` (do not disrupt other signals)
    - _Requirements: 11.1, 11.2, 11.3, 11.5, 11.6_

  - [ ]* 4.2 Write unit tests for the AI-voice adapter
    - Assert `synthetic_percent`/severity population on success and `unavailable` on error/timeout
    - _Requirements: 11.5, 11.6_

- [x] 5. Build the IdentityPrompt component
  - [x] 5.1 Implement `IdentityPrompt`
    - Create `frontend/src/components/IdentityPrompt.tsx` with `IdentityPromptProps`
    - List only enrolled contacts (`useFamilyContacts(...).contacts.filter(c => c.speakerEmbedding)`), each selectable via `onSelect`; always render an explicit **Skip verification** control calling `onSkip`
    - _Requirements: 1.3, 1.4, 1.5, 1.6_

  - [ ]* 5.2 Write unit test for enrolled-only listing plus Skip
    - **Property 4: Identity prompt lists only enrolled contacts plus Skip**
    - **Validates: Requirements 1.4**

- [x] 6. Evolve `VoiceMismatchOverlay` into `SecurityQuestionOverlay`
  - [x] 6.1 Implement `SecurityQuestionOverlay`
    - Create `frontend/src/components/SecurityQuestionOverlay.tsx` (evolved from `VoiceMismatchOverlay`) with `SecurityQuestionOverlayProps`
    - Speak `"Possible impersonation detected. {question}"` via `SpeechSynthesis` (preserve `try/catch` so the overlay renders even if speech is unavailable)
    - Substitute default `"What is your full name?"` when the contact `securityQuestion` is blank/whitespace
    - Show match % and the tentative `⚠️ Possible impersonation` banner while incomplete
    - Provide a typed-answer input + **Submit Answer** (enabled only for non-empty), **Trust This Call**, **Mark as Scam & End Call** (→ `onEndCall`)
    - Update `ActiveCallScreen` import from `VoiceMismatchOverlay` to `SecurityQuestionOverlay`
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 4.8_

  - [ ]* 6.2 Write unit tests for the overlay
    - **Property 12: Verification failure triggers tentative speech and overlay** — `speechSynthesis.speak` called with "Possible impersonation" + question text; overlay rendered
    - **Property 13: Blank security question substitutes the default text**
    - Cover submit-disabled on empty/whitespace, Trust/End wiring, speech-unavailable still renders
    - **Validates: Requirements 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 4.8**

- [x] 7. Build the CombinedRiskPanel component
  - [x] 7.1 Implement `CombinedRiskPanel`
    - Create `frontend/src/components/CombinedRiskPanel.tsx` with `CombinedRiskPanelProps`
    - Render four rows using exactly the labels `"VOICE MATCH"`, `"AI VOICE"`, `"SCAM RISK"`, `"SECURITY QUESTION"`, each with value + severity chip (`⚠️ Low`, `⚠️ Suspicious`, `🔴 High`, `🔴 Failed`); unavailable signals render an "unavailable" indicator
    - Render the summary banner beneath the rows
    - Provide exactly four actions — **Continue Call**, **Mute** (toggle + muted indicator), **End Call** (→ `onEndCall`), **Report** (confirmation on success; on failure show error and retain the panel)
    - _Requirements: 13.1, 13.2, 13.3, 13.4, 13.5, 13.6, 13.7, 13.8, 13.9, 13.10, 13.11, 13.12_

  - [ ]* 7.2 Write unit test for labels, chips, and mute toggle
    - **Property 21: CombinedRiskPanel renders the fixed labels and mute toggle is involutive** — fixed labels, unavailable indicator, toggling Mute twice restores the original mute state
    - Cover Continue/End/Report wiring including failure-retain
    - **Validates: Requirements 13.2, 13.3, 13.8, 13.9, 13.12**

- [x] 8. Build the Protected/Caller ScreenView toggle and shared context
  - [x] 8.1 Implement the shared call-security context
    - Create `frontend/src/context/CallSecurityContext.tsx` exposing `CallSecurityContextValue` (screenView, escalationStage, verificationState, verificationResult, assessment, securityQuestionOutcome, `setScreenView`, `submitCallerAnswer`)
    - Both views read/write the same state so changes reflect across views with no reload
    - _Requirements: 14.2, 14.7_

  - [x] 8.2 Implement `ScreenViewToggle` and caller view
    - Create `frontend/src/components/ScreenViewToggle.tsx` with a two-way `protected` ⇆ `caller` toggle (no page reload)
    - Caller view shows scripted lines (e.g. "Hey, I'm your brother. I need money urgently.") and the challenge "What was the name of your first school?", with a control to record/submit an answer that updates `SecurityQuestionOutcome` (wrong → `incorrect`)
    - Protected view reflects each `EscalationStage` transition as it occurs
    - _Requirements: 14.1, 14.3, 14.4, 14.5, 14.6, 14.8_

  - [ ]* 8.3 Write unit test for shared-state reflection
    - **Property 22: Screen toggle shares verification and risk state** — a change to VerificationState / EscalationStage / RiskAssessment on one view is reflected identically on the other (no reset, no reload)
    - Cover scripted lines and caller wrong-answer → `incorrect`
    - **Validates: Requirements 14.1, 14.2, 14.3, 14.4, 14.5, 14.6, 14.7, 14.8**

- [x] 9. Checkpoint - Ensure all component/service tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 10. Wire the escalation flow into `ActiveCallScreen` (isUnknown gate)
  - [~] 10.1 Add the ordered EscalationStage reducer
    - In `frontend/src/components/ActiveCallScreen.tsx`, add an `EscalationStage` reducer that only advances one step in `detect → suspect → identify → challenge → verify → protect` and rejects out-of-order transitions (retaining the current stage)
    - Initialize `detect` when `caller.isUnknown === true`; leave the `isUnknown === false` known-contact branch byte-for-byte unchanged
    - _Requirements: 1.1, 1.2, 1.8, 1.9_

  - [~] 10.2 Replace `useVoiceMatch` and wire caller audio into the buffer
    - Swap `useVoiceMatch(familyContact)` for `useVoiceVerification({ isUnknown })`
    - Extend the existing `handleCallerAudio` (wired to `useVADDiarization.onCallerAudio`) to also call `voiceVerification.ingestCallerAudio(blob)` — reusing the single existing mic capture
    - Call `voiceVerification.reset()` on call end / cleanup
    - _Requirements: 1.1, 2.1, 2.6, 6.3_

  - [~] 10.3 Wire detect→suspect and the identity/verify path
    - Advance `detect → suspect` when `scamProb` or AI-voice severity crosses the suspicion threshold; render `IdentityPrompt`
    - On contact selection: `identify` + `verifyAgainst(contact)`; on Skip: `skipped`, continue monitoring
    - On `fail`: `challenge` + render `SecurityQuestionOverlay`; on answered/trusted: `verify` → `markVerified()` + `stopRecording()` + `stopDiarization()` (reuse existing `handleVerified`); then `protect` + render `CombinedRiskPanel`
    - Wire the AI-voice adapter and scam signals into `fuseRisk` and pass the assessment down; mount `ScreenViewToggle` + shared context
    - _Requirements: 1.3, 1.5, 1.6, 4.1, 4.2, 5.1, 5.2, 5.3, 13.1, 14.2, 14.8_

  - [~] 10.4 Apply two-tier wording and suppress scam APIs when verified
    - Use tentative `⚠️` wording pre-fusion and escalate to `🚨 Impersonation risk: HIGH` only when voice mismatch + outcome `incorrect`; never definitive fraud wording
    - Show the "Verified ✓" badge in place of the scam bar while `pass`; suppress `/api/predict-scam` and `/api/analyze-scam` while `verificationState === 'pass'` (generalize the existing `callVerified` guard)
    - _Requirements: 5.4, 5.5, 9.1, 9.2, 9.3, 9.4, 9.5_

  - [ ]* 10.5 Write property/unit tests for the ActiveCallScreen wiring
    - **Property 1: Known callers bypass the entire flow** — `isUnknown === false` never pushes to the buffer, never enters capturing/comparing, never POSTs to `/api/verify-speaker`
    - **Property 6: EscalationStage transitions are strictly ordered** — only immediate-successor transitions apply; out-of-order requests retain the stage
    - **Property 3: Suspicion threshold offers the identity prompt** — at/above threshold → `suspect` + IdentityPrompt; below → stays `detect`
    - **Property 15: Verified state suppresses all scam API calls**
    - **Validates: Requirements 1.1, 1.2, 1.3, 1.8, 1.9, 5.5**

- [ ] 11. Verify reused backend endpoints and run integration pass
  - [ ]* 11.1 Verify `/api/verify-speaker` response shape and errors
    - **Property 23: Backend verify-speaker schema completeness** — response contains `similarity` (float), `match_percent` (float), `verified` (bool)
    - **Property 24: Backend rejects malformed verify-speaker input** — empty `live_audio` or malformed/wrong-dimension `stored_embedding` → HTTP 400 with non-empty detail
    - Cover model-unloaded → HTTP 503 "Speaker embedding model is not available."
    - **Validates: Requirements 7.1, 7.2, 7.3, 7.4, 7.5, 7.6**

  - [ ]* 11.2 Verify round-trip embedding self-consistency
    - **Property 25: Round-trip embedding self-consistency** — embedding from `/api/speaker-embedding` then `/api/verify-speaker` with the same WAV returns `similarity >= 0.20`
    - Assert `/api/verify-speaker` responds within 10 s for a 5 s mono 16 kHz WAV
    - **Validates: Requirements 8.1, 8.2, 7.7**

  - [ ]* 11.3 Write frontend integration tests
    - Enroll a contact → simulate unknown call → ingest that speaker's audio → select the contact → `VerificationState` reaches `pass`
    - Timeout path: slow `/api/verify-speaker` (> 15 s) → `skipped` without disrupting the call
    - `/api/detect-deepfake` adapter populates the `AIVoiceSignal`
    - Screen toggle end-to-end: caller wrong answer → `SecurityQuestionOutcome = 'incorrect'` → protected view shows escalated "🚨 Impersonation risk: HIGH"
    - _Requirements: 3.1, 3.8, 11.5, 14.5, 14.6, 14.7_

- [~] 12. Final checkpoint - Ensure all tests pass and clean up
  - Remove the now-unused `useVoiceMatch.ts` / `VoiceMismatchOverlay.tsx` if no longer referenced; ensure the build is green
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional test tasks and can be skipped for a faster MVP; core implementation tasks are never optional.
- This is an update: `/api/verify-speaker`, `/api/detect-deepfake`, `/api/predict-scam`, `/api/analyze-scam`, and `/api/speaker-embedding` already exist and are reused — no new backend endpoints are built. `/api/detect-ai-voice` from the requirements is satisfied by the existing `/api/detect-deepfake` via the frontend adapter in task 4.
- Existing plumbing is refactored/extended, not duplicated: shared `encodeWav` util, `useVoiceMatch → useVoiceVerification`, `VoiceMismatchOverlay → SecurityQuestionOverlay`, and the caller-audio stream from `useVADDiarization.onCallerAudio`.
- Known contacts (`isUnknown === false`) are never disrupted — the entire flow is gated behind `isUnknown === true`.
- Each task references specific requirements for traceability; property-based tests are placed close to the code they validate to catch errors early.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["1.2", "3.1", "4.1", "5.1", "7.1", "8.1"] },
    { "id": 2, "tasks": ["1.3", "1.4", "2.1", "3.2", "3.3", "3.4", "4.2", "5.2", "6.1", "7.2", "8.2"] },
    { "id": 3, "tasks": ["2.2", "2.3", "6.2", "8.3", "11.1", "11.2"] },
    { "id": 4, "tasks": ["2.4", "2.5", "10.1"] },
    { "id": 5, "tasks": ["10.2"] },
    { "id": 6, "tasks": ["10.3"] },
    { "id": 7, "tasks": ["10.4"] },
    { "id": 8, "tasks": ["10.5", "11.3"] }
  ]
}
```
