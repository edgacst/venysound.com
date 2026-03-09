# 플레이스토어 등록 기획 — Veny Sound

**구현 완료:** manifest 보강, `/.well-known/assetlinks.json` 라우트, TWA 설정 가이드(`docs/twa-setup.md`), `npm run twa:init` 스크립트.  
실제 TWA 프로젝트 생성 및 Play Console 업로드는 아래 5~9절과 `docs/twa-setup.md`를 따르면 됩니다.

## 1. 현재 상태 정리

| 항목 | 내용 |
|------|------|
| 서비스 | Veny Sound (음악 공유·스트리밍·라디오) |
| 앱 형태 | 웹앱 (Vite + React), PWA manifest 있음 |
| 도메인 | https://venysound.com |
| 버전 | package.json 기준 1.0.0 |

**결론:** 네이티브 Android/iOS 앱이 아니라 **웹앱을 플레이스토어에 올리는** 방식이 필요합니다.

---

## 2. 등록 방식 선택

### 옵션 A: TWA (Trusted Web Activity) — 권장

| 장점 | 단점 |
|------|------|
| 기존 웹/백엔드 그대로 사용 | Play Store 정책·심사 준수 필요 |
| 별도 앱 코드 거의 없음 | “웹뷰 앱”으로 보일 수 있음 |
| 빌드·배포 단순 (Android만 해도 충분) | |
| 유지보수 부담 적음 | |

- **동작:** 앱 아이콘 탭 시 Chrome 기반 뷰에서 `https://venysound.com` 로드.
- **도구:** Google의 [Bubblewrap](https://github.com/GoogleChromeLabs/bubblewrap)으로 TWA Android 프로젝트 생성 후 빌드.

### 옵션 B: Capacitor (또는 Cordova)

- 웹 빌드 결과물을 네이티브 셸로 감싸서 APK/AAB 생성.
- 푸시 알림·파일 저장 등 네이티브 API가 꼭 필요할 때 고려. 현재는 TWA로도 가능.

**권장:** 먼저 **TWA로 1.0 출시** 후, 네이티브 기능 필요 시 Capacitor 전환 검토.

---

## 3. 버전 전략

| 구분 | 권장 값 | 비고 |
|------|---------|------|
| **앱 버전명 (사용자에게 보임)** | `1.0.0` | 웹과 동일해도 무방 |
| **versionCode (Android 내부)** | `1` | 매 출시마다 반드시 1씩 증가 |
| **다음 업데이트** | `1.0.1` / versionCode `2` | 패치 시 |

- 나중에 웹과 앱 배포 주기가 달라지면, 앱만의 버전 체계(예: 1.0.0 → 1.0.1)를 두고 versionCode만 꼭 올리면 됨.

---

## 4. 사전 준비 체크리스트

### 4.1 Google Play Console

- [ ] 개발자 계정 생성 (등록비 1회 약 $25)
- [ ] 앱 생성 (예: 패키지명 `com.venysound.app` 또는 `com.edgarcst.venysound`)

### 4.2 PWA 요구사항 (TWA 필수)

- [ ] **HTTPS** — venysound.com 이미 적용된 것으로 가정
- [ ] **manifest.json** — `client/public/manifest.json` 있음. 아래 5.1에서 보강
- [ ] **Service Worker** — 선택이지만 설치/오프라인 경험을 위해 있으면 유리. 없어도 TWA는 가능
- [ ] **Digital Asset Links** — TWA에서 “내 앱이 이 웹을 열 권한이 있다”고 증명하는 용도. **필수**

### 4.3 법·정책

- [ ] 개인정보처리방침 URL (이미 있다면 URL만 등록)
- [ ] 이용약관 (이미 반영됨)
- [ ] 앱 권한 설명: 마이크(라디오/DJ), 저장소(캐시/다운로드) 등 사용 시 스토어 설명란에 명시

---

## 5. 구현·설정 작업

### 5.1 PWA manifest 보강 (Play 기준)

`client/public/manifest.json`에 다음을 맞추면 됩니다.

- **name / short_name:** 현재대로 사용 가능.
- **start_url:** `https://venysound.com/` (절대 URL 권장).
- **icons:** Play는 **최소 512x512**, 권장 192x192·512x512.  
  현재: `favicon.png`에 192x192 512x512 명시 — 512 아이콘 파일이 실제로 있는지 확인.
- **display:** `standalone` 유지.
- **scope:** `https://venysound.com/` 등으로 명시하면 더 명확.

(필요 시 `manifest.json`에 `scope`, `start_url` 절대 URL 추가하는 단계를 별도 작업으로 두면 됨.)

### 5.2 Digital Asset Links (TWA 핵심)

1. Play Console에서 앱 등록 후 **앱 서명 키** 확인 (Google 관리 키 사용 시 SHA-256 fingerprint 확인).
2. 다음 파일을 **실제로** `https://venysound.com/.well-known/assetlinks.json` 에서 내려받을 수 있게 배포.

```json
[
  {
    "relation": ["delegate_permission/common.handle_all_urls"],
    "target": {
      "namespace": "android_app",
      "package_name": "com.venysound.app",
      "sha256_cert_fingerprints": [
        "XX:XX:...실제_앱_서명_SHA256..."
      ]
    }
  }
]
```

- `package_name`: Play에서 만든 앱 패키지명과 동일.
- `sha256_cert_fingerprints`: Play Console 앱 서명 정보에서 복사.
- 서버에서 `/.well-known/assetlinks.json` 요청 시 이 JSON을 `Content-Type: application/json`으로 응답하도록 설정 필요.

### 5.3 TWA Android 프로젝트 생성 (Bubblewrap)

1. Node 18+ 환경에서:
   ```bash
   npm install -g @bubblewrap/cli
   bubblewrap init --manifest=https://venysound.com/manifest.json
   ```
2. 프롬프트에서:
   - **Package name:** `com.venysound.app` (또는 회사 도메인 역순)
   - **App name:** Veny Sound
   - **Launcher name:** Veny Sound
   - **Signing key:** 새로 생성하거나 기존 keystore 경로 지정
3. 생성된 프로젝트에서:
   ```bash
   bubblewrap build
   ```
4. 출력되는 **AAB**(Android App Bundle)를 Play Console에 업로드.

- **versionCode:** `twa-manifest.json`(또는 해당 설정 파일)의 `versionCode`를 매 출시마다 1 증가.

---

## 6. 스토어 등록 시 입력 요약

| 항목 | 예시 |
|------|------|
| 앱 이름 | Veny Sound |
| 짧은 설명 (80자) | 음악 공유, 음원 스트리밍, 실시간 라디오. 아티스트와 리스너를 연결하는 플랫폼. |
| 전체 설명 (4000자 이내) | 현재 웹 메타 설명 + 주요 기능(업로드, 스트리밍, 라디오, 커뮤니티 등) 정리 |
| 카테고리 | 음악 및 오디오 |
| 콘텐츠 등급 | 만 12세 이상 또는 전연령 (음악·소셜 기능에 따라 선택) |
| 연락처 이메일 | 지원용 이메일 (개인정보처리방침과 동일해도 무방) |
| 아이콘 | 512x512 PNG (투명 배경 가능) |
| 기능 그래픽(선택) | 1024x500 등 스토어용 배너 |

---

## 7. 단계별 일정 제안

| 단계 | 작업 | 예상 |
|------|------|------|
| 1 | Play Console 계정·앱 생성, 패키지명·서명 키 확인 | 1일 |
| 2 | manifest 보강, assetlinks.json 작성·배포, 동작 확인 | 1~2일 |
| 3 | Bubblewrap로 TWA 프로젝트 생성, AAB 빌드 | 1일 |
| 4 | 스토어 목록(설명·스크린샷·아이콘) 작성 | 1~2일 |
| 5 | AAB 업로드, 심사 제출 | 즉시 |
| 6 | 심사 대기·수정 반영 | 3~7일 (Google 정책에 따름) |

---

## 8. 버전 정리 (첫 출시)

- **앱 버전명:** `1.0.0`
- **versionCode:** `1`
- **출시 트랙:** 테스트용은 내부/비공개 테스트, 정식은 프로덕션 트랙.

이후 업데이트 시:

- 버전명: `1.0.1`, `1.1.0` 등 자유.
- **versionCode:** 2, 3, … 반드시 이전보다 크게.

---

## 9. 참고 링크

- [TWA 문서](https://developer.chrome.com/docs/android/trusted-web-activity/)
- [Bubblewrap](https://github.com/GoogleChromeLabs/bubblewrap)
- [Digital Asset Links](https://developer.android.com/training/app-links/verify-android-applinks)
- [Play Console 앱 서명](https://support.google.com/googleplay/android-developer/answer/9842756)

이 문서는 `docs/play-store-registration-plan.md`에 두고, 진행 시 체크리스트를 갱신하면 됩니다.
