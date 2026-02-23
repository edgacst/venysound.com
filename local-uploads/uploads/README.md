# 로컬 음원 폴더

이 폴더에 음원 파일을 넣으면 로컬에서 재생됩니다.

## 필요한 파일 목록 확인

사이트 접속 후 **푸터** → **음원 파일 연결 가이드** 또는 `/file-guide` 에서
DB에 등록된 곡 중 파일이 없는 목록과 저장할 파일명을 확인할 수 있습니다.

## 사용 방법

1. `/file-guide` 페이지에서 필요한 파일명 목록 확인
2. 기존에 보관한 해당 음원 파일 준비
3. `local-uploads/uploads/` 폴더에 표시된 파일명으로 저장

예) `b82f8a15-6e5a-4de7-8258-5d8e3783696e.mp3` → `local-uploads/uploads/b82f8a15-6e5a-4de7-8258-5d8e3783696e.mp3`

## 배포 사이트에서 일괄 다운로드

로컬 DB는 복원했지만 음원 파일이 없을 때, 배포 사이트(venysound.com)에서 일괄 다운로드할 수 있습니다:

```bash
npm run download-files
```

- DB에 등록된 곡 중 로컬에 없는 파일을 venysound.com `/objects/uploads/` 에서 다운로드합니다.
- 배포 사이트가 해당 경로로 파일을 서빙 중이어야 합니다.
- 다른 URL 사용 시: `PRODUCTION_URL=https://... npm run download-files`

## 참고

- DB만 복원된 경우, 해당 음원 파일은 별도로 준비해야 합니다. 없으면 업로드 페이지에서 새로 등록하세요.
