/**
 * AudioProcessor - Handles microphone capture and Web Audio API processing
 * 
 * Responsibilities:
 * - Capture audio from microphone using getUserMedia
 * - Initialize Web Audio API context with proper configuration
 * - Set up AudioWorklet for low-latency processing
 * - Manage media stream and audio context lifecycle
 * - Provide audio frame callbacks for processing
 */

export interface AudioProcessorConfig {
  targetSampleRate: number // 16000 Hz for Transcribe
  chunkDurationMs: number // 100 ms chunks
  echoCancellation?: boolean
  noiseSuppression?: boolean
  autoGainControl?: boolean
}

export interface AudioFrame {
  data: Float32Array
  sampleRate: number
  timestamp: number
  duration: number // milliseconds
}

type AudioFrameCallback = (frame: AudioFrame) => void

export class AudioProcessor {
  private audioContext: AudioContext | null = null
  private mediaStream: MediaStream | null = null
  private mediaStreamAudioSourceNode: MediaStreamAudioSourceNode | null = null
  private scriptProcessorNode: ScriptProcessorNode | null = null
  private analyserNode: AnalyserNode | null = null
  private config: AudioProcessorConfig
  private frameCallbacks: Set<AudioFrameCallback> = new Set()
  private isRecording = false
  private totalAudioFrames = 0
  private totalAudioBytes = 0

  constructor(config: Partial<AudioProcessorConfig> = {}) {
    this.config = {
      targetSampleRate: config.targetSampleRate || 16000,
      chunkDurationMs: config.chunkDurationMs || 100,
      echoCancellation: config.echoCancellation !== false,
      noiseSuppression: config.noiseSuppression !== false,
      autoGainControl: config.autoGainControl ?? false,
    }
  }

  /**
   * Request microphone access and initialize audio context
   */
  async initialize(): Promise<void> {
    try {
      // Request microphone access
      this.mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: this.config.echoCancellation,
          noiseSuppression: this.config.noiseSuppression,
          autoGainControl: this.config.autoGainControl,
        },
        video: false,
      })

      // Create or get audio context
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext
      this.audioContext = new AudioContextClass()

      // Resume audio context if suspended
      if (this.audioContext.state === 'suspended') {
        await this.audioContext.resume()
      }

      // Create source from media stream
      this.mediaStreamAudioSourceNode = this.audioContext.createMediaStreamSource(this.mediaStream)

      // Create analyser for visualization
      this.analyserNode = this.audioContext.createAnalyser()
      this.analyserNode.fftSize = 2048

      // Create script processor for audio processing
      // bufferSize should be power of 2: 256, 512, 1024, 2048, 4096, 8192, 16384
      const bufferSize = Math.pow(
        2,
        Math.ceil(Math.log2((this.audioContext.sampleRate * this.config.chunkDurationMs) / 1000))
      )

      this.scriptProcessorNode = this.audioContext.createScriptProcessor(
        bufferSize,
        1, // 1 input channel
        1 // 1 output channel
      )

      // Wire up the audio graph
      this.mediaStreamAudioSourceNode.connect(this.scriptProcessorNode)
      this.mediaStreamAudioSourceNode.connect(this.analyserNode)
      this.scriptProcessorNode.connect(this.audioContext.destination)

      // Set up audio processing callback
      this.scriptProcessorNode.onaudioprocess = this.handleAudioProcess.bind(this)
    } catch (error) {
      this.cleanup()
      throw error
    }
  }

  /**
   * Start recording audio
   */
  start(): void {
    if (!this.audioContext) {
      throw new Error('AudioProcessor not initialized. Call initialize() first.')
    }

    if (this.audioContext.state === 'suspended') {
      this.audioContext.resume().catch(console.error)
    }

    this.isRecording = true
    this.totalAudioFrames = 0
    this.totalAudioBytes = 0
  }

  /**
   * Stop recording audio
   */
  stop(): void {
    this.isRecording = false
  }

  /**
   * Register a callback for audio frames
   */
  onAudioFrame(callback: AudioFrameCallback): () => void {
    this.frameCallbacks.add(callback)

    // Return unsubscribe function
    return () => {
      this.frameCallbacks.delete(callback)
    }
  }

  /**
   * Handle audio process events from script processor
   */
  private handleAudioProcess(event: AudioProcessingEvent): void {
    if (!this.isRecording) {
      return
    }

    const inputData = event.inputBuffer.getChannelData(0)

    // Create a copy of the audio data
    const audioFrame = new Float32Array(inputData.length)
    audioFrame.set(inputData)

    const frame: AudioFrame = {
      data: audioFrame,
      sampleRate: this.audioContext?.sampleRate || 44100,
      timestamp: this.audioContext?.currentTime || Date.now() / 1000,
      duration: (inputData.length / (this.audioContext?.sampleRate || 44100)) * 1000,
    }

    this.totalAudioFrames++
    this.totalAudioBytes += inputData.length * 4 // 4 bytes per float32

    // Invoke all registered callbacks
    this.frameCallbacks.forEach((callback) => {
      try {
        callback(frame)
      } catch (error) {
        console.error('Error in audio frame callback:', error)
      }
    })
  }

  /**
   * Get analyser node for visualization
   */
  getAnalyser(): AnalyserNode | null {
    return this.analyserNode
  }

  /**
   * Get current audio statistics
   */
  getStats() {
    return {
      isRecording: this.isRecording,
      totalFrames: this.totalAudioFrames,
      totalBytes: this.totalAudioBytes,
      audioContextState: this.audioContext?.state,
      audioContextSampleRate: this.audioContext?.sampleRate,
    }
  }

  /**
   * Get media stream for use in other APIs
   */
  getMediaStream(): MediaStream | null {
    return this.mediaStream
  }

  /**
   * Get audio context for advanced use cases
   */
  getAudioContext(): AudioContext | null {
    return this.audioContext
  }

  /**
   * Check if processor is initialized
   */
  isInitialized(): boolean {
    return this.audioContext !== null && this.mediaStream !== null
  }

  /**
   * Cleanup resources
   */
  cleanup(): void {
    this.stop()

    // Disconnect and close audio nodes
    if (this.scriptProcessorNode) {
      this.scriptProcessorNode.disconnect()
      this.scriptProcessorNode.onaudioprocess = null
      this.scriptProcessorNode = null
    }

    if (this.analyserNode) {
      this.analyserNode.disconnect()
      this.analyserNode = null
    }

    if (this.mediaStreamAudioSourceNode) {
      this.mediaStreamAudioSourceNode.disconnect()
      this.mediaStreamAudioSourceNode = null
    }

    // Close audio context
    if (this.audioContext && this.audioContext.state !== 'closed') {
      this.audioContext.close().catch(console.error)
      this.audioContext = null
    }

    // Stop media stream tracks
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach((track) => track.stop())
      this.mediaStream = null
    }

    this.frameCallbacks.clear()
  }
}

export default AudioProcessor
