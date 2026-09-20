/**
 * RollingSnippetBuffer — a bounded FIFO of recent caller-audio snippets.
 *
 * Fed by the caller-only WAV blobs already emitted by `useVADDiarization`
 * (~3 s windows). Each incoming WAV blob is decoded back to mono
 * `Float32Array` samples so contiguous segments can be re-assembled and
 * re-encoded on demand via the shared `encodeWav` util.
 *
 * Invariants (Requirements 2.2, 2.3, 6.1): after every `push`,
 * `size <= maxSnippets` and `totalDurationMs <= maxDurationMs`, and the
 * retained snippets are exactly the most recent ones (oldest evicted first).
 */

import { encodeWav } from '../utils/wav'

export interface Snippet {
  /** Mono PCM samples at `sampleRate` (values expected in [-1, 1]). */
  samples: Float32Array
  sampleRate: number
  durationMs: number
  /** Epoch milliseconds at which this snippet was captured. */
  capturedAt: number
}

export interface RollingSnippetBufferConfig {
  /** Hard upper bound on retained audio (default 15_000 ms). */
  maxDurationMs?: number
  /** Hard upper bound on snippet count (default 8). Whichever bound hits first evicts. */
  maxSnippets?: number
  /** Minimum contiguous duration a FreshSegment must contain (default 4_000 ms). */
  minSegmentMs?: number
}

export interface FreshSegment {
  /** Mono RIFF WAV, `encodeWav()`-compatible. */
  wavBlob: Blob
  durationMs: number
  sampleRate: number
}

const DEFAULT_MAX_DURATION_MS = 15_000
const DEFAULT_MAX_SNIPPETS = 8
const DEFAULT_MIN_SEGMENT_MS = 4_000

export class RollingSnippetBuffer {
  private snippets: Snippet[] = []
  private readonly maxDurationMs: number
  private readonly maxSnippets: number
  private readonly minSegmentMs: number

  constructor(config: RollingSnippetBufferConfig = {}) {
    this.maxDurationMs = config.maxDurationMs ?? DEFAULT_MAX_DURATION_MS
    this.maxSnippets = config.maxSnippets ?? DEFAULT_MAX_SNIPPETS
    this.minSegmentMs = config.minSegmentMs ?? DEFAULT_MIN_SEGMENT_MS
  }

  /**
   * Push a caller snippet; evicts the oldest snippets (FIFO) until both the
   * count bound (`maxSnippets`) and the duration bound (`maxDurationMs`) hold.
   * The newest snippets are always retained.
   */
  push(snippet: Snippet): void {
    this.snippets.push(snippet)

    // Evict oldest first until BOTH bounds are satisfied. Always keep at
    // least the just-pushed snippet so a single oversized snippet does not
    // empty the buffer entirely.
    while (
      this.snippets.length > 1 &&
      (this.snippets.length > this.maxSnippets ||
        this.computeTotalDurationMs() > this.maxDurationMs)
    ) {
      this.snippets.shift()
    }
  }

  /** Total retained duration in milliseconds across all snippets. */
  get totalDurationMs(): number {
    return this.computeTotalDurationMs()
  }

  /** Number of retained snippets. */
  get size(): number {
    return this.snippets.length
  }

  /** True when at least `minSegmentMs` of contiguous audio is retained. */
  canAssembleSegment(): boolean {
    return this.freshestContiguousDurationMs() >= this.minSegmentMs
  }

  /**
   * Assemble the freshest contiguous span of at least `minSegmentMs`,
   * re-encode it as a mono RIFF WAV via the shared `encodeWav`, and return
   * the resulting `FreshSegment`. Returns `null` when there is not enough
   * retained audio to satisfy `minSegmentMs`.
   *
   * "Freshest" means the assembly walks from the newest snippet backwards,
   * accumulating contiguous same-sample-rate snippets until the accumulated
   * duration reaches `minSegmentMs`.
   */
  selectFreshSegment(): FreshSegment | null {
    if (this.snippets.length === 0) return null

    // Walk from newest → oldest, collecting a contiguous run sharing the
    // newest snippet's sample rate, until we have at least minSegmentMs.
    const sampleRate = this.snippets[this.snippets.length - 1].sampleRate
    const selected: Snippet[] = []
    let accumulatedMs = 0

    for (let i = this.snippets.length - 1; i >= 0; i--) {
      const s = this.snippets[i]
      // Contiguity for re-encoding requires a consistent sample rate; stop at
      // the first mismatch so we never splice samples of differing rates.
      if (s.sampleRate !== sampleRate) break
      selected.push(s)
      accumulatedMs += s.durationMs
      if (accumulatedMs >= this.minSegmentMs) break
    }

    if (accumulatedMs < this.minSegmentMs) return null

    // `selected` is newest → oldest; reverse to chronological order before
    // concatenating the sample data.
    selected.reverse()

    const totalSamples = selected.reduce((n, s) => n + s.samples.length, 0)
    const merged = new Float32Array(totalSamples)
    let offset = 0
    for (const s of selected) {
      merged.set(s.samples, offset)
      offset += s.samples.length
    }

    const wavBlob = encodeWav(merged, sampleRate)
    const durationMs = (totalSamples / sampleRate) * 1000

    return { wavBlob, durationMs, sampleRate }
  }

  /** Drop all retained audio (called on call end / cleanup). */
  clear(): void {
    this.snippets = []
  }

  private computeTotalDurationMs(): number {
    let total = 0
    for (const s of this.snippets) total += s.durationMs
    return total
  }

  /**
   * Duration of the freshest contiguous run of snippets that share the newest
   * snippet's sample rate. Used to decide whether a FreshSegment can be built.
   */
  private freshestContiguousDurationMs(): number {
    if (this.snippets.length === 0) return 0
    const sampleRate = this.snippets[this.snippets.length - 1].sampleRate
    let ms = 0
    for (let i = this.snippets.length - 1; i >= 0; i--) {
      const s = this.snippets[i]
      if (s.sampleRate !== sampleRate) break
      ms += s.durationMs
    }
    return ms
  }
}

/**
 * Decode a mono 16-bit PCM RIFF WAV blob into a `Snippet`.
 *
 * The caller-audio blobs produced by `encodeWav` (and by the enrollment
 * recorder) are mono, 16-bit PCM RIFF WAVs. This helper parses that format
 * back into `Float32Array` samples so decoded snippets can be pushed into the
 * RollingSnippetBuffer for later re-assembly. Values are normalised to
 * [-1, 1].
 *
 * @param blob A mono 16-bit PCM RIFF WAV blob.
 * @param capturedAt Optional capture timestamp (epoch ms); defaults to now.
 */
export async function decodeWavBlobToSnippet(
  blob: Blob,
  capturedAt: number = Date.now(),
): Promise<Snippet> {
  const buffer = await blob.arrayBuffer()
  return decodeWavArrayBufferToSnippet(buffer, capturedAt)
}

/**
 * Synchronous variant of {@link decodeWavBlobToSnippet} for callers that
 * already hold the decoded `ArrayBuffer`.
 */
export function decodeWavArrayBufferToSnippet(
  buffer: ArrayBuffer,
  capturedAt: number = Date.now(),
): Snippet {
  const view = new DataView(buffer)

  const readTag = (off: number): string =>
    String.fromCharCode(
      view.getUint8(off),
      view.getUint8(off + 1),
      view.getUint8(off + 2),
      view.getUint8(off + 3),
    )

  if (buffer.byteLength < 44 || readTag(0) !== 'RIFF' || readTag(8) !== 'WAVE') {
    throw new Error('decodeWavBlob: not a RIFF/WAVE blob')
  }

  // Walk chunks to locate `fmt ` and `data`, tolerating extra chunks.
  let sampleRate = 0
  let bitsPerSample = 16
  let dataOffset = -1
  let dataSize = 0

  let off = 12
  while (off + 8 <= buffer.byteLength) {
    const tag = readTag(off)
    const chunkSize = view.getUint32(off + 4, true)
    const body = off + 8
    if (tag === 'fmt ') {
      sampleRate = view.getUint32(body + 4, true)
      bitsPerSample = view.getUint16(body + 14, true)
    } else if (tag === 'data') {
      dataOffset = body
      dataSize = chunkSize
    }
    // Chunks are word-aligned (pad to even length).
    off = body + chunkSize + (chunkSize % 2)
  }

  if (dataOffset < 0 || sampleRate === 0) {
    throw new Error('decodeWavBlob: missing fmt/data chunk')
  }
  if (bitsPerSample !== 16) {
    throw new Error(`decodeWavBlob: unsupported bit depth ${bitsPerSample}`)
  }

  const available = Math.min(dataSize, buffer.byteLength - dataOffset)
  const numSamples = Math.floor(available / 2)
  const samples = new Float32Array(numSamples)
  for (let i = 0; i < numSamples; i++) {
    const int16 = view.getInt16(dataOffset + i * 2, true)
    samples[i] = int16 < 0 ? int16 / 0x8000 : int16 / 0x7fff
  }

  const durationMs = (numSamples / sampleRate) * 1000
  return { samples, sampleRate, durationMs, capturedAt }
}
