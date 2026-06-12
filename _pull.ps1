$ErrorActionPreference = "Continue"
Set-Location $PSScriptRoot

Write-Host "========================================"
Write-Host "  GitHub 최신 버전 내려받기"
Write-Host "========================================"
Write-Host ""

$ok = $false
for ($n = 1; $n -le 3; $n++) {
    if ($n -gt 1) { Write-Host ""; Write-Host "연결 재시도 $n/3 ..." -ForegroundColor Yellow; Start-Sleep -Seconds 2 }
    git pull origin main
    if ($LASTEXITCODE -eq 0) { $ok = $true; break }
}

if (-not $ok) {
    Write-Host ""
    Write-Host "[오류] 내려받기에 실패했습니다." -ForegroundColor Red
    Write-Host "인터넷 연결(회사망/방화벽)이 불안정할 수 있어요. 잠시 후 다시 실행해 보세요." -ForegroundColor Red
    Read-Host "`n엔터를 누르면 창이 닫힙니다"
    exit 1
}

Write-Host ""
Write-Host "최신 버전을 받았습니다. 이제 파일을 편집하세요." -ForegroundColor Green
Read-Host "`n엔터를 누르면 창이 닫힙니다"