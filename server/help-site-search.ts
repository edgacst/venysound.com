import { HELP_SITE_ENTRIES, type HelpSiteEntry } from "./help-site-knowledge";

/** 홈 챗봇 칩: 항목마다 한 문장씩 돌아가며 뽑아 업로드만 연속 노출되지 않게 함 */
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
 * 질의 문자열 안에 키워드가 부분 문자열로 들어가면 점수 부여(띄어쓰기 없는 한국어 대응).
 */
function scoreKeywordSubstrings(queryNorm: string, e: HelpSiteEntry): number {
  let s = 0;
  const seen = new Set<string>();
  for (const kw of e.keywords ?? []) {
    const kn = normalizeText(kw);
    if (kn.length < 2 || seen.has(kn)) continue;
    seen.add(kn);
    if (queryNorm.includes(kn)) s += 14;
  }
  return s;
}

function scoreEntry(queryNorm: string, tokens: string[], e: HelpSiteEntry): number {
  const questionsJoined = (e.questions ?? []).map(normalizeText).join(" ");
  const blob = normalizeText(
    [
      e.id,
      e.title,
      e.summary,
      e.answer,
      ...(e.keywords ?? []),
      questionsJoined,
    ].join(" "),
  );
  let score = scoreKeywordSubstrings(queryNorm, e);

  if (queryNorm.length >= 2 && blob.includes(queryNorm)) score += 16;

  for (const t of tokens) {
    if (t.length < 2) continue;
    if (blob.includes(t)) score += 5;
  }

  for (const qPhrase of e.questions ?? []) {
    const qn = normalizeText(qPhrase);
    if (qn.length < 2) continue;
    if (queryNorm.includes(qn) || qn.includes(queryNorm)) score += 24;
    for (const t of tokens) {
      if (t.length < 2) continue;
      if (qn.includes(t)) score += 7;
    }
  }

  const titleN = normalizeText(e.title);
  const summaryN = normalizeText(e.summary);
  const answerN = normalizeText(e.answer);
  for (const t of tokens) {
    if (t.length < 2) continue;
    if (titleN.includes(t)) score += 4;
    if (summaryN.includes(t)) score += 2;
    if (answerN.includes(t)) score += 2;
  }
  return score;
}

/**
 * 예상 질문·키워드(부분 문자열)·답변 텍스트로 점수화(외부 API 없음).
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
  return hits.slice(0, limit);
}
