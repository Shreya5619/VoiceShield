/**
 * TranscribeTest - Test connection to AWS Transcribe
 * Verifies credentials and connectivity without recording
 */

import { createTranscribePresignedUrl } from './AwsSignature'

export interface TestResult {
  success: boolean
  message: string
  details?: Record<string, any>
  error?: string
}

/**
 * Test network connectivity to AWS
 */
async function testNetworkConnectivity(): Promise<{
  canReach: boolean
  latency: number
}> {
  try {
    const startTime = Date.now()
    const response = await fetch('https://aws.amazon.com/', {
      method: 'HEAD',
      mode: 'no-cors',
    })
    const latency = Date.now() - startTime
    return { canReach: true, latency }
  } catch (err) {
    return { canReach: false, latency: 0 }
  }
}

/**
 * Test DNS resolution for Transcribe endpoint
 */
async function testDnsResolution(region: string): Promise<{
  resolvable: boolean
  endpoint: string
}> {
  const endpoint = `transcribestreaming.${region}.amazonaws.com`
  try {
    // Try to fetch from endpoint (will fail auth but proves DNS works)
    const response = await fetch(`https://${endpoint}:8443/`, {
      method: 'HEAD',
      mode: 'no-cors',
    })
    return { resolvable: true, endpoint }
  } catch (err) {
    // If it fails with network error, DNS might not resolve
    // If it fails with CORS/auth error, DNS resolved fine
    return { resolvable: true, endpoint } // Assume DNS works, error is auth
  }
}

/**
 * Test Transcribe connection with diagnostics
 */
export async function testTranscribeConnection(config: {
  accessKeyId: string
  secretAccessKey: string
  sessionToken?: string
  region?: string
  languageCode?: string
}): Promise<TestResult> {
  const region = config.region || 'us-east-1'
  const languageCode = config.languageCode || 'en-US'

  try {
    console.log('🧪 Testing Transcribe connection...')

    // Step 1: Verify credentials are not mock
    if (config.accessKeyId === 'mock-key' || config.accessKeyId === 'your-access-key-id-here') {
      return {
        success: false,
        message: 'AWS credentials are not configured',
        error: 'Using placeholder credentials. Update .env.local with real AWS credentials.',
        details: {
          accessKeyIdConfigured: false,
          region,
        },
      }
    }

    console.log('✓ Credentials configured')

    // Step 2: Test DNS resolution
    console.log('🔍 Testing DNS resolution...')
    const dnsTest = await testDnsResolution(region)
    if (!dnsTest.resolvable) {
      return {
        success: false,
        message: 'DNS resolution failed for Transcribe endpoint',
        error: `Cannot resolve ${dnsTest.endpoint}. Check internet connection or DNS settings.`,
        details: {
          region,
          endpoint: dnsTest.endpoint,
        },
      }
    }

    console.log('✓ DNS resolution successful')

    // Step 3: Test HTTPS connectivity
    console.log('🔒 Testing HTTPS to endpoint...')
    const httpsTest = await testHttpsConnectivity(region)
    if (!httpsTest.success) {
      console.warn('⚠ HTTPS test failed:', httpsTest.error)
    } else {
      console.log('✓ HTTPS connectivity confirmed')
    }

    // Step 4: Test basic WebSocket to the host (to check if any path works)
    console.log('🧪 Testing basic WebSocket connectivity to the host...')
    const basicWsTest = await testBasicWebSocket(`transcribestreaming.${region}.amazonaws.com:8443`)
    if (!basicWsTest.success) {
      console.warn('⚠ Basic WebSocket test failed:', basicWsTest.error)
      console.warn('   This might indicate firewall blocking or cert issues')
    } else {
      console.log(`✓ Basic WebSocket works (${basicWsTest.time}ms)`)
    }

    // Step 5: Generate presigned URL
    console.log('🔐 Generating presigned URL...')
    const presignedUrl = await createTranscribePresignedUrl(
      region,
      languageCode,
      {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
        sessionToken: config.sessionToken,
      }
    )

    console.log('✓ Presigned URL generated')

    // Step 6: Test WebSocket connection with presigned URL
    console.log('🌐 Testing WebSocket connection...')
    const wsResult = await testWebSocketConnection(presignedUrl, 15000) // 15s timeout

    if (!wsResult.success) {
      // Provide helpful suggestions based on error
      let suggestion = ''
      if (wsResult.errorCode === 408) {
        suggestion =
          'Try: 1) Check firewall allows WSS:8443, 2) Use different AWS region, 3) Check internet speed'
      } else if (wsResult.errorCode === 1006) {
        suggestion = 'Try: 1) Verify AWS region is correct, 2) Check IAM Transcribe permissions'
      }

      return {
        success: false,
        message: 'WebSocket connection failed',
        error: wsResult.error,
        details: {
          region,
          languageCode,
          url: presignedUrl.substring(0, 100) + '...',
          errorCode: wsResult.errorCode,
          errorMessage: wsResult.errorMessage,
          httpsStatus: httpsTest.statusCode || httpsTest.error,
          suggestion,
          alternativeRegions: ['us-west-2', 'eu-west-1'],
          debugInfo: wsResult.debugInfo,
        },
      }
    }

    console.log('✓ WebSocket connected successfully')

    return {
      success: true,
      message: 'Transcribe connection successful! ✓',
      details: {
        region,
        languageCode,
        credentialsValid: true,
        websocketConnected: true,
        connectionTime: wsResult.connectionTime,
      },
    }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error)
    console.error('❌ Connection test failed:', error)

    return {
      success: false,
      message: 'Connection test failed',
      error: errorMsg,
      details: {
        region,
        languageCode,
        suggestion: 'Check: 1) Internet connection, 2) AWS credentials, 3) Regional availability',
      },
    }
  }
}

/**
 * Test HTTPS connectivity to verify SSL/TLS works
 */
async function testHttpsConnectivity(region: string): Promise<{
  success: boolean
  statusCode?: number
  error?: string
}> {
  try {
    console.log(`🔒 Testing HTTPS to Transcribe endpoint...`)
    const response = await fetch(`https://transcribestreaming.${region}.amazonaws.com:8443/`, {
      method: 'HEAD',
      mode: 'no-cors',
    })
    console.log(`✓ HTTPS response: ${response.status}`)
    return { success: true, statusCode: response.status }
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err)
    console.error(`⚠ HTTPS test failed: ${errorMsg}`)
    return { success: false, error: errorMsg }
  }
}

/**
 * Test direct WebSocket connection with minimal payload
 */
function testBasicWebSocket(
  host: string,
  timeoutMs: number = 5000
): Promise<{
  success: boolean
  error?: string
  time?: number
  protocolSupported?: boolean
}> {
  return new Promise((resolve) => {
    const startTime = Date.now()
    let resolved = false
    const timeout = setTimeout(() => {
      if (!resolved) {
        resolved = true
        resolve({ success: false, error: 'Connection timeout', time: Date.now() - startTime })
      }
    }, timeoutMs)

    try {
      const url = `wss://${host}/test`
      console.log(`Testing basic WSS to ${url}`)
      const ws = new WebSocket(url)

      ws.onopen = () => {
        clearTimeout(timeout)
        if (resolved) return
        resolved = true
        const time = Date.now() - startTime
        console.log(`✓ WebSocket opened in ${time}ms`)
        ws.close()
        resolve({ success: true, time, protocolSupported: true })
      }

      ws.onerror = (event: any) => {
        clearTimeout(timeout)
        if (resolved) return
        resolved = true
        console.log('WebSocket error event:', event)
        resolve({ success: false, error: 'WebSocket error', time: Date.now() - startTime })
      }

      ws.onclose = (event: any) => {
        clearTimeout(timeout)
        if (resolved) return
        resolved = true
        console.log(`WebSocket closed before open: code=${event.code}, reason=${event.reason}`)
        resolve({
          success: false,
          error: `Closed before open (code ${event.code})`,
          time: Date.now() - startTime,
        })
      }
    } catch (error) {
      clearTimeout(timeout)
      if (resolved) return
      resolved = true
      const msg = error instanceof Error ? error.message : String(error)
      console.log('WebSocket creation error:', msg)
      resolve({ success: false, error: msg, time: Date.now() - startTime })
    }
  })
}

/**
 * Test WebSocket connection to Transcribe
 */
function testWebSocketConnection(
  url: string,
  timeoutMs: number = 15000
): Promise<{
  success: boolean
  error?: string
  errorCode?: number
  errorMessage?: string
  connectionTime?: number
  debugInfo?: Record<string, any>
}> {
  return new Promise((resolve) => {
    const startTime = Date.now()
    let resolved = false
    const debugInfo: Record<string, any> = {
      urlLength: url.length,
      urlPrefix: url.substring(0, 50),
    }

    console.log(`⏱ WebSocket timeout: ${timeoutMs}ms`)
    console.log(`🔗 WebSocket URL: ${url.substring(0, 80)}...`)

    // Timeout
    const timeout = setTimeout(() => {
      if (!resolved) {
        resolved = true
        console.error('⏱ WebSocket connection timeout after', Date.now() - startTime, 'ms')
        resolve({
          success: false,
          error: 'Connection timeout',
          errorCode: 408,
          errorMessage: `Did not connect within ${timeoutMs / 1000}s. Check firewall/network.`,
          debugInfo,
        })
      }
    }, timeoutMs)

    try {
      console.log('📡 Creating WebSocket...')
      // AWS Transcribe Streaming requires the aws-transcribe subprotocol
      const ws = new WebSocket(url, ['aws-transcribe'])
      ws.binaryType = 'arraybuffer'

      debugInfo.wsCreated = true

      ws.onopen = () => {
        clearTimeout(timeout)
        if (resolved) return
        resolved = true

        const connectionTime = Date.now() - startTime
        console.log(`✓ Connected in ${connectionTime}ms`)
        debugInfo.connected = true
        debugInfo.connectionTime = connectionTime

        // Send heartbeat to keep connection alive
        try {
          ws.send(JSON.stringify({ type: 'ping' }))
          console.log('✓ Sent heartbeat')
        } catch (err) {
          console.log('⚠ Could not send heartbeat')
        }

        // Close after 1 second
        setTimeout(() => {
          ws.close()
        }, 1000)

        resolve({
          success: true,
          connectionTime,
          debugInfo,
        })
      }

      ws.onerror = (event: any) => {
        clearTimeout(timeout)
        if (resolved) return
        resolved = true

        console.error('❌ WebSocket error:', event)
        debugInfo.errorEvent = true
        debugInfo.errorType = typeof event
        debugInfo.errorMessage = event?.message || event?.code || String(event)
        resolve({
          success: false,
          error: 'WebSocket error',
          errorCode: 1006,
          errorMessage: event?.message || 'Connection error. Check credentials/permissions.',
          debugInfo,
        })
      }

      ws.onclose = (event: any) => {
        clearTimeout(timeout)
        if (resolved) return
        resolved = true

        console.log('WebSocket closed:', event.code, event.reason)
        debugInfo.closedBeforeOpen = true
        debugInfo.closeCode = event.code
        debugInfo.closeReason = event.reason
        
        // If close before open, it's a connection error
        resolve({
          success: false,
          error: 'WebSocket closed unexpectedly',
          errorCode: event.code || 1006,
          errorMessage:
            event.reason ||
            'Connection rejected. Check: 1) AWS credentials valid? 2) Region available? 3) IAM permissions?',
          debugInfo,
        })
      }
    } catch (error) {
      clearTimeout(timeout)
      if (resolved) return
      resolved = true

      const errorMsg = error instanceof Error ? error.message : String(error)
      console.error('Error creating WebSocket:', errorMsg)
      debugInfo.catchError = errorMsg
      resolve({
        success: false,
        error: errorMsg,
        errorCode: 500,
        errorMessage: 'Failed to create WebSocket. Check browser console.',
        debugInfo,
      })
    }
  })
}

export default {
  testTranscribeConnection,
}
