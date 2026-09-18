# Implementation Plan: Bedrock AgentCore Scam Analysis

## Overview

Implement the three-layer scam analysis extension: the AgentCore Service (FastAPI + Strands agent on port 8080), the Prediction Proxy route on the existing backend, and the `ScamAnalysisPanel` React component. Tasks are ordered so the AgentCore service is built and locally validated before the backend proxy or frontend are wired to it.

## Tasks

- [x] 1. Set up AgentCore directory structure and dependencies
  - Create the `agentcore/` directory at the workspace root
  - Create `agentcore/requirements.txt` with pinned exact versions for `fastapi==0.115.5`, `uvicorn==0.32.1`, `strands-agents==0.1.7`, `boto3==1.35.71`, `pydantic==2.10.3`, `httpx==0.28.1`, `hypothesis==6.119.4`, `pytest==8.3.4`, `pytest-asyncio==0.24.0`
  - Create `agentcore/.env.example` listing all five required env var names (`AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION`, `BEDROCK_MODEL_ID`, `AGENTCORE_INVOCATION_URL`) with placeholder values and no real credentials
  - Update `.gitignore` to include `agentcore/*.env` and `agentcore/.env`
  - _Requirements: 4.5, 5.5, 5.6_

- [x] 2. Implement AgentCore Service (`agentcore/agent.py`)
  - [x] 2.1 Implement startup env var validation and FastAPI app skeleton
    - Create `agentcore/agent.py` with a FastAPI app instance
    - On startup, read and validate `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION`, `BEDROCK_MODEL_ID`; log missing variable name and `sys.exit(1)` if any are missing or empty
    - Implement `GET /ping` returning `{"status": "healthy"}` with HTTP 200
    - _Requirements: 1.1, 1.4, 5.1, 5.2, 5.3_

  - [x] 2.2 Implement Pydantic models and input validation
    - Define `PredictionInput`, `InvocationRequest`, and `AnalysisResponse` Pydantic models as specified in the design
    - Add `field_validator` on `scam_probability` to enforce `[0.0, 1.0]` range, returning HTTP 400 with `{"detail": "scam_probability must be a float in [0.0, 1.0]"}` on violation
    - Wire FastAPI to return HTTP 415 when `Content-Type` is not `application/json` and HTTP 422 for missing required fields
    - _Requirements: 1.2, 1.3, 2.8_

  - [x] 2.3 Implement `compute_risk_level` and Strands agent invocation
    - Implement `compute_risk_level(scam_probability: float) -> str` using the four threshold bands (CRITICAL/HIGH/MEDIUM/LOW)
    - Initialise a Strands `Agent` using the `BEDROCK_MODEL_ID` env var via `boto3`
    - Construct the prompt template from the design document, embedding `scam_probability`, `confidence_level`, `triggers_detected`, and `transcript`
    - Parse the LLM JSON response into an `AnalysisResponse`, attach the computed `risk_level`
    - _Requirements: 2.1, 2.2, 2.3, 2.4_

  - [x] 2.4 Implement retry logic with exponential back-off
    - Implement `invoke_with_retry` as specified in the design: up to 3 retries with 1 s → 2 s → 4 s delays on `ThrottlingException` or `ServiceUnavailableException`
    - After all retries are exhausted, return HTTP 503 with `{"error": "<message>"}`
    - Wire retry function into the `POST /invocations` handler
    - _Requirements: 2.5, 2.6_

  - [x] 2.5 Complete `POST /invocations` handler
    - Wire models, `compute_risk_level`, and `invoke_with_retry` together in the endpoint
    - Return HTTP 200 with the `AnalysisResponse` JSON on success
    - Ensure response time is within 30 seconds for transcripts up to 5000 characters (use `asyncio.wait_for` with a 28 s inner timeout leaving headroom)
    - _Requirements: 1.6, 2.7_

  - [ ]* 2.6 Write property test for `compute_risk_level` (Property 1)
    - **Property 1: Risk level is a pure function of scam_probability**
    - Use `hypothesis` `@given(st.floats(min_value=0.0, max_value=1.0))` to verify the four threshold bands for all floats in `[0.0, 1.0]`
    - **Validates: Requirements 2.4**

  - [ ]* 2.7 Write property test for invalid scam_probability rejection (Property 2)
    - **Property 2: Invalid scam_probability is rejected before Bedrock is invoked**
    - Use `hypothesis` with floats outside `[0.0, 1.0]` and non-numeric inputs; assert HTTP 400 and mock Bedrock client never called
    - **Validates: Requirements 2.8**

  - [ ]* 2.8 Write property test for Content-Type enforcement (Property 3)
    - **Property 3: Non-JSON Content-Type always yields 415**
    - Use `hypothesis` `@given(st.text())` filtered to exclude `"application/json"`; assert every such request returns 415
    - **Validates: Requirements 1.2**

  - [ ]* 2.9 Write property test for missing field validation (Property 4)
    - **Property 4: Missing required fields yield 422 with named fields**
    - Generate all combinations of missing `transcript` / `prediction`; assert 422 and `detail` array names each missing field
    - **Validates: Requirements 1.3**

  - [ ]* 2.10 Write unit tests for retry logic and exhaust-retry path
    - Mock `ThrottlingException` failing 1×, 2×, 3× then succeeding; verify attempt count and delay sequence using `unittest.mock` + `pytest-asyncio`
    - Mock always-failing Bedrock; verify HTTP 503 response
    - _Requirements: 2.5, 2.6_

- [x] 3. Create AgentCore Dockerfile
  - Create `agentcore/Dockerfile` with `FROM --platform=linux/arm64 python:3.12-slim`
  - Copy `requirements.txt` first, run `pip install --no-cache-dir -r requirements.txt`, then copy application code
  - Add `EXPOSE 8080`
  - Set entrypoint: `["uvicorn", "agent:app", "--host", "0.0.0.0", "--port", "8080"]`
  - _Requirements: 4.1, 4.2, 4.3, 4.4_

- [x] 4. Create local test script (`agentcore/test_agent.py`)
  - Write a standalone Python script that sends a realistic sample payload (high-`scam_probability` prediction + multi-sentence transcript) to `http://localhost:8080/invocations` via `httpx`
  - Assert the response is HTTP 200 and the body contains `summary`, `verification_questions` (list of ≥ 3 items), and a valid `risk_level` string
  - Include a `GET /ping` health check before the main invocation
  - Print a clear pass/fail summary to stdout
  - _Requirements: 1.1, 1.6, 2.1, 2.2, 2.3, 2.4_

- [ ] 5. Checkpoint — Run `agentcore/test_agent.py` against a locally started AgentCore service
  - Start `agentcore/agent.py` locally (e.g., `uvicorn agentcore.agent:app --port 8080`) with real env vars populated
  - Execute `python agentcore/test_agent.py` and confirm all assertions pass
  - Ensure all tests pass; ask the user if questions arise.

- [ ] 6. Add `POST /api/analyze-scam` to backend (`backend/backend.py`)
  - [ ] 6.1 Add startup validation for `AGENTCORE_INVOCATION_URL` and `httpx` client
    - Import `httpx` and `os`; on startup read `AGENTCORE_INVOCATION_URL`, log and `sys.exit(1)` if missing or empty
    - Initialise a shared `httpx.AsyncClient` with a 30-second timeout
    - Define `AnalyzeScamRequest` and `AnalyzeScamResponse` Pydantic models
    - _Requirements: 3.1, 5.4_

  - [ ] 6.2 Implement the prediction + conditional AgentCore forwarding logic
    - Implement `POST /api/analyze-scam`: validate `transcript` (non-empty, 1–10 000 chars), return HTTP 400 otherwise
    - Call the existing `predict_scam` logic to get `Scam_Prediction_Result`
    - If `is_scam = false`, return the prediction result immediately without calling AgentCore
    - If `is_scam = true`, forward `{transcript, prediction}` to `AGENTCORE_INVOCATION_URL` via `httpx`
    - On AgentCore HTTP error, timeout, or connection failure, return prediction + `analysis_error` field
    - Merge all fields from prediction and analysis into a single flat JSON response
    - _Requirements: 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8_

  - [ ]* 6.3 Write property test for merged response completeness (Property 5)
    - **Property 5: Merged response contains all prediction and analysis fields**
    - Use `hypothesis` with `st.fixed_dictionaries` for both prediction and analysis shapes; assert every key from both dicts appears in the merged output
    - **Validates: Requirements 3.5**

  - [ ]* 6.4 Write property test for credential leakage prevention (Property 6)
    - **Property 6: Credentials never appear in the proxy response**
    - For any valid transcript input, assert the JSON response body does not contain `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, or `AGENTCORE_INVOCATION_URL` as keys or values
    - **Validates: Requirements 3.7**

  - [ ]* 6.5 Write property test for whitespace transcript rejection (Property 7)
    - **Property 7: Empty/whitespace transcript is always rejected at the proxy**
    - Use `hypothesis` `@given(st.text(alphabet=" \t\n\r"))` to assert HTTP 400 for all whitespace-only strings, with no ML model or AgentCore call
    - **Validates: Requirements 3.8**

  - [ ]* 6.6 Write unit tests for proxy routing and graceful degradation
    - `is_scam=false` path: assert AgentCore client not called
    - `is_scam=true` + AgentCore unreachable: assert `analysis_error` field in response and HTTP 200
    - `is_scam=true` + AgentCore timeout: assert `analysis_error` field and HTTP 200
    - _Requirements: 3.3, 3.4, 3.6_

- [ ] 7. Update backend dependencies and environment
  - Update `backend/requirements.txt` to add `fastapi==0.115.5`, `uvicorn==0.32.1`, `httpx==0.28.1` with exact pinned versions (add if not already present)
  - Add `AGENTCORE_INVOCATION_URL=http://localhost:8080/invocations` to `backend/.env`
  - _Requirements: 5.4_

- [ ] 8. Checkpoint — Verify backend integration
  - Ensure all backend tests pass; ask the user if questions arise.

- [ ] 9. Add `ScamAnalysisResult` type to frontend types
  - Open `frontend/src/types/index.ts` and add the `ScamAnalysisResult` interface as defined in the design (`is_scam`, `scam_probability`, `safe_probability`, `confidence_level`, `triggers_detected`, optional `summary`, `verification_questions`, `risk_level`, `analysis_error`)
  - _Requirements: 6.1, 6.2, 6.3, 6.5_

- [ ] 10. Implement `ScamAnalysisPanel` component
  - [ ] 10.1 Create `frontend/src/components/ScamAnalysisPanel.tsx`
    - Implement internal state: `result`, `isLoading`, `error`, `abortControllerRef` as per the design
    - Implement 800 ms debounce with `AbortController` cancellation of prior requests
    - Implement 30-second client-side timeout via `setTimeout` → `abortController.abort()`
    - On `transcript` prop becoming empty, reset all state
    - When `is_scam = false` in result, render nothing (let `ScamPredictionPanel` handle that case)
    - Render loading indicator (`data-testid="loading-indicator"`), summary (`data-testid="summary-text"`, truncated to 500 chars), verification questions as numbered list (`data-testid="questions-list"`, max 10 items), and error banner (`data-testid="analysis-error"`)
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7_

  - [ ] 10.2 Create `frontend/src/styles/ScamAnalysisPanel.css`
    - Use the same CSS custom property palette (variables) as `ScamPredictionPanel.css`
    - Add styles for `.scam-analysis-panel`, `.loading-indicator`, `.summary-text`, `.questions-list`, `.error-banner`, and `.risk-level-badge` with CRITICAL/HIGH/MEDIUM/LOW colour variants
    - _Requirements: 6.8_

  - [ ]* 10.3 Write property test for summary truncation (Property 8)
    - **Property 8: Displayed summary is always ≤ 500 characters**
    - Use `fast-check` `fc.string()` to generate arbitrary summaries; render `ScamAnalysisPanel` with mocked result and assert `data-testid="summary-text"` content length ≤ 500
    - **Validates: Requirements 6.2**

  - [ ]* 10.4 Write property test for verification questions bound (Property 9)
    - **Property 9: Displayed verification questions list is always bounded at 10**
    - Use `fast-check` `fc.array(fc.string())` for arbitrary length arrays; assert rendered `listitem` count ≤ 10
    - **Validates: Requirements 6.3**

  - [ ]* 10.5 Write property test for analysis state clearing (Property 10)
    - **Property 10: Analysis state clears when is_scam becomes false**
    - Use `fast-check` to generate arbitrary prior states with `is_scam=true`; rerender with `is_scam=false`; assert `summary-text`, `questions-list`, and `analysis-error` are absent
    - **Validates: Requirements 6.7**

  - [ ]* 10.6 Write unit tests for ScamAnalysisPanel states
    - Test loading indicator visible while fetch in-flight
    - Test `analysis_error` field triggers error banner alongside prediction data
    - Test timeout: advance fake timers past 30 s and assert timeout error message displayed
    - _Requirements: 6.4, 6.5, 6.6_

- [ ] 11. Update `TranscriptionPage.tsx` and `useTranscription.ts`
  - [ ] 11.1 Fix `fullTranscript` computation in `TranscriptionPage.tsx`
    - Replace `seg.alternatives?.[0]?.transcript` with `seg.transcript` in the `useMemo` as specified in the design
    - Import and render `<ScamAnalysisPanel transcript={fullTranscript} />` within the existing layout
    - _Requirements: 6.1_

  - [ ] 11.2 Update `useTranscription.ts` to call `/api/analyze-scam`
    - Change `sendToBackend` (or equivalent function) to `POST /api/analyze-scam` instead of `/api/predict-scam`
    - Update the response type to use `ScamAnalysisResult`
    - _Requirements: 3.1_

- [ ] 12. Checkpoint — Verify full frontend integration
  - Ensure TypeScript compiles without errors (`tsc --noEmit`)
  - Ensure all frontend unit and property tests pass; ask the user if questions arise.

- [ ] 13. Create deployment script (`agentcore/deploy.py`)
  - Implement `deploy.py` with an optional `--config` CLI argument defaulting to `deploy.config.json` in the same directory
  - Read `ECR_REPOSITORY_URI`, `AWS_REGION`, and `AGENT_NAME` from environment variables first, then fall back to `deploy.config.json`; exit with error if any required value is absent from both sources
  - Execute steps in order: (1) `docker buildx build --platform linux/arm64`, (2) `aws ecr get-login-password` pipe to `docker login`, (3) `docker push`, (4) `boto3` create-or-update Bedrock AgentCore Runtime agent
  - Log each step to stdout with ISO 8601 timestamp before and after; on any failure print step name + reason to stderr and exit non-zero without running subsequent steps
  - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5_

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP delivery
- Each task references specific requirements clauses for traceability
- Run `agentcore/test_agent.py` (task 5) against a live local instance before connecting the backend proxy — this validates the core Bedrock integration early
- The `compute_risk_level` function is deterministic Python; property tests (2.6) are especially valuable and fast to run
- For the Docker build (task 3), ARM64 cross-compilation on an x86 host requires `docker buildx` with the `linux/arm64` emulator; this is expected to be slow but is required for AgentCore Runtime deployment

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1"] },
    { "id": 1, "tasks": ["2.1", "3"] },
    { "id": 2, "tasks": ["2.2", "2.3"] },
    { "id": 3, "tasks": ["2.4", "2.6", "2.8", "2.9"] },
    { "id": 4, "tasks": ["2.5", "2.7", "2.10"] },
    { "id": 5, "tasks": ["4"] },
    { "id": 6, "tasks": ["6.1", "7", "9"] },
    { "id": 7, "tasks": ["6.2"] },
    { "id": 8, "tasks": ["6.3", "6.4", "6.5", "6.6", "10.1"] },
    { "id": 9, "tasks": ["10.2", "10.3", "10.4", "10.5", "10.6", "11.1", "11.2"] },
    { "id": 10, "tasks": ["13"] }
  ]
}
```
