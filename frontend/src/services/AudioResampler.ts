/**
 * AudioResampler - Resamples audio from one sample rate to another
 * 
 * Uses linear interpolation for downsampling from higher sample rates (44.1kHz, 48kHz) to 16kHz
 * Maintains audio quality through proper decimation filtering
 * 
 * Requirements:
 * - Input: 44.1kHz or 48kHz (float32)
 * - Output: 16kHz (float32)
 * - Method: Linear interpolation with decimation
 */

export interface ResamplerConfig {
  inputSampleRate: number // typically 44100 or 48000
  outputSampleRate: number // typically 16000 for transcription
}

/**
 * Simple low-pass filter for anti-aliasing during downsampling
 */
class LowPassFilter {
  private state: number[] = []
  private coefficients: number[] = []

  constructor(
    cutoffFrequency: number,
    sampleRate: number,
    order: number = 2
  ) {
    // Simplified first-order low-pass filter coefficients
    // For production, consider using more sophisticated filter designs
    const omega = (2 * Math.PI * cutoffFrequency) / sampleRate
    const sn = Math.sin(omega)
    const cs = Math.cos(omega)
    const alpha = sn / (2 * Math.sqrt(2))

    const b0 = (1 - cs) / 2
    const b1 = 1 - cs
    const b2 = (1 - cs) / 2
    const a0 = 1 + alpha
    const a1 = -2 * cs
    const a2 = 1 - alpha

    this.coefficients = [
      b0 / a0,
      b1 / a0,
      b2 / a0,
      a1 / a0,
      a2 / a0,
    ]

    this.state = new Array(order).fill(0)
  }

  /**
   * Apply filter to a single sample using Direct Form II
   */
  process(sample: number): number {
    const w = sample - this.coefficients[3] * this.state[0] - this.coefficients[4] * this.state[1]
    const y = this.coefficients[0] * w + this.coefficients[1] * this.state[0] + this.coefficients[2] * this.state[1]

    // Update state
    this.state[1] = this.state[0]
    this.state[0] = w

    return y
  }
}

export class AudioResampler {
  private config: ResamplerConfig
  private resamplingRatio: number
  private lowPassFilter: LowPassFilter
  private buffer: number[] = []
  private filteredBuffer: number[] = []

  constructor(config: ResamplerConfig) {
    this.config = config
    this.resamplingRatio = config.outputSampleRate / config.inputSampleRate

    if (this.resamplingRatio > 1) {
      throw new Error(
        `Upsampling not supported. Output rate (${config.outputSampleRate}) must be <= input rate (${config.inputSampleRate})`
      )
    }

    // Low-pass filter cutoff frequency = half the output sample rate (Nyquist)
    // Add small margin to prevent aliasing
    const cutoffFrequency = (config.outputSampleRate / 2) * 0.95
    this.lowPassFilter = new LowPassFilter(cutoffFrequency, config.inputSampleRate)
  }

  /**
   * Resample audio data from input sample rate to output sample rate
   * Uses linear interpolation after filtering
   */
  resample(inputData: Float32Array): Float32Array {
    const inputLength = inputData.length
    const outputLength = Math.ceil(inputLength * this.resamplingRatio)
    const outputData = new Float32Array(outputLength)

    // First pass: apply low-pass filter to prevent aliasing
    const filtered = new Float32Array(inputLength)
    for (let i = 0; i < inputLength; i++) {
      filtered[i] = this.lowPassFilter.process(inputData[i])
    }

    // Second pass: linear interpolation for downsampling
    for (let i = 0; i < outputLength; i++) {
      // Position in the original signal
      const originalPos = i / this.resamplingRatio

      // Get integer and fractional parts
      const index = Math.floor(originalPos)
      const fraction = originalPos - index

      // Linear interpolation between two adjacent samples
      if (index + 1 < inputLength) {
        const sample0 = filtered[index]
        const sample1 = filtered[index + 1]
        outputData[i] = sample0 + (sample1 - sample0) * fraction
      } else if (index < inputLength) {
        // Last sample
        outputData[i] = filtered[index]
      } else {
        outputData[i] = 0
      }
    }

    return outputData
  }

  /**
   * Get the resampling ratio (output/input)
   */
  getResamplingRatio(): number {
    return this.resamplingRatio
  }

  /**
   * Get input and output sample rates
   */
  getConfig(): ResamplerConfig {
    return { ...this.config }
  }
}

export default AudioResampler
