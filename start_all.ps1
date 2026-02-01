# ============================================
# WatchTower - Start All Services
# (Runs in VS Code integrated terminals)
# ============================================

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Starting WatchTower...              " -ForegroundColor Cyan
Write-Host "  (In VS Code terminals)              " -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

$projectPath = Split-Path -Parent $MyInvocation.MyCommand.Path
$backendPath = Join-Path $projectPath "backend"
$frontendPath = Join-Path $projectPath "frontend"

Write-Host "Starting Backend and Frontend..." -ForegroundColor Yellow
Write-Host ""


# Start backend as a background job using uvicorn
Write-Host "[1/2] Starting Backend (FastAPI with uvicorn)..." -ForegroundColor Yellow
$backendJob = Start-Job -ScriptBlock {
    param($path)
    Set-Location $path
    uvicorn app:app --host 0.0.0.0 --port 8000 --reload
} -ArgumentList $backendPath
Write-Host "  Backend starting (Job ID: $($backendJob.Id))..." -ForegroundColor Gray

Start-Sleep -Seconds 3

# Start frontend as a background job
Write-Host "[2/2] Starting Frontend (Next.js)..." -ForegroundColor Yellow
$frontendJob = Start-Job -ScriptBlock {
    param($path)
    Set-Location $path
    npm run dev
} -ArgumentList $frontendPath
Write-Host "  Frontend starting (Job ID: $($frontendJob.Id))..." -ForegroundColor Gray

# Save job IDs to a file for later cleanup
$jobIds = @{
    Backend = $backendJob.Id
    Frontend = $frontendJob.Id
}
$jobIds | ConvertTo-Json | Out-File -FilePath (Join-Path $projectPath ".running_jobs.json") -Force

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Services Starting!" -ForegroundColor Green
Write-Host ""
Write-Host "  Backend Job ID:  $($backendJob.Id)" -ForegroundColor Gray
Write-Host "  Frontend Job ID: $($frontendJob.Id)" -ForegroundColor Gray
Write-Host ""
Write-Host "  Wait a few seconds, then open:" -ForegroundColor Gray
Write-Host "  http://localhost:3000" -ForegroundColor Cyan
Write-Host ""
Write-Host "  Checking backend and frontend status..." -ForegroundColor Yellow

# Check backend status
try {
    $backendResponse = Invoke-WebRequest -Uri "http://localhost:8000/status" -UseBasicParsing -TimeoutSec 5
    if ($backendResponse.StatusCode -eq 200) {
        Write-Host "  Backend is running!" -ForegroundColor Green
    } else {
        Write-Host "  Backend status check failed (status code: $($backendResponse.StatusCode))" -ForegroundColor Red
    }
} catch {
    Write-Host "  Backend is NOT running!" -ForegroundColor Red
}

# Check frontend status
try {
    $frontendResponse = Invoke-WebRequest -Uri "http://localhost:3000" -UseBasicParsing -TimeoutSec 5
    if ($frontendResponse.StatusCode -eq 200) {
        Write-Host "  Frontend is running!" -ForegroundColor Green
    } else {
        Write-Host "  Frontend status check failed (status code: $($frontendResponse.StatusCode))" -ForegroundColor Red
    }
} catch {
    Write-Host "  Frontend is NOT running!" -ForegroundColor Red
}

Write-Host ""
Write-Host "  Run .\check_status.ps1 to verify" -ForegroundColor Gray
Write-Host "  Run .\stop_all.ps1 to stop" -ForegroundColor Gray
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
