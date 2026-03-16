# 배포 서버 정보

- **프로젝트 경로:** `/var/www/venysound/app`
- **재시작:** `pm2 restart venysound`

## 배포 방법 1: 스크립트 한 번에 (권장)

서버에 SSH 접속 후 앱 폴더에서:

```bash
cd /var/www/venysound/app
bash deploy/run-on-server.sh
```

(경로가 다르면 `APP_DIR=/실제/경로 bash deploy/run-on-server.sh`)

## 배포 방법 2: 명령어 직접 실행

**항상 이 순서만 쓰면 됩니다.** (DB 마이그레이션은 `db:deploy` 한 번에 처리)

```bash
cd /var/www/venysound/app
git pull origin main
npm install
npm run db:deploy
npm run build
pm2 restart venysound
pm2 save
```

한 줄:
```bash
cd /var/www/venysound/app && git pull origin main && npm install && npm run db:deploy && npm run build && pm2 restart venysound && pm2 save
```

- **db:deploy** = 필요한 DB 테이블/컬럼을 한 번에 적용 (analytics, 공지, 가이드영상, 테마플레이리스트, 푸시알림 등). 이미 있으면 건너뜀.
- 새로 DB 스크립트가 추가되면 `script/run-all-deploy-migrations.ts`의 목록만 수정하면 됨.

## 반영 여부 확인

- 브라우저에서 **Ctrl+Shift+R** (강력 새로고침) 또는 시크릿 창으로 접속.
- **페이지 소스 보기(Ctrl+U)** → `build:` 검색 → 나오는 날짜/시간이 방금 서버에서 빌드한 시각이면 반영된 것.
