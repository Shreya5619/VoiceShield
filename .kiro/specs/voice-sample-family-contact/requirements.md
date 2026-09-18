# Requirements Document

## Introduction

This feature adds a voice sample field to the VoiceShield family member contact form. When a user adds or edits a family contact, they can optionally record a 5-second voice sample (prompted to say "hello world"). The recording is encoded as base64 WAV and stored in localStorage alongside other contact details. The recording is also sent to the FastAPI backend, where a SpeechBrain ECAPA-TDNN model generates a 192-dimensional speaker embedding vector. The embedding is returned to the frontend and stored with the contact in localStorage. The speaker embeddings enable downstream caller-identity verification during active calls.

## Glossary

- **VoiceSampleRecorder**: The frontend React component that manages microphone access, 5-second countdown recording, WAV blob assembly, upload to the backend, and display of the embedding result.
- **ContactForm**: The inline React form rendered in ContactsTab for adding or editing a FamilyContact, which hosts the VoiceSampleRecorder field.
- **ContactsTab**: The frontend page component that renders the family-contacts list and embeds ContactForm for add/edit operations.
- **FamilyContact**: The data record stored in localStorage representing a family member, containing fields: id, name, relation, phone, securityQuestion, voiceSampleBase64, and speakerEmbedding.
- **SpeakerEmbedding**: A JavaScript object containing a 192-element float vector, the dimension count (192), and an ISO timestamp of generation.
- **Backend**: The FastAPI server in `backend/backend.py` running on port 5000.
- **EmbeddingEndpoint**: The HTTP POST endpoint at `/api/speaker-embedding` on the Backend that accepts a multipart WAV upload and returns a speaker embedding.
- **SpeechBrainModel**: The ECAPA-TDNN speaker-encoder model (`speechbrain/spkrec-ecapa-voxceleb`) loaded by the Backend at startup and cached in `backend/model_cache/`.
- **ModelCache**: The local filesystem directory `backend/model_cache/spkrec-ecapa-voxceleb` where the SpeechBrain model weights are persisted after the first download.
- **localStorage**: The browser's Web Storage API used by the frontend to persist FamilyContact records across page reloads.

## Requirements

### Requirement 1 — Voice Sample Recording Field in Contact Form

**User Story:** As a VoiceShield user, I want to record a short voice sample when saving a family contact, so that VoiceShield can later identify that person's voice during an active call.

#### Acceptance Criteria

1. THE ContactForm SHALL include a VoiceSampleRecorder field labeled "Voice Sample" that is visually distinct from the other text fields and marked as optional.
2. WHEN the user activates the VoiceSampleRecorder, THE VoiceSampleRecorder SHALL request microphone permission via the browser's `navigator.mediaDevices.getUserMedia` API before capturing any audio.
3. IF the user denies microphone permission, THEN THE VoiceSampleRecorder SHALL display an error message reading "Microphone access denied" and return to the idle state without capturing audio.
4. WHEN the user starts a recording, THE VoiceSampleRecorder SHALL display a real-time countdown from 5 to 0 seconds, updated once per second.
5. WHEN the 5-second recording duration elapses, THE VoiceSampleRecorder SHALL automatically stop recording without requiring user interaction.
6. WHILE a recording is in progress, THE VoiceSampleRecorder SHALL provide a manual stop control that ends the recording immediately when activated.
7. THE VoiceSampleRecorder SHALL prompt the user to say "hello world" during the recording session.
8. WHEN editing an existing FamilyContact that already has a voice sample, THE ContactForm SHALL pre-populate the VoiceSampleRecorder with the existing voiceSampleBase64 and speakerEmbedding data, displaying the "done" state rather than the idle state.
9. THE ContactForm SHALL allow the user to clear a recorded voice sample via a dedicated clear control on the VoiceSampleRecorder, returning the recorder to the idle state.

---

### Requirement 2 — WAV Encoding and Base64 Storage

**User Story:** As a VoiceShield user, I want my recorded voice sample to be stored locally with my contact details, so that VoiceShield retains it across page reloads without relying on a remote database.

#### Acceptance Criteria

1. WHEN a recording session ends, THE VoiceSampleRecorder SHALL assemble the captured audio chunks into a single WAV-format Blob using MIME type `audio/wav`.
2. WHEN a WAV Blob is assembled, THE VoiceSampleRecorder SHALL encode the Blob to a base64 string by reading it with the browser's `FileReader.readAsDataURL` API and stripping the data-URL prefix, retaining only the raw base64 payload.
3. WHEN the user saves a ContactForm that contains a voice sample, THE ContactsTab SHALL persist the voiceSampleBase64 string to localStorage as part of the FamilyContact record under the storage key `voiceshield_contacts`.
4. THE FamilyContact stored in localStorage SHALL include the voiceSampleBase64 field only when a voice sample has been successfully recorded; contacts without a voice sample SHALL omit the field.
5. WHEN the localStorage record is reloaded by the useFamilyContacts hook on the next page load, THE ContactsTab SHALL restore the voiceSampleBase64 value to the FamilyContact without data loss or corruption.

---

### Requirement 3 — Speaker Embedding Generation via Backend

**User Story:** As a VoiceShield user, I want a speaker embedding to be automatically generated from my family member's voice sample, so that VoiceShield can use it for voice-identity verification.

#### Acceptance Criteria

1. WHEN a WAV Blob is assembled from a completed recording, THE VoiceSampleRecorder SHALL POST the WAV to the EmbeddingEndpoint at `http://localhost:5000/api/speaker-embedding` as a multipart/form-data request with the field name `audio`.
2. WHEN the EmbeddingEndpoint receives a valid WAV file, THE Backend SHALL decode the audio with `torchaudio.load`, resample to 16,000 Hz if the source sample rate differs, and convert to mono before passing the waveform to the SpeechBrainModel.
3. WHEN the SpeechBrainModel processes the waveform, THE Backend SHALL return a JSON response with fields `embedding` (a JSON array of 192 floating-point values) and `embedding_dim` (the integer 192).
4. IF the EmbeddingEndpoint returns a non-2xx HTTP status, THEN THE VoiceSampleRecorder SHALL display an error message containing the detail string from the response body and offer a retry control.
5. WHEN the EmbeddingEndpoint returns a successful response, THE VoiceSampleRecorder SHALL construct a SpeakerEmbedding object with `vector` set to the returned array, `dim` set to `embedding_dim`, and `generatedAt` set to the ISO 8601 timestamp of the response receipt.
6. WHEN the SpeakerEmbedding is constructed, THE VoiceSampleRecorder SHALL invoke the `onEmbeddingReady` callback with the base64 WAV string and the SpeakerEmbedding object, making both available to the parent ContactForm.
7. WHILE the VoiceSampleRecorder is awaiting the EmbeddingEndpoint response, THE VoiceSampleRecorder SHALL display an uploading state indicator reading "Generating speaker embedding…".

---

### Requirement 4 — SpeechBrain Model Loading and Caching at Startup

**User Story:** As a VoiceShield operator, I want the SpeechBrain model to load once at server startup and reuse a local cache for subsequent starts, so that embedding requests are handled quickly without repeated downloads.

#### Acceptance Criteria

1. WHEN the Backend process starts, THE Backend SHALL attempt to load the SpeechBrainModel using `EncoderClassifier.from_hparams` with source `speechbrain/spkrec-ecapa-voxceleb` and savedir pointing to the ModelCache directory.
2. WHEN the SpeechBrainModel is successfully loaded at startup, THE Backend SHALL log the message "✓ SpeechBrain speaker encoder loaded successfully" to standard output.
3. IF the SpeechBrainModel fails to load at startup, THEN THE Backend SHALL log the error to standard error, set the internal `speaker_model` reference to `None`, and continue serving other API endpoints without crashing.
4. IF a request reaches the EmbeddingEndpoint and `speaker_model` is `None`, THEN THE Backend SHALL return HTTP 503 with detail "Speaker embedding model is not available. Check server logs."
5. WHERE the ModelCache directory already contains the downloaded model weights, THE Backend SHALL load the SpeechBrainModel from the ModelCache without downloading from HuggingFace.
6. THE Backend SHALL run the SpeechBrainModel on the CPU using `run_opts={"device": "cpu"}` so that the feature operates on machines without a GPU.

---

### Requirement 5 — Speaker Embedding Persistence in localStorage

**User Story:** As a VoiceShield user, I want the generated speaker embedding to be stored with my family contact, so that voice-identity comparisons can be performed offline without re-generating the embedding.

#### Acceptance Criteria

1. WHEN the VoiceSampleRecorder invokes `onEmbeddingReady` with a non-null SpeakerEmbedding, THE ContactForm SHALL hold the SpeakerEmbedding in local state until the user submits or cancels the form.
2. WHEN the user saves a ContactForm with a non-null SpeakerEmbedding, THE ContactsTab SHALL persist the SpeakerEmbedding object (containing `vector`, `dim`, and `generatedAt`) to localStorage as part of the FamilyContact record.
3. THE FamilyContact stored in localStorage SHALL include the speakerEmbedding field only when an embedding has been successfully generated; contacts without an embedding SHALL omit the field.
4. WHEN the useFamilyContacts hook restores a FamilyContact from localStorage on page load, THE ContactsTab SHALL surface the SpeakerEmbedding object intact, with all 192 vector values, the dim integer, and the generatedAt string preserved.
5. WHEN a FamilyContact with a speakerEmbedding is displayed in the contacts list, THE ContactsTab SHALL render a "🎙️ Voice sample on file" badge on the contact card, with a tooltip showing the embedding dimension and generatedAt timestamp.
6. WHEN the user clears the voice sample in an edit form and saves, THE ContactsTab SHALL update the FamilyContact in localStorage to remove both the voiceSampleBase64 and speakerEmbedding fields.

---

### Requirement 6 — Embedding Verification

**User Story:** As a VoiceShield developer, I want to verify that embeddings are being generated correctly by the backend and returned to the frontend, so that I can confirm the integration is working end to end before deployment.

#### Acceptance Criteria

1. WHEN the EmbeddingEndpoint processes a valid WAV file, THE Backend SHALL return an `embedding` array containing exactly 192 floating-point values.
2. WHEN the EmbeddingEndpoint returns a response, THE Backend SHALL set `embedding_dim` equal to the length of the returned `embedding` array, confirming the two values are consistent.
3. WHEN the VoiceSampleRecorder receives a successful embedding response, THE VoiceSampleRecorder SHALL display the embedding dimension (e.g., "192d embedding") in the done-state UI, giving the user visible confirmation that the embedding was generated.
4. THE Backend `/health` endpoint SHALL include a `speaker_model_loaded` boolean field in its response, reflecting whether the SpeechBrainModel is currently active, so that operators can confirm model readiness without making an embedding request.
