import boto3
from botocore.config import Config
from botocore.exceptions import ClientError

def test_transcribe_stream_connection():
    client = boto3.client(
        "transcribe",
        region_name="us-east-1",  # change to your region
        config=Config(
            retries={"max_attempts": 1},
        ),
    )

    # Dummy generator that yields no audio; we just want to see if the call succeeds
    def empty_audio_stream():
        # Yield at least one empty chunk so the stream is valid
        yield {"AudioEvent": {"AudioChunk": b""}}
        return
        # (never reached)

    try:
        response = client.start_stream_transcription(
            LanguageCode="en-US",
            MediaEncoding="pcm",
            MediaSampleRateHertz=16000,
            AudioStream=empty_audio_stream(),
        )

        # If we get here, the connection was established
        print("✓ Connection OK: start_stream_transcription succeeded")

        # Optionally, try to read one event to ensure the result stream is usable
        result_stream = response["TranscriptResultStream"]
        for event in result_stream:
            # Usually you'll get at least some metadata or an empty transcript
            print("✓ Received event:", list(event.keys()))
            break

    except ClientError as e:
        code = e.response["Error"]["Code"]
        message = e.response["Error"]["Message"]
        print(f"✗ Connection FAILED: {code} – {message}")
        raise

if __name__ == "__main__":
    test_transcribe_stream_connection()
