/**
 * AWS Signature Version 4 Signing for Transcribe Streaming WebSocket
 * Follows AWS official documentation exactly
 */

export interface AWSCredentials {
  accessKeyId: string
  secretAccessKey: string
  sessionToken?: string
}

/**
 * SHA256 hash using SubtleCrypto
 */
async function sha256(message: string): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(message)
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('')
}

/**
 * HMAC-SHA256 using SubtleCrypto (returns hex string)
 */
async function hmacSha256Hex(keyBuffer: ArrayBuffer, message: string): Promise<string> {
  const messageBuffer = new TextEncoder().encode(message)
  const cryptoKey = await crypto.subtle.importKey('raw', keyBuffer, { name: 'HMAC', hash: 'SHA-256' }, false, [
    'sign',
  ])
  const signatureBuffer = await crypto.subtle.sign('HMAC', cryptoKey, messageBuffer)
  const hashArray = Array.from(new Uint8Array(signatureBuffer))
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('')
}

/**
 * HMAC-SHA256 using SubtleCrypto (returns ArrayBuffer for chaining)
 */
async function hmacSha256Buffer(keyBuffer: any, message: string): Promise<ArrayBuffer> {
  const messageBuffer = new TextEncoder().encode(message)
  const cryptoKey = await crypto.subtle.importKey('raw', keyBuffer, { name: 'HMAC', hash: 'SHA-256' }, false, [
    'sign',
  ])
  return crypto.subtle.sign('HMAC', cryptoKey, messageBuffer)
}

/**
 * URI encode strictly (following AWS spec)
 */
function uriEncode(str: string): string {
  return encodeURIComponent(str).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`)
}

/**
 * Generate AWS Signature Version 4 for Transcribe WebSocket
 * Following official AWS documentation exactly
 */
export async function createTranscribePresignedUrl(
  region: string,
  languageCode: string,
  credentials: AWSCredentials,
  expiresIn: number = 300
): Promise<string> {
  const service = 'transcribe'
  const host = `transcribestreaming.${region}.amazonaws.com:8443`
  const endpoint = `wss://${host}`
  const method = 'GET'
  const canonicalUri = '/stream-transcription-websocket'

  // Step 1: Create timestamp
  const now = new Date()
  const amzDate = now.toISOString().replace(/[:-]/g, '').split('.')[0] // YYYYMMDDTHHmmssZ
  const dateStamp = amzDate.substring(0, 8) // YYYYMMDD

  // Step 2: Create credential scope
  const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`

  // Step 3: Build canonical query string (SORTED)
  const canonicalQueryParams: Record<string, string> = {
    'X-Amz-Algorithm': 'AWS4-HMAC-SHA256',
    'X-Amz-Credential': `${credentials.accessKeyId}/${credentialScope}`,
    'X-Amz-Date': amzDate,
    'X-Amz-Expires': expiresIn.toString(),
    'X-Amz-SignedHeaders': 'host',
    'language-code': languageCode,
    'media-encoding': 'pcm',
    'sample-rate': '16000',
  }

  // Add session token if present
  if (credentials.sessionToken) {
    canonicalQueryParams['X-Amz-Security-Token'] = credentials.sessionToken
  }

  // Sort by key name
  const sortedKeys = Object.keys(canonicalQueryParams).sort()
  const canonicalQueryString = sortedKeys
    .map((key) => `${uriEncode(key)}=${uriEncode(canonicalQueryParams[key])}`)
    .join('&')

  // Step 4: Create canonical headers (MUST end with newline)
  const canonicalHeaders = `host:${host}\n`
  const signedHeaders = 'host'

  // Step 5: Create payload hash (empty for GET)
  const payloadHash = await sha256('')

  // Step 6: Create canonical request
  const canonicalRequest = [method, canonicalUri, canonicalQueryString, canonicalHeaders, signedHeaders, payloadHash].join(
    '\n'
  )

  console.log('📋 Canonical Request:')
  console.log(canonicalRequest)
  console.log('---')

  // Step 7: Hash canonical request
  const canonicalRequestHash = await sha256(canonicalRequest)

  // Step 8: Create string to sign
  const stringToSign = ['AWS4-HMAC-SHA256', amzDate, credentialScope, canonicalRequestHash].join('\n')

  console.log('📝 String to Sign:')
  console.log(stringToSign)
  console.log('---')

  // Step 9: Calculate signature using derived key
  // kSecret = "AWS4" + secret_key
  const kSecret = `AWS4${credentials.secretAccessKey}`
  const kSecretBuffer = new TextEncoder().encode(kSecret)

  // kDate = HMAC("AWS4" + SecretAccessKey, Date)
  const kDateBuffer = await hmacSha256Buffer(kSecretBuffer, dateStamp)

  // kRegion = HMAC(kDate, "us-west-2")
  const kRegionBuffer = await hmacSha256Buffer(kDateBuffer, region)

  // kService = HMAC(kRegion, "transcribe")
  const kServiceBuffer = await hmacSha256Buffer(kRegionBuffer, service)

  // kSigning = HMAC(kService, "aws4_request")
  const kSigningBuffer = await hmacSha256Buffer(kServiceBuffer, 'aws4_request')

  // Signature = HMAC(kSigning, StringToSign)
  const signature = await hmacSha256Hex(kSigningBuffer, stringToSign)

  console.log('🔐 Signature:', signature)

  // Step 10: Build final presigned URL
  const presignedUrl = `${endpoint}${canonicalUri}?${canonicalQueryString}&X-Amz-Signature=${uriEncode(signature)}`

  return presignedUrl
}

export default {
  createTranscribePresignedUrl,
}
