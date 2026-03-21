import crypto from "node:crypto";
import { and, count, desc, eq, gte, isNull, like, ne, sql } from "drizzle-orm";
import { db } from "./db";
import { sensitiveEmailOtpChallenges, users } from "../shared/schema";
import { isEmailConfigured, sendSensitiveOtpEmail } from "./email";
import { signCreditRefundProof } from "./sensitiveActionProof";

export const SENSITIVE_OTP_PURPOSE_CREDIT_REFUND = "credit_refund";

/** DB purpose 컬럼: account_email_verify:{normalizedEmail} */
export const SENSITIVE_OTP_ACCOUNT_EMAIL_PREFIX = "account_email_verify:";

export function normalizeAccountEmail(raw: string): string | null {
  const s = String(raw || "")
    .trim()
    .toLowerCase();
  if (!s || s.length > 254) return null;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)) return null;
  return s;
}

function accountEmailPurpose(normalizedEmail: string): string {
  return `${SENSITIVE_OTP_ACCOUNT_EMAIL_PREFIX}${normalizedEmail}`;
}

const OTP_TTL_MS = 10 * 60 * 1000;
const SEND_COOLDOWN_MS = 60 * 1000;
const MAX_SENDS_PER_HOUR = 5;
const MAX_VERIFY_ATTEMPTS = 5;

function otpPepper(): string {
  return process.env.SENSITIVE_OTP_PEPPER || process.env.SESSION_SECRET || "local-dev-secret-change-in-prod";
}

function hashOtpCode(userId: string, purpose: string, code: string): string {
  return crypto
    .createHash("sha256")
    .update(`${otpPepper()}:${userId}:${purpose}:${code}`, "utf8")
    .digest("hex");
}

function generateSixDigitCode(): string {
  return String(crypto.randomInt(0, 1_000_000)).padStart(6, "0");
}

export async function sendCreditRefundOtp(userId: string): Promise<{ ok: true } | { error: string; status: number }> {
  const [user] = await db.select({ email: users.email }).from(users).where(eq(users.id, userId)).limit(1);
  if (!user?.email || !String(user.email).trim()) {
    return { error: "계정에 등록된 이메일이 없습니다. 이메일이 있는 계정으로만 이메일 인증이 가능합니다.", status: 400 };
  }
  const email = String(user.email).trim();

  const isProd = process.env.NODE_ENV === "production";
  if (isProd && !isEmailConfigured()) {
    return { error: "메일 발송이 설정되지 않아 인증 코드를 보낼 수 없습니다. 관리자에게 문의해 주세요.", status: 503 };
  }

  const now = new Date();
  const hourAgo = new Date(now.getTime() - 60 * 60 * 1000);

  const [latest] = await db
    .select({ createdAt: sensitiveEmailOtpChallenges.createdAt })
    .from(sensitiveEmailOtpChallenges)
    .where(
      and(
        eq(sensitiveEmailOtpChallenges.userId, userId),
        eq(sensitiveEmailOtpChallenges.purpose, SENSITIVE_OTP_PURPOSE_CREDIT_REFUND)
      )
    )
    .orderBy(desc(sensitiveEmailOtpChallenges.createdAt))
    .limit(1);

  if (latest?.createdAt) {
    const last = new Date(latest.createdAt as Date).getTime();
    if (now.getTime() - last < SEND_COOLDOWN_MS) {
      return { error: "잠시 후 다시 요청해 주세요. (재전송은 1분에 한 번)", status: 429 };
    }
  }

  const [countResult] = await db
    .select({ c: count() })
    .from(sensitiveEmailOtpChallenges)
    .where(
      and(
        eq(sensitiveEmailOtpChallenges.userId, userId),
        eq(sensitiveEmailOtpChallenges.purpose, SENSITIVE_OTP_PURPOSE_CREDIT_REFUND),
        gte(sensitiveEmailOtpChallenges.createdAt, hourAgo)
      )
    );
  const sentLastHour = Number(countResult?.c ?? 0);
  if (sentLastHour >= MAX_SENDS_PER_HOUR) {
    return { error: "인증 코드 요청 횟수가 너무 많습니다. 1시간 후 다시 시도해 주세요.", status: 429 };
  }

  const code = generateSixDigitCode();
  const codeHash = hashOtpCode(userId, SENSITIVE_OTP_PURPOSE_CREDIT_REFUND, code);
  const expiresAt = new Date(now.getTime() + OTP_TTL_MS);

  let insertedId: number;
  try {
    const [inserted] = await db
      .insert(sensitiveEmailOtpChallenges)
      .values({
        userId,
        purpose: SENSITIVE_OTP_PURPOSE_CREDIT_REFUND,
        codeHash,
        expiresAt,
        verifyAttempts: 0,
      })
      .returning({ id: sensitiveEmailOtpChallenges.id });
    if (!inserted?.id) throw new Error("INSERT_FAILED");
    insertedId = inserted.id;
  } catch (e: unknown) {
    const msg = String((e as { message?: string })?.message || "");
    if (msg.toLowerCase().includes("sensitive_email_otp") && msg.toLowerCase().includes("relation")) {
      return {
        error:
          "DB에 sensitive_email_otp_challenges 테이블이 없습니다. npm run db:deploy 또는 deploy/sensitive-email-otp.sql을 적용해 주세요.",
        status: 500,
      };
    }
    console.error("[sensitiveOtp] insert error:", e);
    return { error: "인증 코드 발급에 실패했습니다", status: 500 };
  }

  try {
    if (isEmailConfigured()) {
      await sendSensitiveOtpEmail(email, { code, kind: "credit_refund" });
    } else {
      console.info(`[sensitiveOtp dev] user ${userId} credit_refund OTP: ${code} (SMTP 미설정)`);
    }
  } catch (e) {
    console.error("[sensitiveOtp] send email error:", e);
    await db.delete(sensitiveEmailOtpChallenges).where(eq(sensitiveEmailOtpChallenges.id, insertedId));
    return { error: "인증 메일 발송에 실패했습니다. 잠시 후 다시 시도해 주세요.", status: 500 };
  }

  return { ok: true };
}

export async function verifyCreditRefundOtp(
  userId: string,
  codeRaw: string
): Promise<{ refundProofToken: string } | { error: string; status: number }> {
  const code = String(codeRaw || "").replace(/\D/g, "").slice(0, 6);
  if (code.length !== 6) {
    return { error: "6자리 인증 코드를 입력해 주세요", status: 400 };
  }

  const now = new Date();
  let row: typeof sensitiveEmailOtpChallenges.$inferSelect | undefined;
  try {
    const rows = await db
      .select()
      .from(sensitiveEmailOtpChallenges)
      .where(
        and(
          eq(sensitiveEmailOtpChallenges.userId, userId),
          eq(sensitiveEmailOtpChallenges.purpose, SENSITIVE_OTP_PURPOSE_CREDIT_REFUND),
          isNull(sensitiveEmailOtpChallenges.consumedAt),
          gte(sensitiveEmailOtpChallenges.expiresAt, now)
        )
      )
      .orderBy(desc(sensitiveEmailOtpChallenges.id))
      .limit(1);
    row = rows[0];
  } catch (e: unknown) {
    const msg = String((e as { message?: string })?.message || "");
    if (msg.toLowerCase().includes("sensitive_email_otp") && msg.toLowerCase().includes("relation")) {
      return {
        error:
          "DB에 sensitive_email_otp_challenges 테이블이 없습니다. npm run db:deploy 또는 deploy/sensitive-email-otp.sql을 적용해 주세요.",
        status: 500,
      };
    }
    console.error("[sensitiveOtp] verify select error:", e);
    return { error: "인증 확인에 실패했습니다", status: 500 };
  }

  if (!row) {
    return { error: "유효한 인증 코드가 없습니다. 코드를 다시 요청해 주세요.", status: 400 };
  }

  const expectedHash = hashOtpCode(userId, SENSITIVE_OTP_PURPOSE_CREDIT_REFUND, code);
  let match = false;
  try {
    const a = Buffer.from(row.codeHash, "hex");
    const b = Buffer.from(expectedHash, "hex");
    if (a.length === b.length && a.length > 0) match = crypto.timingSafeEqual(a, b);
  } catch {
    match = false;
  }

  if (!match) {
    const attempts = (row.verifyAttempts ?? 0) + 1;
    await db
      .update(sensitiveEmailOtpChallenges)
      .set({
        verifyAttempts: attempts,
        ...(attempts >= MAX_VERIFY_ATTEMPTS ? { consumedAt: now } : {}),
      })
      .where(eq(sensitiveEmailOtpChallenges.id, row.id));
    if (attempts >= MAX_VERIFY_ATTEMPTS) {
      return { error: "인증 시도 횟수를 초과했습니다. 코드를 다시 요청해 주세요.", status: 400 };
    }
    return { error: "인증 코드가 올바르지 않습니다.", status: 401 };
  }

  await db.update(sensitiveEmailOtpChallenges).set({ consumedAt: now }).where(eq(sensitiveEmailOtpChallenges.id, row.id));

  return { refundProofToken: signCreditRefundProof(userId) };
}

/** SNS 등 이메일 없는 계정: 입력한 주소로 OTP 발송 후 검증 시 users.email 저장 */
export async function sendAccountEmailVerificationOtp(
  userId: string,
  emailRaw: string
): Promise<{ ok: true } | { error: string; status: number }> {
  const normalized = normalizeAccountEmail(emailRaw);
  if (!normalized) {
    return { error: "올바른 이메일 주소를 입력해 주세요.", status: 400 };
  }

  const [user] = await db
    .select({ id: users.id, email: users.email })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!user) return { error: "Unauthorized", status: 401 };

  if (user.email && String(user.email).trim()) {
    return {
      error: "이미 계정에 이메일이 등록되어 있습니다. 등록된 주소로 인증 코드를 요청해 주세요.",
      status: 400,
    };
  }

  const [other] = await db
    .select({ id: users.id })
    .from(users)
    .where(and(sql`lower(${users.email}) = ${normalized}`, ne(users.id, userId)))
    .limit(1);
  if (other) {
    return { error: "다른 계정에서 사용 중인 이메일입니다.", status: 409 };
  }

  const isProd = process.env.NODE_ENV === "production";
  if (isProd && !isEmailConfigured()) {
    return { error: "메일 발송이 설정되지 않아 인증 코드를 보낼 수 없습니다. 관리자에게 문의해 주세요.", status: 503 };
  }

  const purposeRow = accountEmailPurpose(normalized);
  const now = new Date();
  const hourAgo = new Date(now.getTime() - 60 * 60 * 1000);

  const [latest] = await db
    .select({ createdAt: sensitiveEmailOtpChallenges.createdAt })
    .from(sensitiveEmailOtpChallenges)
    .where(
      and(
        eq(sensitiveEmailOtpChallenges.userId, userId),
        like(sensitiveEmailOtpChallenges.purpose, `${SENSITIVE_OTP_ACCOUNT_EMAIL_PREFIX}%`)
      )
    )
    .orderBy(desc(sensitiveEmailOtpChallenges.createdAt))
    .limit(1);

  if (latest?.createdAt) {
    const last = new Date(latest.createdAt as Date).getTime();
    if (now.getTime() - last < SEND_COOLDOWN_MS) {
      return { error: "잠시 후 다시 요청해 주세요. (재전송은 1분에 한 번)", status: 429 };
    }
  }

  const [countResult] = await db
    .select({ c: count() })
    .from(sensitiveEmailOtpChallenges)
    .where(
      and(
        eq(sensitiveEmailOtpChallenges.userId, userId),
        like(sensitiveEmailOtpChallenges.purpose, `${SENSITIVE_OTP_ACCOUNT_EMAIL_PREFIX}%`),
        gte(sensitiveEmailOtpChallenges.createdAt, hourAgo)
      )
    );
  const sentLastHour = Number(countResult?.c ?? 0);
  if (sentLastHour >= MAX_SENDS_PER_HOUR) {
    return { error: "인증 코드 요청 횟수가 너무 많습니다. 1시간 후 다시 시도해 주세요.", status: 429 };
  }

  const code = generateSixDigitCode();
  const codeHash = hashOtpCode(userId, purposeRow, code);
  const expiresAt = new Date(now.getTime() + OTP_TTL_MS);

  let insertedId: number;
  try {
    const [inserted] = await db
      .insert(sensitiveEmailOtpChallenges)
      .values({
        userId,
        purpose: purposeRow,
        codeHash,
        expiresAt,
        verifyAttempts: 0,
      })
      .returning({ id: sensitiveEmailOtpChallenges.id });
    if (!inserted?.id) throw new Error("INSERT_FAILED");
    insertedId = inserted.id;
  } catch (e: unknown) {
    const msg = String((e as { message?: string })?.message || "");
    if (msg.toLowerCase().includes("sensitive_email_otp") && msg.toLowerCase().includes("relation")) {
      return {
        error:
          "DB에 sensitive_email_otp_challenges 테이블이 없습니다. npm run db:deploy 또는 deploy/sensitive-email-otp.sql을 적용해 주세요.",
        status: 500,
      };
    }
    console.error("[sensitiveOtp] account email insert error:", e);
    return { error: "인증 코드 발급에 실패했습니다", status: 500 };
  }

  try {
    if (isEmailConfigured()) {
      await sendSensitiveOtpEmail(normalized, { code, kind: "account_email" });
    } else {
      console.info(`[sensitiveOtp dev] user ${userId} account email OTP → ${normalized}: ${code} (SMTP 미설정)`);
    }
  } catch (e) {
    console.error("[sensitiveOtp] account email send error:", e);
    await db.delete(sensitiveEmailOtpChallenges).where(eq(sensitiveEmailOtpChallenges.id, insertedId));
    return { error: "인증 메일 발송에 실패했습니다. 잠시 후 다시 시도해 주세요.", status: 500 };
  }

  return { ok: true };
}

export async function verifyAccountEmailBind(
  userId: string,
  emailRaw: string,
  codeRaw: string
): Promise<{ ok: true } | { error: string; status: number }> {
  const normalized = normalizeAccountEmail(emailRaw);
  if (!normalized) {
    return { error: "올바른 이메일 주소를 입력해 주세요.", status: 400 };
  }
  const code = String(codeRaw || "").replace(/\D/g, "").slice(0, 6);
  if (code.length !== 6) {
    return { error: "6자리 인증 코드를 입력해 주세요", status: 400 };
  }

  const [user] = await db
    .select({ email: users.email })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!user) return { error: "Unauthorized", status: 401 };
  if (user.email && String(user.email).trim()) {
    return { error: "이미 이메일이 등록된 계정입니다.", status: 400 };
  }

  const purposeRow = accountEmailPurpose(normalized);
  const now = new Date();
  let row: typeof sensitiveEmailOtpChallenges.$inferSelect | undefined;
  try {
    const rows = await db
      .select()
      .from(sensitiveEmailOtpChallenges)
      .where(
        and(
          eq(sensitiveEmailOtpChallenges.userId, userId),
          eq(sensitiveEmailOtpChallenges.purpose, purposeRow),
          isNull(sensitiveEmailOtpChallenges.consumedAt),
          gte(sensitiveEmailOtpChallenges.expiresAt, now)
        )
      )
      .orderBy(desc(sensitiveEmailOtpChallenges.id))
      .limit(1);
    row = rows[0];
  } catch (e: unknown) {
    console.error("[sensitiveOtp] verifyAccountEmailBind select error:", e);
    return { error: "인증 확인에 실패했습니다", status: 500 };
  }

  if (!row) {
    return { error: "유효한 인증 코드가 없습니다. 코드를 다시 요청해 주세요.", status: 400 };
  }

  const expectedHash = hashOtpCode(userId, purposeRow, code);
  let match = false;
  try {
    const a = Buffer.from(row.codeHash, "hex");
    const b = Buffer.from(expectedHash, "hex");
    if (a.length === b.length && a.length > 0) match = crypto.timingSafeEqual(a, b);
  } catch {
    match = false;
  }

  if (!match) {
    const attempts = (row.verifyAttempts ?? 0) + 1;
    await db
      .update(sensitiveEmailOtpChallenges)
      .set({
        verifyAttempts: attempts,
        ...(attempts >= MAX_VERIFY_ATTEMPTS ? { consumedAt: now } : {}),
      })
      .where(eq(sensitiveEmailOtpChallenges.id, row.id));
    if (attempts >= MAX_VERIFY_ATTEMPTS) {
      return { error: "인증 시도 횟수를 초과했습니다. 코드를 다시 요청해 주세요.", status: 400 };
    }
    return { error: "인증 코드가 올바르지 않습니다.", status: 401 };
  }

  await db.update(sensitiveEmailOtpChallenges).set({ consumedAt: now }).where(eq(sensitiveEmailOtpChallenges.id, row.id));

  try {
    await db
      .update(users)
      .set({ email: normalized, updatedAt: new Date() })
      .where(eq(users.id, userId));
  } catch (e: unknown) {
    const msg = String((e as { message?: string })?.message || "");
    if (msg.toLowerCase().includes("unique") || msg.toLowerCase().includes("duplicate")) {
      return { error: "다른 계정에서 사용 중인 이메일입니다.", status: 409 };
    }
    console.error("[sensitiveOtp] verifyAccountEmailBind update error:", e);
    return { error: "이메일 저장에 실패했습니다", status: 500 };
  }

  return { ok: true };
}
