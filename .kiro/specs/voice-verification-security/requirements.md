# Requirements Document

## Introduction

This feature adds voice verification and security questioning to VoiceShield's family member call flow. When a call is placed with a known family contact, the system captures the caller's live audio during the first 30 seconds, computes a speaker embedding, and compares it against the stored embedding for that contact. If the cosine similarity falls below a 60% match threshold, a security question overlay is displayed, pausing the call context. If the caller correctly answers the security question, the call is verified, the overlay is dismissed, and live transcription stops (the call proceeds normally without further scam monitoring). Unknown caller calls are unaffected by this feature.

## Glossary

- **VoiceShield**: The application as a whole — the React/TypeScript frontend plus the Python FastAPI backend.
- **ActiveCallScreen**: The React component that manages the in-call UI, scam risk bar, transcription, and overlays.
- **VoiceVerificationService**: A new frontend service responsible for capturing the first 30 seconds of call audio, computing a live speaker embedding, and returning a similarity score.
- **SecurityQuestionOverlay**: A new React component (modal overlay) that presents the stored security question for the active contact and accepts a text or voice answer from the user.
- **SpeakerEmbedding**: A 192-dimensional float vector produced by the SpeechBrain ECAPA-TDNN model representing a speaker's vocal characteristics.
- **VoiceVerificationResult**: A data object containing `matchPercent` (0–100), `similarity` (cosine similarity, -1 to 1), and `verified` (boolean).
- **FamilyContact**: A stored contact record containing name, relation, phone, security question text, and an optional SpeakerEmbedding.
- **VerificationState**: The lifecycle state of voice verification — one of `idle`, `sampling`, `comparing`, `pass`, `fail`, `skipped`.
- **useVoiceVerification**: A new React hook that orchestrates the voice-sampling window, backend comparison, and returns the current VerificationState and VoiceVerificationResult.
- **CompareVoicesEndpoint**: The existing `/api/compare-voices` POST endpoint that accepts two WAV files and returns cosine similarity and match percentage.
- **SimilarityThreshold**: The minimum match percentage (60%) below which voice verification is considered a failure, triggering the security question overlay.
- **VerificationWindow**: The first 30 seconds of a family member call during which voice sampling and comparison take place.
- **SpeechSynthesis**: The browser's built-in `window.speechSynthesis` Web Speech API used to speak security challenge text aloud when a voice mismatch is detected.

---

## Requirements

### Requirement 1: Trigger Voice Verification Only for Known Family Contacts

**User Story:** As a VoiceShield user, I want voice verification to run only when I receive a call from a saved family contact with a stored voice sample, so that unknown callers are unaffected and the feature does not interfere with the existing scam detection flow.

#### Acceptance Criteria

1. WHEN a call starts with a caller whose `isUnknown` flag is `true`, THE ActiveCallScreen SHALL NOT initiate voice verification and SHALL continue operating under the existing scam detection flow.
2. WHEN a call starts with a caller whose `isUnknown` flag is `false` and whose corresponding FamilyContact record contains a SpeakerEmbedding, THE ActiveCallScreen SHALL initiate voice verification by entering the `sampling` VerificationState.
3. WHEN a call starts with a caller whose `isUnknown` flag is `false` and whose corresponding FamilyContact record does NOT contain a SpeakerEmbedding, THE ActiveCallScreen SHALL skip voice verification and set VerificationState to `skipped`.
4. THE useVoiceVerification hook SHALL accept the active FamilyContact as an input parameter so the caller identity is established before sampling begins.

---

### Requirement 2: Capture Call Audio During the Verification Window

**User Story:** As a VoiceShield user, I want the app to capture the caller's voice during the first 30 seconds of the call, so that enough audio is available to produce a reliable speaker embedding for comparison.

#### Acceptance Criteria

1. WHEN voice verification is initiated, THE VoiceVerificationService SHALL begin capturing microphone audio immediately at call start and SHALL continue for a maximum of 30 seconds.
2. WHEN the VerificationWindow elapses (30 seconds have passed since call start), THE VoiceVerificationService SHALL stop capturing audio and SHALL encode the captured samples into a WAV blob using the same RIFF WAV encoding used by VoiceSampleRecorder.
3. WHILE voice verification is in the `sampling` state, THE ActiveCallScreen SHALL display a visible sampling indicator to the user so the user knows voice comparison is in progress.
4. IF the user ends the call before 30 seconds have elapsed, THE VoiceVerificationService SHALL stop capturing audio immediately and SHALL NOT submit a comparison request.
5. THE VoiceVerificationService SHALL capture audio at the native AudioContext sample rate and SHALL produce a mono RIFF WAV blob, matching the format expected by the CompareVoicesEndpoint.

---

### Requirement 3: Compare Live Voice Against Stored Embedding

**User Story:** As a VoiceShield user, I want the live call audio to be automatically compared against the stored voice sample of the expected family member, so that impersonation is detected without manual intervention.

#### Acceptance Criteria

1. WHEN the VerificationWindow elapses and a WAV blob has been captured, THE useVoiceVerification hook SHALL POST both the captured WAV blob (as `audio_b`) and a WAV blob derived from the stored SpeakerEmbedding (as `audio_a`) to the CompareVoicesEndpoint at `/api/compare-voices`.
2. WHEN the CompareVoicesEndpoint returns a successful response, THE useVoiceVerification hook SHALL parse the `match_percent` and `similarity` fields and SHALL store them in a VoiceVerificationResult.
3. WHEN `match_percent` is greater than or equal to 60, THE useVoiceVerification hook SHALL set VerificationState to `pass` and SHALL set `verified` to `true` in the VoiceVerificationResult.
4. WHEN `match_percent` is less than 60, THE useVoiceVerification hook SHALL set VerificationState to `fail` and SHALL set `verified` to `false` in the VoiceVerificationResult.
5. IF the CompareVoicesEndpoint returns an HTTP error status, THEN THE useVoiceVerification hook SHALL set VerificationState to `skipped` and SHALL NOT show the security question overlay, so the call is not unnecessarily disrupted by a backend failure.
6. IF the CompareVoicesEndpoint request times out after 15 seconds, THEN THE useVoiceVerification hook SHALL set VerificationState to `skipped` and SHALL NOT disrupt the call.

---

### Requirement 4: Present Security Question Overlay on Verification Failure

**User Story:** As a VoiceShield user, I want a spoken and visual security challenge to appear when the caller's voice does not match the expected family member, so that I can challenge the caller before sharing any personal information.

#### Acceptance Criteria

1. WHEN VerificationState transitions to `fail`, THE ActiveCallScreen SHALL invoke the browser's `SpeechSynthesis` API to speak aloud the string: "Voice mismatch detected. [securityQuestion]", where `[securityQuestion]` is the `securityQuestion` field from the active FamilyContact record.
2. WHEN VerificationState transitions to `fail`, THE ActiveCallScreen SHALL render the SecurityQuestionOverlay concurrently with (or immediately after) the speech synthesis utterance, displaying the security question text stored in the active FamilyContact record.
3. WHILE the SecurityQuestionOverlay is visible, THE ActiveCallScreen SHALL display the match percentage and a message indicating that the caller's voice did not match the expected profile.
4. THE SecurityQuestionOverlay SHALL display a text input field so the user can type an answer, and a confirmation button to submit the answer, so the user can respond by typing if preferred over speaking.
5. THE SecurityQuestionOverlay SHALL provide a "Mark as Scam & End Call" action button that calls the existing `onEndCall` handler, treating a failed verification as a potential scam.
6. THE SecurityQuestionOverlay SHALL provide a "Trust This Call" action button that allows the user to dismiss the overlay and stop transcription even without a correct answer, so the user retains full control over the call.
7. IF the active FamilyContact's `securityQuestion` field is empty or blank, THEN THE ActiveCallScreen SHALL substitute the default text "What is your full name?" for both the spoken utterance and the overlay display, so there is always a challenge presented.
8. IF the browser's `SpeechSynthesis` API is unavailable or raises an error, THEN THE ActiveCallScreen SHALL still render the SecurityQuestionOverlay and SHALL NOT block the verification failure flow.

---

### Requirement 5: Stop Transcription on Caller Verification or Trust Override

**User Story:** As a VoiceShield user, I want transcription and scam monitoring to stop as soon as I confirm the caller is safe — whether by answering the security question or by choosing to trust the call — so that verified calls are not unnecessarily monitored.

#### Acceptance Criteria

1. WHEN the user submits an answer in the SecurityQuestionOverlay and the submitted text is non-empty, THE SecurityQuestionOverlay SHALL notify the ActiveCallScreen that the security question has been answered.
2. WHEN the security question answer is submitted, THE ActiveCallScreen SHALL dismiss the SecurityQuestionOverlay, SHALL set VerificationState to `pass`, and SHALL call `stopRecording` on the useTranscription hook so that live AWS Transcribe streaming stops and scam prediction polling ceases.
3. WHEN the user clicks "Trust This Call" in the SecurityQuestionOverlay, THE ActiveCallScreen SHALL dismiss the SecurityQuestionOverlay, SHALL set VerificationState to `pass`, and SHALL call `stopRecording` on the useTranscription hook, producing the same outcome as a correct security question answer.
4. THE ActiveCallScreen SHALL display a "Verified ✓" badge in place of the scam risk bar WHILE VerificationState is `pass`, regardless of whether `pass` was reached via voice match, security question answer, or trust override.
5. WHEN VerificationState is `pass` (from voice match, answered security question, or trust override), THE ActiveCallScreen SHALL suppress all further calls to `/api/predict-scam` and `/api/analyze-scam` for the duration of the call.

---

### Requirement 6: Limit Voice Verification to the Verification Window

**User Story:** As a VoiceShield user, I want voice comparison to occur only during the first 30 seconds of a family member call, so that the system does not continuously consume audio resources or re-trigger the overlay mid-call.

#### Acceptance Criteria

1. THE useVoiceVerification hook SHALL track elapsed call time from the moment voice verification is initiated and SHALL automatically transition out of the `sampling` state after exactly 30 seconds.
2. WHEN VerificationState has already reached `pass`, `fail`, or `skipped`, THE useVoiceVerification hook SHALL NOT restart sampling or comparison regardless of elapsed time.
3. WHEN the call ends, THE useVoiceVerification hook SHALL release all audio resources, cancel any in-flight comparison requests, and reset VerificationState to `idle`.
4. THE VoiceVerificationService SHALL NOT hold audio samples in memory after the WAV blob has been submitted to the CompareVoicesEndpoint or after the call ends, whichever comes first.

---

### Requirement 7: Backend — Reconstruct WAV from Stored Embedding for Comparison

**User Story:** As a developer, I want the backend to support comparing a live WAV file against a stored speaker embedding vector directly, so that the frontend does not need to store or re-transmit the original voice sample WAV.

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

**User Story:** As a developer, I want the speaker embedding produced during voice sample recording and the embedding produced during live call verification to be consistent, so that genuine callers reliably pass verification.

#### Acceptance Criteria

1. THE Backend SHALL use the same SpeechBrain ECAPA-TDNN model instance for both the `/api/speaker-embedding` endpoint and the `/api/verify-speaker` endpoint so that embeddings are produced by an identical pipeline.
2. FOR ALL valid WAV files processed through `/api/speaker-embedding` and subsequently through `/api/verify-speaker` with the returned embedding, the cosine similarity SHALL be greater than or equal to 0.20 (i.e., the same speaker's two recordings should not be near-opposite in embedding space), ensuring the round-trip is self-consistent.
3. THE useVoiceVerification hook SHALL send the stored SpeakerEmbedding vector (not a reconstructed WAV) to `/api/verify-speaker` so that the original voice sample WAV is never required to be stored on the frontend after initial enrollment.
