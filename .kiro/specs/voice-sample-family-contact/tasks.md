# Implementation Plan: Voice Sample Field for Family Contacts

## Overview

Most of the implementation is already in place. The remaining tasks focus on three areas: (1) extracting the VoiceSampleRecorder CSS into its own file so styles are co-located with the component, (2) writing an end-to-end verification test script for the backend embedding endpoint, and (3) a final integration checkpoint.

## Tasks

- [ ] 1. Extract VoiceSampleRecorder CSS into a dedicated stylesheet
  - [ ] 1.1 Create `frontend/src/styles/VoiceSampleRecorder.css` with the voice-recorder styles
    - Copy all `.voice-*` CSS classes and their keyframe animations from `frontend/src/styles/ContactsTab.css` into the new file
    - Classes to include: `.voice-recorder`, `.voice-recorder-label`, `.voice-recorder-hint`, `.voice-btn` (and `.record`, `.stop`, `.clear` modifiers), `.voice-recording-row`, `.voice-recording-pulse`, `@keyframes pulse-red`, `.voice-recording-countdown`, `.voice-uploading`, `.voice-spinner`, `@keyframes spin`, `.voice-done-row`, `.voice-done-text`, `.voice-done-icon`, `.voice-error-row`
    - _Requirements: 1.1, 1.7_

  - [ ] 1.2 Add the CSS import to `VoiceSampleRecorder.tsx` and remove the voice-recorder section from `ContactsTab.css`
    - Add `import '../styles/VoiceSampleRecorder.css'` at the top of `frontend/src/components/VoiceSampleRecorder.tsx`
    - Remove the `/* ── Voice Sample Recorder … */` section from `frontend/src/styles/ContactsTab.css` (retain `.contact-voice-badge` in `ContactsTab.css`)
    - _Requirements: 1.1_

- [ ] 2. Write backend embedding verification test script
  - [ ] 2.1 Create `backend/test_speaker_embedding.py`
    - Generate a 5-second silent 16 kHz mono WAV in memory using the stdlib `wave` module (no external audio files needed)
    - POST the WAV to `http://localhost:5000/api/speaker-embedding` as multipart/form-data using `httpx`
    - Assert response status is 200
    - Assert `embedding_dim == 192` and `len(embedding) == 192`
    - Assert all 192 values are finite floats (no NaN/Inf)
    - Print formatted summary: embedding dimension, min/max/mean of the vector, PASS/FAIL verdict
    - Exit with code 0 on PASS, 1 on FAIL
    - _Requirements: 6.1, 6.2, 6.4_

  - [ ]* 2.2 Write unit tests for the WAV-generation helper in the test script
    - Verify the generated WAV has the correct sample rate (16 000 Hz), mono channel count, and byte length consistent with 5 seconds of audio
    - _Requirements: 6.1_

- [ ] 3. Checkpoint — verify integration end to end
  - Ensure all frontend TypeScript compiles without errors (`tsc --noEmit` in `frontend/`)
  - Ensure the backend starts and logs "✓ SpeechBrain speaker encoder loaded successfully"
  - Run `python backend/test_speaker_embedding.py` with the backend running and confirm PASS output showing 192d embedding
  - Ask the user if any questions arise before proceeding.

## Notes

- Tasks marked with `*` are optional and can be skipped for a faster MVP
- Task 1 is a pure CSS refactor — zero functional change, safe to do first
- Task 2.1 requires the backend to be running on port 5000; the script exits 1 if the server is unreachable
- The `httpx` package is already listed in `backend/requirements.txt`
- No new npm packages are required for the frontend

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "2.1"] },
    { "id": 1, "tasks": ["1.2", "2.2"] }
  ]
}
```
