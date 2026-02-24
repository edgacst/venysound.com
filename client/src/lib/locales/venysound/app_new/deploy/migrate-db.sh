#!/bin/bash
# ================================================================
# DB 데이터 이전 스크립트
# 로컬 PC(Windows)에서 실행하는 것이 아니라,
# 새 VPS 서버에서 실행하거나 로컬에서 원격 서버로 전송하는 용도
# ================================================================

# 설정값 변경
LOCAL_DB="postgresql://postgres:postgres@localhost:5432/venysound"
REMOTE_USER="root"           # VPS SSH 사용자
REMOTE_HOST="서버IP주소"      # VPS IP 주소로 변경
REMOTE_DB="postgresql://venysound:venysound_pw_change_this@localhost:5432/venysound"
BACKUP_FILE="venysound_migration_$(date +%Y%m%d_%H%M%S).sql"

echo "=== DB 마이그레이션 시작 ==="

echo "[1/3] 로컬 DB 백업 중..."
pg_dump "$LOCAL_DB" --no-owner --no-acl > "$BACKUP_FILE"
echo "  → $BACKUP_FILE 생성됨 ($(du -sh $BACKUP_FILE | cut -f1))"

echo "[2/3] VPS 서버로 전송 중..."
scp "$BACKUP_FILE" "$REMOTE_USER@$REMOTE_HOST:/tmp/$BACKUP_FILE"

echo "[3/3] VPS에서 DB 복원 중..."
ssh "$REMOTE_USER@$REMOTE_HOST" "psql '$REMOTE_DB' < /tmp/$BACKUP_FILE && rm /tmp/$BACKUP_FILE"

echo ""
echo "=== DB 마이그레이션 완료 ==="
echo "백업 파일: $BACKUP_FILE (로컬에 보관됨)"
