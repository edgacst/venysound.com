# venysound.com 배포 가이드

## 추천 서버: Hostinger VPS 1 (약 5,000원/월)

- 가입: https://www.hostinger.com/vps-hosting
- OS 선택: **Ubuntu 22.04 LTS**
- 플랜: VPS 1 (1 vCPU / 4GB RAM / 50GB NVMe)

---

## Step 1. 서버 접속

```bash
# 발급받은 IP 주소로 SSH 접속
ssh root@서버IP주소
```

---

## Step 2. 서버 초기 설치 (자동)

로컬에서 서버로 스크립트 전송 후 실행:

```bash
# 로컬에서 실행
scp deploy/setup-server.sh root@서버IP:/root/
ssh root@서버IP "bash /root/setup-server.sh"
```

설치되는 것: Node.js 18, PM2, PostgreSQL, Nginx, Certbot

---

## Step 3. 프로젝트 파일 업로드

```bash
# 로컬에서 실행 - 프로젝트 전체를 서버로 전송 (node_modules 제외)
rsync -avz --exclude='node_modules' --exclude='.git' --exclude='dist' \
  --exclude='local-uploads' \
  ./ root@서버IP:/var/www/venysound/

# 음원 파일 별도 전송 (용량이 크므로 시간 소요)
rsync -avz --progress local-uploads/ root@서버IP:/var/www/venysound/local-uploads/
```

---

## Step 4. 서버에서 .env 설정

```bash
ssh root@서버IP
cd /var/www/venysound
cp .env.example .env
nano .env
```

아래 값들을 채워넣으세요:
- `DATABASE_URL=postgresql://venysound:설치시_설정한_비밀번호@localhost:5432/venysound`
- `SESSION_SECRET=` (32자 이상 랜덤 문자열)
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`

---

## Step 5. 빌드 및 DB 설정

```bash
cd /var/www/venysound
npm install
npm run build
npm run db:push   # DB 스키마 생성
```

---

## Step 6. Nginx 설정

```bash
cp /var/www/venysound/deploy/nginx.conf /etc/nginx/sites-available/venysound.com
ln -s /etc/nginx/sites-available/venysound.com /etc/nginx/sites-enabled/
# 기본 설정 비활성화
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx
```

---

## Step 7. SSL 인증서 발급

도메인 DNS가 서버 IP를 가리키고 있어야 합니다.

```bash
certbot --nginx -d venysound.com -d www.venysound.com
```

---

## Step 8. PM2로 앱 시작

```bash
cd /var/www/venysound
pm2 start ecosystem.config.cjs --env production
pm2 save        # 재부팅 시 자동 시작 저장
pm2 logs        # 로그 확인
```

---

## Step 9. DNS 변경 (도메인 등록업체에서)

venysound.com 도메인의 A 레코드를 서버 IP로 변경:
- `@` → 서버 IP
- `www` → 서버 IP

---

## Step 10. OAuth 콜백 URL 업데이트

### Google Cloud Console
https://console.cloud.google.com → OAuth 클라이언트 ID → 승인된 리디렉션 URI:
- `https://venysound.com/api/auth/google/callback`

### Naver Developers
https://developers.naver.com → 앱 설정 → 콜백 URL:
- `https://venysound.com/api/auth/naver/callback`

### Kakao Developers
https://developers.kakao.com → 앱 설정 → 플랫폼 → 리디렉션 URI:
- `https://venysound.com/api/auth/kakao/callback`

---

## 이후 코드 업데이트 방법

```bash
# 로컬에서 실행
rsync -avz --exclude='node_modules' --exclude='.git' --exclude='dist' --exclude='local-uploads' \
  ./ root@서버IP:/var/www/venysound/

# 서버에서 실행
ssh root@서버IP "cd /var/www/venysound && npm install && npm run build && pm2 restart venysound"
```

---

## 유용한 명령어

```bash
pm2 status              # 앱 상태 확인
pm2 logs venysound      # 실시간 로그
pm2 restart venysound   # 앱 재시작
pm2 stop venysound      # 앱 정지

systemctl status nginx  # Nginx 상태
tail -f /var/log/venysound/error.log  # 에러 로그

sudo -u postgres psql venysound  # DB 직접 접속
```

---

## 비용 요약

| 항목 | 비용 |
|------|------|
| Hostinger VPS 1 | 약 5,000원/월 |
| SSL 인증서 (Let's Encrypt) | 무료 |
| 도메인 (venysound.com 기존) | 기존 유지 |
| **합계** | **약 5,000원/월** |
