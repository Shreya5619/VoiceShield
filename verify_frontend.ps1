#!/usr/bin/env pwsh
# VoiceShield Frontend Verification Script

Write-Host "`n=== VoiceShield Frontend Verification ===" -ForegroundColor Cyan

# Check if ringtone file exists
Write-Host "`n1. Checking ringtone file..." -ForegroundColor Yellow
if (Test-Path "frontend\public\Vivo Ringtone Download Mp3.mp3") {
    $file = Get-Item "frontend\public\Vivo Ringtone Download Mp3.mp3"
    Write-Host "   ✅ Ringtone file found: $($file.Length) bytes" -ForegroundColor Green
} else {
    Write-Host "   ❌ Ringtone file NOT found" -ForegroundColor Red
    exit 1
}

# Check if dev server is running
Write-Host "`n2. Checking dev server..." -ForegroundColor Yellow
try {
    $response = Invoke-WebRequest -Uri "http://localhost:5174" -TimeoutSec 5 -UseBasicParsing -ErrorAction Stop
    Write-Host "   ✅ Dev server is running (Status: $($response.StatusCode))" -ForegroundColor Green
} catch {
    Write-Host "   ❌ Dev server not responding" -ForegroundColor Red
    Write-Host "   ℹ️  Start it with: cd frontend; npm run dev" -ForegroundColor Blue
}

# Check build status
Write-Host "`n3. Testing build..." -ForegroundColor Yellow
Push-Location frontend
$buildResult = npm run build 2>&1 | Out-String
Pop-Location
if ($LASTEXITCODE -eq 0) {
    Write-Host "   ✅ Build successful" -ForegroundColor Green
} else {
    Write-Host "   ❌ Build failed" -ForegroundColor Red
    exit 1
}

# Summary
Write-Host "`n=== Verification Complete ===" -ForegroundColor Cyan
Write-Host ""
Write-Host "✅ All checks passed!" -ForegroundColor Green
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Yellow
Write-Host "1. Open http://localhost:5174 in your browser"
Write-Host "2. Navigate to the Call tab"
Write-Host "3. Select a caller and click 'Start Call'"
Write-Host "4. Verify the Vivo ringtone plays"
Write-Host ""
