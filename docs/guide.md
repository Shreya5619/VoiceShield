# VoiceShield — The Complete Guide

> **Know who's really on the line.**
> Real-time scam detection and voice verification for every call. VoiceShield listens, scores the risk, and confirms the caller is who they claim to be — before you say a word.

VoiceShield is a real-time call-protection platform that fights the fastest-growing category of fraud on the planet: **voice scams, AI-cloned voices, and impersonation attacks.** Phone fraud costs people billions every year, and the newest wave — deepfaked voices that sound exactly like your bank, your boss, or your own family — is nearly impossible to catch by ear. VoiceShield catches it for you, live, in the moment it matters.

It does three things no ordinary call app can do:

1. **Scores scam risk in real time** while the call is happening — not after.
2. **Verifies the caller's actual voice** against enrolled voiceprints of the people you trust.
3. **Detects AI-generated speech** and warns you the instant a synthetic voice is on the line.

And it does all of this in **English and Hindi**, with a family-safety network that alerts your loved ones the moment something looks wrong.

---

## Table of Contents

- [Why VoiceShield Exists](#why-voiceshield-exists)
- [The Feature Set](#the-feature-set)
  - [1. Real-Time Scam Detection](#1-real-time-scam-detection)
  - [2. AI Deep Analysis (Amazon Bedrock)](#2-ai-deep-analysis-amazon-bedrock)
  - [3. Deepfake / AI-Voice Detection](#3-deepfake--ai-voice-detection)
  - [4. Voice Verification & Speaker Identity](#4-voice-verification--speaker-identity)
  - [5. The Impersonation Escalation Flow](#5-the-impersonation-escalation-flow)
  - [6. The Risk Engine — Multi-Signal Fusion](#6-the-risk-engine--multi-signal-fusion)
  - [7. Privacy-Preserving Diarization](#7-privacy-preserving-diarization)
  - [8. Live Transcription (Bilingual)](#8-live-transcription-bilingual)
  - [9. Family & Emergency-Contact Network](#9-family--emergency-contact-network)
  - [10. The Interface & Experience](#10-the-interface--experience)
- [System Architecture](#system-architecture)
- [Anatomy of a Protected Call](#anatomy-of-a-protected-call)
- [API Reference](#api-reference)
- [Tech Stack](#tech-stack)
- [AWS Services](#aws-services)

---

## Why VoiceShield Exists

Scam calls have evolved. It's no longer a stranger with a bad script — it's a convincing voice that knows your name, references your account, threatens you with arrest, and pressures you to act *right now*. With AI voice cloning, an attacker can sound exactly like someone you love.

Humans can't reliably detect this. Machines can. VoiceShield puts an always-on analyst on every call:

- It **understands what's being said** and recognizes the linguistic fingerprints of a scam.
- It **listens to how it's being said** and flags voices that were synthesized by a machine.
- It **remembers the voices you trust** and tells you when the person on the line isn't who they claim to be.

The result is a single, calm, clear picture of whether the call is safe — surfaced in time to hang up before the damage is done.

---

## The Feature Set

### 1. Real-Time Scam Detection

VoiceShield transcribes the caller live and continuously scores the conversation for scam risk using a trained machine-learning classifier (`voiceguard_scam_model.joblib`). Every transcript segment feeds a `scam_probability` between 0 and 1, bucketed into **HIGH / MEDIUM / LOW** confidence.

On top of the ML model, VoiceShield runs a **trigger-pattern engine** that recognizes the tell-tale phrases of real-world scams, in both English **and** Hindi/Hinglish:

- **Urgent payment requests** ("pay now", "transfer", "turant bhej", "jama kar")
- **Account-suspension threats** ("account will be blocked", "khata band ho jayega")
- **Financial-info harvesting** (OTP, PIN, CVV, "OTP batao", "bank details do")
- **Identity/KYC bait** ("verify your identity", "verification pending")
- **Remote-access traps** (AnyDesk, TeamViewer, screen share)
- **Prize / lottery / refund scams** ("you've won", "inaam", "lottery lagi")
- **Legal & arrest threats** ("legal action", "police", "giraftaar", "jail", "jurmana")

Because the model is language-aware, a Hindi call is transparently translated to English (via Amazon Translate) before scoring, so accuracy never drops for non-English speakers.

**Endpoint:** `POST /api/predict-scam`

### 2. AI Deep Analysis (Amazon Bedrock)

When the scam probability crosses the high-risk threshold (≥ 70%), VoiceShield escalates to its **AgentCore AI analyst** — a dedicated microservice powered by **Amazon Bedrock** through the **Strands Agents** framework.

The AI doesn't just say "this is a scam." It explains *why*, and it arms you to fight back:

- A **plain-language summary** (up to 300 words) explaining exactly which phrases and patterns triggered the alert.
- **3 to 7 verification questions** you can ask the caller on the spot — questions a legitimate caller could answer instantly but a scammer can't (employee ID, case reference number, company registration, originating office).

Everything is returned as structured, deterministic JSON with a computed **risk level** (CRITICAL / HIGH / MEDIUM / LOW). The service is production-hardened with **exponential-backoff retries** on throttling, a **28-second timeout**, request de-duplication (lock + cooldown), and graceful degradation — if the AI is unavailable, the call is still protected by the ML layer.

Full **Hindi support**: the agent responds in Devanagari script when the user's language is Hindi, with an Amazon Translate fallback if the model replies in English.

**Endpoint:** `POST /api/analyze-scam` → proxies to AgentCore `POST /invocations`

### 3. Deepfake / AI-Voice Detection

This is VoiceShield's answer to the deepfake era. Using the **IndicTTS Deepfake Detector** (a DistilHuBERT audio-classification model), VoiceShield analyzes the caller's actual audio and estimates the probability that the voice is **AI-generated rather than human**.

- Returns `ai_probability`, `human_probability`, and a confidence level (HIGH / MEDIUM / LOW).
- When synthetic speech is detected with high confidence, a **loud, unmissable AI-Voice Warning overlay** fires immediately — because a cloned voice is one of the strongest fraud signals there is.
- Works standalone or fused into the combined risk assessment.

**Endpoints:** `POST /api/detect-deepfake`, `POST /api/analyze-combined`

### 4. Voice Verification & Speaker Identity

VoiceShield can confirm that the person on the line is *actually* who they claim to be, using **SpeechBrain's ECAPA-TDNN** speaker-embedding model (192-dimensional voiceprints).

- **Enrollment:** each trusted contact records a short voice sample, converted into a compact voiceprint. (`POST /api/speaker-embedding`)
- **Verification:** live caller audio is compared against the stored voiceprint using cosine similarity, expressed as an intuitive **match percentage** (0–100%). A match ≥ 60% counts as verified. (`POST /api/verify-speaker`)
- **Comparison:** any two voice samples can be compared head-to-head. (`POST /api/compare-voices`)

Crucially, the frontend never has to re-store or re-upload the original recording — only the compact embedding vector travels, keeping raw voice data minimal and private.

### 5. The Impersonation Escalation Flow

For **unknown callers**, VoiceShield runs a deliberate, user-controlled security narrative that never falsely accuses anyone. It follows six stages:

**Detect → Suspect → Identify → Challenge → Verify → Protect**

1. **Detect** — Scam and AI-voice monitoring run continuously in the background.
2. **Suspect** — If risk crosses a suspicion threshold, VoiceShield asks: *"Who is this caller claiming to be?"*
3. **Identify** — You pick the enrolled contact they claim to be — or **skip** entirely. You stay in control.
4. **Challenge** — On a weak voice match, VoiceShield speaks a **security question** aloud (via the browser's speech synthesis) drawn from that contact's profile.
5. **Verify** — The caller answers; you decide.
6. **Protect** — A combined risk panel presents every signal side by side, with clear actions: **Continue, Mute, End Call, Report.**

The wording is deliberately careful. Before all signals combine, VoiceShield says only **"⚠️ Possible impersonation."** After the checks complete it may escalate to **"🚨 Impersonation risk: HIGH"** — but it *never* asserts confirmed fraud. This two-tier language protects the app's credibility and avoids wrongly accusing a real person.

Known family contacts are never disrupted by this flow — verification is scoped strictly to unknown numbers and only ever runs on demand.

**Key components:** `IdentityPrompt`, `SecurityQuestionOverlay`, `CombinedRiskPanel`, `ScreenViewToggle`

### 6. The Risk Engine — Multi-Signal Fusion

No single signal tells the whole story, so VoiceShield fuses them. The **Risk Engine** combines three independent signals plus the security-question outcome into one clear verdict:

| Signal | Source |
| --- | --- |
| **Voice Match** | Speaker-embedding cosine similarity |
| **AI Voice** | Deepfake detector's synthetic-indicator score |
| **Scam Risk** | Live-transcription scam probability |
| **Security Question** | Answered correctly / incorrectly / bypassed |

Each carries its own value and severity chip. The engine applies clear precedence rules — an incorrect security answer forces HIGH; two or more severe signals force HIGH; one severe signal is MEDIUM; a correct or bypassed answer settles to LOW — and recomputes within milliseconds as new evidence arrives. If any signal is unavailable, the engine simply reasons over the rest without failing.

### 7. Privacy-Preserving Diarization

VoiceShield only ever analyzes the **caller's** audio — never yours or your family's. A **voice-activity-detection + diarization pipeline** splits the audio stream into speaker segments and identifies each one:

- **SELF** (the device owner) → discarded
- **FAMILY_\<name\>** (an enrolled trusted contact) → discarded for privacy
- **UNKNOWN** (the caller) → forwarded to transcription and analysis

This means the scam and deepfake engines see only the part of the conversation that actually needs scrutiny, and your own speech is never transcribed or sent anywhere.

**Endpoint:** `POST /api/analyze-audio-segment`

### 8. Live Transcription (Bilingual)

Transcription runs directly in the browser via **Amazon Transcribe Streaming** (AWS SDK v3), with automatic multi-language identification across **English (en-US)** and **Hindi (hi-IN)**. Audio is captured, resampled to 16 kHz, quantized, and streamed with echo cancellation and noise suppression. Detected language is tracked per segment and drives downstream translation and localized AI responses.

**Components:** `useTranscription`, `TranscriptionDisplay`, `TranscriptionPage`

### 9. Family & Emergency-Contact Network

VoiceShield protects a household, not just a phone.

- **Contacts & enrollment** — add family members with a name, relation, phone, security question, and an enrolled voiceprint. (`/api/family-members`)
- **Voice sharing** — securely share and approve voiceprints between users, with an approve/deny decision flow. (`/api/voice-shares`)
- **Spam & emergency alerts** — the moment a scam is confirmed on a protected call, VoiceShield fires an alert to the user's emergency contacts (deduplicated, fire-and-forget). (`/api/spam-alerts`)
- **Inbox** — a central place for voice-share requests and safety alerts. (`/api/inbox`)
- **Web push notifications** — real-time push via VAPID/service worker, even when the app isn't in focus. (`/api/push-subscriptions`)

### 10. The Interface & Experience

VoiceShield is a polished, modern PWA-style app:

- A **3D animated shield** (react-three-fiber) and a live **Shield Score** that visualize protection status.
- A **Threat Timeline** and **Activity tab** for call history.
- **Freeze** and **AI-warning** overlays that command attention exactly when needed.
- A **Protected / Caller demo toggle** and scripted demo scenarios for showing the whole flow end to end.
- Smooth motion (framer-motion), clean iconography (lucide-react), and Tailwind styling throughout.
- Robust error boundaries (including a dedicated 3D boundary), connection-status indicators, and graceful fallbacks everywhere.

---

## System Architecture

VoiceShield is three cooperating services:

```
                            ┌─────────────────────────────────────────────┐
                            │                 FRONTEND                     │
                            │      React 18 + TypeScript + Vite (SPA)      │
                            │        Hosted on AWS Amplify                 │
                            │                                              │
                            │  • Live UI, overlays, 3D shield              │
                            │  • Mic capture, VAD windows, resampling      │
                            │  • Risk Engine (signal fusion)               │
                            └───────┬───────────────────────┬──────────────┘
                                    │                       │
              streams audio        │                       │   REST (apiUrl)
              directly to          │                       │
                                    ▼                       ▼
                        ┌──────────────────────┐   ┌───────────────────────────────┐
                        │   Amazon Transcribe   │   │           BACKEND             │
                        │   Streaming (en/hi)   │   │      Python · FastAPI (5000)  │
                        └──────────────────────┘   │                               │
                                                    │  • Scam classifier (joblib)   │
                                                    │  • ECAPA-TDNN voiceprints     │
                                                    │  • IndicTTS deepfake detector │
                                                    │  • VAD + diarization          │
                                                    │  • DynamoDB, Translate, Push  │
                                                    └───────┬───────────────┬───────┘
                                                            │               │
                                        high-risk proxy     │               │  boto3
                                         (lock + cooldown)   ▼               ▼
                                              ┌───────────────────────┐  ┌──────────────────┐
                                              │      AGENTCORE        │  │   AWS Services   │
                                              │  Python · FastAPI     │  │  • DynamoDB (×5) │
                                              │  Strands Agents (8080)│  │  • Translate     │
                                              │  → Amazon Bedrock LLM │  │  • Web Push/VAPID│
                                              └───────────────────────┘  └──────────────────┘
```

### Frontend (`frontend/`)
- **React 18 + TypeScript + Vite** single-page app, deployed via **AWS Amplify** (`amplify.yml`).
- Streams audio **directly** to Amazon Transcribe from the browser using AWS SDK v3.
- Calls the backend REST API through a central `apiUrl()` helper (base URL from `VITE_API_URL`).
- Owns the **Risk Engine**, all overlays, the escalation state machine, and the 3D/visual layer.

### Backend (`backend/backend.py`)
- **Python FastAPI** service on port **5000** — the central API and ML host.
- Loads and serves three models: the scam classifier, the ECAPA-TDNN speaker encoder (cached in `backend/model_cache/`), and the IndicTTS deepfake detector.
- Runs the VAD/diarization pipeline in NumPy.
- Talks to **DynamoDB** (five tables), **Amazon Translate**, and **Web Push**.
- Proxies high-risk cases to AgentCore over HTTP with a lock + cooldown guard.

### AgentCore (`agentcore/agent.py`)
- **Python FastAPI** AI-agent microservice on port **8080** (`/invocations`, `/ping`).
- Wraps the **Strands Agents** framework over **Amazon Bedrock** (`BEDROCK_MODEL_ID`).
- Produces the scam summary + verification questions, with bilingual output and robust retry/timeout logic.
- Containerized (`Dockerfile`); designed to run on ECS with task-role credentials.

All three can be launched together via `start_all.ps1`, and each ships with its own `Dockerfile`.

---

## Anatomy of a Protected Call

1. **Answer.** The user picks or answers a caller (`CallTab` → `IncomingCallScreen` → `ActiveCallScreen`).
2. **Capture & split.** Mic audio is captured in 3-second windows, resampled to 16 kHz, and sent to `/api/analyze-audio-segment`. The backend runs VAD → diarization → speaker-ID and returns only the **caller-only** audio.
3. **Transcribe.** That caller audio is streamed to **Amazon Transcribe** (auto-detecting English or Hindi). Transcript segments return with their detected language.
4. **Score.** Transcript text goes to `/api/analyze-scam`. Non-English is translated to English, then scored by the ML model + trigger patterns.
5. **Deep analysis.** If risk ≥ 70%, the backend calls **AgentCore → Bedrock** for a summary + verification questions (deduped by lock + cooldown, localized to the user's language).
6. **Deepfake check.** Caller audio is also sent to `/api/detect-deepfake`; a HIGH-confidence AI voice triggers the warning overlay.
7. **Verify (unknown callers).** Caller audio buffers into a bounded rolling buffer; on demand it's compared to the claimed contact's voiceprint via `/api/verify-speaker`.
8. **Fuse & act.** The Risk Engine combines voice match + AI voice + scam risk + security-question outcome into one verdict, surfaced in the `CombinedRiskPanel`. Overlays fire, and emergency contacts are alerted via `/api/spam-alerts` + web push.

---

## API Reference

| Endpoint | Purpose |
| --- | --- |
| `POST /api/predict-scam` | Scam classification of a transcript (translates non-English first) |
| `POST /api/analyze-scam` | ML prediction **+** AgentCore deep analysis for high-risk calls |
| `POST /api/analyze-combined` | Combined scam + deepfake risk assessment with warnings |
| `POST /api/detect-deepfake` | AI-generated (synthetic) speech detection |
| `POST /api/speaker-embedding` | WAV → 192-dim ECAPA-TDNN voiceprint (enrollment) |
| `POST /api/verify-speaker` | Live WAV vs stored voiceprint → match % + verified flag |
| `POST /api/compare-voices` | Two WAVs → cosine similarity + match % |
| `POST /api/analyze-audio-segment` | VAD + diarization + speaker-ID; returns caller-only audio |
| `POST /api/translate` | Amazon Translate segment → English |
| `GET/POST /api/language-preference` | Read/set the user's preferred language (en/hi) |
| `GET/POST/PUT/DELETE /api/family-members` | Family/contact CRUD with voice enrollment |
| `POST /api/voice-shares`, `POST /api/voice-shares/{id}/decision` | Share voiceprints + approve/deny |
| `GET /api/inbox` | Voice-share requests and safety alerts |
| `POST /api/spam-alerts` | Notify emergency contacts of a confirmed scam |
| `POST /api/push-subscriptions` | Register a web-push subscription |
| `GET /api/health` | Health check (reports model load status) |
| `POST /invocations` *(AgentCore)* | Bedrock LLM analysis → summary + verification questions |
| `GET /ping` *(AgentCore)* | Agent health check |

---

## Tech Stack

**Frontend**
- React 18, TypeScript 5, Vite 5
- `@aws-sdk/client-transcribe-streaming` (+ eventstream / util-utf8)
- `@react-three/fiber`, `@react-three/drei`, `three` (3D shield)
- `framer-motion`, `lucide-react`, Tailwind CSS (+ forms, postcss, autoprefixer)

**Backend**
- FastAPI + Uvicorn
- scikit-learn (scam classifier), joblib, pandas, numpy
- PyTorch + torchaudio, SpeechBrain (ECAPA-TDNN), HuggingFace Transformers (DistilHuBERT deepfake detector), librosa, soundfile
- boto3/botocore, httpx, pywebpush, python-multipart, python-dotenv

**AgentCore**
- FastAPI + Uvicorn
- Strands Agents, boto3, pydantic
- pytest / pytest-asyncio / hypothesis (incl. Hindi-path tests)

**Orchestration**
- `start_all.ps1` launches all three services; each has a `Dockerfile`.

---

## AWS Services

- **Amazon Transcribe Streaming** — live bilingual (en-US + hi-IN) speech-to-text from the browser.
- **Amazon Bedrock** — LLM reasoning behind AgentCore's scam analysis (via Strands Agents).
- **Bedrock AgentCore / ECS** — hosts the AI-agent microservice with task-role credentials.
- **Amazon Translate** — Hindi ↔ English translation across the backend and agent.
- **Amazon DynamoDB** — five tables: family members, voice shares, inbox, push subscriptions, language preferences.
- **AWS Amplify** — frontend hosting and CI/CD.
- **Web Push / VAPID** — real-time notifications via a service worker.

---

*VoiceShield — because the most dangerous scam is the one that sounds exactly right.*
