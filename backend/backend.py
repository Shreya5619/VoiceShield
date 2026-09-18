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
import uuid
import json
from decimal import Decimal
from dotenv import load_dotenv
load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), ".env"))
from typing import Optional, List
import joblib
import httpx
import boto3
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
    from speechbrain.inference.classifiers import EncoderClassifier
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


# ---------------------------------------------------------------------------
# Family members stored in DynamoDB. Audio is used only by the embedding
# endpoint and is never included in these records.
# ---------------------------------------------------------------------------
FAMILY_TABLE_NAME = os.getenv("VOICESHIELD_FAMILY_TABLE", "VoiceShieldFamilyMembers")
VOICE_MATCH_THRESHOLD = float(os.getenv("VOICE_MATCH_THRESHOLD", "60.0"))
_dynamodb_table = None


class SpeakerEmbeddingRecord(BaseModel):
    vector: List[float]
    dim: int
    generatedAt: str


class FamilyMemberRequest(BaseModel):
    owner_phone: str
    name: str
    relation: str = ""
    phone: str
    security_question: str = ""
    speaker_embedding: Optional[SpeakerEmbeddingRecord] = None


class FamilyMemberResponse(FamilyMemberRequest):
    id: str


def family_table():
    global _dynamodb_table
    if _dynamodb_table is None:
        _dynamodb_table = boto3.resource(
            "dynamodb", region_name=os.getenv("AWS_REGION", "us-east-1")
        ).Table(FAMILY_TABLE_NAME)
    return _dynamodb_table


def undecimalize(value):
    """Convert Decimal values returned by DynamoDB back to Python-native types."""
    if isinstance(value, Decimal):
        return float(value)
    if isinstance(value, dict):
        return {key: undecimalize(v) for key, v in value.items()}
    if isinstance(value, list):
        return [undecimalize(v) for v in value]
    return value


def family_item_to_response(item: dict) -> FamilyMemberResponse:
    raw_embedding = item.get("speaker_embedding")
    speaker_embedding = undecimalize(raw_embedding) if raw_embedding is not None else None
    return FamilyMemberResponse(
        id=item["id"],
        owner_phone=item["owner_phone"],
        name=item["name"],
        relation=item.get("relation", ""),
        phone=item["phone"],
        security_question=item.get("security_question", ""),
        speaker_embedding=speaker_embedding,
    )


def decimalize(value):
    if isinstance(value, float):
        return Decimal(str(value))
    if isinstance(value, dict):
        return {key: decimalize(item) for key, item in value.items()}
    if isinstance(value, list):
        return [decimalize(item) for item in value]
    return value


@app.get("/api/family-members", response_model=List[FamilyMemberResponse])
async def list_family_members(owner_phone: str):
    try:
        response = family_table().query(
            KeyConditionExpression=boto3.dynamodb.conditions.Key("owner_phone").eq(owner_phone)
        )
        return [family_item_to_response(item) for item in response.get("Items", [])]
    except Exception as exc:
        raise HTTPException(status_code=503, detail=f"Family contacts unavailable: {exc}")


@app.post("/api/family-members", response_model=FamilyMemberResponse)
async def create_family_member(request_data: FamilyMemberRequest):
    item = decimalize(request_data.model_dump())
    item["id"] = f"contact-{uuid.uuid4().hex}"
    try:
        family_table().put_item(Item=item)
        return family_item_to_response(item)
    except Exception as exc:
        raise HTTPException(status_code=503, detail=f"Family contact could not be saved: {exc}")


@app.put("/api/family-members/{member_id}", response_model=FamilyMemberResponse)
async def update_family_member(member_id: str, request_data: FamilyMemberRequest):
    item = decimalize(request_data.model_dump())
    item["id"] = member_id
    try:
        family_table().put_item(Item=item)
        return family_item_to_response(item)
    except Exception as exc:
        raise HTTPException(status_code=503, detail=f"Family contact could not be updated: {exc}")


@app.delete("/api/family-members/{member_id}")
async def delete_family_member(member_id: str, owner_phone: str):
    try:
        family_table().delete_item(Key={"owner_phone": owner_phone, "id": member_id})
        return {"deleted": True}
    except Exception as exc:
        raise HTTPException(status_code=503, detail=f"Family contact could not be deleted: {exc}")


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


# ---------------------------------------------------------------------------
# Voice comparison endpoint
# ---------------------------------------------------------------------------

class VoiceCompareResponse(BaseModel):
    similarity: float          # cosine similarity [-1, 1]
    match_percent: float       # (similarity + 1) / 2 * 100, clamped [0, 100]
    embedding_a_dim: int
    embedding_b_dim: int


def _wav_bytes_to_embedding(audio_bytes: bytes):
    """Shared helper: decode WAV bytes → ECAPA-TDNN 192-d vector (torch.Tensor)."""
    import torch
    import torchaudio

    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
        tmp.write(audio_bytes)
        tmp_path = tmp.name
    try:
        waveform, sample_rate = torchaudio.load(tmp_path)
        if sample_rate != 16000:
            waveform = torchaudio.transforms.Resample(sample_rate, 16000)(waveform)
        if waveform.shape[0] > 1:
            waveform = waveform.mean(dim=0, keepdim=True)
        waveform = waveform.squeeze(0).unsqueeze(0)  # [1, T]
        with torch.no_grad():
            emb = speaker_model.encode_batch(waveform)  # [1, 1, 192]
        return emb.squeeze()  # [192]
    finally:
        os.unlink(tmp_path)


@app.post("/api/compare-voices", response_model=VoiceCompareResponse)
async def compare_voices(
    audio_a: UploadFile = File(...),
    audio_b: UploadFile = File(...),
):
    """
    Accept two WAV files and return cosine similarity + match percentage.
    match_percent = (cosine_similarity + 1) / 2 * 100  →  0 % (opposite) .. 100 % (identical)
    """
    if speaker_model is None:
        raise HTTPException(status_code=503, detail="Speaker embedding model is not available.")

    bytes_a = await audio_a.read()
    bytes_b = await audio_b.read()
    if not bytes_a or not bytes_b:
        raise HTTPException(status_code=400, detail="Both audio files must be non-empty.")

    try:
        import torch
        vec_a = _wav_bytes_to_embedding(bytes_a)
        vec_b = _wav_bytes_to_embedding(bytes_b)

        # Cosine similarity
        cos_sim = float(
            torch.nn.functional.cosine_similarity(
                vec_a.unsqueeze(0), vec_b.unsqueeze(0)
            ).item()
        )
        # Map [-1, 1] → [0, 100]
        match_pct = round(max(0.0, min(100.0, (cos_sim + 1) / 2 * 100)), 2)

        return VoiceCompareResponse(
            similarity=round(cos_sim, 6),
            match_percent=match_pct,
            embedding_a_dim=int(vec_a.shape[0]),
            embedding_b_dim=int(vec_b.shape[0]),
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Comparison failed: {str(e)}")

# ---------------------------------------------------------------------------
# Verify speaker endpoint — compares live audio against a stored embedding
# vector (no need to re-upload the original voice sample WAV).
# ---------------------------------------------------------------------------

class VerifySpeakerResponse(BaseModel):
    similarity: float       # cosine similarity, range -1 to 1
    match_percent: float    # (similarity + 1) / 2 * 100, clamped 0–100
    verified: bool          # match_percent >= 60


@app.post("/api/verify-speaker", response_model=VerifySpeakerResponse)
async def verify_speaker(
    live_audio: UploadFile = File(...),
    stored_embedding: str = Form(...),  # JSON: {"vector": [...], "dim": N, ...}
):
    """
    Compare live call audio against a stored ECAPA-TDNN speaker embedding.
    Accepts the stored embedding as a JSON vector so the original WAV never
    needs to be retained after initial enrolment.
    """
    if speaker_model is None:
        raise HTTPException(
            status_code=503,
            detail="Speaker embedding model is not available.",
        )

    audio_bytes = await live_audio.read()
    if not audio_bytes:
        raise HTTPException(status_code=400, detail="live_audio is empty.")

    # Parse and validate the stored embedding
    try:
        emb_data = json.loads(stored_embedding)
        vector = emb_data.get("vector") or emb_data  # accept bare list too
        if not isinstance(vector, list):
            raise ValueError("vector must be a list")
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"stored_embedding is malformed: {exc}")

    try:
        import torch
        import json as _json  # already imported above
        import numpy as np

        vec_stored = torch.tensor(vector, dtype=torch.float32)

        # Validate dimension matches model output
        expected_dim = speaker_model.encode_batch(
            torch.zeros(1, 16000)
        ).squeeze().shape[0]
        if vec_stored.shape[0] != expected_dim:
            raise HTTPException(
                status_code=400,
                detail=f"stored_embedding has {vec_stored.shape[0]} dimensions; "
                       f"model expects {expected_dim}.",
            )

        # Compute embedding for the live audio
        vec_live = _wav_bytes_to_embedding(audio_bytes)

        # Cosine similarity
        cos_sim = float(
            torch.nn.functional.cosine_similarity(
                vec_stored.unsqueeze(0), vec_live.unsqueeze(0)
            ).item()
        )
        match_pct = round(max(0.0, min(100.0, (cos_sim + 1) / 2 * 100)), 2)

        return VerifySpeakerResponse(
            similarity=round(cos_sim, 6),
            match_percent=match_pct,
            verified=match_pct >= VOICE_MATCH_THRESHOLD,
        )
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Verification failed: {exc}")

# ---------------------------------------------------------------------------
# VAD + Diarization + Speaker Identification Pipeline
#
# POST /api/analyze-audio-segment
#
# Accepts a raw 16 kHz mono 16-bit PCM audio chunk (multipart WAV) plus
# optional JSON-encoded enrolled speaker embeddings (owner + family contacts).
# Returns per-segment speaker labels (SELF / FAMILY_<name> / UNKNOWN) and
# the concatenated audio bytes for UNKNOWN/caller segments only — ready to
# be piped straight to Amazon Transcribe.
#
# Design:
#   1. Energy-based VAD: frame the waveform into 30 ms windows, threshold RMS.
#   2. Simple diarization: merge adjacent frames with the same VAD state into
#      speech segments, then split on >300 ms silences.
#   3. Speaker ID per segment: extract ECAPA-TDNN embedding, cosine-compare
#      against each enrolled embedding (owner first, then family contacts).
#      Highest similarity above a threshold wins; otherwise UNKNOWN.
#   4. Routing: SELF → discard, FAMILY → privacy-preserve (discard),
#      UNKNOWN → forward to Transcribe.
# ---------------------------------------------------------------------------

import struct

class EnrolledSpeaker(BaseModel):
    label: str                # e.g. "SELF", "FAMILY_Mom", "FAMILY_Alice"
    embedding: List[float]    # 192-d ECAPA-TDNN vector


class AudioSegmentRequest(BaseModel):
    """Parsed model for the non-audio fields sent alongside the WAV upload."""
    enrolled_speakers: List[EnrolledSpeaker] = []
    # similarity threshold [0,1]; default maps to match_percent ≥ 55 %
    identification_threshold: float = 0.10   # cosine in [-1,1]; 55 % match ≈ 0.10


class SegmentResult(BaseModel):
    speaker_label: str        # SELF | FAMILY_<name> | UNKNOWN
    start_ms: float
    end_ms: float
    duration_ms: float
    similarity: Optional[float] = None   # best cosine similarity found
    route: str                # "discard" | "transcribe"


class AudioAnalysisResponse(BaseModel):
    segments: List[SegmentResult]
    caller_audio_b64: Optional[str] = None  # base64 WAV of caller-only audio
    caller_duration_ms: float = 0.0
    has_speech: bool = False
    speaker_summary: dict = {}             # label → total_ms


def _rms(samples: "np.ndarray") -> float:
    """Root mean square energy of a numpy float32 frame."""
    import numpy as np
    return float(np.sqrt(np.mean(samples ** 2)))


def _energy_vad(
    waveform: "np.ndarray",
    sample_rate: int = 16000,
    frame_ms: int = 30,
    energy_threshold: float = 0.005,
    min_speech_ms: int = 100,
    min_silence_ms: int = 300,
) -> List[dict]:
    """
    Simple energy-based VAD returning a list of speech regions:
      [{"start_ms": float, "end_ms": float}, ...]
    """
    import numpy as np

    frame_size = int(sample_rate * frame_ms / 1000)
    total_frames = len(waveform) // frame_size

    is_speech = []
    for i in range(total_frames):
        frame = waveform[i * frame_size: (i + 1) * frame_size]
        is_speech.append(_rms(frame) >= energy_threshold)

    # Merge frames into speech/silence runs
    regions = []
    i = 0
    while i < len(is_speech):
        if is_speech[i]:
            j = i
            while j < len(is_speech) and is_speech[j]:
                j += 1
            # Convert frame indices → ms
            start_ms = i * frame_ms
            end_ms = j * frame_ms
            if (end_ms - start_ms) >= min_speech_ms:
                regions.append({"start_ms": float(start_ms), "end_ms": float(end_ms)})
            i = j
        else:
            i += 1

    # Merge regions separated by short silences
    if not regions:
        return regions
    merged = [regions[0]]
    for r in regions[1:]:
        gap = r["start_ms"] - merged[-1]["end_ms"]
        if gap < min_silence_ms:
            merged[-1]["end_ms"] = r["end_ms"]   # bridge the gap
        else:
            merged.append(r)
    return merged


def _extract_segment_embedding(waveform: "np.ndarray", start_ms: float, end_ms: float, sample_rate: int = 16000):
    """Extract ECAPA-TDNN embedding for [start_ms, end_ms] of waveform."""
    import torch
    import numpy as np

    start_sample = int(start_ms / 1000 * sample_rate)
    end_sample   = int(end_ms   / 1000 * sample_rate)
    segment = waveform[start_sample:end_sample].astype(np.float32)

    # Need at least ~0.5 s for a meaningful embedding
    if len(segment) < sample_rate // 2:
        return None

    tensor = torch.tensor(segment).unsqueeze(0)   # [1, T]
    with torch.no_grad():
        emb = speaker_model.encode_batch(tensor)   # [1, 1, D]
    return emb.squeeze()   # [D]


def _identify_speaker(
    live_emb: "torch.Tensor",
    enrolled: List[EnrolledSpeaker],
    threshold: float,
) -> tuple:
    """
    Compare live_emb against all enrolled speakers.
    Returns (best_label, best_similarity) or ("UNKNOWN", similarity) if no match.
    """
    import torch

    best_label = "UNKNOWN"
    best_sim   = -2.0

    for sp in enrolled:
        stored = torch.tensor(sp.embedding, dtype=torch.float32)
        cos_sim = float(
            torch.nn.functional.cosine_similarity(
                live_emb.unsqueeze(0), stored.unsqueeze(0)
            ).item()
        )
        if cos_sim > best_sim:
            best_sim   = cos_sim
            best_label = sp.label if cos_sim >= threshold else "UNKNOWN"

    return best_label, best_sim


def _pcm_segment_to_wav(samples: "np.ndarray", sample_rate: int = 16000) -> bytes:
    """Convert float32 numpy array to 16-bit PCM WAV bytes."""
    import numpy as np
    import struct as _struct

    int16 = np.clip(samples * 32767, -32768, 32767).astype(np.int16)
    pcm_bytes = int16.tobytes()
    data_size  = len(pcm_bytes)
    header_size = 44

    buf = bytearray(header_size + data_size)
    # RIFF header
    buf[0:4]   = b'RIFF'
    _struct.pack_into('<I', buf, 4,  36 + data_size)
    buf[8:12]  = b'WAVE'
    buf[12:16] = b'fmt '
    _struct.pack_into('<I',  buf, 16, 16)          # sub-chunk size
    _struct.pack_into('<H',  buf, 20, 1)           # PCM
    _struct.pack_into('<H',  buf, 22, 1)           # mono
    _struct.pack_into('<I',  buf, 24, sample_rate)
    _struct.pack_into('<I',  buf, 28, sample_rate * 2)  # byte rate
    _struct.pack_into('<H',  buf, 32, 2)           # block align
    _struct.pack_into('<H',  buf, 34, 16)          # bits per sample
    buf[36:40] = b'data'
    _struct.pack_into('<I',  buf, 40, data_size)
    buf[44:]   = pcm_bytes
    return bytes(buf)


@app.post("/api/analyze-audio-segment", response_model=AudioAnalysisResponse)
async def analyze_audio_segment(
    audio: UploadFile = File(...),
    enrolled_speakers: str = Form(default="[]"),
    identification_threshold: str = Form(default="0.10"),
):
    """
    VAD → Diarization → Speaker Identification → Routing

    Accept a WAV file (any sample rate, mono or stereo) plus enrolled speaker
    embeddings as JSON.  Returns labelled segments and the caller-only WAV
    (base64) that should be forwarded to Amazon Transcribe.

    Speaker labels:
      SELF          → owner's own voice (discard)
      FAMILY_<name> → enrolled family contact (privacy-preserve, discard)
      UNKNOWN       → the external caller (route to Transcribe + scam engine)
    """
    if speaker_model is None:
        raise HTTPException(
            status_code=503,
            detail="Speaker embedding model is not available. Cannot perform diarization.",
        )

    import numpy as np
    import torch

    # ── Parse form fields ────────────────────────────────────────────────────
    try:
        enrolled_list = json.loads(enrolled_speakers)
        enrolled = [EnrolledSpeaker(**s) for s in enrolled_list]
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"enrolled_speakers malformed: {exc}")

    try:
        threshold = float(identification_threshold)
    except ValueError:
        threshold = 0.10

    # ── Decode WAV ───────────────────────────────────────────────────────────
    audio_bytes = await audio.read()
    if not audio_bytes:
        raise HTTPException(status_code=400, detail="audio file is empty")

    try:
        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
            tmp.write(audio_bytes)
            tmp_path = tmp.name

        try:
            import torchaudio
            waveform, sample_rate = torchaudio.load(tmp_path)

            # Resample to 16 kHz
            if sample_rate != 16000:
                waveform = torchaudio.transforms.Resample(sample_rate, 16000)(waveform)
                sample_rate = 16000

            # Convert to mono float32 numpy
            if waveform.shape[0] > 1:
                waveform = waveform.mean(dim=0, keepdim=True)
            wave_np = waveform.squeeze(0).numpy().astype(np.float32)
        finally:
            os.unlink(tmp_path)

    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Audio decoding failed: {exc}")

    total_ms = len(wave_np) / sample_rate * 1000.0

    # ── Step 1: Energy VAD ───────────────────────────────────────────────────
    speech_regions = _energy_vad(wave_np, sample_rate=sample_rate)

    if not speech_regions:
        return AudioAnalysisResponse(
            segments=[],
            has_speech=False,
            caller_audio_b64=None,
            caller_duration_ms=0.0,
            speaker_summary={},
        )

    # ── Step 2 + 3: Per-region embedding → speaker ID ────────────────────────
    segments_out: List[SegmentResult] = []
    caller_chunks: List[np.ndarray] = []

    speaker_totals: dict = {}

    for region in speech_regions:
        start_ms = region["start_ms"]
        end_ms   = region["end_ms"]
        dur_ms   = end_ms - start_ms

        # Extract embedding (may return None for very short regions)
        emb = _extract_segment_embedding(wave_np, start_ms, end_ms, sample_rate)

        if emb is None:
            # Too short to identify — treat as UNKNOWN to be safe
            label, sim = "UNKNOWN", None
        elif enrolled:
            label, sim = _identify_speaker(emb, enrolled, threshold)
        else:
            # No enrolled speakers → everything goes to Transcribe
            label, sim = "UNKNOWN", None

        # ── Step 4: Routing ─────────────────────────────────────────────────
        if label == "SELF" or label.startswith("FAMILY_"):
            route = "discard"
        else:
            route = "transcribe"
            # Collect PCM samples for this segment
            s_sample = int(start_ms / 1000 * sample_rate)
            e_sample = int(end_ms   / 1000 * sample_rate)
            caller_chunks.append(wave_np[s_sample:e_sample])

        seg = SegmentResult(
            speaker_label=label,
            start_ms=start_ms,
            end_ms=end_ms,
            duration_ms=dur_ms,
            similarity=round(sim, 4) if sim is not None else None,
            route=route,
        )
        segments_out.append(seg)

        speaker_totals[label] = speaker_totals.get(label, 0.0) + dur_ms

    # ── Assemble caller-only WAV ─────────────────────────────────────────────
    caller_audio_b64: Optional[str] = None
    caller_duration_ms = 0.0

    if caller_chunks:
        caller_wave = np.concatenate(caller_chunks, axis=0)
        caller_duration_ms = len(caller_wave) / sample_rate * 1000.0
        wav_bytes = _pcm_segment_to_wav(caller_wave, sample_rate)
        caller_audio_b64 = base64.b64encode(wav_bytes).decode("utf-8")

    return AudioAnalysisResponse(
        segments=segments_out,
        caller_audio_b64=caller_audio_b64,
        caller_duration_ms=round(caller_duration_ms, 1),
        has_speech=True,
        speaker_summary={k: round(v, 1) for k, v in speaker_totals.items()},
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



