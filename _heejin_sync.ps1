$ErrorActionPreference = "Continue"
Set-Location $PSScriptRoot

$srcDir = "C:\Users\73006\Desktop\260604hj\miniapps"
$appSrc = Join-Path $srcDir "massing.html"
$imgSrc = Join-Path $srcDir "source"
$heejin = Join-Path $PSScriptRoot "heejin"
$appDst = Join-Path $heejin "app.html"
$imgDst = Join-Path $heejin "source"

Write-Host "========================================"
Write-Host "  260604hj  ->  map/heejin 동기화"
Write-Host "========================================"
Write-Host ""

if (-not (Test-Path $appSrc)) {
    Write-Host "[오류] 개발 원본을 찾을 수 없습니다:" -ForegroundColor Red
    Write-Host "  $appSrc" -ForegroundColor Red
    Write-Host "260604hj\miniapps\massing.html 위치를 확인하세요." -ForegroundColor Yellow
    Read-Host "`n엔터를 누르면 창이 닫힙니다"
    exit 1
}

Write-Host "[1/2] 앱 복사:  massing.html  ->  heejin\app.html"
Copy-Item $appSrc $appDst -Force

Write-Host "[2/2] 이미지 복사:  source\*  ->  heejin\source\"
if (Test-Path $imgSrc) {
    New-Item -ItemType Directory -Force $imgDst | Out-Null
    Copy-Item (Join-Path $imgSrc "*") $imgDst -Recurse -Force
    $cnt = (Get-ChildItem $imgDst -File).Count
    Write-Host ("  이미지 " + $cnt + "개 복사 완료")
} else {
    Write-Host "  (source 폴더가 없어 이미지는 건너뜀)" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "동기화 완료!  (heejin\index.html 로그인/iframe 은 그대로 둡니다)" -ForegroundColor Green
Write-Host ""
$ans = Read-Host "이어서 지금 배포까지 할까요? (Y=예 / 그냥 엔터=아니오)"
if ($ans -match '^[Yy]') {
    Write-Host ""
    & (Join-Path $PSScriptRoot "_deploy.ps1")
} else {
    Write-Host ""
    Write-Host "동기화만 했습니다. 준비되면 배포.bat 을 누르세요." -ForegroundColor Cyan
    Read-Host "`n엔터를 누르면 창이 닫힙니다"
}
