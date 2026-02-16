# PDM Server Startup Script
# This script starts both Backend (Django) and Frontend (Vite) servers

$BackendPath = "d:\B2B\PDM\backend"
$FrontendPath = "d:\B2B\PDM\frontend"
$PythonExe = "D:\B2B\PDM\.venv\Scripts\python.exe"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Starting PDM Servers" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Check if servers are already running
$backendRunning = Get-Process python -ErrorAction SilentlyContinue | Where-Object { $_.Path -like "*B2B*PDM*.venv*" }
$frontendRunning = Get-Process node -ErrorAction SilentlyContinue

if ($backendRunning) {
    Write-Host "WARNING: Backend already running (PID: $($backendRunning.Id -join ', '))" -ForegroundColor Yellow
    $response = Read-Host "Restart? (y/N)"
    if ($response -eq 'y' -or $response -eq 'Y') {
        Write-Host "Stopping Backend..." -ForegroundColor Yellow
        $backendRunning | Stop-Process -Force
        Start-Sleep -Seconds 2
    }
    else {
        Write-Host "Skipping Backend startup" -ForegroundColor Yellow
        $skipBackend = $true
    }
}

if ($frontendRunning) {
    Write-Host "WARNING: Frontend already running (PID: $($frontendRunning.Id -join ', '))" -ForegroundColor Yellow
    $response = Read-Host "Restart? (y/N)"
    if ($response -eq 'y' -or $response -eq 'Y') {
        Write-Host "Stopping Frontend..." -ForegroundColor Yellow
        $frontendRunning | Stop-Process -Force
        Start-Sleep -Seconds 2
    }
    else {
        Write-Host "Skipping Frontend startup" -ForegroundColor Yellow
        $skipFrontend = $true
    }
}

# Start Backend
if (-not $skipBackend) {
    Write-Host "Starting Backend Server..." -ForegroundColor Green
    
    # Setup admin user
    Write-Host "  Setting up admin user..." -ForegroundColor Gray
    & "$PythonExe" "$BackendPath\setup_admin.py" | Out-Null
    
    Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$BackendPath'; Write-Host 'Backend Server Starting...' -ForegroundColor Cyan; & '$PythonExe' manage.py runserver 0.0.0.0:8000" -WindowStyle Normal
    Start-Sleep -Seconds 3
    
    # Verify Backend started
    try {
        $null = Invoke-WebRequest -Uri "http://localhost:8000/api/docs/" -UseBasicParsing -TimeoutSec 5 -ErrorAction Stop
        Write-Host "Backend started: http://localhost:8000" -ForegroundColor Green
    }
    catch {
        if ($_.Exception.Response.StatusCode.value__ -eq 401 -or $_.Exception.Message -match "404") {
            Write-Host "Backend started: http://localhost:8000" -ForegroundColor Green
        }
        else {
            Write-Host "Backend started but API not responding yet" -ForegroundColor Yellow
            Write-Host "   Check Backend window for errors" -ForegroundColor Yellow
        }
    }
}

# Start Frontend
if (-not $skipFrontend) {
    Write-Host "Starting Frontend Server..." -ForegroundColor Green
    Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$FrontendPath'; Write-Host 'Frontend Server Starting...' -ForegroundColor Cyan; npm run dev" -WindowStyle Normal
    Start-Sleep -Seconds 5
    
    # Verify Frontend started
    try {
        $null = Invoke-WebRequest -Uri "http://localhost:3000" -UseBasicParsing -TimeoutSec 5 -ErrorAction Stop
        Write-Host "Frontend started: http://localhost:3000" -ForegroundColor Green
    }
    catch {
        Write-Host "Frontend started but not responding yet" -ForegroundColor Yellow
        Write-Host "   Check Frontend window for errors" -ForegroundColor Yellow
    }
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  PDM Servers Started" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Backend:  http://localhost:8000" -ForegroundColor White
Write-Host "Frontend: http://localhost:3000" -ForegroundColor White
Write-Host "API Docs: http://localhost:8000/api/docs/" -ForegroundColor White
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Login credentials:" -ForegroundColor Yellow
Write-Host "  Username: admin" -ForegroundColor White
Write-Host "  Password: admin123" -ForegroundColor White
Write-Host ""
Write-Host "To stop servers use:" -ForegroundColor Yellow
Write-Host "  .\stop_servers.ps1" -ForegroundColor White
Write-Host ""
