# 라디오 방송국 백업 (재설계 전)

- **백업 일시**: 2026-03
- **용도**: "처음부터 다시 설계" 전 기존 송출실·방송국 관련 프론트 백업

## 포함 파일

| 파일 | 설명 |
|------|------|
| `radio-dj-ui-mockup.html` | 기존 DJ 송출실 (목업, 채널 페이지에서 "방송 스튜디오" 링크로 열림) |
| `RadioChannel.tsx` | 채널 페이지 (청취자 화면 + 방송 스튜디오 진입) |
| `Radio.tsx` | 방송국 메인 (채널 목록, 내 채널 만들기) |
| `RadioCreate.tsx` | 채널 생성 페이지 |

## 복구 방법

필요 시 위 파일을 아래 위치로 복사하면 됩니다.

- `radio-dj-ui-mockup.html` → `client/public/radio-dj-ui-mockup.html`
- `RadioChannel.tsx` → `client/src/pages/RadioChannel.tsx`
- `Radio.tsx` → `client/src/pages/Radio.tsx`
- `RadioCreate.tsx` → `client/src/pages/RadioCreate.tsx`

백엔드(API, DB, 스트림)는 이 백업에 포함되지 않으며, 재설계 후에도 동일 API를 사용할 수 있습니다.
