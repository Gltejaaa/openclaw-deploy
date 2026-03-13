@echo off
setlocal EnableExtensions
chcp 65001 >nul 2>nul

set "ROOT=%~dp0"
cd /d "%ROOT%"

set "NPM_GLOBAL=%APPDATA%\npm"
set "NODE_PATHS=%ProgramFiles%\nodejs;%ProgramFiles(x86)%\nodejs;%LOCALAPPDATA%\Programs\node;D:\Nodejs;D:\nodejs;C:\nodejs;%NPM_GLOBAL%"
set "PATH=%NODE_PATHS%;%PATH%"

set "VSDEVCMD=%ProgramFiles(x86)%\Microsoft Visual Studio\2022\BuildTools\Common7\Tools\VsDevCmd.bat"
if not exist "%VSDEVCMD%" set "VSDEVCMD=%ProgramFiles%\Microsoft Visual Studio\2022\BuildTools\Common7\Tools\VsDevCmd.bat"

echo.
echo ==========================================
echo   OpenClaw Deploy - Tauri Dev Launcher
echo ==========================================
echo.

if not exist "%VSDEVCMD%" (
  echo [ERROR] VsDevCmd.bat not found.
  echo Install Visual Studio 2022 Build Tools with C++ tools and Windows SDK.
  pause
  exit /b 1
)

where node >nul 2>nul || (
  echo [ERROR] Node.js not found.
  pause
  exit /b 1
)

where npm >nul 2>nul || (
  echo [ERROR] npm not found.
  pause
  exit /b 1
)

call "%VSDEVCMD%" -arch=x64 -host_arch=x64 >nul
if errorlevel 1 (
  echo [ERROR] Failed to load Visual Studio Build Tools environment.
  pause
  exit /b 1
)

where link.exe >nul 2>nul || (
  echo [ERROR] link.exe not found after loading VsDevCmd.
  pause
  exit /b 1
)

where cl.exe >nul 2>nul || (
  echo [ERROR] cl.exe not found after loading VsDevCmd.
  echo Open Visual Studio Build Tools Installer and ensure MSVC v143 C++ build tools are installed.
  pause
  exit /b 1
)

echo [OK] Build Tools environment loaded.
echo [RUN] npm run tauri dev
echo.

npm run tauri dev
set "EXIT_CODE=%ERRORLEVEL%"

if not "%EXIT_CODE%"=="0" (
  echo.
  echo [EXIT] npm run tauri dev returned %EXIT_CODE%.
  pause
)

exit /b %EXIT_CODE%
