@echo off
echo ==========================================
echo   MUSE SOCIAL MEDIA - Amusement Inc.
echo   Sponsored by The Blue Whale Family
echo ==========================================
echo.
cd /d "%~dp0"
call npm install
echo.
echo Starting server...
node server.js
pause