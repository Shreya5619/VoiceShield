# -*- coding: utf-8 -*-
"""
VoiceShield - Scam Detection for Phone Conversations
Predicts whether transcribed audio is a scam or not using ML model
"""

import re
import joblib

# ============================================================================
# CONFIGURATION - SCAM DETECTION THRESHOLD
# ============================================================================
# Lower threshold = more sensitive (catches more scams but may have more false positives)
# Higher threshold = less sensitive (fewer false positives but may miss some scams)
# Default scikit-learn threshold: 0.50 (50%)
# Current setting: 0.35 (35%) - MORE SENSITIVE
SCAM_THRESHOLD = 0.35  # Lowered from default 0.50

print(f"⚙️  Scam Detection Threshold: {SCAM_THRESHOLD:.2%}")
print("   (Calls with scam probability ≥ {:.0%} will be flagged as SCAM)".format(SCAM_THRESHOLD))
print()

# Load the trained scam classifier model
print("Loading scam classifier model...")
scam_model = joblib.load("voiceguard_scam_model.joblib")
print("✓ Model loaded successfully from voiceguard_scam_model.joblib\n")

# Trigger patterns for additional scam detection
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
    """
    Detect scam trigger patterns in the given text.
    
    Args:
        text (str): The transcript text to analyze
        
    Returns:
        list: List of detected trigger categories
    """
    text_lower = text.lower()
    detected = []

    for trigger, patterns in TRIGGER_PATTERNS.items():
        for pattern in patterns:
            if re.search(pattern, text_lower):
                detected.append(trigger)
                break

    return detected

def predict_scam(transcript):
    """
    Predict whether a transcribed audio is a scam or not using the trained model.
    
    Args:
        transcript (str): The transcribed audio text
        
    Returns:
        dict: Prediction results including:
            - is_scam: Boolean indicating if it's likely a scam
            - scam_probability: Probability of being a scam (0-1)
            - safe_probability: Probability of being safe (0-1)
            - confidence_level: How confident the prediction is
            - triggers_detected: List of detected scam triggers
    """
    # Get prediction probability (1 = scam)
    probability = float(scam_model.predict_proba([transcript])[0][1])
    
    # Get the actual prediction (0 = safe, 1 = scam)
    prediction = scam_model.predict([transcript])[0]
    
    # Detect scam triggers
    triggers = detect_triggers(transcript)
    
    # Calculate confidence level based on probability distance from 0.5
    if probability >= 0.90 or probability <= 0.10:
        confidence = "HIGH"
    elif probability >= 0.70 or probability <= 0.30:
        confidence = "MEDIUM"
    else:
        confidence = "LOW"
    
    return {
        "is_scam": bool(prediction),
        "scam_probability": round(probability, 3),
        "safe_probability": round(1 - probability, 3),
        "confidence_level": confidence,
        "triggers_detected": triggers,
        "transcript": transcript
    }

# ============================================================================
# EXAMPLE USAGE - SCAM PREDICTION DEMONSTRATIONS
# ============================================================================

print("=" * 90)
print("VOICESHIELD - SCAM DETECTION PREDICTIONS")
print("=" * 90)

# Example 1: Likely a SCAM
sample_scam_transcript = """
Hello, this is urgent. Your account has been suspended due to suspicious activity. 
We need you to verify your identity immediately by providing your OTP and card details. 
If you don't act now, your account will be permanently blocked. Please send the verification 
code and CVV number to confirm your information.
"""

print("\n[EXAMPLE 1] SCAM TRANSCRIPT:")
print("-" * 90)
result1 = predict_scam(sample_scam_transcript)
print(f"📋 Transcript: {result1['transcript'][:80].strip()}...")
print(f"🚨 Is Scam: {result1['is_scam']}")
print(f"📊 Scam Probability: {result1['scam_probability']} ({result1['scam_probability']*100:.1f}%)")
print(f"✅ Safe Probability: {result1['safe_probability']} ({result1['safe_probability']*100:.1f}%)")
print(f"🎯 Confidence Level: {result1['confidence_level']}")
print(f"🔍 Triggers Detected: {', '.join(result1['triggers_detected']) if result1['triggers_detected'] else 'None'}")

# Example 2: Likely SAFE
sample_safe_transcript = """
Hi, I'm calling to confirm your appointment next Tuesday at 2 PM. 
Please let us know if you need to reschedule. Thank you!
"""

print("\n[EXAMPLE 2] SAFE TRANSCRIPT:")
print("-" * 90)
result2 = predict_scam(sample_safe_transcript)
print(f"📋 Transcript: {result2['transcript']}")
print(f"🚨 Is Scam: {result2['is_scam']}")
print(f"📊 Scam Probability: {result2['scam_probability']} ({result2['scam_probability']*100:.1f}%)")
print(f"✅ Safe Probability: {result2['safe_probability']} ({result2['safe_probability']*100:.1f}%)")
print(f"🎯 Confidence Level: {result2['confidence_level']}")
print(f"🔍 Triggers Detected: {', '.join(result2['triggers_detected']) if result2['triggers_detected'] else 'None'}")

# Example 3: Mixed signals
sample_mixed_transcript = """
We are calling about your recent purchase. 
We found some issues with your payment. Please verify your account details to proceed.
"""

print("\n[EXAMPLE 3] MIXED SIGNALS TRANSCRIPT:")
print("-" * 90)
result3 = predict_scam(sample_mixed_transcript)
print(f"📋 Transcript: {result3['transcript']}")
print(f"🚨 Is Scam: {result3['is_scam']}")
print(f"📊 Scam Probability: {result3['scam_probability']} ({result3['scam_probability']*100:.1f}%)")
print(f"✅ Safe Probability: {result3['safe_probability']} ({result3['safe_probability']*100:.1f}%)")
print(f"🎯 Confidence Level: {result3['confidence_level']}")
print(f"🔍 Triggers Detected: {', '.join(result3['triggers_detected']) if result3['triggers_detected'] else 'None'}")

# Example 4: Refund Scam
sample_refund_scam = """
Good morning, we're calling from the revenue department regarding your tax refund. 
We found an error in your previous filing. We can process a refund immediately, 
but we need your bank account number and routing number to send the funds.
"""

print("\n[EXAMPLE 4] REFUND SCAM TRANSCRIPT:")
print("-" * 90)
result4 = predict_scam(sample_refund_scam)
print(f"📋 Transcript: {result4['transcript'][:80].strip()}...")
print(f"🚨 Is Scam: {result4['is_scam']}")
print(f"📊 Scam Probability: {result4['scam_probability']} ({result4['scam_probability']*100:.1f}%)")
print(f"✅ Safe Probability: {result4['safe_probability']} ({result4['safe_probability']*100:.1f}%)")
print(f"🎯 Confidence Level: {result4['confidence_level']}")
print(f"🔍 Triggers Detected: {', '.join(result4['triggers_detected']) if result4['triggers_detected'] else 'None'}")

# ============================================================================
# PREDICTION SUMMARY
# ============================================================================
print("\n" + "=" * 90)
print("PREDICTION SUMMARY & THRESHOLDS")
print("=" * 90)
print("✓ Scam Classification Threshold: Probability >= 0.50 (50%) → SCAM")
print("✓ Safe Classification Threshold: Probability < 0.50 (50%) → SAFE")
print("✓ Trigger Detection: Additional pattern matching to validate predictions")
print("✓ Confidence Levels:")
print("  - HIGH:   Probability >= 0.90 or <= 0.10")
print("  - MEDIUM: Probability >= 0.70 or <= 0.30")
print("  - LOW:    All other cases")
print("=" * 90)
