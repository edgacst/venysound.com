# 적용 순서 (공지 이미지 / 대량 업로드 금액 / 프리미엄 번역)

아래 순서대로 진행하면 됩니다.

---

## 1단계: 로컬에서 확인

1. **저장 & 빌드**
   - 수정한 파일을 모두 저장한 뒤, 로컬에서 빌드가 되는지 확인합니다.
   ```bash
   npm run build
   ```
   - 에러 없이 끝나면 다음 단계로 갑니다.

---

## 2단계: DB 적용 (공지 이미지용 컬럼)

**이미 `site_announcements` 테이블을 쓰고 있는 서버**라면, 한 번만 실행해 주세요.

1. **서버에 SSH 접속** (Hostinger 등 사용 중인 서버)
2. **프로젝트 폴더로 이동**
   ```bash
   cd /var/www/venysound
   ```
   (실제 앱 경로가 다르면 그 경로로 이동)
3. **공지 테이블 스크립트 실행** (`image_url` 컬럼 추가)
   ```bash
   npm run db:site-announcements
   ```
   - 테이블이 없으면 생성하고, 있으면 `image_url` 컬럼만 추가합니다.
   - **새로 DB 세팅하는 경우**에는 테이블이 스크립트로 생성되므로 이 단계만 하면 됩니다.

---

## 3단계: 코드 배포 (Git 사용 시)

1. **로컬에서 GitHub에 푸시**
   ```bash
   git add .
   git commit -m "공지 이미지, 대량업로드 금액, 프리미엄 번역 적용"
   git push origin main
   ```
2. **서버에 SSH 접속**
3. **서버에서 최신 코드 받고 빌드·재시작**
   ```bash
   cd /var/www/venysound && git pull && npm install --omit=dev && npm run build && pm2 restart venysound
   ```
   - `venysound` 대신 사용 중인 PM2 앱 이름이 있으면 그걸로 바꿉니다.
4. **PM2가 꺼져 있어서 재시작할 프로세스가 0개**라면:
   ```bash
   pm2 start ecosystem.config.cjs --env production
   pm2 save
   ```

---

## 4단계: 동작 확인

1. **공지 이미지**
   - 관리자 페이지 → 공지 작성에 **이미지 URL 입력** 또는 **이미지 업로드** 후 저장.
   - 메인(홈) 접속 시 공지 팝업에 이미지가 나오는지 확인.
2. **대량 업로드 금액**
   - 대량 업로드 페이지에서 **판매 금액** 입력 후 곡 업로드.
   - 업로드된 곡의 판매 금액이 입력한 값으로 적용됐는지 확인.
3. **프리미엄 번역**
   - 프리미엄(요금제) 페이지에서 언어 전환 후 **Free / Premium** 플랜명, 계좌이체 모달 문구가 번역되는지 확인.

---

## 요약 체크리스트

- [ ] 로컬 `npm run build` 성공
- [ ] 서버에서 `npm run db:site-announcements` 실행 (공지 이미지 사용 시, 한 번만)
- [ ] GitHub 푸시 후 서버에서 `git pull` → `npm install --omit=dev` → `npm run build` → `pm2 restart venysound`
- [ ] 공지 이미지 / 대량 업로드 금액 / 프리미엄 번역 각각 동작 확인

이 순서대로 하시면 세 가지 수정 사항이 모두 반영됩니다.
