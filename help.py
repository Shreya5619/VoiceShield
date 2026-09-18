import boto3
from botocore.exceptions import ClientError

def test_connection():
    client = boto3.client(
        "transcribestreaming",
        region_name="us-east-1",
        profile_name="shreyap",
    )

    # Empty audio stream just to open the session
    def empty_audio_stream():
        yield {"AudioEvent": {"AudioChunk": b""}}

    try:
        response = client.start_stream_transcription(
            LanguageCode="en-US",
            MediaEncoding="pcm",
            MediaSampleRateHertz=16000,
            AudioStream=empty_audio_stream(),
        )
        print("Connection OK: start_stream_transcription succeeded")

        # Optionally try to read one event from the result stream
        result_stream = response["TranscriptResultStream"]
        for event in result_stream:
            print("Received event:", list(event.keys()))
            break

    except ClientError as e:
        code = e.response["Error"]["Code"]
        message = e.response["Error"]["Message"]
        print(f"Connection FAILED: {code} – {message}")
        raise

if __name__ == "__main__":
    test_connection()