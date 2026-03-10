# 라디오 수정 사항 서버 반영 확인

## 1. 배포 후 서버에서 확인할 명령

```bash
# 최신 커밋 확인 (c1fcf36 또는 그 이후)
cd /var/www/venysound/app
git log -1 --oneline

# 빌드 산출물에 반영 여부
# - React 번들: 라디오 채널 페이지(가사 낙관 업데이트) 포함
grep -o "nowPlayingMusicId" dist/public/assets/index-*.js | head -1

# 송출실 HTML: 곡별 URL 사용 여부
grep -o "api/music.*stream" dist/public/radio-dj-ui-mockup.html | head -3
```

## 2. 브라우저 캐시 제거 (중요)

수정이 반영돼도 **예전 JS/HTML이 캐시**되면 동작하지 않습니다.

- **송출실**: `radio-dj-ui-mockup.html` 접속 후 **Ctrl+Shift+R** (강력 새로고침)
- **리스너 창**: 채널 페이지에서 **Ctrl+Shift+R**
- 또는 시크릿 창에서 접속해 새 파일만 받는지 확인

## 3. 동작 체크리스트

- [ ] 송출실: 방송 시작 → 지금 재생 클릭 시 **첫 곡 음원** 재생
- [ ] 송출실: 2곡 전환 시 모니터에 **다음 곡** 적용 (소리 안 나오면 「모니터 재생」 한 번)
- [ ] 리스너: 곡이 바뀔 때 **제목·가사** 즉시 갱신

## 4. 재배포 절차 (코드 반영이 안 될 때)

```bash
cd /var/www/venysound/app
git fetch origin
git log -1 origin/main --oneline   # 원격 최신 커밋 확인
git checkout main
git pull origin main
npm run db:deploy
npm run build
pm2 restart venysound
```

이후 브라우저에서 **강력 새로고침(Ctrl+Shift+R)** 필수.
