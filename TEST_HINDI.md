# Testing Hindi Language Support

## Step 1: Restart AgentCore
The agent.py file has been updated. You need to restart AgentCore:

```powershell
# Stop AgentCore (Ctrl+C if running in terminal)
# Or find and kill the process

# Start AgentCore again
cd agentcore
python agent.py
```

## Step 2: Run the Test Script

```powershell
cd agentcore
python test_hindi.py
```

### Expected Output:
If Hindi is working, you should see:
```
✅ HINDI DETECTED in response!
```

The summary and questions should contain Devanagari script like:
```
यह कॉल संदिग्ध है...
```

If you see:
```
❌ NO HINDI DETECTED - Response is in English
```

Then the model is not following the Hindi instruction.

## Step 3: Check Logs

### Backend logs should show:
```
🌐 User preferred language: hi
🌐 Sending request to AgentCore at http://localhost:8080/invocations
```

### AgentCore logs should show:
```
INFO:__main__:Invoking agent with language: hi
INFO:__main__:System message: You are a helpful assistant. You MUST respond in Hindi...
```

## Step 4: Alternative - Try Claude Model

If Nova Lite doesn't support Hindi well, try switching to Claude Sonnet:

Edit `agentcore/.env`:
```
BEDROCK_MODEL_ID=anthropic.claude-3-5-sonnet-20241022-v2:0
```

Then restart AgentCore and test again.

Claude has better multilingual support including Hindi.

## Step 5: Test in Full App

1. Open the app
2. Go to Call tab
3. Select "Hindi (हिंदी)" from the language dropdown
4. Start a test call
5. Speak a scam phrase to trigger 75%+ probability
6. Check if the alert message appears in Hindi

## Troubleshooting

### If Hindi still doesn't work:

1. **Check browser console** (F12) for:
   ```
   🌐 ActiveCallScreen language preference: hi
   🌐 Sent analyze-scam request with user_language: hi
   ```

2. **Check backend terminal** for:
   ```
   🌐 User preferred language: hi
   ```

3. **Check AgentCore terminal** for the system message

4. **Test the API directly**:
   ```powershell
   curl -X POST http://localhost:8080/invocations `
     -H "Content-Type: application/json" `
     -d '{\"transcript\":\"test\",\"prediction\":{\"is_scam\":true,\"scam_probability\":0.85,\"safe_probability\":0.15,\"confidence_level\":\"HIGH\",\"triggers_detected\":[]},\"user_language\":\"hi\"}'
   ```

## Model Compatibility

**Best models for Hindi:**
1. `anthropic.claude-3-5-sonnet-20241022-v2:0` ✅ Excellent
2. `anthropic.claude-3-haiku-20240307-v1:0` ✅ Good
3. `amazon.nova-pro-v1:0` ✅ Good
4. `amazon.nova-lite-v1:0` ⚠️ Limited (current)

**To change model:**
1. Edit `agentcore/.env`
2. Change `BEDROCK_MODEL_ID`
3. Restart AgentCore
4. Test again
