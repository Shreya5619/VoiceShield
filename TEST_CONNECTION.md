# Testing Transcribe Connection

## Quick Test (Recommended)

1. **Start dev server**
   ```bash
   npm run dev
   ```

2. **Add AWS credentials to `.env.local`**
   ```env
   VITE_AWS_ACCESS_KEY_ID=your-actual-access-key
   VITE_AWS_SECRET_ACCESS_KEY=your-actual-secret-key
   ```

3. **Click "🧪 Test Transcribe Connection" button**
   - Button appears below the "Start Recording" button
   - Green ✓ = Connection successful
   - Red ✗ = Connection failed (see error details)

## What the Test Does

The test verifies:
1. ✓ AWS credentials are configured (not placeholder values)
2. ✓ AWS Signature V4 presigned URL generates correctly
3. ✓ WebSocket connection to Transcribe succeeds
4. ✓ Shows connection time (should be <2 seconds)

## Expected Results

### ✓ Success (Green)
```
Transcribe connection successful! ✓
region: us-east-1
languageCode: en-US
credentialsValid: true
websocketConnected: true
connectionTime: 523
```

### ✗ Error - Invalid Credentials (Red)
```
AWS credentials are not configured
error: Using placeholder credentials. Update .env.local with real AWS credentials.
```

**Fix**: Replace placeholder values in `.env.local` with real AWS keys

### ✗ Error - WebSocket Failed (Red)
```
WebSocket connection failed
error: Connection error
errorCode: 1006
errorMessage: Connection closed unexpectedly
```

**Cause**: Could be:
- Invalid AWS region
- Credentials don't have Transcribe permissions
- Network/firewall blocking WebSocket

**Fix**: 
1. Verify region in `.env.local` is correct
2. Check AWS IAM permissions for Transcribe
3. Check firewall allows outbound WSS connections

### ✗ Error - Timeout (Red)
```
Connection test failed
error: Connection timeout
errorCode: 408
errorMessage: Did not connect within 10 seconds
```

**Cause**: Slow network or Transcribe not responding

**Fix**:
1. Check internet connection
2. Try different AWS region
3. Wait a moment and try again

## Console Output

Open browser Developer Tools (F12) and watch the console:

### Successful test shows:
```
🧪 Testing Transcribe connection...
✓ Credentials configured
🔐 Generating presigned URL...
✓ Presigned URL generated
🌐 Testing WebSocket connection...
✓ Connected in 523ms
✓ Sent test message
✓ WebSocket connected successfully
```

### Failed test shows errors:
```
❌ Connection test failed: [error details]
```

## Debugging Steps

If test fails:

1. **Check credentials in browser**
   ```javascript
   // In browser console (F12)
   localStorage.getItem('AWS_ACCESS_KEY_ID')
   localStorage.getItem('AWS_SECRET_ACCESS_KEY')
   ```
   Should show your real keys, not "mock-key"

2. **Check .env.local file**
   ```bash
   cat .env.local
   ```
   Should have real credentials, not placeholders

3. **Verify AWS account has Transcribe enabled**
   - Go to AWS Console
   - Search for Transcribe
   - Verify region matches `VITE_AWS_REGION`

4. **Check IAM permissions**
   ```json
   {
     "Effect": "Allow",
     "Action": ["transcribe:StartStreamTranscription"],
     "Resource": "*"
   }
   ```

5. **Test credentials with AWS CLI**
   ```bash
   aws transcribe describe-bucket --region us-east-1
   ```
   If this works, credentials are valid

## After Successful Test

If test shows ✓ Success:

1. Click **"Start Recording"**
2. Grant microphone permission when prompted
3. Speak clearly
4. You should see transcription appear in real-time

## Supported Regions for Transcribe

- us-east-1 (default)
- us-west-2
- eu-west-1
- eu-central-1
- ap-northeast-1
- ap-southeast-1
- ap-southeast-2

[Full list](https://docs.aws.amazon.com/transcribe/latest/dg/service-quotas.html)

## Common Issues & Fixes

| Issue | Cause | Fix |
|-------|-------|-----|
| "Using placeholder credentials" | .env.local not updated | Add real AWS keys to .env.local |
| "Connection closed unexpectedly" (1006) | Invalid region or permissions | Check region, verify IAM policy |
| "Did not connect within 10 seconds" (408) | Network timeout | Check internet, try different region |
| No error but no transcription | Audio format issue | Try speaking louder/clearer |
| "WebSocket is closed..." on recording | Signature invalid | Verify credentials haven't changed |

## Architecture

```
Test Flow:
┌─────────────────────────────────────────┐
│ Click "Test Transcribe Connection"      │
├─────────────────────────────────────────┤
│ 1. Check credentials (not mock)         │ ← Catches config errors
├─────────────────────────────────────────┤
│ 2. Generate presigned URL               │ ← Catches signature errors
│    (AWS Signature V4)                   │
├─────────────────────────────────────────┤
│ 3. Create WebSocket connection          │ ← Catches permission/network errors
├─────────────────────────────────────────┤
│ 4. Send test message                    │
├─────────────────────────────────────────┤
│ 5. Show result (Success/Error)          │
└─────────────────────────────────────────┘
```

## Performance Metrics

Healthy test shows:
- Connection time: 200-1000ms
- No errors in console
- WebSocket state: OPEN (1)
- Response format: Valid JSON

## Security

The test:
- ✓ Does NOT record audio
- ✓ Does NOT stream data
- ✓ Closes connection immediately after test
- ✓ Only tests connectivity, not functionality

It's safe to run multiple times without any side effects or charges.

---

**Need help?** Check browser console (F12) for detailed error messages and see "Debugging Steps" above.
