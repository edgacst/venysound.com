import { HELP_SITE_ENTRIES, type HelpSiteEntry } from "./help-site-knowledge";

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
  href?: string;
  score: number;
};

function scoreEntry(queryNorm: string, tokens: string[], e: HelpSiteEntry): number {
  const blob = normalizeText(
    [e.id, e.title, e.summary, ...(e.keywords ?? [])].join(" "),
  );
  let score = 0;
  if (queryNorm.length >= 2 && blob.includes(queryNorm)) score += 14;
  for (const t of tokens) {
    if (t.length < 2) continue;
    if (blob.includes(t)) score += 4;
  }
  const titleN = normalizeText(e.title);
  const summaryN = normalizeText(e.summary);
  for (const t of tokens) {
    if (t.length < 2) continue;
    if (titleN.includes(t)) score += 3;
    if (summaryN.includes(t)) score += 1;
  }
  return score;
}

/**
 * 키워드·제목·요약 포함 여부로 단순 점수화(외부 API 없음).
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
      href: e.href,
      score,
    });
  }

  hits.sort(
    (a, b) => b.score - a.score || a.title.localeCompare(b.title, "ko"),
  );
  return hits.slice(0, limit);
}
