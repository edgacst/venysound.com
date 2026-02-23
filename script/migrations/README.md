# DB 마이그레이션 (서버 스키마 변경)

코드에서 **새 테이블이나 새 컬럼**을 추가했으면, 서버 DB에도 같은 변경을 해줘야 합니다.  
그래서 여기에 SQL 파일을 만들어 두고, **배포 전에** 서버에서 한 번만 실행하는 방식으로 쓰세요.

## 규칙

1. **shared/schema.ts** 또는 **shared/models/** 에 테이블/컬럼을 추가했으면 → 여기에 `YYYYMMDD-설명.sql` 파일을 하나 만든다.
2. 배포할 때 **코드 올리기 전에** 서버 DB에 그 SQL을 실행한다. (이미 실행한 파일은 다시 실행하지 않아도 됨. `IF NOT EXISTS` 로 안전하게 작성 권장)
3. 실행 예시 (서버 터미널):
   ```bash
   cd /var/www/venysound/app
   psql "postgresql://venysound:veny2024db@localhost:5432/venysounddb" -f script/migrations/파일이름.sql
   ```

## 이미 적용된 마이그레이션 (참고)

- **001-add-payload-donation-badge.sql** – notifications.payload, users.donation_badge 추가 (이미 서버에 적용됨)

이후 새로 스키마를 추가할 때마다 `002-xxx.sql`, `003-xxx.sql` 처럼 번호 붙여서 추가하면 됩니다.
