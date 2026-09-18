# AWS Setup for VoiceShield Transcription

## Step 1: Get AWS Credentials

1. Go to [AWS Console](https://console.aws.amazon.com)
2. Click your **username** → **Security Credentials**
3. Under "Access keys" section, click **Create access key**
4. Select **Command Line Interface (CLI)** 
5. Copy the following:
   - **Access Key ID** (looks like: `AKIA...`)
   - **Secret Access Key** (long string)
   - **Session Token** (if using temporary credentials)

## Step 2: Add to `.env.local`

The file ``.env.local`` is already created in the project root.

Open it and replace the placeholder values:

```env
VITE_AWS_ACCESS_KEY_ID=your-access-key-id-here
VITE_AWS_SECRET_ACCESS_KEY=your-secret-access-key-here
VITE_AWS_SESSION_TOKEN=your-session-token-here

VITE_AWS_REGION=us-east-1
VITE_AWS_LANGUAGE=en-US
```

Example:
```env
VITE_AWS_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE
VITE_AWS_SECRET_ACCESS_KEY=wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY
VITE_AWS_SESSION_TOKEN=
VITE_AWS_REGION=us-east-1
VITE_AWS_LANGUAGE=en-US
```

## Step 3: Verify Credentials

Run in terminal:
```bash
aws s3 ls --profile default
```

If it lists S3 buckets, credentials are working ✓

## Step 4: Start Development Server

```bash
npm run dev
```

The app will open at `http://localhost:5173`

## Step 5: Test Transcription

1. Click **Start Recording**
2. Speak clearly into microphone
3. You should see:
   - ✓ Connected to Transcribe WebSocket
   - ✓ Audio capture started
   - 📝 Partial: [what you're saying]
   - ✓ Final: [complete sentence]

## Supported Languages

Change `VITE_AWS_LANGUAGE` to:
- `en-US` - English (US) **default**
- `en-GB` - English (UK)
- `es-ES` - Spanish
- `fr-FR` - French
- `de-DE` - German
- `pt-BR` - Portuguese (Brazil)
- `it-IT` - Italian
- `ja-JP` - Japanese
- `ko-KR` - Korean
- `zh-CN` - Chinese (Mandarin)
- [See full list](https://docs.aws.amazon.com/transcribe/latest/dg/supported-languages.html)

## Supported Regions

Change `VITE_AWS_REGION` to:
- `us-east-1` - US East (N. Virginia) **default**
- `us-west-2` - US West (Oregon)
- `eu-west-1` - EU (Ireland)
- `ap-southeast-1` - Asia Pacific (Singapore)
- [See full list](https://docs.aws.amazon.com/transcribe/latest/dg/service-quotas.html)

## Troubleshooting

### "WebSocket is closed before the connection is established"
**Cause**: Invalid AWS credentials or signature
**Solution**: 
- Check credentials in `.env.local`
- Verify they match AWS console
- Check no typos

### "mock-key" warning in console
**Cause**: `.env.local` still has placeholder values
**Solution**: Replace with real AWS credentials

### "Permission denied" or "UnauthorizedOperation"
**Cause**: AWS IAM permissions issue
**Solution**: 
- Ensure IAM user has Transcribe permissions
- Add policy:
  ```json
  {
    "Effect": "Allow",
    "Action": ["transcribe:StartStreamTranscription"],
    "Resource": "*"
  }
  ```

### No microphone access
**Cause**: Browser permission denied
**Solution**:
- Chrome: Settings → Privacy → Microphone → Allow site
- Firefox: Allow when prompted
- Safari: System Preferences → Security & Privacy → Microphone

### Transcription not appearing
**Cause**: Audio format or WebSocket issue
**Solution**:
1. Check console for errors (F12)
2. Verify microphone is working (check system volume)
3. Try speaking more clearly
4. Check if connected (green status badge)
5. Try different language/region

## Security Notes

⚠️ **DO NOT commit `.env.local` to Git** - it contains secret credentials

The `.gitignore` already excludes it, but double-check:
```bash
git status
# Should NOT show .env.local
```

For production, use one of:
1. **AWS Cognito** - temporary credentials
2. **Lambda function** - backend generates presigned URLs
3. **Backend API** - signs requests server-side

## Cost Considerations

AWS Transcribe pricing (as of 2024):
- $0.0001 per second of audio
- ~$6 per hour of continuous transcription
- Free tier: 60 minutes/month

Monitor usage:
1. AWS Console → Transcribe → Dashboards
2. CloudWatch → Cost Management

## Performance Tips

- Speak clearly and at normal pace
- Minimize background noise
- Use quality microphone for best results
- Latency: 200-400ms is normal
- Check internet connection speed (>1Mbps recommended)

## Next Steps

Once transcription is working:

1. **Save Transcriptions**
   - Add database integration (DynamoDB, Firebase)
   - Export to CSV/PDF

2. **Custom Vocabulary**
   - AWS Transcribe custom vocabulary
   - Domain-specific terms

3. **Production Deployment**
   - CloudFront CDN
   - Backend presigned URL service
   - Monitoring & logging

## Support

For AWS Transcribe issues:
- [AWS Documentation](https://docs.aws.amazon.com/transcribe/)
- [AWS Support Center](https://console.aws.amazon.com/support/)

For VoiceShield issues:
- Check browser console (F12)
- Review `TRANSCRIBE_SETUP.md`
- Verify AWS credentials

---

**Ready to transcribe! 🎙️**
