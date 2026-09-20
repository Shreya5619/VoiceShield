# VoiceShield - Start All Services
# This script starts the Node.js server (which includes Python backend) and the Vite dev server

Write-Host "========================================" -ForegroundColor Cyan
Write-Host " VoiceShield - Start All Services" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan

# Check if .env.local exists
if (-not (Test-Path ".env.local")) {
    Write-Host "Error: .env.local file not found" -ForegroundColor Red
    Write-Host "   Create .env.local with AWS credentials" -ForegroundColor Yellow
    Read-Host "Press Enter to exit"
    exit 1
}

Write-Host "Reading credentials from .env.local..." -ForegroundColor Yellow

# Read .env.local and extract credentials
$envContent = Get-Content ".env.local"
$accessKeyId = $null
$secretAccessKey = $null
$region = $null

foreach ($line in $envContent) {
    if ($line -match "^VITE_AWS_ACCESS_KEY_ID=(.+)$") {
        $accessKeyId = $matches[1].Trim('"')
    }
    elseif ($line -match "^VITE_AWS_SECRET_ACCESS_KEY=(.+)$") {
        $secretAccessKey = $matches[1].Trim('"')
    }
    elseif ($line -match "^VITE_AWS_REGION=(.+)$") {
        $region = $matches[1].Trim('"')
    }
}

if (-not $accessKeyId -or -not $secretAccessKey) {
    Write-Host "Error: AWS credentials not found in .env.local" -ForegroundColor Red
    Read-Host "Press Enter to exit"
    exit 1
}

$region = if ($region) { $region } else { "us-east-1" }

# Set environment variables for Node server
$env:AWS_ACCESS_KEY_ID = $accessKeyId
$env:AWS_SECRET_ACCESS_KEY = $secretAccessKey
$env:AWS_REGION = $region

Write-Host "AWS credentials loaded from .env.local" -ForegroundColor Green
Write-Host "AWS Region: $region" -ForegroundColor Green
Write-Host ""

Write-Host "Starting services..." -ForegroundColor Yellow
Write-Host ""

# Start Node.js server (which includes Python backend)
Write-Host "1. Starting Node.js Transcribe proxy server (port 3001)..." -ForegroundColor Cyan
Write-Host "   This also starts the Python scam detection backend (port 5000)" -ForegroundColor Gray
Write-Host ""
Write-Host "   (Keep this terminal open)" -ForegroundColor Yellow
Write-Host ""

$nodeProcess = Start-Process -FilePath "node" -ArgumentList "server.mjs" -NoNewWindow -PassThru

# Wait a bit for Node to start
Start-Sleep -Seconds 2

# Start Vite dev server
Write-Host "2. Starting Vite development server (port 5173)..." -ForegroundColor Cyan
Write-Host "   (Keep this terminal open)" -ForegroundColor Yellow
Write-Host ""

$viteProcess = Start-Process -FilePath "npm.cmd" -ArgumentList "run dev" -NoNewWindow -PassThru

# Wait a bit for Vite to start
Start-Sleep -Seconds 3

Write-Host "========================================" -ForegroundColor Green
Write-Host " All Services Started Successfully!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green

Write-Host "Open your browser: " -NoNewline -ForegroundColor Cyan
Write-Host "http://localhost:5173/" -ForegroundColor Green

Write-Host ""
Write-Host "Services:" -ForegroundColor Cyan
Write-Host "  Frontend:       http://localhost:5173/" -ForegroundColor White
Write-Host "  Transcribe:     ws://localhost:3001/" -ForegroundColor White
Write-Host "  Scam Detection: http://localhost:3001/api/predict-scam" -ForegroundColor White
Write-Host "  Health Check:   http://localhost:3001/health" -ForegroundColor White
Write-Host ""

Write-Host "Press Ctrl+C to stop all services..." -ForegroundColor Yellow
Write-Host ""

# Wait for processes to complete
$nodeProcess | Wait-Process
$viteProcess | Wait-Process

Write-Host ""
Write-Host "Services stopped." -ForegroundColor Yellow
