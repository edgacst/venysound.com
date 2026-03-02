# 라디오 DJ/리스너 배포 후 확인

## 웹 서버에 수정 내용이 반영되려면

1. **서버에서 반드시 실행**
   ```bash
   cd /var/www/venysound/app   # 또는 실제 앱 경로
   git pull origin main
   npm install
   npm run build
   pm2 restart venysound
   ```
   - `npm run build` 시 **client/public/radio-dj-ui-mockup.html** 이 **dist/public/** 으로 복사됩니다.
   - 이 단계를 건너뛰면 DJ 송출실 HTML/리스너 JS가 예전 버전으로 남습니다.

2. **브라우저 캐시**
   - DJ 송출실 페이지: **Ctrl+Shift+R**(강력 새로고침) 또는 개발자도구 → 네트워크 → "캐시 비우기 및 강력 새로고침"
   - 리스너 페이지도 수정 후 한 번 강력 새로고침 권장.

3. **실제 반영 여부 확인**
   - DJ 페이지에서 "모니터 (지금 송출 중인 곡) · 소리 안 들리면 아래 재생 클릭" 문구가 보이면 최신 빌드가 적용된 것입니다.
   - 또는 서버에서: `grep -l "모니터 재생" dist/public/radio-dj-ui-mockup.html` 로 해당 문구 존재 여부 확인.

## DJ 송출 시 소리가 안 들릴 때

- **▶ 모니터 재생** 버튼을 한 번 눌러 보세요. (브라우저 정책상 사용자 클릭으로 재생이 허용됩니다.)
