@echo off
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0_deploy.ps1" %*
