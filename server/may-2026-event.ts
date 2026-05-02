import { eq, and, desc, sql, lte, or, isNull, isNotNull } from "drizzle-orm";
import { db } from "./db";
import { users, may2026EventApplications } from "../shared/schema";

/** 관리자 승인 시 지급하는 이벤트 AI 전용 금액(원) */
export const MAY_2026_EVENT_PROMO_GRANT_WON = 3000;

/** 한국시간 2026-05-01 00:00 ~ 2026-05-31 23:59:59 가입분 (exclusive 상한: 2026-06-01 00:00 KST) */
export function may2026SignupWindowStartUtc(): Date {
  return new Date("2026-04-30T15:00:00.000Z");
}

export function may2026SignupWindowEndExclusiveUtc(): Date {
  return new Date("2026-05-31T15:00:00.000Z");
}

/** 이벤트 전용 잔액 만료: 2026-06-01 00:00 KST */
export function may2026PromoWalletExpiresAtUtc(): Date {
  return new Date("2026-05-31T15:00:00.000Z");
}

export function isUserCreatedInMay2026CampaignWindow(createdAt: Date | null | undefined): boolean {
  if (!createdAt || !(createdAt instanceof Date) || isNaN(createdAt.getTime())) return false;
  const t = createdAt.getTime();
  return t >= may2026SignupWindowStartUtc().getTime() && t < may2026SignupWindowEndExclusiveUtc().getTime();
}

/** 만료된 프로모 잔액을 0으로 정리 (승인 시 만료 시각이 저장됨) */
export async function voidExpiredPromoAiCreditsForUser(userId: string, now = new Date()): Promise<void> {
  const campaignEnd = may2026PromoWalletExpiresAtUtc();
  await db
    .update(users)
    .set({ promoAiCreditsWon: 0, promoAiCreditsExpiresAt: null, updatedAt: new Date() })
    .where(
      and(
        eq(users.id, userId),
        sql`COALESCE(${users.promoAiCreditsWon}, 0) > 0`,
        or(
          and(isNotNull(users.promoAiCreditsExpiresAt), lte(users.promoAiCreditsExpiresAt, now)),
          and(isNull(users.promoAiCreditsExpiresAt), lte(campaignEnd, now)),
        ),
      ),
    );
}

export async function getMay2026EventApplicationForUser(userId: string) {
  const [row] = await db
    .select()
    .from(may2026EventApplications)
    .where(eq(may2026EventApplications.userId, userId))
    .orderBy(desc(may2026EventApplications.createdAt))
    .limit(1);
  return row ?? null;
}

export async function userHasApprovedMay2026Event(userId: string): Promise<boolean> {
  const row = await getMay2026EventApplicationForUser(userId);
  return row?.status === "approved";
}
