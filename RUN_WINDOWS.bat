@echo off
setlocal
cd /d "%~dp0"

echo ============================================
echo   SIH26183 Person 4 Frontend
 echo ============================================

echo.

where node >nul 2>nul
if %errorlevel%==0 goto NODE_OK

echo Node.js/npm was not found.
echo.
echo Trying to install Node.js LTS using Windows Package Manager (winget)...
where winget >nul 2>nul
if %errorlevel%==1 (
  echo.
  echo winget is not available on this PC.
  echo Please install Node.js LTS from https://nodejs.org/ and run this file again.
  pause
  exit /b 1
)
winget install --id OpenJS.NodeJS.LTS -e --accept-package-agreements --accept-source-agreements
if %errorlevel% neq 0 (
  echo Node.js installation failed. Please install Node.js LTS manually.
  pause
  exit /b 1
)

echo.
echo Node.js installed. Please CLOSE this window and run RUN_WINDOWS.bat again.
pause
exit /b 0

:NODE_OK
echo Node.js found.
node --version
npm --version

echo.
echo Installing frontend dependencies...
npm install
if %errorlevel% neq 0 (
  echo.
  echo npm install failed.
  pause
  exit /b 1
)

echo.
echo Starting CryptoShield frontend...
npm run dev
pause
