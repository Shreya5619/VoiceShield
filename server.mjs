/**
 * Simple Node.js proxy server for AWS Transcribe Streaming
 * The browser connects to this server via WebSocket
 * This server proxies to AWS Transcribe via HTTP/2
 */

import http from 'http'
import https from 'https'
import fs from 'fs'
import { WebSocketServer } from 'ws'
import {
  TranscribeStreamingClient,
  StartStreamTranscriptionCommand,
} from '@aws-sdk/client-transcribe-streaming'

// Configuration
const PORT = 3001
const AWS_REGION = process.env.AWS_REGION || 'us-east-1'
const AWS_ACCESS_KEY_ID = process.env.AWS_ACCESS_KEY_ID
const AWS_SECRET_ACCESS_KEY = process.env.AWS_SECRET_ACCESS_KEY
const AWS_SESSION_TOKEN = process.env.AWS_SESSION_TOKEN

if (!AWS_ACCESS_KEY_ID || !AWS_SECRET_ACCESS_KEY) {
  console.error('❌ Error: AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY must be set')
  process.exit(1)
}

console.log(`🚀 Starting Transcribe proxy server on port ${PORT}`)
console.log(`📍 AWS Region: ${AWS_REGION}`)

// Create HTTP server
const server = http.createServer((req, res) => {
  // Health check endpoint
  if (req.url === '/health' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ status: 'ok', message: 'Transcribe proxy is running' }))
    return
  }

  // 404 for all other HTTP requests
  res.writeHead(404, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify({ error: 'Use WebSocket for transcription' }))
})

// Create WebSocket server
const wss = new WebSocketServer({ server })

wss.on('connection', (ws) => {
  console.log(`\n📱 New WebSocket connection`)
  let transcribeClient = null
  let isTranscribing = false
  let audioChunks = []
  let audioResolver = null

  ws.on('message', async (message) => {
    try {
      if (typeof message === 'string') {
        // Text message - control command
        const data = JSON.parse(message)

        if (data.type === 'start') {
          if (isTranscribing) {
            ws.send(JSON.stringify({ error: 'Already transcribing' }))
            return
          }

          console.log('🎤 Starting transcription')
          isTranscribing = true
          audioChunks = []

          // Create Transcribe client
          transcribeClient = new TranscribeStreamingClient({
            region: AWS_REGION,
            credentials: {
              accessKeyId: AWS_ACCESS_KEY_ID,
              secretAccessKey: AWS_SECRET_ACCESS_KEY,
              sessionToken: AWS_SESSION_TOKEN,
            },
          })

          // Audio stream generator
          const audioStream = async function* () {
            console.log('📤 Audio stream started, waiting for chunks...')
            while (isTranscribing) {
              if (audioChunks.length > 0) {
                const chunk = audioChunks.shift()
                console.log(`  Sending ${chunk.length} bytes to Transcribe`)
                yield { AudioEvent: { AudioChunk: chunk } }
              } else {
                // Wait for more audio
                await new Promise((resolve) => {
                  audioResolver = resolve
                  setTimeout(() => {
                    if (audioResolver === resolve) {
                      audioResolver = null
                      resolve()
                    }
                  }, 50)
                })
              }
            }
            console.log('Audio stream ended')
          }

          try {
            // Start transcription
            const command = new StartStreamTranscriptionCommand({
              LanguageCode: data.languageCode || 'en-US',
              MediaSampleRateHertz: data.sampleRate || 16000,
              MediaEncoding: 'pcm',
              AudioStream: audioStream(),
            })

            console.log('🌐 Sending command to AWS Transcribe...')
            const response = await transcribeClient.send(command)

            ws.send(JSON.stringify({ type: 'status', status: 'connected' }))

            // Process results
            if (response.TranscriptResultStream) {
              for await (const event of response.TranscriptResultStream) {
                if (!isTranscribing) break

                if (event.TranscriptEvent) {
                  const transcript = event.TranscriptEvent.Transcript
                  if (transcript?.Results) {
                    const results = transcript.Results
                    console.log(`📊 Received ${results.length} result(s)`)

                    ws.send(
                      JSON.stringify({
                        type: 'transcript',
                        results: results,
                      })
                    )
                  }
                }
              }
            }

            console.log('✓ Transcription stream ended')
            ws.send(JSON.stringify({ type: 'status', status: 'complete' }))
          } catch (error) {
            console.error('❌ Transcription error:', error.message)
            ws.send(
              JSON.stringify({
                type: 'error',
                error: error.message,
              })
            )
            isTranscribing = false
          }
        } else if (data.type === 'stop') {
          console.log('⏹️  Stopping transcription')
          isTranscribing = false
          if (audioResolver) {
            audioResolver()
            audioResolver = null
          }
        }
      } else {
        // Binary message - audio data
        if (isTranscribing) {
          audioChunks.push(new Uint8Array(message))
          console.log(`📻 Received ${message.byteLength} bytes of audio`)

          // Resolve pending promise
          if (audioResolver) {
            audioResolver()
            audioResolver = null
          }
        }
      }
    } catch (error) {
      console.error('Error processing message:', error)
      ws.send(
        JSON.stringify({
          type: 'error',
          error: error.message,
        })
      )
    }
  })

  ws.on('close', () => {
    console.log('👋 WebSocket connection closed')
    isTranscribing = false
    if (audioResolver) {
      audioResolver()
    }
    if (transcribeClient) {
      transcribeClient.destroy()
    }
  })

  ws.on('error', (error) => {
    console.error('❌ WebSocket error:', error)
  })
})

server.listen(PORT, () => {
  console.log(`✓ Server listening on ws://localhost:${PORT}`)
})

process.on('SIGINT', () => {
  console.log('\n🛑 Shutting down...')
  server.close()
  process.exit(0)
})
