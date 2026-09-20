<div align="center">

# 🛡️ VoiceShield

### Real-time AI protection against voice scams, deepfakes, and impersonation — in English and Hindi.

*Your phone rings from an unknown number. Within seconds, VoiceShield transcribes the call, scores the scam risk with ML, escalates suspicious calls to a Bedrock LLM for a plain-language explanation, checks whether the voice is AI-generated, verifies the caller against your enrolled family voices, and alerts your emergency contacts — all live, while the call is still happening.*

[Architecture](#-architecture) · [Features](#-features) · [Quick Start](#-quick-start) · [API Reference](#-api-reference) · [The Security Story](#-the-detect--protect-escalation-flow) · [Tech Stack](#-tech-stack)

</div>

---

## 💡 Why VoiceShield

Voice scams and AI voice cloning are exploding. A scammer only needs a few seconds of audio to clone a loved one's voice, then calls an elderly parent claiming to be their child in trouble. Traditional spam filters block numbers **after** the damage is done. VoiceShield works **during** the call, fusing multiple independent signals so a user never has to make a high-stakes trust decision alone.

VoiceShield answers four questions in real time:

| Question | How VoiceShield answers it |
| --- | --- |
| **Is this conversation a scam?** | A scikit-learn text classifier scores the live transcript; an Amazon Bedrock LLM explains *why* and suggests verification questions. |
| **Is this voice AI-generated?** | A DistilHuBERT deepfake detector (IndicTTS) flags synthetic speech. |
| **Is the caller who they claim to be?** | SpeechBrain ECAPA-TDNN speaker embeddings are compared against your enrolled family voices. |
| **Can the caller pass a human challenge?** | A spoken + typed security question keyed to the claimed contact. |

These four signals are fused by a **Risk Engine** into a single, honest risk assessment — the system never falsely asserts confirmed fraud, only *possible impersonation*.

---

## ✨ Features

### 🎙️ Live Multilingual Transcription
- **Amazon Transcribe Streaming** wired directly into the browser via AWS SDK v3 — sub-second partial results.
- **Automatic language identification** across English (`en-US`) and Hindi (`hi-IN`) per segment — no manual switching.
- Client-side audio pipeline: mic capture → resample to 16 kHz → PCM quantization → streamed to Transcribe.

### 🧠 Two-Stage Scam Detection
- **Stage 1 — ML classifier:** a pre-trained `voiceguard_scam_model.joblib` scores every transcript for scam probability with HIGH/MEDIUM/LOW confidence and returns matched **trigger patterns** (urgent-payment, account-suspension threats, OTP/PIN requests, and Hindi/Hinglish patterns like *inaam*, *jurmana*, *FIR*).
- **Stage 2 — Bedrock LLM analysis:** when scam probability crosses 70%, the backend escalates to an **Amazon Bedrock** agent (Amazon Nova Lite via the Strands SDK) that writes a plain-language summary of *why* the call was flagged and generates **3–7 verification questions** the user can ask to expose a fraudster.
- Duplicate-call protection with an async lock + cooldown so the LLM isn't spammed.

### 🕵️ Deepfake / AI Voice Detection
- A **DistilHuBERT audio-classification model** (`Khon198/indictts-deepfake-detector`) analyzes caller audio and returns an AI-generated probability with a confidence level, surfaced as an in-call warning overlay.

### 🗣️ Speaker Voice Verification
- **SpeechBrain ECAPA-TDNN** produces 192-dimensional speaker embeddings.
- Enroll family members' voices once; VoiceShield compares live caller audio against the stored embedding using cosine similarity and a configurable match threshold.
- The original voice recording never has to be re-stored — only the embedding vector is kept.

### 🔒 Privacy-Preserving Diarization
- An energy-based **VAD + diarization + speaker-ID pipeline** separates who is speaking. The owner's own voice and known family voices are **discarded**; only the unknown caller's audio is forwarded to Transcribe. Your side of the conversation is never sent to the cloud.

### 🚨 On-Demand Impersonation Escalation (unknown callers only)
- A deliberate **Detect → Suspect → Identify → Challenge → Verify → Protect** narrative (see [below](#-the-detect--protect-escalation-flow)).
- A bounded **rolling snippet buffer** continuously captures short clips of the caller's voice, so a fresh, clean sample is ready the moment the user chooses to verify.
- **Two-tier severity language** protects credibility: tentative *"⚠️ Possible impersonation"* before checks complete, escalating to *"🚨 Impersonation risk: HIGH"* only after both a voice mismatch and a failed challenge — never a confirmed-fraud claim.

### 👨‍👩‍👧 Family, Contacts & Messaging
- Enroll family members with name, relation, phone, a personal security question, and an optional voice embedding.
- **Voice sharing:** send your voice sample to another user; they accept it from their inbox to enroll you as a trusted contact.
- **Emergency contact alerts:** when a scam is confirmed, VoiceShield fans out alerts (inbox + Web Push) to every contact marked as an emergency contact — idempotently, so no duplicate spam.

### 📲 Progressive Web App + Push
- Installable PWA with a service worker (`push-sw.js`) handling Web Push notifications and click-to-open.

### 🎨 Polished, Demo-Ready UI
- A two-way **Protected / Caller** demo toggle to simulate both sides of a call.
- An animated **3D shield** (Three.js / React Three Fiber), live **Shield Score**, **Threat Timeline**, **Combined Risk Panel**, and freeze/warning overlays — built for a compelling live demo.

---

## 🏗️ Architecture

VoiceShield is three independently deployable services plus a browser PWA:

```
                          ┌───────────────────────────────────────────┐
                          │            Browser (React PWA)             │
                          │  • Mic + caller audio capture (16 kHz PCM) │
                          │  • Amazon Transcribe Streaming (AWS SDK v3)│
                          │  • Risk Engine fusion + overlays + 3D UI   │
                          │  • Web Push service worker                 │
                          └───────┬───────────────────────┬────────────┘
                                  │ REST                   │ WebSocket (streaming)
                                  ▼                        ▼
        ┌─────────────────────────────────────┐   ┌──────────────────────┐
        │      Backend — FastAPI (:5000)       │   │   Amazon Transcribe   │
        │  • Scam ML model (joblib)            │   │   (auto en/hi detect) │
        │  • ECAPA-TDNN speaker embeddings     │   └──────────────────────┘
        │  • DistilHuBERT deepfake detector    │
        │  • VAD + diarization + speaker ID    │        ┌──────────────────┐
        │  • DynamoDB: family / inbox / push   │◄──────►│ Amazon DynamoDB  │
        │  • Amazon Translate (hi ↔ en)        │◄──────►│ Amazon Translate │
        └───────────────┬─────────────────────┘        └──────────────────┘
                        │ POST /invocations (when scam prob ≥ 0.70)
                        ▼
        ┌─────────────────────────────────────┐        ┌──────────────────┐
        │    AgentCore — FastAPI (:8080)       │◄──────►│  Amazon Bedrock  │
        │  • Strands Agent + BedrockModel      │        │  (Nova Lite)     │
        │  • Summary + verification questions  │        └──────────────────┘
        │  • Hindi output + Translate fallback │
        └─────────────────────────────────────┘
```

**Call data flow:** browser captures audio → VAD/diarization isolates the *unknown caller* → caller audio streamed to Amazon Transcribe → transcript segments (with detected language) → `POST /api/analyze-scam` → backend translates non-English to English → runs the ML model → if scam & probability ≥ 0.70, calls AgentCore → Bedrock returns summary + verification questions → merged result drives the UI overlays and fires emergency-contact alerts.

---

## 🧰 Tech Stack

| Layer | Technologies |
| --- | --- |
| **Frontend** | React 18, TypeScript, Vite 5, Tailwind CSS 4, Framer Motion, Three.js / React Three Fiber / drei, lucide-react, AWS SDK v3 (Transcribe Streaming) |
| **Backend** | Python, FastAPI, Uvicorn, scikit-learn + joblib, SpeechBrain (ECAPA-TDNN), HuggingFace Transformers (DistilHuBERT), PyTorch / torchaudio, boto3, pywebpush |
| **AI Agent** | FastAPI, Strands Agents SDK, Amazon Bedrock (`amazon.nova-lite-v1:0`) |
| **AWS** | Amazon Transcribe (Streaming), Amazon Bedrock, Amazon Translate, Amazon DynamoDB, AWS Amplify (frontend hosting) |
| **Deploy** | Docker (backend + agent), AWS Amplify (frontend), Web Push / VAPID |

---

## 🚀 Quick Start

### Prerequisites
- **Node.js 18+** and **Python 3.10+** (3.12 recommended)
- An **AWS account** with access to Transcribe, Bedrock (Nova Lite enabled), Translate, and DynamoDB
- AWS credentials (access key / secret, or a session token)

> ℹ️ VoiceShield runs as three processes: **backend** (`:5000`), **AgentCore** (`:8080`), and **frontend** (`:5173`). Start each in its own terminal.

### 1. Backend (scam model, speaker embeddings, deepfake, DynamoDB)

```powershell
cd backend
pip install -r requirements.txt

# Create backend/.env (see Configuration below), then provision DynamoDB tables:
python create_messaging_tables.py

# Start the API (SpeechBrain + HuggingFace models download on first run)
python backend.py
# → http://localhost:5000  (health: /api/health)
```

### 2. AgentCore (Bedrock LLM analysis)

```powershell
cd agentcore
pip install -r requirements.txt

# Requires AWS_REGION and BEDROCK_MODEL_ID in agentcore/.env
uvicorn agent:app --host 0.0.0.0 --port 8080
# → http://localhost:8080  (health: /ping)
```

### 3. Frontend (PWA)

```powershell
cd frontend
npm ci

# Create frontend/.env.local (see Configuration below)
npm run dev
# → http://localhost:5173
```

Open **http://localhost:5173**, "sign in" with a phone number + name, enroll a family voice, then simulate an incoming call to watch the live detection pipeline in action.

---

## ⚙️ Configuration

### `backend/.env`
```env
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
AWS_REGION=us-east-1
# AWS_SESSION_TOKEN=...            # if using temporary credentials

BACKEND_PORT=5000
AGENTCORE_INVOCATION_URL=http://localhost:8080/invocations
BEDROCK_MODEL_ID=amazon.nova-lite-v1:0
VOICE_MATCH_THRESHOLD=60           # % match required to pass voice verification

# DynamoDB table names (defaults shown)
VOICESHIELD_FAMILY_TABLE=VoiceShieldFamilyMembers
VOICESHIELD_VOICE_SHARES_TABLE=VoiceShieldVoiceShares
VOICESHIELD_INBOX_TABLE=VoiceShieldInbox
VOICESHIELD_PUSH_TABLE=VoiceShieldPushSubscriptions
VOICESHIELD_LANGUAGE_PREFERENCES=VoiceShieldLanguagePreferences

# Web Push (VAPID)
VAPID_PRIVATE_KEY=...
VAPID_SUBJECT=mailto:you@example.com
```

### `agentcore/.env`
```env
AWS_ACCESS_KEY_ID=...              # not required in production (ECS task role)
AWS_SECRET_ACCESS_KEY=...
AWS_REGION=us-east-1
BEDROCK_MODEL_ID=amazon.nova-lite-v1:0
```

### `frontend/.env.local`
```env
VITE_AWS_ACCESS_KEY_ID=...
VITE_AWS_SECRET_ACCESS_KEY=...
# VITE_AWS_SESSION_TOKEN=...
VITE_AWS_REGION=us-east-1
VITE_AWS_LANGUAGE=en-US
VITE_API_URL=http://localhost:5000   # deployed backend origin (no trailing slash)
```

> ⚠️ **Security:** never commit real credentials. `.env` / `.env.local` files hold live AWS keys — keep them out of version control and rotate any key that has been exposed. Browser-side `VITE_AWS_*` credentials should be **scoped to Transcribe-only** and, ideally, be short-lived session tokens rather than long-lived keys.

---

## 📡 API Reference

### Backend — FastAPI (`:5000`)

| Method | Endpoint | Purpose |
| --- | --- | --- |
| `POST` | `/api/predict-scam` | Run the ML classifier on a transcript → scam probability, confidence, matched triggers. |
| `POST` | `/api/analyze-scam` | Orchestrator: ML score, and if scam prob ≥ 0.70, Bedrock summary + verification questions. |
| `POST` | `/api/analyze-combined` | Scam + deepfake in one call → overall risk level + human-readable warnings. |
| `POST` | `/api/detect-deepfake` | Detect AI-generated speech in a WAV → AI/human probability + confidence. |
| `POST` | `/api/translate` | Amazon Translate (source BCP-47 → English). |
| `POST` | `/api/speaker-embedding` | WAV → 192-dim ECAPA-TDNN embedding (enrollment). |
| `POST` | `/api/compare-voices` | Two WAVs → cosine similarity + match %. |
| `POST` | `/api/verify-speaker` | Live WAV vs stored embedding → similarity, match %, `verified`. |
| `POST` | `/api/analyze-audio-segment` | VAD + diarization + speaker ID → caller-only audio for Transcribe. |
| `GET`/`POST` | `/api/family-members` | List / create enrolled contacts. |
| `PUT`/`DELETE` | `/api/family-members/{id}` | Update / remove a contact. |
| `POST` | `/api/voice-shares` | Share your voice sample with another user. |
| `GET` | `/api/inbox` | Fetch inbox items (voice shares, alerts). |
| `POST` | `/api/voice-shares/{id}/decision` | Accept / reject a shared voice. |
| `POST` | `/api/spam-alerts` | Idempotently alert emergency contacts of a confirmed scam. |
| `POST` | `/api/push-subscriptions` | Register a Web Push subscription. |
| `GET`/`POST` | `/api/language-preference` | Per-user language preference (`en` / `hi`). |
| `GET` | `/api/health` | Health + model-load status. |

### AgentCore — FastAPI (`:8080`)

| Method | Endpoint | Purpose |
| --- | --- | --- |
| `GET` | `/ping` | Health check. |
| `POST` | `/invocations` | `{transcript, prediction, user_language}` → `{summary, verification_questions[], risk_level}` from Bedrock. |

---

## 🛡️ The Detect → Protect Escalation Flow

For **unknown callers only**, VoiceShield runs a deliberate, user-in-control escalation narrative. Known family contacts are never auto-verified or disrupted.

```
DETECT   →  Continuously monitor scam + AI-voice signals while the call is live.
SUSPECT  →  When a signal crosses its suspicion threshold, ask the user which
            enrolled contact the caller claims to be (or Skip).
IDENTIFY →  Pull a fresh clean segment from the rolling snippet buffer and
            compare it to the selected contact's stored voice embedding.
CHALLENGE→  On a voice mismatch, speak + display the contact's security question.
VERIFY   →  The caller answers on the caller-side screen.
PROTECT  →  The Risk Engine fuses Voice Match + AI Voice + Scam Risk + Security
            Question into an overall risk level; the user chooses:
            Continue · Mute · End Call · Report.
```

Stages advance strictly one step at a time — out-of-order transitions are rejected. The strongest claim the system ever makes is ***possible* impersonation**; it never asserts confirmed identity theft.

---

## 🌍 Multilingual Support (English + Hindi)

- **Transcription:** Amazon Transcribe auto-identifies `en-US` vs `hi-IN` per segment.
- **Scam scoring:** Hindi transcripts are translated to English via Amazon Translate before the ML model runs; the backend also carries native Hindi/Hinglish scam trigger regexes.
- **AI responses:** the Bedrock agent responds in the user's chosen language (Hindi in Devanagari), with an Amazon Translate fallback if the model replies in English.

---

## 🐳 Deployment

- **Frontend → AWS Amplify.** `amplify.yml` runs `npm ci` and `npm run build` in `frontend/`, publishing `frontend/dist`.
- **Backend & AgentCore → Docker.** Each service ships a `Dockerfile` (python:3.12-slim); the backend image bundles the scam model and SpeechBrain cache and serves Uvicorn on `:5000`, the agent on `:8080`. In production, AWS credentials are supplied by an ECS task role rather than static keys.
- Point the deployed frontend at the backend with `VITE_API_URL`, and point the backend at the deployed agent with `AGENTCORE_INVOCATION_URL`.

---

## 📁 Project Structure

```
VoiceShield/
├── frontend/                    React + Vite + TypeScript PWA
│   ├── src/
│   │   ├── components/          ActiveCallScreen, IdentityPrompt, CombinedRiskPanel,
│   │   │                        SecurityQuestionOverlay, AIWarningOverlay, FreezeOverlay,
│   │   │                        Shield3D, ShieldScore, ThreatTimeline, tabs, …
│   │   ├── hooks/               useTranscription, useVoiceVerification,
│   │   │                        useVADDiarization, useFamilyContacts, useDemoMode
│   │   ├── services/            Audio pipeline, RollingSnippetBuffer, riskEngine,
│   │   │                        detectAiVoice, Transcribe helpers
│   │   └── config/api.ts        Backend URL resolution
│   └── public/push-sw.js        Web Push service worker
├── backend/
│   ├── backend.py               FastAPI: ML, embeddings, deepfake, DynamoDB, orchestration
│   ├── voiceguard_scam_model.joblib
│   ├── model_cache/             Cached SpeechBrain ECAPA-TDNN weights
│   ├── create_messaging_tables.py
│   └── Dockerfile
├── agentcore/
│   ├── agent.py                 FastAPI + Strands + Bedrock analysis service
│   └── Dockerfile
├── .kiro/specs/                 Formal requirements (voice-verification-security)
├── docs/                        Additional guides and theme docs
└── amplify.yml                  AWS Amplify build config
```

---

## 🧪 Testing

```powershell
# Backend model + endpoint tests
cd backend
python test_speaker_embedding.py
python test_transcribe.py

# AgentCore (Bedrock) tests
cd agentcore
python test_agent.py
python test_hindi.py
```

Manual end-to-end: start all three services, open the frontend, enroll a family voice, then run a simulated call from the demo caller picker and watch the transcript, scam bar, deepfake warning, voice-match result, and Bedrock analysis update live.

---

## 🔮 Roadmap

- [ ] Session-based / STS credential vending for the browser (remove long-lived keys)
- [ ] Additional languages beyond English + Hindi
- [ ] On-device deepfake detection for lower latency
- [ ] Call recording + post-call report export
- [ ] Configurable, user-defined threat patterns

---

<div align="center">

**VoiceShield** — protecting people from voice scams and AI impersonation, in real time.

Built with AWS Transcribe · Bedrock · Translate · DynamoDB · SpeechBrain · React

</div>
