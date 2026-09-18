"""
Python FastAPI backend for Scam Detection
Frontend sends transcribed text, backend returns scam predictions using ML model
"""

import sys
import re
import os
from dotenv import load_dotenv
load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), ".env"))
from typing import Optional
import joblib
import httpx
from fastapi import FastAPI, HTTPException
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


@app.post("/api/analyze-scam", response_model=AnalyzeScamResponse)
async def analyze_scam(request_data: AnalyzeScamRequest):
    """
    Orchestrates scam prediction + optional AgentCore deep analysis.
    - Always runs the ML model first
    - If is_scam=True, calls the AgentCore service for LLM analysis
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

    # Step 3: Call AgentCore for LLM analysis
    agentcore_url = os.getenv("AGENTCORE_INVOCATION_URL", "http://localhost:8080/invocations")

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(
                agentcore_url,
                json={
                    "transcript": transcript,
                    "prediction": pred_result,
                },
                headers={"Content-Type": "application/json"},
            )
            response.raise_for_status()
            analysis = response.json()
            return AnalyzeScamResponse(
                **pred_result,
                summary=analysis.get("summary"),
                verification_questions=analysis.get("verification_questions"),
                risk_level=analysis.get("risk_level"),
            )
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
        "model_loaded": scam_model is not None
    }

def run_backend():
    """Run the FastAPI backend server"""
    import uvicorn
    port = int(os.getenv("BACKEND_PORT", 5000))
    print(f"🚀 Starting FastAPI backend on port {port}")
    print(f"✓ Scam prediction API: POST http://localhost:{port}/api/predict-scam")
    uvicorn.run(app, host="0.0.0.0", port=port, log_level="info")

if __name__ == "__main__":
    run_backend()
