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

## 무중단 배포 (5000/5100 스위칭)

서비스 중인 포트(**5000**)와 배포 검증용 포트(**5100**)를 번갈아 쓰면, 배포 중에도 기존 버전이 계속 서비스됩니다.

### 구조

- **5000**: 현재 사용자에게 서비스 중인 앱
- **5100**: 새 버전을 올려서 검증하는 포트 (확인 후 트래픽을 여기로 스위칭)

### 1. Nginx upstream 설정 (최초 1회)

서버에 `deploy/nginx-upstream.conf` 내용을 반영합니다.

```bash
# 로컬에서 서버로 복사
scp deploy/nginx-upstream.conf root@서버IP:/etc/nginx/sites-available/venysound.com
ssh root@서버IP "nginx -t && systemctl reload nginx"
```

- upstream에서 **한 포트만** `server 127.0.0.1:5000;` 또는 `server 127.0.0.1:5100;` 로 두고, 나머지는 `#` 로 주석 처리합니다.
- PM2로 **5000번**과 **5100번** 앱을 각각 띄워 두고, Nginx는 지금 서비스할 쪽 한 포트만 바라보게 합니다.

### 2. 배포 절차 (매 업데이트)

1. **지금 트래픽이 가는 쪽 확인**  
   - Nginx upstream이 5000을 보면 → 이번에는 **5100**에 배포  
   - Nginx upstream이 5100을 보면 → 이번에는 **5000**에 배포  

2. **비어 있는 쪽에 새 버전 배포**  
   - 해당 포트용 디렉터리/앱에 파일 올리고 `npm install --omit=dev`, `pm2 restart venysound-5100` (또는 venysound-5000) 실행  

3. **동작 확인**  
   - `curl http://127.0.0.1:5100/` (또는 5000) 로 새 버전이 정상 응답하는지 확인  

4. **스위칭**  
   - Nginx를 새 포트로 바꾼 뒤 reload  

   **방법 A – 스크립트 사용 (upstream 설정이 위와 같을 때)**  
   ```bash
   scp deploy/switch-to-port.sh root@서버IP:/root/
   ssh root@서버IP "chmod +x /root/switch-to-port.sh"
   # 트래픽을 5100으로 넘기려면:
   ssh root@서버IP "sudo /root/switch-to-port.sh 5100"
   ```  

   **방법 B – 수동**  
   - `/etc/nginx/sites-available/venysound.com` 에서 upstream 안의 두 줄만 수정  
     (서비스할 포트는 `server 127.0.0.1:5000;` 또는 `server 127.0.0.1:5100;`, 나머지는 `#` 처리)  
   - `sudo nginx -t && sudo systemctl reload nginx`  

다음 배포 때는 반대 포트에 올리고, 확인 후 다시 스위칭하면 됩니다.

### 3. PM2로 5000/5100 두 개 띄우기

- 앱을 두 세트(예: `app-5000`, `app-5100`)로 두고, 각각 `PORT=5000`, `PORT=5100` 으로 기동  
- 또는 `ecosystem.config.cjs`에 앱을 두 개 정의 (name: `venysound-5000`, `venysound-5100`, env: PORT 5000/5100)  
- DB, `.env`, `local-uploads` 등은 두 앱이 같은 값을 보도록 공유하거나 심볼릭 링크로 맞춥니다.

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
