# 라디오 방송국 재설계 (2026)

기존 송출실·채널 페이지의 복잡도와 이중 재생 문제를 줄이기 위한 **처음부터의 설계** 문서입니다.  
백업: `backups/radio-before-redesign-2026/`

---

## 1. 목표

- **DJ**: 곡 하나 선택 → "지금 재생" → 그 곡만 청취자에게 송출. (즉시 전환, 이중 재생 없음)
- **청취자**: 채널 페이지에서 재생 버튼 한 번 → 현재 송출 곡만 들림.
- **모니터**: DJ가 듣는 소리 = 청취자 스트림과 동일한 URL 하나만 사용.

---

## 2. 데이터/API (유지)

- 기존 API 그대로 사용.
  - `GET /api/radio/channels/live`, `GET /api/radio/channels/:slug`, `PATCH /api/radio/channels/:slug`
  - `GET /api/radio/channels/:slug/stream` (연속 스트림)
  - `GET /api/music/:id/stream` (단일 곡)
- DB: `radio_channels` (nowPlayingMusicId, nowPlayingStartedAt 등) 변경 없음.

---

## 3. 재설계 흐름

### 3.1 방송국 메인 (`/radio`)

- **역할**: 라이브 채널 목록, "내 채널 만들기".
- **변경 최소화**: 현재 `Radio.tsx` 유지하거나, 공지 배너 연동만 정리.

### 3.2 채널 페이지 (`/radio/:slug`) — 청취자

- **역할**: 채널 정보, **재생/일시정지 버튼 하나**, 채팅(선택), 신청곡(선택).
- **오디오**: `<audio src={채널_스트림_URL} />` **단일 엘리먼트**.  
  - URL: `/api/radio/channels/:slug/stream`  
  - 재생 정책: 사용자 제스처 후 `play()` 한 번만 호출.
- **표시**: 서버에서 받은 `nowPlayingMusicId` / 곡 정보로 "지금 재생 중: 제목" 표시.

### 3.3 송출실 (DJ) — 새로 단순화

- **진입**: 채널 페이지에서 "방송 스튜디오" 클릭 → **새 단순 송출실**로 이동.
- **URL**: `/radio-studio.html?slug=xxx` (또는 React 페이지 `/radio/:slug/studio`).
- **기능**:
  1. **방송 시작/종료**: `PATCH`로 `status: 'live' | 'ended'`.
  2. **곡 선택**: 사이트 음원 검색/목록 → 하나 선택.
  3. **지금 재생 (송출)**: `PATCH`로 `nowPlayingMusicId`, `nowPlayingStartedAt` 만 전송.  
     - 큐/플레이리스트 회전 없음. **선택한 곡 1개만** 현재 곡으로 설정.
  4. **모니터 재생**: `<audio src={채널_스트림_URL} />` 한 개.  
     - "모니터 재생" 버튼 = 사용자 제스처 후 `audio.play()`.  
     - 채널 스트림 = 서버가 `nowPlayingMusicId` 기준으로 **한 곡만** 스트리밍하도록 하거나, 기존 연속 스트림이어도 **DJ는 같은 URL**만 재생.

### 3.4 서버 스트림 동작 (선택 개선)

- **현재**: `/api/radio/channels/:slug/stream` 이 연속 스트림(곡 끝나면 다음 곡 이어서)으로 동작.
- **재설계 옵션**:
  - **A안**: 그대로 두고, DJ가 "지금 재생" 누를 때마다 **현재 곡 1개만** 보내도록 서버에서 로직 단순화 (다음 곡 자동 이어붙이기 제거).
  - **B안**: 청취자/DJ 모두 **단일 곡 URL**만 사용: `nowPlayingMusicId`가 있으면 `/api/music/:id/stream` 리다이렉트. 곡 바뀌면 클라이언트가 새 URL 로드.

초기 구현은 **A안 유지 + DJ UI만 단순화**로 진행하고, 필요 시 B안으로 스트림 API 단순화.

---

## 4. 구현 순서 제안

1. **송출실 단순화**: 새 HTML 또는 React 페이지.  
   - 방송 시작/종료, 곡 목록에서 선택 → "지금 재생", 모니터 재생(채널 스트림 URL 1개).
2. **채널 페이지**: 기존 `RadioChannel.tsx`에서 오디오 부분만 단일 `<audio>` + 단일 URL로 정리 (이중 재생 제거).
3. **스트림 API (선택)**: "현재 곡 1개만 스트리밍"으로 서버 쪽 단순화.

---

## 5. 파일 배치

| 구분 | 경로 | 비고 |
|------|------|------|
| 방송국 메인 | `client/src/pages/Radio.tsx` | 유지 또는 소폭 수정 |
| 채널 생성 | `client/src/pages/RadioCreate.tsx` | 유지 |
| 채널(청취자) | `client/src/pages/RadioChannel.tsx` | 오디오 단일화 |
| 송출실(신규) | `client/public/radio-studio.html` 또는 `client/src/pages/RadioStudio.tsx` | 단순 DJ UI |
| 기존 목업 | `client/public/radio-dj-ui-mockup.html` | 백업만 사용, 링크는 새 송출실로 |

이 설계대로 진행하면 "지금 재생 누른 곡 = 그대로 나오는" 동작을 맞추기 쉬워집니다.

---

## 6. 적용 상태 (2026-03)

- **백업**: `backups/radio-before-redesign-2026/` 에 기존 송출실·채널 페이지 백업 완료.
- **설계 문서**: 본 문서 (`docs/RADIO_REDESIGN_2026.md`).
- **단순 송출실**: `client/public/radio-studio.html` 추가.
  - 방송 시작/종료, 곡 검색·선택, "지금 재생" 한 곡만 PATCH, 모니터 재생(채널 스트림 URL 1개).
- **채널 페이지**: "방송 스튜디오" 링크를 `/radio-studio.html?slug=...` 로 변경.
- **개발 서버**: `server/vite.ts` 에 `/radio-studio.html` 라우트 추가.
- **배포**: `npm run build` 시 `radio-studio.html` 이 `dist/public/` 에 복사되며, 정적 서빙으로 제공됨.
