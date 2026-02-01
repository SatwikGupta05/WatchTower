# ============================================
# Llama CCTV Operator - Status Check Script
# ============================================

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Llama CCTV Operator - Status Check  " -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

$allGood = $true

# Check Backend (FastAPI on port 8000)
Write-Host "[1/5] Checking Backend (FastAPI)..." -ForegroundColor Yellow
try {
    $backendResponse = Invoke-WebRequest -Uri "http://127.0.0.1:8000/status" -Method GET -TimeoutSec 5 -UseBasicParsing -ErrorAction Stop
    if ($backendResponse.StatusCode -eq 200) {
        Write-Host "  [OK] Backend is running on http://localhost:8000" -ForegroundColor Green
        $status = $backendResponse.Content | ConvertFrom-Json
        Write-Host "    - Service Active: $($status.service_active)" -ForegroundColor Gray
        Write-Host "    - Video Queue: $($status.queue_info.video_chunks_queue_size)" -ForegroundColor Gray
        Write-Host "    - Event Queue: $($status.queue_info.event_detection_queue_size)" -ForegroundColor Gray
    }
} catch {
    Write-Host "  [FAIL] Backend is NOT running!" -ForegroundColor Red
    Write-Host "    Run: cd backend; python app.py" -ForegroundColor Gray
    $allGood = $false
}

Write-Host ""

# Check Frontend (Next.js on port 3000)
Write-Host "[2/5] Checking Frontend (Next.js)..." -ForegroundColor Yellow
try {
    $frontendResponse = Invoke-WebRequest -Uri "http://127.0.0.1:3000" -Method GET -TimeoutSec 5 -UseBasicParsing -ErrorAction Stop
    if ($frontendResponse.StatusCode -eq 200) {
        Write-Host "  [OK] Frontend is running on http://localhost:3000" -ForegroundColor Green
    }
} catch {
    Write-Host "  [FAIL] Frontend is NOT running!" -ForegroundColor Red
    Write-Host "    Run: cd frontend; npm run dev" -ForegroundColor Gray
    $allGood = $false
}

Write-Host ""

# Check Environment Variables
Write-Host "[3/5] Checking Backend Environment..." -ForegroundColor Yellow
$envFile = ".\backend\.env"
if (Test-Path $envFile) {
    Write-Host "  [OK] .env file exists" -ForegroundColor Green
    $envContent = Get-Content $envFile -Raw
    
    if ($envContent -match "GEMINI_API_KEY=") {
        $lines = Get-Content $envFile
        foreach ($line in $lines) {
            if ($line -match "GEMINI_API_KEY=") {
                if ($line.Length -gt 20) {
                    Write-Host "  [OK] GEMINI_API_KEY is set" -ForegroundColor Green
                } else {
                    Write-Host "  [FAIL] GEMINI_API_KEY is empty!" -ForegroundColor Red
                    $allGood = $false
                }
                break
            }
        }
    } else {
        Write-Host "  [WARN] GEMINI_API_KEY not found in .env" -ForegroundColor Yellow
    }
    
    if ($envContent -match "DATABASE_URL=") {
        Write-Host "  [OK] DATABASE_URL is set" -ForegroundColor Green
    }
} else {
    Write-Host "  [FAIL] .env file not found!" -ForegroundColor Red
    Write-Host "    Run: Copy-Item backend\.env.example backend\.env" -ForegroundColor Gray
    $allGood = $false
}

Write-Host ""

# Check Sample Videos
Write-Host "[4/5] Checking Sample Videos..." -ForegroundColor Yellow
$videosDir = ".\backend\sample_videos"
if (Test-Path $videosDir) {
    $videos = Get-ChildItem -Path $videosDir -File | Where-Object { $_.Extension -match "\.(mp4|avi|mov|mkv|webm)$" }
    $videoCount = @($videos).Count
    if ($videoCount -gt 0) {
        Write-Host "  [OK] Found $videoCount video file(s):" -ForegroundColor Green
        foreach ($video in $videos) {
            $sizeMB = [math]::Round($video.Length / 1048576, 2)
            $videoInfo = "    - " + $video.Name + " (" + $sizeMB + " MB)"
            Write-Host $videoInfo -ForegroundColor Gray
        }
    } else {
        Write-Host "  [WARN] No sample videos found" -ForegroundColor Yellow
        Write-Host "    Add videos to backend\sample_videos\" -ForegroundColor Gray
    }
} else {
    Write-Host "  [WARN] sample_videos directory not found" -ForegroundColor Yellow
}

Write-Host ""

# Check API Endpoints
Write-Host "[5/5] Checking API Endpoints..." -ForegroundColor Yellow
try {
    $videosResponse = Invoke-WebRequest -Uri "http://127.0.0.1:8000/list-videos" -Method GET -TimeoutSec 5 -UseBasicParsing -ErrorAction Stop
    if ($videosResponse.StatusCode -eq 200) {
        Write-Host "  [OK] /list-videos endpoint working" -ForegroundColor Green
    }
    
    $eventsResponse = Invoke-WebRequest -Uri "http://localhost:8000/events" -Method GET -TimeoutSec 5 -UseBasicParsing -ErrorAction Stop
    if ($eventsResponse.StatusCode -eq 200) {
        Write-Host "  [OK] /events endpoint working" -ForegroundColor Green
        $eventsData = $eventsResponse.Content | ConvertFrom-Json
        $eventCount = @($eventsData.events).Count
        Write-Host "    - Events in database: $eventCount" -ForegroundColor Gray
    }
} catch {
    Write-Host "  [FAIL] API endpoints check failed (backend may be down)" -ForegroundColor Red
    $allGood = $false
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan

if ($allGood) {
    Write-Host "  ALL SYSTEMS OPERATIONAL!" -ForegroundColor Green
    Write-Host ""
    Write-Host "  Open http://localhost:3000 to start" -ForegroundColor Cyan
} else {
    Write-Host "  SOME ISSUES DETECTED!" -ForegroundColor Red
    Write-Host ""
    Write-Host "  Quick Start Commands:" -ForegroundColor Yellow
    Write-Host "  1. Start Backend (Terminal 1):" -ForegroundColor Gray
    Write-Host "     cd backend; python app.py" -ForegroundColor White
    Write-Host ""
    Write-Host "  2. Start Frontend (Terminal 2):" -ForegroundColor Gray
    Write-Host "     cd frontend; npm run dev" -ForegroundColor White
}

Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
