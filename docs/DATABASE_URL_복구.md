# DATABASE_URL 복구 방법

프로젝트 문서에서 **서버 DB 접속 정보**가 확인되었습니다.

---

## 1. 확인된 정보 (docs/DEPLOY-CHECKLIST.md, script/migrations/README.md)

- **DB 사용자:** `venysound`
- **DB 비밀번호:** `veny2024db`
- **DB 이름:** `venysounddb`
- **포트:** `5432`
- **서버 앱 경로:** `/var/www/venysound/app` (VPS에서 앱이 이 경로에서 실행됨)

서버 **안**에서는 주소가 아래와 같습니다.
```
postgresql://venysound:veny2024db@localhost:5432/venysounddb
```

---

## 2. 서버에서 실제 .env 확인 (가장 확실한 방법)

**VPS(호스팅)에 SSH로 접속**할 수 있다면, 서버에 있는 `.env`를 보면 됩니다.

1. Hostinger(또는 사용 중인 VPS)에서 **SSH 접속 정보** 확인 (아이디, 비밀번호 또는 키).
2. 터미널에서 접속 예:
   ```bash
   ssh root@서버IP
   ```
   (또는 호스팅에서 안내한 사용자명/포트 사용)
3. 접속 후 실행:
   ```bash
   cat /var/www/venysound/app/.env | grep DATABASE_URL
   ```
4. 출력된 **한 줄 전체**를 복사해서 로컬 PC의 `.env`에 넣으면 됩니다.

이렇게 하면 **서버와 동일한 DB 주소**를 그대로 쓰게 됩니다.  
(서버에서는 `localhost:5432`로 접속하는 값일 수 있고, 로컬에서 쓰려면 아래 3번처럼 터널이 필요할 수 있습니다.)

---

## 3. 로컬 PC에서 “서버 DB”를 쓰고 싶을 때 (SSH 터널)

데이터는 **서버의 PostgreSQL**에 있고, 로컬 앱이 그 DB를 보려면 **SSH 터널**을 쓰는 방법이 안전합니다.

1. **서버 IP** 확인 (Hostinger 대시보드 등).
2. 로컬 터미널에서 **한 번만** 실행 (끄지 말고 켜 두기):
   ```bash
   ssh -L 5432:localhost:5432 root@서버IP
   ```
   (실제 사용하는 SSH 사용자명으로 `root` 부분을 바꿀 수 있음)
3. `.env`의 DATABASE_URL을 아래로 설정:
   ```
   DATABASE_URL=postgresql://venysound:veny2024db@127.0.0.1:5432/venysounddb
   ```
4. 앱 실행: `npm run dev`

이렇게 하면 로컬 5432 포트가 서버의 Postgres로 연결되어, **서버와 같은 데이터**를 로컬에서 볼 수 있습니다.

---

## 4. 서버 IP / SSH를 모를 때

- **Hostinger** 사용 시: 로그인 → VPS 선택 → **SSH 접속 정보** 또는 **서버 IP** 메뉴에서 확인.
- 다른 호스팅이면: “SSH 접속”, “서버 IP” 로 안내된 곳에서 확인.

---

## 5. 요약

- **데이터가 있는 DB**는 **VPS 서버 위의 PostgreSQL**입니다.
- 서버 주소를 “모른다” = **그 VPS의 IP**와 **SSH(또는 .env를 볼 수 있는 방법)**만 알면 됩니다.
- 가장 확실한 방법: **SSH로 서버 접속 → `cat /var/www/venysound/app/.env | grep DATABASE_URL`** 로 값을 확인한 뒤, 그 값을 로컬 `.env`에 넣기.
- 로컬에서 같은 DB를 보려면: **SSH 터널**을 켜고 `DATABASE_URL=postgresql://venysound:veny2024db@127.0.0.1:5432/venysounddb` 사용.

이 파일은 나중에 또 잊어버리지 않도록 프로젝트에 둔 것입니다. 필요하면 `docs/DATABASE_URL_복구.md` 를 참고하세요.
