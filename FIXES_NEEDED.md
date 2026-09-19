# Issues and Fixes

## 1. AWS Translate Permission Error ✅ CRITICAL

**Error:**
```
User: arn:aws:iam::736307751112:user/voxshield-transcribe-client is not authorized to perform: translate:TranslateText
```

**Root Cause:**
The IAM user `voxshield-transcribe-client` doesn't have permission to use AWS Translate service.

**Fix:**
Add the following policy to your IAM user in AWS Console:

1. Go to AWS IAM Console
2. Navigate to Users → `voxshield-transcribe-client`
3. Click "Add permissions" → "Attach policies directly"
4. Either add the managed policy `TranslateReadOnly` or create an inline policy:

```json
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Effect": "Allow",
            "Action": [
                "translate:TranslateText"
            ],
            "Resource": "*"
        }
    ]
}
```

**Alternative (if you don't want to use AWS Translate):**
You can disable translation by modifying the code to skip translation when the user doesn't have permission, or use a different translation service.

---

## 2. Missing Endpoint: /api/detect-deepfake (404)

**Error:**
```
INFO: 127.0.0.1:65296 - "POST /api/detect-deepfake HTTP/1.1" 404 Not Found
```

**Root Cause:**
The endpoint exists in the code but isn't being registered. Possible reasons:
- Server wasn't restarted after code changes
- Import error preventing route registration
- Model initialization failure causing route to not load

**Fix:**
1. Restart the backend server:
   ```powershell
   # Stop the current backend process
   # Then restart
   cd backend
   python backend.py
   ```

2. Check for any import errors or model loading issues in the console output

3. Verify the route is registered by checking startup logs for:
   ```
   ✓ Deepfake detection API: POST http://localhost:5001/api/detect-deepfake
   ```

---

## 3. Language Preference Endpoint (503 Service Unavailable)

**Error:**
```
"GET /api/language-preference?user_phone=%2B916366349594 HTTP/1.1" 503 Service Unavailable
```

**Root Cause:**
The endpoint is returning 503, which typically means:
- Database connection issue
- The endpoint is failing to connect to required service
- The endpoint handler is throwing an unhandled exception

**Recommended Action:**
Check the backend logs for the actual error when this endpoint is called. The 503 suggests the endpoint exists but is encountering a runtime error.

---

## Quick Test Commands

After applying fixes, test the endpoints:

```powershell
# Test language preference (should return 200, not 503)
curl "http://localhost:5001/api/language-preference?user_phone=%2B916366349594"

# Test deepfake detection (should return 200, not 404)
curl -X POST "http://localhost:5001/api/detect-deepfake" -F "audio=@test_audio.wav"
```
