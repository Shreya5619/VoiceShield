# VoiceShield Transcribe Connection Diagnostics

## Connection Timeout (408) - How to Fix

The error means the WebSocket can't reach `transcribestreaming.us-east-1.amazonaws.com:8443`

### Quick Checklist

- [ ] **Verify AWS credentials are real** (not placeholder)
  ```bash
  # Run in terminal
  aws sts get-caller-identity
  ```
  Should show your AWS account ID, User ARN

- [ ] **Verify Transcribe is available in your region**
  ```bash
  aws transcribe list-transcription-jobs --region us-east-1
  ```
  Should NOT show error (command works = Transcribe available)

- [ ] **Check IAM permissions**
  Go to AWS Console → IAM → Users → Your User → Permissions
  Should have: `transcribe:StartStreamTranscription`

- [ ] **Test network connectivity**
  ```bash
  # Can you reach AWS?
  curl -I https://aws.amazon.com
  # Should return 200 OK
  
  # Can you reach Transcribe endpoint?
  curl -I https://transcribestreaming.us-east-1.amazonaws.com:8443
  # Should NOT timeout (might fail with auth error, but that's OK)
  ```

- [ ] **Check firewall/corporate network**
  - WSS (WebSocket Secure) port 8443 must be open
  - Not blocked by corporate proxy/firewall
  - If on corporate VPN, check if outbound 8443 is allowed

## Step-by-Step Troubleshooting

### Step 1: Verify Credentials Work

```bash
# Replace with your actual keys
export AWS_ACCESS_KEY_ID="your-key-id"
export AWS_SECRET_ACCESS_KEY="your-secret-key"
export AWS_REGION="us-east-1"

# Test credentials
aws sts get-caller-identity
```

**Expected output:**
```
{
    "UserId": "AIDAQ...",
    "Account": "123456789012",
    "Arn": "arn:aws:iam::123456789012:user/your-name"
}
```

**If error:**
- Credentials are wrong or don't have permissions
- Check `.env.local` has real values

### Step 2: Verify Transcribe Service Access

```bash
aws transcribe describe-language-model --language-model-name en-US --region us-east-1
```

**Expected:** Returns language model details or "not found" (both OK)

**If error "Unauthorized":**
- User doesn't have Transcribe permissions
- Add IAM policy:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "transcribe:StartStreamTranscription",
        "transcribe:StartStreamTranscriptionWebSocket"
      ],
      "Resource": "*"
    }
  ]
}
```

### Step 3: Check Network/Firewall

**Windows:**
```powershell
# Test if port 8443 is reachable
Test-NetConnection -ComputerName transcribestreaming.us-east-1.amazonaws.com -Port 8443
```

**Mac/Linux:**
```bash
# Test if port 8443 is reachable
nc -zv transcribestreaming.us-east-1.amazonaws.com 8443
```

**Expected:** Connection successful (or refused, but connects)

**If timeout:** Firewall is blocking port 8443

### Step 4: Try Different AWS Region

Some regions might be blocked or have issues. Try:

```bash
# Update .env.local with different region
VITE_AWS_REGION=us-west-2
# or
VITE_AWS_REGION=eu-west-1
```

Then test again.

### Step 5: Check Transcribe Service Status

1. Go to [AWS Service Health Dashboard](https://phd.aws.amazon.com/)
2. Search for "Transcribe" in your region
3. Check if any incidents reported

## Solutions by Error Type

### "Connection timeout (408)"

**Cause:** Can't reach endpoint

**Solutions:**
1. Check firewall allows port 8443
2. Check credentials are valid
3. Try different AWS region
4. Check internet connection (run speedtest)
5. Disable VPN/proxy temporarily

### "Connection closed unexpectedly (1006)"

**Cause:** Connected but rejected

**Solutions:**
1. Verify AWS region is correct
2. Check IAM Transcribe permissions
3. Verify credentials haven't expired
4. Try `us-east-1` region

### "Credentials not configured"

**Cause:** `.env.local` has placeholder values

**Solution:**
Update `.env.local`:
```env
VITE_AWS_ACCESS_KEY_ID=AKIA... (real key)
VITE_AWS_SECRET_ACCESS_KEY=... (real secret)
```

## Network Diagnostics

### Check if AWS is reachable

```bash
# Basic connectivity
ping -c 1 aws.amazon.com

# DNS resolution
nslookup transcribestreaming.us-east-1.amazonaws.com

# HTTP connectivity  
curl -I https://transcribestreaming.us-east-1.amazonaws.com

# HTTPS port 443 (usually works)
curl -I https://transcribestreaming.us-east-1.amazonaws.com:443

# WSS port 8443 (what Transcribe uses)
# Can't test with curl, but:
# If HTTP works but WSS doesn't, likely firewall blocking 8443
```

## Corporate Network

If on corporate network:

1. **Check proxy settings**
   - Browser might have proxy configured
   - WebSocket may not work through proxy
   - Try: disable VPN, connect to personal hotspot

2. **Check firewall rules**
   - Contact IT: "Need outbound WSS (8443) to *.amazonaws.com"
   - May need to whitelist `transcribestreaming.*.amazonaws.com`

3. **Try different network**
   - Test on mobile hotspot
   - Test on home WiFi
   - If works elsewhere, it's network issue

## Region Availability

Transcribe Streaming is available in:
- `us-east-1` ✓
- `us-west-2` ✓
- `eu-west-1` ✓
- `eu-central-1` ✓
- `ap-northeast-1` ✓
- `ap-southeast-1` ✓
- `ap-southeast-2` ✓

[Full list](https://docs.aws.amazon.com/transcribe/latest/dg/service-quotas.html)

## IAM Permissions Needed

Minimum permissions for Transcribe Streaming:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "transcribe:StartStreamTranscription",
        "transcribe:StartStreamTranscriptionWebSocket"
      ],
      "Resource": "*"
    }
  ]
}
```

## Debug Mode

To see detailed connection attempts, open browser DevTools (F12):

**Console shows:**
```
🧪 Testing Transcribe connection...
✓ Credentials configured
🌐 Testing network connectivity...
🔍 Testing DNS resolution...
✓ DNS resolution successful
🔐 Generating presigned URL...
✓ Presigned URL generated
🌐 Testing WebSocket connection...
⏱ WebSocket timeout: 15000ms
❌ WebSocket error: Connection timeout
```

Each step shows where it fails:
- If fails at "Credentials configured" → update .env.local
- If fails at "DNS resolution" → network/DNS issue
- If fails at "WebSocket connection" → firewall blocking 8443
- If fails at "Presigned URL" → invalid credentials

## Getting Help

If still not working:

1. **Share in browser console (F12):**
   - Full test output (copy from console)
   - Your region (`VITE_AWS_REGION`)
   - Approximate network type (home, office, mobile)

2. **Check AWS Credentials once more:**
   ```bash
   aws configure list
   ```
   Should show your Access Key, Secret Key, Region

3. **Test with official AWS CLI:**
   ```bash
   # Minimal test
   aws transcribe describe-language-model \
     --language-model-name en-US \
     --region us-east-1
   ```
   If this works, credentials are fine

## Quick Fixes

**Try these in order:**

1. Copy `.env.local` into browser localStorage:
   ```javascript
   // F12 Console
   localStorage.setItem('AWS_ACCESS_KEY_ID', 'your-key')
   localStorage.setItem('AWS_SECRET_ACCESS_KEY', 'your-secret')
   localStorage.setItem('AWS_REGION', 'us-east-1')
   ```

2. Reload page, test again

3. Try different region (us-west-2 instead of us-east-1)

4. Disable VPN/proxy, test again

5. Try from mobile hotspot to rule out firewall

## Still Not Working?

Check:
- [ ] AWS credentials are real (run `aws sts get-caller-identity`)
- [ ] User has Transcribe permissions (check IAM policy)
- [ ] Region is available (Transcribe Streaming in that region)
- [ ] Network allows WSS:8443 (test with `curl -I https://endpoint:8443`)
- [ ] `.env.local` has real values (not placeholders)
- [ ] Reloaded page after updating `.env.local`

---

**No WebSocket API needed.** The app connects directly to the managed Transcribe Streaming service.
