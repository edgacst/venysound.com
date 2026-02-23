#!/bin/bash
# 사용법: sudo ./switch-to-port.sh 5000  또는  sudo ./switch-to-port.sh 5001
# Nginx upstream을 지정한 포트로 바꾼 뒤 reload 합니다.
# 설정 파일: /etc/nginx/sites-available/venysound.com (변경 시 NGINX_SITE 환경변수로 지정)

set -e
TARGET_PORT="${1:-}"
NGINX_SITE="${NGINX_SITE:-/etc/nginx/sites-available/venysound.com}"

if [ -z "$TARGET_PORT" ] || { [ "$TARGET_PORT" != "5000" ] && [ "$TARGET_PORT" != "5001" ]; }; then
  echo "사용법: $0 5000 | 5001"
  exit 1
fi

if [ ! -f "$NGINX_SITE" ]; then
  echo "설정 파일이 없습니다: $NGINX_SITE"
  exit 1
fi

# upstream 내 두 줄만 수정: 활성 포트는 주석 없이, 비활성은 주석
if [ "$TARGET_PORT" = "5000" ]; then
  sed -i.bak 's/^[[:space:]]*# server 127.0.0.1:5000;/    server 127.0.0.1:5000;/' "$NGINX_SITE"
  sed -i.bak 's/^[[:space:]]*server 127.0.0.1:5001;/    # server 127.0.0.1:5001;/' "$NGINX_SITE"
else
  sed -i.bak 's/^[[:space:]]*server 127.0.0.1:5000;/    # server 127.0.0.1:5000;/' "$NGINX_SITE"
  sed -i.bak 's/^[[:space:]]*# server 127.0.0.1:5001;/    server 127.0.0.1:5001;/' "$NGINX_SITE"
fi

nginx -t && systemctl reload nginx
echo "Nginx upstream이 포트 $TARGET_PORT 로 스위칭되었습니다."
