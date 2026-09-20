/**
 * Encode a Float32 mono PCM array into a proper RIFF WAV Blob.
 *
 * Canonical shared implementation for the whole frontend. Produces a
 * mono (1 channel), 16-bit PCM RIFF WAV at the given sample rate, matching
 * the enrollment recorder's on-the-wire byte format exactly. The backend
 * resamples to 16 kHz, so any sample rate is fine.
 *
 * @param samples    Float32 mono PCM samples (values expected in [-1, 1]).
 * @param sampleRate Sample rate in Hz written into the WAV header.
 * @returns A `audio/wav` Blob containing a mono, 16-bit PCM RIFF WAV.
 */
export function encodeWav(samples: Float32Array, sampleRate: number): Blob {
  const dataSize = samples.length * 2
  const buf = new ArrayBuffer(44 + dataSize)
  const v = new DataView(buf)
  const ws = (off: number, s: string) => {
    for (let i = 0; i < s.length; i++) v.setUint8(off + i, s.charCodeAt(i))
  }
  ws(0, 'RIFF'); v.setUint32(4, 36 + dataSize, true); ws(8, 'WAVE')
  ws(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true)
  v.setUint32(24, sampleRate, true); v.setUint32(28, sampleRate * 2, true)
  v.setUint16(32, 2, true); v.setUint16(34, 16, true)
  ws(36, 'data'); v.setUint32(40, dataSize, true)
  let off = 44
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]))
    v.setInt16(off, s < 0 ? s * 0x8000 : s * 0x7fff, true)
    off += 2
  }
  return new Blob([buf], { type: 'audio/wav' })
}
