# 배포 서버 정보

- **프로젝트 경로:** `/var/www/venysound/app`
- **재시작:** `pm2 restart venysound`

## 배포 명령어 (서버에서 실행)

```bash
cd /var/www/venysound/app
git pull
npm install
npm run db:push-notify
npm run build
pm2 restart venysound
```

한 줄:
```bash
cd /var/www/venysound/app && git pull && npm install && npm run db:push-notify && npm run build && pm2 restart venysound
```
