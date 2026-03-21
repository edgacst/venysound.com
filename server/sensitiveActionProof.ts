import crypto from "node:crypto";

const PURPOSE_CREDIT_REFUND = "credit_refund";
const PROOF_TTL_SEC = 600;

function proofSecret(): string {
  return process.env.SENSITIVE_ACTION_PROOF_SECRET || process.env.SESSION_SECRET || "local-dev-secret-change-in-prod";
}

export function signCreditRefundProof(userId: string): string {
  const exp = Math.floor(Date.now() / 1000) + PROOF_TTL_SEC;
  const payload = Buffer.from(
    JSON.stringify({ sub: userId, p: PURPOSE_CREDIT_REFUND, exp }),
    "utf8"
  ).toString("base64url");
  const sig = crypto.createHmac("sha256", proofSecret()).update(payload).digest("hex");
  return `${payload}.${sig}`;
}

export function verifyCreditRefundProof(token: unknown, userId: string): boolean {
  if (typeof token !== "string" || !token.includes(".")) return false;
  const dot = token.lastIndexOf(".");
  const payload = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  if (!payload || !/^[a-f0-9]{64}$/i.test(sig)) return false;
  const expect = crypto.createHmac("sha256", proofSecret()).update(payload).digest("hex");
  const a = Buffer.from(sig, "hex");
  const b = Buffer.from(expect, "hex");
  if (a.length !== b.length) return false;
  if (!crypto.timingSafeEqual(a, b)) return false;
  try {
    const raw = Buffer.from(payload, "base64url").toString("utf8");
    const data = JSON.parse(raw) as { sub?: string; p?: string; exp?: number };
    if (data.sub !== userId || data.p !== PURPOSE_CREDIT_REFUND) return false;
    if (typeof data.exp !== "number" || data.exp < Math.floor(Date.now() / 1000)) return false;
    return true;
  } catch {
    return false;
  }
}
