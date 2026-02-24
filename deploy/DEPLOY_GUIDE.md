# venysound.com 배포 가이드

---

## 비개발자용 – 업데이트만 할 때 (이것만 하세요)

코드만 바꿔서 **사이트를 새 버전으로 올리고 싶을 때**는 아래만 하면 됩니다.  
(처음 서버 세팅은 이미 되어 있다고 가정합니다.)

### 지금 Git에 푸시해 놓고 업데이트만 못 하고 있을 때

GitHub에는 올려 뒀는데 **서버(사이트)에는 아직 반영이 안 된 상태**라면, **서버에 SSH 접속해서 아래만 실행**하면 됩니다.

**배포 폴더** (앱은 **venysound 하나만** 사용합니다. `/var/www/venysound` 또는 실제로 쓰는 앱 디렉터리 한 곳에서만 실행하세요.)

```bash
cd /var/www/venysound && git pull && npm install --omit=dev && npm run build && pm2 restart venysound
```

- `pm2 restart all` 대신 `pm2 restart venysound` 로 서비스 앱만 재시작하는 것을 권장합니다.

**3) `pm2 restart all` 했는데 “재시작할 프로세스 0개” 라고 나오면**  
앱이 꺼져 있는 상태이므로, **한 번 다시 켜기**까지 해야 합니다. 같은 폴더에서:

```bash
pm2 start ecosystem.config.cjs --env production
pm2 save
```

끝나면 브라우저에서 사이트 새로고침해서 새 버전이 보이는지 확인하면 됩니다.

---

### GitHub에 푸시한 경우 (가장 흔함)

1. **로컬에서** 코드 수정 후 **GitHub에 푸시** (이미 하셨다면 이 단계는 끝).
2. **서버(Hostinger)에 SSH로 접속**한 뒤, 터미널에서 **위 “지금 Git에 푸시해 놓고…”** 의 1) 또는 2) 한 줄 실행.

- **배포 경로가 다르면** (예: 앱이 `/var/www/venysound/app` 에 있으면) `cd` 뒤 경로만 실제 경로로 바꾸면 됩니다.
- **`pm2 restart all` 해도 재시작될 프로세스가 0개**라면 위 3) 번대로 `pm2 start` 후 `pm2 save` 하세요.
- `git pull` 이 GitHub에서 방금 푸시한 코드를 서버로 가져옵니다.  
- 끝나면 **새 버전으로 반영**된 겁니다.  
- 이때 **몇 초~几十 초** 사이트가 잠깐 멈췄다가 다시 뜰 수 있습니다. 정상입니다.

**정리:** GitHub 푸시 → 서버 SSH 접속 → 위 1) 또는 2) 한 줄 실행. (PM2가 꺼져 있으면 3)까지.)

---

### 파일을 직접 서버로 올리는 경우

GitHub을 쓰지 않고 **파일만** 서버에 올릴 때:

- **방법 A** – **FileZilla**로 서버 접속 후, 로컬 `venysound` 폴더 전체를 서버 `/var/www/venysound/` 에 덮어쓰기.  
- **방법 B** – 로컬 터미널에서 (`서버IP` 를 실제 IP로 바꾸기):

  ```bash
  rsync -avz --exclude='node_modules' --exclude='.git' --exclude='dist' --exclude='local-uploads' ./ root@서버IP:/var/www/venysound/
  ```

그다음 **서버** 터미널에서 (git pull 없이):

```bash
cd /var/www/venysound && npm install --omit=dev && npm run build && pm2 restart all
```

### 뭐가 뭔지 (용어 한 줄 정리)

| 말 | 뜻 (한 줄) |
|----|------------|
| **Hostinger** | 서버(컴퓨터)를 빌려주는 회사. 그 서버에 우리 사이트가 돌아갑니다. |
| **서버 / VPS** | 24시간 켜져 있는 컴퓨터. 여기에 venysound 사이트 코드가 설치되어 있습니다. |
| **배포** | “수정한 코드를 서버에 올리고, 사이트가 새 버전으로 보이게 하는 것” |
| **PM2** | 서버 안에서 “우리 사이트 프로그램을 켜 두고, 꺼지면 다시 켜 주는” 도구. `pm2 restart` = 프로그램 한 번 재시작. |
| **Nginx** | 인터넷에서 들어온 요청(사이트 접속)을 우리 사이트 프로그램으로 넘겨 주는 문지기. |
| **SSH** | 내 컴퓨터에서 서버 컴퓨터 안으로 들어가서 명령을 치는 방법. Hostinger 패널에서 “터미널”로 들어가면 됩니다. |

---

## Hostinger 말고 더 쉽게 배포하는 방법 (다른 곳)

Hostinger VPS는 SSH, Nginx, PM2, 포트 스위칭 등을 직접 해야 해서 부담스럽다면, **GitHub만 연결하면 푸시할 때마다 자동으로 배포해 주는 서비스**를 쓰면 훨씬 수월합니다. 아래는 그런 서비스들입니다.

| 서비스 | 쉬운 점 | 참고 |
|--------|---------|------|
| **Render** (render.com) | 가입 후 “Web Service” + “PostgreSQL” 만들고 GitHub 연결 → 푸시 시 자동 배포. | 무료 플랜 있음. 파일 저장은 Render Disk(유료) 또는 S3 연동. |
| **Railway** (railway.app) | GitHub 연결 후 푸시하면 자동 배포. DB·Volume 추가 쉬움. | 무료 크레딧. Volume으로 업로드 폴더 유지 가능. |
| **Fly.io** (fly.io) | GitHub 연동, 푸시 시 자동 배포. 전 세계 엣지. | 무료 티어 있음. `fly volumes` 로 디스크 유지. |
| **Koyeb** (koyeb.com) | GitHub 연결 후 자동 배포. 웹 대시보드만으로 설정. | 무료 플랜 있음. |
| **Zeabur** (zeabur.com) | GitHub 연결 후 자동 배포. 한국어 문서·커뮤니티 있음. | 사용량 기반 과금. |
| **DigitalOcean App Platform** (digitalocean.com) | GitHub 연결 후 자동 빌드·배포. Managed DB 선택 가능. | 유료부터. |
| **Northflank** (northflank.com) | GitHub 연동, 자동 배포. DB·스토리지 추가 가능. | 무료 티어 있음. |

**Render 말고 쓰고 싶을 때**  
- **Railway** · **Fly.io** · **Koyeb** · **Zeabur** 모두 “GitHub 연결 → Build/Start 명령·환경 변수 넣기” 면 됩니다.  
- Node + PostgreSQL 지원하고, 푸시 시 자동 배포되는 점은 같습니다.  
- 음원 등 **파일 보존**이 필요하면 각 서비스의 **Volume/디스크** 기능을 쓰거나, 나중에 S3 등으로 바꾸면 됩니다.

**공통으로 할 일:**  
- 해당 사이트 가입 → “새 앱 / New Web Service” 등에서 **GitHub 저장소 선택** (edgacst/venysound.com 등).  
- **Build 명령:** `npm install && npm run build`  
- **Start 명령:** `npm start`  
- **환경 변수**는 지금 `.env` 에 있는 것들을 대시보드 “Environment”에 그대로 넣기.  
- **DB**는 각 서비스가 제공하는 PostgreSQL을 만들고, 주소를 `DATABASE_URL` 로 넣으면 됩니다.

**파일(음원 업로드) 처리:**  
- Render / Railway / App Platform 모두 **재배포 시 기본 디스크는 비워질 수 있음.**  
- **Railway**는 Volume을 붙여서 특정 폴더(예: `local-uploads`)를 유지할 수 있음.  
- **Render**는 Render Disk(유료) 또는 나중에 S3/GCS 연동으로 바꾸는 방법이 있음.

정리하면, **“배포가 쉽다”** 는 목적만 보면 **Render** 또는 **Railway**가 Hostinger VPS보다 훨씬 수월합니다. GitHub 푸시만 하면 되고, SSH·Nginx·PM2는 신경 쓰지 않아도 됩니다.

---

## Render에 배포해도 되나? (가능합니다)

**네, Render에 배포해도 됩니다.** SSH·Nginx·PM2 없이 웹에서 설정만 하면 되고, GitHub 연동 시 푸시할 때마다 자동 배포됩니다.

### 할 일 요약

1. **Render** (https://render.com) 에서 **Web Service** 하나, **PostgreSQL** 하나 만든 뒤 서로 연결.
2. **환경 변수** – 지금 `.env` 에 있는 값들(DATABASE_URL, SESSION_SECRET, OAuth, 토스, 계좌 등)을 Render 대시보드 **Environment**에 그대로 입력.
3. **Build 명령:** `npm install && npm run build`  
   **Start 명령:** `npm start`  
   (Render가 `PORT`는 자동으로 넣어 줍니다.)
4. **업로드 파일(음원 등)** – Render는 재시작·재배포 시 **디스크가 비워집니다.**  
   - **방법 A** – **Render Disk**(유료)를 붙여서 `local-uploads` 같은 경로를 디스크에 매핑하면, 지금처럼 로컬 폴더에 저장하는 방식 유지 가능.  
   - **방법 B** – 나중에 AWS S3나 Google Cloud Storage 같은 **클라우드 저장소**로 바꾸면, Render Disk 없이도 안정적으로 파일 보관 가능. (코드 수정 필요.)

### Hostinger와 비교

| | Hostinger VPS | Render |
|--|----------------|--------|
| **난이도** | SSH, Nginx, PM2 직접 관리 | 웹 대시보드에서 설정만 |
| **배포** | 서버에 SSH → `git pull` 후 한 줄 실행 | GitHub 푸시하면 자동 배포 |
| **비용** | VPS 월 약 5,000원대 | 무료 플랜 있음, DB·디스크 쓰면 유료 |
| **파일 저장** | 서버 디스크에 그대로 저장 | 기본은 휘발성 → Disk 추가 또는 S3 등 필요 |

정리하면, **Render로 옮겨도 되고**, 특히 “GitHub 푸시만 하면 배포 끝”이 되니까 비개발자에게는 더 단순할 수 있습니다. 다만 **음원·업로드 파일**을 잃지 않으려면 Render Disk를 쓰거나, 앞으로 S3/GCS 연동을 한 번 도입하는 게 좋습니다.

---

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

## Blue-green 말고 단순 배포만 할 때 (추천)

**Blue-green(5000/5001 스위칭)을 쓰다가 서비스가 두 번씩 다운됐다면**, 그 방식은 당장 쓰지 말고 **한 포트만 쓰는 단순 배포**로 가는 게 안전합니다.

**단순 배포란**
- **앱은 5000 포트 하나만** 띄움. (5001은 안 씀.)
- **Nginx는 항상 5000만** 보게 설정해 두고, **절대 바꾸지 않음.**
- 배포할 때마다: 서버에서 `git pull` → `npm run build` → `pm2 restart all` **한 번만** 실행.

**단점**  
- 재배포하는 **10~30초 동안** 사이트가 잠깐 멈췄다가 다시 뜹니다. (한 번만 멈추고 끝.)

**장점**  
- 포트 스위칭·Nginx upstream 불일치로 인한 **서비스 다운이 없음.**  
- 실수할 여지가 적어서, Blue-green 때문에 미칠 일이 없습니다.

**지금 Nginx가 5001을 보고 있다면**  
→ 한 번만 5000으로 되돌려 두면 됩니다. (이후에는 스위칭 안 함.)

```bash
sudo /root/switch-to-port.sh 5000
```

**이후 배포**  
- 위 “지금 Git에 푸시해 놓고…” 에 있는 **1) 또는 2) 한 줄**만 실행하면 됩니다.  
- 5001, 스위칭 스크립트, safe-switch 는 **신경 쓰지 않아도 됩니다.**

### 신버전은 안 뜨고 구버전만 둘 다 떠 있어서 에러 나는 경우

**원인:**  
앱을 **두 군데**(또는 두 포트)에서 띄워 놓고, **신버전은 안 올리고** 둘 다 예전 코드로만 돌리다 보니, 서로 충돌하거나 Nginx가 잘못된 쪽을 보면서 에러가 납니다.

**해결:**  
- **앱은 한 군데(한 포트)만** 띄웁니다.  
- **배포할 때도 그 한 군데에서만** `git pull` → `npm run build` → `pm2 restart` 를 합니다.  
  → 그러면 **그 한 개가 곧 신버전**이 됩니다. 구버전이랑 둘 다 떠 있을 일이 없습니다.

**지금 할 일 (한 번만 정리):**

1. **PM2에서 앱이 몇 개 떠 있는지 확인**
   ```bash
   pm2 list
   ```
2. **한 개만 남기고 나머지는 끄기**  
   - 5000만 쓸 거면, **venysound**만 남기고 green/5001용 앱은 중지합니다.  
     ```bash
     pm2 stop venysound-green
     pm2 save
     ```
     (이름이 `venysound-5001` 이면 그 이름으로 stop. 필요하면 `pm2 delete venysound-green` 으로 목록에서 제거해도 됩니다.)
   - **배포 폴더도 하나만** 쓰기로 합니다. (`/var/www/venysound` 또는 실제 앱이 있는 디렉터리 한 곳에서만 pull·build·restart.)
3. **Nginx는 5000만 보게**
   ```bash
   sudo /root/switch-to-port.sh 5000
   ```
4. **이후 배포**  
   - 정한 **그 폴더 하나**에서만:  
     ```bash
     cd /var/www/venysound && git pull && npm install --omit=dev && npm run build && pm2 restart venysound
     ```

**정리:**  
신버전을 안 띄우고 구버전만 둘 다 띄우면 에러 난다 → **앱은 한 개만 띄우고, 그 한 군데만 “신버전으로 갱신”하면** 됩니다. 두 개 동시에 쓰지 말고, 한 개만 쓰고 그 한 개를 항상 최신으로 유지하세요.

---

## 무중단 배포 (5000/5001 스위칭) — 복잡함, 다운 나면 위 단순 배포로

서비스 중인 포트(**5000**)와 배포 검증용 포트(**5001**)를 번갈아 쓰면, 배포 중에도 기존 버전이 계속 서비스됩니다.  
**다만 포트·Nginx 설정을 잘못 건드리면 서비스가 내려갈 수 있어서**, 이미 Blue-green 때문에 다운을 겪었다면 **위 “Blue-green 말고 단순 배포만”** 을 쓰는 것을 권장합니다.

### 구조

- **5000**: 현재 사용자에게 서비스 중인 앱
- **5001**: 새 버전을 올려서 검증하는 포트 (확인 후 트래픽을 여기로 스위칭)

### 1. Nginx upstream 설정 (최초 1회)

서버에 `deploy/nginx-upstream.conf` 내용을 반영합니다.

```bash
# 로컬에서 서버로 복사
scp deploy/nginx-upstream.conf root@서버IP:/etc/nginx/sites-available/venysound.com
ssh root@서버IP "nginx -t && systemctl reload nginx"
```

- upstream에서 **한 포트만** `server 127.0.0.1:5000;` 또는 `server 127.0.0.1:5001;` 로 두고, 나머지는 `#` 로 주석 처리합니다.
- PM2로 **5000번**과 **5001번** 앱을 각각 띄워 두고, Nginx는 지금 서비스할 쪽 한 포트만 바라보게 합니다.

### 2. 배포 절차 (매 업데이트)

1. **지금 트래픽이 가는 쪽 확인**  
   - Nginx upstream이 5000을 보면 → 이번에는 **5001**에 배포  
   - Nginx upstream이 5001을 보면 → 이번에는 **5000**에 배포  

2. **비어 있는 쪽(스탑된 쪽)에 새 버전 배포**  
   - 해당 포트용 디렉터리/앱에 파일 올리고 `npm install --omit=dev`, `pm2 start` 또는 `pm2 restart venysound-5001` (또는 venysound-5000) 실행  

3. **동작 확인**  
   - `curl http://127.0.0.1:5001/` (또는 5000) 로 새 버전이 정상 응답하는지 확인  
   - 브라우저에서 필요한 페이지만 한 번 더 확인  

4. **스위칭**  
   - Nginx를 새 포트로 바꾼 뒤 reload  

   **방법 A – 스크립트 사용 (upstream에 5000/5001 두 줄이 있을 때)**  
   ```bash
   scp deploy/switch-to-port.sh root@서버IP:/root/
   ssh root@서버IP "chmod +x /root/switch-to-port.sh"
   # 트래픽을 5001로 넘기려면:
   ssh root@서버IP "sudo /root/switch-to-port.sh 5001"
   ```  

   **방법 B – 수동**  
   - `/etc/nginx/sites-available/venysound.com` 에서 upstream 안의 두 줄만 수정  
     (서비스할 포트는 `server 127.0.0.1:5000;` 또는 `server 127.0.0.1:5001;`, 나머지는 `#` 처리)  
   - `sudo nginx -t && sudo systemctl reload nginx`  

다음 배포 때는 반대 포트에 올리고, 확인 후 다시 스위칭하면 됩니다.

### 2-1. 왜 서버가 죽지 않는가 (안심 포인트)

- **업데이트 중에도 기존 앱(5000)은 그대로 떠 있습니다.** 트래픽은 계속 5000으로만 갑니다.
- 새 버전은 **다른 포트(5001)** 에서만 켜고, `curl`·브라우저로 확인한 뒤에 **그때서야** Nginx만 5001로 바꿉니다.
- 스위칭은 **Nginx 설정 한 번 바꾸고 reload** 뿐이라, 앱 프로세스를 죽이지 않습니다. 그래서 “서비스 서버가 죽는다”가 아니라 “트래픽을 새 포트로 넘긴다”에 가깝습니다.

### 2-2. 문제 생기면 바로 롤백 (1분 안에 복구)

스위칭 후 이상하면 **다시 이전 포트로만 돌리면** 됩니다. 앱 재시작·재배포 필요 없습니다.

```bash
# 지금 5001로 트래픽이 가 있는데 문제 있으면 → 5000으로 되돌리기
ssh root@서버IP "sudo /root/switch-to-port.sh 5000"
```

- Nginx만 5000으로 되돌리면, 사용자는 다시 **예전에 돌아가던 5000 앱**을 보게 됩니다.
- 새 버전(5001)은 그대로 두고 나중에 원인 파악 후 다시 스위칭해도 됩니다.

### 2-3. 스위칭 전 헬스 체크 (한 번 더 확인)

서버에 `GET /api/health` 가 있습니다. 스위칭 직전에 새 포트가 정상 응답하는지 확인하면 더 안전합니다.

**방법 A – 헬스 통과할 때만 스위칭 (추천)**  
`safe-switch.sh` 는 `/api/health` 가 200일 때만 스위칭하고, 실패하면 **스위칭하지 않고** 종료합니다.

```bash
scp deploy/safe-switch.sh deploy/switch-to-port.sh root@서버IP:/root/
ssh root@서버IP "chmod +x /root/safe-switch.sh /root/switch-to-port.sh"
# 5001로 넘기기 (5001이 정상일 때만 스위칭됨)
ssh root@서버IP "sudo /root/safe-switch.sh 5001"
```

**방법 B – 수동 확인 후 스위칭**  
직접 헬스 체크한 뒤 괜찮을 때만 `switch-to-port.sh` 를 실행할 수 있습니다.

```bash
curl -sf http://127.0.0.1:5001/api/health && echo " OK"
# OK 가 나온 뒤에만:
sudo /root/switch-to-port.sh 5001
```

- 실패하면 스위칭하지 말고, 해당 포트 로그(`pm2 logs`)를 보고 수정한 뒤 다시 시도하세요.

### 3. PM2로 5000/5001 두 개 띄우기

- 앱을 두 세트(예: `app-5000`, `app-5001`)로 두고, 각각 `PORT=5000`, `PORT=5001` 으로 기동  
- 또는 `ecosystem.config.cjs`에 앱을 두 개 정의 (name: `venysound-5000`, `venysound-5001`, env: PORT 5000/5001)  
- DB, `.env`, `local-uploads` 등은 두 앱이 같은 값을 보도록 공유하거나 심볼릭 링크로 맞춥니다.

### 3-1. 5001에서 테스트한 뒤 스위칭하기 (Hostinger, 단계별)

**목표:** 신버전이 5000에 바로 올라가서 에러 나는 게 걱정되니까, **5001에서 먼저 띄워 보고** 괜찮을 때만 Nginx를 5001로 바꾸고 싶은 경우.

**전제:**  
- **폴더 두 개**가 있어야 합니다.  
  - 하나는 **지금 서비스 중인 5000용** (예: `/var/www/venysound`),  
  - 하나는 **테스트용 5001** (예: `/var/www/venysound/app_new`).  
- Nginx upstream 설정에는 **5000**과 **5001** 두 줄이 다 있고, 지금은 **5000만** 주석 해제된 상태.  
- `switch-to-port.sh` / `safe-switch.sh` 는 서버 `/root/` 에 이미 있음.

**한 번만 할 초기 설정**

1. **5000 쪽만 서비스 중이게**  
   - Nginx가 5000을 보게: `sudo /root/switch-to-port.sh 5000`  
   - 5000 앱만 켜고, 5001 앱은 끄기: `pm2 stop venysound-5001` (있을 경우)

2. **5001용 폴더에서 앱을 5001 포트로 띄울 수 있게**  
   - 5001용 폴더(예: `app_new`)에서 `PORT=5001 pm2 start dist/index.mjs --name venysound-5001` 로 한 번 띄워 보거나,  
   - 또는 5001 전용 ecosystem 파일을 만들어서 `pm2 start ecosystem.5001.config.cjs` 처럼 쓰면 됩니다.  
   - (같은 서버에서 5000·5001 두 프로세스가 **다른 폴더**를 쓰면, 한쪽만 갱신해도 됨.)

**배포할 때마다 (신버전을 5001에서 테스트 후 스위칭)**

1. **5001용 폴더**로 가서 **신버전만** 올리기 (5000 폴더는 건드리지 않음).  
   ```bash
   cd /var/www/venysound/app_new
   git pull
   npm install --omit=dev
   npm run build
   ```
2. **5001 앱 재시작** (같은 폴더에서).  
   ```bash
   pm2 restart venysound-5001
   ```
   (처음이면 `PORT=5001 pm2 start dist/index.mjs --name venysound-5001` 로 켜기.)
3. **5001이 정상인지 확인**  
   ```bash
   curl -sf http://127.0.0.1:5001/api/health && echo " OK"
   ```  
   - OK가 나오면 브라우저로 `http://서버IP:5001` (또는 테스트용 URL) 한 번 더 확인.
4. **괜찮으면 Nginx만 5001로 바꾸기**  
   ```bash
   sudo /root/safe-switch.sh 5001
   ```  
   (또는 `sudo /root/switch-to-port.sh 5001`)
5. **사이트 접속해서** 신버전이 보이는지 확인.  
   - 문제 있으면 **바로 롤백:** `sudo /root/switch-to-port.sh 5000`

**다음 배포 때**  
- 그때는 **5000 쪽 폴더**에 신버전을 올리고, 5000 앱 재시작한 뒤, 테스트하고 Nginx를 **5000**으로 스위칭하면 됩니다. (5000 ↔ 5001 번갈아 가며 쓰는 방식.)

**정리:**  
Hostinger에서 “5001에서 테스트하고 스위칭”하려면, **5001용 폴더를 하나 두고, 그 폴더에서만 pull·build·restart 한 뒤** 5001 응답 확인하고 `safe-switch.sh 5001` 로 바꾸면 됩니다. 5000은 그대로 두면 되고, 스위칭 후에만 트래픽이 5001로 갑니다.

### 4. 포트 불일치 해결 (앱은 5000인데 Nginx는 5001을 보는 경우)

로그에 **“serving on port 5000”** 이 나오는데, Nginx는 5001을 바라보고 있으면 **사이트가 안 뜨거나 502 등**이 납니다. 아래 순서로 맞추면 됩니다.

**1단계: 앱이 실제로 어떤 포트에서 떠 있는지 확인**

```bash
pm2 status
# 로그에서 확인
pm2 logs --lines 30 | grep -i port
```

- 한 개만 떠 있다면 보통 **5000**입니다 (ecosystem에서 `PORT=5000`).

**2단계: Nginx가 지금 어떤 포트를 보는지 확인**

```bash
grep -A2 "upstream venysound_backend" /etc/nginx/sites-available/venysound.com
```

- `server 127.0.0.1:5000;` 이 주석 없이 있으면 → Nginx는 **5000**을 봄.  
- `server 127.0.0.1:5001;` 이 주석 없이 있으면 → Nginx는 **5001**을 봄.

**3단계: 둘을 맞추기**

- **앱이 5000에서만 떠 있는데 Nginx가 5001을 보고 있으면**  
  → 5001에는 아무것도 없으니 트래픽이 실패합니다.  
  **Nginx를 5000으로 되돌리세요.**

  ```bash
  sudo /root/switch-to-port.sh 5000
  ```

- **앱을 5001에서도 띄우고, 트래픽을 5001로 넘기려면**  
  → 5001 포트로 떠 있는 앱이 있어야 합니다.  
  ecosystem에서 `PORT=5001` 인 앱을 하나 더 띄우거나, 5001용으로 `pm2 start` 한 뒤,  
  그다음 `sudo /root/switch-to-port.sh 5001` 로 Nginx를 5001로 바꾸면 됩니다.

**정리:**  
- 한 포트만 쓸 때: **앱 포트 = Nginx upstream 포트** 로 맞추기.  
- 지금 앱이 5000이면 → `switch-to-port.sh 5000` 으로 Nginx를 5000에 맞추면 해결됩니다.

---

## Hostinger 검증 체크리스트

호스트너 서버에서 아래를 순서대로 실행해 보면 설정이 올바른지 확인할 수 있습니다. (로컬에서 실행할 때는 `ssh root@서버IP "명령어"` 형태로 넣으면 됩니다.)

### 1. Nginx 설정 확인

```bash
# upstream에 5000/5001 두 줄이 있는지 확인
grep -A2 "upstream venysound_backend" /etc/nginx/sites-available/venysound.com

# 문법 검사
nginx -t
```

- `server 127.0.0.1:5000;` 와 `server 127.0.0.1:5001;` 중 하나는 주석(`#`) 없이, 하나는 주석 처리되어 있어야 합니다.

### 2. PM2 앱 상태

```bash
pm2 status
```

- 5000 서비스 중이면: `venysound` 또는 5000 포트 앱이 **online**
- 5001 테스트용이면: 5001 포트 앱이 **online** 또는 **stopped** (스탑된 상태로 두고 배포 후 start 가능)

### 3. 포트 응답 확인

```bash
# 현재 서비스 중인 포트 (예: 5000)
curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:5000/

# 스탑된 쪽에 올릴 포트 (예: 5001) – 앱이 켜져 있을 때만 200
curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:5001/
```

- 서비스 중인 포트는 `200` 등 정상 코드가 나와야 합니다.
- 5001이 아직 스탑이면 `000` 또는 연결 실패가 나올 수 있습니다.

### 4. 스위칭 스크립트 확인

```bash
test -x /root/switch-to-port.sh && echo "OK" || echo "없거나 실행권한 없음"
cat /root/switch-to-port.sh | head -5
```

- `OK` 가 나오고, 첫 줄에 `5000 | 5001` 사용법이 있으면 됩니다.

### 5. 스위칭 테스트 (선택)

트래픽을 5001로 바꾼 뒤 바로 5000으로 되돌리는 식으로 동작만 확인할 수 있습니다.

```bash
sudo /root/switch-to-port.sh 5001
curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:5001/
sudo /root/switch-to-port.sh 5000
```

- 두 번 다 `Nginx upstream이 포트 ... 로 스위칭되었습니다.` 메시지가 나오면 정상입니다.

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
