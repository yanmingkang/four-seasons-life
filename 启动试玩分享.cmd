@echo off
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0share-playtest.ps1" -Action Start
pause
