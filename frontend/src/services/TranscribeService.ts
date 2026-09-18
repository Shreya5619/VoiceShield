/**
 * AWS Transcribe Streaming Service (using official AWS SDK v3)
 * Handles real-time audio transcription
 */

import {
  TranscribeStreamingClient,
  StartStreamTranscriptionCommand,
  StartStreamTranscriptionCommandInput,
} from '@aws-sdk/client-transcribe-streaming'
import { EventStreamMarshaller } from '@aws-sdk/eventstream-marshaller'
import { fromUtf8, toUtf8 } from '@aws-sdk/util-utf8-node'

export interface TranscribeConfig {
  region: string
  accessKeyId: string
  secretAccessKey: string
  sessionToken?: string
}

export interface TranscriptionResult {
  transcript: string
  isPartial: boolean
}

/**
 * Initialize Transcribe Streaming Client
 */
export function createTranscribeClient(config: TranscribeConfig): TranscribeStreamingClient {
  return new TranscribeStreamingClient({
    region: config.region,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
      sessionToken: config.sessionToken,
    },
  })
}

/**
 * Audio event generator for streaming
 */
export async function* createAudioEventStream(
  audioChunks: AsyncIterable<Uint8Array>
): AsyncGenerator<{ AudioEvent: { AudioChunk: Uint8Array } }> {
  for await (const audioChunk of audioChunks) {
    yield {
      AudioEvent: {
        AudioChunk: audioChunk,
      },
    }
  }
}

/**
 * Start stream transcription
 */
export async function startStreamTranscription(
  client: TranscribeStreamingClient,
  audioChunks: AsyncIterable<Uint8Array>,
  config: {
    languageCode: string
    sampleRateHertz: number
    mediaEncoding: 'pcm' | 'ogg-opus'
    onTranscription: (result: TranscriptionResult) => void
    onError: (error: Error) => void
  }
): Promise<void> {
  try {
    const command = new StartStreamTranscriptionCommand({
      LanguageCode: config.languageCode,
      MediaSampleRateHertz: config.sampleRateHertz,
      MediaEncoding: config.mediaEncoding,
      AudioStream: createAudioEventStream(audioChunks),
    } as StartStreamTranscriptionCommandInput)

    const response = await client.send(command)

    // Process the response stream
    if (response.TranscriptResultStream) {
      for await (const event of response.TranscriptResultStream) {
        if (event.TranscriptEvent) {
          const transcript = event.TranscriptEvent.Transcript
          if (transcript?.Results) {
            for (const result of transcript.Results) {
              if (result.Alternatives && result.Alternatives.length > 0) {
                const alternative = result.Alternatives[0]
                config.onTranscription({
                  transcript: alternative.Transcript || '',
                  isPartial: result.IsPartial || false,
                })
              }
            }
          }
        }
      }
    }
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error))
    console.error('Transcription error:', err)
    config.onError(err)
  }
}

export default {
  createTranscribeClient,
  startStreamTranscription,
  createAudioEventStream,
}
