/**
 * AudioQuantizer - Converts float32 audio samples to int16 PCM format
 * 
 * Requirements:
 * - Input: Float32Array with samples in range [-1.0, 1.0]
 * - Output: Int16Array with samples in range [-32768, 32767]
 * - Handles clamping to prevent clipping
 * - Handles edge cases (NaN, Infinity)
 */

/**
 * Convert a single float32 sample to int16
 * @param sample Float32 sample in range [-1.0, 1.0]
 * @returns Int16 sample in range [-32768, 32767]
 */
function float32ToInt16Sample(sample: number): number {
  // Handle special cases
  if (isNaN(sample)) {
    return 0
  }

  if (sample === Infinity) {
    return 32767
  }

  if (sample === -Infinity) {
    return -32768
  }

  // Clamp to valid range [-1.0, 1.0]
  let clipped = sample

  if (sample > 1.0) {
    clipped = 1.0
  } else if (sample < -1.0) {
    clipped = -1.0
  }

  // Scale to int16 range and round
  // Multiply by 32767 (not 32768) to ensure values fit in int16 range
  return Math.round(clipped * 32767)
}

export class AudioQuantizer {
  /**
   * Quantize float32 audio to int16 PCM
   * @param inputData Float32Array with samples in range [-1.0, 1.0]
   * @returns Int16Array with quantized samples
   */
  static quantize(inputData: Float32Array): Int16Array {
    const outputLength = inputData.length
    const outputData = new Int16Array(outputLength)

    for (let i = 0; i < outputLength; i++) {
      outputData[i] = float32ToInt16Sample(inputData[i])
    }

    return outputData
  }

  /**
   * Quantize multiple float32 channels to interleaved int16 PCM
   * Used for multi-channel audio (stereo, surround)
   * 
   * @param channels Array of Float32Arrays, one per channel
   * @returns Int16Array with interleaved samples
   */
  static quantizeInterleaved(channels: Float32Array[]): Int16Array {
    if (channels.length === 0) {
      return new Int16Array(0)
    }

    const channelCount = channels.length
    const sampleCount = channels[0].length
    const outputData = new Int16Array(sampleCount * channelCount)

    let outputIndex = 0

    for (let i = 0; i < sampleCount; i++) {
      for (let c = 0; c < channelCount; c++) {
        outputData[outputIndex++] = float32ToInt16Sample(channels[c][i])
      }
    }

    return outputData
  }

  /**
   * Convert int16 back to float32 (for round-trip testing)
   * @param inputData Int16Array
   * @returns Float32Array
   */
  static int16ToFloat32(inputData: Int16Array): Float32Array {
    const outputData = new Float32Array(inputData.length)

    for (let i = 0; i < inputData.length; i++) {
      // Divide by 32767 to normalize back to [-1.0, 1.0]
      outputData[i] = inputData[i] / 32767
    }

    return outputData
  }

  /**
   * Get statistics about a quantized signal
   * Useful for debugging and validation
   */
  static getStats(data: Int16Array) {
    let min = Infinity
    let max = -Infinity
    let sum = 0
    let sumOfSquares = 0
    let zeroCount = 0

    for (let i = 0; i < data.length; i++) {
      const sample = data[i]

      if (sample < min) min = sample
      if (sample > max) max = sample

      sum += sample
      sumOfSquares += sample * sample

      if (sample === 0) zeroCount++
    }

    const mean = sum / data.length
    const variance = sumOfSquares / data.length - mean * mean
    const stdDev = Math.sqrt(Math.max(0, variance))
    const rms = Math.sqrt(sumOfSquares / data.length)

    return {
      min,
      max,
      mean: Math.round(mean * 100) / 100,
      stdDev: Math.round(stdDev * 100) / 100,
      rms: Math.round(rms * 100) / 100,
      zeroCount,
      zeroPercentage: ((zeroCount / data.length) * 100).toFixed(2) + '%',
      peak: Math.max(Math.abs(min), Math.abs(max)),
      peakDb: Math.round(20 * Math.log10(Math.max(Math.abs(min), Math.abs(max)) / 32767) * 100) / 100,
    }
  }

  /**
   * Detect if quantized signal has clipping
   * Clipping occurs when output is at min (-32768) or max (32767)
   */
  static hasClipping(data: Int16Array, threshold: number = 0): boolean {
    const clippingThreshold = Math.max(
      Math.abs(-32768 + threshold),
      Math.abs(32767 - threshold)
    )

    for (let i = 0; i < data.length; i++) {
      if (Math.abs(data[i]) >= clippingThreshold) {
        return true
      }
    }

    return false
  }
}

export default AudioQuantizer
