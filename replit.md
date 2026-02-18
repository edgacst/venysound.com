# Veny Sound - 한국어 음악 스트리밍 플랫폼

## Overview
Veny Sound는 한국어 UI 기반의 음악 스트리밍/공유 플랫폼입니다. Veny는 Venue(장소)를 연상시켜 "음악이 머무는 공간"이라는 의미를 가지며, Sound를 붙여 오디오/음악 공유 플랫폼임을 나타냅니다. 사용자가 음원을 업로드하고, 스트리밍하며, 커뮤니티에서 소통할 수 있습니다.

## Tech Stack
- **Frontend**: React + TypeScript + Vite + TailwindCSS + shadcn/ui
- **Backend**: Node.js + Express
- **Database**: PostgreSQL (Drizzle ORM)
- **Auth**: Google OAuth 2.0 (Passport.js) - 네이버/카카오/페이스북 추가 예정
- **Storage**: Replit Object Storage (Google Cloud)
- **Audio**: 커스텀 네이티브 오디오 플레이어 (Media Session API)

## Project Architecture
```
client/src/
  pages/        - Home, Explore (음원 목록), Popular (인기 음원), Community (커뮤니티),
                  Upload (음원 업로드), Profile (프로필), About (회사소개), FAQ, Legal (이용약관),
                  Admin (관리자 대시보드)
  components/   - Navigation (한국어 내비게이션), MusicCard, AudioPlayer (글로벌 플레이어)
  hooks/        - use-auth, use-music, use-community, use-user-profile, use-upload, use-playlists
server/
  routes.ts     - API routes (music, reviews, playlists, posts, users, notifications, admin)
  storage.ts    - Database CRUD via Drizzle ORM
shared/
  schema.ts     - Drizzle schema (music, likes, follows, reviews, playlists, posts, comments, notifications)
  models/auth.ts - Users table with role column (user/admin)
  routes.ts     - API contract definitions
```

## Key Features
- 음원 업로드/스트리밍 (MP3, WAV, OGG)
- 음원 수정/삭제 (소유자: 수정+삭제, 관리자: 삭제 가능)
- 장르별 필터링 (대분류/소분류)
- AI 음원 표시 기능
- 커뮤니티 게시판 (카테고리별)
- 좋아요/팔로우 시스템 (하트 색상 변화, 팔로우 상태 표시)
- 알림 시스템 (개별/일괄 읽음 처리)
- 인기 음원 TOP 10
- 자동 다음 곡 재생 (이전/다음 트랙 버튼)
- **스트리밍 시간 추적**: 음원 재생 시 duration 기록, 마이페이지에 총 스트리밍 시간/재생 횟수 표시
  - DB: streaming_logs 테이블 (userId, musicId, durationSeconds)
  - API: POST /api/streaming-log (재생 기록), GET /api/streaming-stats/:userId (통계 조회)
  - AudioPlayer에서 재생/일시정지/곡 변경/페이지 이탈 시 자동 기록
- 마이페이지: 통계, 팔로워/팔로잉 목록, 플레이리스트 관리(생성/삭제/곡 제거), 게시글, 알림, 내 저작권 신고, 수익 대시보드
- AI 커버 이미지 선택형 생성 (프리미엄 전용, gpt-image-1로 생성, POST /api/music/generate-cover)
- 관리자 대시보드: 통계(회원수/음원수/좋아요/댓글), 커뮤니티 글 관리(삭제), 회원 관리(검색/삭제/승격), 저작권 신고 관리
- 저작권 신고 시스템: 신고 접수(사유/원작자/원곡/상세설명), 상태 관리(대기중→검토중→처리완료/반려), 관리자 메모, 알림 전송
- **토스페이먼츠 프리미엄 구독 시스템**: Free/Premium 플랜, 월간(9,900원)/연간(99,000원) 결제
  - 토스페이먼츠 빌링키 방식: 카드 1회 등록 → 자동결제
  - 환경변수: TOSS_CLIENT_KEY (클라이언트), TOSS_SECRET_KEY (서버)
  - DB: users 테이블 (tossBillingKey, tossCustomerKey, subscriptionPlan, subscriptionExpiresAt)
  - 테이블: subscription_plans (플랜 정보), payments (결제 내역)
  - API: /api/toss/plans, /api/toss/subscription, /api/toss/client-key, /api/toss/billing/success, /api/toss/subscribe, /api/toss/cancel-subscription, /api/toss/payment-history
  - Pricing 페이지 (/pricing): 플랜 비교, 결제 주기 선택, 카드 등록, 구독/해지
  - Premium 배지: 프로필, 네비게이션 드롭다운에 표시
  - Premium 게이팅: AI 커버 생성 기능은 프리미엄 전용
- **업로더 수익화 시스템**: 후원(팁) + 유료 다운로드로 아티스트 수익 지원
  - DB: tips 테이블 (후원 내역), purchases 테이블 (구매 내역), music.price/isDownloadable, users.balance
  - 후원: 최소 100원, 메시지 옵션, MusicCard에 Gift 아이콘 버튼
  - 유료 다운로드: 업로더가 음원별 가격 설정, 구매 시 다운로드 허용
  - API: /api/tips (후원), /api/purchase/:musicId (구매), /api/earnings (수익 대시보드), /api/tips/received, /api/earnings/sales
  - 프로필 수익 탭: 잔액, 총 후원 수익, 총 판매 수익, 거래 내역

## Design
- 다크 테마 (Spotify/SoundCloud 스타일)
- Purple accent (#7C3AED)
- DM Sans + Outfit 폰트

## Recent Changes
- 2026-02-17: 창작 히스토리(Creative Story) 기능 추가
  - DB: music_stories (히스토리), story_comments (댓글) 테이블
  - 업로더만 자기 음원에 창작 배경/영감/제작 과정 글 작성 가능
  - 다른 사용자들은 히스토리에 댓글 작성 가능
  - API: GET/POST /api/music/:id/stories, PATCH/DELETE /api/stories/:id, GET/POST /api/stories/:id/comments
  - 소유자 권한 검증: 수정/삭제 시 작성자 본인만 가능
  - MusicDetail 페이지에 가사 섹션과 리뷰 섹션 사이에 창작 히스토리 섹션 배치
- 2026-02-15: UI/UX 개선
  - 헤더 로고 호버 시 원본 이미지 팝업 표시
  - 푸터 타이틀 헤더와 동일 그라디에이션 스타일 적용
  - 음원 목록 30개 고정 페이지네이션 (API: page, limit 파라미터)
  - 수익 출금 수수료 15%(부가세 별도)로 변경 (서버/클라이언트 모두)
- 2026-02-15: 페이지 스크롤 및 댓글/플레이어 개선
  - FAQ, 이용약관, 회사소개 상세 페이지 진입 시 스크롤 상단 이동
  - 커뮤니티 댓글에 대댓글(답글) 기능 추가 (parentId 기반, 1단계 중첩)
  - 내가 쓴 댓글 삭제 기능 추가 (API: DELETE /api/comments/:commentId)
  - 오디오 플레이어 모바일 페이지 전환 시 재생 유지 개선 (메모이제이션, ref 캐싱)
  - 오디오 플레이어 모바일 반응형 레이아웃 개선
- 2026-02-15: 크레딧 시스템 UI 완성
  - 프로필 수익 탭에 출금 요청 다이얼로그 (은행 정보 입력, 수수료 15%+부가세 미리보기)
  - 프로필 수익 탭에 출금 내역 목록 (상태별 배지: 대기중/승인/거부)
  - 관리자 대시보드에 출금 관리 섹션 (승인/거부 버튼, 메모 기능, 상태 필터)
  - 네비게이션 드롭다운 & 모바일 메뉴에 크레딧 잔액 표시
  - 크레딧 충전 페이지 (/credits) 라우트 등록
- 2026-02-15: 업로더 수익화 시스템 추가
  - 후원(팁) 시스템: MusicCard에 후원 버튼, 금액 선택 다이얼로그
  - 유료 다운로드: Upload 페이지에 가격/다운로드 허용 설정, 구매 버튼
  - 수익 대시보드: 프로필 '수익' 탭 (잔액, 후원 내역, 판매 내역)
  - DB: tips, purchases 테이블, music.price/isDownloadable, users.balance
- 2026-02-15: 관리자 대시보드 페이지 추가 (/admin)
  - users 테이블에 role 컬럼 추가 (user/admin)
  - 관리자 전용 API: /api/admin/stats, /api/admin/posts, /api/admin/users, /api/admin/check
  - 통계 카드, 커뮤니티 글 삭제, 회원 검색/삭제/관리자 승격·해제
  - 네비게이션 드롭다운에 관리자 메뉴 추가 (관리자에게만 표시)
- 2026-02-15: 랜덤 커버 이미지를 Lorem Picsum으로 변경 (Unsplash Source API 503 대응)
- 2026-02-15: 전체 UI 한국어 변환 완료
- 모든 페이지, 컴포넌트, 토스트 메시지, 폼 라벨 한국어화
- 신규 페이지 추가: Popular, About, FAQ, Legal
- 장르 대분류/소분류 시스템 구현
- AI 음원 체크박스 추가
- Upload 페이지 setState 렌더링 오류 수정

- 2026-02-16: 가사(Lyrics) 기능 추가
  - music 테이블에 lyrics TEXT 컬럼 추가
  - Upload 페이지에 가사 입력 Textarea 추가
  - 음원 수정 API에 lyrics 필드 지원 추가
  - MusicDetail 상세 페이지에 가사 섹션 (접기/펼치기)
  - AudioPlayer에 가사 보기 토글 버튼 + 슬라이드 패널
- 2026-02-16: 아티스트 대시보드 + 팬 공지 기능 추가
  - 아티스트 대시보드 페이지 (/dashboard): 재생 통계, 인기 음원 TOP 10
  - 일별 재생 추이 그래프 (최근 30일, AreaChart)
  - 시간대별 인기도 차트 (24시간 BarChart)
  - 요약 카드: 등록 음원 수, 총 재생 수, 총 재생 시간, 고유 리스너 수
  - API: GET /api/dashboard/my-music-stats (통계 종합 조회)
  - 팬 공지 시스템: announcements 테이블, 공지 작성 시 팔로워 전원 알림 발송
  - API: POST /api/announcements, GET /api/announcements/my, GET /api/announcements/artist/:id, DELETE /api/announcements/:id
  - 네비게이션 드롭다운/모바일 메뉴에 아티스트 대시보드 링크 추가
- 2026-02-16: 오디오 플레이어 고급 기능 추가
  - 반복 재생: 반복 없음 → 전체 반복 → 한 곡 반복 (Repeat/Repeat1 아이콘)
  - 셔플(랜덤) 재생: Fisher-Yates 알고리즘 기반 셔플, 토글 가능
  - 재생 대기열(Queue): 곡 추가/제거/전체삭제, MusicCard 드롭다운에서 "대기열에 추가"
  - 이퀄라이저: Web Audio API 10밴드 EQ, 9개 프리셋 (기본/베이스/고음/보컬/록/팝/재즈/일렉/클래식)
  - PlayerStore에 repeatMode, shuffleEnabled, queue, shuffledOrder 상태 추가
- 2026-02-16: 실시간 DM(다이렉트 메시지) 기능 추가
  - DB: conversations, direct_messages 테이블
  - WebSocket 기반 실시간 메시지 수신 (userSockets 매핑)
  - 대화 목록 + 채팅 UI 페이지 (/messages, /messages/:userId)
  - 프로필에서 메시지 보내기 버튼 (자동 대화 생성)
  - 네비게이션에 메시지 아이콘 + 읽지 않은 메시지 카운트 배지
  - API: GET/POST /api/conversations, GET/POST /api/conversations/:id/messages, GET /api/messages/unread-count, POST /api/conversations/:id/read

## User Preferences
- 한국어 UI 유지
- 다크 테마 선호
