@echo off
echo Stopping Sinc...

call :killport 4000
call :killport 8081
call :killport 8082

taskkill /FI "WINDOWTITLE eq Sinc API*" /T /F >nul 2>&1
taskkill /FI "WINDOWTITLE eq Sinc Mobile*" /T /F >nul 2>&1

echo Server and Expo are stopped.
pause
exit /b 0

:killport
for /f "tokens=5" %%P in ('netstat -ano ^| findstr ":%1 " ^| findstr "LISTENING"') do (
  taskkill /PID %%P /T /F >nul 2>&1
)
exit /b 0
