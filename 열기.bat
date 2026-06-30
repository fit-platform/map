@echo off
chcp 65001 >nul
title FIT MAP Server 8777
pushd "%~dp0"
echo ===========================================
echo   FIT MAP server : http://localhost:8777
echo   Close this window to STOP the server.
echo ===========================================
echo.
echo  Browser opens automatically. Please wait...
echo.
start "" "http://localhost:8777/heejin/index.html"
python -m http.server 8777
if errorlevel 1 py -m http.server 8777
if errorlevel 1 echo [ERROR] Python not found OR port 8777 already in use.
if errorlevel 1 echo  - Close other server windows, or install Python from https://www.python.org
if errorlevel 1 pause
popd
