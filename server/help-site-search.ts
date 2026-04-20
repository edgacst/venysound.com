import { HELP_SITE_ENTRIES, type HelpSiteEntry } from "./help-site-knowledge";

/** 홈 챗봇에 노출할 예상 질문 샘플(지식 항목의 `questions`에서 수집) */
export const HELP_SEARCH_SUGGESTIONS: string[] = (() => {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const e of HELP_SITE_ENTRIES) {
    for (const q of e.questions ?? []) {
      const t = q.trim();
      if (!t || seen.has(t)) continue;
      seen.add(t);
      out.push(t);
      if (out.length >= 12) return out;
    }
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
  /** 사용자에게 보여줄 본문 */
  answer: string;
  href?: string;
  score: number;
};

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
  let score = 0;
  if (queryNorm.length >= 2 && blob.includes(queryNorm)) score += 14;

  for (const t of tokens) {
    if (t.length < 2) continue;
    if (blob.includes(t)) score += 4;
  }

  for (const qPhrase of e.questions ?? []) {
    const qn = normalizeText(qPhrase);
    if (qn.length < 3) continue;
    if (queryNorm.includes(qn) || qn.includes(queryNorm)) score += 22;
    for (const t of tokens) {
      if (t.length < 2) continue;
      if (qn.includes(t)) score += 6;
    }
  }

  const titleN = normalizeText(e.title);
  const summaryN = normalizeText(e.summary);
  const answerN = normalizeText(e.answer);
  for (const t of tokens) {
    if (t.length < 2) continue;
    if (titleN.includes(t)) score += 3;
    if (summaryN.includes(t)) score += 1;
    if (answerN.includes(t)) score += 1;
  }
  return score;
}

/**
 * 예상 질문·키워드·답변 텍스트로 단순 점수화(외부 API 없음).
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
