/**
 * Property-Based Tests for Audio Encoding Round-Trip
 * 
 * Property 4: Audio Encoding Round-Trip
 * Validates: Requirements 5.4, 5.5
 * 
 * Test that PCM data survives encode/decode cycle with bit-exact fidelity
 * for various audio sample values including edge cases
 */

import AudioResampler from './AudioResampler'
import AudioQuantizer from './AudioQuantizer'
import AudioEncoder from './AudioEncoder'

/**
 * Generate test audio with specific characteristics
 */
function generateTestAudio(
  duration: number, // milliseconds
  sampleRate: number = 16000,
  frequency: number = 440 // Hz
): Float32Array {
  const sampleCount = Math.floor((sampleRate * duration) / 1000)
  const audio = new Float32Array(sampleCount)

  for (let i = 0; i < sampleCount; i++) {
    const t = i / sampleRate
    audio[i] = Math.sin(2 * Math.PI * frequency * t)
  }

  return audio
}

/**
 * Calculate difference between two signals (MSE)
 */
function calculateMeanSquaredError(signal1: Float32Array, signal2: Float32Array): number {
  if (signal1.length !== signal2.length) {
    throw new Error('Signals must have same length')
  }

  let sumSquaredDiff = 0

  for (let i = 0; i < signal1.length; i++) {
    const diff = signal1[i] - signal2[i]
    sumSquaredDiff += diff * diff
  }

  return sumSquaredDiff / signal1.length
}

/**
 * Calculate signal-to-quantization-noise ratio (SQNR)
 */
function calculateSQNR(original: Float32Array, quantized: Float32Array): number {
  if (original.length !== quantized.length) {
    throw new Error('Signals must have same length')
  }

  let signalPower = 0
  let noisePower = 0

  for (let i = 0; i < original.length; i++) {
    const signal = original[i]
    const noise = original[i] - quantized[i]

    signalPower += signal * signal
    noisePower += noise * noise
  }

  // Avoid division by zero
  if (noisePower === 0) {
    return Infinity
  }

  const sqnr = 10 * Math.log10(signalPower / noisePower)
  return sqnr
}

/**
 * Test suite for audio encoding round-trip
 */
export const AudioProcessorTests = {
  /**
   * Property 4.1: Silence Round-Trip
   * Verify that silence (zeros) remains silence after encoding/decoding
   */
  testSilenceRoundTrip(): { pass: boolean; error?: string } {
    const silence = new Float32Array(16000) // 1 second of silence at 16kHz

    // Quantize to int16
    const quantized = AudioQuantizer.quantize(silence)

    // All values should be 0
    for (let i = 0; i < quantized.length; i++) {
      if (quantized[i] !== 0) {
        return {
          pass: false,
          error: `Expected silence to quantize to 0, got ${quantized[i]} at index ${i}`,
        }
      }
    }

    // Decode back to float32
    const decoded = AudioQuantizer.int16ToFloat32(quantized)

    // All values should be 0
    for (let i = 0; i < decoded.length; i++) {
      if (decoded[i] !== 0) {
        return {
          pass: false,
          error: `Expected decoded silence to be 0, got ${decoded[i]} at index ${i}`,
        }
      }
    }

    return { pass: true }
  },

  /**
   * Property 4.2: Full Scale Round-Trip
   * Verify that ±1.0 (full scale) quantizes correctly
   */
  testFullScaleRoundTrip(): { pass: boolean; error?: string } {
    const fullScale = new Float32Array([1.0, -1.0, 0.5, -0.5])

    const quantized = AudioQuantizer.quantize(fullScale)
    const decoded = AudioQuantizer.int16ToFloat32(quantized)

    // Check expected quantized values
    if (quantized[0] !== 32767) {
      return {
        pass: false,
        error: `Expected 1.0 to quantize to 32767, got ${quantized[0]}`,
      }
    }

    if (quantized[1] !== -32768) {
      return {
        pass: false,
        error: `Expected -1.0 to quantize to -32768, got ${quantized[1]}`,
      }
    }

    // Check decoded values are in expected range
    if (decoded[0] !== 1.0) {
      return {
        pass: false,
        error: `Expected 32767 to decode to 1.0, got ${decoded[0]}`,
      }
    }

    return { pass: true }
  },

  /**
   * Property 4.3: Clipping Detection
   * Verify that values > 1.0 or < -1.0 are properly clipped
   */
  testClippingDetection(): { pass: boolean; error?: string } {
    const clipped = new Float32Array([1.5, -1.5, 2.0, -2.0, 0.5])

    const quantized = AudioQuantizer.quantize(clipped)

    // Check that clipping is detected
    if (!AudioQuantizer.hasClipping(quantized, 0)) {
      return {
        pass: false,
        error: 'Expected clipping to be detected but it was not',
      }
    }

    // Verify clipped values
    if (quantized[0] !== 32767 || quantized[1] !== -32768) {
      return {
        pass: false,
        error: `Expected clipping to max/min values, got ${quantized[0]}, ${quantized[1]}`,
      }
    }

    return { pass: true }
  },

  /**
   * Property 4.4: Edge Cases (NaN, Infinity)
   * Verify handling of special float values
   */
  testEdgeCases(): { pass: boolean; error?: string } {
    const edgeCases = new Float32Array([NaN, Infinity, -Infinity, 0.0])

    try {
      const quantized = AudioQuantizer.quantize(edgeCases)

      // NaN should become 0
      if (quantized[0] !== 0) {
        return {
          pass: false,
          error: `Expected NaN to become 0, got ${quantized[0]}`,
        }
      }

      // Infinity should become max
      if (quantized[1] !== 32767) {
        return {
          pass: false,
          error: `Expected Infinity to become 32767, got ${quantized[1]}`,
        }
      }

      // -Infinity should become min
      if (quantized[2] !== -32768) {
        return {
          pass: false,
          error: `Expected -Infinity to become -32768, got ${quantized[2]}`,
        }
      }

      return { pass: true }
    } catch (error) {
      return {
        pass: false,
        error: `Edge case handling threw error: ${error}`,
      }
    }
  },

  /**
   * Property 4.5: Sine Wave Round-Trip
   * Verify that audio signal survives quantization with acceptable quality
   */
  testSineWaveRoundTrip(): { pass: boolean; error?: string; details?: Record<string, any> } {
    // Generate 100ms sine wave at 1kHz
    const original = generateTestAudio(100, 16000, 1000)

    // Quantize
    const quantized = AudioQuantizer.quantize(original)

    // Decode
    const decoded = AudioQuantizer.int16ToFloat32(quantized)

    // Calculate quality metrics
    const mse = calculateMeanSquaredError(original, decoded)
    const sqnr = calculateSQNR(original, decoded)

    // SQNR should be > 90dB for 16-bit quantization
    if (sqnr < 90) {
      return {
        pass: false,
        error: `SQNR ${sqnr.toFixed(2)}dB is below expected 90dB threshold`,
        details: { mse, sqnr },
      }
    }

    return {
      pass: true,
      details: { mse, sqnr: `${sqnr.toFixed(2)}dB` },
    }
  },

  /**
   * Property 4.6: Encoder Base64 Round-Trip
   * Verify that Base64 encoding/decoding is lossless
   */
  testEncoderBase64RoundTrip(): { pass: boolean; error?: string } {
    // Create test int16 data
    const original = AudioQuantizer.quantize(generateTestAudio(10, 16000, 440))

    // Encode to Base64
    const encoder = new AudioEncoder({ sampleRate: 16000, chunkDurationMs: 100 })
    const chunk = encoder.encode(generateTestAudio(10, 16000, 440))[0]

    if (!chunk) {
      return {
        pass: false,
        error: 'Failed to create chunk',
      }
    }

    // Decode from Base64
    const decoded = AudioEncoder.decodeFromBase64(chunk.data)

    // Verify length
    if (decoded.length !== original.length) {
      return {
        pass: false,
        error: `Length mismatch: ${decoded.length} vs ${original.length}`,
      }
    }

    // Verify content
    for (let i = 0; i < original.length; i++) {
      if (decoded[i] !== original[i]) {
        return {
          pass: false,
          error: `Mismatch at index ${i}: ${decoded[i]} vs ${original[i]}`,
        }
      }
    }

    return { pass: true }
  },

  /**
   * Property 4.7: White Noise Round-Trip
   * Verify quantization quality for random noise
   */
  testWhiteNoiseRoundTrip(): { pass: boolean; error?: string; details?: Record<string, any> } {
    // Generate white noise
    const noise = new Float32Array(16000)
    for (let i = 0; i < noise.length; i++) {
      noise[i] = (Math.random() - 0.5) * 2 // Random value in [-1, 1]
    }

    // Quantize
    const quantized = AudioQuantizer.quantize(noise)

    // Decode
    const decoded = AudioQuantizer.int16ToFloat32(quantized)

    // Calculate quality metrics
    const mse = calculateMeanSquaredError(noise, decoded)
    const sqnr = calculateSQNR(noise, decoded)

    // White noise SQNR should still be > 90dB for 16-bit quantization
    if (sqnr < 90) {
      return {
        pass: false,
        error: `White noise SQNR ${sqnr.toFixed(2)}dB is below 90dB`,
        details: { mse, sqnr },
      }
    }

    return {
      pass: true,
      details: { mse, sqnr: `${sqnr.toFixed(2)}dB` },
    }
  },

  /**
   * Property 4.8: Resampler Consistency
   * Verify resampler maintains audio quality
   */
  testResamplerConsistency(): { pass: boolean; error?: string; details?: Record<string, any> } {
    // Generate audio at 48kHz
    const sampleRate48k = 48000
    const duration = 100 // ms
    const sampleCount = Math.floor((sampleRate48k * duration) / 1000)
    const audio48k = generateTestAudio(duration, sampleRate48k, 1000)

    // Resample to 16kHz
    const resampler = new AudioResampler({
      inputSampleRate: sampleRate48k,
      outputSampleRate: 16000,
    })

    const audio16k = resampler.resample(audio48k)

    // Expected output length
    const expectedLength = Math.ceil((audio48k.length * 16000) / sampleRate48k)

    if (Math.abs(audio16k.length - expectedLength) > 1) {
      return {
        pass: false,
        error: `Output length ${audio16k.length} doesn't match expected ${expectedLength}`,
      }
    }

    // Check that output is normalized
    let maxSample = 0
    for (let i = 0; i < audio16k.length; i++) {
      if (Math.abs(audio16k[i]) > maxSample) {
        maxSample = Math.abs(audio16k[i])
      }
    }

    if (maxSample > 1.1) {
      // Allow slight overshoot due to interpolation
      return {
        pass: false,
        error: `Resampled audio exceeds expected range: ${maxSample}`,
      }
    }

    return {
      pass: true,
      details: { outputLength: audio16k.length, expectedLength, maxSample },
    }
  },
}

/**
 * Run all tests
 */
export function runAllAudioProcessorTests() {
  const results: Record<string, any> = {}

  for (const [testName, testFn] of Object.entries(AudioProcessorTests)) {
    try {
      const result = (testFn as Function)()
      results[testName] = result
    } catch (error) {
      results[testName] = {
        pass: false,
        error: `Test threw error: ${error}`,
      }
    }
  }

  // Summary
  const totalTests = Object.keys(results).length
  const passedTests = Object.values(results).filter((r: any) => r.pass).length

  return {
    summary: {
      total: totalTests,
      passed: passedTests,
      failed: totalTests - passedTests,
      passPercentage: ((passedTests / totalTests) * 100).toFixed(2) + '%',
    },
    tests: results,
  }
}

export default AudioProcessorTests
