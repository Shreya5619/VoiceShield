/**
 * AWS EventStream Encoder/Decoder for Transcribe Streaming
 * Implements AWS Event Stream format (binary protocol)
 * 
 * Format:
 * - 4 bytes: total message length (big-endian)
 * - 4 bytes: header length (big-endian)
 * - header bytes: MessagePack encoded headers
 * - payload bytes: audio data
 * - 4 bytes: CRC32 of message (big-endian)
 */

// CRC32 table for polynomial 0x1EDC6F41
const CRC32_TABLE = new Uint32Array(256)
initCrc32Table()

function initCrc32Table(): void {
  for (let i = 0; i < 256; i++) {
    let c = i
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    }
    CRC32_TABLE[i] = c
  }
}

function crc32(data: Uint8Array): number {
  let crc = 0xffffffff
  for (let i = 0; i < data.length; i++) {
    crc = CRC32_TABLE[(crc ^ data[i]) & 0xff] ^ (crc >>> 8)
  }
  return (crc ^ 0xffffffff) >>> 0
}

/**
 * Encode audio event for AWS Transcribe EventStream
 */
export function encodeAudioEvent(audioData: Uint8Array): Uint8Array {
  // Build headers map
  const headers = {
    ':message-type': 'event',
    ':event-type': 'AudioEvent',
    ':content-type': 'application/octet-stream',
  }

  // Encode headers as simple format
  const headerBytes = encodeHeaders(headers)
  const headerLength = headerBytes.length

  // Calculate total message length
  // 4 (length) + 4 (header length) + headers + payload + 4 (crc)
  const totalLength = 4 + 4 + headerLength + audioData.length + 4

  // Build message
  const message = new Uint8Array(totalLength)
  const view = new DataView(message.buffer)
  let offset = 0

  // Total message length (excluding this 4-byte field)
  view.setUint32(offset, totalLength - 4, false) // big-endian
  offset += 4

  // Header length
  view.setUint32(offset, headerLength, false) // big-endian
  offset += 4

  // Headers
  message.set(headerBytes, offset)
  offset += headerLength

  // Payload (audio data)
  message.set(audioData, offset)
  offset += audioData.length

  // CRC32 of entire message (excluding the CRC field itself)
  const messageCrc = crc32(new Uint8Array(message.buffer, 0, offset))
  view.setUint32(offset, messageCrc, false) // big-endian

  return message
}

/**
 * Simple header encoding (not full MessagePack, but compatible)
 */
function encodeHeaders(headers: Record<string, string>): Uint8Array {
  const parts: Uint8Array[] = []

  for (const [key, value] of Object.entries(headers)) {
    // String type (0xb8 for string < 32 bytes)
    const keyBytes = new TextEncoder().encode(key)
    const valueBytes = new TextEncoder().encode(value)

    // Key: length prefix + data
    const keyPart = new Uint8Array(1 + keyBytes.length)
    keyPart[0] = keyBytes.length
    keyPart.set(keyBytes, 1)
    parts.push(keyPart)

    // Value: type (string=7) + length + data
    const valuePart = new Uint8Array(1 + valueBytes.length)
    valuePart[0] = 7 // String type in Transcribe headers
    valuePart.set(valueBytes, 1)
    parts.push(valuePart)
  }

  // Concatenate all parts
  const totalLength = parts.reduce((sum, p) => sum + p.length, 0)
  const result = new Uint8Array(totalLength)
  let offset = 0

  for (const part of parts) {
    result.set(part, offset)
    offset += part.length
  }

  return result
}

/**
 * Decode Transcribe response (EventStream format)
 */
export function decodeTranscribeResponse(data: Uint8Array): any {
  try {
    // Skip EventStream header and decode the payload as JSON
    // Response format: [header bytes][json payload][crc]
    // Try to find JSON in the response
    const text = new TextDecoder().decode(data)

    // Extract JSON (usually starts after binary headers)
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0])
    }

    // Fallback: try to parse entire response
    return JSON.parse(text)
  } catch (error) {
    console.error('Error decoding Transcribe response:', error)
    return null
  }
}

export default {
  encodeAudioEvent,
  decodeTranscribeResponse,
}
