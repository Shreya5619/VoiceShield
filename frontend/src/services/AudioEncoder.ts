/**
 * AudioEncoder - Chunks audio into fixed-duration segments and encodes to PCM
 * 
 * Requirements:
 * - Create 100ms chunks (1600 samples at 16kHz)
 * - Encode PCM data to Base64 for WebSocket transmission
 * - Add sequence numbers to chunks for ordering and deduplication
 * - Handle partial chunks (buffering for next chunk)
 */

import AudioQuantizer from './AudioQuantizer'

export interface AudioChunk {
  sequenceNumber: number
  data: string // Base64 encoded PCM int16 data
  timestamp: number
  duration: number // milliseconds
  sampleCount: number
}

export interface AudioEncoderConfig {
  sampleRate: number // 16000 Hz
  chunkDurationMs: number // 100 ms
}

export class AudioEncoder {
  private config: AudioEncoderConfig
  private chunkSize: number // samples per chunk
  private buffer: Float32Array
  private bufferPosition: number = 0
  private sequenceNumber: number = 0
  private totalEncodedSamples: number = 0

  constructor(config: AudioEncoderConfig) {
    this.config = config
    this.chunkSize = Math.floor((config.sampleRate * config.chunkDurationMs) / 1000)
    // Pre-allocate buffer for accumulating samples
    this.buffer = new Float32Array(this.chunkSize * 2) // 2x to handle partial chunks
  }

  /**
   * Add audio samples and return complete chunks
   * @param samples Float32Array of audio samples at target sample rate
   * @returns Array of complete chunks
   */
  encode(samples: Float32Array): AudioChunk[] {
    const chunks: AudioChunk[] = []

    // Copy samples into buffer
    for (let i = 0; i < samples.length; i++) {
      this.buffer[this.bufferPosition++] = samples[i]

      // Check if we have a complete chunk
      if (this.bufferPosition >= this.chunkSize) {
        const chunk = this.createChunk()
        chunks.push(chunk)
        // Shift remaining samples to start of buffer
        this.bufferPosition = 0
      }
    }

    return chunks
  }

  /**
   * Flush any remaining samples in buffer as a partial chunk
   * Call this when recording stops
   */
  flush(): AudioChunk | null {
    if (this.bufferPosition === 0) {
      return null
    }

    const chunk = this.createChunk()
    this.bufferPosition = 0
    return chunk
  }

  /**
   * Create a chunk from the current buffer contents
   */
  private createChunk(): AudioChunk {
    // Extract current chunk from buffer
    const chunkData = this.buffer.slice(0, this.bufferPosition)

    // Quantize to int16
    const quantized = AudioQuantizer.quantize(chunkData)

    // Encode to Base64
    const base64Data = this.encodeToBase64(quantized)

    const chunk: AudioChunk = {
      sequenceNumber: this.sequenceNumber++,
      data: base64Data,
      timestamp: Date.now(),
      duration: (this.bufferPosition / this.config.sampleRate) * 1000,
      sampleCount: this.bufferPosition,
    }

    this.totalEncodedSamples += this.bufferPosition

    return chunk
  }

  /**
   * Encode Int16Array to Base64 string
   * This allows transmission over WebSocket as text
   */
  private encodeToBase64(data: Int16Array): string {
    // Convert Int16Array to bytes
    const bytes = new Uint8Array(data.buffer)

    // Convert bytes to base64
    let binaryString = ''
    for (let i = 0; i < bytes.length; i++) {
      binaryString += String.fromCharCode(bytes[i])
    }

    return btoa(binaryString)
  }

  /**
   * Decode Base64 string back to Int16Array (for testing/verification)
   */
  static decodeFromBase64(base64Data: string): Int16Array {
    const binaryString = atob(base64Data)
    const bytes = new Uint8Array(binaryString.length)

    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i)
    }

    return new Int16Array(bytes.buffer)
  }

  /**
   * Get the chunk size in samples
   */
  getChunkSize(): number {
    return this.chunkSize
  }

  /**
   * Get the chunk duration in milliseconds
   */
  getChunkDuration(): number {
    return this.config.chunkDurationMs
  }

  /**
   * Get current sequence number
   */
  getSequenceNumber(): number {
    return this.sequenceNumber
  }

  /**
   * Get total samples encoded so far
   */
  getTotalEncodedSamples(): number {
    return this.totalEncodedSamples
  }

  /**
   * Get statistics about encoding
   */
  getStats() {
    return {
      chunkSize: this.chunkSize,
      chunkDuration: this.config.chunkDurationMs,
      sampleRate: this.config.sampleRate,
      currentSequence: this.sequenceNumber,
      totalEncodedSamples: this.totalEncodedSamples,
      bufferPosition: this.bufferPosition,
      bufferFullness: (this.bufferPosition / this.chunkSize) * 100,
    }
  }

  /**
   * Reset encoder state
   */
  reset(): void {
    this.bufferPosition = 0
    this.sequenceNumber = 0
    this.totalEncodedSamples = 0
  }
}

export default AudioEncoder
