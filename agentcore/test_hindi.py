#!/usr/bin/env python3
"""
Test script to verify Hindi language responses from AgentCore
"""
import requests
import json
import sys

AGENTCORE_URL = "http://localhost:8080/invocations"

# Test payload with Hindi language preference
test_payload = {
    "transcript": "Hello, this is regarding your loan payment. We have a special hardship program. You need to pay $6 immediately for instant information.",
    "prediction": {
        "is_scam": True,
        "scam_probability": 0.85,
        "safe_probability": 0.15,
        "confidence_level": "HIGH",
        "triggers_detected": ["urgent payment request", "financial information request"]
    },
    "user_language": "hi"  # Request Hindi response
}

print("=" * 70)
print("Testing AgentCore with Hindi language preference")
print("=" * 70)
print(f"\nSending request to: {AGENTCORE_URL}")
print(f"User language: {test_payload['user_language']}")
print(f"Transcript: {test_payload['transcript'][:100]}...")
print("\nWaiting for response...\n")

try:
    response = requests.post(
        AGENTCORE_URL,
        json=test_payload,
        headers={"Content-Type": "application/json"},
        timeout=60
    )
    
    print(f"Status Code: {response.status_code}")
    print("=" * 70)
    
    if response.status_code == 200:
        data = response.json()
        print("\n✅ SUCCESS - Response received:")
        print("=" * 70)
        print("\nSUMMARY:")
        print(data.get("summary", "No summary"))
        print("\nVERIFICATION QUESTIONS:")
        for i, q in enumerate(data.get("verification_questions", []), 1):
            print(f"{i}. {q}")
        print("\nRISK LEVEL:", data.get("risk_level", "Unknown"))
        print("=" * 70)
        
        # Check if response is in Hindi
        summary = data.get("summary", "")
        has_hindi = any('\u0900' <= char <= '\u097F' for char in summary)
        
        if has_hindi:
            print("\n✅ HINDI DETECTED in response!")
        else:
            print("\n❌ NO HINDI DETECTED - Response is in English")
            print("\nThis means the language instruction is not working.")
            
    else:
        print(f"\n❌ ERROR: HTTP {response.status_code}")
        print(response.text)
        
except requests.exceptions.ConnectionError:
    print("\n❌ ERROR: Could not connect to AgentCore")
    print("Make sure AgentCore is running on port 8080")
    sys.exit(1)
except Exception as e:
    print(f"\n❌ ERROR: {type(e).__name__}: {e}")
    sys.exit(1)

print("\n" + "=" * 70)
