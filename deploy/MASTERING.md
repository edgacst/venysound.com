# MP3 마스터링 스튜디오 배포 (venysound.com/mastering)

별도 저장소: **https://github.com/edgacst/mp3mastering**

메인 VenySound 앱(`127.0.0.1:5000`)과 **분리**된 Node 앱(`127.0.0.1:3001`)입니다.  
Nginx가 `/mastering/` 요청만 마스터링 앱으로 전달합니다.

---

## 1. 서버 준비 (최초 1회)

### ffmpeg 설치 (필수)

```bash
sudo apt update
sudo apt install -y ffmpeg
ffmpeg -version
```

### 마스터링 앱 클론·빌드

```bash
sudo mkdir -p /var/www
cd /var/www
sudo git clone https://github.com/edgacst/mp3mastering.git mp3mastering
sudo chown -R $USER:$USER /var/www/mp3mastering
cd /var/www/mp3mastering
npm install
npm --prefix frontend install --include=dev
npm run build
npm --prefix backend install --omit=dev
```

### PM2 실행 (127.0.0.1:3001, 외부 포트 미개방)

```bash
cd /var/www/mp3mastering
PORT=3001 pm2 start "npm --prefix backend start" --name mastering-app
pm2 save
pm2 status mastering-app
curl -sI http://127.0.0.1:3001/ | head -5
```

재배포:

```bash
cd /var/www/mp3mastering && git pull && npm install && npm --prefix frontend install --include=dev && npm run build && npm --prefix backend install --omit=dev && pm2 restart mastering-app
```

---

## 2. Nginx (venysound.com)

`deploy/nginx.conf`의 `/mastering/` 블록을 서버 설정에 반영:

```bash
sudo cp /var/www/venysound/app/deploy/nginx.conf /etc/nginx/sites-available/venysound.com
sudo nginx -t && sudo systemctl reload nginx
```

핵심 설정:

- `location ^~ /mastering/` → `http://127.0.0.1:3001/` (경로 접두사 제거)
- `client_max_body_size 100M` (업로드)
- `proxy_read_timeout 600s` (ffmpeg 처리 시간)
- `location = /mastering` → `/mastering/` 리다이렉트

---

## 3. 방화벽

외부는 **80·443만** 허용. **3001은 localhost 전용** (UFW 예시):

```bash
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
# 3001은 열지 않음
```

---

## 4. HTTPS 동작 확인

```bash
# Nginx에 mastering 블록이 있는지 (없으면 5000으로 가서 SPA 404)
sudo grep -n mastering /etc/nginx/sites-enabled/*

# 마스터링 앱 직접 확인
curl -sI http://127.0.0.1:3001/ | head -5
curl -sI https://venysound.com/mastering/ | head -5
```

브라우저에서:

1. https://venysound.com/mastering/ 접속
2. MP3 업로드 → 마스터링 시작 → 다운로드

**404가 나올 때**

- `curl -sI http://127.0.0.1:3001/` → 200이 아니면: `bash deploy/run-on-server.sh` 로 빌드·PM2 재시작
- 3001은 정상인데 브라우저만 404: Nginx가 `/mastering/` 을 5000으로 보내는 상태 → 아래 블록 반영 후 `sudo nginx -t && sudo systemctl reload nginx`
- VenySound 최신 코드에는 `/mastering` Express 프록시 폴백이 있음 — `pm2 restart venysound` 후에도 Nginx 수정 권장

---

## 5. 메인 VenySound 배포와의 관계

- `venysound` PM2(5000): 기존과 동일 — `git pull` → `npm run build` → `pm2 restart venysound`
- `mastering-app` PM2(3001): **mp3mastering 저장소**에서 별도 갱신
- DB·스키마 변경 없음 (`db:deploy` 불필요)
