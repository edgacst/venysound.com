# 라디오 DJ 기능 구현 계획: 마이크 설정 · 방송 녹음 · DJ 인수인계

## 현재 구조 요약

- **방송 방식**: 서버에 오디오 스트림을 올리는 방식이 아니라, DJ가 "지금 재생 중인 곡"을 PATCH로 올리면 **리스너가 같은 곡을 사이트에서 재생**하는 동기 재생 방식입니다.
- **DJ UI**: `client/public/radio-dj-ui-mockup.html` (목업)에서 방송 시작/종료, 큐, 채팅, **마이크 장치 선택·연결·레벨**이 이미 구현되어 있습니다. (마이크는 현재 **로컬 미리듣기용**, 서버 전송 없음)
- **채널 권한**: 채널 **소유자(ownerId)**만 PATCH 가능. `radio_channel_staff` 테이블(부방장/스텝)은 있으나 송출 제어 권한에는 아직 미사용.

---

## 1. 마이크 설정

### 목표
- DJ가 사용할 **마이크 장치 선택**
- 선택한 장치 **기억** (다음 방송 시 기본 선택)
- (선택) **입력 레벨(게인)** · **뮤트** 등

### 구현 방안

| 항목 | 내용 |
|------|------|
| **장치 목록** | 이미 목업에 있음: `navigator.mediaDevices.enumerateDevices()` → `audioinput` 필터 후 `<select>`에 표시 |
| **선택 저장** | 브라우저 저장소 사용. 예: `localStorage.setItem('radio_dj_mic_device_id', deviceId)` / 방송실 진입 시 `getItem`으로 복원 |
| **추가 설정** | Web Audio **GainNode**로 마이크 볼륨 조절, **mute**는 GainNode.gain.value = 0. 예: 목업의 "마이크 설정" 패널에 슬라이더·뮤트 버튼 추가 |

### 작업 범위 (최소)
1. **목업(radio-dj-ui-mockup.html)**  
   - 마이크 연결 시 선택한 `deviceId`를 `localStorage`에 저장.  
   - 페이지 로드 시 저장된 값이 있으면 해당 옵션 자동 선택(또는 연결 시 해당 장치로 요청).

2. **(선택) React DJ 페이지로 이식 시**  
   - 동일 로직(장치 열거, 선택, localStorage 저장/복원) + GainNode로 볼륨/뮤트.

---

## 2. DJ가 방송을 녹음

### 목표
- 방송 중 **음악 + 마이크**를 합친 프로그램을 **녹음**해서 파일로 저장(다운로드 또는 업로드).

### 제약
- 현재 서버에는 **오디오 스트림 수신/저장**이 없음. 리스너는 "현재 곡" 정보만 받고 각자 재생하므로, 서버 쪽에서 "방송 오디오"를 한 덩어리로 녹음하는 구조는 없음.

### 구현 방안: **클라이언트(브라우저)에서 녹음**

1. **DJ 브라우저에서만 녹음**
   - **음원**: DJ 화면에서 재생 중인 곡 → `<audio>` 또는 AudioContext로 재생 중인 소스.
   - **마이크**: `getUserMedia`로 얻은 `MediaStream`.
   - **합성**: Web Audio API로 **음원 스트림 + 마이크 스트림**을 **destination** 하나로 믹싱.
   - **녹음**: 이 destination을 `MediaRecorder`에 연결해 녹음 (예: `audio/webm` 또는 `audio/mp4`).
   - **결과**: 녹음 종료 시 **Blob** → 파일 다운로드(`a.download`) 또는 **업로드 API**로 서버에 저장.

2. **필요 요소**
   - DJ 앱에서 "지금 재생 중인 곡"의 오디오를 **AudioContext**로 받아오기:  
     `AudioContext.createMediaElementSource(audioElement)` 등.
   - 마이크 스트림은 이미 목업에 있음.
   - **GainNode**로 음악/마이크 비율 조절 가능.
   - **MediaRecorder**는 `destination.stream()`(또는 합쳐진 스트림)을 녹음.

3. **저장 위치**
   - **옵션 A**: 브라우저에서만 **다운로드** (구현 간단, 서버 변경 없음).
   - **옵션 B**: 녹음 파일을 **서버에 업로드** (예: `/api/radio/channels/:slug/recording` POST) → 스토리지에 저장 후, 나중에 "방송 다시듣기" 등에 활용. (스토리지·API 설계 필요)

### 작업 순서 제안
1. 목업(또는 React DJ 페이지)에 **녹음 시작/중지** 버튼 추가.
2. 재생 중인 곡 오디오 + 마이크를 **Web Audio로 믹싱** → **MediaRecorder**로 녹음.
3. 중지 시 **Blob**으로 받아 **다운로드**까지 구현.
4. (추가 요구 시) 업로드 API와 DB/스토리지 설계 후 **서버 저장** 연동.

---

## 3. 다른 DJ에게 넘겨주기 (인수인계)

### 목표
- 방송 중인 채널의 **송출 권한**을 다른 DJ(스텝/부방장)에게 넘겨서, 그 사람이 큐·현재곡·방송 종료 등을 제어할 수 있게 함.

### 구현 방안: **현재 호스트(currentHostId)** 도입

| 구분 | 내용 |
|------|------|
| **스키마** | `radio_channels` 테이블에 **`current_host_id`** (nullable, FK to users) 컬럼 추가. |
| **의미** | `current_host_id`가 있으면 "지금 송출 중인 사람"은 그 유저. 없으면 **owner**가 송출 중인 것으로 간주. |
| **권한** | 채널 **수정**(PATCH: status, nowPlayingMusicId, nowPlayingStartedAt 등) 가능한 사람:  
  **owner** **또는** **current_host_id**인 사람.  
  (이미 스텝 테이블이 있으므로, "인수인계 대상"은 **owner가 스텝으로 등록한 사람**만 허용하도록 할 수 있음.) |
| **인수인계 흐름** | 1) 현재 호스트(또는 owner)가 "다른 DJ에게 넘기기" 선택 → 2) 스텝 목록에서 상대 선택 → 3) API에서 `current_host_id`를 해당 유저로 변경. |
| **방송 종료** | 방송 종료 시 `current_host_id`를 null로 리셋해도 됨(다음 방송 시 다시 owner가 기본). |

### API 제안

- **PATCH `/api/radio/channels/:slug`**  
  - body에 **`currentHostId`** (userId 문자열 또는 null) 허용.  
  - 권한: **owner**만 `currentHostId` 변경 가능.  
  - `currentHostId`로 넣을 수 있는 사람: **해당 채널 스텝** 또는 **owner 본인**만 허용 (타인에게 임의로 넘기지 못하게).

- **GET 채널 정보**  
  - 응답에 **`currentHostId`**, **`currentHostUsername`** 등 포함하면, 리스너/DJ UI에서 "지금 누가 송출 중인지" 표시 가능.

### UI

- DJ 송출실에서 **"인수인계"** 버튼 → 스텝(또는 지정 가능한 DJ) 목록 표시 → 선택 시 위 PATCH 호출.
- (선택) 인수인계 시 **알림**: WebSocket 등으로 "OOO님이 송출을 넘겼습니다" 메시지 브로드캐스트.

### 대안: 소유권 이전
- "채널을 아예 다른 사람에게 넘긴다"는 요구라면 **ownerId 변경** API를 별도로 두는 방식 (예: POST `/api/radio/channels/:slug/transfer-ownership`, body `{ newOwnerId }`).  
- 현재 제안은 **방송 권한만 넘기는 인수인계**이므로, **current_host_id** 방식이 적합합니다.

---

## 구현 우선순위 제안

1. **마이크 설정**  
   - 목업에 deviceId 저장/복원만 먼저 적용 (작업량 적음).
2. **DJ 인수인계**  
   - 스키마 + API + 권한 로직으로, 방송 운영에 바로 도움이 됨.
3. **방송 녹음**  
   - Web Audio + MediaRecorder 연동이 상대적으로 작업량이 큼. 다운로드까지 먼저 구현 후, 필요 시 업로드/재생 목록 추가.

원하시면 1번부터 구체적인 코드 수정 위치(파일/함수)까지 쪼개서 작업 순서로 정리해 드리겠습니다.
