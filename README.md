# VoiceShield

Real-time voice transcription with AI-powered scam detection using AWS Transcribe and machine learning.

## 📁 Project Structure

```
VoiceShield/
├── frontend/              React + Vite application
├── backend/               Node.js + Python backend
└── package.json          Root monorepo configuration
```

## 🚀 Quick Start

### Frontend (Transcribe Recording)
```bash
cd frontend
npm install
npm run dev
# Opens http://localhost:5173
```

### Backend (API + ML)
```bash
cd backend
npm install
pip install -r requirements.txt
node server.mjs
# Runs on http://localhost:5000
```

### Both (in separate terminals)
```bash
# Terminal 1
cd frontend && npm run dev

# Terminal 2
cd backend && node server.mjs
```

## ✨ Features

### ✅ Real-Time Transcription
- AWS Transcribe streaming
- Live transcript updates
- Audio processing (resampling, quantization)
- Web Audio API integration

### ✅ Scam Detection Ready
- joblib ML model included
- Python Flask API backend
- Node.js proxy server
- Ready for ML inference integration

### ✅ Secure Architecture
- AWS credentials server-side only
- Frontend isolated from secrets
- Monorepo organization
- Clean separation of concerns

## 🏗️ Architecture

```
┌─────────────────────────────────────┐
│  Frontend (React + Vite)            │
│  • useTranscription.ts              │
│  • Audio recording & transcription  │
│  • Real-time display                │
│  • Port: 5173                       │
└──────────────┬──────────────────────┘
               ↓
┌──────────────────────────────────────┐
│  Backend (Node.js + Python)          │
│  • server.mjs - Proxy + WebSocket   │
│  • backend.py - Flask API           │
│  • ML model - scam classifier       │
│  • Port: 5000 (Node), 5000 (Python) │
└──────────────────────────────────────┘
               ↓
         ┌─────────────┐
         │ AWS Services│
         ├─────────────┤
         │ Transcribe  │
         │ (Streaming) │
         └─────────────┘
```

## 📋 Key Files

| File | Purpose |
|------|---------|
| `frontend/src/hooks/useTranscription.ts` | AWS Transcribe streaming hook |
| `frontend/src/App.tsx` | Main React application |
| `backend/server.mjs` | Node.js proxy and API server |
| `backend/backend.py` | Python Flask API for ML |
| `backend/voiceguard_scam_model.joblib` | Pre-trained ML model |

## ⚙️ Configuration

### Frontend `.env.local`
```env
VITE_API_URL=http://localhost:5000
VITE_AWS_REGION=us-east-1
VITE_AWS_LANGUAGE=en-US
```

### Backend `.env` (create from .env.example)
```env
AWS_ACCESS_KEY_ID=your_key_here
AWS_SECRET_ACCESS_KEY=your_secret_here
AWS_REGION=us-east-1
```

## 📦 Dependencies

### Frontend
- React 18
- TypeScript
- Vite
- AWS SDK for JavaScript

### Backend
- Node.js 16+
- Python 3.8+
- Flask
- scikit-learn
- joblib

## 🧪 Testing

### Test Frontend Recording
1. Start frontend: `cd frontend && npm run dev`
2. Open http://localhost:5173
3. Click "🎤 Start Recording"
4. Grant microphone permission
5. Speak something
6. See transcription in real-time

### Test Backend
1. Start backend: `cd backend && node server.mjs`
2. Backend runs on http://localhost:5000
3. Python API runs on http://localhost:5000

## 📚 Documentation

| File | Description |
|------|-------------|
| `PROJECT_STRUCTURE.md` | Detailed architecture and file organization |
| `QUICK_REFERENCE.md` | Quick start commands and troubleshooting |
| `STARTUP_TEST.md` | Verification checklist |
| `REORGANIZATION_GUIDE.md` | Complete reorganization details |

## 🔐 Security

✅ **AWS credentials are server-side only**
- Not exposed in browser
- Not in frontend .env
- Protected server-side

✅ **Frontend is credential-safe**
- Only public configuration in frontend .env
- Cannot access AWS secrets
- Safe to bundle and deploy

## 🚀 Next Steps

### 1. Configure Backend
```bash
cd backend
cp .env.example .env
# Edit .env with your AWS credentials
```

### 2. Test Both Components
```bash
# Terminal 1
cd frontend && npm run dev

# Terminal 2
cd backend && node server.mjs
```

### 3. Add ML Integration
- Send finalized transcripts to `/api/predict-scam`
- Receive scam predictions
- Display results in UI

## 🆘 Troubleshooting

### Frontend won't start
```bash
cd frontend
rm -rf node_modules package-lock.json
npm install
npm run dev
```

### Backend won't start
```bash
cd backend
node server.mjs
```

### Python dependencies missing
```bash
cd backend
pip install -r requirements.txt
```

### Port already in use
```bash
# Windows: Kill process on port
netstat -ano | findstr :5000
taskkill /PID <PID> /F
```

## 📝 Scripts

### Root Level
```bash
npm run dev:frontend      # Run frontend only
npm run dev:backend       # Run backend only
npm run build            # Build frontend
npm run lint             # Lint frontend
```

### Frontend
```bash
cd frontend
npm run dev              # Development server
npm run build            # Production build
npm run preview          # Preview build
```

### Backend
```bash
cd backend
node server.mjs          # Start backend
```

## 🎯 Upcoming Features

- [ ] Real-time ML scam detection
- [ ] Risk assessment display
- [ ] Call recording storage
- [ ] Detailed scam indicator reporting
- [ ] Custom threat patterns
- [ ] Multi-language support

## 📄 License

Private project - VoiceShield

## 👥 Contributing

Team development - Frontend and Backend separation for clean collaboration

---

**Status:** ✅ Ready for ML inference integration  
**Last Updated:** 2026-09-18  
**Structure:** Monorepo with frontend/backend separation
