$ErrorActionPreference = "Continue"
Set-Location $PSScriptRoot

Write-Host "========================================"
Write-Host "  GitHub Pages 배포"
Write-Host "========================================"
Write-Host ""

Write-Host "[1/4] 변경된 파일 확인 중..."
git add -A
git diff --cached --quiet
if ($LASTEXITCODE -eq 0) {
    Write-Host ""
    Write-Host "변경된 내용이 없습니다. 배포할 것이 없어요."
    Read-Host "`n엔터를 누르면 창이 닫힙니다"
    exit 0
}

Write-Host ""
Write-Host "[2/4] 변경 내용:"
git status --short
Write-Host ""

if ($args.Count -gt 0) { $msg = $args -join " " }
else { $msg = "update " + (Get-Date -Format "yyyy-MM-dd HH:mm") }

Write-Host "[3/4] 커밋 중... (메시지: $msg)"
git commit -m $msg

Write-Host ""
Write-Host "[4/4] GitHub로 업로드(push) 중..."
$ok = $false
for ($n = 1; $n -le 3; $n++) {
    if ($n -gt 1) { Write-Host ""; Write-Host "연결 재시도 $n/3 ..." -ForegroundColor Yellow; Start-Sleep -Seconds 2 }
    git push origin main
    if ($LASTEXITCODE -eq 0) { $ok = $true; break }
}

if (-not $ok) {
    Write-Host ""
    Write-Host "[오류] push에 실패했습니다." -ForegroundColor Red
    Write-Host "인터넷 연결이 불안정하면 잠시 후 다시 실행하세요. (커밋은 이미 저장돼 있어 다시 배포.bat만 누르면 됩니다)" -ForegroundColor Red
    Read-Host "`n엔터를 누르면 창이 닫힙니다"
    exit 1
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "  배포 완료!" -ForegroundColor Green
Write-Host "  1~2분 뒤 아래 주소에서 확인하세요:"
Write-Host "  https://fit-platform.github.io/map/"
Write-Host "========================================" -ForegroundColor Green
Read-Host "`n엔터를 누르면 창이 닫힙니다"