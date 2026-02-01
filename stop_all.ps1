# ============================================
# WatchTower - Stop All Services
# (Stops services running in VS Code)
# ============================================

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Stopping WatchTower...     " -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

$projectPath = Split-Path -Parent $MyInvocation.MyCommand.Path
$jobsFile = Join-Path $projectPath ".running_jobs.json"

# Stop background jobs if they exist
if (Test-Path $jobsFile) {
    $jobIds = Get-Content $jobsFile | ConvertFrom-Json
    
    Write-Host "Stopping background jobs..." -ForegroundColor Yellow
    
    if ($jobIds.Backend) {
        Stop-Job -Id $jobIds.Backend -ErrorAction SilentlyContinue
        Remove-Job -Id $jobIds.Backend -Force -ErrorAction SilentlyContinue
        Write-Host "  [OK] Backend job stopped" -ForegroundColor Green
    }
    
    if ($jobIds.Frontend) {
        Stop-Job -Id $jobIds.Frontend -ErrorAction SilentlyContinue
        Remove-Job -Id $jobIds.Frontend -Force -ErrorAction SilentlyContinue
        Write-Host "  [OK] Frontend job stopped" -ForegroundColor Green
    }
    
    Remove-Item $jobsFile -Force -ErrorAction SilentlyContinue
}

# Also kill any remaining processes
Write-Host ""
Write-Host "Cleaning up processes..." -ForegroundColor Yellow

$pythonProcs = Get-Process -Name python -ErrorAction SilentlyContinue
if ($pythonProcs) {
    $pythonProcs | Stop-Process -Force -ErrorAction SilentlyContinue
    Write-Host "  [OK] Python processes stopped" -ForegroundColor Green
} else {
    Write-Host "  [--] No Python processes found" -ForegroundColor Gray
}

$nodeProcs = Get-Process -Name node -ErrorAction SilentlyContinue
if ($nodeProcs) {
    $nodeProcs | Stop-Process -Force -ErrorAction SilentlyContinue
    Write-Host "  [OK] Node processes stopped" -ForegroundColor Green
} else {
    Write-Host "  [--] No Node processes found" -ForegroundColor Gray
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  All services stopped!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
