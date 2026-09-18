"""
Python FastAPI backend for Scam Detection + Speaker Embedding
Frontend sends transcribed text for scam prediction, or a WAV audio file for
speaker embedding generation via SpeechBrain ECAPA-TDNN.
"""

import sys
import re
import os
import io
import tempfile
import base64
from dotenv import load_dotenv
load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), ".env"))
from typing import Optional, List
import joblib
import httpx
from fastapi import FastAPI, HTTPException, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

# Initialize FastAPI app
app = FastAPI()

# Enable CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Pydantic models
class PredictionRequest(BaseModel):
    transcript: str

class PredictionResponse(BaseModel):
    is_scam: bool
    scam_probability: float
    safe_probability: float
    confidence_level: str
    triggers_detected: list

# Load the scam classifier model
print("📦 Loading scam classifier model...")
try:
    scam_model = joblib.load("voiceguard_scam_model.joblib")
    print("✓ Scam model loaded successfully")
except Exception as e:
    print(f"❌ Error loading model: {e}", file=sys.stderr)
    scam_model = None

# ---------------------------------------------------------------------------
# SpeechBrain ECAPA-TDNN speaker embedding model
# Downloaded once at startup and cached in backend/model_cache/
# ---------------------------------------------------------------------------
_SPEECHBRAIN_MODEL_DIR = os.path.join(os.path.dirname(__file__), "model_cache", "spkrec-ecapa-voxceleb")
speaker_model = None

print("📦 Loading SpeechBrain ECAPA-TDNN speaker encoder...")
try:
    # Import here so the rest of the backend works even if speechbrain isn't installed
    from speechbrain.pretrained import EncoderClassifier
    speaker_model = EncoderClassifier.from_hparams(
        source="speechbrain/spkrec-ecapa-voxceleb",
        savedir=_SPEECHBRAIN_MODEL_DIR,
        run_opts={"device": "cpu"},
    )
    print("✓ SpeechBrain speaker encoder loaded successfully")
except Exception as e:
    print(f"❌ Error loading SpeechBrain model: {e}", file=sys.stderr)
    speaker_model = None

# Trigger patterns for scam detection
TRIGGER_PATTERNS = {
    "urgent payment request": [
        r"\bpay\b",
        r"\bpayment\b",
        r"\btransfer\b",
        r"\bsend money\b",
        r"\bdeposit\b",
        r"\bfee\b",
        r"\bpay now\b"
    ],
    "account suspension threat": [
        r"\baccount.*blocked\b",
        r"\baccount.*suspend",
        r"\baccount.*deactivat",
        r"\bwill be blocked\b",
        r"\bwill be suspended\b",
        r"\blicense.*revoked\b"
    ],
    "financial information request": [
        r"\botp\b",
        r"\bpin\b",
        r"\bpassword\b",
        r"\bcard number\b",
        r"\bbank details\b",
        r"\baccount number\b",
        r"\bcvv\b",
        r"\bssn\b"
    ],
    "identity verification request": [
        r"\bverify.*identity\b",
        r"\bidentity.*verify\b",
        r"\bverify.*account\b",
        r"\bverification\b",
        r"\bkyc\b"
    ],
    "remote access request": [
        r"\banydesk\b",
        r"\bteamviewer\b",
        r"\bremote access\b",
        r"\bscreen share\b"
    ],
    "prize or reward scam": [
        r"\bprize\b",
        r"\breward\b",
        r"\blottery\b",
        r"\byou.*won\b",
        r"\bselected.*winner\b"
    ],
    "refund scam": [
        r"\brefund\b",
        r"\brefund.*bank\b",
        r"\brefund.*fee\b"
    ],
    "legal threat": [
        r"\barrest\b",
        r"\blegal action\b",
        r"\bpolice\b",
        r"\bfine\b",
        r"\bcriminal\b",
        r"\bprosecution\b"
    ]
}

def detect_triggers(text):
    """Detect scam trigger patterns in text"""
    text_lower = text.lower()
    detected = []
    for trigger, patterns in TRIGGER_PATTERNS.items():
        for pattern in patterns:
            if re.search(pattern, text_lower):
                detected.append(trigger)
                break
    return detected

@app.post("/api/predict-scam", response_model=PredictionResponse)
async def predict_scam(request_data: PredictionRequest):
    """
    Predict whether a transcript is a scam
    IMPLEMENT THIS PART: Receives transcribed text from frontend
    """
    if not scam_model:
        raise HTTPException(status_code=500, detail="Scam model not loaded")
    
    transcript = request_data.transcript.strip()
    print(transcript)
    if not transcript:
        raise HTTPException(status_code=400, detail="Empty transcript")
    
    try:
        # Get model prediction
        probability = float(scam_model.predict_proba([transcript])[0][1])
        prediction = scam_model.predict([transcript])[0]
        
        # Detect triggers
        triggers = detect_triggers(transcript)
        
        # Calculate confidence
        if probability >= 0.90 or probability <= 0.10:
            confidence = "HIGH"
        elif probability >= 0.70 or probability <= 0.30:
            confidence = "MEDIUM"
        else:
            confidence = "LOW"
        
        return PredictionResponse(
            is_scam=bool(prediction),
            scam_probability=round(probability, 3),
            safe_probability=round(1 - probability, 3),
            confidence_level=confidence,
            triggers_detected=triggers
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

class AnalyzeScamRequest(BaseModel):
    transcript: str

class AnalyzeScamResponse(BaseModel):
    is_scam: bool
    scam_probability: float
    safe_probability: float
    confidence_level: str
    triggers_detected: list
    summary: Optional[str] = None
    verification_questions: Optional[list] = None
    risk_level: Optional[str] = None
    analysis_error: Optional[str] = None


import asyncio
import time
import os
import httpx
from fastapi import FastAPI, HTTPException

# ... your existing imports and setup ...

# Guard state (module-level)
_agentcore_lock = asyncio.Lock()
_last_agentcore_request_time = 0.0
AGENTCORE_COOLDOWN_SEC = 5  # adjust as needed


@app.post("/api/analyze-scam", response_model=AnalyzeScamResponse)
async def analyze_scam(request_data: AnalyzeScamRequest):
    """
    Orchestrates scam prediction + optional AgentCore deep analysis.
    - Always runs the ML model first
    - If is_scam=True, calls the AgentCore service for LLM analysis
      (but only one request at a time + cooldown to avoid duplicates)
    - Returns merged result; gracefully degrades if AgentCore is unavailable
    """
    transcript = request_data.transcript.strip()
    if not transcript:
        raise HTTPException(status_code=400, detail="Empty transcript")

    if not scam_model:
        raise HTTPException(status_code=500, detail="Scam model not loaded")

    # Step 1: Run ML prediction
    try:
        probability = float(scam_model.predict_proba([transcript])[0][1])
        prediction = scam_model.predict([transcript])[0]
        triggers = detect_triggers(transcript)
        if probability >= 0.90 or probability <= 0.10:
            confidence = "HIGH"
        elif probability >= 0.70 or probability <= 0.30:
            confidence = "MEDIUM"
        else:
            confidence = "LOW"

        pred_result = {
            "is_scam": bool(prediction),
            "scam_probability": round(probability, 3),
            "safe_probability": round(1 - probability, 3),
            "confidence_level": confidence,
            "triggers_detected": triggers,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

    # Step 2: If not a scam, return prediction only
    if not pred_result["is_scam"]:
        return AnalyzeScamResponse(**pred_result)

    if pred_result["scam_probability"] < 0.80:
        return AnalyzeScamResponse(**pred_result)

    # Step 3: Call AgentCore for LLM analysis (with guard)
    global _last_agentcore_request_time

    # Cooldown check: skip AgentCore if we recently sent a request
    now = time.time()
    if now - _last_agentcore_request_time < AGENTCORE_COOLDOWN_SEC:
        return AnalyzeScamResponse(
            **pred_result,
            analysis_error="Request skipped: another analysis is in progress or cooldown active",
        )

    async with _agentcore_lock:
        # Double-check cooldown after acquiring lock (in case two requests raced)
        now = time.time()
        if now - _last_agentcore_request_time < AGENTCORE_COOLDOWN_SEC:
            return AnalyzeScamResponse(
                **pred_result,
                analysis_error="Request skipped: another analysis is in progress or cooldown active",
            )

        _last_agentcore_request_time = now

        agentcore_url = os.getenv("AGENTCORE_INVOCATION_URL", "http://localhost:8080/invocations")

        try:
            async with httpx.AsyncClient(timeout=60.0) as client:
                response = await client.post(
                    agentcore_url,
                    json={
                        "transcript": transcript,
                        "prediction": pred_result,
                    },
                    headers={"Content-Type": "application/json"},
                )
                try:
                    analysis = response.json()
                except Exception:
                    analysis = {}

                if response.status_code == 200 and analysis.get("summary"):
                    return AnalyzeScamResponse(
                        **pred_result,
                        summary=analysis.get("summary"),
                        verification_questions=analysis.get("verification_questions"),
                        risk_level=analysis.get("risk_level"),
                    )

                error_detail = analysis.get("detail", f"AgentCore returned HTTP {response.status_code}")
                return AnalyzeScamResponse(**pred_result, analysis_error=f"AgentCore error: {error_detail}")
        except httpx.TimeoutException:
            return AnalyzeScamResponse(**pred_result, analysis_error="AgentCore request timed out after 30s")
        except httpx.ConnectError:
            return AnalyzeScamResponse(**pred_result, analysis_error="AgentCore service unavailable (connection refused)")
        except Exception as e:
            return AnalyzeScamResponse(**pred_result, analysis_error=f"AgentCore error: {str(e)}")

@app.get("/api/health")
async def health():
    """Health check endpoint"""
    return {
        "status": "ok",
        "message": "Backend is running",
        "model_loaded": scam_model is not None,
        "speaker_model_loaded": speaker_model is not None,
    }


# ---------------------------------------------------------------------------
# Speaker embedding endpoint
# ---------------------------------------------------------------------------

class SpeakerEmbeddingResponse(BaseModel):
    embedding: List[float]  # 192-dimensional ECAPA-TDNN vector
    embedding_dim: int


@app.post("/api/speaker-embedding", response_model=SpeakerEmbeddingResponse)
async def generate_speaker_embedding(audio: UploadFile = File(...)):
    """
    Accept a WAV audio file (ideally 5 seconds, 16 kHz mono) and return a
    192-dimensional ECAPA-TDNN speaker embedding vector.

    The frontend uploads the raw WAV bytes as multipart/form-data under the
    field name 'audio'.
    """
    if speaker_model is None:
        raise HTTPException(
            status_code=503,
            detail="Speaker embedding model is not available. Check server logs.",
        )

    # Read uploaded bytes
    audio_bytes = await audio.read()
    if not audio_bytes:
        raise HTTPException(status_code=400, detail="Empty audio file")

    try:
        import torch
        import torchaudio

        # Write to a temp WAV so torchaudio can decode it
        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
            tmp.write(audio_bytes)
            tmp_path = tmp.name

        try:
            waveform, sample_rate = torchaudio.load(tmp_path)

            # Resample to 16 kHz if needed (ECAPA-TDNN expects 16 kHz)
            if sample_rate != 16000:
                resampler = torchaudio.transforms.Resample(
                    orig_freq=sample_rate, new_freq=16000
                )
                waveform = resampler(waveform)

            # Convert to mono
            if waveform.shape[0] > 1:
                waveform = waveform.mean(dim=0, keepdim=True)

            # SpeechBrain expects shape [batch, time]
            waveform = waveform.squeeze(0).unsqueeze(0)  # [1, T]

            with torch.no_grad():
                embedding = speaker_model.encode_batch(waveform)  # [1, 1, 192]

            vec = embedding.squeeze().cpu().numpy().tolist()  # list of 192 floats
        finally:
            os.unlink(tmp_path)

        return SpeakerEmbeddingResponse(embedding=vec, embedding_dim=len(vec))

    except Exception as e:
        raise HTTPException(
            status_code=500, detail=f"Embedding generation failed: {str(e)}"
        )

def run_backend():
    """Run the FastAPI backend server"""
    import uvicorn
    port = int(os.getenv("BACKEND_PORT", 5000))
    print(f"🚀 Starting FastAPI backend on port {port}")
    print(f"✓ Scam prediction API: POST http://localhost:{port}/api/predict-scam")
    uvicorn.run(app, host="0.0.0.0", port=port, log_level="info")

if __name__ == "__main__":
    run_backend()
