# 관리자 통계 총괄 설계 및 광고 수익화 제안

## 1. 현재 구조 정리

### 1.1 통계 총괄 섹션 (한 화면에 묶어서 표시)
- **실시간**: 현재 접속자 수 (WebSocket, 15초 갱신)
- **회원/콘텐츠**: 전체 회원 수, 음원 수, 좋아요 수, 댓글 수
- **방문/트래픽**: 일일 방문자(유니크), 누적 방문자(유니크), 오늘 페이지뷰, 총 페이지뷰
- **수익 관련**: 총 충전된 크레딧

위 지표들을 **「통계」** 하나의 블록으로 묶고, 관리자 대시보드 최상단에 **「통계」** 제목을 두어 한눈에 들어오게 구성.

---

## 2. 광고 수익화 시 필요한 지표 제안

광고주에게 보여줄 수 있는 수치와, 수집·저장 방식 제안.

| 지표 | 설명 | 수집 방법 | 비고 |
|------|------|-----------|------|
| **접속자 수** | 실시간 동시 접속, 일일 유니크, 누적 유니크 | 이미 구현 (WebSocket + analytics_visits) | 유지 |
| **페이지뷰** | 오늘/전체 PV | 이미 구현 (analytics_visits) | 유지 |
| **IP 기반 유니크** | 같은 IP 여러 번 = 1명으로 집계 | 방문 시 IP 해시 저장 (개인정보 보호) | 새로 추가 시 ip_hash 등 |
| **접속 지역** | 국가/시·도/도시 | IP → GeoIP DB 또는 API (MaxMind GeoLite2 등) | country_code, region 저장 |
| **성별 (남/여)** | 남녀 비율 | 로그인 회원만, 프로필에 성별 선택 시 집계 | users.gender 추가 후 집계 |
| **연령대** | 10대/20대/… | 로그인 회원만, 생년월일 또는 연령대 선택 | users.birth_year 또는 age_group |
| **디바이스** | PC / 모바일 / 태블릿 | User-Agent 파싱 | device_type |
| **OS / 브라우저** | Windows, iOS, Chrome 등 | User-Agent 파싱 | os, browser |
| **유입 경로** | 검색, SNS, 직접 입력 | Referer, UTM 파라미터 저장 | referer_domain, utm_source 등 |

---

## 3. 데이터 모델 제안 (향후 확장용)

### 3.1 방문 로그 확장 (analytics_visits 또는 새 컬럼)

```
analytics_visits (현재)
  id, visited_at, visitor_key, path

추가 시 권장 컬럼 (선택)
  ip_hash          TEXT     -- IP를 해시한 값 (개인 식별 최소화)
  country_code     VARCHAR(2)  -- KR, US, JP ...
  region           VARCHAR(50) -- 서울, 경기, California ...
  device_type      VARCHAR(20) -- desktop, mobile, tablet
  referer_domain   TEXT     -- 유입 사이트
  utm_source       VARCHAR(100) -- 광고 캠페인 출처
```

- **IP 저장**: 개인정보 이슈 있으므로 **저장 시 해시만** 하거나, GeoIP 조회 후 **국가/지역만** 저장하고 IP는 버리는 방식 권장.
- **GeoIP**: 서버에서 MaxMind GeoLite2 (무료) 또는 유료 API로 IP → country_code, region 변환.

### 3.2 회원 인구통계 (성별·연령)

- **users** 테이블에 선택 항목 추가 시:
  - `gender` VARCHAR(10) — 'male', 'female', 'other', null
  - `birth_year` INTEGER 또는 `age_group` VARCHAR(10) — '10s','20s',…
- 집계: 관리자용 API에서 `COUNT(*) WHERE gender='male'` 등으로 제공. 광고용으로는 **비율만** 제공 (예: 남 40%, 여 60%).

---

## 4. API 제안 (향후)

- `GET /api/admin/stats/overview`  
  - 현재 통계 한 번에 (회원 수, 음원 수, 방문자, PV, 크레딧 충전 등)
- `GET /api/admin/stats/visitors?from=...&to=...`  
  - 기간별 일일 유니크/페이지뷰 (차트용)
- `GET /api/admin/stats/demographics`  
  - 성별/연령대 비율 (회원 한정, 있으면)
- `GET /api/admin/stats/regions`  
  - 국가/지역별 방문 수 (GeoIP 수집 시)
- `GET /api/admin/stats/devices`  
  - 디바이스/OS/브라우저 비율 (User-Agent 수집 시)

---

## 5. 구현 우선순위 제안

1. **즉시**: 관리자 화면에 **「통계」** 섹션 제목 추가, 기존 카드들을 이 섹션 안으로 정리.
2. **단기**: 기간별 방문자/PV (일별) 집계 및 간단 차트 — 광고 제안용 스크린샷에 유리.
3. **중기**: IP 해시 + GeoIP로 **접속 지역**(국가·지역) 수집 및 관리자 통계에 표시.
4. **선택**: 회원 프로필에 성별/연령대 선택 추가 후, 관리자 통계에 **성별/연령 비율** 표시.
5. **선택**: User-Agent 수집 후 **디바이스/OS/브라우저** 비율 표시.

---

## 6. 개인정보 고지

- IP 수집·지역 추정 시 **개인정보처리방침**에 “접속 기록, 접속 지역 통계 수집” 등 명시 필요.
- IP는 **저장하지 않고** GeoIP 조회 후 국가/지역만 저장하는 방식이 리스크 최소화에 유리.
