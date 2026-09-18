Write-Host "=== Node ==="
node -v

Write-Host "=== NPM ==="
npm -v

Write-Host "=== Clean install ==="
Remove-Item -Recurse -Force node_modules -ErrorAction SilentlyContinue

npm ci

Write-Host "=== Production build ==="
npm run build

if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ BUILD FAILED"
    exit 1
}

Write-Host "✅ BUILD PASSED"