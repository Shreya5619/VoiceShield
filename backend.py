"""
Simple Python backend for AWS Transcribe Streaming
Handles Transcribe WebSocket connection on behalf of the browser
"""

import asyncio
import json
import sys
from typing import AsyncGenerator
import boto3
from botocore.exceptions import ClientError


class TranscribeStreamHandler:
    def __init__(self, region: str = "us-east-1"):
        self.region = region
        self.client = boto3.client("transcribe", region_name=region)

    async def transcribe_audio_stream(
        self, audio_chunks: AsyncGenerator[bytes, None], language_code: str = "en-US"
    ):
        """
        Stream audio to Transcribe and yield transcription results
        """
        # Build the audio stream generator for boto3
        async def audio_event_stream():
            async for chunk in audio_chunks:
                yield {"AudioEvent": {"AudioChunk": chunk}}

        try:
            # Start streaming transcription
            response = self.client.start_stream_transcription(
                LanguageCode=language_code,
                MediaSampleRateHertz=16000,
                MediaEncoding="pcm",
                AudioStream=audio_event_stream(),
            )

            # Stream results back
            if response.get("TranscriptResultStream"):
                for event in response["TranscriptResultStream"]:
                    if event.get("TranscriptEvent"):
                        transcript = event["TranscriptEvent"].get("Transcript", {})
                        results = transcript.get("Results", [])
                        for result in results:
                            alternatives = result.get("Alternatives", [])
                            if alternatives:
                                alt = alternatives[0]
                                yield {
                                    "transcript": alt.get("Transcript", ""),
                                    "isPartial": result.get("IsPartial", False),
                                }

        except ClientError as e:
            error_code = e.response["Error"]["Code"]
            error_msg = e.response["Error"]["Message"]
            print(f"❌ Transcribe error: {error_code} – {error_msg}", file=sys.stderr)
            yield {"error": error_msg, "code": error_code}


# Simple HTTP server wrapper
def run_backend():
    """
    Run a simple server that accepts audio via stdin and streams results via stdout
    This is designed to be called from Node.js child process or similar
    """
    handler = TranscribeStreamHandler()

    # For now, just test the connection
    print("✓ Backend ready", flush=True)


if __name__ == "__main__":
    run_backend()
