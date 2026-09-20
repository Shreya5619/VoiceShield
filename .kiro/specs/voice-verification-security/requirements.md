# Requirements Document

## Introduction

This feature adds a **layered, multi-signal security escalation flow** to VoiceShield's call experience for **unknown callers**. Rather than treating voice verification as a single unconditional check, the system fuses three independent signals — **Voice Match**, **AI Voice Detection**, and **Conversation Context (scam risk)** — plus the outcome of a **Security Question** into a central **Risk Engine** that produces an overall risk assessment framed as *possible impersonation*. The user is then presented with a combined risk panel and chooses an action.

**Scope: unknown numbers only.** The entire impersonation-verification flow (voice match, AI voice detection, scam scoring, and security escalation) runs **only** for callers whose `isUnknown` flag is `true`. Known family contacts receive **no** automatic identity verification and behave exactly as they do today. There is no auto-verify-at-call-start path for any caller.

Verification is driven by a deliberate security-escalation narrative: **Detect → Suspect → Identify → Challenge → Verify → Protect**. While an unknown call is in progress, the scam and AI-voice detectors continuously monitor the conversation (Detect). When suspicious behavior is flagged, VoiceShield prompts the user to select which **enrolled contact** the caller claims to be — or to **skip** verification entirely (Suspect/Identify). Verification is therefore **on demand**, not automatic on every unknown call. Only after the user selects a claimed identity does VoiceShield run the voice comparison (Identify). If identity signals are weak, the caller can be challenged with the enrolled contact's security question (Challenge); the caller answers via the caller-side screen (Verify); and finally the user is shown a combined risk panel and chooses an action (Protect). Each escalation step has an explicit reason — identity verification is triggered as a logical consequence of scam/AI-voice detection **and** an explicit user identity selection, never unconditionally.

**Continuous rolling snippet capture.** Instead of a one-shot fixed 30-second window, VoiceShield continuously captures **short audio snippets** of the caller's voice into a **bounded rolling buffer** throughout the call. When the user selects a claimed identity, the system takes a **fresh, relatively clean multi-second segment** from that rolling buffer and compares it against the enrolled reference voice sample of the selected contact. Nothing is compared until the user makes a selection.

**Two-tier severity language** protects credibility: before identity signals are combined, the system uses tentative wording ("⚠️ Possible impersonation"), and once the voice and security-question checks complete it may escalate to "🚨 Impersonation risk: HIGH". The system **never** asserts confirmed identity fraud or identity theft at any tier — the strongest claim is always framed as *possible* impersonation.

The original single-signal building blocks — computing a speaker embedding, comparing it against a stored embedding at a 60% threshold, presenting a security question on mismatch, and stopping monitoring once the caller is trusted — are preserved and now participate as one of the signals feeding the Risk Engine, but only within the unknown-caller, user-initiated flow described above.

## Glossary

- **VoiceShield**: The application as a whole — the React/TypeScript frontend plus the Python FastAPI backend.
- **ActiveCallScreen**: The React component that manages the in-call UI, scam risk bar, transcription, and overlays.
- **VoiceVerificationService**: A frontend service responsible for continuously capturing short audio snippets of the caller's voice into a bounded rolling buffer and, on demand, selecting a fresh clean segment and returning a similarity score for it.
- **RollingSnippetBuffer**: A bounded in-memory buffer that continuously holds the most recent short audio snippets of the caller's voice, discarding the oldest snippets once the bound is reached.
- **FreshSegment**: A relatively clean multi-second span of caller speech selected on demand from the RollingSnippetBuffer at the moment the user selects a claimed identity, used as the live audio for comparison.
- **ClaimedIdentitySelection**: The user's on-demand choice of which enrolled FamilyContact the caller claims to be, or an explicit choice to skip verification.
- **SkipVerification**: The user action, offered alongside enrolled-contact choices in the identity prompt, that declines voice comparison and allows the call to continue under normal scam monitoring.
- **ScreenView**: The active side of the two-way demo toggle — one of `protected` (the protected-device view) or `caller` (the caller-simulation view).
- **SecurityQuestionOverlay**: A React component (modal overlay) that presents the stored security question for the claimed FamilyContact.
- **SpeakerEmbedding**: A 192-dimensional float vector produced by the SpeechBrain ECAPA-TDNN model representing a speaker's vocal characteristics.
- **VoiceVerificationResult**: A data object containing `matchPercent` (0–100), `similarity` (cosine similarity, -1 to 1), and `verified` (boolean).
- **FamilyContact**: A stored contact record containing name, relation, phone, security question text, and an optional SpeakerEmbedding.
- **EnrolledContact**: A FamilyContact that contains a stored SpeakerEmbedding and is therefore eligible to be selected as a ClaimedIdentitySelection.
- **VerificationState**: The lifecycle state of voice verification — one of `idle`, `capturing`, `comparing`, `pass`, `fail`, `skipped`.
- **useVoiceVerification**: A React hook that manages the continuous rolling snippet capture, performs the on-demand backend comparison when a claimed identity is selected, and returns the current VerificationState and VoiceVerificationResult.
- **CompareVoicesEndpoint**: The existing `/api/compare-voices` POST endpoint that accepts two WAV files and returns cosine similarity and match percentage.
- **VerifySpeakerEndpoint**: The `/api/verify-speaker` POST endpoint that accepts a live WAV file and a stored SpeakerEmbedding vector and returns similarity, match percent, and a verified flag.
- **SimilarityThreshold**: The minimum match percentage (60%) below which voice verification is considered a failure, contributing a weak VoiceMatchSignal.
- **SpeechSynthesis**: The browser's built-in `window.speechSynthesis` Web Speech API used to speak security challenge text aloud.
- **RiskEngine**: A frontend module that receives the three independent signals (VoiceMatchSignal, AIVoiceSignal, ConversationContextSignal) plus the SecurityQuestionOutcome and fuses them into a RiskAssessment with an OverallRiskLevel.
- **VoiceMatchSignal**: An independent signal derived from speaker-embedding cosine similarity, expressed as a match percentage and a SeverityLevel (e.g. "31% similarity — Low").
- **AIVoiceSignal**: An independent signal expressing the likelihood that the caller's audio is synthetic/deepfake, expressed as a synthetic-indicator percentage and a SeverityLevel (e.g. "82% synthetic indicators — Suspicious").
- **ConversationContextSignal**: An independent signal derived from live-transcription scam analysis, expressed as a scam-risk percentage and a SeverityLevel (e.g. "94% — High").
- **SecurityQuestionOutcome**: The result of the security challenge — one of `unanswered`, `correct`, `incorrect`, or `bypassed` (Trust This Call).
- **RiskAssessment**: A data object produced by the RiskEngine containing the four signal values, their SeverityLevels, an OverallRiskLevel, and a human-readable summary banner message.
- **OverallRiskLevel**: The fused risk classification produced by the RiskEngine — one of `low`, `medium`, or `high`.
- **SeverityLevel**: A per-signal classification used for display chips — one of `low`, `suspicious`, `high`, `failed` (as appropriate to the signal).
- **AIVoiceDetectionEndpoint**: The backend `/api/detect-ai-voice` POST endpoint that accepts a WAV file and returns a synthetic-indicator score.
- **CombinedRiskPanel**: A React component that displays all signals side by side (each with a value and a severity chip), a summary banner, and the four user-control action buttons: Continue Call, Mute, End Call, and Report.
- **EscalationStage**: The current stage of the security-escalation narrative — one of `detect`, `suspect`, `identify`, `challenge`, `verify`, `protect`.

---

## Requirements

### Requirement 1: On-Demand Identity Verification Scoped to Unknown Callers

**User Story:** As a VoiceShield user, I want identity verification to run only for unknown callers and only after suspicious behavior is detected and I choose which contact the caller claims to be, so that verification always has a clear reason, known contacts are never disrupted, and I stay in control.

#### Acceptance Criteria

1. WHERE a call's `isUnknown` flag is `false`, THE ActiveCallScreen SHALL NOT initiate any identity verification, SHALL NOT capture snippets for comparison, and SHALL continue operating under the existing known-contact behavior unchanged.
2. WHILE a call's `isUnknown` flag is `true`, THE ActiveCallScreen SHALL run continuous scam and AI-voice monitoring and SHALL set EscalationStage to `detect`.
3. WHEN the ConversationContextSignal RiskScore or the AIVoiceSignal reaches its configured suspicion threshold on an unknown call, THE ActiveCallScreen SHALL advance EscalationStage to `suspect` and SHALL present an identity prompt asking the user to select which EnrolledContact the caller claims to be.
4. THE identity prompt SHALL list the available EnrolledContacts as selectable options and SHALL include an explicit SkipVerification option.
5. WHEN the user selects an EnrolledContact in the identity prompt, THE ActiveCallScreen SHALL advance EscalationStage to `identify`, SHALL set the selected contact as the active FamilyContact, and SHALL initiate the on-demand voice comparison.
6. WHEN the user selects SkipVerification in the identity prompt, THE ActiveCallScreen SHALL set VerificationState to `skipped`, SHALL NOT perform any voice comparison, and SHALL continue the call under normal scam monitoring.
7. THE useVoiceVerification hook SHALL accept the selected FamilyContact as an input parameter at the moment of ClaimedIdentitySelection so the caller identity is established before comparison begins.
8. THE ActiveCallScreen SHALL enter each EscalationStage only after its immediately preceding stage in the order `detect` → `suspect` → `identify` → `challenge` → `verify` → `protect` has completed.
9. IF a stage transition is requested out of the defined order, THEN THE ActiveCallScreen SHALL reject the transition and SHALL retain the current EscalationStage.

---

### Requirement 2: Continuous Rolling Snippet Capture of Caller Audio

**User Story:** As a VoiceShield user, I want the app to continuously capture short snippets of an unknown caller's voice while the call is happening, so that a fresh, clean sample is already available the moment I choose to verify the caller.

#### Acceptance Criteria

1. WHILE an unknown call is in progress, THE VoiceVerificationService SHALL continuously capture short audio snippets of the caller's voice into the RollingSnippetBuffer.
2. THE RollingSnippetBuffer SHALL be bounded and SHALL discard the oldest snippets once its configured bound is reached, so that memory usage does not grow without limit for the duration of the call.
3. WHILE snippet capture is active, THE VoiceVerificationService SHALL retain only the most recent snippets sufficient to assemble at least one FreshSegment of several seconds of caller speech.
4. THE VoiceVerificationService SHALL encode any assembled FreshSegment into a mono RIFF WAV blob using the same WAV encoding used by the enrollment voice-sample recorder, so the blob matches the format expected by the VerifySpeakerEndpoint.
5. THE VoiceVerificationService SHALL capture audio at the native AudioContext sample rate and SHALL produce a mono RIFF WAV blob for each FreshSegment.
6. WHEN the call ends, THE VoiceVerificationService SHALL stop capturing snippets immediately.

---

### Requirement 3: On-Demand Comparison of a Fresh Segment Against the Stored Embedding

**User Story:** As a VoiceShield user, I want the freshly captured caller audio to be compared against the enrolled voice sample of the contact I selected, so that impersonation is surfaced only after I choose to verify.

#### Acceptance Criteria

1. WHEN the user makes a ClaimedIdentitySelection of an EnrolledContact, THE useVoiceVerification hook SHALL select a FreshSegment from the RollingSnippetBuffer and SHALL set VerificationState to `comparing`.
2. WHEN a FreshSegment has been selected, THE useVoiceVerification hook SHALL POST the FreshSegment WAV blob (as `live_audio`) and the selected EnrolledContact's stored SpeakerEmbedding (as `stored_embedding`) to the VerifySpeakerEndpoint at `/api/verify-speaker`.
3. WHEN the VerifySpeakerEndpoint returns a successful response, THE useVoiceVerification hook SHALL parse the `match_percent` and `similarity` fields and SHALL store them in a VoiceVerificationResult.
4. WHEN `match_percent` is greater than or equal to 60, THE useVoiceVerification hook SHALL set VerificationState to `pass` and SHALL set `verified` to `true` in the VoiceVerificationResult.
5. WHEN `match_percent` is less than 60, THE useVoiceVerification hook SHALL set VerificationState to `fail` and SHALL set `verified` to `false` in the VoiceVerificationResult.
6. IF no FreshSegment can be assembled from the RollingSnippetBuffer at the time of selection, THEN THE useVoiceVerification hook SHALL set VerificationState to `skipped` and SHALL forward the remaining signals to the RiskEngine.
7. IF the VerifySpeakerEndpoint returns an HTTP error status, THEN THE useVoiceVerification hook SHALL set VerificationState to `skipped` and SHALL NOT show the security question overlay, so the call is not unnecessarily disrupted by a backend failure.
8. IF the VerifySpeakerEndpoint request times out after 15 seconds, THEN THE useVoiceVerification hook SHALL set VerificationState to `skipped` and SHALL NOT disrupt the call.

---

### Requirement 4: Present Security Question Overlay on Verification Failure

**User Story:** As a VoiceShield user, I want a spoken and visual security challenge to appear when the caller's voice does not match the selected contact, so that I can challenge the caller before sharing any personal information.

#### Acceptance Criteria

1. WHEN VerificationState transitions to `fail`, THE ActiveCallScreen SHALL advance EscalationStage to `challenge` and SHALL invoke the browser's `SpeechSynthesis` API to speak aloud the string: "Possible impersonation detected. [securityQuestion]", where `[securityQuestion]` is the `securityQuestion` field from the selected FamilyContact record, using tentative wording because identity has not yet been confirmed.
2. WHEN VerificationState transitions to `fail`, THE ActiveCallScreen SHALL render the SecurityQuestionOverlay concurrently with (or immediately after) the speech synthesis utterance, displaying the security question text stored in the selected FamilyContact record.
3. WHILE the SecurityQuestionOverlay is visible AND the security challenge has not yet completed, THE ActiveCallScreen SHALL display the match percentage and a tentative message using the wording "⚠️ Possible impersonation" indicating that the caller's voice may not match the selected contact.
4. THE SecurityQuestionOverlay SHALL display a text input field so the user can type an answer, and a confirmation button to submit the answer, so the user can respond by typing if preferred over speaking.
5. THE SecurityQuestionOverlay SHALL provide a "Mark as Scam & End Call" action button that calls the existing `onEndCall` handler, treating a failed verification as a potential scam.
6. THE SecurityQuestionOverlay SHALL provide a "Trust This Call" action button that allows the user to dismiss the overlay and stop monitoring even without a correct answer, so the user retains full control over the call.
7. IF the selected FamilyContact's `securityQuestion` field is empty or blank, THEN THE ActiveCallScreen SHALL substitute the default text "What is your full name?" for both the spoken utterance and the overlay display, so there is always a challenge presented.
8. IF the browser's `SpeechSynthesis` API is unavailable or raises an error, THEN THE ActiveCallScreen SHALL still render the SecurityQuestionOverlay and SHALL NOT block the verification failure flow.

---

### Requirement 5: Stop Monitoring on Caller Verification or Trust Override

**User Story:** As a VoiceShield user, I want transcription and scam monitoring to stop as soon as I confirm the caller is safe — whether by answering the security question or by choosing to trust the call — so that trusted calls are not unnecessarily monitored.

#### Acceptance Criteria

1. WHEN the user submits an answer in the SecurityQuestionOverlay and the submitted text is non-empty, THE SecurityQuestionOverlay SHALL notify the ActiveCallScreen that the security question has been answered.
2. WHEN the security question answer is submitted, THE ActiveCallScreen SHALL dismiss the SecurityQuestionOverlay, SHALL set VerificationState to `pass`, and SHALL call `stopRecording` on the useTranscription hook so that live AWS Transcribe streaming stops and scam prediction polling ceases.
3. WHEN the user clicks "Trust This Call" in the SecurityQuestionOverlay, THE ActiveCallScreen SHALL dismiss the SecurityQuestionOverlay, SHALL set VerificationState to `pass`, and SHALL call `stopRecording` on the useTranscription hook, producing the same outcome as a correct security question answer.
4. THE ActiveCallScreen SHALL display a "Verified ✓" badge in place of the scam risk bar WHILE VerificationState is `pass`, regardless of whether `pass` was reached via voice match, security question answer, or trust override.
5. WHEN VerificationState is `pass` (from voice match, answered security question, or trust override), THE ActiveCallScreen SHALL suppress all further calls to `/api/predict-scam` and `/api/analyze-scam` for the duration of the call.

---

### Requirement 6: Bound and Release Rolling Capture Resources

**User Story:** As a VoiceShield user, I want continuous voice capture to stay within a fixed memory bound and to release everything when the call ends, so that the app does not leak audio resources or re-trigger the overlay unexpectedly.

#### Acceptance Criteria

1. THE useVoiceVerification hook SHALL restrict the RollingSnippetBuffer to a fixed maximum duration or snippet count so that captured audio never exceeds the configured bound.
2. WHEN VerificationState has already reached `pass`, `fail`, or `skipped`, THE useVoiceVerification hook SHALL NOT initiate a new on-demand comparison unless the user makes a new ClaimedIdentitySelection.
3. WHEN the call ends, THE useVoiceVerification hook SHALL release all audio resources, SHALL clear the RollingSnippetBuffer, SHALL cancel any in-flight comparison requests, and SHALL reset VerificationState to `idle`.
4. THE VoiceVerificationService SHALL NOT retain any FreshSegment WAV blob after the blob has been submitted to the VerifySpeakerEndpoint or after the call ends, whichever comes first.

---

### Requirement 7: Backend — Verify a Live WAV Against a Stored Embedding

**User Story:** As a developer, I want the backend to compare a live WAV file against a stored speaker embedding vector directly, so that the frontend does not need to store or re-transmit the original voice sample WAV.

#### Acceptance Criteria

1. THE Backend SHALL expose a POST endpoint at `/api/verify-speaker` that accepts a multipart form with a `live_audio` WAV file field and a `stored_embedding` JSON field containing a SpeakerEmbedding vector.
2. WHEN a valid request is received by `/api/verify-speaker`, THE Backend SHALL compute the ECAPA-TDNN embedding for `live_audio` using the loaded SpeechBrain speaker_model and SHALL compute cosine similarity against the `stored_embedding` vector.
3. WHEN cosine similarity is computed, THE Backend SHALL return a JSON response containing `similarity` (float, -1 to 1), `match_percent` (float, 0 to 100 computed as `(similarity + 1) / 2 * 100` clamped to [0, 100]), and `verified` (boolean, `true` if `match_percent >= 60`).
4. IF `live_audio` is missing or empty, THEN THE Backend SHALL return HTTP 400 with a descriptive error message.
5. IF `stored_embedding` is missing, malformed, or has a dimension that does not match the speaker model output dimension, THEN THE Backend SHALL return HTTP 400 with a descriptive error message.
6. IF the SpeechBrain speaker_model is not loaded, THEN THE Backend SHALL return HTTP 503 with message "Speaker embedding model is not available."
7. THE `/api/verify-speaker` endpoint SHALL process requests within 10 seconds for a 5-second mono 16 kHz WAV file under normal operating conditions.

---

### Requirement 8: Round-Trip Embedding Consistency

**User Story:** As a developer, I want the speaker embedding produced during voice sample enrollment and the embedding produced during live call verification to be consistent, so that genuine callers reliably pass verification.

#### Acceptance Criteria

1. THE Backend SHALL use the same SpeechBrain ECAPA-TDNN model instance for both the `/api/speaker-embedding` endpoint and the `/api/verify-speaker` endpoint so that embeddings are produced by an identical pipeline.
2. FOR ALL valid WAV files processed through `/api/speaker-embedding` and subsequently through `/api/verify-speaker` with the returned embedding, the cosine similarity SHALL be greater than or equal to 0.20 (i.e., the same speaker's two recordings should not be near-opposite in embedding space), ensuring the round-trip is self-consistent.
3. THE useVoiceVerification hook SHALL send the stored SpeakerEmbedding vector (not a reconstructed WAV) to `/api/verify-speaker` so that the original voice sample WAV is never required to be stored on the frontend after initial enrollment.

---

### Requirement 9: Two-Tier Severity Language for Impersonation Wording

**User Story:** As a VoiceShield user, I want the system to use tentative wording before the checks combine and cautious escalated wording afterward — never a claim of confirmed fraud — so that the app stays credible and does not falsely accuse a caller.

#### Acceptance Criteria

1. WHILE identity verification has produced a low VoiceMatchSignal but the SecurityQuestionOutcome is still `unanswered`, THE ActiveCallScreen SHALL use only tentative wording containing the phrase "Possible impersonation" and SHALL NOT use definitive wording such as "impersonation detected" or "confirmed".
2. WHEN both the voice check has completed with a mismatch AND the SecurityQuestionOutcome is `incorrect`, THE ActiveCallScreen SHALL escalate the displayed wording to the phrase "Impersonation risk: HIGH".
3. THE ActiveCallScreen SHALL NOT display any wording that asserts confirmed identity fraud, identity theft, or a definite impersonation at any severity tier.
4. THE ActiveCallScreen SHALL render the tentative wording with a warning icon "⚠️" and the escalated wording with an alert icon "🚨" so the severity tier is visually distinct.
5. WHEN the SecurityQuestionOutcome becomes `correct` or `bypassed`, THE ActiveCallScreen SHALL NOT display any escalated impersonation wording for the remainder of the call.

---

### Requirement 10: Three Independent Signals as First-Class Risk Inputs

**User Story:** As a VoiceShield user, I want the voice match, AI voice detection, and conversation-context signals to be tracked independently, so that no single failing signal is confused with another and the overall assessment reflects all available evidence.

#### Acceptance Criteria

1. THE RiskEngine SHALL accept three independent signals — VoiceMatchSignal, AIVoiceSignal, and ConversationContextSignal — where each signal carries its own numeric value (0–100) and its own SeverityLevel, computed independently of the other signals.
2. THE VoiceMatchSignal SHALL derive its numeric value from the speaker-embedding match percentage returned by the on-demand voice comparison and SHALL map that value to a SeverityLevel of `low`, `suspicious`, or `high` match confidence.
3. THE ConversationContextSignal SHALL derive its numeric value from the live-transcription scam-risk score already produced by the existing scam-detection flow and SHALL map that value to a SeverityLevel.
4. THE AIVoiceSignal SHALL derive its numeric value from the synthetic-indicator score returned by the AIVoiceDetectionEndpoint and SHALL map that value to a SeverityLevel.
5. IF any single signal is unavailable (skipped, errored, or not yet computed), THEN THE RiskEngine SHALL mark that signal as `unavailable` and SHALL compute the OverallRiskLevel from the remaining available signals without failing.

---

### Requirement 11: AI Voice Detection Signal

**User Story:** As a VoiceShield user, I want the app to detect whether an unknown caller's voice appears synthetic or AI-generated, so that deepfake impersonation attempts are surfaced even before a claimed identity is selected.

#### Acceptance Criteria

1. THE Backend SHALL expose a POST endpoint at `/api/detect-ai-voice` that accepts a multipart form with an `audio` WAV file field.
2. WHEN a valid request is received by `/api/detect-ai-voice`, THE Backend SHALL return a JSON response containing `synthetic_percent` (float, 0 to 100) and `severity` (one of `low`, `suspicious`, `high`).
3. WHEN `synthetic_percent` is greater than or equal to 70, THE Backend SHALL set `severity` to `suspicious` or higher, indicating a likely synthetic voice.
4. IF the `audio` field is missing or empty, THEN THE Backend SHALL return HTTP 400 with a descriptive error message.
5. WHEN the AIVoiceDetectionEndpoint returns a successful response, THE useVoiceVerification hook SHALL populate the AIVoiceSignal with the returned `synthetic_percent` and SeverityLevel.
6. IF the AIVoiceDetectionEndpoint returns an HTTP error or times out after 15 seconds, THEN THE useVoiceVerification hook SHALL mark the AIVoiceSignal as `unavailable` and SHALL NOT disrupt the call or the remaining signals.

---

### Requirement 12: Risk Engine Signal Fusion

**User Story:** As a VoiceShield user, I want the three signals and the security-question outcome combined into one overall risk assessment framed as possible impersonation, so that I get a single clear picture instead of four disconnected numbers.

#### Acceptance Criteria

1. THE RiskEngine SHALL produce a RiskAssessment containing all four inputs (VoiceMatchSignal, AIVoiceSignal, ConversationContextSignal, SecurityQuestionOutcome), the SeverityLevel of each of the three signals, an OverallRiskLevel of `low`, `medium`, or `high`, and a non-empty human-readable summary banner message.
2. WHEN evaluating the fusion rules, THE RiskEngine SHALL apply them in the following precedence order and stop at the first rule whose condition is met: (a) SecurityQuestionOutcome is `incorrect`; (b) two or more available signals carry a SeverityLevel of `high` or `suspicious`; (c) exactly one available signal carries a SeverityLevel of `high` or `suspicious`; (d) SecurityQuestionOutcome is `correct` or `bypassed`; (e) no rule applies.
3. IF the SecurityQuestionOutcome is `incorrect`, THEN THE RiskEngine SHALL set OverallRiskLevel to `high` regardless of the values or availability of the three signals.
4. WHEN the SecurityQuestionOutcome is not `incorrect` AND two or more available signals carry a SeverityLevel of `high` or `suspicious`, THE RiskEngine SHALL set OverallRiskLevel to `high`.
5. WHEN the SecurityQuestionOutcome is not `incorrect` AND exactly one available signal carries a SeverityLevel of `high` or `suspicious`, THE RiskEngine SHALL set OverallRiskLevel to `medium`.
6. WHEN the SecurityQuestionOutcome is `correct` or `bypassed` AND fewer than two available signals carry a SeverityLevel of `high` or `suspicious`, THE RiskEngine SHALL set OverallRiskLevel to `low`.
7. WHILE the SecurityQuestionOutcome is `unanswered` AND no available signal carries a SeverityLevel of `high` or `suspicious`, THE RiskEngine SHALL set OverallRiskLevel to `low`.
8. WHEN OverallRiskLevel is `high`, THE RiskEngine SHALL set the summary banner message to "🚨 Possible impersonation — Multiple signals indicate that this caller may not be the person they claim to be." and SHALL NOT assert confirmed fraud or identity theft.
9. WHEN any input to the RiskEngine changes, THE RiskEngine SHALL recompute the RiskAssessment within 500 milliseconds so that the CombinedRiskPanel reflects the current input values.

---

### Requirement 13: Combined Risk Panel and User Actions

**User Story:** As a VoiceShield user, I want to see all the signals side by side with a clear summary and choose what to do, so that I stay in control of a suspicious call.

#### Acceptance Criteria

1. WHEN the EscalationStage reaches `protect`, THE ActiveCallScreen SHALL render the CombinedRiskPanel.
2. THE CombinedRiskPanel SHALL display each available signal as a labeled row containing the signal value and a severity chip, using exactly the labels "VOICE MATCH", "AI VOICE", "SCAM RISK", and "SECURITY QUESTION".
3. THE CombinedRiskPanel SHALL render each severity chip with the SeverityLevel's associated icon and color, for example "⚠️ Low", "⚠️ Suspicious", "🔴 High", and "🔴 Failed".
4. THE CombinedRiskPanel SHALL display the RiskAssessment summary banner message beneath the signal rows.
5. THE CombinedRiskPanel SHALL provide exactly four user-control action buttons labeled "Continue Call", "Mute", "End Call", and "Report".
6. WHEN the user clicks "End Call", THE CombinedRiskPanel SHALL invoke the existing `onEndCall` handler.
7. WHEN the user clicks "Continue Call", THE CombinedRiskPanel SHALL dismiss itself, SHALL retain the current RiskAssessment in recorded state, and SHALL allow the call to proceed.
8. WHEN the user clicks "Mute" WHILE the call microphone is unmuted, THE CombinedRiskPanel SHALL mute the call microphone and SHALL display a muted indicator.
9. WHEN the user clicks "Mute" WHILE the call microphone is muted, THE CombinedRiskPanel SHALL unmute the call microphone and SHALL remove the muted indicator.
10. WHEN the user clicks "Report", THE ActiveCallScreen SHALL record a scam report containing the current RiskAssessment and SHALL display a confirmation to the user.
11. IF recording the scam report fails, THEN THE ActiveCallScreen SHALL display an error message and SHALL retain the CombinedRiskPanel so the user can retry or choose another action.
12. IF a signal is `unavailable`, THEN THE CombinedRiskPanel SHALL render that signal's row with an "unavailable" indicator rather than a numeric value.

---

### Requirement 14: Protected/Caller Screen Toggle and Caller-Recorded Security Answer

**User Story:** As a VoiceShield presenter, I want to toggle between the protected-device view and a caller view where the caller records an answer to the security question, so that I can demonstrate the layered security narrative end to end on shared state.

#### Acceptance Criteria

1. THE VoiceShield frontend SHALL provide a two-way toggle between ScreenView `protected` and ScreenView `caller` that the user can switch in either direction without a page reload.
2. THE two ScreenViews SHALL share the same RiskEngine and VerificationState so that actions on the caller view are immediately reflected on the protected view and vice versa.
3. THE caller view SHALL display scripted caller lines including "Hey, I'm your brother. I need money urgently." and SHALL pose the identity challenge "What was the name of your first school?".
4. THE caller view SHALL provide a control for the caller to record an answer to the active security question rather than a generic voice sample.
5. WHEN the caller records a security-question answer on the caller view, THE VoiceShield frontend SHALL use that recorded answer as an input to the comparison flow and SHALL update the SecurityQuestionOutcome accordingly.
6. WHEN the caller submits a wrong answer to the identity challenge on the caller view, THE VoiceShield frontend SHALL set the SecurityQuestionOutcome to `incorrect`.
7. WHEN the user switches from the caller view back to the protected view, THE protected view SHALL display the current voice comparison result and the combined RiskEngine assessment.
8. WHILE a demo is active, THE protected view SHALL reflect each EscalationStage transition (`detect` → `suspect` → `identify` → `challenge` → `verify` → `protect`) as it occurs.
