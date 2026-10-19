@echo off
cd /d "%~dp0"
start "Sinc API" cmd /k npm run dev:server
start "Sinc Mobile" cmd /k npm run dev:mobile
