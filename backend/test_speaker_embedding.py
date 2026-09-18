#!/usr/bin/env python3
"""
Verify that /api/speaker-embedding returns a valid 192-d embedding.
Run with the backend already started on port 5000:
    python backend/test_speaker_embedding.py
Exits 0 on PASS, 1 on FAIL.
"""
import io
import math
import struct
import sys
import wave

import httpx


def make_silent_wav(duration_sec: int = 5, sample_rate: int = 16000) -> bytes:
    """Generate a silent PCM WAV in memory."""
    num_samples = duration_sec * sample_rate
    buf = io.BytesIO()
    with wave.open(buf, "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)  # 16-bit
        wf.setframerate(sample_rate)
        wf.writeframes(struct.pack(f"<{num_samples}h", *([0] * num_samples)))
    return buf.getvalue()


def main() -> int:
    url = "http://localhost:5000/api/speaker-embedding"
    print(f"→ POSTing 5-second silent WAV to {url}")

    wav_bytes = make_silent_wav()
    try:
        resp = httpx.post(
            url,
            files={"audio": ("voice_sample.wav", wav_bytes, "audio/wav")},
            timeout=60.0,
        )
    except httpx.ConnectError:
        print("FAIL — could not connect to backend. Is it running on port 5000?")
        return 1

    if resp.status_code != 200:
        print(f"FAIL — HTTP {resp.status_code}: {resp.text}")
        return 1

    data = resp.json()
    embedding = data.get("embedding", [])
    dim = data.get("embedding_dim", -1)

    errors = []
    if dim != 192:
        errors.append(f"embedding_dim is {dim}, expected 192")
    if len(embedding) != 192:
        errors.append(f"len(embedding) is {len(embedding)}, expected 192")
    non_finite = [i for i, v in enumerate(embedding) if not math.isfinite(v)]
    if non_finite:
        errors.append(f"{len(non_finite)} non-finite values at indices {non_finite[:5]}")

    if errors:
        for e in errors:
            print(f"FAIL — {e}")
        return 1

    vec = embedding
    print(f"PASS ✓")
    print(f"  embedding_dim : {dim}")
    print(f"  min           : {min(vec):.6f}")
    print(f"  max           : {max(vec):.6f}")
    print(f"  mean          : {sum(vec)/len(vec):.6f}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
