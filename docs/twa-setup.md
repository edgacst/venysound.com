# TWA(Trusted Web Activity) 설정 — Play Store 출시

이 문서는 Veny Sound 웹앱을 Android 앱으로 패키징해 Play Store에 올리기 위한 단계입니다.  
**기존 웹 서비스(venysound.com)는 그대로 두고**, 별도 Android 프로젝트만 추가합니다.

---

## 1. 사전 준비

- [ ] Play Console 개발자 계정 있음
- [ ] Node.js 18+
- [ ] 프로덕션에 manifest 반영·배포 완료 (`start_url`, `scope` 포함된 상태로 배포)

---

## 2. Bubblewrap으로 TWA 프로젝트 생성

### 2.1 CLI 설치

```bash
npm install -g @bubblewrap/cli
```

### 2.2 프로젝트 초기화

**방법 A — npm 스크립트 (권장)**  
프로젝트 루트에서 한 번만 실행하면 `android-twa` 폴더가 생성되고 bubblewrap 초기화가 시작됩니다.

```bash
npm run twa:init
```

**방법 B — 직접 실행**  
원하는 폴더에서:

```bash
bubblewrap init --manifest=https://venysound.com/manifest.json
```

프롬프트 예시:

| 질문 | 권장 입력 |
|------|-----------|
| Package ID | `com.venysound.app` (또는 `com.edgarcst.venysound`) |
| App name | Veny Sound |
| Launcher name | Veny Sound |
| Signing key | 새로 생성 선택 시 비밀번호 입력 후 keystore 파일 경로 확인 |

생성이 끝나면 `twa-manifest.json`이 포함된 Android 프로젝트가 현재 디렉터리에 생성됩니다.  
**이 프로젝트를 별도 폴더로 옮기려면** 초기화 전에 빈 폴더를 만들고 그 안에서 실행하세요.

```bash
mkdir android-twa
cd android-twa
bubblewrap init --manifest=https://venysound.com/manifest.json
```

### 2.3 앱 서명 SHA-256 확인

빌드 후 AAB를 Play Console에 올리면, Google이 앱 서명 인증서를 제공합니다.

1. Play Console → 해당 앱 → **설정** → **앱 무결성**
2. **앱 서명 키 인증서**에서 **SHA-256 인증서 지문** 복사

(처음 업로드 시 Google이 서명을 관리하는 경우, 업로드 키가 아니라 **앱 서명 키**의 SHA-256을 사용합니다.)

---

## 3. Digital Asset Links (assetlinks.json)

TWA가 venysound.com을 열 수 있도록, 서버에서 이미 다음 경로를 지원합니다:

- `GET https://venysound.com/.well-known/assetlinks.json`

**동작 조건:** 환경 변수 `TWA_PACKAGE_NAME`과 `TWA_SHA256_FINGERPRINT`가 설정된 경우에만 JSON을 반환합니다.  
미설정 시 404를 반환하므로, 기존 서비스에는 영향 없습니다.

### 3.1 설정 방법

1. 프로덕션 서버의 `.env`에 추가:

   ```env
   TWA_PACKAGE_NAME=com.venysound.app
   TWA_SHA256_FINGERPRINT=XX:XX:XX:...   # Play Console에서 복사한 SHA-256
   ```

2. 여러 인증서(예: 디버그/릴리즈)를 쓰는 경우 쉼표로 구분:

   ```env
   TWA_SHA256_FINGERPRINT=AA:BB:..., CC:DD:...
   ```

3. 서버 재시작 후 확인:

   ```bash
   curl -s https://venysound.com/.well-known/assetlinks.json
   ```

   JSON 배열이 나오면 정상입니다.

---

## 4. AAB 빌드 및 업로드

TWA 프로젝트 디렉터리에서:

```bash
bubblewrap build
```

생성된 **AAB** 파일을 Play Console에 업로드합니다.

- **버전:** 첫 출시 시 `versionCode` 1, 버전명 `1.0.0` 권장
- 이후 업데이트마다 `versionCode`를 1씩 증가

---

## 5. 현재 서비스 영향 요약

| 항목 | 영향 |
|------|------|
| manifest.json | `start_url`/`scope`만 절대 URL로 보강. 기존 동작과 호환 |
| /.well-known/assetlinks.json | env 미설정 시 404. 설정 시에만 TWA용 JSON 반환 |
| 웹 사이트·API | 변경 없음 |
| TWA Android 프로젝트 | 별도 디렉터리·빌드. 기존 코드/배포와 분리 |

즉, **지금 서비스에는 지장 없이** TWA와 Play 등록만 추가된 상태입니다.
