$ErrorActionPreference = "Continue"
Set-Location $PSScriptRoot

Write-Host "========================================"
Write-Host "  GitHub Pages 배포"
Write-Host "========================================"
Write-Host ""

Write-Host "[1/5] 변경된 파일 확인 중..."
git add -A
git diff --cached --quiet
if ($LASTEXITCODE -ne 0) {
    Write-Host ""
    Write-Host "[2/5] 변경 내용:"
    git status --short
    Write-Host ""
    if ($args.Count -gt 0) { $msg = $args -join " " }
    else { $msg = "update " + (Get-Date -Format "yyyy-MM-dd HH:mm") }
    Write-Host "[3/5] 커밋 중... (메시지: $msg)"
    git commit -m $msg
} else {
    # 새로 바뀐 파일은 없지만, 지난번에 push 못 한 커밋이 남아있는지 확인
    $ahead = (git rev-list --count "origin/main..HEAD" 2>$null)
    if ($null -eq $ahead) { $ahead = "0" }
    $ahead = "$ahead".Trim()
    if ($ahead -eq "" -or $ahead -eq "0") {
        Write-Host ""
        Write-Host "변경된 내용이 없습니다. 배포할 것이 없어요."
        Read-Host "`n엔터를 누르면 창이 닫힙니다"
        exit 0
    }
    Write-Host ""
    Write-Host "[2~3/5] 새로 바뀐 건 없지만, 지난번에 못 올린 작업($ahead건)이 있어 이어서 올립니다..." -ForegroundColor Yellow
}

Write-Host ""
Write-Host "[4/5] 최신본 받아 합치는 중... (다른 팀원 작업 먼저 반영 → push 실패 방지)"
$pulled = $false
for ($n = 1; $n -le 3; $n++) {
    if ($n -gt 1) { Write-Host ""; Write-Host "연결 재시도 $n/3 ..." -ForegroundColor Yellow; Start-Sleep -Seconds 2 }
    git pull --rebase origin main
    if ($LASTEXITCODE -eq 0) { $pulled = $true; break }
    if ((Test-Path ".git\rebase-merge") -or (Test-Path ".git\rebase-apply")) { break }
}

if (-not $pulled) {
    if ((Test-Path ".git\rebase-merge") -or (Test-Path ".git\rebase-apply")) {
        git rebase --abort
        Write-Host ""
        Write-Host "[중단] 다른 팀원과 '같은 파일'을 동시에 고쳐 충돌이 났습니다." -ForegroundColor Red
        Write-Host "당신의 변경은 커밋으로 안전하게 저장돼 있습니다(사라지지 않아요)." -ForegroundColor Yellow
        Write-Host "→ 보통은 '본인 폴더만' 수정하면 이 일이 없습니다. 충돌 해결은 도움을 요청하세요." -ForegroundColor Yellow
    } else {
        Write-Host ""
        Write-Host "[중단] 인터넷 연결이 불안정해 최신본을 받지 못했습니다." -ForegroundColor Red
        Write-Host "잠시 후 배포.bat을 다시 누르세요. (커밋은 이미 저장돼 있습니다)" -ForegroundColor Yellow
    }
    Read-Host "`n엔터를 누르면 창이 닫힙니다"
    exit 1
}

Write-Host ""
Write-Host "[5/5] GitHub로 업로드(push) 중..."
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