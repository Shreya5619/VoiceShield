# Design Document: Real-Time Transcription Web App

## Overview

The Real-Time Transcription Web App is a distributed system consisting of three primary components:

1. **Frontend (React/TypeScript + Vite)** - Web application for audio capture and transcription display
2. **Lambda Credential Service** - Generates temporary Session Tokens and pre-signed WebSocket URLs
3. **WebSocket Server** - Manages persistent connections and orchestrates audio streaming with Amazon Transcribe

This design emphasizes security through credential expiration, real-time performance through efficient audio processing, and reliability through comprehensive error handling and reconnection strategies.

---

## Architecture Overview

### System Diagram

```
┌─────────────────────┐
│   Frontend (Vite)   │
│  - Audio Capture    │
│  - WebSocket Client │
└──────────┬──────────┘
           │
           ├─ (1) POST /auth ──────────────→ ┌──────────────────────┐
           │                                  │ Lambda Credential    │
           │ (2) pre-signed URL ←─────────── │ Service              │
           │     + Session Token              │ - Token Generation   │
           │                                  │ - Storage (DynamoDB) │
           │                                  └──────────────────────┘
           │
           ├─ (3) WebSocket:// + Token ─────→ ┌──────────────────────┐
           │                                  │ WebSocket Server     │
           │ (4) Audio PCM 16kHz ──────────→ │ - Connection Mgmt    │
           │                                  │ - Token Validation   │
           │ (5) Transcription Results ←──── │ - Transcribe API    │
           │                                  │   Integration        │
           │                                  └──────────────────────┘
           │                                  │
           └──────────────────────────────────┤ Amazon Transcribe
                                              │ Streaming API
```

### Component Interactions

1. **Authentication Flow**: Frontend requests pre-signed URL from Credential Service Lambda
2. **Connection Establishment**: Frontend uses pre-signed URL to establish WebSocket connection
3. **Token Validation**: WebSocket Server validates Session Token from query parameter
4. **Audio Streaming**: Frontend captures and transmits PCM audio in real-time
5. **Transcription**: WebSocket Server forwards audio to Transcribe, receives results
6. **Result Display**: Frontend receives and displays transcription results in real-time

---

## 1. Frontend Architecture (React/TypeScript)

### Component Structure

```
src/
├── components/
│   ├── AudioRecorder.tsx          # Audio capture and control UI
│   ├── TranscriptionDisplay.tsx   # Real-time transcription output
│   ├── ConnectionStatus.tsx       # WebSocket connection indicator
│   ├── ErrorBoundary.tsx          # Error handling wrapper
│   └── RecordingIndicator.tsx     # Visual feedback during recording
├── hooks/
│   ├── useAudioRecorder.ts        # Audio capture and PCM encoding
│   ├── useWebSocket.ts            # WebSocket lifecycle and messaging
│   ├── useCredentials.ts          # Pre-signed URL request/caching
│   └── useTranscription.ts        # Transcription state management
├── services/
│   ├── audioProcessor.ts          # Audio encoding (Web Audio API)
│   ├── webSocketClient.ts         # WebSocket management
│   ├── authService.ts             # Credential request/response
│   ├── transcribeClient.ts        # Message protocol handling
│   └── reconnectStrategy.ts       # Exponential backoff logic
├── types/
│   ├── messages.ts                # WebSocket message types
│   ├── audio.ts                   # Audio processing types
│   └── credentials.ts             # Authentication types
├── App.tsx                         # Root component
├── main.tsx                        # Entry point
└── styles/
    └── globals.css                # Global styles

vite.config.ts                      # Vite build configuration
```

### Component Descriptions

#### AudioRecorder Component
Manages microphone permission requests and recording UI state.

```typescript
// Responsibilities:
// - Request microphone access
// - Handle permission denied scenarios
// - Provide start/stop recording buttons
// - Display recording status
// - Pass audio stream to processor
```

#### TranscriptionDisplay Component
Renders real-time transcription results with visual differentiation.

```typescript
// Responsibilities:
// - Append intermediate and final results
// - Maintain transcript history
// - Visual styling for different result types
// - Scroll to latest content
```

#### WebSocket Hook (useWebSocket)
Manages connection lifecycle with automatic reconnection.

```typescript
// Responsibilities:
// - Connect/disconnect management
// - Token parameter handling
// - Message sending/receiving
// - Reconnection with exponential backoff
// - Event listener registration
```

#### Audio Processor Service
Converts Web Audio API streams to 16-bit PCM 16kHz mono.

```typescript
// Audio Processing Pipeline:
// 1. Capture: getUserMedia() → MediaStream
// 2. Context: Create AudioContext (44.1kHz or 48kHz)
// 3. Source: Create MediaStreamAudioSourceNode
// 4. Process: Use ScriptProcessorNode or AudioWorkletNode
// 5. Resample: 44.1kHz/48kHz → 16kHz via Decimation
// 6. Quantize: 32-bit float → 16-bit signed integer
// 7. Encode: PCM bytes → Base64 for WebSocket transmission
// 8. Chunk: 100ms chunks at 16kHz = 1600 samples = 3200 bytes
```

---

## 2. Audio Processing Pipeline (Web Audio API)

### Detailed Audio Processing Flow

#### Step 1: Initialization
```typescript
const audioContext = new AudioContext();
const mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
const source = audioContext.createMediaStreamSource(mediaStream);
```

#### Step 2: Capture with AudioWorklet (Preferred)
Using AudioWorkletNode for low-latency processing:

```typescript
// Load worklet processor
await audioContext.audioWorklet.addModule('audio-processor.js');

const workletNode = new AudioWorkletNode(audioContext, 'audio-processor');
workletNode.port.onmessage = (event) => {
  const pcmData = event.data; // 16-bit PCM samples
  transmitAudioChunk(pcmData);
};

source.connect(workletNode);
workletNode.connect(audioContext.destination);
```

#### Step 3: Resampling (44.1kHz → 16kHz)
Apply decimation filter by taking every Nth sample:

```typescript
const resamplingRatio = originalSampleRate / 16000;
const decimatedSamples = [];

for (let i = 0; i < float32Samples.length; i += resamplingRatio) {
  decimatedSamples.push(float32Samples[Math.floor(i)]);
}
```

#### Step 4: Quantization (float32 → int16)
Convert floating-point samples [-1.0, 1.0] to signed 16-bit integers [-32768, 32767]:

```typescript
const int16Array = new Int16Array(float32Array.length);

for (let i = 0; i < float32Array.length; i++) {
  let sample = float32Array[i];
  sample = Math.max(-1, Math.min(1, sample)); // Clamp
  int16Array[i] = sample < 0
    ? sample * 0x8000  // -32768
    : sample * 0x7FFF; // 32767
}
```

#### Step 5: Chunking and Transmission
Create 100ms chunks for transmission:

```typescript
const chunkSize = 16000 * 0.1; // 1600 samples for 100ms
const chunkBytes = chunkSize * 2; // 2 bytes per int16

const audioChunks: ArrayBuffer[] = [];
const chunkData = int16Array.slice(index, index + chunkSize);
audioChunks.push(chunkData.buffer);

// Transmit over WebSocket
websocket.send(JSON.stringify({
  type: 'audio',
  data: btoa(String.fromCharCode(...new Uint8Array(chunkData.buffer)))
}));
```

### Audio Format Specification
- **Sample Rate**: 16 kHz (required by Amazon Transcribe)
- **Bit Depth**: 16-bit signed PCM
- **Channels**: 1 (mono)
- **Frame Duration**: 100ms (1600 samples per frame)
- **Encoding**: Base64 over WebSocket JSON
- **Target Bitrate**: ~32 kbps (16000 Hz × 16 bits)

---

## 3. WebSocket Message Protocol

### Connection Flow

```
1. Frontend connects: ws://server:port/?sessionToken={TOKEN}
2. Server validates token (checks DynamoDB TTL)
3. Server responds: { type: 'connectionAck', connectionId: '...', sessionId: '...' }
4. Frontend begins audio transmission
5. Server forwards to Transcribe streaming API
6. Transcribe returns partial/final transcriptions
7. Server transmits to frontend
```

### Message Types

#### Client → Server Messages

**1. Audio Frame Message**
```json
{
  "type": "audio",
  "sequenceNumber": 1,
  "timestamp": 1234567890000,
  "data": "//NExAAYYNkAFwAAB+gAP+QA/5AA/5AA/5AA/5AA"
}
```
- `data`: Base64-encoded 16-bit PCM samples
- `sequenceNumber`: Incremental counter for ordering
- `timestamp`: Client-side millisecond timestamp

**2. Start Transcription Message**
```json
{
  "type": "startTranscription",
  "languageCode": "en-US",
  "mediaEncoding": "pcm",
  "mediaSampleRate": 16000
}
```

**3. Stop Transcription Message**
```json
{
  "type": "stopTranscription"
}
```

#### Server → Client Messages

**1. Connection Acknowledgment**
```json
{
  "type": "connectionAck",
  "connectionId": "conn-abc123",
  "sessionId": "sess-xyz789",
  "status": "connected"
}
```

**2. Transcription Result (Partial)**
```json
{
  "type": "transcriptionResult",
  "isPartial": true,
  "transcript": "Hello wor",
  "confidence": 0.92,
  "sequenceNumber": 5
}
```

**3. Transcription Result (Final)**
```json
{
  "type": "transcriptionResult",
  "isPartial": false,
  "transcript": "Hello world",
  "confidence": 0.98,
  "items": [
    { "type": "pronunciation", "value": "Hello", "confidence": 0.99 },
    { "type": "pronunciation", "value": "world", "confidence": 0.97 }
  ]
}
```

**4. Error Message**
```json
{
  "type": "error",
  "errorCode": "TRANSCRIPTION_SERVICE_ERROR",
  "message": "Transcription service temporarily unavailable",
  "recoverable": true
}
```

**5. Heartbeat/Ping**
```json
{
  "type": "ping",
  "timestamp": 1234567890000
}
```

---

## 4. Pre-Signed WebSocket URL Generation

### Lambda Credential Service Flow

#### URL Structure
```
ws://websocket-server:8080/?sessionToken=eyJhbGc...&expires=1234567890&clientId=user123
```

#### Session Token Format (JWT)
```
Header: {
  "alg": "HS256",
  "typ": "JWT",
  "kid": "key-2024-01"
}

Payload: {
  "sub": "user-123",
  "iat": 1234567890,
  "exp": 1234567890 + (15 * 60), // 15 minute expiration
  "sessionId": "sess-xyz789",
  "clientId": "app-client-1",
  "nonce": "random-nonce-123"
}

Signature: HMAC-SHA256(
  base64url(Header) + "." + base64url(Payload),
  SECRET_KEY
)
```

#### Lambda Handler Pseudocode
```typescript
export async function handler(event: APIGatewayProxyEvent) {
  // 1. Extract client credentials from request
  const clientId = event.headers['x-client-id'];
  const clientSecret = event.headers['x-client-secret'];

  // 2. Validate credentials
  const isValid = await validateClientCredentials(clientId, clientSecret);
  if (!isValid) {
    return {
      statusCode: 401,
      body: JSON.stringify({ error: 'Unauthorized' })
    };
  }

  // 3. Generate cryptographically secure token
  const sessionToken = await generateSecureToken({
    clientId,
    lifetime: 15 * 60 * 1000 // 15 minutes
  });

  // 4. Store token metadata in DynamoDB with TTL
  await storeTokenMetadata({
    sessionToken,
    clientId,
    createdAt: Date.now(),
    expiresAt: Date.now() + 15 * 60 * 1000,
    ttl: Math.floor((Date.now() + 15 * 60 * 1000) / 1000) // Unix seconds
  });

  // 5. Generate pre-signed URL
  const preSignedUrl = `${WS_SERVER_ENDPOINT}?sessionToken=${sessionToken}`;

  // 6. Return with 500ms SLA
  return {
    statusCode: 200,
    body: JSON.stringify({
      url: preSignedUrl,
      expiresIn: 15 * 60,
      sessionId: extractSessionId(sessionToken)
    })
  };
}
```

#### Performance Optimization (500ms SLA)
- Cache validation results for repeated client credentials (60s TTL)
- Use connection pooling for DynamoDB writes
- Batch token generation requests when possible
- Return response before async logging completes

---

## 5. WebSocket Server Token Validation

### Validation Flow at Connection Time

#### Step 1: Extract Token from Query Parameter
```typescript
function extractSessionToken(url: string): string | null {
  const urlParams = new URLSearchParams(url.split('?')[1]);
  return urlParams.get('sessionToken');
}
```

#### Step 2: Verify JWT Signature
```typescript
async function verifySessionToken(token: string): Promise<TokenPayload> {
  try {
    const payload = jwt.verify(token, SIGNING_KEY, {
      algorithms: ['HS256']
    });
    
    if (!payload.exp || payload.exp < Date.now() / 1000) {
      throw new Error('Token expired');
    }
    
    return payload;
  } catch (err) {
    throw new UnauthorizedException('Invalid or tampered token');
  }
}
```

#### Step 3: Check Token in Database
```typescript
async function validateTokenInStorage(sessionToken: string): Promise<boolean> {
  const response = await dynamoDb.get({
    TableName: 'SessionTokens',
    Key: { sessionToken }
  });
  
  if (!response.Item) {
    return false; // Token not found or already expired (TTL)
  }
  
  return response.Item.expiresAt > Date.now();
}
```

#### Step 4: Reject or Accept Connection
```typescript
async function onWebSocketConnect(url: string): Promise<boolean> {
  const token = extractSessionToken(url);
  
  if (!token) {
    // Reject: Missing token
    return false;
  }
  
  const payload = await verifySessionToken(token);
  const isValid = await validateTokenInStorage(token);
  
  if (!isValid) {
    // Reject: Invalid or expired
    return false;
  }
  
  // Accept: Token valid and verified
  logConnection(token, payload.clientId);
  return true;
}
```

---

## 6. WebSocket Server Architecture

### Connection Management Registry

```typescript
class ConnectionRegistry {
  private activeConnections = new Map<string, ConnectionState>();
  
  addConnection(connectionId: string, state: ConnectionState) {
    this.activeConnections.set(connectionId, {
      ...state,
      connectedAt: Date.now(),
      audioProcessed: 0
    });
  }
  
  removeConnection(connectionId: string) {
    const state = this.activeConnections.get(connectionId);
    if (state) {
      logDisconnection({
        duration: Date.now() - state.connectedAt,
        audioProcessed: state.audioProcessed,
        clientId: state.clientId
      });
      this.activeConnections.delete(connectionId);
    }
  }
  
  getConnection(connectionId: string): ConnectionState | undefined {
    return this.activeConnections.get(connectionId);
  }
  
  // Cleanup idle connections (5 minute timeout)
  startIdleConnectionCleanup(timeoutMs = 5 * 60 * 1000) {
    setInterval(() => {
      const now = Date.now();
      for (const [connId, state] of this.activeConnections) {
        if (now - state.lastActivityAt > timeoutMs) {
          this.removeConnection(connId);
        }
      }
    }, 30000); // Check every 30 seconds
  }
}
```

### WebSocket Event Handlers

#### On Connection
```typescript
wsServer.on('connection', async (ws, req) => {
  const token = extractSessionToken(req.url);
  
  if (!await isValidToken(token)) {
    ws.close(1008, 'Unauthorized');
    return;
  }
  
  const connectionId = generateConnectionId();
  const state = new ConnectionState(token, connectionId);
  
  connectionRegistry.addConnection(connectionId, state);
  
  // Send acknowledgment
  ws.send(JSON.stringify({
    type: 'connectionAck',
    connectionId,
    sessionId: extractSessionId(token)
  }));
  
  // Update last activity
  ws.on('message', (data) => {
    state.lastActivityAt = Date.now();
    handleMessage(ws, state, data);
  });
  
  // Cleanup on disconnect
  ws.on('close', () => {
    connectionRegistry.removeConnection(connectionId);
  });
  
  // Error handling
  ws.on('error', (error) => {
    logError(connectionId, error);
    ws.close(1011, 'Server error');
    connectionRegistry.removeConnection(connectionId);
  });
});
```

#### On Audio Message
```typescript
async function handleAudioMessage(ws: WebSocket, state: ConnectionState, message: AudioMessage) {
  const audioData = Buffer.from(message.data, 'base64');
  
  state.audioProcessed += audioData.length;
  
  // Forward to Amazon Transcribe
  await forwardToTranscribe(state.transcribeStream, audioData);
  
  // Results are handled by transcribeStream event listeners
}
```

---

## 7. Amazon Transcribe Streaming Integration

### Transcribe Connection Lifecycle

```typescript
async function initializeTranscribeStream(connectionId: string): Promise<EventStream> {
  const transcribeClient = new TranscribeStreamingClient({
    region: AWS_REGION,
    credentials: {
      accessKeyId: AWS_ACCESS_KEY,
      secretAccessKey: AWS_SECRET_KEY
    }
  });
  
  const command = new StartStreamTranscriptionCommand({
    LanguageCode: 'en-US',
    MediaSampleRate: 16000,
    MediaEncoding: 'pcm',
    AudioStream: asyncGenerator(audioQueue)
  });
  
  const response = await transcribeClient.send(command);
  
  // Listen for transcription events
  response.TranscriptResultStream.on('TranscriptEvent', (event) => {
    handleTranscriptionEvent(connectionId, event);
  });
  
  response.TranscriptResultStream.on('error', (error) => {
    handleTranscriptionError(connectionId, error);
  });
  
  return response.TranscriptResultStream;
}

// Audio generator from queue
async function* audioQueue(queue: AudioBuffer[]): AsyncGenerator<AudioEvent> {
  while (true) {
    if (queue.length > 0) {
      const audioData = queue.shift();
      yield {
        AudioEvent: {
          AudioChunk: {
            Data: audioData
          }
        }
      };
    } else {
      await new Promise(resolve => setTimeout(resolve, 10));
    }
  }
}
```

### Transcription Result Processing

```typescript
function handleTranscriptionEvent(connectionId: string, event: TranscriptEvent) {
  if (!event.Transcript || !event.Transcript.Results) {
    return;
  }
  
  const results = event.Transcript.Results;
  const isPartial = results.some(r => r.IsPartial);
  
  let transcript = '';
  let confidence = 0;
  let itemCount = 0;
  
  // Aggregate transcript from alternatives
  for (const result of results) {
    if (result.Alternatives && result.Alternatives.length > 0) {
      const alt = result.Alternatives[0];
      transcript += alt.Transcript;
      
      if (alt.Items) {
        itemCount += alt.Items.length;
        const avgConfidence = alt.Items.reduce((sum, item) => 
          sum + (item.Confidence || 0), 0) / alt.Items.length;
        confidence = Math.max(confidence, avgConfidence);
      }
    }
  }
  
  // Send to frontend
  sendToFrontend(connectionId, {
    type: 'transcriptionResult',
    isPartial,
    transcript,
    confidence,
    timestamp: Date.now()
  });
}

function handleTranscriptionError(connectionId: string, error: Error) {
  sendToFrontend(connectionId, {
    type: 'error',
    errorCode: 'TRANSCRIPTION_SERVICE_ERROR',
    message: error.message,
    recoverable: true
  });
}
```

---

## 8. Error Handling and Reconnection Strategies

### Exponential Backoff Algorithm

```typescript
class ExponentialBackoffStrategy {
  private retries = 0;
  private readonly maxRetries = 10;
  private readonly initialDelayMs = 1000; // 1 second
  private readonly maxDelayMs = 30000;   // 30 seconds
  
  calculateDelay(): number {
    if (this.retries >= this.maxRetries) {
      return -1; // Stop retrying
    }
    
    // Exponential: delay = min(max, initial * 2^retries)
    const exponentialDelay = this.initialDelayMs * Math.pow(2, this.retries);
    const delay = Math.min(this.maxDelayMs, exponentialDelay);
    
    // Add jitter to prevent thundering herd
    const jitter = Math.random() * 0.1 * delay;
    
    return Math.floor(delay + jitter);
  }
  
  reset() {
    this.retries = 0;
  }
  
  nextRetry() {
    this.retries++;
  }
}

// Usage
async function connectWithRetry(): Promise<WebSocket> {
  const strategy = new ExponentialBackoffStrategy();
  
  while (true) {
    try {
      return await attemptConnection();
    } catch (error) {
      const delay = strategy.calculateDelay();
      
      if (delay === -1) {
        throw new Error('Max retries exceeded');
      }
      
      displayError(`Connection failed. Retrying in ${delay}ms`);
      await sleep(delay);
      strategy.nextRetry();
    }
  }
}
```

### Error Classification and Handling

```typescript
type ErrorSeverity = 'recoverable' | 'permanent' | 'network';

interface ErrorResponse {
  type: 'error';
  errorCode: string;
  message: string;
  recoverable: boolean;
  suggestedAction?: string;
}

const errorHandlers: Record<string, ErrorSeverity> = {
  'TOKEN_EXPIRED': 'permanent',           // Refresh URL needed
  'AUTHENTICATION_FAILED': 'permanent',   // Invalid credentials
  'TRANSCRIPTION_SERVICE_ERROR': 'recoverable', // Retry
  'NETWORK_ERROR': 'network',             // Exponential backoff
  'CONNECTION_TIMEOUT': 'network',        // Exponential backoff
  'SERVER_ERROR': 'recoverable'           // Retry
};

function handleError(error: ErrorResponse, ws: WebSocket) {
  const severity = errorHandlers[error.errorCode];
  
  switch (severity) {
    case 'recoverable':
      // Attempt reconnection with exponential backoff
      scheduleReconnection(ws);
      break;
      
    case 'permanent':
      // Show user message, require manual action
      displayErrorUI(error.message, 'Please refresh and try again');
      ws.close();
      break;
      
    case 'network':
      // Automatic retry with exponential backoff
      scheduleReconnectionWithBackoff(ws);
      break;
  }
}
```

### Frontend Error States

```typescript
enum RecordingState {
  IDLE = 'idle',
  REQUESTING_PERMISSION = 'requesting_permission',
  RECORDING = 'recording',
  CONNECTING = 'connecting',
  TRANSCRIBING = 'transcribing',
  ERROR = 'error',
  RECONNECTING = 'reconnecting'
}

interface ErrorState {
  message: string;
  code: string;
  recoverable: boolean;
  retryCount?: number;
  nextRetryIn?: number; // milliseconds
}
```

---

## 9. Vite Build Configuration

### vite.config.ts

```typescript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  
  build: {
    // Target modern browsers
    target: 'ES2020',
    
    // Output directory
    outDir: 'dist',
    assetsDir: 'assets',
    
    // Minification and optimization
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: true,
      },
    },
    
    // Source maps for production debugging
    sourcemap: 'hidden',
    
    // Chunk size warnings
    chunkSizeWarningLimit: 1000,
    
    // Rollup options for code splitting
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor': [
            'react',
            'react-dom'
          ],
          'audio-processor': [
            './src/services/audioProcessor.ts'
          ],
          'websocket-client': [
            './src/services/webSocketClient.ts'
          ]
        },
        entryFileNames: 'js/[name]-[hash].js',
        chunkFileNames: 'js/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash][extname]'
      }
    }
  },
  
  server: {
    // Development server settings
    port: 5173,
    
    // HMR configuration
    hmr: {
      protocol: 'ws',
      host: 'localhost',
      port: 5173
    },
    
    // Proxy API requests (optional)
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, '')
      }
    }
  },
  
  // Environment variables
  define: {
    __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
    'process.env.VITE_WS_SERVER': JSON.stringify(
      process.env.VITE_WS_SERVER || 'ws://localhost:8080'
    ),
    'process.env.VITE_API_ENDPOINT': JSON.stringify(
      process.env.VITE_API_ENDPOINT || 'http://localhost:3000'
    )
  }
});
```

### Environment Variables (.env files)

```env
# .env.development
VITE_WS_SERVER=ws://localhost:8080
VITE_API_ENDPOINT=http://localhost:3000
VITE_LOG_LEVEL=debug

# .env.production
VITE_WS_SERVER=wss://transcription.example.com
VITE_API_ENDPOINT=https://api.example.com
VITE_LOG_LEVEL=error
```

### Build Output Structure

```
dist/
├── index.html                      # Entry HTML
├── js/
│   ├── main-[hash].js             # App bundle
│   ├── vendor-[hash].js           # React + deps
│   ├── audio-processor-[hash].js  # Audio service
│   └── websocket-client-[hash].js # WebSocket service
├── css/
│   └── main-[hash].css            # Compiled styles
├── assets/
│   ├── audio-worklet-[hash].js    # Web Audio API worklet
│   └── fonts/
└── manifest.json                  # Import manifest for HMR
```

---

## 10. Frontend Component Implementation

### useWebSocket Hook

```typescript
export function useWebSocket(preSignedUrl: string) {
  const [state, setState] = useState<WebSocketState>('connecting');
  const [error, setError] = useState<ErrorResponse | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectStrategyRef = useRef(new ExponentialBackoffStrategy());
  
  const connect = useCallback(async () => {
    try {
      setState('connecting');
      const ws = new WebSocket(preSignedUrl);
      
      ws.onopen = () => {
        setState('connected');
        setError(null);
        reconnectStrategyRef.current.reset();
      };
      
      ws.onmessage = (event) => {
        const message = JSON.parse(event.data);
        
        if (message.type === 'transcriptionResult') {
          // Handle transcription
        } else if (message.type === 'error') {
          setError(message);
          if (message.recoverable) {
            scheduleReconnect();
          }
        }
      };
      
      ws.onerror = (event) => {
        setState('error');
        setError({
          type: 'error',
          errorCode: 'WEBSOCKET_ERROR',
          message: 'WebSocket connection error',
          recoverable: true
        });
      };
      
      ws.onclose = () => {
        setState('disconnected');
        scheduleReconnect();
      };
      
      wsRef.current = ws;
    } catch (err) {
      setError({
        type: 'error',
        errorCode: 'CONNECTION_ERROR',
        message: err instanceof Error ? err.message : 'Unknown error',
        recoverable: true
      });
      scheduleReconnect();
    }
  }, [preSignedUrl]);
  
  const scheduleReconnect = useCallback(() => {
    const delay = reconnectStrategyRef.current.calculateDelay();
    if (delay > 0) {
      setState('reconnecting');
      setTimeout(() => {
        reconnectStrategyRef.current.nextRetry();
        connect();
      }, delay);
    }
  }, [connect]);
  
  const send = useCallback((message: any) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(message));
    }
  }, []);
  
  const disconnect = useCallback(() => {
    wsRef.current?.close();
    setState('disconnected');
  }, []);
  
  useEffect(() => {
    connect();
    return () => disconnect();
  }, [connect, disconnect]);
  
  return { state, error, send, disconnect };
}
```

### useAudioRecorder Hook

```typescript
export function useAudioRecorder() {
  const [isRecording, setIsRecording] = useState(false);
  const [permission, setPermission] = useState<'granted' | 'denied' | 'pending'>('pending');
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const processorRef = useRef<AudioProcessor | null>(null);
  
  const requestPermission = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;
      setPermission('granted');
      return true;
    } catch (error) {
      setPermission('denied');
      return false;
    }
  }, []);
  
  const startRecording = useCallback(async (
    onAudioChunk: (chunk: Uint8Array) => void
  ) => {
    if (!mediaStreamRef.current) {
      const granted = await requestPermission();
      if (!granted) return;
    }
    
    const audioContext = new AudioContext();
    const source = audioContext.createMediaStreamSource(mediaStreamRef.current!);
    const processor = new AudioProcessor(audioContext, onAudioChunk);
    
    source.connect(processor.node);
    processor.node.connect(audioContext.destination);
    
    audioContextRef.current = audioContext;
    processorRef.current = processor;
    setIsRecording(true);
  }, [requestPermission]);
  
  const stopRecording = useCallback(() => {
    processorRef.current?.disconnect();
    audioContextRef.current?.close();
    mediaStreamRef.current?.getTracks().forEach(track => track.stop());
    setIsRecording(false);
  }, []);
  
  return { isRecording, permission, startRecording, stopRecording, requestPermission };
}
```

---

## 11. Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system—essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Session Token Uniqueness and Expiration

*For any* two distinct token generation requests, the tokens generated SHALL be cryptographically unique AND the expiration time of each token SHALL be set to the current time plus the configured lifetime.

**Validates: Requirements 1.1, 1.3, 3.2**

### Property 2: Pre-Signed URL Structure Completeness

*For any* pre-signed URL generation request, the returned URL SHALL contain both the WebSocket Server endpoint AND a `sessionToken` query parameter with the generated token value.

**Validates: Requirements 1.2, 1.4**

### Property 3: Token Validation Correctness

*For any* WebSocket connection attempt with a Session Token, the server SHALL extract the token from the query parameter, validate its signature and expiration, and allow the connection if valid OR reject with 401 Unauthorized if invalid or expired.

**Validates: Requirements 2.1, 2.2, 2.3, 2.4, 4.2, 4.3**

### Property 4: Audio Encoding Round-Trip

*For any* audio stream captured from the microphone, after resampling to 16kHz and quantizing to 16-bit PCM, then encoding to base64 and transmitting, the server SHALL be able to decode the base64 back to the original PCM samples with bit-exact fidelity.

**Validates: Requirements 5.4, 5.5**

### Property 5: Connection Registry Consistency

*For any* WebSocket connection established and subsequently closed, the connection SHALL appear in the active connections registry when connected AND SHALL be removed from the registry upon disconnection.

**Validates: Requirements 8.1, 8.2**

### Property 6: Transcription Result Accumulation

*For any* sequence of transcription results received from the Transcribe service, the frontend SHALL append them in order to the transcript history, maintaining a contiguous transcript without loss or duplication.

**Validates: Requirements 6.1, 6.2, 6.3, 6.5**

### Property 7: Exponential Backoff Progression

*For any* sequence of reconnection attempts, the delay between consecutive attempts SHALL follow exponential growth: delay(n+1) = min(maxDelay, delay(n) × 2), with jitter applied to prevent thundering herd.

**Validates: Requirements 9.4**

### Property 8: Credential Validation Universality

*For any* client credentials provided to the Credential Service, if the credentials are valid, the service SHALL issue a Session Token; if the credentials are invalid, the service SHALL reject the request with HTTP 401.

**Validates: Requirements 10.2, 10.3**

### Property 9: Token Tamper Detection

*For any* Session Token presented to the WebSocket Server, if the token's JWT signature does not match the cryptographic verification using the shared secret key, the server SHALL reject the connection with 401 Unauthorized.

**Validates: Requirements 10.4, 10.5**

### Property 10: Audio Chunk Completeness

*For any* 100ms audio capture interval at 16kHz sample rate, the frontend SHALL generate exactly 1600 samples per chunk, encoded as 3200 bytes (16-bit PCM), transmitting chunks with incremental sequence numbers to enable reordering detection.

**Validates: Requirements 5.4, 6.6**

---

## 12. Implementation Phases

### Phase 1: Foundation (Weeks 1-2)
- Vite project setup with React + TypeScript
- Basic UI layout (AudioRecorder, TranscriptionDisplay, ConnectionStatus)
- Web Audio API audio capture and PCM encoding
- Pre-signed URL request flow (mock backend)

### Phase 2: Backend Integration (Weeks 3-4)
- Lambda Credential Service implementation
- DynamoDB token storage with TTL
- WebSocket Server basic connection handling
- Token validation at connection time

### Phase 3: Audio Streaming (Weeks 5-6)
- WebSocket message protocol implementation
- Audio chunking and transmission (100ms frames)
- Integration with Amazon Transcribe Streaming API
- Real-time transcription result handling

### Phase 4: Error Handling & Resilience (Weeks 7-8)
- Exponential backoff reconnection strategy
- Error message classification and UI display
- Connection timeout and idle detection
- Graceful degradation scenarios

### Phase 5: Performance & Testing (Weeks 9-10)
- Audio latency optimization
- WebSocket message throughput benchmarking
- Load testing with concurrent connections
- Property-based testing suite

---

## 13. Security Considerations

### Threats and Mitigations

| Threat | Mitigation |
|--------|-----------|
| Token hijacking | JWT signatures, short expiration (15min), HTTPS/WSS |
| Replay attacks | Nonce in token payload, timestamp validation |
| MITM attacks | WSS (TLS), certificate pinning in production |
| DDoS on credential service | Rate limiting, API Gateway throttling |
| Unauthorized audio access | Microphone permission checks, connection validation |
| Data in transit | Compression before encryption, WSS encryption |

### Production Hardening

```typescript
// CORS for API requests
app.use(cors({
  origin: ['https://transcription.example.com'],
  credentials: true
}));

// Rate limiting
app.use(rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100 // 100 requests per 15 minutes
}));

// Security headers
app.use(helmet());

// Request validation
app.use(express.json({ limit: '10kb' }));

// Input sanitization
const clientId = sanitize(req.headers['x-client-id']);
```

---

## Appendix: Technology Stack

- **Frontend**: React 18+, TypeScript 5+, Vite 4+
- **Styling**: CSS Modules or Tailwind CSS
- **State Management**: React Hooks + Context API
- **Backend**: AWS Lambda, API Gateway, WebSocket API
- **Streaming API**: Amazon Transcribe Streaming
- **Storage**: DynamoDB (token metadata)
- **Security**: AWS Secrets Manager, JWT, HMAC-SHA256
- **Deployment**: AWS CloudFormation or CDK
- **Monitoring**: CloudWatch Logs, X-Ray traces

---

## Document Control

- **Version**: 1.0
- **Last Updated**: 2024
- **Status**: Design Phase Complete
- **Next Phase**: Tasks Generation (Phase 4)
