@echo off
setlocal
title Red Rain — Windows build

REM ============================================================
REM  Red Rain one-command Windows build
REM  Produces:
REM    ..\VSCode-win32-x64\          portable folder (run RedRain.exe)
REM    .build\win32-x64\...\*.exe    NSIS-free Inno setup installer
REM  Requirements: Node.js 24.22+ (https://nodejs.org), git, ~10 GB disk
REM ============================================================

where node >nul 2>nul
if errorlevel 1 (
	echo [Red Rain] Node.js not found. Install Node.js 24.22 or newer, then re-run.
	exit /b 1
)

for /f "delims=" %%v in ('node -v') do set NODEV=%%v
echo [Red Rain] Using Node %NODEV%

echo [Red Rain] Installing dependencies ^(this downloads a few GB, be patient^)...
call npm ci
if errorlevel 1 call npm install
if errorlevel 1 (
	echo [Red Rain] npm install failed.
	exit /b 1
)

echo [Red Rain] Compiling and packaging win32 x64 ^(10-40 min on most machines^)...
call npm run gulp -- vscode-win32-x64
if errorlevel 1 (
	echo [Red Rain] Packaging failed.
	exit /b 1
)

echo [Red Rain] Building Inno updater...
call npm run gulp -- vscode-win32-x64-inno-updater

echo [Red Rain] Building setup installer...
call npm run gulp -- vscode-win32-x64-user-setup
if errorlevel 1 (
	echo [Red Rain] Installer build failed ^(portable build is still valid^).
)

echo.
echo ============================================================
echo  Red Rain build complete:
echo    Portable : %cd%\..\VSCode-win32-x64\
echo    Installer: %cd%\.build\win32-x64\  ^(look for the setup .exe^)
echo ============================================================
endlocal
