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
from datetime import datetime, timezone
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
    source_language: Optional[str] = None  # BCP-47 code, e.g. 'hi-IN' (None = English)

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
# IndicTTS Deepfake Detector model
# DistilHuBERT with classification head for AI-generated speech detection
# ---------------------------------------------------------------------------
_deepfake_model = None
_deepfake_feature_extractor = None

print("📦 Loading IndicTTS Deepfake Detector model...")
try:
    from transformers import AutoModelForAudioClassification, AutoFeatureExtractor
    import torch
    
    _deepfake_feature_extractor = AutoFeatureExtractor.from_pretrained("Khon198/indictts-deepfake-detector")
    _deepfake_model = AutoModelForAudioClassification.from_pretrained("Khon198/indictts-deepfake-detector")
    _deepfake_model.eval()  # Set to evaluation mode
    print("✓ IndicTTS Deepfake Detector loaded successfully")
except Exception as e:
    print(f"❌ Error loading IndicTTS Deepfake Detector: {e}", file=sys.stderr)
    _deepfake_model = None
    _deepfake_feature_extractor = None

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

# ---------------------------------------------------------------------------
# Amazon Translate client — used to convert Hindi transcripts to English
# before they reach the scam-detection model.
# ---------------------------------------------------------------------------
_translate_client = None

def translate_client():
    global _translate_client
    if _translate_client is None:
        _translate_client = boto3.client(
            "translate",
            region_name=os.getenv("AWS_REGION", "us-east-1"),
        )
    return _translate_client


def translate_to_english(text: str, source_lang: str) -> str:
    """
    Translate *text* from *source_lang* to English using Amazon Translate.
    *source_lang* should be the language part of a BCP-47 tag, e.g. 'hi' from 'hi-IN'.
    Returns the original text unchanged on any error so the pipeline degrades
    gracefully rather than crashing.
    """
    if not text.strip():
        return text
    try:
        # Strip the region subtag if present: 'hi-IN' → 'hi'
        lang_code = source_lang.split("-")[0].lower()
        result = translate_client().translate_text(
            Text=text,
            SourceLanguageCode=lang_code,
            TargetLanguageCode="en",
        )
        return result["TranslatedText"]
    except Exception as exc:
        print(f"⚠️  Translation error ({source_lang} → en): {exc}", file=sys.stderr)
        return text


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
    ],
    # ── Hindi / Hinglish patterns (transliterated common scam phrases) ──────
    # These match post-translation English output AND raw Hinglish mix-ins
    "urgent payment request (hindi)": [
        r"\bpaise\b",           # money
        r"\bpaisa\b",
        r"\bpay kar\b",
        r"\btransfer kar\b",
        r"\bturant.*bhej\b",    # immediately send
        r"\babhi.*bhej\b",      # send now
        r"\bjama kar\b",        # deposit
    ],
    "account suspension threat (hindi)": [
        r"\bband ho\b",         # will be blocked
        r"\bblock ho\b",
        r"\bband kar\b",
        r"\bsuspend ho\b",
        r"\bkhata.*band\b",     # account closed
    ],
    "financial information request (hindi)": [
        r"\botp.*batao\b",      # tell OTP
        r"\bpin.*batao\b",
        r"\bpassword.*batao\b",
        r"\bcard.*number.*batao\b",
        r"\bbank.*details.*do\b",
    ],
    "legal threat (hindi)": [
        r"\bgiraftaar\b",       # arrested
        r"\bfir\b",             # police complaint
        r"\bpulice\b",
        r"\bpolice.*aayegi\b",  # police will come
        r"\bjurmana\b",         # fine
        r"\bjel\b",             # jail
        r"\bjail\b",
    ],
    "prize or reward scam (hindi)": [
        r"\binaam\b",           # prize
        r"\bjeeta hai\b",       # you have won
        r"\bjeet gaye\b",
        r"\blottery.*lagi\b",
        r"\bselected.*ho\b",
    ],
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
    Predict whether a transcript is a scam.
    If source_language is provided and is not English, the transcript is
    translated to English first before running the ML model.
    """
    if not scam_model:
        raise HTTPException(status_code=500, detail="Scam model not loaded")
    
    transcript = request_data.transcript.strip()
    print(transcript)
    if not transcript:
        raise HTTPException(status_code=400, detail="Empty transcript")

    # Translate non-English transcripts to English before prediction
    source_lang = request_data.source_language
    if source_lang and not source_lang.lower().startswith("en"):
        print(f"🌐 Translating predict-scam input from {source_lang} to English")
        transcript = translate_to_english(transcript, source_lang)
        print(f"🌐 Translated: {transcript}")
    
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


# ---------------------------------------------------------------------------
# Translation endpoint — called by the frontend to translate a single segment
# ---------------------------------------------------------------------------

class TranslateRequest(BaseModel):
    text: str
    source_language: str  # BCP-47 code, e.g. 'hi-IN'


class TranslateResponse(BaseModel):
    translated_text: str
    source_language: str
    target_language: str = "en"


@app.post("/api/translate", response_model=TranslateResponse)
async def translate_text(request_data: TranslateRequest):
    """
    Translate a text segment to English using Amazon Translate.
    Called when AWS Transcribe detects a non-English language (e.g. hi-IN).
    """
    text = request_data.text.strip()
    if not text:
        raise HTTPException(status_code=400, detail="Empty text")

    source_lang = request_data.source_language
    if source_lang.lower().startswith("en"):
        # Already English — return as-is
        return TranslateResponse(
            translated_text=text,
            source_language=source_lang,
        )

    translated = translate_to_english(text, source_lang)
    return TranslateResponse(
        translated_text=translated,
        source_language=source_lang,
    )


class LanguagePreference(BaseModel):
    user_phone: str
    language_code: str  # 'en' or 'hi'

class AnalyzeScamRequest(BaseModel):
    transcript: str
    source_language: Optional[str] = None  # BCP-47 code, e.g. 'hi-IN' (detected language from audio)
    user_language: Optional[str] = "en"  # 'en' or 'hi' - user's preferred language for AI responses

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
VOICE_SHARES_TABLE_NAME = os.getenv("VOICESHIELD_VOICE_SHARES_TABLE", "VoiceShieldVoiceShares")
INBOX_TABLE_NAME = os.getenv("VOICESHIELD_INBOX_TABLE", "VoiceShieldInbox")
PUSH_TABLE_NAME = os.getenv("VOICESHIELD_PUSH_TABLE", "VoiceShieldPushSubscriptions")
VOICE_MATCH_THRESHOLD = float(os.getenv("VOICE_MATCH_THRESHOLD", "60.0"))
_dynamodb_table = None
_voice_shares_table = None
_inbox_table = None
_push_table = None


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
    is_emergency_contact: bool = False


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
        is_emergency_contact=bool(item.get("is_emergency_contact", False)),
    )


def decimalize(value):
    if isinstance(value, float):
        return Decimal(str(value))
    if isinstance(value, dict):
        return {key: decimalize(item) for key, item in value.items()}
    if isinstance(value, list):
        return [decimalize(item) for item in value]
    return value


def voice_shares_table():
    global _voice_shares_table
    if _voice_shares_table is None:
        _voice_shares_table = boto3.resource(
            "dynamodb", region_name=os.getenv("AWS_REGION", "us-east-1")
        ).Table(VOICE_SHARES_TABLE_NAME)
    return _voice_shares_table


def inbox_table():
    global _inbox_table
    if _inbox_table is None:
        _inbox_table = boto3.resource(
            "dynamodb", region_name=os.getenv("AWS_REGION", "us-east-1")
        ).Table(INBOX_TABLE_NAME)
    return _inbox_table


def push_table():
    global _push_table
    if _push_table is None:
        _push_table = boto3.resource(
            "dynamodb", region_name=os.getenv("AWS_REGION", "us-east-1")
        ).Table(PUSH_TABLE_NAME)
    return _push_table


class PushSubscriptionRequest(BaseModel):
    recipient_phone: str
    subscription: dict


@app.post("/api/push-subscriptions")
async def save_push_subscription(request_data: PushSubscriptionRequest):
    endpoint = request_data.subscription.get("endpoint")
    if not endpoint:
        raise HTTPException(status_code=400, detail="Push subscription endpoint is required")
    item = {
        "recipient_phone": request_data.recipient_phone,
        "id": uuid.uuid5(uuid.NAMESPACE_URL, endpoint).hex,
        "subscription": request_data.subscription,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    try:
        push_table().put_item(Item=item)
        return {"saved": True}
    except Exception as exc:
        raise HTTPException(status_code=503, detail=f"Push subscription could not be saved: {exc}")


def send_push(recipient_phone: str, title: str, message: str):
    vapid_private_key = os.getenv("VAPID_PRIVATE_KEY")
    vapid_subject = os.getenv("VAPID_SUBJECT", "mailto:admin@example.com")
    if not vapid_private_key:
        return
    try:
        from pywebpush import webpush
        subscriptions = push_table().query(
            KeyConditionExpression=boto3.dynamodb.conditions.Key("recipient_phone").eq(recipient_phone)
        ).get("Items", [])
        for item in subscriptions:
            try:
                webpush(
                    subscription_info=item["subscription"],
                    data=json.dumps({"title": title, "body": message}),
                    vapid_private_key=vapid_private_key,
                    vapid_claims={"sub": vapid_subject},
                )
            except Exception:
                continue
    except Exception:
        return


class VoiceShareRequest(BaseModel):
    sender_phone: str
    sender_name: str = "VoiceShield member"
    recipient_phone: str
    speaker_embedding: SpeakerEmbeddingRecord


class VoiceShareResponse(BaseModel):
    id: str
    sender_phone: str
    sender_name: str
    recipient_phone: str
    speaker_embedding: SpeakerEmbeddingRecord
    status: str
    created_at: str


class InboxItemResponse(BaseModel):
    id: str
    recipient_phone: str
    item_type: str
    title: str
    message: str
    share_id: Optional[str] = None
    sender_phone: Optional[str] = None
    sender_name: Optional[str] = None
    speaker_embedding: Optional[SpeakerEmbeddingRecord] = None
    status: str
    created_at: str


def share_response(item: dict) -> VoiceShareResponse:
    return VoiceShareResponse(
        id=item["id"], sender_phone=item["sender_phone"],
        sender_name=item.get("sender_name", "VoiceShield member"),
        recipient_phone=item["recipient_phone"],
        speaker_embedding=undecimalize(item["speaker_embedding"]),
        status=item["status"], created_at=item["created_at"],
    )


def inbox_response(item: dict) -> InboxItemResponse:
    return InboxItemResponse(
        id=item["id"], recipient_phone=item["recipient_phone"],
        item_type=item["item_type"], title=item["title"],
        message=item["message"], share_id=item.get("share_id"),
        sender_phone=item.get("sender_phone"), sender_name=item.get("sender_name"),
        speaker_embedding=undecimalize(item.get("speaker_embedding"))
        if item.get("speaker_embedding") else None,
        status=item["status"], created_at=item["created_at"],
    )


@app.post("/api/voice-shares", response_model=VoiceShareResponse)
async def create_voice_share(request_data: VoiceShareRequest):
    if request_data.sender_phone == request_data.recipient_phone:
        raise HTTPException(status_code=400, detail="You cannot send a voice share to yourself")
    share_id = f"share-{uuid.uuid4().hex}"
    created_at = datetime.now(timezone.utc).isoformat()
    item = decimalize({**request_data.model_dump(), "id": share_id, "status": "pending", "created_at": created_at})
    inbox_item = decimalize({
        "id": f"inbox-{uuid.uuid4().hex}", "recipient_phone": request_data.recipient_phone,
        "item_type": "voice_share", "title": "New voice sample",
        "message": f"{request_data.sender_name} sent you a voice sample to save.",
        "share_id": share_id, "sender_phone": request_data.sender_phone,
        "sender_name": request_data.sender_name,
        "speaker_embedding": request_data.speaker_embedding.model_dump(),
        "status": "pending", "created_at": created_at,
    })
    try:
        voice_shares_table().put_item(Item=item)
        inbox_table().put_item(Item=inbox_item)
        send_push(request_data.recipient_phone, "New voice sample", inbox_item["message"])
        return share_response(item)
    except Exception as exc:
        raise HTTPException(status_code=503, detail=f"Voice share could not be sent: {exc}")


@app.get("/api/inbox", response_model=List[InboxItemResponse])
async def list_inbox(recipient_phone: str):
    try:
        response = inbox_table().query(
            KeyConditionExpression=boto3.dynamodb.conditions.Key("recipient_phone").eq(recipient_phone)
        )
        items = sorted(response.get("Items", []), key=lambda item: item.get("created_at", ""), reverse=True)
        return [inbox_response(item) for item in items]
    except Exception as exc:
        raise HTTPException(status_code=503, detail=f"Inbox unavailable: {exc}")


class VoiceShareDecision(BaseModel):
    recipient_phone: str
    action: str
    name: Optional[str] = None
    relation: str = ""
    phone: Optional[str] = None
    security_question: str = ""


@app.post("/api/voice-shares/{share_id}/decision", response_model=InboxItemResponse)
async def decide_voice_share(share_id: str, decision: VoiceShareDecision):
    if decision.action not in {"accept", "reject"}:
        raise HTTPException(status_code=400, detail="action must be accept or reject")
    try:
        share = voice_shares_table().get_item(Key={"id": share_id}).get("Item")
        if not share or share.get("recipient_phone") != decision.recipient_phone:
            raise HTTPException(status_code=404, detail="Voice share not found")
        if share.get("status") != "pending":
            raise HTTPException(status_code=409, detail="Voice share was already handled")
        if decision.action == "accept":
            member_phone = decision.phone or share["sender_phone"]
            existing = family_table().query(
                KeyConditionExpression=boto3.dynamodb.conditions.Key("owner_phone").eq(decision.recipient_phone)
            ).get("Items", [])
            existing_member = next((item for item in existing if item.get("phone") == member_phone), None)
            member = {
                "owner_phone": decision.recipient_phone,
                "id": existing_member["id"] if existing_member else f"contact-{uuid.uuid4().hex}",
                "name": decision.name or share.get("sender_name", "Family member"),
                "relation": decision.relation,
                "phone": member_phone,
                "security_question": decision.security_question,
                "speaker_embedding": share["speaker_embedding"],
                "is_emergency_contact": existing_member.get("is_emergency_contact", False) if existing_member else False,
            }
            family_table().put_item(Item=member)
        voice_shares_table().update_item(
            Key={"id": share_id}, UpdateExpression="SET #status = :status",
            ExpressionAttributeNames={"#status": "status"},
            ExpressionAttributeValues={":status": decision.action + "ed"},
        )
        inbox_item = next((item for item in inbox_table().query(
            KeyConditionExpression=boto3.dynamodb.conditions.Key("recipient_phone").eq(decision.recipient_phone)
        ).get("Items", []) if item.get("share_id") == share_id), None)
        if not inbox_item:
            raise HTTPException(status_code=404, detail="Inbox item not found")
        inbox_table().update_item(
            Key={"recipient_phone": decision.recipient_phone, "id": inbox_item["id"]},
            UpdateExpression="SET #status = :status", ExpressionAttributeNames={"#status": "status"},
            ExpressionAttributeValues={":status": decision.action + "ed"},
        )
        inbox_item["status"] = decision.action + "ed"
        return inbox_response(inbox_item)
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=503, detail=f"Voice share decision failed: {exc}")

class SpamAlertRequest(BaseModel):
    owner_phone: str
    caller_phone: str = "Unknown caller"
    caller_name: str = "Unknown caller"
    scam_probability: float = 0.0
    risk_level: Optional[str] = None
    summary: str = ""
    idempotency_key: str


class SpamAlertResponse(BaseModel):
    alert_id: str
    recipient_count: int
    duplicate: bool = False


@app.post("/api/spam-alerts", response_model=SpamAlertResponse)
async def create_spam_alert(request_data: SpamAlertRequest):
    alert_id = f"alert-{request_data.idempotency_key}"
    try:
        existing = inbox_table().get_item(Key={"recipient_phone": request_data.owner_phone, "id": alert_id}).get("Item")
        if existing:
            return SpamAlertResponse(alert_id=alert_id, recipient_count=0, duplicate=True)

        contacts = family_table().query(
            KeyConditionExpression=boto3.dynamodb.conditions.Key("owner_phone").eq(request_data.owner_phone)
        ).get("Items", [])
        emergency_contacts = [contact for contact in contacts if contact.get("is_emergency_contact")]
        created_at = datetime.now(timezone.utc).isoformat()
        owner_alert = decimalize({
            "recipient_phone": request_data.owner_phone, "id": alert_id,
            "item_type": "spam_alert", "title": "Spam call blocked",
            "message": request_data.summary or f"A suspicious call from {request_data.caller_name} was blocked.",
            "status": "unread", "created_at": created_at,
            "caller_phone": request_data.caller_phone,
            "scam_probability": request_data.scam_probability,
            "risk_level": request_data.risk_level or "HIGH",
        })
        inbox_table().put_item(Item=owner_alert, ConditionExpression="attribute_not_exists(id)")
        for contact in emergency_contacts:
            emergency_alert = dict(owner_alert)
            emergency_alert["recipient_phone"] = contact["phone"]
            emergency_alert["id"] = f"{alert_id}-{contact['id']}"
            emergency_alert["title"] = "Emergency scam alert"
            inbox_table().put_item(Item=emergency_alert)
            send_push(contact["phone"], emergency_alert["title"], emergency_alert["message"])
        return SpamAlertResponse(alert_id=alert_id, recipient_count=len(emergency_contacts))
    except Exception as exc:
        if "ConditionalCheckFailed" in str(exc):
            return SpamAlertResponse(alert_id=alert_id, recipient_count=0, duplicate=True)
        raise HTTPException(status_code=503, detail=f"Spam alert could not be created: {exc}")


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


# ---------------------------------------------------------------------------
# Language Preference Storage
# ---------------------------------------------------------------------------

LANGUAGE_PREFERENCES_TABLE = os.getenv("VOICESHIELD_LANGUAGE_PREFERENCES", "VoiceShieldLanguagePreferences")
_language_preferences_table = None


def language_preferences_table():
    global _language_preferences_table
    if _language_preferences_table is None:
        _language_preferences_table = boto3.resource(
            "dynamodb", region_name=os.getenv("AWS_REGION", "us-east-1")
        ).Table(LANGUAGE_PREFERENCES_TABLE)
    return _language_preferences_table


class LanguagePreferenceRequest(BaseModel):
    user_phone: str
    language_code: str  # 'en' or 'hi'


class LanguagePreferenceResponse(BaseModel):
    user_phone: str
    language_code: str
    created_at: str
    updated_at: str


@app.get("/api/language-preference", response_model=Optional[LanguagePreferenceResponse])
async def get_language_preference(user_phone: str):
    """Get user's preferred language"""
    try:
        table = language_preferences_table()
        response = table.get_item(Key={"user_phone": user_phone})
        item = response.get("Item")
        if item:
            return LanguagePreferenceResponse(
                user_phone=item["user_phone"],
                language_code=item["language_code"],
                created_at=item["created_at"],
                updated_at=item.get("updated_at", item["created_at"]),
            )
        return None
    except Exception as exc:
        raise HTTPException(status_code=503, detail=f"Language preference unavailable: {exc}")


@app.post("/api/language-preference", response_model=LanguagePreferenceResponse)
async def create_or_update_language_preference(request_data: LanguagePreferenceRequest):
    """Create or update user's language preference"""
    current_time = datetime.now(timezone.utc).isoformat()
    try:
        table = language_preferences_table()
        
        # Check if preference exists
        existing = table.get_item(Key={"user_phone": request_data.user_phone}).get("Item")
        if existing:
            # Update existing
            table.update_item(
                Key={"user_phone": request_data.user_phone},
                UpdateExpression="SET language_code = :lang, updated_at = :updated",
                ExpressionAttributeValues={
                    ":lang": request_data.language_code,
                    ":updated": current_time,
                },
            )
            return LanguagePreferenceResponse(
                user_phone=request_data.user_phone,
                language_code=request_data.language_code,
                created_at=existing["created_at"],
                updated_at=current_time,
            )
        else:
            # Create new
            item = {
                "user_phone": request_data.user_phone,
                "language_code": request_data.language_code,
                "created_at": current_time,
                "updated_at": current_time,
            }
            table.put_item(Item=item)
            return LanguagePreferenceResponse(
                user_phone=request_data.user_phone,
                language_code=request_data.language_code,
                created_at=current_time,
                updated_at=current_time,
            )
    except Exception as exc:
        raise HTTPException(status_code=503, detail=f"Language preference could not be saved: {exc}")


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

    # Translate non-English transcripts to English before running the ML model
    source_lang = request_data.source_language
    if source_lang and not source_lang.lower().startswith("en"):
        print(f"🌐 Translating analyze-scam input from {source_lang} to English")
        transcript = translate_to_english(transcript, source_lang)
        print(f"🌐 Translated: {transcript}")

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
        print(f"⚠️  Not calling AgentCore: is_scam={pred_result['is_scam']}, probability={pred_result['scam_probability']}")
        return AnalyzeScamResponse(**pred_result)

    # Threshold: Send to AgentCore for LLM analysis if scam probability >= 0.70 (70%)
    # This balances sensitivity with avoiding too many false positive deep analyses
    if pred_result["scam_probability"] < 0.70:
        print(f"⚠️  Not calling AgentCore: probability {pred_result['scam_probability']} < 0.70 threshold")
        return AnalyzeScamResponse(**pred_result)

    print(f"✅ Calling AgentCore: is_scam={pred_result['is_scam']}, probability={pred_result['scam_probability']}")

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
        print(f"🌐 Sending request to AgentCore at {agentcore_url}")

        try:
            # Use the user's preferred language for AI responses (from frontend setting)
            user_language = request_data.user_language or "en"
            print(f"🌐 User preferred language: {user_language}")
            
            async with httpx.AsyncClient(timeout=60.0) as client:
                response = await client.post(
                    agentcore_url,
                    json={
                        "transcript": transcript,
                        "prediction": pred_result,
                        "user_language": user_language,
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



# ---------------------------------------------------------------------------
# IndicTTS Deepfake Detector - AI-generated speech detection
# ---------------------------------------------------------------------------

class DeepfakeDetectionRequest(BaseModel):
    """Audio file for deepfake detection."""
    pass  # Audio is passed as multipart file upload

class DeepfakeDetectionResponse(BaseModel):
    """Response from deepfake detection."""
    is_ai_generated: bool
    ai_probability: float
    human_probability: float
    confidence_level: str
    detection_model: str = "indictts-deepfake-detector"
    detection_error: Optional[str] = None


# Deepfake detector model (initialized lazily)
_deepfake_model = None
_deepfake_feature_extractor = None


def load_deepfake_detector():
    """Load the IndicTTS Deepfake Detector model."""
    global _deepfake_model, _deepfake_feature_extractor
    
    if _deepfake_model is not None:
        return _deepfake_model, _deepfake_feature_extractor
    
    try:
        from transformers import AutoModelForAudioClassification, AutoFeatureExtractor
        import torch
        
        print("📦 Loading IndicTTS Deepfake Detector model...")
        model_name = "Khon198/indictts-deepfake-detector"
        
        _deepfake_feature_extractor = AutoFeatureExtractor.from_pretrained(model_name)
        _deepfake_model = AutoModelForAudioClassification.from_pretrained(model_name)
        _deepfake_model.eval()  # Set to evaluation mode
        
        print("✓ IndicTTS Deepfake Detector loaded successfully")
        return _deepfake_model, _deepfake_feature_extractor
        
    except Exception as e:
        print(f"❌ Error loading IndicTTS Deepfake Detector: {e}", file=sys.stderr)
        return None, None


def preprocess_audio_for_deepfake(audio_bytes: bytes, target_sample_rate: int = 16000, target_duration: float = 2.0) -> "torch.Tensor":
    """
    Preprocess audio for deepfake detection:
    - Decode WAV bytes
    - Resample to target sample rate (16kHz)
    - Convert to mono
    - Trim or pad to target duration (2 seconds)
    """
    import torch
    import torchaudio
    import numpy as np
    
    # Write to temp file for torchaudio
    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
        tmp.write(audio_bytes)
        tmp_path = tmp.name
    
    try:
        waveform, sample_rate = torchaudio.load(tmp_path)
        
        # Convert to mono
        if waveform.shape[0] > 1:
            waveform = waveform.mean(dim=0, keepdim=True)
        
        # Resample if needed
        if sample_rate != target_sample_rate:
            resampler = torchaudio.transforms.Resample(orig_freq=sample_rate, new_freq=target_sample_rate)
            waveform = resampler(waveform)
        
        # Convert to numpy for processing
        audio_np = waveform.squeeze().numpy()
        
        # Calculate target length
        target_length = int(target_duration * target_sample_rate)
        current_length = len(audio_np)
        
        # Trim or pad to target length
        if current_length > target_length:
            # Trim from the middle
            start = (current_length - target_length) // 2
            audio_np = audio_np[start:start + target_length]
        elif current_length < target_length:
            # Pad with zeros
            pad_width = target_length - current_length
            pad_before = pad_width // 2
            pad_after = pad_width - pad_before
            audio_np = np.pad(audio_np, (pad_before, pad_after), mode='constant')
        
        # Convert back to tensor
        tensor = torch.tensor(audio_np, dtype=torch.float32)
        
        return tensor
        
    finally:
        os.unlink(tmp_path)


@app.post("/api/detect-deepfake", response_model=DeepfakeDetectionResponse)
async def detect_deepfake(audio: UploadFile = File(...)):
    """
    Detect if the provided audio is AI-generated (TTS) or human speech.
    Uses the IndicTTS Deepfake Detector model (DistilHuBERT with classification head).
    
    This endpoint:
    1. Loads the deepfake detection model if not already loaded
    2. Preprocesses the audio (resample to 16kHz, mono, 2s duration)
    3. Runs inference to get AI vs human probability
    4. Returns detection result with confidence level
    
    Note: For longer audio clips, only the middle 2 seconds are analyzed
    due to model constraints.
    """
    # Load model if not already loaded
    model, feature_extractor = load_deepfake_detector()
    
    if model is None:
        return DeepfakeDetectionResponse(
            is_ai_generated=False,
            ai_probability=0.0,
            human_probability=0.0,
            confidence_level="NONE",
            detection_error="Deepfake detection model not available. Check server logs."
        )
    
    # Read audio bytes
    audio_bytes = await audio.read()
    if not audio_bytes:
        return DeepfakeDetectionResponse(
            is_ai_generated=False,
            ai_probability=0.0,
            human_probability=0.0,
            confidence_level="NONE",
            detection_error="Empty audio file"
        )
    
    try:
        import torch
        
        # Preprocess audio
        processed_audio = preprocess_audio_for_deepfake(audio_bytes)
        
        # Feature extraction
        inputs = feature_extractor(
            processed_audio.numpy(),
            sampling_rate=16000,
            return_tensors="pt",
            padding=True
        )
        
        # Run inference
        with torch.no_grad():
            logits = model(**inputs).logits
            probabilities = torch.softmax(logits, dim=-1)
            
            # Get probabilities for each class
            # Assuming class 0 = human, class 1 = AI-generated (typical for binary classification)
            human_prob = float(probabilities[0][0])
            ai_prob = float(probabilities[0][1])
            
        # Determine confidence level
        if max(ai_prob, human_prob) >= 0.90:
            confidence = "HIGH"
        elif max(ai_prob, human_prob) >= 0.70:
            confidence = "MEDIUM"
        else:
            confidence = "LOW"
        
        return DeepfakeDetectionResponse(
            is_ai_generated=(ai_prob > human_prob),
            ai_probability=round(ai_prob, 3),
            human_probability=round(human_prob, 3),
            confidence_level=confidence
        )
        
    except Exception as e:
        print(f"❌ Deepfake detection error: {e}", file=sys.stderr)
        return DeepfakeDetectionResponse(
            is_ai_generated=False,
            ai_probability=0.0,
            human_probability=0.0,
            confidence_level="NONE",
            detection_error=str(e)
        )


# ---------------------------------------------------------------------------
# Combined Scam + Deepfake Detection Endpoint
# ---------------------------------------------------------------------------

class CombinedAnalysisRequest(BaseModel):
    """Request for combined scam and deepfake analysis."""
    transcript: str
    source_language: Optional[str] = None  # BCP-47 code, e.g. 'hi-IN'

class CombinedAnalysisResponse(BaseModel):
    """Response with both scam and deepfake analysis results."""
    # Scam detection results
    is_scam: bool
    scam_probability: float
    safe_probability: float
    confidence_level: str
    triggers_detected: list
    
    # Deepfake detection results
    is_ai_generated: bool
    ai_probability: float
    human_probability: float
    deepfake_confidence: str
    
    # Combined risk assessment
    overall_risk_level: str
    warnings: list
    summary: Optional[str] = None
    verification_questions: Optional[list] = None
    risk_level: Optional[str] = None


@app.post("/api/analyze-combined", response_model=CombinedAnalysisResponse)
async def analyze_combined(request_data: CombinedAnalysisRequest, audio: Optional[UploadFile] = File(None)):
    """
    Combined analysis endpoint that performs both scam detection AND
    deepfake detection simultaneously.
    
    This is the main endpoint for call screening:
    - Runs scam prediction on the transcript
    - Runs deepfake detection on the audio (if provided)
    - Returns combined risk assessment with appropriate warnings
    
    If AI-generated speech is detected, a loud warning should be displayed
    in the UI to alert the user immediately.
    """
    transcript = request_data.transcript.strip()
    if not transcript:
        raise HTTPException(status_code=400, detail="Empty transcript")
    
    # Step 1: Scam prediction (always required)
    if not scam_model:
        raise HTTPException(status_code=500, detail="Scam model not loaded")
    
    # Translate non-English transcripts to English
    source_lang = request_data.source_language
    working_transcript = transcript
    if source_lang and not source_lang.lower().startswith("en"):
        print(f"🌐 Translating combined analysis input from {source_lang} to English")
        working_transcript = translate_to_english(transcript, source_lang)
        print(f"🌐 Translated: {working_transcript}")
    
    # Scam prediction
    try:
        probability = float(scam_model.predict_proba([working_transcript])[0][1])
        prediction = scam_model.predict([working_transcript])[0]
        triggers = detect_triggers(working_transcript)
        
        if probability >= 0.90 or probability <= 0.10:
            scam_confidence = "HIGH"
        elif probability >= 0.70 or probability <= 0.30:
            scam_confidence = "MEDIUM"
        else:
            scam_confidence = "LOW"
        
        scam_result = {
            "is_scam": bool(prediction),
            "scam_probability": round(probability, 3),
            "safe_probability": round(1 - probability, 3),
            "confidence_level": scam_confidence,
            "triggers_detected": triggers,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Scam prediction failed: {str(e)}")
    
    # Step 2: Deepfake detection (optional, if audio provided)
    deepfake_result = {
        "is_ai_generated": False,
        "ai_probability": 0.0,
        "human_probability": 1.0,
        "deepfake_confidence": "NONE",
    }
    
    if audio:
        deepfake_response = await detect_deepfake(audio)
        deepfake_result = {
            "is_ai_generated": deepfake_response.is_ai_generated,
            "ai_probability": deepfake_response.ai_probability,
            "human_probability": deepfake_response.human_probability,
            "deepfake_confidence": deepfake_response.confidence_level,
        }
    
    # Step 3: Combine results and assess overall risk
    warnings = []
    is_high_risk = False
    
    # Scam risk
    if scam_result["is_scam"]:
        if scam_result["scam_probability"] >= 0.80:
            warnings.append("⚠️ HIGH RISK: Scam detected with high confidence")
            is_high_risk = True
        elif scam_result["scam_probability"] >= 0.60:
            warnings.append("⚠️ MEDIUM RISK: Scam indicators detected")
        else:
            warnings.append("ℹ️ LOW RISK: Some scam indicators present")
    
    # Deepfake/AI risk
    if deepfake_result["is_ai_generated"]:
        if deepfake_result["ai_probability"] >= 0.80:
            warnings.append("🔴 CRITICAL: AI-generated speech detected! ⚠️")
            is_high_risk = True
        elif deepfake_result["ai_probability"] >= 0.60:
            warnings.append("⚠️ WARNING: Likely AI-generated speech")
        else:
            warnings.append("ℹ️ POSSIBLE AI: Audio may be generated")
    
    # Determine overall risk level
    if is_high_risk or (scam_result["is_scam"] and deepfake_result["is_ai_generated"]):
        overall_risk = "CRITICAL"
    elif scam_result["is_scam"] or deepfake_result["is_ai_generated"]:
        overall_risk = "HIGH"
    elif scam_result["scam_probability"] >= 0.50 or deepfake_result["ai_probability"] >= 0.50:
        overall_risk = "MODERATE"
    else:
        overall_risk = "LOW"
    
    # Generate summary and recommendations
    summary_parts = []
    if scam_result["is_scam"]:
        summary_parts.append(f"The caller's speech shows strong indicators of a scam ({scam_result['scam_probability']*100:.1f}% probability).")
    if deepfake_result["is_ai_generated"]:
        summary_parts.append(f"⚠️ CRITICAL: The audio has been detected as AI-generated ({deepfake_result['ai_probability']*100:.1f}% probability). This is a strong indicator of fraud.")
    
    if not summary_parts:
        summary_parts.append("No immediate threats detected. Call appears legitimate.")
    
    # AgentCore integration for high-risk cases (same as analyze-scam)
    summary = None
    verification_questions = None
    risk_level = None
    
    if overall_risk in ["CRITICAL", "HIGH"] and _last_agentcore_request_time > 0:
        # This would call AgentCore if we had the async context
        # For now, we just include a placeholder
        pass
    
    return CombinedAnalysisResponse(
        **scam_result,
        **deepfake_result,
        overall_risk_level=overall_risk,
        warnings=warnings,
        summary=". ".join(summary_parts),
        verification_questions=None,
        risk_level=overall_risk,
    )


def run_backend():
    """Run the FastAPI backend server"""
    import uvicorn
    port = int(os.getenv("BACKEND_PORT", 5000))
    print(f"🚀 Starting FastAPI backend on port {port}")
    print(f"✓ Scam prediction API: POST http://localhost:{port}/api/predict-scam")
    print(f"✓ Deepfake detection API: POST http://localhost:{port}/api/detect-deepfake")
    print(f"✓ Combined analysis API: POST http://localhost:{port}/api/analyze-combined")
    uvicorn.run(app, host="0.0.0.0", port=port, log_level="info")