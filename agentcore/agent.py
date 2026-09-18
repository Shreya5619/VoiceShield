import sys
import os
from dotenv import load_dotenv
load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), ".env"))
import json
import re
import asyncio
import logging
from contextlib import asynccontextmanager
from typing import List

from fastapi import FastAPI, Request, HTTPException
from fastapi.responses import JSONResponse
from fastapi.exceptions import RequestValidationError
from pydantic import BaseModel, Field, field_validator
from strands import Agent
from strands.models import BedrockModel
import uvicorn

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

REQUIRED_ENV_VARS = ["AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY", "AWS_REGION", "BEDROCK_MODEL_ID"]

# ---------------------------------------------------------------------------
# Pydantic Models
# ---------------------------------------------------------------------------

class PredictionInput(BaseModel):
    is_scam: bool
    scam_probability: float
    safe_probability: float
    confidence_level: str
    triggers_detected: List[str]

    @field_validator("scam_probability")
    @classmethod
    def validate_scam_probability(cls, v: float) -> float:
        if not isinstance(v, (int, float)) or v < 0.0 or v > 1.0:
            raise ValueError("scam_probability must be a float in [0.0, 1.0]")
        return v


class InvocationRequest(BaseModel):
    transcript: str = Field(..., min_length=1)
    prediction: PredictionInput


class AnalysisResponse(BaseModel):
    summary: str
    verification_questions: List[str]
    risk_level: str  # CRITICAL | HIGH | MEDIUM | LOW


# ---------------------------------------------------------------------------
# compute_risk_level
# ---------------------------------------------------------------------------

def compute_risk_level(scam_probability: float) -> str:
    """Deterministically derive a risk level from scam_probability.

    Thresholds:
      CRITICAL : scam_probability >= 0.85
      HIGH     : scam_probability >= 0.60
      MEDIUM   : scam_probability >= 0.35
      LOW      : scam_probability <  0.35
    """
    if scam_probability >= 0.85:
        return "CRITICAL"
    elif scam_probability >= 0.60:
        return "HIGH"
    elif scam_probability >= 0.35:
        return "MEDIUM"
    else:
        return "LOW"


# ---------------------------------------------------------------------------
# Prompt builder
# ---------------------------------------------------------------------------

def build_prompt(request: InvocationRequest) -> str:
    """Construct the analysis prompt from the invocation request."""
    pred = request.prediction
    triggers_list = (
        ", ".join(pred.triggers_detected) if pred.triggers_detected else "none detected"
    )
    return (
        "You are a scam-call analysis expert assistant embedded in VoiceShield, "
        "a real-time call protection system.\n\n"
        "An ML classifier has flagged this call with the following result:\n"
        f"- Scam probability: {pred.scam_probability:.1%}\n"
        f"- Confidence level: {pred.confidence_level}\n"
        f"- Trigger patterns detected: {triggers_list}\n\n"
        "Here is the verbatim transcript of the call so far:\n"
        "---\n"
        f"{request.transcript}\n"
        "---\n\n"
        "Your task:\n"
        "1. Write a SUMMARY (maximum 300 words) explaining WHY this call was flagged. "
        "Reference specific phrases from the transcript and name the trigger patterns "
        "that matched. Be specific and factual.\n"
        "2. Write 3 to 7 VERIFICATION QUESTIONS that the call recipient can ask to "
        "determine whether the caller is legitimate. Questions should probe for verifiable "
        "information the caller should know if genuine (e.g., employee ID, company "
        "registration number, department, case reference number, GST number, originating "
        "office address).\n\n"
        "Respond ONLY with valid JSON in this exact format (no markdown, no code fences):\n"
        '{\n'
        '  "summary": "<your summary here>",\n'
        '  "verification_questions": [\n'
        '    "<question 1>",\n'
        '    "<question 2>"\n'
        '  ]\n'
        '}'
    )


# ---------------------------------------------------------------------------
# Text extraction from strands AgentResult
# ---------------------------------------------------------------------------

def extract_text_from_result(result) -> str:
    """Extract plain text from a strands Agent result object.

    The strands AgentResult exposes:
      - str(result)          → plain text (simplest path)
      - result.message       → dict {'role': 'assistant', 'content': [{'text': '...'}]}
    """
    # str(result) is the most reliable path — it joins all text blocks
    text = str(result)
    if text and text.strip():
        return text.strip()

    # Fallback: walk the message content blocks manually
    msg = result.message
    if isinstance(msg, dict):
        content = msg.get("content", [])
        if isinstance(content, list):
            parts = [
                block.get("text", "")
                for block in content
                if isinstance(block, dict) and "text" in block
            ]
            joined = "\n".join(parts).strip()
            if joined:
                return joined

    return str(result)


# ---------------------------------------------------------------------------
# Robust JSON extraction
# ---------------------------------------------------------------------------

def extract_json(raw_text: str) -> dict:
    """Extract the FIRST complete JSON object from raw_text.

    Handles:
    - Markdown code fences (```json ... ```)
    - Surrounding text before/after the JSON
    - Multiple concatenated JSON objects (takes only the first)

    Raises json.JSONDecodeError if no valid JSON object is found.
    """
    # Strip markdown code fences
    stripped = re.sub(r"```(?:json)?\s*", "", raw_text).replace("```", "").strip()

    # Try direct parse first (handles clean single-object responses)
    try:
        return json.loads(stripped)
    except json.JSONDecodeError:
        pass

    # Walk the string character-by-character to find the first balanced { ... }
    # This correctly stops at the closing brace of the FIRST object,
    # ignoring any subsequent JSON objects concatenated after it.
    start = stripped.find('{')
    if start == -1:
        raise json.JSONDecodeError("No JSON object found", stripped, 0)

    depth = 0
    in_string = False
    escape_next = False

    for i, ch in enumerate(stripped[start:], start=start):
        if escape_next:
            escape_next = False
            continue
        if ch == '\\' and in_string:
            escape_next = True
            continue
        if ch == '"':
            in_string = not in_string
            continue
        if in_string:
            continue
        if ch == '{':
            depth += 1
        elif ch == '}':
            depth -= 1
            if depth == 0:
                # Found the end of the first complete object
                candidate = stripped[start:i + 1]
                return json.loads(candidate)

    raise json.JSONDecodeError("Unbalanced braces — no complete JSON object found", stripped, start)


# ---------------------------------------------------------------------------
# Module-level strands agent, initialised in lifespan
# ---------------------------------------------------------------------------

strands_agent = None  # initialised in lifespan startup


async def invoke_agent(request: InvocationRequest) -> AnalysisResponse:
    """Send the prompt to Bedrock via the strands Agent and parse the JSON response."""
    prompt = build_prompt(request)

    # Run the synchronous strands call in a thread pool to avoid blocking the event loop
    loop = asyncio.get_event_loop()
    try:
        result = await loop.run_in_executor(
            None,
            lambda: strands_agent(prompt),
        )
    except Exception as exc:
        logger.error("Strands agent call failed: %s: %s", type(exc).__name__, exc)
        raise

    raw_text = extract_text_from_result(result)
    logger.info("Raw strands response (first 500 chars): %s", raw_text[:500])

    try:
        data = extract_json(raw_text)
    except json.JSONDecodeError as exc:
        logger.error("Failed to parse strands response as JSON: %s\nFull raw: %s", exc, raw_text)
        raise HTTPException(
            status_code=503,
            detail=f"Model returned non-JSON response: {exc}",
        )

    risk_level = compute_risk_level(request.prediction.scam_probability)

    return AnalysisResponse(
        summary=data.get("summary", ""),
        verification_questions=data.get("verification_questions", []),
        risk_level=risk_level,
    )


# ---------------------------------------------------------------------------
# Retry logic
# ---------------------------------------------------------------------------

MAX_RETRIES = 3
INITIAL_BACKOFF = 1.0  # seconds

_RETRYABLE_EXCEPTIONS = ("ThrottlingException", "ServiceUnavailableException")


async def invoke_with_retry(request: InvocationRequest) -> AnalysisResponse:
    """Call invoke_agent with exponential back-off on throttling/service errors.

    Retries up to MAX_RETRIES times (1 s → 2 s → 4 s delays).
    Does NOT retry on:
    - HTTPException (JSON parse errors, validation errors) — propagated immediately
    - Raises HTTPException 503 after all retries are exhausted.
    """
    delay = INITIAL_BACKOFF
    last_error: Exception = RuntimeError("No attempts made")

    for attempt in range(MAX_RETRIES + 1):
        try:
            return await invoke_agent(request)
        except HTTPException:
            # Propagate immediately — these are deterministic errors (bad JSON,
            # validation failures) that won't be fixed by retrying.
            raise
        except Exception as exc:
            last_error = exc
            exc_name = type(exc).__name__

            # Only retry on known transient AWS errors
            if not any(name in exc_name for name in _RETRYABLE_EXCEPTIONS):
                logger.error(
                    "Non-retryable error on attempt %d/%d: %s: %s",
                    attempt + 1, MAX_RETRIES + 1, exc_name, exc
                )
                raise HTTPException(
                    status_code=503,
                    detail=f"Agent call failed: {exc_name}: {str(exc)}",
                )

            logger.error(
                "Retryable error (attempt %d/%d): %s: %s",
                attempt + 1, MAX_RETRIES + 1, exc_name, exc
            )
            if attempt < MAX_RETRIES:
                logger.info("Retrying in %.1f s...", delay)
                await asyncio.sleep(delay)
                delay *= 2

    raise HTTPException(
        status_code=503,
        detail=f"Agent failed after {MAX_RETRIES + 1} attempts: {type(last_error).__name__}: {str(last_error)}",
    )


# ---------------------------------------------------------------------------
# FastAPI app and lifespan
# ---------------------------------------------------------------------------

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Validate required env vars on startup
    for var in REQUIRED_ENV_VARS:
        value = os.environ.get(var)
        if not value:
            logger.error("Missing required environment variable: %s", var)
            sys.exit(1)

    # Initialise strands agent with BedrockModel
    global strands_agent
    try:
        model = BedrockModel(
            model_id=os.environ["BEDROCK_MODEL_ID"],
            region_name=os.environ["AWS_REGION"],
        )
        strands_agent = Agent(model=model)
        logger.info(
            "Strands agent initialised (model: %s, region: %s)",
            os.environ["BEDROCK_MODEL_ID"],
            os.environ["AWS_REGION"],
        )
    except Exception as exc:
        logger.error("Failed to initialise strands agent: %s", exc)
        sys.exit(1)

    logger.info("All required environment variables present — AgentCore starting up")
    yield
    # Cleanup on shutdown
    logger.info("AgentCore shutting down")


app = FastAPI(title="VoiceShield AgentCore Service", version="1.0.0", lifespan=lifespan)


# ---------------------------------------------------------------------------
# Middleware: enforce Content-Type: application/json on POST /invocations
# ---------------------------------------------------------------------------

@app.middleware("http")
async def enforce_json_content_type(request: Request, call_next):
    if request.method == "POST" and request.url.path == "/invocations":
        content_type = request.headers.get("content-type", "")
        if not content_type.startswith("application/json"):
            return JSONResponse(
                status_code=415,
                content={"detail": "Content-Type must be application/json"},
            )
    return await call_next(request)


# ---------------------------------------------------------------------------
# Exception handler: RequestValidationError
# Returns 400 for scam_probability violations, 422 for all other missing/invalid fields
# ---------------------------------------------------------------------------

@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    errors = exc.errors()
    # Check whether any error originates from the scam_probability field_validator.
    for error in errors:
        loc = error.get("loc", ())
        msg = error.get("msg", "")
        if "scam_probability" in loc and "scam_probability" in msg:
            return JSONResponse(
                status_code=400,
                content={"detail": "scam_probability must be a float in [0.0, 1.0]"},
            )
    # All other validation errors → 422 with the standard FastAPI detail list.
    return JSONResponse(
        status_code=422,
        content={"detail": errors},
    )


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@app.get("/ping")
async def ping():
    return {"status": "healthy"}


@app.post("/invocations", response_model=AnalysisResponse)
async def invocations(request: InvocationRequest):
    """Invoke the strands agent and return the structured analysis.

    - FastAPI validates the body automatically (422 on missing fields, 400 on
      scam_probability out of range via the custom exception handler above).
    - invoke_with_retry handles throttling with exponential back-off.
    - asyncio.wait_for enforces a 28-second inner timeout.
    """
    try:
        response = await asyncio.wait_for(
            invoke_with_retry(request),
            timeout=28.0,
        )
    except asyncio.TimeoutError:
        logger.error("Agent invocation timed out after 28 s")
        raise HTTPException(
            status_code=503,
            detail="Agent invocation timed out after 28 seconds",
        )
    return response


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8080)
