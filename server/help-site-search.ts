import { HELP_SITE_ENTRIES, type HelpSiteEntry } from "./help-site-knowledge";

/** 홈 챗봇 칩: 항목마다 한 문장씩 돌아가며 뽑음 */
export const HELP_SEARCH_SUGGESTIONS: string[] = (() => {
  const lists = HELP_SITE_ENTRIES.map((e) => (e.questions ?? []).filter(Boolean));
  const out: string[] = [];
  const seen = new Set<string>();
  let round = 0;
  while (out.length < 12) {
    let any = false;
    for (const qs of lists) {
      const t = qs[round]?.trim();
      if (!t || seen.has(t)) continue;
      seen.add(t);
      out.push(t);
      any = true;
      if (out.length >= 12) break;
    }
    if (!any) break;
    round++;
  }
  return out;
})();

function normalizeText(s: string): string {
  return s.normalize("NFC").trim().toLowerCase();
}

function tokenizeQuery(q: string): string[] {
  const n = normalizeText(q);
  if (n.length < 2) return [];
  const parts = n.split(/[\s,.!?~…、，]+/).filter((p) => p.length >= 2);
  const uniq = new Set<string>(parts);
  if (uniq.size === 0 && n.length >= 2) uniq.add(n);
  return [...uniq];
}

export type HelpSearchHit = {
  id: string;
  title: string;
  summary: string;
  answer: string;
  href?: string;
  score: number;
};

/**
 * 3글자 이상: 질의에 부분 문자열로 포함되면 매칭.
 * 2글자: 질의 전체와 같거나, 토큰 중 하나와 정확히 같을 때만(넓은 단어 오매칭 방지).
 * 짧은 영숫자 약어(mp3 등)는 2글자 허용.
 */
function keywordMatchesQuery(queryNorm: string, kw: string, tokens: string[]): boolean {
  const kn = normalizeText(kw);
  if (kn.length < 2) return false;
  if (kn.length >= 3) return queryNorm.includes(kn);
  if (/^[a-z0-9]{2}$/i.test(kn) || /^(ai|mb)$/i.test(kn)) return queryNorm.includes(kn);
  return queryNorm === kn || tokens.includes(kn);
}

/**
 * 답변 본문·다른 항목 요약은 쓰지 않음 → 엉뚱한 교차 매칭 방지.
 * 예상 질문(questions) + 엄선 키워드(keywords) + 제목(title)만 사용.
 */
function scoreEntry(queryNorm: string, tokens: string[], e: HelpSiteEntry): number {
  let score = 0;
  const titleN = normalizeText(e.title);

  let qScore = 0;
  for (const qPhrase of e.questions ?? []) {
    const qn = normalizeText(qPhrase);
    if (qn.length < 3) continue;
    if (queryNorm === qn) {
      qScore = Math.max(qScore, 72);
      continue;
    }
    if (queryNorm.includes(qn)) {
      qScore = Math.max(qScore, 48);
      continue;
    }
    if (qn.includes(queryNorm)) {
      qScore = Math.max(qScore, queryNorm.length >= 4 ? 40 : 28);
      continue;
    }
    let qTok = 0;
    for (const t of tokens) {
      if (t.length < 3) continue;
      if (qn.includes(t)) qTok += 9;
    }
    qScore = Math.max(qScore, Math.min(qTok, 27));
  }
  score += qScore;

  for (const kw of e.keywords ?? []) {
    if (keywordMatchesQuery(queryNorm, kw, tokens)) score += 20;
  }

  let titleTok = 0;
  for (const t of tokens) {
    if (t.length < 2) continue;
    if (titleN.includes(t)) titleTok += t.length >= 3 ? 7 : 4;
  }
  score += Math.min(titleTok, 18);

  if (queryNorm.length >= 4 && titleN.includes(queryNorm)) score += 32;

  return score;
}

/** 최고점에 가깝지 않은 항목·너무 약한 매칭은 제외 */
function pruneHits(hits: HelpSearchHit[]): HelpSearchHit[] {
  if (hits.length === 0) return hits;
  const best = hits[0].score;
  if (best < 16) return [];
  const floor = Math.max(16, Math.floor(best * 0.62));
  const out = hits.filter((h) => h.score >= floor);
  return out.slice(0, Math.min(3, limit));
}

/**
 * 예상 질문·키워드·제목 기반 검색(본문 answer는 매칭에 사용하지 않음).
 */
export function searchHelpSiteKnowledge(
  rawQuery: string,
  opts?: { limit?: number },
): HelpSearchHit[] {
  const limit = Math.min(Math.max(opts?.limit ?? 8, 1), 20);
  const queryNorm = normalizeText(rawQuery).slice(0, 400);
  if (!queryNorm) return [];

  const tokens = tokenizeQuery(queryNorm);
  const hits: HelpSearchHit[] = [];

  for (const e of HELP_SITE_ENTRIES) {
    const score = scoreEntry(queryNorm, tokens, e);
    if (score <= 0) continue;
    hits.push({
      id: e.id,
      title: e.title,
      summary: e.summary,
      answer: e.answer,
      href: e.href,
      score,
    });
  }

  hits.sort(
    (a, b) => b.score - a.score || a.title.localeCompare(b.title, "ko"),
  );
  return pruneHits(hits);
}
