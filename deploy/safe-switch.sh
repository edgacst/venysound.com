#!/bin/bash
# 사용법: sudo ./safe-switch.sh 5000  또는  sudo ./safe-switch.sh 5001
# 대상 포트의 /api/health 가 200일 때만 스위칭합니다. 실패하면 스위칭하지 않고 종료합니다.
# 이 스크립트는 switch-to-port.sh 와 같은 디렉터리에 있어야 합니다.

set -e
TARGET_PORT="${1:-}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SWITCH_SCRIPT="${SCRIPT_DIR}/switch-to-port.sh"

if [ -z "$TARGET_PORT" ] || { [ "$TARGET_PORT" != "5000" ] && [ "$TARGET_PORT" != "5001" ]; }; then
  echo "사용법: $0 5000 | 5001"
  exit 1
fi

echo "포트 ${TARGET_PORT} 헬스 체크 중..."
if ! curl -sf --max-time 5 "http://127.0.0.1:${TARGET_PORT}/api/health" > /dev/null; then
  echo "실패: 포트 ${TARGET_PORT} 가 정상 응답하지 않습니다. 스위칭하지 않습니다."
  exit 1
fi
echo "헬스 체크 통과. 스위칭합니다."
exec "$SWITCH_SCRIPT" "$TARGET_PORT"
