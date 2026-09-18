/**
 * WebSocket and Connection Management Types
 */

export enum ConnectionState {
  Idle = 'idle',
  Connecting = 'connecting',
  Connected = 'connected',
  Reconnecting = 'reconnecting',
  Disconnected = 'disconnected',
  Error = 'error',
}

export interface WebSocketState {
  state: ConnectionState;
  isConnected: boolean;
  isConnecting: boolean;
  error: ErrorResponse | null;
  lastConnectedAt: number | null;
  reconnectAttempt: number;
}

export interface ErrorResponse {
  code: string;
  message: string;
  severity: ErrorSeverity;
  recoverable: boolean;
  timestamp: number;
}

export enum ErrorSeverity {
  Low = 'low',
  Medium = 'medium',
  High = 'high',
  Critical = 'critical',
}

/**
 * Audio Configuration and Processing Types
 */

export interface AudioConfig {
  sampleRate: number;
  targetSampleRate: number;
  channels: number;
  encoding: AudioEncoding;
  chunkDurationMs: number;
  chunkSize: number; // samples per chunk
}

export enum AudioEncoding {
  PCM_16 = 'PCM_16',
  PCM_8 = 'PCM_8',
}

export interface AudioFormat {
  sampleRate: number;
  channels: number;
  bitsPerSample: number;
  encoding: 'LINEAR16' | 'PCM_16' | 'PCM_8';
}

/**
 * Message Types for WebSocket Communication
 */

export enum MessageType {
  AudioMessage = 'audio',
  StartTranscription = 'startTranscription',
  StopTranscription = 'stopTranscription',
  TranscriptionResult = 'transcriptionResult',
  ConnectionAck = 'connectionAck',
  Error = 'error',
  Ping = 'ping',
  Pong = 'pong',
}

export interface AudioMessage {
  type: MessageType.AudioMessage;
  sequenceNumber: number;
  data: string; // Base64 encoded PCM data
  timestamp: number;
  duration: number; // milliseconds
}

export interface StartTranscriptionMessage {
  type: MessageType.StartTranscription;
  languageCode: string;
  mediaEncoding: AudioFormat;
  sessionId: string;
}

export interface StopTranscriptionMessage {
  type: MessageType.StopTranscription;
  sessionId: string;
}

export interface TranscriptionResultMessage {
  type: MessageType.TranscriptionResult;
  transcript: string;
  isPartial: boolean;
  confidence: number;
  items: TranscriptionItem[];
  sequenceNumber: number;
  timestamp: number;
}

export interface TranscriptionItem {
  content: string;
  type: 'pronunciation' | 'punctuation';
  confidence?: number;
  startTime?: number;
  endTime?: number;
}

export interface ConnectionAckMessage {
  type: MessageType.ConnectionAck;
  connectionId: string;
  sessionId: string;
  timestamp: number;
}

export interface ErrorMessage {
  type: MessageType.Error;
  code: string;
  message: string;
  details?: Record<string, unknown>;
  timestamp: number;
}

export interface PingMessage {
  type: MessageType.Ping;
  timestamp: number;
}

export interface PongMessage {
  type: MessageType.Pong;
  timestamp: number;
}

export type WebSocketMessage =
  | AudioMessage
  | StartTranscriptionMessage
  | StopTranscriptionMessage
  | TranscriptionResultMessage
  | ConnectionAckMessage
  | ErrorMessage
  | PingMessage
  | PongMessage;

/**
 * Authentication and Credential Types
 */

export interface AuthTokenResponse {
  url: string;
  sessionId: string;
  token: string;
  expiresIn: number; // seconds
  timestamp: number;
}

export interface CredentialRequest {
  clientId?: string;
  clientSecret?: string;
}

/**
 * Transcription State Types
 */

export interface TranscriptionSegment {
  id: string;
  transcript: string;
  isPartial: boolean;
  confidence: number;
  items: TranscriptionItem[];
  sequenceNumber: number;
  timestamp: number;
}

export interface TranscriptionState {
  segments: TranscriptionSegment[];
  currentPartialResult: TranscriptionSegment | null;
  isTranscribing: boolean;
  totalSegments: number;
  lastUpdateAt: number | null;
}

/**
 * Recording Session Types
 */

export interface RecordingSession {
  id: string;
  startedAt: number;
  endedAt: number | null;
  isActive: boolean;
  audioCount: number;
  totalAudioBytes: number;
  transcriptionCount: number;
}

/**
 * UI State Types
 */

export interface UIState {
  isRecording: boolean;
  showPermissionError: boolean;
  permissionErrorMessage: string;
  connectionStatus: ConnectionState;
  connectionError: ErrorResponse | null;
  retryCountdown: number; // seconds
  isRetrying: boolean;
}
