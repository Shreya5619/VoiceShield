# Requirements Document

## Introduction

This feature adds an Amazon Bedrock AgentCore layer to VoiceShield that performs deep, LLM-powered analysis whenever the existing ML scam classifier flags an incoming call. The agent receives both the ML prediction result and the rolling conversation transcript, then produces a human-readable explanation of why the call was flagged plus a set of caller-verification questions. The agent is packaged as a Docker container (ARM64), served via a FastAPI process on port 8080, and deployed to Amazon Bedrock AgentCore Runtime. A lightweight proxy route on the existing backend forwards requests from the React frontend to the agent, keeping all AWS credential handling server-side.

---

## Glossary

- **AgentCore_Service**: The FastAPI application (`agentcore/agent.py`) deployed to Amazon Bedrock AgentCore Runtime, exposing `POST /invocations` and `GET /ping`.
- **Prediction_Proxy**: The new route added to the existing `backend/backend.py` FastAPI app (`POST /api/analyze-scam`) that forwards flagged-call data to the AgentCore_Service.
- **Scam_Prediction_Result**: The JSON response from `POST /api/predict-scam` containing `is_scam`, `scam_probability`, `confidence_level`, and `triggers_detected`.
- **Rolling_Transcript**: The concatenated sequence of final (non-partial) transcription segments accumulated during an active call session.
- **Analysis_Response**: The structured JSON object returned by the AgentCore_Service containing `summary`, `verification_questions`, and `risk_level`.
- **Bedrock_Model**: The Amazon Bedrock foundation model (Claude 3 Sonnet via `us.anthropic.claude-3-5-sonnet-20241022-v2:0`) invoked by the Strands agent.
- **Strands_Agent**: The `strands-agents` Python library agent that wraps the Bedrock_Model and executes the analysis tool chain.
- **AgentCore_Runtime**: Amazon Bedrock AgentCore Runtime service used to host and invoke the AgentCore_Service container.
- **ScamAnalysisPanel**: The new React component in the frontend that displays the Analysis_Response to the user.

---

## Requirements

### Requirement 1: AgentCore Service — HTTP Contract

**User Story:** As a backend developer, I want the AgentCore_Service to expose standard AgentCore endpoints, so that the Bedrock AgentCore Runtime can invoke and health-check the container correctly.

#### Acceptance Criteria

1. THE AgentCore_Service SHALL expose a `GET /ping` endpoint that returns HTTP 200 with body `{"status": "healthy"}` within 2 seconds.
2. THE AgentCore_Service SHALL expose a `POST /invocations` endpoint that accepts only `Content-Type: application/json` request bodies; WHEN a request arrives with any other Content-Type, THE AgentCore_Service SHALL return HTTP 415.
3. WHEN the `POST /invocations` request body is missing the `transcript` field or the `prediction` field, THEN THE AgentCore_Service SHALL return HTTP 422 with a response body containing a `detail` array that names each missing field.
4. THE AgentCore_Service SHALL listen on port 8080.
5. THE AgentCore_Service SHALL run on ARM64 architecture inside a Docker container built from a Python 3.12 slim base image.
6. WHEN the `POST /invocations` endpoint receives a valid request and processing succeeds, THE AgentCore_Service SHALL return HTTP 200 with a JSON body conforming to the Analysis_Response schema (`summary`, `verification_questions`, `risk_level`).

---

### Requirement 2: AgentCore Service — Scam Analysis

**User Story:** As a call recipient, I want an LLM-powered explanation of why a call was flagged as a scam, so that I can understand the threat and decide how to respond.

#### Acceptance Criteria

1. WHEN the `POST /invocations` endpoint receives a valid request (defined as a request containing a non-empty `transcript` string and a `prediction` object with a numeric `scam_probability` field between 0 and 1 inclusive), THE Strands_Agent SHALL invoke the Bedrock_Model with both the Rolling_Transcript and the Scam_Prediction_Result as context.
2. THE AgentCore_Service SHALL return an Analysis_Response containing a `summary` string (≤ 300 words) that identifies specific phrases or patterns from the transcript and names the matched `triggers_detected` values that contributed to the scam classification.
3. THE AgentCore_Service SHALL return an Analysis_Response containing a `verification_questions` array of 3–7 strings, each question designed to verify the legitimacy of the caller (e.g., GST number, employee ID, originating office location, company registration number).
4. THE AgentCore_Service SHALL return an Analysis_Response containing a `risk_level` string derived from `scam_probability` using these thresholds: `"CRITICAL"` if scam_probability ≥ 0.85, `"HIGH"` if scam_probability ≥ 0.60, `"MEDIUM"` if scam_probability ≥ 0.35, `"LOW"` if scam_probability < 0.35.
5. IF the Bedrock_Model invocation fails due to a throttling or service error, THEN THE AgentCore_Service SHALL retry the invocation up to 3 times with exponential back-off starting at 1 second and doubling each retry (1s, 2s, 4s) before returning HTTP 503.
6. IF the Bedrock_Model invocation fails after all retries, THEN THE AgentCore_Service SHALL return HTTP 503 with a `{"error": "<message>"}` body.
7. THE AgentCore_Service SHALL complete the full analysis and return a response within 30 seconds for transcripts up to 5000 characters.
8. WHEN the `POST /invocations` request body contains a malformed or invalid `prediction` object (e.g., `scam_probability` is not a number or is outside the 0–1 range), THEN THE AgentCore_Service SHALL return HTTP 400 with a `detail` field identifying the invalid field, without invoking the Bedrock_Model.

---

### Requirement 3: Prediction Proxy Route

**User Story:** As a frontend developer, I want a single backend route that orchestrates scam prediction and deep analysis, so that the frontend does not need separate AWS credentials or direct access to the AgentCore Runtime.

#### Acceptance Criteria

1. THE Prediction_Proxy SHALL expose `POST /api/analyze-scam` on the existing `backend/backend.py` FastAPI application (port 5000).
2. WHEN `POST /api/analyze-scam` receives a request with a non-empty `transcript` string of 1–10000 characters, THE Prediction_Proxy SHALL invoke the existing `/api/predict-scam` logic to obtain the Scam_Prediction_Result before any other processing.
3. IF the Scam_Prediction_Result has `is_scam` equal to `true`, THEN THE Prediction_Proxy SHALL forward the Rolling_Transcript and the Scam_Prediction_Result to the AgentCore_Service `POST /invocations` endpoint.
4. IF the Scam_Prediction_Result has `is_scam` equal to `false`, THEN THE Prediction_Proxy SHALL return the Scam_Prediction_Result to the caller without invoking the AgentCore_Service.
5. THE Prediction_Proxy SHALL merge all fields from the Scam_Prediction_Result and the Analysis_Response into a single flat JSON response before returning to the caller.
6. IF the AgentCore_Service is unreachable or returns a non-2xx status, or does not respond within 30 seconds, THEN THE Prediction_Proxy SHALL return the Scam_Prediction_Result to the caller with an additional `analysis_error` field containing a message describing the failure reason.
7. THE Prediction_Proxy SHALL not expose AWS credentials or the AgentCore Runtime endpoint URL to the frontend.
8. WHEN `POST /api/analyze-scam` receives a request with a missing or empty `transcript` field, THE Prediction_Proxy SHALL return HTTP 400 with a descriptive validation error without invoking the scam model or the AgentCore_Service.

---

### Requirement 4: Docker Packaging

**User Story:** As a DevOps engineer, I want the AgentCore_Service packaged as a Docker image so that it can be deployed to Amazon Bedrock AgentCore Runtime without manual dependency installation.

#### Acceptance Criteria

1. THE AgentCore_Service SHALL be defined by a `Dockerfile` located at `agentcore/Dockerfile` that specifies `--platform=linux/arm64` in the `FROM` instruction.
2. THE `Dockerfile` SHALL install all Python dependencies listed in `agentcore/requirements.txt` using `pip install --no-cache-dir`; IF `requirements.txt` is absent or contains an unresolvable package, THEN the Docker build SHALL exit with a non-zero code and an error message identifying the failing dependency.
3. THE `Dockerfile` SHALL set the container entrypoint to start the FastAPI application using `uvicorn` bound to host `0.0.0.0` on port 8080, and SHALL include an `EXPOSE 8080` instruction.
4. WHEN the Docker image is built with `docker buildx build --platform linux/arm64`, THE build SHALL complete with exit code 0 and produce a tagged image.
5. THE `agentcore/requirements.txt` SHALL specify exact versions for `fastapi`, `uvicorn`, `strands-agents`, `boto3`, and `pydantic` using the `==X.Y.Z` format.

---

### Requirement 5: AWS Credentials and Configuration

**User Story:** As a developer, I want all AWS credentials managed via environment variables, so that no secrets are hard-coded in source files.

#### Acceptance Criteria

1. THE AgentCore_Service SHALL read `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION`, and `BEDROCK_MODEL_ID` exclusively from environment variables at startup.
2. IF any of the four environment variables listed in criterion 1 is missing at startup, THEN THE AgentCore_Service SHALL log an error message identifying the missing variable by name and exit with a non-zero status code.
3. IF any of the four environment variables listed in criterion 1 is set to an empty string at startup, THEN THE AgentCore_Service SHALL treat it as missing and apply the same behavior as criterion 2.
4. THE Prediction_Proxy SHALL read the AgentCore Runtime invocation URL from an `AGENTCORE_INVOCATION_URL` environment variable at startup; IF this variable is missing or empty, THEN the Prediction_Proxy SHALL log an error identifying the missing variable and exit with a non-zero status code.
5. THE `agentcore/.env.example` file SHALL list all five required environment variable names (`AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION`, `BEDROCK_MODEL_ID`, `AGENTCORE_INVOCATION_URL`) with placeholder values and no real credentials.
6. THE `.gitignore` SHALL include a pattern that prevents any `*.env` file within the `agentcore/` directory from being committed.

---

### Requirement 6: Frontend ScamAnalysisPanel

**User Story:** As a call recipient, I want the analysis results displayed in the VoiceShield UI immediately after a call is flagged, so that I can act on the verification questions in real time.

#### Acceptance Criteria

1. WHEN the response from `POST /api/analyze-scam` contains `is_scam: true`, THE ScamAnalysisPanel SHALL render within the existing `TranscriptionPage` layout.
2. THE ScamAnalysisPanel SHALL display the `summary` text from the Analysis_Response, truncated to 500 characters if necessary.
3. THE ScamAnalysisPanel SHALL display up to 10 items from the `verification_questions` array as a numbered list.
4. WHILE a request to `POST /api/analyze-scam` is in-flight, THE ScamAnalysisPanel SHALL display a loading indicator in place of the summary and questions content.
5. IF `POST /api/analyze-scam` returns an `analysis_error` field, THEN THE ScamAnalysisPanel SHALL display an error message indicating the analysis failure alongside the available Scam_Prediction_Result data.
6. IF a request to `POST /api/analyze-scam` has not responded within 30 seconds, THE ScamAnalysisPanel SHALL cancel the request and display a timeout error message.
7. WHEN `is_scam` changes from `true` to `false` (new call session), THE ScamAnalysisPanel SHALL clear the summary text, verification_questions list, and any displayed error message.
8. THE ScamAnalysisPanel SHALL be styled consistently with the existing `ScamPredictionPanel` component, using the same CSS variable palette.

---

### Requirement 7: Deployment Script

**User Story:** As a developer, I want a single script that builds and registers the AgentCore container, so that I can deploy the service without memorising a sequence of AWS CLI commands.

#### Acceptance Criteria

1. THE AgentCore_Service SHALL include a `agentcore/deploy.py` script that accepts an optional `--config` argument specifying the path to a configuration file, defaulting to `deploy.config.json` in the same directory as the script if the argument is omitted.
2. WHEN `deploy.py` is executed, THE script SHALL perform the following steps in order: build the Docker image, authenticate with Amazon ECR, push the image to the ECR repository, and create or update the Bedrock AgentCore Runtime agent using `boto3`.
3. WHEN `deploy.py` is executed, THE script SHALL log each major step (build, ECR authentication, push, create/update agent) to stdout with a timestamp in ISO 8601 format before and after each step.
4. IF any step fails, THEN THE script SHALL print an error message indicating which step failed and the reason to stderr, and exit with a non-zero status code without executing any subsequent steps.
5. THE `deploy.py` script SHALL read ECR repository URI, AWS region, and agent name from environment variables if set, otherwise from the `deploy.config.json` file; IF a required configuration value is absent from both sources, THEN THE script SHALL print an error message identifying the missing value and exit with a non-zero status code before performing any deployment step.
