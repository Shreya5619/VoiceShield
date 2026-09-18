"""
Local test script for the AgentCore service (agentcore/agent.py).

Usage:
    python agentcore/test_agent.py

By default connects to http://localhost:8080.
Override with the AGENTCORE_URL environment variable:
    AGENTCORE_URL=http://my-host:8080 python agentcore/test_agent.py

Exit codes:
    0 — all tests passed
    1 — one or more tests failed
"""

import os
import sys
import json
import httpx

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

BASE_URL = os.environ.get("AGENTCORE_URL", "http://localhost:8080").rstrip("/")

# ---------------------------------------------------------------------------
# Sample payloads
# ---------------------------------------------------------------------------

# Realistic high-probability scam scenario — expect risk_level "CRITICAL"
SAMPLE_PAYLOAD_HIGH = {
    "transcript": (
        "Hello, this is Officer James from the Income Tax Department. "
        "Your account has been blocked due to suspicious activity and you will be arrested "
        "if you do not pay a fine of rupees 50,000 immediately. "
        "Please transfer the money to this account number right now or face legal action. "
        "Do not disconnect this call or share this with anyone else."
    ),
    "prediction": {
        "is_scam": True,
        "scam_probability": 0.96,
        "safe_probability": 0.04,
        "confidence_level": "HIGH",
        "triggers_detected": [
            "urgent payment request",
            "account suspension threat",
            "legal threat",
        ],
    },
}

# Low-probability call — expect risk_level "LOW"
SAMPLE_PAYLOAD_LOW = {
    "transcript": "Hi, I just wanted to confirm your appointment is scheduled for tomorrow at 2 PM.",
    "prediction": {
        "is_scam": False,
        "scam_probability": 0.15,
        "safe_probability": 0.85,
        "confidence_level": "HIGH",
        "triggers_detected": [],
    },
}

# ---------------------------------------------------------------------------
# Test helpers
# ---------------------------------------------------------------------------

PASS_COUNT = 0
FAIL_COUNT = 0


def record_pass(test_name: str) -> None:
    global PASS_COUNT
    PASS_COUNT += 1
    print(f"  ✓ PASS: {test_name}")


def record_fail(test_name: str, reason: str) -> None:
    global FAIL_COUNT
    FAIL_COUNT += 1
    print(f"  ✗ FAIL: {test_name} — {reason}")


def assert_equal(test_name: str, actual, expected) -> bool:
    if actual == expected:
        record_pass(test_name)
        return True
    record_fail(test_name, f"expected {expected!r}, got {actual!r}")
    return False


def assert_in(test_name: str, value, collection) -> bool:
    if value in collection:
        record_pass(test_name)
        return True
    record_fail(test_name, f"{value!r} not in {collection!r}")
    return False


def assert_true(test_name: str, condition: bool, reason: str = "") -> bool:
    if condition:
        record_pass(test_name)
        return True
    record_fail(test_name, reason or "condition was False")
    return False


# ---------------------------------------------------------------------------
# Individual tests
# ---------------------------------------------------------------------------

def test_ping(client: httpx.Client) -> None:
    print("\n[PING] Testing health check...")
    try:
        response = client.get("/ping")
    except httpx.ConnectError as exc:
        record_fail("GET /ping — connection", f"Could not connect to {BASE_URL}: {exc}")
        return

    assert_equal("GET /ping — status code", response.status_code, 200)

    try:
        body = response.json()
    except Exception as exc:
        record_fail("GET /ping — JSON parse", str(exc))
        return

    assert_equal('GET /ping — body["status"]', body.get("status"), "healthy")
    print(f"  Response: {json.dumps(body)}")


def test_high_scam_invocation(client: httpx.Client) -> None:
    print("\n[INVOCATIONS] Testing high-probability scam payload...")
    try:
        response = client.post(
            "/invocations",
            json=SAMPLE_PAYLOAD_HIGH,
            headers={"Content-Type": "application/json"},
        )
    except httpx.ConnectError as exc:
        record_fail("POST /invocations (high) — connection", f"Could not connect to {BASE_URL}: {exc}")
        return

    assert_equal("POST /invocations (high) — status code", response.status_code, 200)

    try:
        body = response.json()
    except Exception as exc:
        record_fail("POST /invocations (high) — JSON parse", str(exc))
        return

    # summary: present and non-empty
    summary = body.get("summary")
    assert_true(
        'POST /invocations (high) — "summary" is non-empty string',
        isinstance(summary, str) and len(summary) > 0,
        f'"summary" was {summary!r}',
    )

    # verification_questions: list with 3–7 items
    vq = body.get("verification_questions")
    assert_true(
        'POST /invocations (high) — "verification_questions" is a list',
        isinstance(vq, list),
        f'"verification_questions" was {type(vq).__name__}',
    )
    if isinstance(vq, list):
        assert_true(
            'POST /invocations (high) — verification_questions has 3–7 items',
            3 <= len(vq) <= 7,
            f'list had {len(vq)} item(s)',
        )

    # risk_level: valid enum value
    risk_level = body.get("risk_level")
    assert_in(
        'POST /invocations (high) — "risk_level" valid',
        risk_level,
        {"CRITICAL", "HIGH", "MEDIUM", "LOW"},
    )

    print(f"\n  Full response:\n{json.dumps(body, indent=4)}")


def test_low_scam_invocation(client: httpx.Client) -> None:
    print("\n[INVOCATIONS] Testing low-probability call (risk_level should be LOW)...")
    try:
        response = client.post(
            "/invocations",
            json=SAMPLE_PAYLOAD_LOW,
            headers={"Content-Type": "application/json"},
        )
    except httpx.ConnectError as exc:
        record_fail("POST /invocations (low) — connection", f"Could not connect to {BASE_URL}: {exc}")
        return

    assert_equal("POST /invocations (low) — status code", response.status_code, 200)

    try:
        body = response.json()
    except Exception as exc:
        record_fail("POST /invocations (low) — JSON parse", str(exc))
        return

    risk_level = body.get("risk_level")
    assert_equal('POST /invocations (low) — "risk_level" is "LOW"', risk_level, "LOW")

    summary = body.get("summary")
    assert_true(
        'POST /invocations (low) — "summary" present',
        isinstance(summary, str) and len(summary) > 0,
        f'"summary" was {summary!r}',
    )

    print(f"\n  Full response:\n{json.dumps(body, indent=4)}")


def test_missing_content_type(client: httpx.Client) -> None:
    """Sending non-JSON Content-Type to /invocations should return 415."""
    print("\n[CONTENT-TYPE] Testing non-JSON Content-Type yields 415...")
    try:
        response = client.post(
            "/invocations",
            content=json.dumps(SAMPLE_PAYLOAD_HIGH).encode(),
            headers={"Content-Type": "text/plain"},
        )
    except httpx.ConnectError as exc:
        record_fail("POST /invocations (text/plain) — connection", str(exc))
        return

    assert_equal("POST /invocations (text/plain) — status code", response.status_code, 415)
    print(f"  Response: {response.text}")


def test_invalid_probability(client: httpx.Client) -> None:
    """scam_probability outside [0.0, 1.0] should return 400."""
    print("\n[VALIDATION] Testing scam_probability=1.5 yields 400...")
    bad_payload = {
        "transcript": "This is a test call.",
        "prediction": {
            "is_scam": True,
            "scam_probability": 1.5,  # invalid
            "safe_probability": 0.04,
            "confidence_level": "HIGH",
            "triggers_detected": [],
        },
    }
    try:
        response = client.post(
            "/invocations",
            json=bad_payload,
            headers={"Content-Type": "application/json"},
        )
    except httpx.ConnectError as exc:
        record_fail("POST /invocations (invalid prob) — connection", str(exc))
        return

    assert_equal("POST /invocations (invalid prob) — status code", response.status_code, 400)
    print(f"  Response: {response.text}")


def test_missing_fields(client: httpx.Client) -> None:
    """A body missing both transcript and prediction should return 422."""
    print("\n[VALIDATION] Testing missing fields yields 422...")
    try:
        response = client.post(
            "/invocations",
            json={},
            headers={"Content-Type": "application/json"},
        )
    except httpx.ConnectError as exc:
        record_fail("POST /invocations (missing fields) — connection", str(exc))
        return

    assert_equal("POST /invocations (missing fields) — status code", response.status_code, 422)
    print(f"  Response: {response.text}")


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main() -> None:
    print("=" * 60)
    print(f"VoiceShield AgentCore — Local Test Suite")
    print(f"Target: {BASE_URL}")
    print("=" * 60)

    # Use a single client with a generous timeout for LLM calls
    with httpx.Client(base_url=BASE_URL, timeout=60.0) as client:
        test_ping(client)
        test_high_scam_invocation(client)
        test_low_scam_invocation(client)
        test_missing_content_type(client)
        test_invalid_probability(client)
        test_missing_fields(client)

    # Summary
    total = PASS_COUNT + FAIL_COUNT
    print("\n" + "=" * 60)
    print(f"Results: {PASS_COUNT}/{total} passed")
    if FAIL_COUNT == 0:
        print("ALL TESTS PASSED ✓")
    else:
        print(f"{FAIL_COUNT} TEST(S) FAILED ✗")
    print("=" * 60)

    sys.exit(0 if FAIL_COUNT == 0 else 1)


if __name__ == "__main__":
    main()
