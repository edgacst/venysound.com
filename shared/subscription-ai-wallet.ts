/** 구독 AI 예산 지갑(이월·12개월 만료·월 정기 충전) */

export type AiWalletChunk = { won: number; creditedAt: string };

/** 12개월(365일) 후 만료 */
export const AI_SUBSCRIPTION_WALLET_EXPIRY_MS = 365 * 24 * 60 * 60 * 1000;

export function parseAiWallet(raw: unknown): AiWalletChunk[] {
  if (!Array.isArray(raw)) return [];
  const out: AiWalletChunk[] = [];
  for (const x of raw) {
    if (!x || typeof x !== "object") continue;
    const w = Math.floor(Number((x as { won?: unknown }).won));
    const c = String((x as { creditedAt?: unknown }).creditedAt ?? "").trim();
    if (!Number.isFinite(w) || w <= 0 || !c) continue;
    out.push({ won: w, creditedAt: c });
  }
  return out;
}

export function pruneAiWallet(chunks: AiWalletChunk[], now: Date): AiWalletChunk[] {
  return chunks.filter((ch) => {
    const ct = new Date(ch.creditedAt).getTime();
    if (Number.isNaN(ct)) return false;
    return true;
  });
}

export function sumAiWallet(chunks: AiWalletChunk[]): number {
  return chunks.reduce((s, c) => s + c.won, 0);
}

export function appendAiWalletGrant(chunks: AiWalletChunk[], won: number, now: Date): AiWalletChunk[] {
  const n = Math.max(0, Math.floor(won));
  if (n <= 0) return [...chunks];
  return [...chunks, { won: n, creditedAt: now.toISOString() }];
}

/** creditedAt 오래된 청크부터 차감(만료 임박분 우선 소진에 가깝게 FIFO) */
export function deductAiWalletFifo(chunks: AiWalletChunk[], amount: number, now: Date): AiWalletChunk[] | null {
  const pruned = pruneAiWallet(chunks, now);
  const sorted = [...pruned].sort((a, b) => new Date(a.creditedAt).getTime() - new Date(b.creditedAt).getTime());
  let need = Math.floor(amount);
  if (need <= 0) return sorted;
  const total = sorted.reduce((s, c) => s + c.won, 0);
  if (total < need) return null;
  const out: AiWalletChunk[] = [];
  for (const ch of sorted) {
    if (need <= 0) {
      out.push(ch);
      continue;
    }
    if (ch.won <= need) {
      need -= ch.won;
      continue;
    }
    out.push({ won: ch.won - need, creditedAt: ch.creditedAt });
    need = 0;
  }
  return out;
}
