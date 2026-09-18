# Design Document — Voice Sample Field for Family Contacts

## Overview

This feature adds a voice-sample recording field to the VoiceShield family-contact form. Most of the implementation is already in place. The remaining work consists of:

1. Extracting the `VoiceSampleRecorder` CSS into its own file (`VoiceSampleRecorder.css`) and importing it from the component so the styles are co-located with the component rather than buried in `ContactsTab.css`.
2. Writing an end-to-end verification test script (`backend/test_speaker_embedding.py`) that posts a synthetic WAV to `/api/speaker-embedding` and validates that the response contains a 192-dimensional embedding vector.
3. Patching any minor integration gaps discovered during the above steps.

## Architecture

### System Components (already implemented)

```
┌─────────────────────────────────┐        ┌───────────────────────────────────┐
│          Browser (React)        │        │        FastAPI Backend             │
│                                 │        │                                   │
│  ContactsTab.tsx                │        │  POST /api/speaker-embedding      │
│    └── ContactForm              │  HTTP  │    - reads multipart WAV           │
│         └── VoiceSampleRecorder ├───────►│    - torchaudio decode/resample   │
│              ├── records 5s WAV │        │    - ECAPA-TDNN encode_batch()    │
│              ├── converts b64   │        │    - returns {embedding, dim}     │
│              └── displays dim   │◄───────┤                                   │
│                                 │  JSON  │  GET /api/health                  │
│  useFamilyContacts.ts           │        │    - speaker_model_loaded: bool   │
│    └── localStorage CRUD        │        │                                   │
│         FamilyContact {         │        │  SpeechBrain ECAPA-TDNN           │
│           voiceSampleBase64,    │        │    - loaded once at startup        │
│           speakerEmbedding      │        │    - cached in model_cache/        │
│         }                       │        │                                   │
└─────────────────────────────────┘        └───────────────────────────────────┘
```

### Data Flow

1. User opens ContactForm → clicks "Start 5-second recording" in VoiceSampleRecorder.
2. Browser requests microphone via `getUserMedia`; on denial, error state is shown.
3. MediaRecorder captures audio for 5 s (or until manual stop). `ondataavailable` accumulates chunks.
4. `onstop` assembles chunks into `audio/wav` Blob, reads it as base64 via `FileReader`.
5. VoiceSampleRecorder POSTs the WAV as `multipart/form-data` to `POST /api/speaker-embedding`.
6. Backend decodes WAV with `torchaudio.load`, resamples to 16 kHz, converts to mono, runs `encode_batch`.
7. Backend returns `{embedding: float[192], embedding_dim: 192}`.
8. VoiceSampleRecorder constructs a `SpeakerEmbedding` object and calls `onEmbeddingReady(base64, embedding)`.
9. ContactForm holds both values in local state until "Save" is clicked.
10. On save, ContactsTab calls `addContact` / `updateContact` which persists the FamilyContact (including `voiceSampleBase64` and `speakerEmbedding`) to localStorage via `useFamilyContacts`.

## File Map

| File | Status | Purpose |
|---|---|---|
| `backend/backend.py` | ✅ Exists | FastAPI app; SpeechBrain startup load; `/api/speaker-embedding` endpoint |
| `backend/requirements.txt` | ✅ Exists | Python dependencies |
| `frontend/src/hooks/useFamilyContacts.ts` | ✅ Exists | `FamilyContact`, `SpeakerEmbedding` types; localStorage CRUD |
| `frontend/src/components/VoiceSampleRecorder.tsx` | ✅ Exists | Recorder UI component |
| `frontend/src/components/ContactsTab.tsx` | ✅ Exists | Family-contacts list + form integration |
| `frontend/src/styles/ContactsTab.css` | ✅ Exists | Contact card + form + voice recorder CSS |
| `frontend/src/styles/VoiceSampleRecorder.css` | ❌ Missing | CSS to be extracted from ContactsTab.css |
| `backend/test_speaker_embedding.py` | ❌ Missing | End-to-end verification test script |

## Component Design

### VoiceSampleRecorder.tsx (existing — no functional changes)

The component already implements the full state machine:

```
idle → recording (0-5 s countdown) → uploading → done
                                               ↘ error
```

Props:
- `onEmbeddingReady(base64: string | null, embedding: SpeakerEmbedding | null)` — fires on success or clear.
- `initialBase64?: string` — pre-populates from an existing contact (edit mode).
- `initialEmbedding?: SpeakerEmbedding` — pre-populates from an existing contact (edit mode).

The only change is to import `VoiceSampleRecorder.css` instead of relying on `ContactsTab.css` for its styles.

### CSS Separation

The voice-recorder CSS classes currently live in `ContactsTab.css` under a clearly delimited section. They will be moved verbatim to `frontend/src/styles/VoiceSampleRecorder.css` and `VoiceSampleRecorder.tsx` will import that file directly. `ContactsTab.css` will retain only the `.contact-voice-badge` style (which belongs to the contact card rendered in `ContactsTab`) and the voice-recorder section will be removed from it.

Classes moving to `VoiceSampleRecorder.css`:
- `.voice-recorder`
- `.voice-recorder-label`
- `.voice-recorder-hint`
- `.voice-btn` (and `.record`, `.stop`, `.clear` modifiers)
- `.voice-recording-row`
- `.voice-recording-pulse` + `@keyframes pulse-red`
- `.voice-recording-countdown`
- `.voice-uploading`
- `.voice-spinner` + `@keyframes spin`
- `.voice-done-row`
- `.voice-done-text`
- `.voice-done-icon`
- `.voice-error-row`

### Backend Verification Script

`backend/test_speaker_embedding.py` is a standalone Python script (not a pytest suite) that:

1. Generates a 5-second silent 16 kHz mono WAV in memory using only the stdlib `wave` module.
2. POSTs the WAV to `http://localhost:5000/api/speaker-embedding` using `httpx` (already in `requirements.txt`).
3. Asserts the response status is 200.
4. Asserts `embedding_dim == 192`.
5. Asserts `len(embedding) == 192`.
6. Asserts all 192 values are finite floats.
7. Prints a formatted summary: embedding dimension, min/max/mean of the vector, and a PASS/FAIL verdict.

The script exits with code 0 on PASS, 1 on FAIL, so it can be incorporated into CI.

## Correctness Properties

No universal mathematical invariants are applicable to UI state-machine code or HTTP integration tests. The verification script covers the functional correctness of the embedding endpoint directly.

## Dependencies

### Backend
All dependencies are already present in `backend/requirements.txt`:
- `fastapi`, `uvicorn` — HTTP server
- `speechbrain` — ECAPA-TDNN model
- `torch`, `torchaudio` — waveform processing
- `httpx` — used in test script (already listed)

### Frontend
All dependencies are present in `frontend/package.json`. No new packages required.

## Error Handling

| Scenario | Behaviour |
|---|---|
| Microphone denied | VoiceSampleRecorder → `error` state, message "Microphone access denied" |
| Backend HTTP error | VoiceSampleRecorder → `error` state, message from `detail` field |
| `speaker_model` is None | Backend returns HTTP 503 |
| Network unreachable | `fetch` rejects → VoiceSampleRecorder → `error` state, message from Error |
| Empty audio file | Backend returns HTTP 400 "Empty audio file" |
