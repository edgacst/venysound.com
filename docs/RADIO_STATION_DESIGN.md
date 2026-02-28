# 베니방송국 (Veny Radio) 설계안

현재 Veny Sound 시스템을 기준으로 **음악 방송국** 기능을 어떻게 넣을지 검토한 제안입니다. 요청하신 9가지와 추가 제안을 모두 포함했습니다.

---

## 1. 현재 시스템에서 쓸 수 있는 것

| 항목 | 현재 상태 | 활용 방안 |
|------|-----------|------------|
| **인증/회원** | `users`, 로그인 | DJ·청취자 모두 동일 계정 사용 |
| **음원** | `music` 테이블, 스트리밍 URL | 방송에서 “사이트 음원” 재생·송출 |
| **크레딧/후원** | `credits`, `tips`, `creditTransactions` | DJ에게 후원 = `tips.toUserId`를 DJ로 |
| **알림** | `notifications` (type: tip, badge) | 후원·배지 알림 재사용 |
| **실시간** | `ws` (WebSocket) 패키지 사용 중 | 채팅·입장/퇴장·신청곡 실시간 반영 |
| **배지** | 후원 누적 기준 seed/sprout/supporter/sponsor | “방송 후원”도 동일 뱃지 규칙에 포함 또는 별도 “방송 후원” 누적 추가 |

---

## 2. 요청 기능별 설계

### ① 사이트에 “방송국 가기” 배너

- **위치**: 메인(Home) 또는 네비 바로 아래 등 눈에 띄는 한 곳.
- **동작**: 클릭 시 `/radio`(또는 `/station`)로 이동.
- **구현**:  
  - `client`: 배너 컴포넌트 1개 + `App.tsx`에 `/radio` 라우트 추가.  
  - 배너 노출 조건(로그인 여부, A/B 등)은 나중에 옵션으로 추가 가능.

---

### ② 배너 클릭 시 “베니방송국” 메인 페이지

- **경로**: `/radio` (베니방송국 메인).
- **역할**:
  - “지금 라이브 중인 채널” 목록 (썸네일, DJ명, 청취자 수, 제목).
  - “내 채널 만들기” 버튼 → 채널 생성 플로우.
  - 공지/이용 안내 짧은 텍스트.
- **데이터**: 아래 “채널” 테이블에서 `status = 'live'` 인 것만 조회.

---

### ③ 내 방송 채널 생성

- **개념**: “방송국”은 서비스 전체, “채널”은 사용자 1인당 1개(또는 N개 정책에 따라).
- **채널 생성 시 입력 예**:
  - 채널명, 한 줄 소개, 썸네일(선택), 공개 범위(전체 공개 / 링크 있는 사람만 / 비공개 등).
- **DB**: 새 테이블 `radio_channels` (아래 스키마 참고).
- **권한**: 로그인 사용자만 생성 가능. 중복 생성 제한(1인 1채널 등)은 정책으로.

---

### ④ 방송 송출 시스템 (사이트 음원 + 로컬 음원)

- **목표**:  
  - (A) 이 사이트에 올라온 음원을 방송에서 재생·송출  
  - (B) DJ가 로컬에 가진 음원도 송출

**방식 제안:**

| 구분 | 사이트 음원 | DJ 로컬 음원 |
|------|-------------|--------------|
| **저장 위치** | 이미 `music` + 스토리지 | DJ PC/폰에만 존재 |
| **송출 주체** | 서버가 URL만 알려주고, 클라이언트가 기존 스트리밍 URL로 재생 | DJ 브라우저가 직접 재생 → 오디오를 “스트리밍”으로 보냄 |
| **구현** | “지금 재생 중”만 서버에 저장(`now_playing`), 청취자는 같은 `music.id` 스트리밍 URL로 듣기 | **DJ 앱(브라우저)**에서 마이크/탭 오디오 캡처 → **WebRTC** 또는 **WebSocket으로 오디오 청크** 전송 → 서버가 청취자에게 중계 |

- **권장 1단계 (단순)**  
  - **사이트 음원만** 지원:  
    - DJ가 재생 목록/큐를 만들고 “지금 재생 중”만 `now_playing`(musicId, startAt 등)로 서버에 올림.  
    - 청취자 앱은 같은 `music.id`의 기존 스트리밍 URL로 재생. (이미 있는 플레이어/API 재사용)  
  - 로컬 음원은 “업로드 후 재생”으로 유도하거나, 2단계에서 “로컬 파일 → 브라우저 재생 → 오디오 스트리밍” 도입.

- **2단계 (로컬 음원까지)**  
  - DJ 전용 “방송 스튜디오” 페이지에서:  
    - 파일 선택 → 브라우저에서 재생 → **MediaCapture / AudioContext**로 오디오 스트림 취득 → **WebSocket** 또는 **WebRTC**로 서버/다른 클라이언트에 전송.  
  - 서버는 “오디오 스트림 중계”만 하거나, WebRTC라면 시그널링만 담당.

- **저작권**: 사이트 음원은 기존 이용약관/저작권 정책 유지. “방송에서 재생”을 약관에 명시하는 것이 좋고, 로컬 파일은 “DJ가 권한 있는 파일만 재생”하도록 안내.

---

### ⑤ 채널 입장 + 동시 시청 + 실시간 대화

- **입장 권한**  
  - “지인/특정인만”: `radio_channel_members` 테이블로 “이 채널에 들어올 수 있는 user_id” 화이트리스트.  
  - “링크 있는 사람”: 채널별 비공개 링크(토큰) 발급 → 링크로 들어오면 세션/쿠키에 “이 채널 입장 허용” 저장.  
  - “전체 공개”: 별도 제한 없음.

- **동시 접속자**  
  - 채널별 “입장/퇴장” 이벤트를 WebSocket으로 서버에 보냄 → 서버가 `channel_id`별 접속 목록(또는 수만) 유지 → “현재 N명 시청 중” 표시.

- **실시간 대화**  
  - 같은 채널 안의 채팅 메시지를 WebSocket으로 주고받기.  
  - DB: `radio_chat_messages` (channel_id, user_id, content, created_at).  
  - 저장 정책: 전부 저장 vs 최근 N개만 vs 로그인 유저만 저장 등은 정책으로.

- **기술**  
  - 이미 있는 `ws` 서버에 `/radio` 또는 `/radio/:channelId` 같은 **경로(또는 채널별 룸)** 추가.  
  - 이벤트 타입: `join`/`leave`/`chat`/`now_playing`/`request` 등 정의.

---

### ⑥ 신청곡 게시판

- **개념**: 채널별 “신청곡 목록”. DJ가 수락/재생 순서 조정.
- **DB**: `radio_song_requests`  
  - channel_id, user_id(신청자), music_id(사이트 음원인 경우), title/artist(직접 입력인 경우), message, status(대기/재생완료/취소), sort_order, created_at.
- **동작**  
  - 청취자: “신청하기” 시 사이트 음원 선택 또는 제목/아티스트 직접 입력.  
  - DJ: 대기 목록을 끌어다 놓기로 순서 변경, “다음 곡으로” 선택, 완료 처리.  
  - 실시간 반영: WebSocket으로 목록/순서/현재 재생 곡 갱신.

---

### ⑦ DJ에게 후원

- **현재 구조 재사용**: `tips` 테이블.  
  - `fromUserId`: 후원하는 청취자  
  - `toUserId`: DJ  
  - `musicId`: null 또는 “지금 재생 중인 곡” (선택)  
  - `amount`: 크레딧  
  - `message`: 응원 메시지
- **API**: 기존 `POST /api/tips` 사용.  
  - 채널 화면에서 “이 DJ에게 후원” 버튼 → toUserId에 채널 DJ id, musicId는 비우거나 현재 곡으로.
- **결제**: 기존 크레딧 차감 + DJ에게 크레딧 적립(기존 정책과 동일하게).

---

### ⑧ 후원 많이 하면 배지 부여

- **이미 있음**: 후원 누적 크레딧 기준으로 seed → sprout → supporter → sponsor 배지.
- **적용**: “방송 중 DJ에게 준 후원”도 `tips`에 쌓이므로, **별도 필드 없이** 기존 배지 로직만으로 “이 DJ에게 많이 후원한 사람” 배지가 가능.
- **옵션**:  
  - “이 채널에서만 누적”한 “방송국 전용 배지”를 만들고 싶다면:  
    - `tips`에 `channel_id`(또는 context) nullable 추가하거나,  
    - 별도 `radio_channel_tips`를 두고, 배지 계산 시 “채널별 누적”을 사용.

---

### ⑨ 그 외 제안 기능

- **채널 공지**: 채널별 짧은 공지 텍스트 (DB: `radio_channels.notice` 또는 `radio_channel_notices`).
- **녹화/재방송**:  
  - 1단계에서는 생략.  
  - 이후: “방송 종료 시 서버가 재생 로그(곡 순서+타임스탬프)만 저장” → “재방송은 사이트 음원만 같은 순서로 재생”하는 형태로 구현 가능.
- **동시 시청자 수 제한**: 채널별 `max_listeners` 설정(선택).
- **신고/관리**: 기존 신고 플로우에 “방송 채널/채팅” 타입 추가.
- **검색/필터**: 베니방송국 메인에서 “DJ명, 채널명” 검색, “지금 라이브만” 필터.

---

## 3. DB 스키마 제안 (요약)

```text
radio_channels
  id, owner_id (user_id), name, slug, description, cover_filename,
  visibility (public | link_only | private), invite_token,
  status (draft | live | ended), notice,
  now_playing_music_id, now_playing_started_at,
  created_at, updated_at

radio_channel_members  (비공개/초대제 채널용)
  channel_id, user_id, role (listener | co_dj), joined_at

radio_song_requests
  id, channel_id, user_id, music_id (nullable), title, artist, message,
  status (pending | playing | played | cancelled), sort_order, created_at

radio_chat_messages
  id, channel_id, user_id, content, created_at

(후원은 기존 tips 사용, 필요 시 tips.channel_id nullable 추가)
```

- `music`, `users`, `tips` 등 기존 테이블은 그대로 두고 위 테이블만 추가하는 방식으로 확장 가능.

---

## 4. 구현 단계 제안

| 단계 | 내용 | 비고 |
|------|------|------|
| **1단계** | 배너 + `/radio` 메인 + 채널 생성(CRUD) + **사이트 음원만** 재생/송출(now_playing 동기화) + 입장(공개 채널) + 실시간 인원 수 | 빠르게 “방송국 느낌” 확인 |
| **2단계** | 채팅(WebSocket) + 신청곡 게시판 + DJ 후원(기존 tips) + 배지 연동 | 핵심 경험 완성 |
| **3단계** | 비공개/초대 채널(members, invite link) + 채널 공지 + (선택) 로컬 음원 송출 | 정책·품질 확장 |
| **4단계** | 재방송, 채널별 전용 배지, 신고 연동 등 | 운영 안정화 |

---

## 5. 기술 포인트 요약

- **실시간**: 기존 `ws`에 채널별 룸 또는 경로 추가. 이벤트: join/leave/chat/now_playing/request/list_update.
- **송출 1단계**: “현재 곡”만 서버에 반영 → 청취자는 같은 `music.id` 스트리밍 URL로 재생. (별도 오디오 스트리밍 없음)
- **송출 2단계(로컬)**: DJ 브라우저에서 오디오 캡처 후 WebSocket/WebRTC로 전송·중계.
- **후원/배지**: 기존 `tips` + 기존 배지 로직 최대한 재사용.

원하시면 다음 단계로 **1단계용 상세 API 목록**이나 **프론트 페이지 라우트/화면 목록**도 정리해 드리겠습니다.
