#!/bin/bash
# 서버(호스트너)에서 배포할 때 이 스크립트 실행
# 사용법: bash run-on-server.sh   또는  chmod +x run-on-server.sh && ./run-on-server.sh

set -e
APP_DIR="${APP_DIR:-/var/www/venysound/app}"
echo "=========================================="
echo "배포 경로: $APP_DIR"
echo "=========================================="

cd "$APP_DIR" || { echo "오류: $APP_DIR 로 이동할 수 없습니다."; exit 1; }
echo "[1/6] 현재 디렉터리: $(pwd)"
echo ""

echo "[2/6] 현재 Git 커밋 (배포 전)"
git log -1 --oneline
echo ""

echo "[3/6] GitHub에서 최신 코드 받는 중..."
git fetch origin main
git pull origin main
echo ""

echo "[4/6] 최신 Git 커밋 (배포 후)"
git log -1 --oneline
echo ""

echo "[5/6] npm install && npm run build..."
npm install
npm run db:deploy
npm run build
echo ""

echo "[6/6] PM2 재시작..."
pm2 restart venysound
pm2 save
echo ""

echo "=========================================="
echo "배포 완료. 브라우저에서 Ctrl+Shift+R 로 새로고침 후 확인하세요."
echo "페이지 소스 보기(Ctrl+U)에서 'build:' 로 빌드 시각 확인 가능."
echo "=========================================="
