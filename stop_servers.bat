@echo off
echo Stopping Backend Server (Python)...
taskkill /FI "WINDOWTITLE eq PDM Backend*" /T /F 2>nul
for /f "tokens=2" %%a in ('tasklist ^| findstr "python.exe"') do (
    taskkill /PID %%a /F 2>nul
)

echo Stopping Frontend Server (Node)...
taskkill /FI "WINDOWTITLE eq PDM Frontend*" /T /F 2>nul
for /f "tokens=2" %%a in ('tasklist ^| findstr "node.exe"') do (
    taskkill /PID %%a /F 2>nul
)

echo.
echo ========================================
echo  All PDM Servers Stopped
echo ========================================
echo.
pause
