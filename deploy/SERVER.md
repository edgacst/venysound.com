# 배포 서버 정보

- **프로젝트 경로:** `/var/www/venysound/app`
- **재시작:** `pm2 restart venysound`

## 배포 명령어 (서버에서 실행)

**항상 이 순서만 쓰면 됩니다.** (DB 마이그레이션은 `db:deploy` 한 번에 처리)

```bash
cd /var/www/venysound/app
git pull origin main
npm install
npm run db:deploy
npm run build
pm2 restart venysound
```

한 줄:
```bash
cd /var/www/venysound/app && git pull origin main && npm install && npm run db:deploy && npm run build && pm2 restart venysound
```

- **db:deploy** = 필요한 DB 테이블/컬럼을 한 번에 적용 (analytics, 공지, 가이드영상, 테마플레이리스트, 푸시알림 등). 이미 있으면 건너뜀.
- 새로 DB 스크립트가 추가되면 `script/run-all-deploy-migrations.ts`의 목록만 수정하면 됨.
