@echo off
REM Start Backend Django Server
echo Starting Backend Server...
start "PDM Backend" /D "d:\B2B\PDM\backend" cmd /k "D:\B2B\PDM\.venv\Scripts\python.exe manage.py runserver 0.0.0.0:8000"

REM Wait 3 seconds
timeout /t 3 /nobreak > nul

REM Start Frontend Vite Server
echo Starting Frontend Server...
start "PDM Frontend" /D "d:\B2B\PDM\frontend" cmd /k "npm run dev"

echo.
echo ========================================
echo  PDM Servers Started
echo ========================================
echo Backend:  http://localhost:8000
echo Frontend: http://localhost:3000
echo ========================================
echo.
echo Press any key to exit this window...
pause > nul
