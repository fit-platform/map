@echo off
setlocal enabledelayedexpansion
chcp 65001 >nul
cd /d "%~dp0"

echo ========================================
echo   jubyung 앱 배포
echo ========================================
echo.

echo [1/4] 변경 파일 확인 중...
git add jubyung/

git diff --cached --quiet
if %errorlevel% equ 0 (
    echo.
    echo 변경된 내용이 없습니다. 배포할 것이 없어요.
    pause
    exit /b 0
)

echo.
echo [2/4] 변경 내용:
git status --short
echo.

set msg=update jubyung %date% %time:~0,8%
if not "%~1"=="" set msg=%~1

echo [3/4] 커밋 중... (메시지: %msg%)
git commit -m "%msg%"

echo.
echo [4/4] GitHub 업로드(push) 중...

set ok=0
for /L %%n in (1,1,3) do (
    if !ok! equ 0 (
        git push origin main
        if !errorlevel! equ 0 set ok=1
        if !ok! equ 0 (
            echo 재시도 %%n/3 ...
            timeout /t 2 /nobreak >nul
        )
    )
)

if %ok% equ 0 (
    echo.
    echo [오류] push 실패. 인터넷 연결 확인 후 다시 실행하세요.
    pause
    exit /b 1
)

echo.
echo ========================================
echo   배포 완료!
echo   1~2분 뒤 사이트에서 확인하세요.
echo ========================================
pause
