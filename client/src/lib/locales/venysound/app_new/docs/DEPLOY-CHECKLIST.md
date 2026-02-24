# 배포 체크리스트 (다시는 같은 문제 없도록)

배포할 때 **항상 이 순서대로** 하면 서버가 깨지는 일을 막을 수 있습니다.

---

## 1. 배포 전 (로컬에서)

- [ ] **코드에 테이블/컬럼 추가한 적 있나?**
  - `shared/schema.ts`, `shared/models/auth.ts` 등 수정했으면 → **반드시** `script/migrations/` 폴더를 확인하고, **아직 서버 DB에 안 돌린 SQL이 있으면** 2단계에서 먼저 실행할 것.
- [ ] 로컬에서 `npm run build` 또는 `npm run make-deploy` 가 에러 없이 끝나는지 확인.

---

## 2. 서버 DB (스키마 바꿨을 때만)

코드에 새 테이블/컬럼이 들어갔으면 **코드 배포 전에** 서버 DB에 반영해야 합니다.

```bash
# 서버 터미널에서 (DATABASE_URL은 .env에 있음)
cd /var/www/venysound/app
psql "postgresql://venysound:veny2024db@localhost:5432/venysounddb" -f script/migrations/아직_안_돌린_파일.sql
```

- `script/migrations/` 에 있는 SQL은 **한 번만** 실행. 이미 돌린 건 건너뛰기.
- 새로 스키마를 추가할 때마다 `script/migrations/날짜-설명.sql` 파일을 만들어 두면 다음 배포 때 안 까먹음.

---

## 3. 파일 업로드 (FileZilla)

**절대 하지 말 것**
- app 폴더 **전체 삭제** 후 올리기
- `.env` 덮어쓰기 또는 삭제
- `local-uploads/` 덮어쓰기 또는 삭제

**올릴 것 (이 네 가지만)**
- `deploy-package/dist/` → app/dist/ 로
- `deploy-package/package.json` → app/package.json
- `deploy-package/package-lock.json` → app/package-lock.json
- `deploy-package/ecosystem.config.cjs` → app/ecosystem.config.cjs

→ **dist, package.json, package-lock.json, ecosystem.config.cjs 만** 선택해서 app/ 안에 넣기.

---

## 4. 서버 터미널

```bash
cd /var/www/venysound/app
npm install --omit=dev
pm2 restart venysound
```

- [ ] `pm2 list` 로 venysound 가 **online** 인지 확인.
- [ ] `pm2 logs venysound --lines 30 --nostream` 으로 에러 없이 요청 처리되는지 확인.

---

## 5. (선택) 하나씩 올리고 싶을 때

- **코드만** 바꾼 경우: dist만 새로 빌드해서 **dist 폴더만** 올리고 `pm2 restart venysound` 해도 됨.
- **package.json** 바꾼 경우: package.json, package-lock.json 올린 뒤 서버에서 `npm install --omit=dev` 후 재시작.
- 이렇게 나눠서 올리면 “뭐가 문제였는지” 찾기 쉬움. 단, **DB 스키마**는 반드시 코드 배포 전에 서버 DB에 먼저 적용할 것.

---

## 요약 (한 줄씩만 기억해도 됨)

1. **스키마 바꿨으면** → 서버 DB에 SQL 먼저 실행.
2. **올리는 건** → dist, package.json, package-lock.json, ecosystem.config.cjs **네 개만**. (.env, local-uploads 절대 건드리지 말 것)
3. **서버에서** → `npm install --omit=dev` 후 해당 포트 앱만 재시작.
4. **5000/5100 스위칭 사용 시** → 트래픽이 안 가는 쪽에 배포 → 동작 확인 → `deploy/switch-to-port.sh 5000|5100` 또는 Nginx upstream 수동 수정 후 `nginx -t && systemctl reload nginx`.

이 순서만 지키면 같은 원인으로 서버가 깨지는 일은 막을 수 있습니다.
