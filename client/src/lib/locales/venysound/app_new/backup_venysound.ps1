Param(
    [string]$Server = "root@72.61.112.215",
    [string]$RemoteAppPath = "/var/www/venysound/app",
    [string]$LocalBase = "E:\뉴베니사운드백업폴더"
)

# -------------------------------------------------------
# Veny Sound 전체 백업 자동 스크립트 (내 PC에서 실행)
#
# 하는 일:
# 1) VPS에서 DB 덤프 + 업로드 폴더 압축 생성
# 2) 생성된 파일을 E:\뉴베니사운드백업폴더 로 내려받기
#
# 필요 조건:
# - Windows에 OpenSSH 클라이언트 설치 (PowerShell에서 ssh, scp 명령 사용 가능해야 함)
# - 서버 SSH 접속 정보: root@72.61.112.215 (기본값, 필요 시 위 Param 수정)
# -------------------------------------------------------

Write-Host "=== Veny Sound 전체 백업 시작 ===" -ForegroundColor Cyan

# 타임스탬프 생성
$timestamp = Get-Date -Format "yyyy-MM-dd_HH-mm-ss"

# 로컬 백업 경로 설정
$localDbDir    = Join-Path $LocalBase "db"
$localFilesDir = Join-Path $LocalBase "음원파일"

New-Item -ItemType Directory -Force -Path $LocalBase    | Out-Null
New-Item -ItemType Directory -Force -Path $localDbDir   | Out-Null
New-Item -ItemType Directory -Force -Path $localFilesDir| Out-Null

Write-Host "서버: $Server" -ForegroundColor Yellow
Write-Host "원격 경로: $RemoteAppPath" -ForegroundColor Yellow
Write-Host "로컬 백업 폴더: $LocalBase" -ForegroundColor Yellow

# 1) 원격 서버에서 DB 덤프 + 업로드 폴더 압축 생성
$remoteScript = @"
set -e
cd $RemoteAppPath
echo "[1/2] DB 덤프 생성 중..."
sudo -u postgres pg_dump venysounddb > venysound_backup_$timestamp.sql
echo "[2/2] 업로드 폴더 압축 중..."
tar czf uploads_$timestamp.tar.gz local-uploads/uploads
echo "원격 백업 파일 생성 완료"
"@

Write-Host "원격 서버에서 백업 파일 생성 중..." -ForegroundColor Cyan
ssh $Server "$remoteScript"
if ($LASTEXITCODE -ne 0) {
    Write-Host "원격 백업 생성 중 오류가 발생했습니다. (ssh 단계)" -ForegroundColor Red
    exit 1
}

# 2) 생성된 파일을 로컬로 다운로드
$remoteDbFile    = "$RemoteAppPath/venysound_backup_$timestamp.sql"
$remoteUploads   = "$RemoteAppPath/uploads_$timestamp.tar.gz"
$localDbFile     = Join-Path $localDbDir "venysound_backup_$timestamp.sql"
$localUploads    = Join-Path $localFilesDir "uploads_$timestamp.tar.gz"

Write-Host "DB 백업 파일 다운로드 중..." -ForegroundColor Cyan
scp "$Server:`"$remoteDbFile`"" "$localDbFile"
if ($LASTEXITCODE -ne 0) {
    Write-Host "DB 백업 파일 다운로드 실패" -ForegroundColor Red
    exit 1
}

Write-Host "업로드 폴더 압축 파일 다운로드 중..." -ForegroundColor Cyan
scp "$Server:`"$remoteUploads`"" "$localUploads"
if ($LASTEXITCODE -ne 0) {
    Write-Host "업로드 파일 다운로드 실패" -ForegroundColor Red
    exit 1
}

Write-Host "=== 백업 완료! ===" -ForegroundColor Green
Write-Host "DB 백업: $localDbFile" -ForegroundColor Green
Write-Host "업로드 압축: $localUploads" -ForegroundColor Green

