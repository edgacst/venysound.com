# 베니방송국 시스템 설계 정리

방송(라디오) 기능의 현재 구조와 역할, 데이터 흐름을 한 문서에 모았습니다.  
로직 연계가 헷갈릴 때 이 문서를 기준으로 보시면 됩니다.

---

## 1. 역할 정의 (한눈에)

| 역할 | 조건 | 할 수 있는 일 |
|------|------|----------------|
| **방장 (owner)** | 채널 소유자 (`channel.ownerId === userId`) | 채널 생성·수정, 방송 시작/종료, **인수인계(currentHostId 설정)**, 스텝 추가/삭제, 신청곡 처리, 예정 시간, 송출 제어(지금 재생/곡 정지) |
| **현재 호스트 (currentHost, DJ)** | `channel.currentHostId === userId` | **송출 제어만** (지금 재생, 곡 정지). 방 종료·인수인계·스텝 관리 불가 |
| **스텝 (staff)** | 방장이 추가한 부방장/스텝 | 스튜디오 접속·채팅·신청곡 보기. **인수인계를 받기 전에는 송출 제어 불가** |
| **리스너** | 그냥 시청자 | 청취, 채팅, 신청곡 요청 |

- **canManage** = 방장 **또는** 현재 호스트 **또는** 스텝 → 스튜디오 링크 보임, 채널 설정 등
- **canControlBroadcast** = 방장 **또는** 현재 호스트 → 지금 재생 / 곡 정지 버튼 동작

---

## 2. 진입 경로 (어디서 뭘 쓰나)

- **방송국 목록**: `/radio` → 라이브 채널 목록, 내 채널 만들기
- **채널 페이지 (청취 + 스튜디오 링크)**: `/radio/:slug`  
  - 여기서 **「방송 스튜디오」** 클릭 → `/radio-dj-ui-mockup.html?slug=:slug` (새 탭)
- **DJ 송출실**: `/radio-dj-ui-mockup.html`  
  - **반드시 `?slug=채널슬러그` 로 들어와야** 스텝/인수인계 받은 사람도 채널 로드됨  
  - `slug` 없이 접속하면 `GET /api/radio/channels/me` 만 사용 → **방장만** 채널 잡힘

---

## 3. 데이터 흐름 (한 방향으로 정리)

```
[송출 제어]
  DJ 스튜디오 (또는 채널 페이지)
    → PATCH /api/radio/channels/:slug
         body: { nowPlayingMusicId, nowPlayingStartedAt }
    → 서버: DB 저장 후 broadcastToRadioChannel(slug, { type: "radio_now_playing", ... })

[청취 동기화]
  서버: nowPlayingStartedAt 기준으로 elapsedSeconds 계산
    → GET /api/radio/channels/:slug 응답에 nowPlayingElapsedSeconds 포함
    → WebSocket: radio_now_playing 에 elapsedSeconds 포함
  리스너(React): lastNowPlayingRef / channelElapsedRef 로 seek, 12초마다 재동기화
```

- **현재 호스트가 누구인지**: DB `radio_channels.current_host_id`  
  - **바꾸는 곳**: PATCH `/api/radio/channels/:slug` 에서 **방장만** `currentHostId` / `null` 설정 가능  
  - **쓰는 곳**: GET `/api/radio/channels/:slug` 에서 `canManage`, `canControlBroadcast` 계산할 때 사용

---

## 4. API·WebSocket 요약

| 구분 | 메서드/이벤트 | 설명 |
|------|----------------|------|
| **채널** | GET `/api/radio/channels/me` | **방장만** “내 채널” 1개 (ownerId 기준). currentHostId 없음 |
| | GET `/api/radio/channels/:slug` | 누구나. nowPlayingElapsedSeconds, canManage, canControlBroadcast 포함 |
| | PATCH `/api/radio/channels/:slug` | 방장/현재호스트: status, nowPlaying*. **방장만**: currentHostId, 예정 시간 |
| **스텝** | GET `/api/radio/channels/:slug/staff` | 스텝 목록 (인증 없음) |
| **WebSocket** | `radio_join` / `radio_leave` | slug 기준 방 입장/퇴장 |
| | `radio_now_playing` | slug, musicId, startedAt, elapsedSeconds (곡 없으면 musicId: null) |
| | `radio_broadcast_ended` | 방송 종료 시 |

- 모든 채널 단위 API는 **slug** 사용. DB 내부는 **channel.id** 사용.  
- `/me` 만 **userId(owner)** 기준.

---

## 5. 지금 혼란을 일으키는 부분

1. **DJ 스튜디오 진입**  
   - `slug` 없이 열면 `/me` 만 호출 → 스텝/인수인계 받은 사람은 “채널 없음”.  
   - **해결**: 스튜디오 링크를 항상 `?slug=...` 로 주고, 스튜디오는 `slug` 있으면 GET `/:slug` 로 채널 로드 (이미 반영됨).

2. **“지금 재생” 권한**  
   - `canControlBroadcast` = 방장 **또는** 현재 호스트.  
   - 스텝은 **인수인계로 currentHostId 가 자신으로 바뀌어야** 송출 제어 가능.  
   - 인수인계는 **방장만** 할 수 있음 (PATCH currentHostId).

3. **now playing 상태가 여러 곳에 있음**  
   - 서버: DB 1곳.  
   - 클라이언트: GET 채널 응답 + WebSocket + lastNowPlayingRef + channelElapsedRef.  
   - 리스너 seek/동기화 로직이 여러 effect·ref에 나뉘어 있음.

4. **GET /me 에 currentHostId 없음**  
   - “내 채널” 한 번만 볼 때는 현재 호스트가 누구인지 알 수 없음.  
   - 필요하면 GET `/:slug` 한 번 더 호출하거나, `/me` 응답에 currentHostId(와 필요 시 schedule) 추가하는 쪽으로 정리 가능.

---

## 6. 재설계 시 제안 (목표 상태)

- **역할 규칙 한 곳에 정리**  
  - 서버: “누가 무엇을 할 수 있는지”를 한 함수/상수로 정의 (예: `canControlBroadcast(userId, channel)`, `canHandoff(userId, channel)`).

- **채널 “진입”은 항상 slug 기준**  
  - 스튜디오는 항상 `?slug=...` 로 진입.  
  - “내 채널”이 필요하면: GET `/me` 로 slug만 받고, 상세는 GET `/:slug` 한 번으로 통일.

- **now playing은 “서버 1곳 + 이벤트 1종”**  
  - 서버: DB만 갱신하고, PATCH 시 `radio_now_playing` 한 번만 브로드캐스트.  
  - 클라이언트: “현재 곡 + elapsed”를 **한 state/ref** 로 두고, GET 응답과 `radio_now_playing` 둘 다 그 한 곳만 갱신하도록 정리.

- **문서/주석**  
  - 이 문서를 기준으로, 새 API·WS 이벤트 추가 시 “역할·slug·now playing”만 여기 표에 한 줄씩 추가해 두면 연계가 유지하기 쉬움.

---

## 7. 체크리스트 (스텝/인수인계 문제 시)

- [ ] 스튜디오 링크에 `?slug=채널슬러그` 가 붙어 있는가? (채널 페이지에서만 들어오면 자동)
- [ ] 인수인계는 **방장**이 “인수인계” 버튼으로 **스텝을 선택**했는가?
- [ ] 인수인계 받은 사람은 **채널 페이지**에서 「방송 스튜디오」로 들어왔는가? (주소창에 직접 `/radio-dj-ui-mockup.html` 만 치면 안 됨)
- [ ] 서버 PATCH에서 `canControlBroadcast` 가 true 인 사람만 nowPlaying 변경 가능한가? (방장 또는 currentHost)

이 문서는 `docs/radio-system-design.md` 로 두었습니다. 수정·보완은 이 파일만 고치면 됩니다.
