# PDM Server Stop Script
# This script stops both Backend (Django) and Frontend (Vite) servers

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Stopping PDM Servers" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Stop Python processes (Backend)
$pythonProcesses = Get-Process python -ErrorAction SilentlyContinue | Where-Object { $_.Path -like "*B2B*PDM*.venv*" }
if ($pythonProcesses) {
    Write-Host "Stopping Backend (Python)..." -ForegroundColor Yellow
    $pythonProcesses | ForEach-Object {
        Write-Host "   Stopping PID: $($_.Id)" -ForegroundColor Gray
        Stop-Process -Id $_.Id -Force -ErrorAction SilentlyContinue
    }
    Write-Host "Backend stopped" -ForegroundColor Green
} else {
    Write-Host "Backend is not running" -ForegroundColor Gray
}

# Stop Node processes (Frontend)
$nodeProcesses = Get-Process node -ErrorAction SilentlyContinue
if ($nodeProcesses) {
    Write-Host "Stopping Frontend (Node)..." -ForegroundColor Yellow
    $nodeProcesses | ForEach-Object {
        Write-Host "   Stopping PID: $($_.Id)" -ForegroundColor Gray
        Stop-Process -Id $_.Id -Force -ErrorAction SilentlyContinue
    }
    Write-Host "Frontend stopped" -ForegroundColor Green
} else {
    Write-Host "Frontend is not running" -ForegroundColor Gray
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  All PDM Servers Stopped" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
