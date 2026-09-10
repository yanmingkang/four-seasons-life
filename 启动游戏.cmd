@echo off
setlocal
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0start-game.ps1" %*
set "GAME_EXIT_CODE=%ERRORLEVEL%"
if not "%GAME_EXIT_CODE%"=="0" (
  echo Game startup failed. See the message above and test-results logs.
  if "%~1"=="" pause
)
exit /b %GAME_EXIT_CODE%
