@echo off
chcp 65001 >nul
title FIT MAP 로컬 서버 (8777)
cd /d "%~dp0"
echo ============================================
echo   FIT MAP - 로컬 서버 (http://localhost:8777)
echo ============================================
echo.
echo  브라우저가 자동으로 열립니다.
echo  이 검은 창을 닫으면 서버가 종료됩니다.
echo.

REM 브라우저 먼저 열기 (heejin 앱)
start "" "http://localhost:8777/heejin/index.html"

REM 이 폴더(map)를 로컬 서버로 띄움
python -m http.server 8777 || py -m http.server 8777 || (
  echo.
  echo [오류] Python을 찾을 수 없습니다.
  echo  https://www.python.org 에서 Python 설치 후 다시 실행하세요.
  echo  (설치 시 "Add Python to PATH" 체크)
  echo.
  pause
)
