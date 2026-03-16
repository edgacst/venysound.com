# AI 음악 생성 API 연동 (AIMusicAPI)

우리 사이트 `/create-music` 페이지에서 음악을 생성하려면 **AIMusicAPI** 키를 발급받아 서버에 설정하면 됩니다.

---

## 1. API 키 발급

1. **가입**  
   [https://aimusicapi.ai/](https://aimusicapi.ai/) 에서 회원가입

2. **플랜 선택**  
   - 테스트용: **Standard** 또는 **Pro** 플랜 구독  
   - 요청 1회 = 10 크레딧 = **$0.08** (예: 100회 ≈ $8)

3. **API 키 복사**  
   - 로그인 → **Dashboard** → **API Keys**  
   - 키 복사 (클라이언트/공개 저장소에 노출하지 말 것)

---

## 2. 프로젝트에 설정

1. **루트의 `.env`** 에 추가 (`.env.example` 참고):

   ```env
   AIMUSICAPI_API_KEY=여기에_복사한_API_키_입력
   ```

2. **서버만 사용**  
   API 키는 **서버 환경 변수**로만 두고, 브라우저에서는 우리 서버 API(`/api/ai-music/...`)만 호출하도록 구현합니다.

---

## 3. API 사용 방식 (참고)

- **문서**: [docs.aimusicapi.ai](https://docs.aimusicapi.ai/)
- **인증**: `Authorization: Bearer YOUR_API_KEY`
- **Sonic(음악 생성)**  
  - 생성: `POST https://api.aimusicapi.ai/api/v1/sonic/create`  
  - 결과 조회: `GET https://api.aimusicapi.ai/api/v1/sonic/task/{task_id}`  
  - 15~25초마다 폴링하여 `state === "succeeded"` 일 때 결과 사용
- **Producer**  
  - 생성: `POST https://api.aimusicapi.ai/api/v1/producer/create`  
  - 작업 조회: `GET https://api.aimusicapi.ai/api/v1/producer/task/{task_id}`

크레딧은 계정 하나로 Sonic·Producer 공용입니다.

---

## 4. "Your MusicAPI API key is incorrect" 나올 때

1. **서버 재시작** 후 터미널 로그 확인  
   - `[aimusic] API key 설정됨 (길이 42)` 처럼 **길이**가 보이면 키는 로드된 것. (보통 40~50자 전후)  
   - `[aimusic] API key 없음` 이면 `.env` 변수명이 `AIMUSICAPI_API_KEY` 인지, 해당 줄에 키가 있는지 확인.

2. **키 값 직접 테스트 (PowerShell)**  
   대시보드에서 **Copy** 버튼으로 키 복사 후, 아래에서 `YOUR_API_KEY` 자리에 붙여넣고 실행.  
   성공하면 크레딧 잔액 JSON이 나옵니다. 실패하면 키 자체가 잘못된 것.

   ```powershell
   curl -X GET "https://api.aimusicapi.ai/api/v1/get-credits" -H "Authorization: Bearer YOUR_API_KEY"
   ```

3. **.env 작성 시**  
   - 변수명: `AIMUSICAPI_API_KEY` (오타 없이)  
   - `=` 뒤에 **공백 없이** 키만 붙여넣기.  
   - Windows에서는 줄 끝에 `\r` 이 붙을 수 있으므로, 위 curl이 성공하는 **같은 키**를 그대로 .env 한 줄에 넣고 저장 후 서버 재시작.

4. **그래도 401이면**  
   대시보드에서 **+ Create API Key** 로 새 키를 만들고, 생성 직후 표시되는 전체 키를 복사해 `.env`에 넣어 다시 시도.

---

## 5. 구현 단계 (서버·클라이언트)

1. **서버**  
   - `AIMUSICAPI_API_KEY` 가 있으면 `POST /api/ai-music/create` 등 프록시 라우트 추가  
   - 요청 바디(프롬프트, 옵션) 받아서 AIMusicAPI로 전달  
   - `task_id` 받아서 폴링 또는 웹훅으로 완료 시 오디오 URL/파일 반환

2. **클라이언트**  
   - `/create-music` 페이지에서 프롬프트 입력 후 우리 서버 `POST /api/ai-music/create` 호출  
   - 진행 상태 표시 → 완료 시 재생·다운로드·업로드 버튼 제공

3. **정책**  
   - 로그인 필수 여부  
   - 크레딧 차감: 우리 사이트 크레딧과 연동할지, AIMusicAPI 크레딧만 쓸지 결정

---

요약: **aimusicapi.ai 가입 → 플랜 구독 → API Keys에서 키 복사 → `.env`에 `AIMUSICAPI_API_KEY` 설정** 하면, 이후 서버에 프록시 API를 붙여 `/create-music`에서 사용할 수 있습니다.
