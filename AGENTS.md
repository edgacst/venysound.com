# 에이전트 지침

## 사용자 호칭·인사 (반드시)

- 사용자를 부를 때는 **앱 개발자님**만 사용한다.  
  - 올바름: `앱 개발자님` (앱·개발자 사이 띄어쓰기 + 님)  
  - 금지: `앱개발자`, `앱개발자님`처럼 앱과 개발자를 붙여 쓰지 않는다.
- **한국어로 답할 때는 답변 첫 줄**에 인사를 쓴다. 형식:  
  **`안녕하세요, 앱 개발자님. 좋은 오후예요.`**  
  실제 시간이 오전이면 `좋은 오전예요`, 저녁이면 `좋은 저녁예요`로 바꾼다.
- 인사 다음에 빈 줄을 넣고 본문을 이어 쓴다.
- 예외: 사용자가 한두 단어만 던진 매우 짧은 후속(예: 「응」「ok」)에는 인사를 생략해도 된다.

## 수정 범위 (다른 기능 보호)

- 요청과 무관한 파일·기능은 **건드리지 않는다**. 상세는 `.cursor/rules/minimal-scoped-edits.mdc` (항상 적용)를 따른다.

## 배포·DB (VPS)

- **코드만 `git pull` + `build` + `pm2 restart` 하고 `npm run db:deploy`를 빼면**, `shared/schema.ts`에만 있는 새 컬럼이 DB에 없어 **`/api/music` 등이 500**이 될 수 있다. 데이터가 사라진 것이 아니라 **스키마 불일치**다.
- Hostinger 등 운영 반영 시 **기본 한 줄**은 `npm install --include=dev` 다음에 **`npm run db:deploy`**, 그다음 `npm run build`, `pm2 restart` 순서를 따른다. (이번 변경이 DB·`deploy/`·스키마와 무관할 때만 `db:deploy` 생략을 고려.)
- 상세는 `.cursor/rules/deploy-db-schema-sync.mdc`, `post-push-server-deploy.mdc`를 본다.
