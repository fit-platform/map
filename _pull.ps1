$ErrorActionPreference = "Continue"
Set-Location $PSScriptRoot

Write-Host "========================================"
Write-Host "  GitHub 최신 버전 내려받기"
Write-Host "========================================"
Write-Host ""

git pull origin main
if ($LASTEXITCODE -ne 0) {
    Write-Host ""
    Write-Host "[오류] 내려받기에 실패했습니다. 위 메시지를 확인하세요." -ForegroundColor Red
    Read-Host "`n엔터를 누르면 창이 닫힙니다"
    exit 1
}

Write-Host ""
Write-Host "최신 버전을 받았습니다. 이제 파일을 편집하세요." -ForegroundColor Green
Read-Host "`n엔터를 누르면 창이 닫힙니다"