# Veny Sound DB 백업 복원 스크립트
# 사용법: 이 파일을 우클릭 -> "PowerShell에서 실행"
# 또는 Cursor 터미널에서: .\restore-db.ps1

$backupPath = "E:\뉴베니사운드백업폴더\db\venysound_backup_2026-02-18T03-41-40.sql"
$psql = "C:\Program Files\PostgreSQL\18\bin\psql.exe"

Write-Host "백업 파일 복원 중..." -ForegroundColor Cyan
$env:PGPASSWORD = "postgres"
& $psql -U postgres -d venysound -f $backupPath

if ($LASTEXITCODE -eq 0) {
    Write-Host "복원 완료!" -ForegroundColor Green
} else {
    Write-Host "복원 실패. 백업 파일 경로를 확인하세요." -ForegroundColor Red
}
