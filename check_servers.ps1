# PDM Server Status Check Script
# This script checks the status of Backend and Frontend servers

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  PDM Servers Status" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Check Backend processes
$pythonProcesses = Get-Process python -ErrorAction SilentlyContinue | Where-Object { $_.Path -like "*B2B*PDM*.venv*" }
if ($pythonProcesses) {
    Write-Host "Backend (Python) is running" -ForegroundColor Green
    $pythonProcesses | ForEach-Object {
        Write-Host "   PID: $($_.Id), Started: $($_.StartTime.ToString('HH:mm:ss'))" -ForegroundColor Gray
    }
    
    # Check if API is responding
    try {
        $response = Invoke-WebRequest -Uri "http://localhost:8000/api/v1/auth/me/" -UseBasicParsing -TimeoutSec 3 -ErrorAction Stop
        Write-Host "   API Status: $($response.StatusCode)" -ForegroundColor Green
    } catch {
        if ($_.Exception.Response -and $_.Exception.Response.StatusCode.value__ -eq 401) {
            Write-Host "   API Status: OK (requires auth)" -ForegroundColor Green
        } else {
            Write-Host "   API Status: Not responding" -ForegroundColor Yellow
        }
    }
} else {
    Write-Host "Backend is NOT running" -ForegroundColor Red
}

Write-Host ""

# Check Frontend processes
$nodeProcesses = Get-Process node -ErrorAction SilentlyContinue
if ($nodeProcesses) {
    Write-Host "Frontend (Node) is running" -ForegroundColor Green
    $nodeProcesses | ForEach-Object {
        Write-Host "   PID: $($_.Id), Started: $($_.StartTime.ToString('HH:mm:ss'))" -ForegroundColor Gray
    }
    
    # Check if frontend is responding
    try {
        $response = Invoke-WebRequest -Uri "http://localhost:3000" -UseBasicParsing -TimeoutSec 3 -ErrorAction Stop
        Write-Host "   Web Status: Available ($($response.StatusCode))" -ForegroundColor Green
    } catch {
        Write-Host "   Web Status: Not responding" -ForegroundColor Yellow
    }
} else {
    Write-Host "Frontend is NOT running" -ForegroundColor Red
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  URLs" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Backend:  http://localhost:8000" -ForegroundColor White
Write-Host "Frontend: http://localhost:3000" -ForegroundColor White
Write-Host "API Docs: http://localhost:8000/api/docs/" -ForegroundColor White
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
