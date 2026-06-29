import type { Express, Request, Response } from "express";
import { createServer, type Server } from "http";
import path from "path";
import crypto from "crypto";
import { execSync } from "child_process";
import { existsSync, readFileSync, createReadStream, mkdirSync, statSync, readdirSync, lstatSync, createWriteStream, writeFileSync } from "fs";
import archiver from "archiver";
import { storage, getCanonicalMusicGenreLabels } from "./storage";
import { parseAdminRevenueRangeQuery } from "./admin-revenue-range";
import { submitDistributionReleaseToDistributor } from "./distribution/submitDistributor";
import { translateAnnouncementContent } from "./translate";
import { api, errorSchemas } from "@shared/routes";
import { z } from "zod";
import { setupAuth, isAuthenticated, registerAuthRoutes } from "./auth";
import { registerObjectStorageRoutes, ObjectStorageService, ObjectNotFoundError } from "./localObjectStorage";
import { generateImageBuffer } from "./imageClient";
import { alignLyricsToAudio } from "./lyricsAlign";
import { generatePromoSocialKit } from "./promoSocialKit";
import {
  sendNewMusicNotificationEmail,
  sendSocialActivityEmail,
  sendSubscriptionEmail,
  isEmailConfigured,
  type ActivityEmailKind,
} from "./email";
import { registerAiMusicScorePdfRoutes } from "./ai-music-score-pdf";
import {
  buildKieLyricsPrompt,
  kieGenerateLyrics,
  mapOpenAiError,
  openaiGenerateStudioLyrics,
  openaiOptimizeStudioLyrics,
} from "./aiMusicStudioLyrics";
import { kieUploadAudioBuffer, resolveSunoStyleFileUploadBase } from "./kieFileUpload";
import { formatKieApiUserMessage, formatKieVoiceUserMessage } from "@shared/kieVoiceUserMessage";
import {
  kieVoiceGenerate,
  kieVoiceRecordInfo,
  kieVoiceValidateInfo,
  kieVoiceValidateSource,
  sunoModelSupportsVoicePersona,
} from "./kieSunoVoice";
import multer from "multer";
import { verifyCreditRefundProof } from "./sensitiveActionProof";
import { getClientIpForGeo } from "./client-ip";
import { encodeRingtoneClipMp3, RINGTONE_FEE_WON } from "./ringtoneClip";
import { sendPushNotification } from "./push";
import { WebSocketServer, WebSocket } from "ws";
import {
  subscriptionPlans,
  payments,
  aiMusicUsage,
  aiMusicGenerationLogs,
  aiMusicSavedTracks,
  aiMusicUserVoices,
  musicVideos,
  musicVideoCommentLikes,
  musicVideoComments,
  musicVideoLikes,
  musicVideoPurchases,
} from "../shared/models/auth";
import { db } from "./db";
import {
  users,
  streamingLogs,
  music,
  announcements,
  follows,
  notifications,
  insertAnnouncementSchema,
  musicStories as musicStoriesTable,
  postComments,
  creditTransactions,
  creditRefundRequests,
  creditRefundEvents,
  may2026EventApplications,
} from "../shared/schema";
import { eq, sql, inArray, and, or, desc, asc, gte } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import geoip from "geoip-lite";
import { getLoginPagePath, getRegisterPagePath, getAdminPagePath } from "./site-paths";
import { searchHelpSiteKnowledge, HELP_SEARCH_SUGGESTIONS } from "./help-site-search";
import { fetchInternationalReleasesPage, getEnvInternationalFromUserIds } from "./spotify-international";
import { parseSpotifyAlbumIdFromUserInput } from "@shared/spotify-album-id";
import { isAllowedSignupConversionEvent } from "@shared/analytics-conversion-events";
import { walletSupplyWonFromTotalPaymentVatInclusive, WALLET_TOPUP_MIN_TOTAL_WON } from "@shared/credits-pricing";
import {
  normalizeSubscriptionPlanPrices,
  subscriptionTotalVatInclusiveWon,
  SUBSCRIPTION_PLAN_FALLBACK,
  isPaidSubscriptionTierId,
  PAID_SUBSCRIPTION_TIER_IDS,
  apiUploaderSubscriptionTierForClient,
  type PaidSubscriptionTierId,
} from "@shared/subscription-plan-pricing";
import {
  FREE_AI_MUSIC_LIMIT_PER_MONTH,
  AI_MUSIC_WON_PER_TRACK,
  AI_MUSIC_MONTHLY_WON_BUDGET_BY_TIER,
  isSubscriptionAiWalletDepleted,
  isUserPaidSubscriptionActive,
  sumRemainingSubscriptionAiWallet,
  getAiMusicMonthlyUsageLimit,
  getAiMusicUsagePeriodKey,
  computeDisplayedSubscriptionFromEntitlements,
  subscriptionRowNeedsSync,
  buildEntitlementsView,
  mergeEntitlementExpiry,
  getActivePaidTierIds,
  pruneExpiredEntitlements,
  parseIsoDate,
} from "@shared/subscription-entitlements";
import {
  syncSubscriptionAiWalletForPaidUser,
  deductSubscriptionAiWallet,
  adminSetSubscriptionAiPeriodConsumedWon,
  adminRebuildSubscriptionAiWalletToPlanOnly,
} from "./subscription-ai-wallet";
import { appendAiWalletGrant, parseAiWallet, pruneAiWallet } from "@shared/subscription-ai-wallet";
import {
  runSubscriptionAiBudgetExhaustionIfNeeded,
  ensurePaidUserSubscriptionAiExhaustedIfWalletDepleted,
} from "./subscription-ai-budget-exhaustion";
import { setNotificationRealtimeSender } from "./realtime-notify";
import { getPayupCredentials } from "./payup/config";
import { signPayupDirectOrder } from "./payup/signing";
import { payupPostJson, payupPostUrlEncodedJson } from "./payup/http";
import { payupDirectPostPayUrl } from "./payup/direct-pay";
import { payupPostPartCancel } from "./payup/part-cancel";
import { payupPostCancel2 } from "./payup/cancel";
import { revertPayupCardSubscriptionPaymentById, payupMetaTransactionIdFromPayupMeta } from "./payup/revert-payup-subscription";
import {
  flattenPayupWebhookPayload,
  tryRevertPaidPayupSubscriptionFromNotifyFlat,
  payupInquiryFlatIndicatesSuccessfulAuth0000,
  payupInquiryFlatExpectOrderMatch,
  payupInquiryFlatAmountMatchesIfPresent,
  payupInquiryFlatPickTransactionId,
} from "./payup/payup-webhook-notify";
import { payupHttpReconcileTransactionCancelled } from "./payup/txn-reconcile-http";
import {
  voidExpiredPromoAiCreditsForUser,
  isUserCreatedInMay2026CampaignWindow,
  MAY_2026_EVENT_PROMO_GRANT_TRACKS,
  MAY_2026_EVENT_PROMO_TRACKS_PER_GENERATION,
  MAY_2026_EVENT_APPROVED_MEMBER_CAP,
  may2026PromoWalletExpiresAtUtc,
  may2026SignupWindowEndExclusiveUtc,
  may2026SignupWindowStartUtc,
  getMay2026EventApplicationForUser,
  userHasApprovedMay2026Event,
  countMay2026ApprovedMembers,
} from "./may-2026-event";

/** 라디오 채널 카페 홈페이지 — http/https만 허용, 스킴 생략 시 https 부여 */
function normalizeRadioHomepageUrl(input: unknown): { ok: true; value: string | null } | { ok: false } {
  if (input === null || input === undefined) return { ok: true, value: null };
  const s = typeof input === "string" ? input.trim() : "";
  if (!s) return { ok: true, value: null };
  let urlStr = s;
  if (!/^https?:\/\//i.test(urlStr)) {
    urlStr = "https://" + urlStr.replace(/^\/+/, "");
  }
  try {
    const u = new URL(urlStr);
    if (u.protocol !== "http:" && u.protocol !== "https:") return { ok: false };
    u.username = "";
    u.password = "";
    const out = u.toString();
    if (out.length > 500) return { ok: false };
    return { ok: true, value: out };
  } catch {
    return { ok: false };
  }
}

/** 활성 유료 entitlement 가 하나라도 있으면 true (복수 플랜 합산 기준) */
function saveBufferToLocalUploads(buffer: Buffer, extension: string): string {
  const ext = extension.startsWith(".") ? extension : `.${extension}`;
  const uploadsDir = path.resolve(process.cwd(), "local-uploads", "uploads");
  mkdirSync(uploadsDir, { recursive: true });
  const filename = `${crypto.randomUUID()}${ext}`;
  writeFileSync(path.join(uploadsDir, filename), buffer);
  return `/objects/uploads/${filename}`;
}

function isActivePaidSubscription(
  user:
    | { subscriptionTier?: string | null; subscriptionExpiresAt?: Date | null; subscriptionEntitlements?: unknown }
    | undefined,
  now: Date,
): boolean {
  return isUserPaidSubscriptionActive(user, now);
}

/** 결제 직전 기준: 해당 tier가 이미 유효하면 갱신, 아니면 신규 구독 완료로 본다 */
function subscriptionPaymentEmailKind(
  user: { subscriptionEntitlements?: unknown; subscriptionTier?: string | null; subscriptionExpiresAt?: Date | null },
  now: Date,
  paidTier: PaidSubscriptionTierId,
): "started" | "renewed" {
  const view = pruneExpiredEntitlements(
    buildEntitlementsView(user.subscriptionEntitlements, user.subscriptionTier, user.subscriptionExpiresAt, now),
    now,
  );
  return getActivePaidTierIds(view, now).includes(paidTier) ? "renewed" : "started";
}

/** 구독 결제 완료 시 마이페이지·/notifications 에 표시되는 인앱 알림 (이메일과 별도) */
async function notifyUserSubscriptionPaidInApp(input: {
  userId: string;
  tierPaid: PaidSubscriptionTierId;
  billingPeriod: string | null | undefined;
  amountWon: number;
  source: "payup_card" | "bank_transfer";
}): Promise<void> {
  const labels: Record<string, string> = {
    starter: "Starter",
    basic: "Basic",
    pro: "Pro",
    premium: "Premium",
  };
  const planLabel = labels[input.tierPaid] ?? input.tierPaid;
  const bp = input.billingPeriod === "yearly" || input.billingPeriod === "monthly" ? input.billingPeriod : null;
  const periodLabel = bp === "yearly" ? "연간" : bp === "monthly" ? "월간" : "";
  const message = periodLabel
    ? `${planLabel} ${periodLabel} 구독 결제가 완료되었습니다. 멤버십·이용 기간은 마이페이지에서 확인할 수 있습니다.`
    : `${planLabel} 구독 결제가 완료되었습니다. 멤버십·이용 기간은 마이페이지에서 확인할 수 있습니다.`;
  try {
    await storage.createNotification({
      userId: input.userId,
      type: "system",
      message,
      payload: {
        subscriptionPaid: true,
        planId: input.tierPaid,
        billingPeriod: bp,
        amountWon: input.amountWon,
        source: input.source,
      },
      url: `/profile/${input.userId}`,
    });
  } catch (e) {
    console.error("[subscription] in-app notify failed", e);
  }
}

const PAID_PLAN_IDS_FOR_PAYMENTS = [...PAID_SUBSCRIPTION_TIER_IDS] as string[];

/** [페이업] 인증결제 DANAL 다이렉트 — 주문(order) 후 결제창·auth_return·payUrl 승인 대기 */
const PAYUP_SUBSCRIPTION_PAYMENT_KEY = "payup_direct";

async function userHasAnyPaidSubscriptionPayment(userId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: payments.id })
    .from(payments)
    .where(
      and(
        eq(payments.userId, userId),
        eq(payments.status, "paid"),
        inArray(payments.plan, PAID_PLAN_IDS_FOR_PAYMENTS),
      ),
    )
    .limit(1);
  return Boolean(row);
}

async function resetUserSubscriptionToFree(userId: string): Promise<void> {
  await db
    .update(users)
    .set({
      subscriptionEntitlements: sql`'{}'::jsonb`,
      subscriptionTier: "free",
      subscriptionExpiresAt: null,
      subscriptionPlan: null,
      subscriptionAiBudgetExhaustionNoticeKey: null,
      subscriptionAiWallet: sql`'[]'::jsonb`,
      subscriptionAiPeriodKey: null,
      subscriptionAiPeriodConsumedWon: 0,
      tossBillingKey: null,
      tossCustomerKey: null,
      updatedAt: new Date(),
    })
    .where(eq(users.id, userId));
}

/** 유료 표시·지갑은 있는데 paid 구독 결제가 없으면 무료로 맞춤 (카드 취소·환불 후 DB 불일치) */
async function ensureUserSubscriptionBackedByPaidPayment(
  userId: string,
  now: Date,
): Promise<"downgraded" | "unchanged"> {
  const [user] = await db.select().from(users).where(eq(users.id, userId));
  if (!user || !isUserPaidSubscriptionActive(user, now)) return "unchanged";
  if (await userHasAnyPaidSubscriptionPayment(userId)) return "unchanged";
  await resetUserSubscriptionToFree(userId);
  return "downgraded";
}

/** 구독 해지·요금 조회 전 — 최신 페이업 paid 건이 PG에서 취소됐는지 조회해 되돌림 시도 */
async function tryReconcileLatestPaidPayupSubscriptionForUser(userId: string): Promise<boolean> {
  return tryReconcileAllPaidPayupSubscriptionsForUser(userId);
}

/** 로그인 사용자의 paid 페이업 구독 건을 PG 조회로 취소·환불 여부 동기화 */
async function tryReconcileAllPaidPayupSubscriptionsForUser(userId: string): Promise<boolean> {
  const pathSet = (process.env.PAYUP_TXN_RECONCILE_PATH ?? "").trim().length > 0;
  if (!pathSet) return false;
  const rows = await db
    .select()
    .from(payments)
    .where(
      and(
        eq(payments.userId, userId),
        eq(payments.status, "paid"),
        inArray(payments.plan, PAID_PLAN_IDS_FOR_PAYMENTS),
        or(
          sql`${payments.paymentKey} ILIKE 'payup:%'`,
          and(
            sql`coalesce(trim(${payments.payupMeta}->>'txnId'), '') <> ''`,
            sql`coalesce(${payments.paymentKey}, '') <> 'bank_transfer'`,
          ),
        ),
      ),
    )
    .orderBy(desc(payments.createdAt))
    .limit(8);
  let downgraded = false;
  for (const row of rows) {
    if (!isPayupPaidSubscriptionPayment(row)) continue;
    const recon = await reconcilePayupCardSubscriptionPaymentStatusFromPg(
      row,
      "payup_admin_auto_reconcile",
    );
    if (recon.ok && recon.action === "refunded" && recon.downgradedUser) {
      downgraded = true;
    }
  }
  return downgraded;
}

async function subscriptionMeTierForUser(userId: string, now: Date): Promise<string> {
  const [user] = await db.select().from(users).where(eq(users.id, userId));
  if (!user || !isUserPaidSubscriptionActive(user, now)) return "free";
  const tier = String(user.subscriptionTier ?? "free").trim().toLowerCase();
  return isPaidSubscriptionTierId(tier) ? tier : "free";
}

/**
 * PG 결제창 취소·실패 복귀(?payup=cancel|fail) — 해당 주문 기준으로 pending 정리·PG 취소 동기화·구독 보정.
 */
async function alignSubscriptionAfterPayupCheckoutAbandon(
  userId: string,
  orderNumber: string,
  outcome: "cancel" | "fail",
): Promise<{ tier: string; downgraded: boolean }> {
  const now = new Date();
  const orderUpper = orderNumber.trim().toUpperCase();
  const [row] = await db.select().from(payments).where(eq(payments.orderId, orderUpper)).limit(1);

  if (row && row.userId === userId) {
    const meta = (row.payupMeta && typeof row.payupMeta === "object" ? row.payupMeta : {}) as Record<string, unknown>;
    const st = String(row.status ?? "").trim().toLowerCase();
    const pk = String(row.paymentKey ?? "").trim();
    const alreadyNotified =
      typeof meta.abandonNotifiedAt === "string" && meta.abandonNotifiedAt.length >= 10;
    if (!alreadyNotified) {
      const message =
        outcome === "cancel"
          ? "카드 구독 결제를 취소하셨습니다. 청구·승인 여부는 카드사·페이업 내역에서 확인할 수 있습니다."
          : "카드 구독 결제가 승인 단계에서 완료되지 않았습니다. 잠시 후 다시 시도하거나 계좌이체를 이용해 주세요.";
      try {
        await storage.createNotification({
          userId,
          type: "system",
          message,
          payload: { payupAbandon: true, orderId: orderUpper, outcome },
          url: "/pricing",
        });
      } catch (e) {
        console.error("[payup] align abandon notification", e);
      }
    }

    if (st === "pending" && pk === PAYUP_SUBSCRIPTION_PAYMENT_KEY) {
      let markRefunded = false;
      const pathSet = (process.env.PAYUP_TXN_RECONCILE_PATH ?? "").trim().length > 0;
      const cred = pathSet ? getPayupCredentials() : null;
      const tid = payupMetaTransactionIdFromPayupMeta(row.payupMeta);
      if (pathSet && cred?.ok && tid) {
        const pg = await payupHttpReconcileTransactionCancelled(cred, tid);
        if (pg.ok && "cancelledAtPg" in pg && pg.cancelledAtPg === true) {
          markRefunded = true;
        } else if (pg.ok && "cancelledAtPg" in pg && pg.cancelledAtPg === false) {
          markRefunded = false;
        } else if (!pg.ok || ("skipped" in pg && pg.skipped)) {
          /** PG 조회 불가 — 결제창에서 취소 복귀면 미승인 pending 으로 간주 */
          markRefunded = outcome === "cancel";
        }
      } else {
        /** txn·조회 URL 없음 — PG 취소 복귀 시 pending 은 결제 미완료로 정리 */
        markRefunded = true;
      }
      if (markRefunded) {
        await db
          .update(payments)
          .set({
            status: "refunded",
            payupMeta: {
              ...meta,
              checkoutAbandonedAt: now.toISOString(),
              abandonOutcome: outcome,
              abandonNotifiedAt: now.toISOString(),
            },
          })
          .where(and(eq(payments.id, row.id), eq(payments.status, "pending")));
      } else {
        await db
          .update(payments)
          .set({
            payupMeta: {
              ...meta,
              abandonOutcome: outcome,
              abandonNotifiedAt: typeof meta.abandonNotifiedAt === "string" ? meta.abandonNotifiedAt : now.toISOString(),
            },
          })
          .where(eq(payments.id, row.id));
      }
    } else if (st === "paid" && isPayupPaidSubscriptionPayment(row)) {
      await reconcilePayupCardSubscriptionPaymentStatusFromPg(row, "payup_admin_auto_reconcile");
    }
  }

  await tryReconcileAllPaidPayupSubscriptionsForUser(userId);
  const downgraded = (await ensureUserSubscriptionBackedByPaidPayment(userId, now)) === "downgraded";
  const tier = await subscriptionMeTierForUser(userId, now);
  return { tier, downgraded };
}

/**
 * 계좌이체 **구독** 건 기준으로 users.subscription* 만 갱신 (payments 행은 변경하지 않음).
 * plan 은 DB 대소문자 불일치를 허용하도록 정규화한다.
 */
async function applyBankTransferSubscriptionToUserFromPayment(
  payment: {
    userId: string;
    plan: string | null;
    billingPeriod: string | null;
  },
  opts?: { subscriptionExpiresAtOverride?: Date },
): Promise<{
  computed: ReturnType<typeof computeDisplayedSubscriptionFromEntitlements>;
  payUser: (typeof users.$inferSelect) | undefined;
  tierPaid: PaidSubscriptionTierId;
  expiresAt: Date | null;
}> {
  const planNorm = String(payment.plan ?? "").trim().toLowerCase();
  if (!isPaidSubscriptionTierId(planNorm)) {
    throw new Error("NOT_A_PAID_SUBSCRIPTION_PLAN");
  }
  const tierPaid = planNorm as PaidSubscriptionTierId;
  const now = new Date();
  const expiresAt = null;
  const [payUser] = await db.select().from(users).where(eq(users.id, payment.userId));
  /** 무료·만료 후 재구독 시 이전 구독 AI 지갑이 남으면 sync 시 이월+월충전이 중복 누적될 수 있음 */
  const hadActivePaid = payUser ? isUserPaidSubscriptionActive(payUser, now) : false;
  const grantWon = AI_MUSIC_MONTHLY_WON_BUDGET_BY_TIER[tierPaid];
  const nextWallet = appendAiWalletGrant(pruneAiWallet(parseAiWallet(payUser?.subscriptionAiWallet), now), grantWon, now);
  const computed = {
    subscriptionEntitlements: {},
    subscriptionTier: tierPaid,
    subscriptionExpiresAt: null,
  };
  await db
    .update(users)
    .set({
      subscriptionEntitlements: computed.subscriptionEntitlements,
      subscriptionTier: computed.subscriptionTier,
      subscriptionExpiresAt: computed.subscriptionExpiresAt,
      subscriptionPlan: payment.billingPeriod ?? null,
      subscriptionAiBudgetExhaustionNoticeKey: null,
      subscriptionAiWallet: nextWallet,
      subscriptionAiPeriodKey: `wallet:${tierPaid}`,
      subscriptionAiPeriodConsumedWon: hadActivePaid ? Math.max(0, payUser?.subscriptionAiPeriodConsumedWon ?? 0) : 0,
      updatedAt: new Date(),
    })
    .where(eq(users.id, payment.userId));
  return { computed, payUser, tierPaid, expiresAt };
}

function isPayupPaidSubscriptionPayment(payment: {
  paymentKey?: string | null;
  payupMeta?: unknown;
  plan?: string | null;
}): boolean {
  const planNorm = String(payment.plan ?? "").trim().toLowerCase();
  if (!isPaidSubscriptionTierId(planNorm)) return false;
  const key = String(payment.paymentKey ?? "").trim().toLowerCase();
  if (key.startsWith("payup:")) return true;
  return payupMetaTransactionIdFromPayupMeta(payment.payupMeta).length > 0 && key !== "bank_transfer";
}

function payupTransactionIdFromPayment(payment: { paymentKey?: string | null; payupMeta?: unknown }): string {
  const paymentKey = String(payment.paymentKey ?? "").trim();
  const txnFromKey = /^payup:(.+)$/i.exec(paymentKey)?.[1]?.trim() ?? "";
  return txnFromKey || payupMetaTransactionIdFromPayupMeta(payment.payupMeta);
}

async function paidSubscriptionPaymentAlreadyReflected(payment: {
  userId: string;
  plan: string | null;
}): Promise<boolean> {
  const [payUser] = await db.select().from(users).where(eq(users.id, payment.userId));
  if (!payUser) return false;
  const planNorm = String(payment.plan ?? "").trim().toLowerCase();
  const userTier = String(payUser.subscriptionTier ?? "free").trim().toLowerCase();
  return (
    userTier === planNorm &&
    isUserPaidSubscriptionActive(payUser, new Date()) &&
    sumRemainingSubscriptionAiWallet(payUser.subscriptionAiWallet) > 0
  );
}

async function repairPaidSubscriptionPaymentReflectionIfNeeded(payment: typeof payments.$inferSelect): Promise<{
  repaired: boolean;
  alreadyApplied: boolean;
  tier?: string;
}> {
  const status = String(payment.status ?? "").trim().toLowerCase();
  const planNorm = String(payment.plan ?? "").trim().toLowerCase();
  if (status !== "paid" || !isPaidSubscriptionTierId(planNorm)) {
    return { repaired: false, alreadyApplied: false };
  }
  if (await paidSubscriptionPaymentAlreadyReflected(payment)) {
    return { repaired: false, alreadyApplied: true, tier: planNorm };
  }
  const { computed } = await applyBankTransferSubscriptionToUserFromPayment(payment);
  return { repaired: true, alreadyApplied: false, tier: computed.subscriptionTier };
}

type PayupSubscriptionReconcileResult =
  | {
      ok: true;
      action: "still_paid" | "refunded" | "already_refunded";
      alreadyRefunded?: boolean;
      downgradedUser: boolean;
      checkedAt?: string;
    }
  | { ok: false; message: string };

function payupMetaLastReconcileCheckedAt(payupMeta: unknown): number {
  const meta = payupMeta && typeof payupMeta === "object" ? (payupMeta as Record<string, unknown>) : null;
  const raw = typeof meta?.pgReconcileCheckedAt === "string" ? meta.pgReconcileCheckedAt : "";
  const t = raw ? Date.parse(raw) : Number.NaN;
  return Number.isFinite(t) ? t : 0;
}

async function reconcilePayupCardSubscriptionPaymentStatusFromPg(
  payment: typeof payments.$inferSelect,
  notifySource: "payup_admin_reconcile" | "payup_admin_auto_reconcile",
): Promise<PayupSubscriptionReconcileResult> {
  const status = String(payment.status ?? "").trim().toLowerCase();
  if (status === "refunded") {
    return { ok: true, action: "already_refunded", alreadyRefunded: true, downgradedUser: false };
  }
  if (status !== "paid") {
    return { ok: false, message: `paid 상태의 페이업 카드 구독 건만 PG 상태를 확인할 수 있습니다. (현재: ${payment.status ?? "?"})` };
  }
  if (!isPayupPaidSubscriptionPayment(payment)) {
    return { ok: false, message: "페이업 카드 구독 결제만 PG 상태를 확인할 수 있습니다." };
  }

  const pathSet = (process.env.PAYUP_TXN_RECONCILE_PATH ?? "").trim().length > 0;
  if (!pathSet) {
    return {
      ok: false,
      message:
        "서버에 PAYUP_TXN_RECONCILE_PATH(페이업 거래조회 URL)가 없어 PG 승인/취소 상태를 받아올 수 없습니다. 페이업에서 거래조회 API 경로를 확인해 .env 에 설정해야 합니다.",
    };
  }
  const cred = getPayupCredentials();
  if (!cred.ok) return { ok: false, message: "페이업 자격 정보가 올바르지 않습니다." };

  const paymentKey = String(payment.paymentKey ?? "").trim();
  const txnFromKey = /^payup:(.+)$/i.exec(paymentKey)?.[1]?.trim() ?? "";
  const txnId = txnFromKey || payupMetaTransactionIdFromPayupMeta(payment.payupMeta);
  if (!txnId) {
    return { ok: false, message: "결제 건에 페이업 거래번호(transactionId)가 없습니다." };
  }

  const pg = await payupHttpReconcileTransactionCancelled(cred, txnId);
  const meta =
    payment.payupMeta && typeof payment.payupMeta === "object"
      ? ({ ...(payment.payupMeta as Record<string, unknown>) } as Record<string, unknown>)
      : {};
  const checkedAt = new Date().toISOString();
  const mergedMeta: Record<string, unknown> = {
    ...meta,
    pgReconcileCheckedAt: checkedAt,
  };
  if (!pg.ok) {
    mergedMeta.pgReconcileLastError = pg.message;
    await db.update(payments).set({ payupMeta: mergedMeta }).where(eq(payments.id, payment.id));
    return { ok: false, message: pg.message };
  }
  if ("skipped" in pg && pg.skipped) {
    mergedMeta.pgReconcileLastError = pg.reason;
    await db.update(payments).set({ payupMeta: mergedMeta }).where(eq(payments.id, payment.id));
    return { ok: false, message: `PG 조회를 사용할 수 없습니다: ${pg.reason}` };
  }

  const flat = "flat" in pg ? (pg.flat ?? {}) : {};
  const oidWant = String(payment.orderId ?? "").trim().toUpperCase();
  if (!payupInquiryFlatExpectOrderMatch(flat, oidWant)) {
    return { ok: false, message: "PG 응답의 주문번호와 이 DB 주문이 일치하지 않습니다." };
  }
  const amtChk = payupInquiryFlatAmountMatchesIfPresent(flat, payment.amount);
  if (!amtChk.ok) return { ok: false, message: amtChk.message };

  const cancelledAtPg = "cancelledAtPg" in pg && pg.cancelledAtPg === true;
  mergedMeta.pgReconcileLastError = null;
  mergedMeta.pgReconcileCancelledAtPg = cancelledAtPg;
  await db.update(payments).set({ payupMeta: mergedMeta }).where(eq(payments.id, payment.id));

  if (!cancelledAtPg) {
    return { ok: true, action: "still_paid", downgradedUser: false, checkedAt };
  }

  const out = await revertPayupCardSubscriptionPaymentById(payment.id);
  if (!out.ok) return { ok: false, message: out.message };
  if (out.noop === "already_refunded") {
    return { ok: true, action: "already_refunded", alreadyRefunded: true, downgradedUser: false, checkedAt };
  }
  if (out.downgradedUser) {
    try {
      await storage.createNotification({
        userId: out.userId,
        type: "system",
        message:
          "구독 카드 결제가 페이업에서 취소·환불로 확인되어 무료 플랜으로 조정되었습니다. AI 생성 한도가 갱신됩니다.",
        payload: { subscriptionReverted: true, source: notifySource },
        url: "/create-music",
      });
    } catch (e) {
      console.error(`[${notifySource}] notify`, e);
    }
  }
  return { ok: true, action: "refunded", downgradedUser: out.downgradedUser, checkedAt };
}

/** auth_return 쿼리의 PG TID 등으로 pending 구독 카드 주문 역추적 (주문 응답에서 payup_meta.pgTransactionId 등 저장 필요) */
async function findPendingPayupSubscriptionByPgRef(pgRef: string) {
  const ref = pgRef.trim();
  if (!ref) return undefined;
  const refNorm = ref.toLowerCase();
  const rows = await db
    .select()
    .from(payments)
    .where(
      and(
        eq(payments.status, "pending"),
        eq(payments.paymentKey, PAYUP_SUBSCRIPTION_PAYMENT_KEY),
        or(
          sql`lower(trim(coalesce(${payments.payupMeta}->>'pgTransactionId',''))) = ${refNorm}`,
          sql`lower(trim(coalesce(${payments.payupMeta}->>'pgTid',''))) = ${refNorm}`,
          sql`lower(trim(coalesce(${payments.payupMeta}->>'merchantOrderId',''))) = ${refNorm}`,
        ),
      ),
    )
    .limit(3);
  if (rows.length > 1) {
    console.warn(
      "[payup] complete: 동일 PG 참조로 pending 주문이 여러 건",
      ref,
      rows.map((r) => r.orderId),
    );
  }
  return rows[0];
}

/**
 * /complete 복귀 없이 카드사·PG에만 승인된 pending(payup_direct) — 거래조회로 0000 확인 시 paid+구독 반영.
 * `PAYUP_TXN_RECONCILE_PATH` 가 설정된 서버에서만 동작.
 */
async function finalizePayupPendingSubscriptionFromPgInquiryForRow(
  payment: typeof payments.$inferSelect,
): Promise<
  | { ok: true; paymentId: string; orderId: string; alreadyPaid?: boolean }
  | { ok: false; message: string }
> {
  const [fresh] = await db.select().from(payments).where(eq(payments.id, payment.id));
  if (!fresh) return { ok: false, message: "결제 건을 찾을 수 없습니다." };
  if (String(fresh.status ?? "").trim().toLowerCase() === "paid") {
    await repairPaidSubscriptionPaymentReflectionIfNeeded(fresh);
    return { ok: true, paymentId: fresh.id, orderId: fresh.orderId, alreadyPaid: true };
  }
  const pk = String(fresh.paymentKey ?? "").trim();
  const st = String(fresh.status ?? "").trim().toLowerCase();
  if (st !== "pending" || pk !== PAYUP_SUBSCRIPTION_PAYMENT_KEY) {
    return { ok: false, message: "페이업 카드 구독 미승인(pending·payup_direct) 건만 PG 조회로 반영할 수 있습니다." };
  }
  const planNorm = String(fresh.plan ?? "").trim().toLowerCase();
  if (!isPaidSubscriptionTierId(planNorm)) {
    return { ok: false, message: "유료 구독 플랜 결제만 처리할 수 있습니다." };
  }
  const pathSet = (process.env.PAYUP_TXN_RECONCILE_PATH ?? "").trim().length > 0;
  if (!pathSet) {
    return {
      ok: false,
      message:
        "서버에 PAYUP_TXN_RECONCILE_PATH(거래 조회 URL)가 없으면 PG 승인만 있고 DB가 pending 인 경우를 자동으로 맞출 수 없습니다. .env 에 조회 URL을 넣은 뒤 다시 시도하세요.",
    };
  }
  const cred = getPayupCredentials();
  if (!cred.ok) return { ok: false, message: "페이업 자격 정보가 올바르지 않습니다." };
  const tid = payupMetaTransactionIdFromPayupMeta(fresh.payupMeta);
  if (!tid) {
    return { ok: false, message: "주문에 저장된 PG 거래번호(pgTransactionId·pgTid·txnId)가 없습니다." };
  }
  const pg = await payupHttpReconcileTransactionCancelled(cred, tid);
  if (!pg.ok) return { ok: false, message: pg.message };
  if ("skipped" in pg && pg.skipped) {
    return { ok: false, message: `PG 조회를 사용할 수 없습니다: ${pg.reason}` };
  }
  if ("cancelledAtPg" in pg && pg.cancelledAtPg) {
    return { ok: false, message: "PG 조회상 이 거래는 취소·환불 상태입니다." };
  }
  const flat = "flat" in pg ? (pg.flat ?? {}) : {};
  if (!payupInquiryFlatIndicatesSuccessfulAuth0000(flat)) {
    return {
      ok: false,
      message:
        "PG 조회 응답에서 승인 완료(응답코드 0000)를 확인하지 못했습니다. 페이업에서 이 주문의 TID가 실제 승인 건과 같은지 확인하세요.",
    };
  }
  const oidWant = String(fresh.orderId ?? "").trim().toUpperCase();
  if (!payupInquiryFlatExpectOrderMatch(flat, oidWant)) {
    return { ok: false, message: "PG 응답의 주문번호와 이 DB 주문이 일치하지 않습니다." };
  }
  const amtChk = payupInquiryFlatAmountMatchesIfPresent(flat, fresh.amount);
  if (!amtChk.ok) return { ok: false, message: amtChk.message };
  const txnId = payupInquiryFlatPickTransactionId(flat, tid);

  const { computed, payUser, tierPaid, expiresAt } = await applyBankTransferSubscriptionToUserFromPayment(fresh);
  const now = new Date();
  const meta =
    fresh.payupMeta && typeof fresh.payupMeta === "object"
      ? ({ ...(fresh.payupMeta as Record<string, unknown>) } as Record<string, unknown>)
      : {};
  const updatedRows = await db
    .update(payments)
    .set({
      status: "paid",
      paymentKey: `payup:${txnId.replace(/^payup:/i, "").trim()}`,
      payupMeta: {
        ...meta,
        completedAt: now.toISOString(),
        txnId,
        finalizedFromPgInquiryAt: now.toISOString(),
      },
    })
    .where(and(eq(payments.id, fresh.id), eq(payments.status, "pending")))
    .returning({ id: payments.id });
  if (!updatedRows.length) {
    const [again] = await db.select().from(payments).where(eq(payments.id, fresh.id));
    if (String(again?.status ?? "").toLowerCase() === "paid") {
      return { ok: true, paymentId: again!.id, orderId: again!.orderId, alreadyPaid: true };
    }
    console.error("[payup] finalize-from-inquiry: subscription applied but payment not pending", fresh.id);
    return {
      ok: false,
      message: "구독은 반영했으나 결제 행을 paid 로 바꾸지 못했습니다. 관리자에게 문의해 주세요.",
    };
  }

  console.log("[payup] pending finalized via PG inquiry", fresh.orderId, txnId.slice(0, 12));

  const bankBp = fresh.billingPeriod === "yearly" || fresh.billingPeriod === "monthly" ? fresh.billingPeriod : null;
  const bankRecipient = payUser ? `${payUser.firstName || ""} ${payUser.lastName || ""}`.trim() || null : null;
  try {
    await notifyUserSubscriptionPaidInApp({
      userId: fresh.userId,
      tierPaid,
      billingPeriod: bankBp,
      amountWon: fresh.amount,
      source: "payup_card",
    });
  } catch (e) {
    console.error("[payup] finalize-from-inquiry notify", e);
  }
  void sendSubscriptionEmail(payUser?.email, {
    kind: payUser ? subscriptionPaymentEmailKind(payUser, now, tierPaid) : "started",
    planId: tierPaid,
    billingPeriod: bankBp,
    expiresAt: computed.subscriptionExpiresAt ?? expiresAt,
    amountWon: fresh.amount,
    recipientName: bankRecipient,
  });

  return { ok: true, paymentId: fresh.id, orderId: fresh.orderId };
}

function payupSubscriptionSiteBase(): string {
  const s = (process.env.SITE_URL || "").trim().replace(/\/$/, "");
  if (!s) return "";
  return s.startsWith("http") ? s : `https://${s}`;
}

function payupTimestamp14(): string {
  const d = new Date();
  const p = (n: number, l: number) => String(n).padStart(l, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1, 2)}${p(d.getDate(), 2)}${p(d.getHours(), 2)}${p(d.getMinutes(), 2)}${p(d.getSeconds(), 2)}`;
}

/** 페이업 주문번호 길이 제한 대비 (가맹점 주문번호) */
function newPayupSubscriptionOrderNumber(): string {
  const id = `S${Date.now().toString(36).toUpperCase()}${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
  return id.length <= 20 ? id : id.slice(0, 20);
}

function pickPayupStr(obj: Record<string, unknown> | null | undefined, ...keys: string[]): string | undefined {
  if (!obj) return undefined;
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === "string" && v.trim()) return v.trim();
    if (typeof v === "number" && Number.isFinite(v)) return String(v);
  }
  return undefined;
}

function pickPayupFlatStr(flat: Record<string, string>, ...keys: string[]): string {
  const entries = Object.entries(flat);
  for (const key of keys) {
    const want = key.toLowerCase();
    const direct = flat[key] ?? flat[want];
    if (direct != null && String(direct).trim()) return String(direct).trim();
    for (const [k, v] of entries) {
      const lower = k.toLowerCase();
      if ((lower === want || lower.endsWith(`.${want}`)) && String(v).trim()) {
        return String(v).trim();
      }
    }
  }
  return "";
}

function payupJsonPreview(input: unknown, max = 800): string {
  try {
    return JSON.stringify(input, (key, value) => {
      if (/signature|apikey|apiCertKey|secret|token|password/i.test(key)) return "[redacted]";
      return value;
    }).slice(0, max);
  } catch {
    return "";
  }
}

function payupCancelApiResponseResult(data: unknown): {
  ok: boolean;
  responseCode: string;
  responseMsg: string;
  flat: Record<string, string>;
} {
  const flat = flattenPayupWebhookPayload(data);
  const responseCode = pickPayupFlatStr(
    flat,
    "responseCode",
    "RESPONSECODE",
    "resultCode",
    "RESULT_CODE",
    "returnCode",
    "RETURNCODE",
    "code",
    "CODE",
    "resCode",
    "RESCODE",
  );
  const responseMsg = pickPayupFlatStr(
    flat,
    "responseMsg",
    "RESPONSEMSG",
    "resultMsg",
    "RESULT_MSG",
    "returnMsg",
    "RETURNMSG",
    "message",
    "MESSAGE",
    "msg",
    "MSG",
  );
  const cancelDateTime = pickPayupFlatStr(
    flat,
    "cancelDateTime",
    "cancelDatetime",
    "CANCELDATETIME",
    "cancel_date_time",
    "cancelAt",
    "cancelledAt",
    "canceledAt",
  );
  const statusText = [
    responseMsg,
    pickPayupFlatStr(flat, "dealStatus", "DEALSTATUS", "status", "STATUS", "transactionStatus", "transaction_status"),
    pickPayupFlatStr(flat, "msgType", "MSGTYPE", "event", "EVENT", "type", "TYPE", "notificationType"),
  ]
    .filter(Boolean)
    .join(" ");
  const blob = `${responseCode} ${statusText}`;
  const hasFailureSignal = /실패|오류|에러|거절|불가|불능|FAIL|FAILED|ERROR|INVALID|DENIED|REJECT/i.test(blob);
  const successCode = /^(?:0000|000|00|0|SUCCESS|SUCCEEDED|OK)$/i.test(responseCode);
  const successFlag =
    /^(?:true|1|y|yes)$/i.test(pickPayupFlatStr(flat, "success", "isSuccess", "succeeded", "SUCCESS")) ||
    /^(?:SUCCESS|SUCCEEDED|OK|DONE)$/i.test(pickPayupFlatStr(flat, "result", "RESULT", "status", "STATUS"));
  const alreadyCancelled =
    /이미\s*(?:취소|환불)|기\s*(?:취소|환불)|(?:취소|환불)\s*(?:완료|됨|된)|(?:취소|환불)\s*처리\s*(?:완료|됨|된)|already\s+(?:cancelled|canceled|refunded|voided)/i.test(
      statusText,
    );
  const cancelledStatus =
    /(?:^|\b)(?:CANCELLED|CANCELED|REFUNDED|VOIDED|CANCEL_SUCCESS|REFUND_SUCCESS)(?:\b|$)|취소완료|환불완료|망취소/i.test(
      statusText,
    );
  const ok =
    (cancelDateTime.length >= 8 && !hasFailureSignal) ||
    (successCode && !hasFailureSignal) ||
    (successFlag && !hasFailureSignal) ||
    alreadyCancelled ||
    (cancelledStatus && !hasFailureSignal);
  return { ok, responseCode, responseMsg, flat };
}

/** 인증결제 다이렉트 주문 응답 (규격서 3.1 응답 전문) */
function pickPayupDirectOrderFields(data: Record<string, unknown>) {
  const responseCode = pickPayupStr(data, "responseCode", "RESPONSECODE", "resultCode", "RESULT_CODE") ?? "";
  const responseMsg = pickPayupStr(data, "responseMsg", "RESPONSEMSG", "resultMsg", "RESULT_MSG");
  const payUrl = pickPayupStr(data, "payUrl", "payurl", "PAYURL", "payURL");
  const starturl = pickPayupStr(data, "starturl", "startUrl", "STARTURL", "startURL");
  const startparams = pickPayupStr(data, "startparams", "startParams", "STARTPARAMS", "startParamsEncoded");
  const cancelUrl = pickPayupStr(data, "CANCELURL", "cancelUrl", "cancelURL");
  const cardCode = pickPayupStr(data, "CARDCODE", "cardCode", "cardcode") ?? "0000";
  return { responseCode, responseMsg, payUrl, starturl, startparams, cancelUrl, cardCode };
}

/**
 * 페이업 AP 주문 `amount` 문자열.
 * - 기본(미설정): 비패딩 숫자만 전달 (페이업 운영: "5500" — "000000005500" 등 패딩 금지)
 * - PAYUP_ORDER_AMOUNT_STYLE=pad12 : 12자리 0패딩 (구·테스트 가맹점만)
 * - PAYUP_ORDER_AMOUNT_STYLE=short|plain : 비패딩, 최대 10자리
 * - PAYUP_ORDER_AMOUNT_STYLE=pad10 : 10자리 0패딩
 * - 레거시: PAYUP_ORDER_AMOUNT_SHORT=true → short 와 동일
 */
function formatPayupOrderAmountForRequest(amountWon: number): string {
  const legacyShort = String(process.env.PAYUP_ORDER_AMOUNT_SHORT ?? "").trim().toLowerCase();
  let style = String(process.env.PAYUP_ORDER_AMOUNT_STYLE ?? "").trim().toLowerCase();
  if (!style && (legacyShort === "true" || legacyShort === "1" || legacyShort === "yes")) {
    style = "short";
  }
  const s = String(Math.max(0, Math.floor(amountWon)));

  if (style === "pad12" || style === "12") {
    if (s.length > 12) {
      throw new Error("PAYUP_AMOUNT_EXCEEDS_12_DIGITS");
    }
    return s.padStart(12, "0");
  }
  if (style === "pad10" || style === "10") {
    if (s.length > 10) {
      throw new Error("PAYUP_AMOUNT_EXCEEDS_10_DIGITS");
    }
    return s.padStart(10, "0");
  }
  if (style === "short" || style === "plain") {
    if (s.length > 10) {
      throw new Error("PAYUP_AMOUNT_EXCEEDS_10_DIGITS");
    }
    return s;
  }
  if (s.length > 12) {
    throw new Error("PAYUP_AMOUNT_EXCEEDS_12_DIGITS");
  }
  return s;
}

/**
 * 주문 서명: merchantId|orderNumber|amount|apiCertKey|timestamp 의 amount.
 * 기본은 원 단위 정수 문자열(비패딩). 본문 amount와 **반드시 동일한 문자열**로 서명해야 하면 `PAYUP_ORDER_SIGNATURE_AMOUNT=body`
 */
function formatPayupOrderAmountForSignature(amountWon: number, bodyAmount: string): string {
  const mode = String(process.env.PAYUP_ORDER_SIGNATURE_AMOUNT ?? "").trim().toLowerCase();
  if (mode === "body" || mode === "same" || mode === "match") {
    return bodyAmount;
  }
  return String(Math.max(0, Math.floor(amountWon)));
}

/** 페이업 응답이 `{ data: { … } }` 형태일 때 한 단계 펼침 */
function payupOrderResponseAsFlatRecord(d: Record<string, unknown>): Record<string, unknown> {
  const box = d["data"] ?? d["result"];
  if (box && typeof box === "object" && !Array.isArray(box)) {
    return { ...d, ...(box as Record<string, unknown>) };
  }
  return d;
}

/** 자료에 따라 JSON 키를 대문자로 보내야 하는 가맹점 대비(복귀 URL 키는 규격서 `auth_return` 유지) */
function applyPayupOrderJsonKeyCasing(body: Record<string, string>): Record<string, string> {
  const mode = String(process.env.PAYUP_ORDER_JSON_KEYS ?? "").trim().toLowerCase();
  if (mode !== "upper" && mode !== "caps") {
    return body;
  }
  const keyMap: Record<string, string> = {
    merchantId: "MERCHANTID",
    orderNumber: "ORDERNUMBER",
    amount: "AMOUNT",
    itemName: "ITEMNAME",
    userName: "USERNAME",
    userEmail: "USEREMAIL",
    userAgent: "USERAGENT",
    signature: "SIGNATURE",
    timestamp: "TIMESTAMP",
    auth_return: "auth_return",
    USESKIPPAGE: "USESKIPPAGE",
    CARDCODE: "CARDCODE",
    QUOTA: "QUOTA",
    returnUrl: "returnUrl",
  };
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(body)) {
    out[keyMap[k] ?? k] = v;
  }
  return out;
}

/** 다날/페이업 내부 `|` 구분 전문에 섞이면 파싱 실패 — 제어 문자·파이프 제거 */
function sanitizePayupOrderField(input: string, maxLen: number): string {
  let s = String(input ?? "")
    .replace(/[\r\n\t\f\v\u0000-\u001F\u007F]/g, " ")
    .replace(/\|/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  try {
    s = s.normalize("NFKC");
  } catch {
    /* ignore */
  }
  return s.slice(0, maxLen);
}

/** PG가 쿼리 키 이름을 바꿔 보내는 경우 대비 — 값이 주문 JSON 형태인지 */
function looksLikePayupReturnParamsPayload(s: string): boolean {
  const t = s.trim();
  if (t.length < 12) return false;
  const head = t.startsWith("%7B") || t.startsWith("%7b") ? "{" : t.slice(0, 1);
  if (head !== "{") return false;
  let dec = t;
  try {
    if (t.includes("%")) dec = decodeURIComponent(t);
  } catch {
    /* keep t */
  }
  return /orderNumber|ORDERNUMBER|orderId|ORDER_ID|ORDERNO|moid|MOID|transactionId|TRANSACTIONID/i.test(dec);
}

function firstPayupReturnParamsFromFlatRecord(src: Record<string, unknown>): string {
  const known = ["RETURNPARAMS", "returnParams", "ReturnParams", "return_params"];
  for (const k of known) {
    const v = src[k];
    if (typeof v === "string" && v.trim()) return v.trim();
    if (Array.isArray(v) && typeof v[0] === "string" && v[0].trim()) return v[0].trim();
  }
  for (const [, v] of Object.entries(src)) {
    if (typeof v === "string" && looksLikePayupReturnParamsPayload(v)) return v.trim();
    if (Array.isArray(v) && typeof v[0] === "string" && looksLikePayupReturnParamsPayload(v[0])) return v[0].trim();
  }
  return "";
}

function readPayupReturnParamsFromReq(req: Request): string {
  const q = req.query as Record<string, unknown>;
  const b = (req.body && typeof req.body === "object" ? req.body : {}) as Record<string, unknown>;
  const fromQ = firstPayupReturnParamsFromFlatRecord(q);
  if (fromQ) return fromQ;
  return firstPayupReturnParamsFromFlatRecord(b);
}

/**
 * 일부 단말·GET 복귀에서 RETURNPARAMS 가 비고 쿼리에만 PG·결과 코드가 올 때 — payUrl 승인 POST용 JSON 문자열 재구성.
 * 키는 페이업/단말이 보낸 표기를 그대로 유지(대소문자 혼용).
 */
function buildPayupReturnParamsBlobFromQueryBody(q: Record<string, unknown>, body: Record<string, unknown>): string {
  const merged: Record<string, string> = {};
  const ingest = (src: Record<string, unknown>) => {
    for (const [k, v] of Object.entries(src)) {
      const compact = k.replace(/_/g, "").toLowerCase();
      const allowed =
        compact === "transactionid" ||
        compact === "tid" ||
        compact === "ordernumber" ||
        compact === "orderid" ||
        compact === "moid" ||
        compact === "returncode" ||
        compact === "responsecode" ||
        compact === "resultcode" ||
        compact === "returnmsg" ||
        compact === "responsemsg" ||
        compact === "amount";
      if (!allowed) continue;
      const s =
        typeof v === "string"
          ? v.trim()
          : Array.isArray(v) && typeof v[0] === "string"
            ? v[0].trim()
            : "";
      if (!s || s.length > 4096) continue;
      merged[k] = s;
    }
  };
  ingest(q);
  ingest(body);
  const hasSignal =
    merged.transactionId ||
    merged.TRANSACTIONID ||
    merged.TID ||
    merged.tid ||
    merged.orderNumber ||
    merged.ORDERNUMBER ||
    merged.orderId ||
    merged.ORDER_ID ||
    merged.moid ||
    merged.MOID;
  if (!hasSignal) return "";
  return JSON.stringify(merged);
}

function payupTxnIdFromParsed(parsed: Record<string, unknown>): string | undefined {
  return pickPayupStr(parsed, "transactionId", "TRANSACTIONID", "tid", "TID", "transaction_id");
}

function tryParsePayupReturnJson(blob: string): Record<string, unknown> | null {
  if (!blob) return null;
  const tryOne = (s: string): Record<string, unknown> | null => {
    try {
      const j = JSON.parse(s) as unknown;
      if (j && typeof j === "object" && !Array.isArray(j)) return j as Record<string, unknown>;
    } catch {
      /* ignore */
    }
    return null;
  };
  return tryOne(blob) ?? tryOne(decodeURIComponent(blob));
}

function payupOrderNumberFromParsed(parsed: Record<string, unknown>): string | undefined {
  return pickPayupStr(
    parsed,
    "orderNumber",
    "ORDERNUMBER",
    "orderId",
    "ORDER_ID",
    "ORDERNO",
    "ordernumber",
    "moid",
    "MOID",
    "cpMoid",
    "CPMOID",
  );
}

/** 페이업이 쿼리 transactionId 에 가맹점 주문번호(S…)를 넣는 경우 — 카드사 TID 와 혼동 방지로 S 접두만 */
function looksLikeVenysoundPayupMerchantOrderId(s: string): boolean {
  const t = s.trim();
  return /^S[A-Z0-9]{6,32}$/i.test(t);
}

function redirectPricingPayupOutcome(res: Response, outcome: "success" | "fail"): void {
  const site = payupSubscriptionSiteBase();
  const path = `/pricing?payup=${outcome}`;
  res.redirect(303, site ? `${site}${path}` : path);
}

/** 경로 파라미터를 양의 정수 id로 파싱 (NaN·0·음수·비정수면 null) */
function parsePositiveIntParam(raw: string | undefined): number | null {
  if (raw == null || raw === "") return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 1 || !Number.isInteger(n)) return null;
  return n;
}

/** 관리자 일괄 정산: 스프레드시트에서 복사한 CSV (externalRef, 금액[, 수수료]) */
function parseDistributionImportCsv(
  csvText: string,
): Array<{ ref: string; grossAmount: number; platformFeeAmount?: number }> {
  const lines = csvText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  if (lines.length === 0) return [];
  let start = 0;
  const head = lines[0].toLowerCase();
  if (
    (head.includes("ref") || head.includes("upc") || head.includes("external")) &&
    (head.includes("amount") || head.includes("gross") || head.includes("royalty") || head.includes("원") || head.includes("earned"))
  ) {
    start = 1;
  }
  const out: Array<{ ref: string; grossAmount: number; platformFeeAmount?: number }> = [];
  for (let i = start; i < lines.length; i++) {
    const parts = lines[i].split(",").map((p) => p.trim().replace(/^"|"$/g, ""));
    if (parts.length < 2) continue;
    const ref = parts[0];
    const amtRaw = parts[1].replace(/,/g, "").replace(/원/g, "").trim();
    const amt = Number(amtRaw);
    const feeRaw = parts[2];
    const feeNum =
      feeRaw !== undefined && feeRaw !== ""
        ? Number(String(feeRaw).replace(/,/g, "").replace(/원/g, "").trim())
        : NaN;
    if (!ref || !Number.isFinite(amt) || amt < 0) continue;
    out.push({
      ref,
      grossAmount: Math.floor(amt),
      platformFeeAmount: Number.isFinite(feeNum) && feeNum >= 0 ? Math.floor(feeNum) : undefined,
    });
  }
  return out;
}

// 후원 뱃지 레벨 계산 (누적 후원 원화 기준, 구 크레딧 임계값 × 7.5)
function calculateDonationBadge(totalSentWon: number): string | null {
  if (totalSentWon >= 1_500_000) return "sponsor";
  if (totalSentWon >= 375_000) return "supporter";
  if (totalSentWon >= 75_000) return "sprout";
  if (totalSentWon >= 750) return "seed";
  return null;
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  // local-uploads 폴더 자동 생성
  const uploadsDir = path.resolve(process.cwd(), "local-uploads", "uploads");
  mkdirSync(uploadsDir, { recursive: true });

  // Play Store TWA: Digital Asset Links (설정 시에만 응답, 미설정 시 404로 연동 없음)
  app.get("/.well-known/assetlinks.json", (_req, res) => {
    const packageName = process.env.TWA_PACKAGE_NAME;
    const sha256 = process.env.TWA_SHA256_FINGERPRINT;
    if (!packageName || !sha256) {
      res.status(404).end();
      return;
    }
    res.type("application/json").send(
      JSON.stringify([
        {
          relation: ["delegate_permission/common.handle_all_urls"],
          target: {
            namespace: "android_app",
            package_name: packageName,
            sha256_cert_fingerprints: sha256.split(",").map((s) => s.trim()),
          },
        },
      ])
    );
  });

  /** 메시지/대화 시간을 항상 UTC ISO 문자열(Z)로 반환 (타임존 9시간 오차 방지)
   *  - DB에 예상치 못한 값이 들어있을 때 서버가 500 나지 않도록, 파싱 실패 시 빈 문자열 반환
   */
  function toUTCISO(val: unknown): string {
    if (val == null) return "";
    try {
      if (val instanceof Date) return val.toISOString();
      if (typeof val === "string") {
        if (!val.trim()) return "";
        if (val.includes("Z") || val.endsWith("Z")) return val;
        const d = new Date(val.replace(" ", "T") + "Z");
        return isNaN(d.getTime()) ? "" : d.toISOString();
      }
      const d = new Date(val as string | number);
      return isNaN(d.getTime()) ? "" : d.toISOString();
    } catch {
      return "";
    }
  }

  /** SMTP·notify_activity_email 허용 시 댓글/팔로/좋아요/쪽지 메일 (비동기, 응답 지연 없음) */
  function queueActivityEmail(
    recipientUserId: string,
    kind: ActivityEmailKind,
    params: {
      actorName: string;
      musicTitle?: string;
      postTitle?: string;
      snippet?: string;
      actionPath: string;
    },
  ): void {
    if (!isEmailConfigured()) return;
    void (async () => {
      try {
        const u = await storage.getUserById(recipientUserId);
        if (!u?.email) return;
        if ((u as { notifyActivityEmail?: boolean }).notifyActivityEmail === false) return;
        const recipientName = (u.firstName as string) || (typeof u.email === "string" ? u.email.split("@")[0] : "") || "회원";
        await sendSocialActivityEmail(u.email, kind, {
          recipientName,
          actorName: params.actorName,
          musicTitle: params.musicTitle,
          postTitle: params.postTitle,
          snippet: params.snippet,
          actionPath: params.actionPath,
        });
      } catch (e) {
        console.error("[activity-email]", e);
      }
    })();
  }

  /** 만료 entitlement 정리·DB 동기화 후, 유료 활성 여부 반환 (배포·정산 등에서 사용) */
  async function ensureExpiredSubscriptionDowngrade(userId: string): Promise<{ isPremium: boolean }> {
    const [user] = await db.select().from(users).where(eq(users.id, userId));
    if (!user) return { isPremium: false };
    if (user.role === "admin") return { isPremium: true };
    const now = new Date();
    const { subscriptionEntitlements, subscriptionTier, subscriptionExpiresAt, needsWrite } = subscriptionRowNeedsSync(
      user,
      now,
    );
    if (needsWrite) {
      await db
        .update(users)
        .set({
          subscriptionEntitlements,
          subscriptionTier,
          subscriptionExpiresAt,
          ...(subscriptionTier === "free" ? { subscriptionPlan: null } : {}),
          updatedAt: new Date(),
        })
        .where(eq(users.id, userId));
    }
    return { isPremium: subscriptionTier !== "free" };
  }

  // Setup Auth
  await setupAuth(app);
  registerAuthRoutes(app);
  registerObjectStorageRoutes(app);

  // DJ 송출실 HTML: 비로그인 직링크(/radio-audio-test.html?slug=…) 차단 — 세션 없으면 로그인으로
  // dist 와 client/public 둘 다 있으면 예전엔 dist만 써서, 소스만 고치고 빌드 안 하면 변경이 안 보였음 → 수정 시각이 더 최근인 쪽 사용
  const radioAudioTestHtmlCandidates = [
    path.resolve(process.cwd(), "dist/public/radio-audio-test.html"),
    path.resolve(process.cwd(), "client/public/radio-audio-test.html"),
  ];
  function resolveRadioAudioTestHtmlPath(): string | null {
    const existing = radioAudioTestHtmlCandidates.filter((p) => existsSync(p));
    if (existing.length === 0) return null;
    if (existing.length === 1) return existing[0];
    let best = existing[0];
    let bestM = statSync(best).mtimeMs;
    for (let i = 1; i < existing.length; i++) {
      const p = existing[i];
      const m = statSync(p).mtimeMs;
      if (m > bestM) {
        best = p;
        bestM = m;
      }
    }
    return best;
  }
  app.get("/radio-audio-test.html", (req, res) => {
    const r = req as Request & { isAuthenticated(): boolean; user?: { claims?: { sub?: string } } };
    if (!r.isAuthenticated?.() || !r.user?.claims?.sub) {
      const loginPath = getLoginPagePath();
      const full = (req.originalUrl || "/radio-audio-test.html").split("#")[0];
      return res.redirect(302, `${loginPath}?next=${encodeURIComponent(full)}`);
    }
    const htmlPath = resolveRadioAudioTestHtmlPath();
    if (!htmlPath) {
      return res.status(404).type("text/plain").send("radio-audio-test.html not found");
    }
    res.setHeader("Cache-Control", "no-store");
    return res.sendFile(htmlPath);
  });

  // WebSocket for visitor count + DM (noServer so /_vite_hmr can be handled by Vite)
  const wss = new WebSocketServer({ noServer: true });
  wss.on("error", (err) => {
    console.warn("[ws] WebSocketServer:", err.message);
  });
  httpServer.on("upgrade", (request, socket, head) => {
    const pathname = request.url?.split("?")[0] || "";
    if (pathname === "/ws") {
      try {
        wss.handleUpgrade(request, socket, head, (ws) => wss.emit("connection", ws, request));
      } catch (e: unknown) {
        console.warn("[ws] handleUpgrade failed:", e instanceof Error ? e.message : e);
        try {
          socket.destroy();
        } catch {
          /* ignore */
        }
      }
    }
    // else: let other listeners (e.g. Vite HMR) handle /_vite_hmr; do not respond so they can
  });
  let visitorCount = 0;
  const userSockets = new Map<string, Set<WebSocket>>();
  const radioChannelRooms = new Map<string, Set<WebSocket>>();
  const wsRadioSlugs = new WeakMap<WebSocket, Set<string>>();
  const wsToUserId = new Map<WebSocket, string>();
  const lastJoinBroadcastAt = new Map<string, number>();
  const JOIN_BROADCAST_COOLDOWN_MS = 60000;
  const radioLocalTitles = new Map<string, string | null>();
  // 새로고침 감지용: 퇴장 알림을 8초 지연 후 발송. 그 사이 재접속하면 취소
  const pendingLeaveTimers = new Map<string, ReturnType<typeof setTimeout>>(); // `${slug}:${userId}`

  function broadcastToRadioChannel(slug: string, data: object) {
    const room = radioChannelRooms.get(slug);
    if (!room) return;
    const message = JSON.stringify(data);
    room.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) client.send(message);
    });
  }

  // 채팅/입퇴장 알림은 익명(미인증 소켓)에게 절대 노출하지 않기 위한 필터 브로드캐스트
  function broadcastToRadioChannelAuthenticated(slug: string, data: object) {
    const room = radioChannelRooms.get(slug);
    if (!room) return;
    const message = JSON.stringify(data);
    room.forEach((client) => {
      if (client.readyState !== WebSocket.OPEN) return;
      if (!wsToUserId.get(client)) return; // 인증된 소켓만 전송
      client.send(message);
    });
  }

  function broadcastRadioListeners(slug: string) {
    const room = radioChannelRooms.get(slug);
    const count = room ? room.size : 0;
    broadcastToRadioChannel(slug, { type: "radio_listeners", slug, count });
  }

  wss.on("connection", (ws) => {
    visitorCount++;
    broadcastVisitorCount();
    let wsUserId: string | null = null;
    wsRadioSlugs.set(ws, new Set());

    ws.on("error", (e: Error) => {
      const ne = e as NodeJS.ErrnoException;
      const code = ne?.code ?? "";
      if (code === "WS_ERR_UNEXPECTED_RSV_2_3" || /RSV2|RSV3/i.test(String(e?.message ?? ""))) {
        console.warn("[ws] ignored non-WebSocket probe / bad frame:", code || e.message);
        return;
      }
      console.warn("[ws] socket error:", e?.message || e);
    });

    ws.on("message", async (data) => {
      try {
        const msg = JSON.parse(data.toString());
        if (msg.type === "auth" && msg.userId) {
          wsUserId = String(msg.userId);
          wsToUserId.set(ws, wsUserId);
          if (!userSockets.has(wsUserId!)) {
            userSockets.set(wsUserId!, new Set());
          }
          userSockets.get(wsUserId!)!.add(ws);
          if (ws.readyState === 1) ws.send(JSON.stringify({ type: "auth_ack" }));
        }
        if (msg.type === "radio_join" && typeof msg.slug === "string" && msg.slug) {
          const slug = String(msg.slug).trim().toLowerCase();
          if (!radioChannelRooms.has(slug)) radioChannelRooms.set(slug, new Set());
          const room = radioChannelRooms.get(slug)!;
          const wasAlreadyInRoom = room.has(ws);
          room.add(ws);
          wsRadioSlugs.get(ws)!.add(slug);
          broadcastRadioListeners(slug);
          if (!wasAlreadyInRoom && wsUserId) {
            const leaveKey = `${slug}:${wsUserId}`;
            // 새로고침 감지: 퇴장 대기 타이머가 있으면 취소 (= 재접속이므로 퇴장/입장 알림 모두 생략)
            // 쿨다운은 건드리지 않음 → 반복 재접속해도 입장 알림 중복 방지
            const pendingTimer = pendingLeaveTimers.get(leaveKey);
            if (pendingTimer) {
              clearTimeout(pendingTimer);
              pendingLeaveTimers.delete(leaveKey);
              /* 새로고침으로 재접속 → 알림 없이 조용히 복귀 */
            } else {
              const sameUserAlreadyInRoom = Array.from(room).some((s) => s !== ws && wsToUserId.get(s) === wsUserId);
              if (sameUserAlreadyInRoom) {
                /* 다른 탭으로 이미 입장 중 → 알림 생략 */
              } else {
                const joinKey = leaveKey;
                const now = Date.now();
                const lastAt = lastJoinBroadcastAt.get(joinKey);
                if (lastAt != null && now - lastAt < JOIN_BROADCAST_COOLDOWN_MS) {
                  /* 60초 쿨다운 */
                } else {
                  try {
                    lastJoinBroadcastAt.set(joinKey, now);
                    const explicitDisplayName =
                      typeof msg.displayName === "string" && msg.displayName.trim()
                        ? msg.displayName.trim()
                        : null;
                    let username: string | undefined;
                    if (explicitDisplayName) {
                      username = explicitDisplayName;
                    } else {
                      const user = await storage.getUserById(wsUserId);
                      const preferred =
                        (user?.firstName && String(user.firstName).trim()) ||
                        (user?.username && String(user.username).trim()) ||
                        null;
                      username = (preferred as string | null) ?? undefined;
                    }
                    broadcastToRadioChannelAuthenticated(slug, {
                      type: "radio_user_joined",
                      userId: wsUserId,
                      username,
                    });
                  } catch (e) {
                    console.warn("[ws] radio_user_joined broadcast failed", e);
                  }
                }
              }
            }
          }
        }
        if (msg.type === "radio_leave" && typeof msg.slug === "string" && msg.slug) {
          const slug = String(msg.slug).trim().toLowerCase();
          if (wsUserId) {
            // 명시적 퇴장: 대기 중인 타이머 취소 후 즉시 퇴장 알림
            const leaveKey = `${slug}:${wsUserId}`;
            const pending = pendingLeaveTimers.get(leaveKey);
            if (pending) { clearTimeout(pending); pendingLeaveTimers.delete(leaveKey); }
            lastJoinBroadcastAt.delete(leaveKey);
            try {
              const user = await storage.getUserById(wsUserId);
              const preferred =
                (user?.firstName && String(user.firstName).trim()) ||
                (user?.username && String(user.username).trim()) ||
                null;
              const username = (preferred as string | null) ?? undefined;
              broadcastToRadioChannelAuthenticated(slug, {
                type: "radio_user_left",
                userId: wsUserId,
                username,
              });
            } catch (e) {
              console.warn("[ws] radio_user_left broadcast failed", e);
            }
          }
          const room = radioChannelRooms.get(slug);
          if (room) {
            room.delete(ws);
            if (room.size === 0) radioChannelRooms.delete(slug);
          }
          wsRadioSlugs.get(ws)?.delete(slug);
          broadcastRadioListeners(slug);
        }
        if (msg.type === "radio_chat" && typeof msg.slug === "string" && typeof msg.content === "string" && msg.slug && String(msg.content).trim()) {
          if (!wsUserId) {
            console.warn("[ws] radio_chat ignored: not authenticated");
            return;
          }
          const slug = String(msg.slug).trim().toLowerCase();
          const channel = await storage.getRadioChannelBySlug(slug);
          if (!channel) {
            console.warn("[ws] radio_chat ignored: channel not found", slug);
            return;
          }
          const content = String(msg.content).trim().slice(0, 500);
          try {
            const row = await storage.createRadioChatMessage(channel.id, wsUserId, content);
            const user = await storage.getUserById(wsUserId);
            const username = (user?.username ?? user?.firstName ?? null) as string | null;
            broadcastToRadioChannelAuthenticated(slug, { type: "radio_chat", message: { id: row.id, userId: wsUserId, username, content: row.content, createdAt: (row.createdAt as Date).toISOString() } });
          } catch (e) {
            console.error("[ws] radio_chat create/broadcast failed", e);
          }
        }
      } catch (e) {
        console.error("[ws] message handler error", e);
      }
    });

    ws.on("close", () => {
      visitorCount--;
      broadcastVisitorCount();
      const uid = wsUserId;
      const slugs = wsRadioSlugs.get(ws);
      if (uid && slugs && slugs.size > 0) {
        // 퇴장 알림 8초 지연: 새로고침이면 재접속 시 타이머 취소 → 알림 없이 조용히 복귀
        // 주의: 쿨다운(lastJoinBroadcastAt)은 여기서 건드리지 않음 → 실제 퇴장(타이머 만료) 시에만 초기화
        slugs.forEach((slug) => {
          const leaveKey = `${slug}:${uid}`;
          if (pendingLeaveTimers.has(leaveKey)) return; // 이미 대기 중
          const timer = setTimeout(async () => {
            pendingLeaveTimers.delete(leaveKey);
            // 같은 유저가 이미 다른 연결로 방에 있으면 퇴장 알림 생략
            const room = radioChannelRooms.get(slug);
            if (room && Array.from(room).some((s) => wsToUserId.get(s) === uid)) return;
            // 실제 퇴장 확정 → 쿨다운 초기화 (다음 입장 시 알림 발송)
            lastJoinBroadcastAt.delete(leaveKey);
            try {
              const user = await storage.getUserById(uid);
              const username = ((user?.username ?? user?.firstName ?? null) as string | null) ?? undefined;
              broadcastToRadioChannelAuthenticated(slug, { type: "radio_user_left", userId: uid, username });
            } catch (e) {
              console.warn("[ws] radio_user_left on close broadcast failed", e);
            }
          }, 8000);
          pendingLeaveTimers.set(leaveKey, timer);
        });
      }
      if (slugs) {
        slugs.forEach((slug) => {
          const room = radioChannelRooms.get(slug);
          if (room) {
            room.delete(ws);
            if (room.size === 0) radioChannelRooms.delete(slug);
          }
          broadcastRadioListeners(slug);
        });
      }
      if (wsUserId && userSockets.has(wsUserId)) {
        userSockets.get(wsUserId)!.delete(ws);
        if (userSockets.get(wsUserId)!.size === 0) {
          userSockets.delete(wsUserId);
        }
      }
      wsToUserId.delete(ws);
    });
  });

  function broadcastVisitorCount() {
    const message = JSON.stringify({ type: "visitor_count", count: visitorCount });
    wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(message);
      }
    });
  }

  function sendToUser(userId: string, data: any) {
    const sockets = userSockets.get(userId);
    if (sockets) {
      const message = JSON.stringify(data);
      sockets.forEach((ws) => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(message);
        }
      });
    }
  }

  setNotificationRealtimeSender(sendToUser);

  // 배포 시 헬스 체크용 (인증 없음). builtAt = 마지막 npm run build 시각 (dist/public/build.json)
  app.get("/api/health", (_req, res) => {
    let builtAt: string | undefined;
    try {
      const root = (globalThis as { __APP_ROOT__?: string }).__APP_ROOT__ ?? process.cwd();
      const p = path.join(root, "dist", "public", "build.json");
      if (existsSync(p)) {
        const j = JSON.parse(readFileSync(p, "utf-8")) as { builtAt?: string };
        if (typeof j.builtAt === "string") builtAt = j.builtAt;
      }
    } catch {
      /* ignore */
    }
    res.status(200).json({ ok: true, ...(builtAt ? { builtAt } : {}) });
  });

  /** 로컬 사용 안내 검색(외부 LLM 없음). 지식은 `server/help-site-knowledge.ts` */
  app.get("/api/help-search", (req: Request, res: Response) => {
    try {
      const raw = typeof req.query.q === "string" ? req.query.q : "";
      if (raw.length > 500) {
        res.status(400).json({ error: "query_too_long" });
        return;
      }
      const q = raw.trim();
      if (!q) {
        res.setHeader("Cache-Control", "public, max-age=300");
        res.json({
          query: "",
          candidates: [],
          suggestedQueries: HELP_SEARCH_SUGGESTIONS,
        });
        return;
      }
      const candidates = searchHelpSiteKnowledge(q, { limit: 10 });
      res.setHeader("Cache-Control", "public, max-age=120");
      res.json({ query: q, candidates, suggestedQueries: HELP_SEARCH_SUGGESTIONS });
    } catch (e) {
      console.error("[api/help-search]", e);
      res.status(200).json({
        query: "",
        candidates: [],
        suggestedQueries: HELP_SEARCH_SUGGESTIONS,
        error: "help_search_internal",
      });
    }
  });

  // 사이트맵 (SEO) — 루트 /sitemap.xml 이 표준. /api/sitemap.xml 은 구버전·GSC URL 호환.
  // 일부 프록시가 /api/* 만 다르게 처리해 봇이 "가져올 수 없음"이 되는 경우가 있어 둘 다 200 본문 제공.
  function escapeXmlText(s: string): string {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
  }

  /** 네이버 등: <loc> 호스트가 수집·등록 도메인(www vs apex)과 같아야 "올바른 사이트맵"으로 인정되는 경우가 많음 */
  function resolveSitemapBaseUrl(req: Request): string {
    const forced = (process.env.SITEMAP_BASE_URL || "").trim().replace(/\/$/, "");
    if (forced) return forced;

    const rawHost = (req.get("x-forwarded-host") || req.get("host") || "").split(",")[0].trim();
    const hostNoPort = rawHost.replace(/:\d+$/, "");
    if (/^(www\.)?venysound\.com$/i.test(hostNoPort)) {
      return `https://${hostNoPort.toLowerCase()}`;
    }

    return (process.env.SITE_URL || "https://venysound.com").replace(/\/$/, "");
  }

  const sendSitemapXml = async (req: Request, res: Response) => {
    const base = resolveSitemapBaseUrl(req);
    const lastmod = new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
    const staticPaths = [
      "",
      "/music",
      "/popular",
      "/explore",
      "/upload",
      "/bulk-upload",
      "/radio",
      "/community",
      "/about",
      "/pricing",
      "/credits",
      getLoginPagePath(),
      getRegisterPagePath(),
      "/faq",
      "/legal",
      "/privacy",
      "/guide",
      "/file-guide",
      "/suno-guide",
      "/create-music",
      "/global-distribution-guide",
    ];
    let urls = staticPaths.map(
      (p) =>
        `<url><loc>${escapeXmlText(`${base}${p || "/"}`)}</loc><lastmod>${lastmod}</lastmod><changefreq>weekly</changefreq><priority>${p ? "0.8" : "1.0"}</priority></url>`
    );
    try {
      const { data: musicList } = await storage.getMusicList(undefined, undefined, 1, 10000);
      for (const m of musicList) {
        urls.push(
          `<url><loc>${escapeXmlText(`${base}/music/${m.id}`)}</loc><lastmod>${lastmod}</lastmod><changefreq>weekly</changefreq><priority>0.6</priority></url>`
        );
      }
    } catch {
      // DB 오류 시 정적 페이지만 포함
    }
    const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.join("")}</urlset>`;
    res.setHeader("Cache-Control", "public, max-age=600");
    res.setHeader("Content-Type", "application/xml; charset=utf-8");
    res.send(xml);
  };
  app.get("/sitemap.xml", sendSitemapXml);
  app.get("/api/sitemap.xml", sendSitemapXml);

  // === AI Music: KIE (api.kie.ai) → Suno API (sunoapi.org) → AIMusicAPI 프록시 ===
  function normalizeAiMusicApiKey(raw: string | undefined): string | undefined {
    const t = (raw ?? "").replace(/^\uFEFF/, "").replace(/\r\n?|\n/g, "").trim();
    return t || undefined;
  }

  const KIE_API_BASE = (process.env.KIE_API_BASE ?? "https://api.kie.ai").replace(/\/$/, "");
  const KIE_API_KEY = normalizeAiMusicApiKey(process.env.KIE_API_KEY);

  const SUNOAPI_BASE = "https://api.sunoapi.org";
  const SUNOAPI_KEY = normalizeAiMusicApiKey(process.env.SUNOAPI_API_KEY);

  const AIMUSICAPI_BASE = "https://api.aimusicapi.ai";
  const AIMUSICAPI_KEY = normalizeAiMusicApiKey(process.env.AIMUSICAPI_API_KEY);

  /** 기본: sunoapi.org — KIE는 SUNOAPI 키가 없을 때만 폴백 */
  const AI_MUSIC_PROVIDER = SUNOAPI_KEY ? "suno" : KIE_API_KEY ? "kie" : AIMUSICAPI_KEY ? "aimusicapi" : null;

  const aiVoiceRecordUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 8 * 1024 * 1024 },
  });

  /** Suno-compatible upstream (KIE · sunoapi.org) — provider별 base/key. 옛 suno task는 provider=suno로만 조회. */
  function sunoStyleUpstream(provider: string): { base: string; key: string } | null {
    const p = provider.trim().toLowerCase();
    if (p === "kie" && KIE_API_KEY) return { base: KIE_API_BASE, key: KIE_API_KEY };
    if (p === "suno" && SUNOAPI_KEY) return { base: SUNOAPI_BASE, key: SUNOAPI_KEY };
    return null;
  }

  /** Suno/AIMusic 조회 — 업스트림이 응답 없이 걸리면 클라이언트 폴링 한 번이 수 분 단위로 멈춤 */
  const AI_MUSIC_UPSTREAM_FETCH_MS = 28_000;

  /** Suno placeholder·깨진 링크 (한 클립만 재생되는 원인 중 하나) */
  function isLikelyBadRemoteAudioUrl(u: string): boolean {
    const s = u.trim();
    if (s.length < 12) return true;
    if (/\/None\.(mp3|wav|ogg)/i.test(s)) return true;
    if (/undefined|null/i.test(s)) return true;
    return false;
  }

  /**
   * Suno/AIMusic 클립 오디오 URL.
   * source_* / audio_* 를 stream_* 보다 우선(만료 느린 파일 URL 우선). 잘못된 audioUrl은 건너뜀.
   */
  function pickRemoteClipAudioUrl(o: Record<string, unknown>): string | undefined {
    for (const k of [
      "source_audio_url",
      "sourceAudioUrl",
      "source_stream_audio_url",
      "sourceStreamAudioUrl",
      "audio_url",
      "audioUrl",
      "stream_audio_url",
      "streamAudioUrl",
    ] as const) {
      const v = o[k];
      if (typeof v === "string") {
        const t = v.trim();
        if (t && !isLikelyBadRemoteAudioUrl(t)) return t;
      }
    }
    for (const k of ["stream_audio_url", "streamAudioUrl", "audio_url", "audioUrl"] as const) {
      const v = o[k];
      if (typeof v === "string") {
        const t = v.trim();
        if (t) return t;
      }
    }
    return undefined;
  }
  function pickRemoteClipImageUrl(o: Record<string, unknown>): string | undefined {
    for (const k of ["imageUrl", "image_url", "image_large_url", "imageLargeUrl"] as const) {
      const v = o[k];
      if (typeof v === "string" && v.trim()) return v.trim();
    }
    return undefined;
  }

  function normalizeAiTitleForMatch(value: unknown): string {
    return typeof value === "string" ? value.trim().replace(/\s+/g, " ").toLowerCase() : "";
  }

  function resolveAiCreatorDisplayName(userRow: typeof users.$inferSelect | undefined | null): string {
    const fullName = [userRow?.firstName, userRow?.lastName].filter(Boolean).join(" ").trim();
    const emailName = typeof userRow?.email === "string" ? userRow.email.split("@")[0]?.trim() : "";
    return (userRow?.username?.trim() || fullName || emailName || "VenySound").slice(0, 50);
  }

  function sanitizeDownloadFileName(name: unknown, fallback: string): string {
    const raw = typeof name === "string" && name.trim() ? name.trim() : fallback;
    return raw.replace(/[/\\:*?"<>|]/g, " ").replace(/\s+/g, " ").trim().slice(0, 120) || fallback;
  }

  /** Suno/AIMusic 클립 재생 길이(초) — API 필드명 제각각 */
  function pickClipDurationSec(o: Record<string, unknown>): number | undefined {
    const v = o.duration ?? o.duration_seconds ?? o.durationSeconds;
    if (typeof v === "number" && Number.isFinite(v) && v > 0) return v;
    if (typeof v === "string") {
      const n = parseFloat(v.replace(/,/g, ""));
      if (Number.isFinite(n) && n > 0) return n;
    }
    return undefined;
  }

  /** Suno record-info 클립에 최종 파일 URL이 있으면 duration 미수신이어도 생성 완료로 간주해도 됨 */
  function sunoClipHasFinalSourceAudio(r: Record<string, unknown>): boolean {
    for (const k of ["source_audio_url", "sourceAudioUrl"] as const) {
      const v = r[k];
      if (typeof v === "string" && v.trim().length > 12) return true;
    }
    return false;
  }

  /** CreateMusic UI는 sonic-* (AIMusicAPI) 값을 보냄 — Suno generate API 모델명으로 매핑 */
  function resolveSunoGenerateModel(mv: string | undefined | null): string {
    const m = typeof mv === "string" ? mv.trim() : "";
    if (m === "V5" || m === "V5_5" || m === "V4_5" || m === "V4_5PLUS" || m === "V4" || m === "V4_5ALL") return m;
    if (m === "sonic-v5-5" || m === "sonic-v5-5-all") return "V5_5";
    if (m === "sonic-v4-5" || m === "sonic-v4-5-all") return "V4_5";
    return "V4_5ALL";
  }

  /** Suno/sunoapi 업스트림: V4 계열 곡 제목은 80자 초과 시 "The length of music title cannot exceed 80 characters" 거부 */
  function sunoTitleMaxLenForModel(model: string): number {
    const m = (model || "").trim();
    if (m === "V4" || m.startsWith("V4_")) return 80;
    return 100;
  }

  function sanitizeSunoDerivedTitleLine(s: string): string {
    let t = s.replace(/\s+/g, " ").trim();
    t = t.replace(/^["'"「『（(\[]+/, "").replace(/["'"」』）)\]]+$/, "").trim();
    return t;
  }

  /**
   * Custom 모드에서 사용자가 title을 비운 경우: 가사(prompt) 본문에서 제목 후보 추출.
   * - `제목:` / `Title:` 등 명시 라인 우선
   * - 그다음 `[Verse]` 등 섹션 태그만 있는 줄은 건너뛰고, 첫 유효 텍스트 줄 사용
   */
  function deriveSunoTitleFromLyricsText(text: string, maxLen: number): string | null {
    const raw = String(text ?? "").trim();
    if (!raw) return null;

    const labeled = raw.match(/(?:^|[\r\n])\s*(?:title|제목|곡명|타이틀)\s*[:：]\s*([^\r\n]+)/i);
    if (labeled?.[1]) {
      const t = sanitizeSunoDerivedTitleLine(labeled[1]);
      if (t.length > 0) return t.length > maxLen ? t.slice(0, maxLen) : t;
    }

    const lines = raw.split(/\r?\n/);
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      if (/^\[[^\]]+\]\s*$/.test(trimmed)) continue;
      const rest = trimmed.replace(/^\[[^\]]+\]\s*/, "").trim();
      const candidate = rest || trimmed;
      const t = sanitizeSunoDerivedTitleLine(candidate);
      if (t.length > 0) return t.length > maxLen ? t.slice(0, maxLen) : t;
    }

    const flat = sanitizeSunoDerivedTitleLine(raw.replace(/\r?\n/g, " "));
    if (flat.length > 0) return flat.length > maxLen ? flat.slice(0, maxLen) : flat;
    return null;
  }

  function resolveSunoCustomModeTitle(opts: {
    explicitTitle: string;
    lyricsPrimary: string;
    lyricsFallback: string;
    styleTags: string;
    instrumental: boolean;
    model: string;
  }): string {
    const maxLen = sunoTitleMaxLenForModel(opts.model);
    const explicit = opts.explicitTitle.trim();
    if (explicit) return explicit.slice(0, maxLen);

    if (!opts.instrumental) {
      for (const block of [opts.lyricsPrimary, opts.lyricsFallback]) {
        const d = deriveSunoTitleFromLyricsText(block, maxLen);
        if (d) return d;
      }
    }

    const fromStyle = sanitizeSunoDerivedTitleLine(opts.styleTags);
    if (fromStyle.length > 0) return fromStyle.slice(0, maxLen);

    return "Untitled";
  }

  // Suno 콜백 캐시는 complete 만 저장. first 를 캐시하면 폴링이 조기 종료되며 임시 stream URL 만 저장돼 시간이 지나 한 곡만 재생 실패하는 사례가 남.
  const sunoCallbackResults = new Map<
    string,
    {
      state: "succeeded";
      data: {
        clip_id?: string;
        audio_url?: string;
        image_url?: string;
        title?: string;
        tags?: string;
        prompt?: string;
        custom_mode?: boolean;
        duration?: number;
      }[];
    }
  >();

  app.post("/api/ai-music/suno-callback", (req, res) => {
    res.status(200).json({ received: true });
    try {
      const body = req.body as { code?: number; data?: { callbackType?: string; task_id?: string; data?: unknown[] } };
      const cbType = body?.data?.callbackType;
      const taskId = body?.data?.task_id;
      const rawList = Array.isArray(body?.data?.data) ? body.data.data : [];
      if (cbType === "complete" && taskId && rawList.length > 0) {
        const tracks = rawList.map((t: unknown) => {
          const r = t as Record<string, unknown>;
          return {
            clip_id: r.id as string | undefined,
            audio_url: pickRemoteClipAudioUrl(r),
            image_url: pickRemoteClipImageUrl(r),
            title: r.title as string | undefined,
            tags: r.tags as string | undefined,
            prompt: r.prompt as string | undefined,
            custom_mode: undefined as boolean | undefined,
            duration: pickClipDurationSec(r),
          };
        });
        sunoCallbackResults.set(taskId, { state: "succeeded", data: tracks });
      }
    } catch (_) {}
  });

  app.post("/api/ai-music/lyrics-callback", (_req, res) => {
    res.status(200).json({ received: true });
  });

  // AI 음악 생성 커버/오디오 프록시: 자기 자신 URL이 넘어오면 내부 url 쿼리만 꺼내서 사용 (재귀 호출 시 쿠키 없어 401 나는 것 방지)
  const siteBase = (process.env.SITE_URL || "https://venysound.com").replace(/\/$/, "");
  function resolveProxyUrl(given: string, proxyPath: "/api/ai-music/cover-proxy" | "/api/ai-music/audio-proxy"): string {
    try {
      const u = new URL(given);
      const base = new URL(siteBase);
      if (u.origin === base.origin && u.pathname === proxyPath && typeof u.searchParams.get("url") === "string") {
        return u.searchParams.get("url")!;
      }
    } catch {}
    return given;
  }

  // AI 음악 생성 커버 이미지 프록시 (업로드 페이지에서 CORS 없이 커버 사용, 로그인 사용자만)
  const COVER_PROXY_MAX_BYTES = 5 * 1024 * 1024; // 5MB
  app.get("/api/ai-music/cover-proxy", isAuthenticated, async (req, res) => {
    let rawUrl = req.query.url as string;
    if (!rawUrl || typeof rawUrl !== "string") {
      return res.status(400).json({ message: "url이 필요합니다." });
    }
    rawUrl = resolveProxyUrl(rawUrl, "/api/ai-music/cover-proxy");
    let parsed: URL;
    try {
      parsed = new URL(rawUrl);
    } catch {
      return res.status(400).json({ message: "잘못된 URL입니다." });
    }
    if (parsed.protocol !== "https:") {
      return res.status(400).json({ message: "https URL만 가능합니다." });
    }
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000);
      const imgRes = await fetch(rawUrl, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          Accept: "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
        },
        signal: controller.signal,
      });
      clearTimeout(timeout);
      if (!imgRes.ok) {
        console.warn("[ai-music cover-proxy] 이미지 응답 실패:", imgRes.status, parsed.hostname, rawUrl.slice(0, 60));
        return res.status(502).json({ message: "이미지를 가져오지 못했습니다." });
      }
      const contentType = imgRes.headers.get("content-type") || "image/jpeg";
      const contentLength = imgRes.headers.get("content-length");
      if (contentLength && parseInt(contentLength, 10) > COVER_PROXY_MAX_BYTES) {
        return res.status(413).json({ message: "이미지 용량이 너무 큽니다." });
      }
      const buf = await imgRes.arrayBuffer();
      if (buf.byteLength > COVER_PROXY_MAX_BYTES) {
        return res.status(413).json({ message: "이미지 용량이 너무 큽니다." });
      }
      res.setHeader("Content-Type", contentType);
      res.setHeader("Cache-Control", "private, max-age=3600");
      res.send(Buffer.from(buf));
    } catch (e) {
      console.error("[ai-music cover-proxy]", (e as Error).message, parsed.hostname, rawUrl.slice(0, 60));
      res.status(502).json({ message: "이미지를 가져오지 못했습니다." });
    }
  });

  const AUDIO_PROXY_MAX_BYTES = 50 * 1024 * 1024; // 50MB

  /** 무료 플랜: 프록시는 본인 라이브러리에 저장된 URL만. 파일(purpose=file)은 공개 후에만. */
  function buildAiLibraryAudioUrlCandidates(raw: string): string[] {
    const out: string[] = [];
    const seen = new Set<string>();
    const push = (s: string) => {
      const t = s.trim();
      if (!t || seen.has(t)) return;
      seen.add(t);
      out.push(t);
    };
    push(raw);
    try {
      push(new URL(raw.trim()).href);
    } catch {
      /* ignore */
    }
    try {
      const dec = decodeURIComponent(raw.trim());
      push(dec);
      try {
        push(new URL(dec).href);
      } catch {
        /* ignore */
      }
    } catch {
      /* ignore */
    }
    return out;
  }

  async function assertAiAudioProxyAllowedForUser(
    userId: string,
    rawUrl: string,
    purpose: "stream" | "file",
  ): Promise<{ ok: true } | { ok: false; message: string }> {
    const [userRow] = await db.select().from(users).where(eq(users.id, userId));
    const now = new Date();
    if (userRow?.role === "admin" || isActivePaidSubscription(userRow, now)) {
      return { ok: true };
    }
    const candidates = buildAiLibraryAudioUrlCandidates(rawUrl);
    if (candidates.length === 0) {
      return { ok: false, message: "허용되지 않은 음원 주소입니다." };
    }
    const urlCond =
      candidates.length === 1
        ? eq(aiMusicSavedTracks.audioUrl, candidates[0]!)
        : or(...candidates.map((c) => eq(aiMusicSavedTracks.audioUrl, c)))!;
    const rows = await db
      .select({ publishedToSite: aiMusicSavedTracks.publishedToSite })
      .from(aiMusicSavedTracks)
      .where(and(eq(aiMusicSavedTracks.userId, userId), urlCond))
      .limit(16);
    if (rows.length === 0) {
      return {
        ok: false,
        message:
          purpose === "file"
            ? "무료 플랜에서는 내 생성 라이브러리에 있는 음원만 파일로 받을 수 있으며, 사이트에 신곡으로 공개한 뒤에만 가능합니다."
            : "무료 플랜에서는 내 생성 라이브러리에 저장된 음원만 재생할 수 있습니다.",
      };
    }
    const anyPublished = rows.some((r) => r.publishedToSite);
    if (purpose === "file" && !anyPublished) {
      return { ok: false, message: "무료 플랜에서는 사이트에 신곡으로 공개한 뒤에만 파일로 받을 수 있습니다." };
    }
    return { ok: true };
  }

  app.get("/api/ai-music/audio-proxy", isAuthenticated, async (req, res) => {
    let rawUrl = req.query.url as string;
    if (!rawUrl || typeof rawUrl !== "string") {
      return res.status(400).json({ message: "url이 필요합니다." });
    }
    rawUrl = resolveProxyUrl(rawUrl, "/api/ai-music/audio-proxy");
    if (/\/None\.(mp3|wav|ogg)|undefined|null/i.test(rawUrl)) {
      return res.status(400).json({ message: "음원 주소가 올바르지 않습니다. 생성된 곡을 다운로드한 뒤 파일을 직접 선택해 주세요." });
    }
    let parsed: URL;
    try {
      parsed = new URL(rawUrl);
    } catch {
      return res.status(400).json({ message: "잘못된 URL입니다." });
    }
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
      return res.status(400).json({ message: "http(s) URL만 가능합니다." });
    }
    const purposeRaw = typeof req.query.purpose === "string" ? req.query.purpose.trim().toLowerCase() : "";
    const purpose: "stream" | "file" =
      purposeRaw === "file" || purposeRaw === "download" ? "file" : "stream";
    // @ts-ignore Replit auth
    const proxyUserId = req.user?.claims?.sub as string;
    const gate = await assertAiAudioProxyAllowedForUser(proxyUserId, rawUrl, purpose);
    if (!gate.ok) {
      return res.status(403).json({ message: gate.message });
    }
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 60000);
      const audioRes = await fetch(rawUrl, {
        redirect: "follow",
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          Accept: "audio/*,*/*;q=0.8",
          Referer: parsed.origin + "/",
        },
        signal: controller.signal,
      });
      clearTimeout(timeout);
      if (!audioRes.ok) {
        console.warn("[ai-music audio-proxy] 오디오 응답 실패:", audioRes.status, parsed.hostname, rawUrl.slice(0, 60));
        const expiredHint = audioRes.status === 403 || audioRes.status === 404
          ? " 음원 링크가 만료되었을 수 있습니다. 생성된 곡을 다운로드한 뒤 파일을 직접 선택해 주세요."
          : "";
        return res.status(502).json({ message: "음원을 가져오지 못했습니다." + expiredHint });
      }
      const contentType = audioRes.headers.get("content-type") || "audio/mpeg";
      const ct = contentType.split(";")[0].toLowerCase();
      if (ct && ct !== "application/octet-stream" && !ct.startsWith("audio/")) {
        console.warn("[ai-music audio-proxy] 오디오가 아님:", ct, rawUrl.slice(0, 60));
        return res.status(502).json({ message: "음원을 가져오지 못했습니다. 링크가 만료되었을 수 있습니다. 생성된 곡을 다운로드한 뒤 파일을 직접 선택해 주세요." });
      }
      const contentLength = audioRes.headers.get("content-length");
      if (contentLength && parseInt(contentLength, 10) > AUDIO_PROXY_MAX_BYTES) {
        return res.status(413).json({ message: "음원 용량이 너무 큽니다." });
      }
      const buf = await audioRes.arrayBuffer();
      if (buf.byteLength > AUDIO_PROXY_MAX_BYTES) {
        return res.status(413).json({ message: "음원 용량이 너무 큽니다." });
      }
      res.setHeader("Content-Type", contentType);
      res.setHeader("Cache-Control", "private, max-age=3600");
      res.send(Buffer.from(buf));
    } catch (e) {
      console.error("[ai-music audio-proxy]", (e as Error).message, parsed.hostname, rawUrl.slice(0, 60));
      res.status(502).json({ message: "음원을 가져오지 못했습니다." });
    }
  });

  /** Suno WAV 변환 완료 콜백 URL용 (본 서버는 폴링으로 결과를 받지만 API 스펙상 필수) */
  app.get("/api/ai-music/generated-file-proxy", isAuthenticated, async (req, res) => {
    const rawUrl = typeof req.query.url === "string" ? req.query.url : "";
    const kind = typeof req.query.kind === "string" ? req.query.kind.trim().toLowerCase() : "";
    if (!rawUrl || (kind !== "wav" && kind !== "mp4")) {
      return res.status(400).json({ message: "url and kind are required." });
    }
    let parsed: URL;
    try {
      parsed = new URL(rawUrl);
    } catch {
      return res.status(400).json({ message: "Invalid file URL." });
    }
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
      return res.status(400).json({ message: "Only http(s) URLs are supported." });
    }
    const fileBase = sanitizeDownloadFileName(req.query.filename, kind === "wav" ? "audio" : "video");
    const contentTypeFallback = kind === "wav" ? "audio/wav" : "video/mp4";
    const maxBytes = kind === "wav" ? 120 * 1024 * 1024 : 260 * 1024 * 1024;
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 120000);
      const fileRes = await fetch(rawUrl, {
        redirect: "follow",
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          Accept: kind === "wav" ? "audio/*,*/*;q=0.8" : "video/*,*/*;q=0.8",
          Referer: parsed.origin + "/",
        },
        signal: controller.signal,
      });
      clearTimeout(timeout);
      if (!fileRes.ok) {
        return res.status(502).json({ message: `${kind.toUpperCase()} file could not be fetched.` });
      }
      const contentLength = fileRes.headers.get("content-length");
      if (contentLength && parseInt(contentLength, 10) > maxBytes) {
        return res.status(413).json({ message: `${kind.toUpperCase()} file is too large.` });
      }
      const buf = Buffer.from(await fileRes.arrayBuffer());
      if (buf.byteLength > maxBytes) {
        return res.status(413).json({ message: `${kind.toUpperCase()} file is too large.` });
      }
      const upstreamType = fileRes.headers.get("content-type") || contentTypeFallback;
      const safeName = `${fileBase}.${kind}`;
      res.setHeader("Content-Type", upstreamType);
      res.setHeader("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(safeName)}`);
      res.setHeader("Cache-Control", "private, max-age=300");
      return res.send(buf);
    } catch (e) {
      console.error("[ai-music generated-file-proxy]", e);
      return res.status(502).json({ message: `${kind.toUpperCase()} file download failed.` });
    }
  });

  app.post("/api/ai-music/suno-wav-callback", (_req, res) => {
    res.status(200).json({ received: true });
  });

  app.post("/api/ai-music/suno-mp4-callback", (_req, res) => {
    res.status(200).json({ received: true });
  });

  const WAV_POLL_MAX_ATTEMPTS = 75;
  const WAV_POLL_INTERVAL_MS = 2000;
  const MP4_POLL_MAX_ATTEMPTS = 90;
  const MP4_POLL_INTERVAL_MS = 2000;

  /** 생성된 클립의 고품질 WAV 다운로드 URL 조회 (AIMusicAPI: 즉시, Suno: 변환 작업 시작 후 폴링) */
  app.post("/api/ai-music/wav-url", isAuthenticated, async (req, res) => {
    const body = req.body as { clip_id?: string; generation_task_id?: string; provider?: string };
    const clipId = typeof body.clip_id === "string" ? body.clip_id.trim() : "";
    if (!clipId) {
      return res.status(400).json({ message: "clip_id가 필요합니다." });
    }
    const provider = ((body.provider as string) || AI_MUSIC_PROVIDER || "").trim();
    const genTaskId = typeof body.generation_task_id === "string" ? body.generation_task_id.trim() : "";

    try {
      // @ts-ignore Replit auth
      const wavUserId = req.user?.claims?.sub as string;
      const [wavUserRow] = await db.select().from(users).where(eq(users.id, wavUserId));
      const wavNow = new Date();
      const wavPaidTier = wavUserRow?.role === "admin" || isActivePaidSubscription(wavUserRow, wavNow);
      if (!wavPaidTier) {
        const wavLibWhere = and(
          eq(aiMusicSavedTracks.userId, wavUserId),
          eq(aiMusicSavedTracks.clipId, clipId),
          ...(genTaskId ? [eq(aiMusicSavedTracks.generationTaskId, genTaskId)] : []),
        );
        const wavLibRows = await db
          .select({ publishedToSite: aiMusicSavedTracks.publishedToSite })
          .from(aiMusicSavedTracks)
          .where(wavLibWhere)
          .limit(8);
        if (wavLibRows.length === 0 || !wavLibRows.some((r) => r.publishedToSite)) {
          return res.status(403).json({
            message:
              "무료 플랜에서는 사이트에 신곡으로 공개한 AI 생성곡만 WAV 고음질 URL을 요청할 수 있습니다.",
          });
        }
      }

      if (provider === "aimusicapi" && AIMUSICAPI_KEY) {
        const apiRes = await fetch(`${AIMUSICAPI_BASE}/api/v1/sonic/wav`, {
          method: "POST",
          headers: { Authorization: `Bearer ${AIMUSICAPI_KEY}`, "Content-Type": "application/json" },
          body: JSON.stringify({ clip_id: clipId }),
        });
        const data = await apiRes.json().catch(() => ({}));
        if (!apiRes.ok) {
          const msg =
            (data as { message?: string }).message ?? (data as { error?: string }).error ?? "WAV 변환 요청 실패";
          return res.status(apiRes.status >= 400 && apiRes.status < 500 ? apiRes.status : 502).json({ message: String(msg) });
        }
        const wavUrl = (data as { data?: { wav_url?: string } }).data?.wav_url;
        if (!wavUrl || typeof wavUrl !== "string") {
          return res.status(502).json({ message: "WAV URL을 받지 못했습니다." });
        }
        return res.json({ wav_url: wavUrl });
      }

      const wavUpstream = provider === "kie" || provider === "suno" ? sunoStyleUpstream(provider) : null;
      if (wavUpstream) {
        if (!genTaskId) {
          return res.status(400).json({
            message: "WAV 변환에는 생성 작업 ID(generation_task_id)가 필요합니다.",
          });
        }
        const genRes = await fetch(`${wavUpstream.base}/api/v1/wav/generate`, {
          method: "POST",
          headers: { Authorization: `Bearer ${wavUpstream.key}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            taskId: genTaskId,
            audioId: clipId,
            callBackUrl: `${siteBase}/api/ai-music/suno-wav-callback`,
          }),
        });
        const genData = await genRes.json().catch(() => ({}));
        const bizCode = (genData as { code?: number }).code;
        if (!genRes.ok || bizCode !== 200) {
          const msg = (genData as { msg?: string }).msg ?? "WAV 변환 시작 실패";
          return res.status(!genRes.ok && genRes.status >= 400 && genRes.status < 500 ? genRes.status : 502).json({
            message: String(msg),
          });
        }
        const gd = (genData as { data?: { taskId?: string; task_id?: string } }).data;
        const wavTaskId =
          (typeof gd?.taskId === "string" ? gd.taskId : "") || (typeof gd?.task_id === "string" ? gd.task_id : "") || "";
        if (!wavTaskId) {
          return res.status(502).json({ message: "WAV 작업 ID를 받지 못했습니다." });
        }
        for (let i = 0; i < WAV_POLL_MAX_ATTEMPTS; i++) {
          if (i > 0) {
            await new Promise((r) => setTimeout(r, WAV_POLL_INTERVAL_MS));
          }
          const infoRes = await fetch(`${wavUpstream.base}/api/v1/wav/record-info?taskId=${encodeURIComponent(wavTaskId)}`, {
            headers: { Authorization: `Bearer ${wavUpstream.key}` },
          });
          const infoData = await infoRes.json().catch(() => ({}));
          if ((infoData as { code?: number }).code !== 200) continue;
          const d = (infoData as { data?: { successFlag?: string; response?: { audioWavUrl?: string }; errorMessage?: string } }).data;
          const flag = d?.successFlag;
          if (flag === "SUCCESS" && d?.response?.audioWavUrl) {
            return res.json({ wav_url: d.response.audioWavUrl });
          }
          if (flag && ["CREATE_TASK_FAILED", "GENERATE_WAV_FAILED", "CALLBACK_EXCEPTION"].includes(flag)) {
            return res.status(502).json({ message: d?.errorMessage ?? "WAV 변환에 실패했습니다." });
          }
        }
        return res.status(504).json({ message: "WAV 변환 시간이 초과되었습니다. 잠시 후 다시 시도해 주세요." });
      }

      return res.status(503).json({ message: "WAV 변환이 이 환경에서 지원되지 않습니다." });
    } catch (e) {
      console.error("[ai-music wav-url]", e);
      return res.status(500).json({ message: "WAV 변환 중 오류가 발생했습니다." });
    }
  });

  /** 생성된 클립의 MP4 비디오 URL 조회 (Suno/KIE: 변환 작업 시작 후 폴링) */
  app.post("/api/ai-music/mp4-url", isAuthenticated, async (req, res) => {
    const body = req.body as { clip_id?: string; generation_task_id?: string; provider?: string; title?: string };
    const clipId = typeof body.clip_id === "string" ? body.clip_id.trim() : "";
    if (!clipId) {
      return res.status(400).json({ message: "clip_id is required." });
    }
    const provider = ((body.provider as string) || AI_MUSIC_PROVIDER || "").trim();
    const genTaskId = typeof body.generation_task_id === "string" ? body.generation_task_id.trim() : "";

    try {
      // @ts-ignore Replit auth
      const mp4UserId = req.user?.claims?.sub as string;
      const [mp4UserRow] = await db.select().from(users).where(eq(users.id, mp4UserId));
      const mp4Now = new Date();
      const mp4PaidTier = mp4UserRow?.role === "admin" || isActivePaidSubscription(mp4UserRow, mp4Now);
      const mp4Author = resolveAiCreatorDisplayName(mp4UserRow);
      if (!mp4PaidTier) {
        const mp4LibWhere = and(
          eq(aiMusicSavedTracks.userId, mp4UserId),
          eq(aiMusicSavedTracks.clipId, clipId),
          ...(genTaskId ? [eq(aiMusicSavedTracks.generationTaskId, genTaskId)] : []),
        );
        const mp4LibRows = await db
          .select({ publishedToSite: aiMusicSavedTracks.publishedToSite })
          .from(aiMusicSavedTracks)
          .where(mp4LibWhere)
          .limit(8);
        if (mp4LibRows.length === 0 || !mp4LibRows.some((r) => r.publishedToSite)) {
          return res.status(403).json({
            message: "Free users can create MP4 only after publishing the generated track to the site.",
          });
        }
      }

      const mp4Upstream = provider === "kie" || provider === "suno" ? sunoStyleUpstream(provider) : null;
      if (!mp4Upstream) {
        return res.status(503).json({ message: "MP4 conversion is not supported by the current provider." });
      }
      if (!genTaskId) {
        return res.status(400).json({ message: "generation_task_id is required for MP4 conversion." });
      }
      let resolvedClipId = clipId;
      const requestedTitle = normalizeAiTitleForMatch(body.title);
      if (requestedTitle) {
        try {
          const originalInfoRes = await fetch(`${mp4Upstream.base}/api/v1/generate/record-info?taskId=${encodeURIComponent(genTaskId)}`, {
            headers: { Authorization: `Bearer ${mp4Upstream.key}` },
          });
          const originalInfo = await originalInfoRes.json().catch(() => ({}));
          const resp = (originalInfo as { data?: { response?: { sunoData?: unknown[]; suno_data?: unknown[] } } }).data?.response;
          const raws = (Array.isArray(resp?.sunoData) ? resp?.sunoData : Array.isArray(resp?.suno_data) ? resp?.suno_data : []) as Record<string, unknown>[];
          const matched = raws.find((r) => normalizeAiTitleForMatch(r.title) === requestedTitle);
          const matchedId = matched?.id;
          if (typeof matchedId === "string" && matchedId.trim()) {
            resolvedClipId = matchedId.trim();
          }
        } catch (matchErr) {
          console.warn("[ai-music mp4-url] title/audioId match skipped:", matchErr instanceof Error ? matchErr.message : String(matchErr));
        }
      }

      const genRes = await fetch(`${mp4Upstream.base}/api/v1/mp4/generate`, {
        method: "POST",
        headers: { Authorization: `Bearer ${mp4Upstream.key}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          taskId: genTaskId,
          audioId: resolvedClipId,
          callBackUrl: `${siteBase}/api/ai-music/suno-mp4-callback`,
          author: mp4Author,
          domainName: "venysound.com",
        }),
      });
      const genData = await genRes.json().catch(() => ({}));
      const bizCode = (genData as { code?: number }).code;
      const genMsg = (genData as { msg?: string; message?: string }).msg ?? (genData as { message?: string }).message ?? "";
      const gd = (genData as { data?: { taskId?: string; task_id?: string }; taskId?: string; task_id?: string }).data;
      const mp4TaskId =
        (typeof gd?.taskId === "string" ? gd.taskId : "") ||
        (typeof gd?.task_id === "string" ? gd.task_id : "") ||
        (typeof (genData as { taskId?: string }).taskId === "string" ? (genData as { taskId: string }).taskId : "") ||
        (typeof (genData as { task_id?: string }).task_id === "string" ? (genData as { task_id: string }).task_id : "") ||
        (/already exists/i.test(genMsg) ? genTaskId : "") ||
        "";
      if ((!genRes.ok || (typeof bizCode === "number" && bizCode !== 200)) && !/already exists/i.test(genMsg)) {
        const msg = genMsg || "MP4 conversion failed to start.";
        return res.status(!genRes.ok && genRes.status >= 400 && genRes.status < 500 ? genRes.status : 502).json({
          message: String(msg),
        });
      }
      if (!mp4TaskId) {
        return res.status(502).json({ message: genMsg || "MP4 task id was not returned." });
      }
      for (let i = 0; i < MP4_POLL_MAX_ATTEMPTS; i++) {
        if (i > 0) {
          await new Promise((r) => setTimeout(r, MP4_POLL_INTERVAL_MS));
        }
        const infoRes = await fetch(`${mp4Upstream.base}/api/v1/mp4/record-info?taskId=${encodeURIComponent(mp4TaskId)}`, {
          headers: { Authorization: `Bearer ${mp4Upstream.key}` },
        });
        const infoData = await infoRes.json().catch(() => ({}));
        if (!infoRes.ok) {
          const msg = (infoData as { msg?: string; message?: string }).msg ?? (infoData as { message?: string }).message;
          return res.status(infoRes.status >= 400 && infoRes.status < 500 ? infoRes.status : 502).json({
            message: String(msg || "MP4 status lookup failed."),
          });
        }
        const infoCode = (infoData as { code?: number }).code;
        if (typeof infoCode === "number" && infoCode !== 200) {
          const msg = (infoData as { msg?: string; message?: string }).msg ?? (infoData as { message?: string }).message;
          return res.status(502).json({ message: String(msg || `MP4 status lookup failed (${infoCode}).`) });
        }
        const d = (infoData as {
          data?: {
            successFlag?: string;
            success_flag?: string;
            status?: string;
            response?: { videoUrl?: string; video_url?: string; mp4Url?: string; mp4_url?: string };
            videoUrl?: string;
            video_url?: string;
            mp4Url?: string;
            mp4_url?: string;
            errorMessage?: string;
          };
        }).data;
        const flag = String(d?.successFlag ?? d?.success_flag ?? d?.status ?? "").trim().toUpperCase();
        const videoUrl =
          d?.response?.videoUrl ??
          d?.response?.video_url ??
          d?.response?.mp4Url ??
          d?.response?.mp4_url ??
          d?.videoUrl ??
          d?.video_url ??
          d?.mp4Url ??
          d?.mp4_url;
        if (flag === "SUCCESS" && typeof videoUrl === "string" && videoUrl.trim()) {
          return res.json({ mp4_url: videoUrl.trim() });
        }
        if (flag && ["CREATE_TASK_FAILED", "GENERATE_MP4_FAILED", "CALLBACK_EXCEPTION"].includes(flag)) {
          return res.status(502).json({ message: d?.errorMessage ?? "MP4 conversion failed." });
        }
      }
      return res.status(504).json({ message: "MP4 conversion timed out. Please try again shortly." });
    } catch (e) {
      console.error("[ai-music mp4-url]", e);
      return res.status(500).json({ message: "An error occurred during MP4 conversion." });
    }
  });

  // 로그인 없이 API 키 유효성만 확인 (디버깅용). SUNOAPI → KIE → AIMusicAPI.
  app.get("/api/ai-music/check-key", async (_req, res) => {
    const checkSunoStyleCredits = async (label: "kie" | "suno", base: string, key: string) => {
      try {
        const apiRes = await fetch(`${base}/api/v1/generate/credit`, {
          headers: { Authorization: `Bearer ${key}` },
        });
        const data = await apiRes.json().catch(() => ({}));
        if (apiRes.ok && (data as { code?: number }).code === 200) {
          return res.json({ ok: true, provider: label, credits: (data as { data?: number }).data, keyLength: key.length });
        }
        /** KIE(api.kie.ai)는 sunoapi식 `/generate/credit`가 없음(404). 키가 있으면 생성 API는 정상인 경우가 많음 */
        if (label === "kie" && apiRes.status === 404) {
          return res.json({
            ok: true,
            provider: label,
            credits: null,
            keyLength: key.length,
            note: "KIE 잔액 조회 경로 없음 — 가사·음악 생성은 별도 API로 동작합니다.",
          });
        }
        return res.status(200).json({
          ok: false,
          provider: label,
          status: apiRes.status,
          message: (data as { msg?: string }).msg ?? "API 오류",
          keyLength: key.length,
        });
      } catch (e) {
        console.error(`[ai-music check-key ${label}]`, e);
        return res.status(500).json({ ok: false, provider: label, message: "연결 실패" });
      }
    };
    if (SUNOAPI_KEY) return checkSunoStyleCredits("suno", SUNOAPI_BASE, SUNOAPI_KEY);
    if (KIE_API_KEY) return checkSunoStyleCredits("kie", KIE_API_BASE, KIE_API_KEY);
    if (!AIMUSICAPI_KEY) {
      return res.status(503).json({
        ok: false,
        message: "SUNOAPI_API_KEY, KIE_API_KEY 또는 AIMUSICAPI_API_KEY가 .env에 없습니다.",
        keyLength: 0,
      });
    }
    try {
      const apiRes = await fetch(`${AIMUSICAPI_BASE}/api/v1/get-credits`, {
        headers: { Authorization: `Bearer ${AIMUSICAPI_KEY}` },
      });
      const data = await apiRes.json().catch(() => ({}));
      if (apiRes.ok) {
        return res.json({ ok: true, provider: "aimusicapi", credits: data, keyLength: AIMUSICAPI_KEY.length });
      }
      return res.status(200).json({
        ok: false,
        provider: "aimusicapi",
        status: apiRes.status,
        message: (data as { error?: string }).error ?? (data as { message?: string }).message ?? "API 오류",
        keyLength: AIMUSICAPI_KEY.length,
      });
    } catch (e) {
      console.error("[ai-music check-key]", e);
      return res.status(500).json({ ok: false, message: "연결 실패" });
    }
  });

  async function maybePersistSubscriptionRow(userId: string, row: typeof users.$inferSelect): Promise<void> {
    const now = new Date();
    const { subscriptionEntitlements, subscriptionTier, subscriptionExpiresAt, needsWrite } = subscriptionRowNeedsSync(
      row,
      now,
    );
    if (!needsWrite) return;
    await db
      .update(users)
      .set({
        subscriptionEntitlements,
        subscriptionTier,
        subscriptionExpiresAt,
        ...(subscriptionTier === "free" ? { subscriptionPlan: null } : {}),
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId));
  }

  async function insertAiMusicGenerationLog(params: {
    userId: string;
    user: (typeof users.$inferSelect) | undefined;
    taskId: string;
    provider: "kie" | "suno" | "aimusicapi";
    /** 실제 users.credits 에서 차감된 양만 기록(구독 월 한도만 쓴 경우 0) */
    walletCreditsCharged: number;
    body: {
      title?: string;
      tags?: string;
      prompt?: string;
      gpt_description_prompt?: string;
      voice_record?: boolean;
    };
    /** 5월 이벤트 전용 잔액(promo)으로 생성 시, 성공 과금에 필요한 최소 무료 트랙 슬롯(보통 2, instrumental 1) */
    promoMinTracksForBilling?: number;
    /** 기본 charged(기존 행). 생성 직후만 pending. */
    chargeStatus?: "pending" | "charged" | "failed";
    failureMessage?: string | null;
  }): Promise<void> {
    try {
      const { userId, taskId: taskIdRaw, provider, body, walletCreditsCharged, chargeStatus, failureMessage } = params;
      const taskId = String(taskIdRaw ?? "").trim().slice(0, 128);
      const promoMin =
        typeof params.promoMinTracksForBilling === "number" && Number.isFinite(params.promoMinTracksForBilling)
          ? Math.max(1, Math.floor(params.promoMinTracksForBilling))
          : MAY_2026_EVENT_PROMO_TRACKS_PER_GENERATION;
      const nowLog = new Date();
      await voidExpiredPromoAiCreditsForUser(userId, nowLog);
      const [userDb] = await db.select().from(users).where(eq(users.id, userId));
      const user = userDb ?? params.user;
      const displayed = computeDisplayedSubscriptionFromEntitlements(
        user?.subscriptionEntitlements,
        user?.subscriptionTier,
        user?.subscriptionExpiresAt,
        nowLog,
        user?.subscriptionAiWallet,
      );
      const tier = displayed.subscriptionTier;
      const subscriptionActive = isUserPaidSubscriptionActive(user, nowLog);
      const promoWon = Math.max(0, Number(user?.promoAiCreditsWon ?? 0));
      const promoExp = user?.promoAiCreditsExpiresAt ?? null;
      const promoNotExpired = !promoExp || new Date(promoExp).getTime() > nowLog.getTime();
      const canBillPromo = user?.role !== "admin" && promoNotExpired && promoWon >= promoMin;
      const billingKind = user?.role === "admin"
        ? "admin"
        : subscriptionActive && tier !== "free"
          ? "subscription"
          : canBillPromo
            ? "promo"
            : tier === "free"
              ? "free"
              : "credits";
      const creditsCharged = Math.max(0, Math.floor(Number(walletCreditsCharged) || 0));
      const promptText = (body.prompt ?? body.gpt_description_prompt ?? "").trim();
      const parts = [
        body.title?.trim() && `title: ${body.title.trim()}`,
        body.tags?.trim() && `tags: ${body.tags.trim()}`,
        promptText && `prompt: ${promptText.slice(0, 500)}`,
      ].filter(Boolean) as string[];
      const requestSummary = parts.length ? parts.join(" | ").slice(0, 2000) : null;
      await db.insert(aiMusicGenerationLogs).values({
        userId,
        billingKind,
        subscriptionTierAt: tier,
        provider,
        taskId: taskId || null,
        requestTitle: body.title?.trim().slice(0, 500) || null,
        requestSummary,
        creditsCharged,
        chargeStatus: chargeStatus ?? "charged",
        failureMessage: failureMessage ?? null,
        publishments: [],
      });
    } catch (e) {
      const err = e instanceof Error ? e.message : String(e);
      console.error("[ai-music generation log insert]", err, e);
    }
  }

  async function notifyAiMusicCreateCreditsIfNeeded(userIdForNotify: string, wonCharged: number) {
    if (wonCharged <= 0) return;
    try {
      await storage.createNotification({
        userId: userIdForNotify,
        type: "system",
        message: `AI 음악 생성 요청으로 ${wonCharged.toLocaleString("ko-KR")}원이 차감되었습니다.`,
        payload: { wonCharged, creditsCharged: wonCharged, kind: "ai_music_create" },
        url: "/credits",
      });
    } catch (e) {
      console.error("[ai-music billing notify]", e);
    }
  }

  async function notifyMay2026PromoTracksDeducted(userIdForNotify: string, tracksDeducted: number) {
    if (tracksDeducted <= 0) return;
    try {
      await storage.createNotification({
        userId: userIdForNotify,
        type: "system",
        message: `5월 이벤트 무료 AI 곡 ${tracksDeducted.toLocaleString("ko-KR")}곡분이 차감되었습니다. (1회 생성 완료 기준)`,
        payload: { kind: "may2026_event_promo_tracks", tracksDeducted },
        url: "/events/may-2026",
      });
    } catch (e) {
      console.error("[ai-music promo tracks notify]", e);
    }
  }

  /** 생성 성공(업스트림 완료) 확정 시 1회 과금. 무료 플랜 월 한도는 taskId 발급 시점에 반영됨 → 여기서는 0만 반환(이벤트 전용 잔액 `promo`는 예외). */
  async function performAiMusicBillingForUser(
    userIdForBill: string,
    now: Date,
    promoDeductTracks?: number,
  ): Promise<{ walletWonCharged: number; promoTracksDeducted: number }> {
    const [user0] = await db.select().from(users).where(eq(users.id, userIdForBill));
    if (!user0) throw new Error("USER_NOT_FOUND");
    await maybePersistSubscriptionRow(userIdForBill, user0);
    await voidExpiredPromoAiCreditsForUser(userIdForBill, now);
    const [row] = await db.select().from(users).where(eq(users.id, userIdForBill));
    const r = row!;
    if (r.role === "admin") return { walletWonCharged: 0, promoTracksDeducted: 0 };
    const usagePeriodKey = getAiMusicUsagePeriodKey(r, r.role ?? null, now);
    const displayed = computeDisplayedSubscriptionFromEntitlements(
      r.subscriptionEntitlements,
      r.subscriptionTier,
      r.subscriptionExpiresAt,
      now,
      r.subscriptionAiWallet,
    );
    const tier = displayed.subscriptionTier ?? "free";

    if (isUserPaidSubscriptionActive(r, now) && tier !== "free") {
      if (isSubscriptionAiWalletDepleted(r)) {
        await runSubscriptionAiBudgetExhaustionIfNeeded(userIdForBill, now);
        throw new Error("AI_SUBSCRIPTION_WALLET_DEDUCT_FAILED");
      }
      const ok = await deductSubscriptionAiWallet(userIdForBill, AI_MUSIC_WON_PER_TRACK, now);
      if (!ok) throw new Error("AI_SUBSCRIPTION_WALLET_DEDUCT_FAILED");
      try {
        await runSubscriptionAiBudgetExhaustionIfNeeded(userIdForBill, now);
      } catch (e) {
        console.error("[ai-music billing] budget exhaustion after deduct", e);
      }
      return { walletWonCharged: 0, promoTracksDeducted: 0 };
    }

    const promoWon = Math.max(0, Number(r.promoAiCreditsWon ?? 0));
    const promoExp = r.promoAiCreditsExpiresAt ?? null;
    const promoNotExpired = !promoExp || new Date(promoExp).getTime() > now.getTime();
    const deductTracks = Math.max(
      1,
      Math.min(
        MAY_2026_EVENT_PROMO_TRACKS_PER_GENERATION,
        Math.floor(Number(promoDeductTracks ?? MAY_2026_EVENT_PROMO_TRACKS_PER_GENERATION)),
      ),
    );
    if (promoNotExpired && promoWon >= deductTracks) {
      await db.transaction(async (tx) => {
        const [u] = await tx.select().from(users).where(eq(users.id, userIdForBill));
        const pw = Math.max(0, Number(u?.promoAiCreditsWon ?? 0));
        if (pw < deductTracks) throw new Error("INSUFFICIENT_CREDITS");
        await tx
          .update(users)
          .set({ promoAiCreditsWon: pw - deductTracks, updatedAt: new Date() })
          .where(eq(users.id, userIdForBill));
        await tx.insert(creditTransactions).values({
          userId: userIdForBill,
          type: "promo_ai_music",
          amount: -deductTracks,
          description: `AI 음악 생성 (5월 이벤트 무료 곡 ${deductTracks}곡)`,
        });
        if (tier !== "free") {
          await tx.execute(sql`
            INSERT INTO ai_music_usage (user_id, period_month, count, updated_at)
            VALUES (${userIdForBill}, ${usagePeriodKey}, ${deductTracks}, NOW())
            ON CONFLICT (user_id, period_month) DO UPDATE SET count = ai_music_usage.count + ${deductTracks}, updated_at = NOW()
          `);
        }
      });
      return { walletWonCharged: 0, promoTracksDeducted: deductTracks };
    }

    if ((tier ?? "free") === "free") {
      return { walletWonCharged: 0, promoTracksDeducted: 0 };
    }

    await db.transaction(async (tx) => {
      const [u] = await tx.select().from(users).where(eq(users.id, userIdForBill));
      const currentCredits = u?.credits ?? 0;
      if (currentCredits < AI_MUSIC_WON_PER_TRACK) {
        throw new Error("INSUFFICIENT_CREDITS");
      }
      await tx
        .update(users)
        .set({ credits: currentCredits - AI_MUSIC_WON_PER_TRACK, updatedAt: new Date() })
        .where(eq(users.id, userIdForBill));
      await tx.insert(creditTransactions).values({
        userId: userIdForBill,
        type: "ai_music_create",
        amount: -AI_MUSIC_WON_PER_TRACK,
        description: "AI 음악 생성",
      });
      await tx.execute(sql`
        INSERT INTO ai_music_usage (user_id, period_month, count, updated_at)
        VALUES (${userIdForBill}, ${usagePeriodKey}, ${AI_MUSIC_WON_PER_TRACK}, NOW())
        ON CONFLICT (user_id, period_month) DO UPDATE SET count = ai_music_usage.count + ${AI_MUSIC_WON_PER_TRACK}, updated_at = NOW()
      `);
    });
    return { walletWonCharged: AI_MUSIC_WON_PER_TRACK, promoTracksDeducted: 0 };
  }

  async function markAiMusicGenerationFailedOnUpstream(userIdMark: string, taskIdMark: string, message: string): Promise<void> {
    try {
      const trimmed = String(message ?? "생성 실패").slice(0, 4000);
      const [logRow] = await db
        .select({ id: aiMusicGenerationLogs.id, billingKind: aiMusicGenerationLogs.billingKind })
        .from(aiMusicGenerationLogs)
        .where(
          and(
            eq(aiMusicGenerationLogs.userId, userIdMark),
            eq(aiMusicGenerationLogs.taskId, taskIdMark),
            eq(aiMusicGenerationLogs.chargeStatus, "pending"),
          ),
        )
        .limit(1);
      if (!logRow) return;
      await db
        .update(aiMusicGenerationLogs)
        .set({ chargeStatus: "failed", failureMessage: trimmed })
        .where(eq(aiMusicGenerationLogs.id, logRow.id));
      if (logRow.billingKind === "free") {
        const [u] = await db.select().from(users).where(eq(users.id, userIdMark));
        if (u) {
          const pk = getAiMusicUsagePeriodKey(u, u.role ?? null, new Date());
          await db.execute(sql`
            UPDATE ai_music_usage
            SET count = GREATEST(0, count - 1), updated_at = NOW()
            WHERE user_id = ${userIdMark} AND period_month = ${pk}
          `);
        }
      }
    } catch (e) {
      console.error("[ai-music mark upstream failed]", e);
    }
  }

  /** 폴링에서 succeeded 최초 1회만 과금(멱등). */
  async function tryFinalizeAiMusicSuccessBilling(
    userIdFin: string,
    taskIdFin: string,
    opts?: { promoOutputTracks?: number },
  ): Promise<{ applied: boolean; wonCharged: number; promoTracksDeducted: number; balanceWon: number }> {
    const now = new Date();
    const claimed = await db
      .update(aiMusicGenerationLogs)
      .set({ chargeStatus: "charging" })
      .where(
        and(
          eq(aiMusicGenerationLogs.userId, userIdFin),
          eq(aiMusicGenerationLogs.taskId, taskIdFin),
          eq(aiMusicGenerationLogs.chargeStatus, "pending"),
        ),
      )
      .returning({ id: aiMusicGenerationLogs.id });
    const [uEarly] = await db.select({ credits: users.credits }).from(users).where(eq(users.id, userIdFin));
    const balanceEarly = uEarly?.credits ?? 0;
    if (claimed.length === 0) {
      return { applied: false, wonCharged: 0, promoTracksDeducted: 0, balanceWon: balanceEarly };
    }
    const logId = claimed[0].id;
    const promoOut =
      typeof opts?.promoOutputTracks === "number" && Number.isFinite(opts.promoOutputTracks)
        ? Math.max(1, Math.floor(opts.promoOutputTracks))
        : undefined;
    let walletWonCharged = 0;
    let promoTracksDeducted = 0;
    try {
      const billingResult = await performAiMusicBillingForUser(userIdFin, now, promoOut);
      walletWonCharged = billingResult.walletWonCharged;
      promoTracksDeducted = billingResult.promoTracksDeducted;
      const creditsStored = walletWonCharged > 0 ? walletWonCharged : promoTracksDeducted;
      await db
        .update(aiMusicGenerationLogs)
        .set({ chargeStatus: "charged", creditsCharged: creditsStored })
        .where(eq(aiMusicGenerationLogs.id, logId));
      if (promoTracksDeducted > 0) {
        await notifyMay2026PromoTracksDeducted(userIdFin, promoTracksDeducted);
      } else {
        await notifyAiMusicCreateCreditsIfNeeded(userIdFin, walletWonCharged);
      }
    } catch (e) {
      const err = e instanceof Error ? e.message : String(e);
      await db
        .update(aiMusicGenerationLogs)
        .set({
          chargeStatus: "failed",
          failureMessage: `과금 처리 실패: ${err}`.slice(0, 4000),
        })
        .where(eq(aiMusicGenerationLogs.id, logId));
      console.error("[ai-music tryFinalize billing]", e);
      const [uErr] = await db.select({ credits: users.credits }).from(users).where(eq(users.id, userIdFin));
      return { applied: false, wonCharged: 0, promoTracksDeducted: 0, balanceWon: uErr?.credits ?? 0 };
    }
    const [uAfter] = await db.select({ credits: users.credits }).from(users).where(eq(users.id, userIdFin));
    return { applied: true, wonCharged: walletWonCharged, promoTracksDeducted, balanceWon: uAfter?.credits ?? 0 };
  }

  type LibraryRowForLogBackfill = {
    generationTaskId: string | null;
    title: string | null;
    prompt: string | null;
    generationProvider: string | null;
    createdAt: Date;
  };

  /**
   * 라이브러리 동기화(PUT)만 되고 생성 직후 insertAiMusicGenerationLog 가 실패한 경우 등,
   * 관리자 생성 로그가 비는 것을 막기 위해 task_id 기준으로 한 번만 보강한다.
   */
  async function backfillAiMusicGenerationLogsFromLibraryRows(
    tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
    userId: string,
    libraryRows: LibraryRowForLogBackfill[],
  ): Promise<void> {
    const seen = new Set<string>();
    const [user] = await tx.select().from(users).where(eq(users.id, userId));
    if (!user) return;
    const nowLog = new Date();
    const displayed = computeDisplayedSubscriptionFromEntitlements(
      user.subscriptionEntitlements,
      user.subscriptionTier,
      user.subscriptionExpiresAt,
      nowLog,
      user.subscriptionAiWallet,
    );
    const tier = displayed.subscriptionTier;
    const subscriptionActive = isUserPaidSubscriptionActive(user, nowLog);
    const billingKind =
      user.role === "admin" ? "admin" : tier === "free" ? "free" : subscriptionActive ? "subscription" : "credits";

    for (const row of libraryRows) {
      const taskId = row.generationTaskId?.trim();
      if (!taskId || seen.has(taskId)) continue;
      seen.add(taskId);
      try {
        const [existing] = await tx
          .select({ id: aiMusicGenerationLogs.id })
          .from(aiMusicGenerationLogs)
          .where(and(eq(aiMusicGenerationLogs.userId, userId), eq(aiMusicGenerationLogs.taskId, taskId)))
          .limit(1);
        if (existing) continue;
        const provRaw = row.generationProvider?.trim().toLowerCase();
        const provider: "kie" | "suno" | "aimusicapi" =
          provRaw === "kie" ? "kie" : provRaw === "aimusicapi" ? "aimusicapi" : "suno";
        const title = row.title?.trim().slice(0, 500) || null;
        const promptText = row.prompt?.trim() ?? "";
        const requestSummary = promptText
          ? `prompt: ${promptText.slice(0, 500)}`
          : title
            ? `title: ${title}`
            : null;
        const createdAt = row.createdAt instanceof Date && !isNaN(row.createdAt.getTime()) ? row.createdAt : nowLog;
        await tx.insert(aiMusicGenerationLogs).values({
          userId,
          createdAt,
          billingKind,
          subscriptionTierAt: tier,
          provider,
          taskId,
          requestTitle: title,
          requestSummary,
          creditsCharged: 0,
          chargeStatus: "charged",
          publishments: [],
        });
      } catch (e) {
        console.error("[ai-music library backfill generation log]", taskId, e);
      }
    }
  }

  app.get("/api/ai-music/usage", isAuthenticated, async (req, res) => {
    try {
      // @ts-ignore
      const userId = req.user?.claims?.sub as string;
      const [user] = await db.select().from(users).where(eq(users.id, userId));
      if (user) await maybePersistSubscriptionRow(userId, user);
      await voidExpiredPromoAiCreditsForUser(userId, new Date());
      const [userFresh] = user ? await db.select().from(users).where(eq(users.id, userId)) : [undefined];
      let row = userFresh ?? user;
      const now = new Date();
      /** 활성 유료 + 구독 AI 지갑: 동기화 후 잔액이 1곡 미만이면 소진 처리(과금 직후 호출 누락·탭만 열어둔 경우 보정) 후 행 재조회. */
      if (row?.role !== "admin" && isUserPaidSubscriptionActive(row, now)) {
        if (isSubscriptionAiWalletDepleted(row)) {
          try {
            await runSubscriptionAiBudgetExhaustionIfNeeded(userId, now);
          } catch (e) {
            console.error("[ai-music usage] subscription ai wallet depleted", e);
          }
          const [rowAfterDepleted] = await db.select().from(users).where(eq(users.id, userId));
          if (rowAfterDepleted) row = rowAfterDepleted;
        }
        let wSub = await syncSubscriptionAiWalletForPaidUser(userId, now);
        if (wSub && wSub.walletSum <= 0) {
          try {
            await runSubscriptionAiBudgetExhaustionIfNeeded(userId, now);
          } catch (e) {
            console.error("[ai-music usage] subscription ai budget exhaustion", e);
          }
          const [rowAfter] = await db.select().from(users).where(eq(users.id, userId));
          if (rowAfter) row = rowAfter;
          if (row && row.role !== "admin" && isUserPaidSubscriptionActive(row, now)) {
            wSub = await syncSubscriptionAiWalletForPaidUser(userId, now);
          } else {
            wSub = null;
          }
        }
        if (row?.role !== "admin" && isUserPaidSubscriptionActive(row, now) && wSub) {
          const limit = wSub.limitDisplay;
          const usedThisMonth = wSub.periodConsumed;
          const usagePeriodKey = wSub.periodKey;
          const isPaidTier = true;
          const deductsCreditsPerCreate = false;
          const walletCredits = row?.credits ?? 0;
          const quotaKind: "songs" | "subscription_credits" | "unlimited" = "subscription_credits";
          return res.json({
            limit,
            usedThisMonth,
            usagePeriodKey,
            isPaidTier,
            walletCredits,
            creditsBalance: walletCredits,
            promoAiCreditsWon: row?.promoAiCreditsWon ?? 0,
            promoAiCreditsExpiresAt: row?.promoAiCreditsExpiresAt
              ? row.promoAiCreditsExpiresAt instanceof Date
                ? row.promoAiCreditsExpiresAt.toISOString()
                : String(row.promoAiCreditsExpiresAt)
              : null,
            quota: { kind: quotaKind, used: usedThisMonth, limit },
            /** 플랜 월 공급가(부가세 제외) 합 — basic 단일이면 9000. 표시 한도(limit)는 이월 지갑+사용 누적 */
            subscriptionAiPlanGrantWon: wSub.monthlyGrant,
            subscriptionAiWalletRemainingWon: wSub.walletSum,
            wonPerMusicCreate: AI_MUSIC_WON_PER_TRACK,
            creditsPerMusicCreate: AI_MUSIC_WON_PER_TRACK,
            deductsCreditsPerCreate,
          });
        }
      }
      const isPaidTier = row?.role === "admin" || isActivePaidSubscription(row, now);
      const limit = getAiMusicMonthlyUsageLimit(row, row?.role ?? null, now);
      const usagePeriodKey = getAiMusicUsagePeriodKey(row, row?.role ?? null, now);
      const [usage] = await db.select().from(aiMusicUsage).where(and(eq(aiMusicUsage.userId, userId), eq(aiMusicUsage.periodMonth, usagePeriodKey)));
      const usedThisMonth = usage?.count ?? 0;
      const tier = row?.subscriptionTier ?? "free";
      const subActive = isActivePaidSubscription(row, now);
      /** 유효 유료 플랜: 지갑 미차감. 만료된 유료 플랜만 지갑 차감 경로와 동일하게 UI에 표시. */
      const deductsCreditsPerCreate =
        row?.role !== "admin" && isPaidSubscriptionTierId(tier) && !subActive;
      const walletCredits = row?.credits ?? 0;
      const quotaKind: "songs" | "subscription_credits" | "unlimited" =
        row?.role === "admin" ? "unlimited" : subActive ? "subscription_credits" : "songs";
      return res.json({
        limit,
        usedThisMonth,
        usagePeriodKey,
        isPaidTier,
        walletCredits,
        creditsBalance: walletCredits,
        promoAiCreditsWon: row?.promoAiCreditsWon ?? 0,
        promoAiCreditsExpiresAt: row?.promoAiCreditsExpiresAt
          ? row.promoAiCreditsExpiresAt instanceof Date
            ? row.promoAiCreditsExpiresAt.toISOString()
            : String(row.promoAiCreditsExpiresAt)
          : null,
        quota: { kind: quotaKind, used: usedThisMonth, limit },
        wonPerMusicCreate: AI_MUSIC_WON_PER_TRACK,
        creditsPerMusicCreate: AI_MUSIC_WON_PER_TRACK,
        deductsCreditsPerCreate,
      });
    } catch (e) {
      console.error("[ai-music usage]", e);
      res.status(500).json({
        limit: FREE_AI_MUSIC_LIMIT_PER_MONTH,
        usedThisMonth: 0,
        isPaidTier: false,
        walletCredits: 0,
        creditsBalance: 0,
        promoAiCreditsWon: 0,
        promoAiCreditsExpiresAt: null,
        quota: { kind: "songs" as const, used: 0, limit: FREE_AI_MUSIC_LIMIT_PER_MONTH },
        wonPerMusicCreate: AI_MUSIC_WON_PER_TRACK,
        creditsPerMusicCreate: AI_MUSIC_WON_PER_TRACK,
        deductsCreditsPerCreate: false,
      });
    }
  });

  const AI_LIBRARY_MAX_TRACKS = 400;
  const clipStr = (v: unknown, max: number): string | null => {
    if (v == null) return null;
    const s = String(v).trim();
    if (!s) return null;
    return s.length <= max ? s : s.slice(0, max);
  };

  app.get("/api/ai-music/library", isAuthenticated, async (req, res) => {
    try {
      // @ts-ignore
      const userId = req.user?.claims?.sub as string;
      const rows = await db
        .select()
        .from(aiMusicSavedTracks)
        .where(eq(aiMusicSavedTracks.userId, userId))
        .orderBy(desc(aiMusicSavedTracks.createdAt));
      const tracks = rows.map((r) => ({
        id: r.clientId,
        createdAt: r.createdAt ? new Date(r.createdAt).getTime() : Date.now(),
        clip_id: r.clipId ?? undefined,
        audio_url: r.audioUrl ?? undefined,
        image_url: r.imageUrl ?? undefined,
        title: r.title ?? undefined,
        tags: r.tags ?? undefined,
        prompt: r.prompt ?? undefined,
        original_prompt: r.originalPrompt ?? undefined,
        custom_mode: Boolean(r.customMode),
        generationTaskId: r.generationTaskId ?? undefined,
        generationProvider: r.generationProvider ?? undefined,
        uploadCount: r.uploadCount ?? 0,
        downloadCount: r.downloadCount ?? 0,
        wavDownloadCount: r.wavDownloadCount ?? 0,
        mp4DownloadCount: r.mp4DownloadCount ?? 0,
        publishedToSite: Boolean(r.publishedToSite),
      }));
      res.json({ tracks });
    } catch (e) {
      console.error("[ai-music library GET]", e);
      res.status(500).json({ message: "라이브러리를 불러오지 못했습니다." });
    }
  });

  app.put("/api/ai-music/library", isAuthenticated, async (req, res) => {
    try {
      // @ts-ignore
      const userId = req.user?.claims?.sub as string;
      const raw = req.body?.tracks;
      if (!Array.isArray(raw)) {
        return res.status(400).json({ message: "tracks 배열이 필요합니다." });
      }
      if (raw.length > AI_LIBRARY_MAX_TRACKS) {
        return res.status(400).json({ message: `곡은 최대 ${AI_LIBRARY_MAX_TRACKS}개까지 저장할 수 있습니다.` });
      }

      const removedRaw = req.body?.removedClientIds;
      const removedIds: string[] = [];
      if (Array.isArray(removedRaw)) {
        for (const x of removedRaw) {
          const id = clipStr(typeof x === "string" ? x : String(x), 220);
          if (id) removedIds.push(id);
        }
      }
      const removedUnique = [...new Set(removedIds)].slice(0, 500);

      const rows: (typeof aiMusicSavedTracks.$inferInsert)[] = [];
      const seenClient = new Set<string>();
      for (const item of raw) {
        if (!item || typeof item !== "object") continue;
        const o = item as Record<string, unknown>;
        const id = clipStr(o.id, 220);
        if (!id) continue;
        if (seenClient.has(id)) continue;
        seenClient.add(id);
        const createdAtMs = typeof o.createdAt === "number" && Number.isFinite(o.createdAt) ? o.createdAt : Date.now();
        const createdAt = new Date(createdAtMs);
        rows.push({
          userId,
          clientId: id,
          createdAt: isNaN(createdAt.getTime()) ? new Date() : createdAt,
          clipId: clipStr(o.clip_id ?? o.clipId, 512),
          audioUrl: clipStr(o.audio_url ?? o.audioUrl, 8000),
          imageUrl: clipStr(o.image_url ?? o.imageUrl, 8000),
          title: clipStr(o.title, 2000),
          tags: clipStr(o.tags, 4000),
          prompt: clipStr(o.prompt, 12000),
          originalPrompt: clipStr(o.original_prompt ?? o.originalPrompt, 12000),
          customMode: Boolean(o.custom_mode ?? o.customMode),
          generationTaskId: clipStr(o.generationTaskId ?? o.generation_task_id, 128),
          generationProvider: clipStr(o.generationProvider ?? o.generation_provider, 32),
          uploadCount: Math.max(0, Math.min(1_000_000, Math.floor(Number(o.uploadCount) || 0))),
          downloadCount: Math.max(0, Math.min(1_000_000, Math.floor(Number(o.downloadCount) || 0))),
          wavDownloadCount: Math.max(0, Math.min(1_000_000, Math.floor(Number(o.wavDownloadCount ?? o.wav_download_count) || 0))),
          mp4DownloadCount: Math.max(0, Math.min(1_000_000, Math.floor(Number(o.mp4DownloadCount ?? o.mp4_download_count) || 0))),
          publishedToSite: Boolean(o.publishedToSite ?? o.published_to_site),
        });
      }

      /** 기기 한 대가 짧은 목록으로 PUT 해도 다른 기기에서 올린 곡이 통째로 지워지지 않게: upsert + 명시적 삭제만 */
      await db.transaction(async (tx) => {
        if (removedUnique.length > 0) {
          await tx
            .delete(aiMusicSavedTracks)
            .where(and(eq(aiMusicSavedTracks.userId, userId), inArray(aiMusicSavedTracks.clientId, removedUnique)));
        }
        for (const row of rows) {
          await tx
            .insert(aiMusicSavedTracks)
            .values(row)
            .onConflictDoUpdate({
              target: [aiMusicSavedTracks.userId, aiMusicSavedTracks.clientId],
              set: {
                createdAt: row.createdAt,
                clipId: row.clipId,
                /** JSON 직렬화 시 undefined 키가 빠지면 row.audioUrl이 null이 되어 기존 URL을 지워버림 — 보존 */
                audioUrl: sql`coalesce(excluded.audio_url, ${aiMusicSavedTracks.audioUrl})`,
                imageUrl: sql`coalesce(excluded.image_url, ${aiMusicSavedTracks.imageUrl})`,
                title: row.title,
                tags: row.tags,
                prompt: row.prompt,
                originalPrompt: row.originalPrompt,
                customMode: row.customMode,
                /** 동기화 페이로드에 taskId가 빠지면 null로 덮여 배포 추적(publishments)이 깨짐 — 기존 값 보존 */
                generationTaskId: sql`COALESCE(NULLIF(BTRIM(excluded.generation_task_id), ''), ${aiMusicSavedTracks.generationTaskId})`,
                generationProvider: sql`COALESCE(NULLIF(BTRIM(excluded.generation_provider), ''), ${aiMusicSavedTracks.generationProvider})`,
                /** 이전 PUT/기기 동기화로 0이 오면 기존 진행도가 사라지지 않게 보존 */
                uploadCount: sql`GREATEST(COALESCE(${aiMusicSavedTracks.uploadCount}, 0), COALESCE(excluded.upload_count, 0))`,
                downloadCount: sql`GREATEST(COALESCE(${aiMusicSavedTracks.downloadCount}, 0), COALESCE(excluded.download_count, 0))`,
                wavDownloadCount: sql`GREATEST(COALESCE(${aiMusicSavedTracks.wavDownloadCount}, 0), COALESCE(excluded.wav_download_count, 0))`,
                mp4DownloadCount: sql`GREATEST(COALESCE(${aiMusicSavedTracks.mp4DownloadCount}, 0), COALESCE(excluded.mp4_download_count, 0))`,
                publishedToSite: sql`COALESCE(${aiMusicSavedTracks.publishedToSite}, false) OR COALESCE(excluded.published_to_site, false)`,
              },
            });
        }
        await backfillAiMusicGenerationLogsFromLibraryRows(
          tx,
          userId,
          rows.map((r) => ({
            generationTaskId: r.generationTaskId ?? null,
            title: r.title ?? null,
            prompt: r.prompt ?? null,
            generationProvider: r.generationProvider ?? null,
            createdAt: r.createdAt instanceof Date ? r.createdAt : new Date(),
          })),
        );
        const [cntRow] = await tx
          .select({ c: sql<number>`cast(count(*) as int)` })
          .from(aiMusicSavedTracks)
          .where(eq(aiMusicSavedTracks.userId, userId));
        const total = Number(cntRow?.c ?? 0);
        if (total > AI_LIBRARY_MAX_TRACKS) {
          throw Object.assign(new Error("AI_MUSIC_LIBRARY_LIMIT"), { code: "AI_MUSIC_LIBRARY_LIMIT" });
        }
      });
      res.json({ ok: true, count: rows.length, removed: removedUnique.length });
    } catch (e: any) {
      if (e?.code === "AI_MUSIC_LIBRARY_LIMIT") {
        return res.status(400).json({
          message: `저장 가능한 곡은 최대 ${AI_LIBRARY_MAX_TRACKS}개입니다. 일부 곡을 삭제한 뒤 다시 시도해 주세요.`,
        });
      }
      if (e?.code === "42P01" || String(e?.message || "").includes("does not exist")) {
        console.error("[ai-music library PUT] table missing — run npm run db:deploy");
        return res.status(503).json({ message: "라이브러리 DB가 아직 준비되지 않았습니다. 서버에 db:deploy를 실행해 주세요." });
      }
      console.error("[ai-music library PUT]", e);
      res.status(500).json({ message: "라이브러리를 저장하지 못했습니다." });
    }
  });

  registerAiMusicScorePdfRoutes(app);

  app.get("/api/ai-music/check", isAuthenticated, async (_req, res) => {
    if (!AI_MUSIC_PROVIDER) {
      return res.status(503).json({
        ok: false,
        message: "SUNOAPI_API_KEY, KIE_API_KEY 또는 AIMUSICAPI_API_KEY가 .env에 없습니다.",
      });
    }
    const activeSunoStyle = sunoStyleUpstream(AI_MUSIC_PROVIDER);
    if (activeSunoStyle) {
      try {
        const apiRes = await fetch(`${activeSunoStyle.base}/api/v1/generate/credit`, {
          headers: { Authorization: `Bearer ${activeSunoStyle.key}` },
        });
        const data = await apiRes.json().catch(() => ({}));
        if (apiRes.ok && (data as { code?: number }).code === 200) {
          return res.json({ ok: true, provider: AI_MUSIC_PROVIDER, credits: (data as { data?: number }).data });
        }
        return res.status(200).json({ ok: false, status: apiRes.status, message: (data as { msg?: string }).msg ?? "API 오류" });
      } catch (e) {
        console.error(`[ai-music check ${AI_MUSIC_PROVIDER}]`, e);
        return res.status(500).json({ ok: false, message: "연결 실패" });
      }
    }
    try {
      const apiRes = await fetch(`${AIMUSICAPI_BASE}/api/v1/get-credits`, { headers: { Authorization: `Bearer ${AIMUSICAPI_KEY}` } });
      const data = await apiRes.json().catch(() => ({}));
      if (apiRes.ok) return res.json({ ok: true, provider: "aimusicapi", credits: data });
      return res.status(200).json({ ok: false, status: apiRes.status, message: (data as { error?: string }).error ?? (data as { message?: string }).message ?? "API 오류" });
    } catch (e) {
      console.error("[ai-music check]", e);
      return res.status(500).json({ ok: false, message: "연결 실패" });
    }
  });

  app.post("/api/ai-music/lyrics/generate", isAuthenticated, async (req, res) => {
    if (!AI_MUSIC_PROVIDER) {
      return res.status(503).json({
        message:
          "AI 음악 생성 API가 설정되지 않았습니다. .env에 SUNOAPI_API_KEY, KIE_API_KEY 또는 AIMUSICAPI_API_KEY를 설정하세요.",
      });
    }
    const body = req.body as { prompt?: string; tags?: string; language?: string };
    const theme = String(body.prompt ?? "").trim();
    const styleTags = String(body.tags ?? "").trim();
    if (!theme && !styleTags) {
      return res.status(400).json({ message: "가사 주제·설명 또는 장르·스타일을 입력해 주세요." });
    }
    const upstream = sunoStyleUpstream(AI_MUSIC_PROVIDER);
    try {
      if (upstream) {
        const kiePrompt = buildKieLyricsPrompt({ theme, styleTags });
        const variations = await kieGenerateLyrics({
          base: upstream.base,
          key: upstream.key,
          prompt: kiePrompt,
          callBackUrl: `${siteBase}/api/ai-music/lyrics-callback`,
        });
        const first = variations[0]!;
        return res.json({
          lyrics: first.text,
          title: first.title,
          variations: variations.map((v) => ({ text: v.text, title: v.title })),
          provider: AI_MUSIC_PROVIDER,
        });
      }
      const one = await openaiGenerateStudioLyrics({
        theme: theme || styleTags,
        styleTags,
        language: body.language,
      });
      return res.json({
        lyrics: one.text,
        title: one.title,
        variations: [{ text: one.text, title: one.title }],
        provider: "openai",
      });
    } catch (e) {
      console.error("[ai-music lyrics/generate]", e);
      const mapped = mapOpenAiError(e);
      if (mapped.status === 503 || mapped.status === 429) {
        return res.status(mapped.status).json({ message: mapped.message });
      }
      const msg = e instanceof Error ? e.message : "가사 생성에 실패했습니다.";
      return res.status(502).json({ message: msg });
    }
  });

  app.post("/api/ai-music/lyrics/optimize", isAuthenticated, async (req, res) => {
    if (!AI_MUSIC_PROVIDER) {
      return res.status(503).json({ message: "AI 음악 API가 설정되지 않았습니다." });
    }
    const body = req.body as { lyrics?: string; tags?: string; language?: string };
    const lyrics = String(body.lyrics ?? "").trim();
    const styleTags = String(body.tags ?? "").trim();
    if (!lyrics) {
      return res.status(400).json({ message: "최적화할 가사를 입력해 주세요." });
    }
    const upstream = sunoStyleUpstream(AI_MUSIC_PROVIDER);
    if (upstream) {
      try {
        const kiePrompt = buildKieLyricsPrompt({
          theme: `Polish and structure these song lyrics with clear [Verse]/[Chorus] markers: ${lyrics.replace(/\s+/g, " ").slice(0, 120)}`,
          styleTags,
          existingLyrics: lyrics,
        });
        const variations = await kieGenerateLyrics({
          base: upstream.base,
          key: upstream.key,
          prompt: kiePrompt,
          callBackUrl: `${siteBase}/api/ai-music/lyrics-callback`,
        });
        const first = variations[0]!;
        return res.json({
          lyrics: first.text,
          title: first.title,
          provider: AI_MUSIC_PROVIDER,
        });
      } catch (kieErr) {
        console.error("[ai-music lyrics/optimize kie]", kieErr);
        const msg = kieErr instanceof Error ? kieErr.message : "가사 최적화에 실패했습니다.";
        return res.status(502).json({ message: msg });
      }
    }
    try {
      const one = await openaiOptimizeStudioLyrics({
        lyrics,
        styleTags,
        language: body.language,
      });
      return res.json({ lyrics: one.text, title: one.title, provider: "openai" });
    } catch (e) {
      console.error("[ai-music lyrics/optimize]", e);
      const mapped = mapOpenAiError(e);
      return res.status(mapped.status).json({ message: mapped.message });
    }
  });

  app.post("/api/ai-music/create", isAuthenticated, async (req, res) => {
    if (!AI_MUSIC_PROVIDER) {
      return res.status(503).json({
        message:
          "AI 음악 생성 API가 설정되지 않았습니다. .env에 SUNOAPI_API_KEY, KIE_API_KEY 또는 AIMUSICAPI_API_KEY를 설정하세요.",
      });
    }
    // @ts-ignore
    const userId = req.user?.claims?.sub as string;
    if (!userId || typeof userId !== "string") {
      return res.status(401).json({ message: "로그인이 필요합니다." });
    }
    const [user0] = await db.select().from(users).where(eq(users.id, userId));
    if (!user0) {
      return res.status(404).json({ message: "사용자를 찾을 수 없습니다." });
    }
    await maybePersistSubscriptionRow(userId, user0);
    await voidExpiredPromoAiCreditsForUser(userId, new Date());
    const [row] = await db.select().from(users).where(eq(users.id, userId));
    if (!row) {
      return res.status(404).json({ message: "사용자를 찾을 수 없습니다." });
    }
    const body = req.body as {
      custom_mode?: boolean;
      prompt?: string;
      gpt_description_prompt?: string;
      title?: string;
      tags?: string;
      mv?: string;
      vocal_gender?: "f" | "m";
      make_instrumental?: boolean;
      use_my_voice?: boolean;
    };
    let customMode = body.custom_mode ?? false;
    const makeInstrumental = body.make_instrumental === true;
    const useMyVoice = body.use_my_voice === true;
    const promoMinForCreate = makeInstrumental ? 1 : MAY_2026_EVENT_PROMO_TRACKS_PER_GENERATION;
    const now = new Date();
    const usagePeriodKey = getAiMusicUsagePeriodKey(row, row.role ?? null, now);
    const isSubWallet = row.role !== "admin" && isUserPaidSubscriptionActive(row, now);
    const tierNow = row.subscriptionTier ?? "free";
    const promoWonCreate = Math.max(0, Number(row.promoAiCreditsWon ?? 0));
    const promoExpCreate = row.promoAiCreditsExpiresAt ?? null;
    const promoNotExpiredCreate = !promoExpCreate || new Date(promoExpCreate).getTime() > now.getTime();
    const canUsePromoWallet = row.role !== "admin" && promoNotExpiredCreate && promoWonCreate >= promoMinForCreate;

    let used = 0;
    let limit = 0;
    let usageWouldExceed = false;

    if (row.role === "admin") {
      limit = -1;
      usageWouldExceed = false;
    } else if (tierNow === "free") {
      limit = getAiMusicMonthlyUsageLimit(row, row.role ?? null, now);
      const [usage] = await db.select().from(aiMusicUsage).where(and(eq(aiMusicUsage.userId, userId), eq(aiMusicUsage.periodMonth, usagePeriodKey)));
      used = usage?.count ?? 0;
      usageWouldExceed = canUsePromoWallet ? false : limit >= 0 && used >= limit;
    } else if (isSubWallet) {
      if (isSubscriptionAiWalletDepleted(row)) {
        try {
          await runSubscriptionAiBudgetExhaustionIfNeeded(userId, now);
        } catch (e) {
          console.error("[ai-music create] budget exhaustion (depleted wallet)", e);
        }
        return res.status(403).json({
          message: "구독 AI 생성 금액을 모두 사용했습니다. Free 플랜으로 전환되었습니다.",
          code: "AI_MUSIC_LIMIT_REACHED",
          limit: 0,
          usedThisMonth: 0,
        });
      }
      const w = await syncSubscriptionAiWalletForPaidUser(userId, now);
      if (!w) {
        return res.status(403).json({
          message: "구독 AI 예산을 불러올 수 없습니다. 잠시 후 다시 시도해 주세요.",
          code: "AI_MUSIC_LIMIT_REACHED",
          limit: 0,
          usedThisMonth: 0,
        });
      }
      used = w.periodConsumed;
      limit = w.limitDisplay;
      usageWouldExceed = w.walletSum < AI_MUSIC_WON_PER_TRACK;
    } else {
      limit = getAiMusicMonthlyUsageLimit(row, row.role ?? null, now);
      const [usage] = await db.select().from(aiMusicUsage).where(and(eq(aiMusicUsage.userId, userId), eq(aiMusicUsage.periodMonth, usagePeriodKey)));
      used = usage?.count ?? 0;
      usageWouldExceed = canUsePromoWallet ? false : limit >= 0 && used + AI_MUSIC_WON_PER_TRACK > limit;
    }

    if (usageWouldExceed) {
      if (isSubWallet) {
        try {
          await runSubscriptionAiBudgetExhaustionIfNeeded(userId, now);
        } catch (e) {
          console.error("[ai-music create] budget exhaustion (pre-403)", e);
        }
      }
      const msgFree = `Free 플랜은 월 ${limit}곡까지 AI 음악 생성이 가능합니다. 유료 플랜으로 업그레이드하면 월 AI 사용 예산(원)이 늘어납니다.`;
      const msgPaidPeriod = `이번 기간 AI 음악 생성 한도(원화 예산)를 모두 사용했습니다. 이월·정기 충전분은 다음 갱신 주기에 안내된 방식으로 반영됩니다.`;
      const msgCalendar = `이번 달 AI 음악 생성 한도(원화 예산 ${limit.toLocaleString("ko-KR")}원)를 모두 사용했습니다.`;
      return res.status(403).json({
        message:
          tierNow === "free"
            ? msgFree
            : isSubWallet
              ? msgPaidPeriod
              : limit === FREE_AI_MUSIC_LIMIT_PER_MONTH
                ? msgFree
                : msgCalendar,
        code: "AI_MUSIC_LIMIT_REACHED",
        limit,
        usedThisMonth: used,
      });
    }

    const createSunoStyleDefault =
      AI_MUSIC_PROVIDER === "kie" || AI_MUSIC_PROVIDER === "suno" ? sunoStyleUpstream(AI_MUSIC_PROVIDER) : null;
    const sunoapiForCustomVoice = sunoStyleUpstream("suno");
    if (createSunoStyleDefault && (AI_MUSIC_PROVIDER === "kie" || AI_MUSIC_PROVIDER === "suno")) {
      let createSunoStyle = createSunoStyleDefault;
      let createProvider = AI_MUSIC_PROVIDER;
      const siteBase = (process.env.SITE_URL || "https://venysound.com").replace(/\/$/, "");
      const callBackUrl = `${siteBase}/api/ai-music/suno-callback`;
      let model = resolveSunoGenerateModel(body.mv);
      let personaVoiceId: string | null = null;
      if (useMyVoice) {
        if (makeInstrumental) {
          return res.status(400).json({
            message: "내 보이스로 생성은 연주만(보컬 없음) 모드와 함께 사용할 수 없습니다.",
          });
        }
        if (!sunoapiForCustomVoice) {
          return res.status(503).json({
            message: "내 보이스로 생성하려면 SUNOAPI_API_KEY(sunoapi.org)가 설정되어 있어야 합니다.",
            code: "SUNOAPI_VOICE_REQUIRED",
          });
        }
        createSunoStyle = sunoapiForCustomVoice;
        createProvider = "suno";
        const [voiceRow] = await db.select().from(aiMusicUserVoices).where(eq(aiMusicUserVoices.userId, userId));
        const vid = voiceRow?.voiceId?.trim();
        if (!vid || voiceRow?.status !== "ready") {
          return res.status(400).json({
            message: "등록된 내 보이스가 없습니다. 먼저 「내 보이스 등록」을 완료해 주세요.",
            code: "CUSTOM_VOICE_NOT_READY",
          });
        }
        personaVoiceId = vid;
        customMode = true;
        if (!sunoModelSupportsVoicePersona(model)) {
          model = "V5_5";
        }
      }
      const payload: Record<string, unknown> = {
        customMode,
        instrumental: makeInstrumental,
        model,
        callBackUrl,
      };
      if (personaVoiceId) {
        payload.personaId = personaVoiceId;
        payload.personaModel = "voice_persona";
      }
      if (customMode) {
        const promptForSuno = (body.prompt ?? "").trim() || (body.gpt_description_prompt ?? "").trim();
        payload.style = (body.tags ?? "").trim() || "pop";
        payload.title = resolveSunoCustomModeTitle({
          explicitTitle: String(body.title ?? ""),
          lyricsPrimary: promptForSuno,
          lyricsFallback: String(body.gpt_description_prompt ?? ""),
          styleTags: String(body.tags ?? ""),
          instrumental: makeInstrumental,
          model,
        });
        if (!makeInstrumental) payload.prompt = promptForSuno || String(payload.title ?? "Untitled");
      } else {
        const stylePart = (body.tags ?? "").trim();
        const descPart = (body.gpt_description_prompt ?? body.prompt ?? "").trim();
        const combined = stylePart ? `[스타일] ${stylePart}${descPart ? "\n\n" + descPart : ""}` : descPart;
        payload.prompt = combined.slice(0, 500);
      }
      if (body.vocal_gender) payload.vocalGender = body.vocal_gender;
      try {
        const apiRes = await fetch(`${createSunoStyle.base}/api/v1/generate`, {
          method: "POST",
          headers: { Authorization: `Bearer ${createSunoStyle.key}`, "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const data = await apiRes.json().catch(() => ({}));
        if (!apiRes.ok) {
          const msg = (data as { msg?: string }).msg ?? "API 요청 실패";
          return res.status(apiRes.status >= 400 && apiRes.status < 500 ? apiRes.status : 502).json({ message: String(msg) });
        }
        const sunoBizCode = (data as { code?: number }).code;
        if (typeof sunoBizCode === "number" && sunoBizCode !== 200) {
          const msg = (data as { msg?: string }).msg ?? "음악 생성 API 오류";
          return res.status(502).json({ message: String(msg) });
        }
        const d = data as { data?: { taskId?: string; task_id?: string }; taskId?: string; task_id?: string };
        const taskId =
          (typeof d?.data?.taskId === "string" && d.data.taskId) ||
          (typeof d?.data?.task_id === "string" && d.data.task_id) ||
          (typeof d?.taskId === "string" && d.taskId) ||
          (typeof d?.task_id === "string" && d.task_id) ||
          "";
        if (!taskId) {
          console.warn(`[ai-music create ${createProvider}] 응답 구조:`, JSON.stringify(data).slice(0, 300));
          return res.status(502).json({ message: "API 응답에 taskId가 없습니다." });
        }
        if ((row.subscriptionTier ?? "free") === "free" && row.role !== "admin" && !canUsePromoWallet) {
          await db.execute(sql`
            INSERT INTO ai_music_usage (user_id, period_month, count, updated_at)
            VALUES (${userId}, ${usagePeriodKey}, 1, NOW())
            ON CONFLICT (user_id, period_month) DO UPDATE SET count = ai_music_usage.count + 1, updated_at = NOW()
          `);
        }
        await insertAiMusicGenerationLog({
          userId,
          user: row,
          taskId,
          provider: createProvider as "kie" | "suno" | "aimusicapi",
          walletCreditsCharged: 0,
          chargeStatus: "pending",
          body: { title: body.title, tags: body.tags, prompt: body.prompt, gpt_description_prompt: body.gpt_description_prompt },
          promoMinTracksForBilling: promoMinForCreate,
        });
        const [uAfterSuno] = await db.select({ credits: users.credits }).from(users).where(eq(users.id, userId));
        return res.json({
          task_id: taskId,
          provider: createProvider,
          won_charged: 0,
          billing_deferred: true,
          balance_won: uAfterSuno?.credits ?? 0,
          credits_charged: 0,
          credits_balance: uAfterSuno?.credits ?? 0,
        });
      } catch (e) {
        console.error(`[ai-music create ${createProvider}]`, e);
        const errMsg = e instanceof Error ? e.message : String(e);
        const payload: { message: string; code: string; detail?: string } = {
          message: "음악 생성 요청 중 오류가 발생했습니다.",
          code: "AI_MUSIC_CREATE_ERROR",
        };
        if (process.env.NODE_ENV === "development") payload.detail = errMsg.slice(0, 500);
        return res.status(500).json(payload);
      }
    }

    try {
      const rawMv = typeof body.mv === "string" ? body.mv.trim() : "";
      const mv =
        rawMv === "sonic-v4-5" || rawMv === "sonic-v5-5" || rawMv === "sonic-v4-5-all" || rawMv === "sonic-v5-5-all"
          ? rawMv
          : "sonic-v4-5";
      const payload: Record<string, unknown> = { task_type: "create_music", custom_mode: customMode, mv };
      if (customMode && body.prompt) payload.prompt = body.prompt;
      else if (!customMode) {
        const stylePart = (body.tags ?? "").trim();
        const descPart = (body.gpt_description_prompt ?? body.prompt ?? "").trim();
        payload.gpt_description_prompt = stylePart ? `[스타일] ${stylePart}${descPart ? "\n\n" + descPart : ""}` : descPart;
      }
      if (body.title) payload.title = String(body.title).trim().slice(0, 80);
      if (body.tags) payload.tags = body.tags;
      if (body.vocal_gender) payload.vocal_gender = body.vocal_gender;
      if (makeInstrumental) payload.make_instrumental = true;

      const apiRes = await fetch(`${AIMUSICAPI_BASE}/api/v1/sonic/create`, {
        method: "POST",
        headers: { Authorization: `Bearer ${AIMUSICAPI_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await apiRes.json().catch(() => ({}));
      if (!apiRes.ok) {
        const msg = (data as { error?: string; message?: string }).error ?? (data as { message?: string }).message ?? "API 요청 실패";
        const hint = apiRes.status === 401 ? " .env의 AIMUSICAPI_API_KEY를 확인하세요." : "";
        return res.status(apiRes.status >= 400 && apiRes.status < 500 ? apiRes.status : 502).json({ message: String(msg) + hint });
      }
      const d = data as { task_id?: string; taskId?: string; data?: { task_id?: string; taskId?: string } };
      const taskId =
        (typeof d?.task_id === "string" && d.task_id) ||
        (typeof d?.taskId === "string" && d.taskId) ||
        (typeof d?.data?.task_id === "string" && d.data.task_id) ||
        (typeof d?.data?.taskId === "string" && d.data.taskId) ||
        "";
      if (!taskId) {
        console.warn("[ai-music create aimusicapi] 응답 구조:", JSON.stringify(data).slice(0, 300));
        return res.status(502).json({ message: "API 응답에 task_id가 없습니다." });
      }
      if ((row.subscriptionTier ?? "free") === "free" && row.role !== "admin" && !canUsePromoWallet) {
        await db.execute(sql`
          INSERT INTO ai_music_usage (user_id, period_month, count, updated_at)
          VALUES (${userId}, ${usagePeriodKey}, 1, NOW())
          ON CONFLICT (user_id, period_month) DO UPDATE SET count = ai_music_usage.count + 1, updated_at = NOW()
        `);
      }
      await insertAiMusicGenerationLog({
        userId,
        user: row,
        taskId,
        provider: "aimusicapi",
        walletCreditsCharged: 0,
        chargeStatus: "pending",
        body: { title: body.title, tags: body.tags, prompt: body.prompt, gpt_description_prompt: body.gpt_description_prompt },
        promoMinTracksForBilling: MAY_2026_EVENT_PROMO_TRACKS_PER_GENERATION,
      });
      const [uAfterAimusic] = await db.select({ credits: users.credits }).from(users).where(eq(users.id, userId));
      res.json({
        task_id: taskId,
        provider: "aimusicapi",
        won_charged: 0,
        billing_deferred: true,
        balance_won: uAfterAimusic?.credits ?? 0,
        credits_charged: 0,
        credits_balance: uAfterAimusic?.credits ?? 0,
      });
    } catch (e) {
      console.error("[ai-music create]", e);
      const errMsg = e instanceof Error ? e.message : String(e);
      const payload: { message: string; code: string; detail?: string } = {
        message: "음악 생성 요청 중 오류가 발생했습니다.",
        code: "AI_MUSIC_CREATE_ERROR",
      };
      if (process.env.NODE_ENV === "development") payload.detail = errMsg.slice(0, 500);
      res.status(500).json(payload);
    }
  });

  const SUNOAPI_VOICE_REQUIRED_MSG =
    "내 보이스 등록·녹음 생성은 SUNOAPI_API_KEY(sunoapi.org)가 설정되어 있어야 합니다.";

  /** sunoapi.org 커스텀 보이스 — KIE 전환 없이 기존 SUNOAPI 키만 사용 */
  function sunoapiVoiceUpstreamOnly(): { base: string; key: string } | null {
    return sunoStyleUpstream("suno");
  }

  const sunoapiVoiceFileUploadBase = () => resolveSunoStyleFileUploadBase("suno");

  app.get("/api/ai-music/custom-voice", isAuthenticated, async (req, res) => {
    // @ts-ignore
    const userId = req.user?.claims?.sub as string;
    if (!userId) return res.status(401).json({ message: "로그인이 필요합니다." });
    try {
      const [row] = await db.select().from(aiMusicUserVoices).where(eq(aiMusicUserVoices.userId, userId));
      if (!row?.voiceId?.trim() || row.status !== "ready") {
        return res.json({ ready: false, profile: null });
      }
      return res.json({
        ready: true,
        profile: {
          voiceId: row.voiceId,
          voiceName: row.voiceName ?? "",
          style: row.style ?? "",
          description: row.description ?? "",
          singerSkillLevel: row.singerSkillLevel ?? "beginner",
          updatedAt: row.updatedAt,
        },
      });
    } catch (e) {
      console.error("[ai-music custom-voice GET]", e);
      return res.status(500).json({ message: "보이스 정보를 불러오지 못했습니다." });
    }
  });

  app.delete("/api/ai-music/custom-voice", isAuthenticated, async (req, res) => {
    // @ts-ignore
    const userId = req.user?.claims?.sub as string;
    if (!userId) return res.status(401).json({ message: "로그인이 필요합니다." });
    try {
      await db.delete(aiMusicUserVoices).where(eq(aiMusicUserVoices.userId, userId));
      return res.json({ ok: true });
    } catch (e) {
      console.error("[ai-music custom-voice DELETE]", e);
      return res.status(500).json({ message: "보이스 삭제에 실패했습니다." });
    }
  });

  app.post(
    "/api/ai-music/custom-voice/validate-source",
    isAuthenticated,
    aiVoiceRecordUpload.single("audio"),
    async (req, res) => {
      const upstream = sunoapiVoiceUpstreamOnly();
      if (!upstream) {
        return res.status(503).json({
          message: SUNOAPI_VOICE_REQUIRED_MSG,
          code: "SUNOAPI_VOICE_REQUIRED",
        });
      }
      const file = req.file;
      if (!file?.buffer?.length) {
        return res.status(400).json({ message: "원본 보이스 녹음이 없습니다." });
      }
      // @ts-ignore
      const userId = req.user?.claims?.sub as string;
      if (!userId) return res.status(401).json({ message: "로그인이 필요합니다." });

      const body = req.body as { vocal_start_s?: string; vocal_end_s?: string; language?: string };
      let vocalStartS = Math.max(0, Math.floor(Number(body.vocal_start_s ?? 0)));
      let vocalEndS = Math.max(vocalStartS + 10, Math.floor(Number(body.vocal_end_s ?? 15)));
      if (vocalEndS - vocalStartS > 30) vocalEndS = vocalStartS + 30;
      if (vocalEndS - vocalStartS < 10) vocalEndS = vocalStartS + 10;

      try {
        const ext = file.mimetype?.includes("wav") ? ".wav" : file.mimetype?.includes("mpeg") ? ".mp3" : ".webm";
        const voiceUrl = await kieUploadAudioBuffer({
          apiKey: upstream.key,
          buffer: file.buffer,
          fileName: `voice-source-${crypto.randomUUID()}${ext}`,
          mimeType: file.mimetype || "audio/webm",
          uploadPath: "venysound/voice-source",
          fileUploadBase: sunoapiVoiceFileUploadBase(),
        });
        const { taskId } = await kieVoiceValidateSource({
          upstream,
          voiceUrl,
          vocalStartS,
          vocalEndS,
          language: body.language,
        });
        await db
          .insert(aiMusicUserVoices)
          .values({
            userId,
            validateTaskId: taskId,
            status: "validating",
            updatedAt: new Date(),
          })
          .onConflictDoUpdate({
            target: aiMusicUserVoices.userId,
            set: {
              validateTaskId: taskId,
              voiceId: null,
              status: "validating",
              updatedAt: new Date(),
            },
          });
        return res.json({ validate_task_id: taskId });
      } catch (e) {
        console.error("[ai-music custom-voice validate-source]", e);
        const msg =
          formatKieApiUserMessage(e instanceof Error ? e.message : "", { creditsProvider: "suno" }) ||
          "검증 문구 생성에 실패했습니다.";
        return res.status(502).json({ message: msg });
      }
    },
  );

  app.get("/api/ai-music/custom-voice/validate-info", isAuthenticated, async (req, res) => {
    const upstream = sunoapiVoiceUpstreamOnly();
    if (!upstream) {
      return res.status(503).json({ message: SUNOAPI_VOICE_REQUIRED_MSG, code: "SUNOAPI_VOICE_REQUIRED" });
    }
    const taskId = String(req.query.taskId ?? "").trim();
    if (!taskId) return res.status(400).json({ message: "taskId가 필요합니다." });
    try {
      const info = await kieVoiceValidateInfo(upstream, taskId);
      return res.json({
        ...info,
        errorMessage: info.errorMessage ? formatKieVoiceUserMessage(info.errorMessage) : undefined,
      });
    } catch (e) {
      console.error("[ai-music custom-voice validate-info]", e);
      const msg = e instanceof Error ? e.message : "검증 문구 조회에 실패했습니다.";
      return res.status(502).json({ message: msg });
    }
  });

  app.post(
    "/api/ai-music/custom-voice/register",
    isAuthenticated,
    aiVoiceRecordUpload.single("audio"),
    async (req, res) => {
      const upstream = sunoapiVoiceUpstreamOnly();
      if (!upstream) {
        return res.status(503).json({
          message: SUNOAPI_VOICE_REQUIRED_MSG,
          code: "SUNOAPI_VOICE_REQUIRED",
        });
      }
      const file = req.file;
      if (!file?.buffer?.length) {
        return res.status(400).json({ message: "검증용 녹음이 없습니다." });
      }
      // @ts-ignore
      const userId = req.user?.claims?.sub as string;
      if (!userId) return res.status(401).json({ message: "로그인이 필요합니다." });

      const body = req.body as {
        validate_task_id?: string;
        voice_name?: string;
        style?: string;
        description?: string;
        singer_skill_level?: string;
      };
      const validateTaskId = String(body.validate_task_id ?? "").trim();
      if (!validateTaskId) {
        return res.status(400).json({ message: "validate_task_id가 필요합니다." });
      }

      try {
        const ext = file.mimetype?.includes("wav") ? ".wav" : file.mimetype?.includes("mpeg") ? ".mp3" : ".webm";
        const verifyUrl = await kieUploadAudioBuffer({
          apiKey: upstream.key,
          buffer: file.buffer,
          fileName: `voice-verify-${crypto.randomUUID()}${ext}`,
          mimeType: file.mimetype || "audio/webm",
          uploadPath: "venysound/voice-verify",
          fileUploadBase: sunoapiVoiceFileUploadBase(),
        });
        const { taskId: generateTaskId } = await kieVoiceGenerate({
          upstream,
          taskId: validateTaskId,
          verifyUrl,
          voiceName: body.voice_name,
          style: body.style,
          description: body.description,
          singerSkillLevel: body.singer_skill_level,
        });
        await db
          .insert(aiMusicUserVoices)
          .values({
            userId,
            validateTaskId,
            status: "generating",
            voiceName: body.voice_name?.trim().slice(0, 120) ?? null,
            style: body.style?.trim().slice(0, 500) ?? null,
            description: body.description?.trim().slice(0, 500) ?? null,
            singerSkillLevel: body.singer_skill_level?.trim() || "beginner",
            updatedAt: new Date(),
          })
          .onConflictDoUpdate({
            target: aiMusicUserVoices.userId,
            set: {
              validateTaskId,
              status: "generating",
              voiceName: body.voice_name?.trim().slice(0, 120) ?? null,
              style: body.style?.trim().slice(0, 500) ?? null,
              description: body.description?.trim().slice(0, 500) ?? null,
              singerSkillLevel: body.singer_skill_level?.trim() || "beginner",
              updatedAt: new Date(),
            },
          });
        return res.json({ generate_task_id: generateTaskId });
      } catch (e) {
        console.error("[ai-music custom-voice register]", e);
        const msg =
          formatKieApiUserMessage(e instanceof Error ? e.message : "", { creditsProvider: "suno" }) ||
          "보이스 등록에 실패했습니다.";
        return res.status(502).json({ message: msg });
      }
    },
  );

  app.get("/api/ai-music/custom-voice/record-info", isAuthenticated, async (req, res) => {
    const upstream = sunoapiVoiceUpstreamOnly();
    if (!upstream) {
      return res.status(503).json({ message: SUNOAPI_VOICE_REQUIRED_MSG, code: "SUNOAPI_VOICE_REQUIRED" });
    }
    const taskId = String(req.query.taskId ?? "").trim();
    if (!taskId) return res.status(400).json({ message: "taskId가 필요합니다." });
    // @ts-ignore
    const userId = req.user?.claims?.sub as string;
    if (!userId) return res.status(401).json({ message: "로그인이 필요합니다." });
    try {
      const info = await kieVoiceRecordInfo(upstream, taskId);
      if (info.status === "success" && info.voiceId) {
        const [pending] = await db.select().from(aiMusicUserVoices).where(eq(aiMusicUserVoices.userId, userId));
        await db
          .insert(aiMusicUserVoices)
          .values({
            userId,
            voiceId: info.voiceId,
            validateTaskId: pending?.validateTaskId ?? null,
            voiceName: pending?.voiceName ?? null,
            style: pending?.style ?? null,
            description: pending?.description ?? null,
            singerSkillLevel: pending?.singerSkillLevel ?? "beginner",
            status: "ready",
            updatedAt: new Date(),
          })
          .onConflictDoUpdate({
            target: aiMusicUserVoices.userId,
            set: {
              voiceId: info.voiceId,
              status: "ready",
              updatedAt: new Date(),
            },
          });
      }
      return res.json({
        ...info,
        errorMessage: info.errorMessage
          ? formatKieApiUserMessage(info.errorMessage, { creditsProvider: "suno" })
          : undefined,
      });
    } catch (e) {
      console.error("[ai-music custom-voice record-info]", e);
      const msg = e instanceof Error ? e.message : "보이스 상태 조회에 실패했습니다.";
      return res.status(502).json({ message: msg });
    }
  });

  /** 마이크 녹음 → sunoapi.org 파일 업로드 → add-vocals. 일반 텍스트 생성과 동일 한도·과금. */
  app.post(
    "/api/ai-music/create-from-voice-record",
    isAuthenticated,
    aiVoiceRecordUpload.single("audio"),
    async (req, res) => {
      const voiceUpstream = sunoapiVoiceUpstreamOnly();
      if (!voiceUpstream) {
        return res.status(503).json({
          message: SUNOAPI_VOICE_REQUIRED_MSG,
          code: "SUNOAPI_VOICE_REQUIRED",
        });
      }
      const file = req.file;
      if (!file?.buffer?.length) {
        return res.status(400).json({ message: "녹음 파일이 없습니다." });
      }
      // @ts-ignore
      const userId = req.user?.claims?.sub as string;
      if (!userId || typeof userId !== "string") {
        return res.status(401).json({ message: "로그인이 필요합니다." });
      }
      const [user0] = await db.select().from(users).where(eq(users.id, userId));
      if (!user0) return res.status(404).json({ message: "사용자를 찾을 수 없습니다." });
      await maybePersistSubscriptionRow(userId, user0);
      await voidExpiredPromoAiCreditsForUser(userId, new Date());
      const [row] = await db.select().from(users).where(eq(users.id, userId));
      if (!row) return res.status(404).json({ message: "사용자를 찾을 수 없습니다." });

      const body = req.body as {
        prompt?: string;
        title?: string;
        tags?: string;
        mv?: string;
        vocal_gender?: "f" | "m";
        negative_tags?: string;
      };
      const lyricsPrompt = String(body.prompt ?? "").trim();
      if (!lyricsPrompt) {
        return res.status(400).json({ message: "가사·노래 스타일 설명(가사란)을 입력한 뒤 생성해 주세요." });
      }
      const stylePart = String(body.tags ?? "").trim() || "pop";
      const model = resolveSunoGenerateModel(body.mv);
      const title = resolveSunoCustomModeTitle({
        explicitTitle: String(body.title ?? ""),
        lyricsPrimary: lyricsPrompt,
        lyricsFallback: "",
        styleTags: stylePart,
        instrumental: false,
        model,
      });
      const negativeTags = String(body.negative_tags ?? "").trim() || "low quality, harsh noise";
      const callBackUrl = `${siteBase}/api/ai-music/suno-callback`;
      const createProvider = "suno" as const;

      const promoMinForCreate = MAY_2026_EVENT_PROMO_TRACKS_PER_GENERATION;
      const now = new Date();
      const usagePeriodKey = getAiMusicUsagePeriodKey(row, row.role ?? null, now);
      const isSubWallet = row.role !== "admin" && isUserPaidSubscriptionActive(row, now);
      const tierNow = row.subscriptionTier ?? "free";
      const promoWonCreate = Math.max(0, Number(row.promoAiCreditsWon ?? 0));
      const promoExpCreate = row.promoAiCreditsExpiresAt ?? null;
      const promoNotExpiredCreate = !promoExpCreate || new Date(promoExpCreate).getTime() > now.getTime();
      const canUsePromoWallet = row.role !== "admin" && promoNotExpiredCreate && promoWonCreate >= promoMinForCreate;

      let used = 0;
      let limit = 0;
      let usageWouldExceed = false;
      if (row.role === "admin") {
        limit = -1;
      } else if (tierNow === "free") {
        limit = getAiMusicMonthlyUsageLimit(row, row.role ?? null, now);
        const [usage] = await db
          .select()
          .from(aiMusicUsage)
          .where(and(eq(aiMusicUsage.userId, userId), eq(aiMusicUsage.periodMonth, usagePeriodKey)));
        used = usage?.count ?? 0;
        usageWouldExceed = canUsePromoWallet ? false : limit >= 0 && used >= limit;
      } else if (isSubWallet) {
        if (isSubscriptionAiWalletDepleted(row)) {
          try {
            await runSubscriptionAiBudgetExhaustionIfNeeded(userId, now);
          } catch (e) {
            console.error("[ai-music voice create] budget exhaustion (depleted wallet)", e);
          }
          return res.status(403).json({
            message: "구독 AI 생성 금액을 모두 사용했습니다. Free 플랜으로 전환되었습니다.",
            code: "AI_MUSIC_LIMIT_REACHED",
            limit: 0,
            usedThisMonth: 0,
          });
        }
        const w = await syncSubscriptionAiWalletForPaidUser(userId, now);
        if (!w) {
          return res.status(403).json({
            message: "구독 AI 예산을 불러올 수 없습니다. 잠시 후 다시 시도해 주세요.",
            code: "AI_MUSIC_LIMIT_REACHED",
          });
        }
        used = w.periodConsumed;
        limit = w.limitDisplay;
        usageWouldExceed = w.walletSum < AI_MUSIC_WON_PER_TRACK;
      } else {
        limit = getAiMusicMonthlyUsageLimit(row, row.role ?? null, now);
        const [usage] = await db
          .select()
          .from(aiMusicUsage)
          .where(and(eq(aiMusicUsage.userId, userId), eq(aiMusicUsage.periodMonth, usagePeriodKey)));
        used = usage?.count ?? 0;
        usageWouldExceed = canUsePromoWallet ? false : limit >= 0 && used + AI_MUSIC_WON_PER_TRACK > limit;
      }
      if (usageWouldExceed) {
        return res.status(403).json({
          message: "AI 음악 생성 한도에 도달했습니다.",
          code: "AI_MUSIC_LIMIT_REACHED",
          limit,
          usedThisMonth: used,
        });
      }

      try {
        const ext =
          file.mimetype?.includes("wav") ? ".wav" : file.mimetype?.includes("mpeg") || file.mimetype?.includes("mp3") ? ".mp3" : ".webm";
        const uploadUrl = await kieUploadAudioBuffer({
          apiKey: voiceUpstream.key,
          buffer: file.buffer,
          fileName: `voice-${crypto.randomUUID()}${ext}`,
          mimeType: file.mimetype || "audio/webm",
          fileUploadBase: sunoapiVoiceFileUploadBase(),
        });
        const payload: Record<string, unknown> = {
          uploadUrl,
          prompt: lyricsPrompt.slice(0, 5000),
          style: stylePart.slice(0, 1000),
          title,
          negativeTags: negativeTags.slice(0, 500),
          model,
          callBackUrl,
        };
        if (body.vocal_gender === "f" || body.vocal_gender === "m") payload.vocalGender = body.vocal_gender;

        const apiRes = await fetch(`${voiceUpstream.base}/api/v1/generate/add-vocals`, {
          method: "POST",
          headers: { Authorization: `Bearer ${voiceUpstream.key}`, "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const data = await apiRes.json().catch(() => ({}));
        if (!apiRes.ok) {
          const msg = (data as { msg?: string }).msg ?? "API 요청 실패";
          return res.status(apiRes.status >= 400 && apiRes.status < 500 ? apiRes.status : 502).json({ message: String(msg) });
        }
        const sunoBizCode = (data as { code?: number }).code;
        if (typeof sunoBizCode === "number" && sunoBizCode !== 200) {
          const msg = (data as { msg?: string }).msg ?? "보이스 생성 API 오류";
          return res.status(502).json({ message: String(msg) });
        }
        const d = data as { data?: { taskId?: string; task_id?: string }; taskId?: string; task_id?: string };
        const taskId =
          (typeof d?.data?.taskId === "string" && d.data.taskId) ||
          (typeof d?.data?.task_id === "string" && d.data.task_id) ||
          (typeof d?.taskId === "string" && d.taskId) ||
          (typeof d?.task_id === "string" && d.task_id) ||
          "";
        if (!taskId) {
          return res.status(502).json({ message: "API 응답에 taskId가 없습니다." });
        }
        if ((row.subscriptionTier ?? "free") === "free" && row.role !== "admin" && !canUsePromoWallet) {
          await db.execute(sql`
            INSERT INTO ai_music_usage (user_id, period_month, count, updated_at)
            VALUES (${userId}, ${usagePeriodKey}, 1, NOW())
            ON CONFLICT (user_id, period_month) DO UPDATE SET count = ai_music_usage.count + 1, updated_at = NOW()
          `);
        }
        await insertAiMusicGenerationLog({
          userId,
          user: row,
          taskId,
          provider: createProvider,
          walletCreditsCharged: 0,
          chargeStatus: "pending",
          body: { title, tags: stylePart, prompt: lyricsPrompt, voice_record: true },
          promoMinTracksForBilling: promoMinForCreate,
        });
        const [uAfter] = await db.select({ credits: users.credits }).from(users).where(eq(users.id, userId));
        return res.json({
          task_id: taskId,
          provider: createProvider,
          won_charged: 0,
          billing_deferred: true,
          balance_won: uAfter?.credits ?? 0,
          credits_charged: 0,
          credits_balance: uAfter?.credits ?? 0,
        });
      } catch (e) {
        console.error("[ai-music create-from-voice-record]", e);
        const errMsg = e instanceof Error ? e.message : String(e);
        return res.status(500).json({
          message: "보이스 녹음 생성 요청 중 오류가 발생했습니다.",
          code: "AI_MUSIC_VOICE_CREATE_ERROR",
          ...(process.env.NODE_ENV === "development" ? { detail: errMsg.slice(0, 500) } : {}),
        });
      }
    },
  );

  app.get("/api/ai-music/task/:taskId", isAuthenticated, async (req, res) => {
    if (!AI_MUSIC_PROVIDER) {
      return res.status(503).json({ message: "AI 음악 생성 API가 설정되지 않았습니다." });
    }
    const taskId = String(req.params.taskId ?? "").trim();
    const provider = typeof req.query.provider === "string" ? req.query.provider : AI_MUSIC_PROVIDER;
    if (!taskId) return res.status(400).json({ message: "task_id가 필요합니다." });
    // @ts-ignore
    const pollUserId = req.user?.claims?.sub as string | undefined;

    const taskSunoStyle = sunoStyleUpstream(provider);
    if (taskSunoStyle) {
      try {
        const cached = sunoCallbackResults.get(taskId);
        if (cached) {
          if (cached.state === "succeeded" && pollUserId) {
            const clipN = Array.isArray(cached.data) ? cached.data.length : MAY_2026_EVENT_PROMO_TRACKS_PER_GENERATION;
            const billing = await tryFinalizeAiMusicSuccessBilling(pollUserId, taskId, { promoOutputTracks: clipN });
            sunoCallbackResults.delete(taskId);
            return res.json({
              ...cached,
              billing: {
                applied: billing.applied,
                won_charged: billing.wonCharged,
                promo_tracks_deducted: billing.promoTracksDeducted,
                credits_balance: billing.balanceWon,
              },
            });
          }
          sunoCallbackResults.delete(taskId);
          return res.json(cached);
        }
        const upstreamCtrl = new AbortController();
        const upstreamTimer = setTimeout(() => upstreamCtrl.abort(), AI_MUSIC_UPSTREAM_FETCH_MS);
        let apiRes: globalThis.Response;
        try {
          apiRes = await fetch(`${taskSunoStyle.base}/api/v1/generate/record-info?taskId=${encodeURIComponent(taskId)}`, {
            headers: { Authorization: `Bearer ${taskSunoStyle.key}` },
            signal: upstreamCtrl.signal,
          });
        } catch (e) {
          if ((e as Error)?.name === "AbortError") {
            console.warn(`[ai-music task ${provider}] record-info upstream timeout:`, String(taskId).slice(0, 20));
            return res.json({ state: "pending", data: null });
          }
          throw e;
        } finally {
          clearTimeout(upstreamTimer);
        }
        const data = await apiRes.json().catch(() => ({}));
        if (!apiRes.ok) {
          return res.status(apiRes.status >= 400 && apiRes.status < 500 ? apiRes.status : 502).json({ message: (data as { msg?: string }).msg ?? "조회 실패" });
        }
        const bizCode = (data as { code?: number }).code;
        if (typeof bizCode === "number" && bizCode !== 200) {
          const msg = (data as { msg?: string }).msg ?? `Suno API code ${bizCode}`;
          if (pollUserId) await markAiMusicGenerationFailedOnUpstream(pollUserId, taskId, String(msg));
          return res.json({ state: "failed", message: String(msg), data: null });
        }
        const d = (data as { data?: { status?: string; response?: { sunoData?: unknown[]; suno_data?: unknown[] }; errorMessage?: string; param?: string } }).data;
        const statusRaw = d?.status ?? "PENDING";
        const status = String(statusRaw).trim().toUpperCase();
        const resp = d?.response as { sunoData?: unknown[]; suno_data?: unknown[] } | undefined;
        const sunoMerged = resp?.sunoData ?? resp?.suno_data;
        const sunoList = Array.isArray(sunoMerged) ? sunoMerged : [];
        let customMode = false;
        let expectedClipCount = 2;
        try {
          if (typeof d?.param === "string") {
            const param = JSON.parse(d.param) as { customMode?: boolean; instrumental?: boolean };
            customMode = param.customMode === true;
            if (param.instrumental === true) expectedClipCount = 1;
          }
        } catch {}
        const mapSunoRawsToClips = (raws: Record<string, unknown>[]) =>
          raws.map((raw) => {
            const t = raw;
            const id = t.id;
            return {
              clip_id: typeof id === "string" ? id : id != null ? String(id) : undefined,
              audio_url: pickRemoteClipAudioUrl(t),
              image_url: pickRemoteClipImageUrl(t),
              title: typeof t.title === "string" ? t.title : undefined,
              tags: typeof t.tags === "string" ? t.tags : undefined,
              prompt: typeof t.prompt === "string" ? t.prompt : undefined,
              custom_mode: customMode,
              duration: pickClipDurationSec(t),
            };
          });
        if (status === "SUCCESS") {
          if (sunoList.length === 0) {
            return res.json({ state: "running", data: null });
          }
          const list = mapSunoRawsToClips(sunoList as Record<string, unknown>[]);
          let billing = { applied: false, won_charged: 0, promo_tracks_deducted: 0, credits_balance: 0 };
          if (pollUserId) {
            const b = await tryFinalizeAiMusicSuccessBilling(pollUserId, taskId, { promoOutputTracks: list.length });
            billing = {
              applied: b.applied,
              won_charged: b.wonCharged,
              promo_tracks_deducted: b.promoTracksDeducted,
              credits_balance: b.balanceWon,
            };
          }
          return res.json({ state: "succeeded", data: list, billing });
        }
        const raws = sunoList as Record<string, unknown>[];
        const listFromRaws = () => mapSunoRawsToClips(raws);
        /**
         * 업스트림이 SUCCESS로 안 올리고 FIRST_SUCCESS에 머무는 경우(지연·버전 차이) 대비:
         * 기대 클립 수만큼 결과가 있고, 각각 재생 가능 오디오·최소 길이(초)가 있으면 완료로 간주.
         */
        if (status === "FIRST_SUCCESS" && raws.length >= expectedClipCount) {
          const listEarly = listFromRaws();
          const minDur = 8;
          const ok =
            listEarly.length >= expectedClipCount &&
            listEarly.every((c) => (c.audio_url ?? "").trim().length > 12) &&
            raws.every(
              (r) => (pickClipDurationSec(r) ?? 0) >= minDur || sunoClipHasFinalSourceAudio(r),
            );
          if (ok) {
            let billing = { applied: false, won_charged: 0, promo_tracks_deducted: 0, credits_balance: 0 };
            if (pollUserId) {
              const b = await tryFinalizeAiMusicSuccessBilling(pollUserId, taskId, { promoOutputTracks: listEarly.length });
              billing = {
                applied: b.applied,
                won_charged: b.wonCharged,
                promo_tracks_deducted: b.promoTracksDeducted,
                credits_balance: b.balanceWon,
              };
            }
            return res.json({ state: "succeeded", data: listEarly, billing });
          }
        }
        /** Suno 앱처럼 FIRST_SUCCESS 단계에서 커버·스트림 URL이 오면 미리듣기(폴링은 계속, 완료 시 succeeded) */
        if (status === "FIRST_SUCCESS" && sunoList.length > 0) {
          const list = listFromRaws();
          const hasMedia = list.some((x) => Boolean((x.audio_url ?? "").trim()) || Boolean((x.image_url ?? "").trim()));
          if (hasMedia) {
            return res.json({ state: "preview", data: list });
          }
        }
        if (["CREATE_TASK_FAILED", "GENERATE_AUDIO_FAILED", "CALLBACK_EXCEPTION", "SENSITIVE_WORD_ERROR"].includes(status)) {
          const failMsg = formatKieApiUserMessage(d?.errorMessage) || "생성에 실패했습니다.";
          if (pollUserId) await markAiMusicGenerationFailedOnUpstream(pollUserId, taskId, failMsg);
          return res.json({ state: "failed", message: failMsg, data: null });
        }
        return res.json({ state: status === "TEXT_SUCCESS" || status === "FIRST_SUCCESS" ? "running" : "pending", data: null });
      } catch (e) {
        console.error(`[ai-music task ${provider}]`, e);
        return res.status(500).json({ message: "작업 조회 중 오류가 발생했습니다." });
      }
    }

    if (!AIMUSICAPI_KEY) {
      return res.status(503).json({
        message: "이 작업의 제공자에 맞는 API 키가 없습니다. 옛 곡은 보관함에 저장된 URL로 재생할 수 있습니다.",
      });
    }

    try {
      const upstreamCtrl = new AbortController();
      const upstreamTimer = setTimeout(() => upstreamCtrl.abort(), AI_MUSIC_UPSTREAM_FETCH_MS);
      let apiRes: globalThis.Response;
      try {
        apiRes = await fetch(`${AIMUSICAPI_BASE}/api/v1/sonic/task/${encodeURIComponent(taskId)}`, {
          headers: { Authorization: `Bearer ${AIMUSICAPI_KEY}` },
          signal: upstreamCtrl.signal,
        });
      } catch (e) {
        if ((e as Error)?.name === "AbortError") {
          console.warn("[ai-music task] aimusicapi upstream timeout:", String(taskId).slice(0, 20));
          return res.json({ state: "pending", data: null });
        }
        throw e;
      } finally {
        clearTimeout(upstreamTimer);
      }
      const data = await apiRes.json().catch(() => ({}));
      if (!apiRes.ok) {
        return res.status(apiRes.status >= 400 && apiRes.status < 500 ? apiRes.status : 502).json({ message: (data as { message?: string }).message ?? "조회 실패" });
      }
      const arr = (data as { data?: unknown[] }).data;
      const rawList = Array.isArray(arr) ? arr : [];
      const first = rawList[0] as { state?: string } | undefined;
      const state = first?.state ?? "pending";
      if (state === "succeeded") {
        const list = rawList.map((item: any) => {
          const t = item?.full ?? item?.extended ?? item;
          const clip = t && typeof t === "object" ? (t as Record<string, unknown>) : {};
          const itemRec = item && typeof item === "object" ? (item as Record<string, unknown>) : {};
          const dur = pickClipDurationSec(clip) ?? pickClipDurationSec(itemRec);
          return {
            clip_id: (t as { clip_id?: string; id?: string })?.clip_id ?? (t as { id?: string })?.id,
            audio_url: pickRemoteClipAudioUrl(clip),
            image_url: pickRemoteClipImageUrl(clip),
            title: (t as { title?: string })?.title,
            tags: (t as { tags?: string })?.tags,
            prompt:
              (t as { prompt?: string; lyrics?: string; gpt_description_prompt?: string })?.prompt ??
              (t as { lyrics?: string })?.lyrics ??
              (t as { gpt_description_prompt?: string })?.gpt_description_prompt,
            custom_mode: false,
            duration: dur,
          };
        });
        let billing = { applied: false, won_charged: 0, promo_tracks_deducted: 0, credits_balance: 0 };
        if (pollUserId) {
          const b = await tryFinalizeAiMusicSuccessBilling(pollUserId, taskId, { promoOutputTracks: rawList.length });
          billing = {
            applied: b.applied,
            won_charged: b.wonCharged,
            promo_tracks_deducted: b.promoTracksDeducted,
            credits_balance: b.balanceWon,
          };
        }
        return res.json({ state: "succeeded", data: list, billing });
      }
      if (state === "failed") {
        const failMsg = (first as { error?: string }).error ?? "생성에 실패했습니다.";
        if (pollUserId) await markAiMusicGenerationFailedOnUpstream(pollUserId, taskId, String(failMsg));
        return res.json({ state: "failed", message: failMsg, data: null });
      }
      res.json({ state: state === "running" ? "running" : "pending", data: null });
    } catch (e) {
      console.error("[ai-music task]", e);
      res.status(500).json({ message: "작업 조회 중 오류가 발생했습니다." });
    }
  });

  // === AI 음악 사이트 공개 발행 ===
  app.post("/api/ai-music/publish", isAuthenticated, async (req, res) => {
    try {
      // @ts-ignore
      const userId = req.user?.claims?.sub as string;
      const [user] = await db.select().from(users).where(eq(users.id, userId));
      const now = new Date();
      const isPaidTier = user?.role === "admin" || isActivePaidSubscription(user, now);

      const { audioUrl, imageUrl, title, tags, genre, prompt, taskId: publishTaskId, clipId: publishClipId, generationProvider } = req.body as {
        audioUrl: string;
        imageUrl?: string;
        title?: string;
        tags?: string;
        genre?: string;
        prompt?: string;
        taskId?: string;
        clipId?: string;
        generationProvider?: string;
      };
      if (!audioUrl || typeof audioUrl !== "string") {
        return res.status(400).json({ message: "audioUrl이 필요합니다." });
      }

      const publishLogTaskId = typeof publishTaskId === "string" ? publishTaskId.trim() : "";
      let publishBillingKind: string | null = null;
      if (publishLogTaskId) {
        const [gl0] = await db
          .select({ billingKind: aiMusicGenerationLogs.billingKind })
          .from(aiMusicGenerationLogs)
          .where(and(eq(aiMusicGenerationLogs.userId, userId), eq(aiMusicGenerationLogs.taskId, publishLogTaskId)))
          .limit(1);
        publishBillingKind = gl0?.billingKind ?? null;
      }
      const mayEventMultiPublish =
        (await userHasApprovedMay2026Event(userId)) || publishBillingKind === "promo";

      // 무료 유저: AI 공개곡 1곡 제한 (5월 이벤트 승인·이벤트 전용 잔액으로 생성한 곡 예외)
      if (!isPaidTier && !mayEventMultiPublish) {
        const existing = await db.execute(sql`SELECT COUNT(*) as cnt FROM music WHERE user_id = ${userId} AND is_ai = true`);
        const cnt = Number((existing.rows[0] as any)?.cnt ?? 0);
        if (cnt >= 1) {
          return res.status(403).json({
            message: "무료 플랜은 AI 생성곡을 1곡까지 공개할 수 있습니다. Pro로 업그레이드하면 무제한 공개가 가능합니다.",
            code: "AI_PUBLISH_LIMIT_REACHED",
          });
        }
      }

      // Suno 오디오 URL 유효성 검사 (만료된 링크 차단)
      if (/\/None\.(mp3|wav|ogg)|undefined|null/i.test(audioUrl)) {
        return res.status(400).json({ message: "음원 링크가 올바르지 않습니다." });
      }

      const localUploadsDir = path.resolve(process.cwd(), "local-uploads", "uploads");
      mkdirSync(localUploadsDir, { recursive: true });

      // 1) 오디오 다운로드 후 로컬 저장
      const audioId = crypto.randomUUID();
      const audioFilename = `${audioId}.mp3`;
      const audioLocalPath = path.join(localUploadsDir, audioFilename);

      let audioRes: globalThis.Response;
      try {
        audioRes = await fetch(audioUrl, { headers: { "User-Agent": "Mozilla/5.0" } });
      } catch (e) {
        return res.status(502).json({ message: "음원 다운로드에 실패했습니다. 링크가 만료되었을 수 있습니다." });
      }
      if (!audioRes.ok) {
        return res.status(502).json({ message: `음원 다운로드 실패 (${audioRes.status}). 링크가 만료되었을 수 있습니다.` });
      }
      const audioBuffer = Buffer.from(await audioRes.arrayBuffer());
      if (audioBuffer.length < 10000) {
        return res.status(502).json({ message: "음원 파일이 너무 작습니다. 링크가 만료되었을 수 있습니다." });
      }
      writeFileSync(audioLocalPath, audioBuffer);

      // 2) 커버 이미지 다운로드 (선택)
      let savedImagePath: string | null = null;
      if (imageUrl && typeof imageUrl === "string" && /^https?:\/\//i.test(imageUrl)) {
        try {
          const imgRes = await fetch(imageUrl, { headers: { "User-Agent": "Mozilla/5.0" } });
          if (imgRes.ok) {
            const imgBuf = Buffer.from(await imgRes.arrayBuffer());
            if (imgBuf.length > 1000) { // 최소 크기 확인
              const imgId = crypto.randomUUID();
              const imgFilename = `${imgId}.jpg`;
              writeFileSync(path.join(localUploadsDir, imgFilename), imgBuf);
              // 프론트엔드가 /objects/uploads/ 경로로 접근해야 함
              savedImagePath = `/objects/uploads/${imgFilename}`;
            }
          }
        } catch {
          // 이미지 실패는 무시하고 계속
        }
      }

      // 3) 장르/태그 결정
      // Suno description 모드에서 tags 필드에 이미지 프롬프트 텍스트가 담길 수 있음
      // 길이만으로 비우면 장르+스타일(60자 초과)이 전부 버려져 장르가 항상 "팝뮤직" 기본값으로 떨어짐 → 이미지성 키워드일 때만 비움
      const rawTags = (tags || "").trim();
      const isImagePrompt = /album\s*cover|cinematic|photo|image|visual|artwork/i.test(rawTags);
      const cleanedTags = isImagePrompt ? "" : rawTags;
      // CreateMusic `buildTagsForApi`는 장르 입력란만 태그로 보냅니다(스타일 칩·스타일 입력란 미포함). `·` 구분은 과거 클라이언트 호환용으로만 유지.
      const genreSegmentForLookup = (() => {
        if (!cleanedTags) return "";
        const parts = cleanedTags.split(/\s*·\s*/);
        return (parts[0] ?? "").trim();
      })();
      const genreFromTags = genreSegmentForLookup
        ? genreSegmentForLookup
            .split(/[,;\s]+/)
            .map((t: string) => t.trim())
            .filter(Boolean)[0] ?? ""
        : "";
      const bodyGenre = typeof genre === "string" ? genre.trim() : "";
      const resolvedGenre = bodyGenre || genreFromTags || "팝뮤직";
      const trackTitle = (title || "AI 생성 음악").trim();
      const artistName = user?.firstName || user?.email?.split("@")[0] || "AI Artist";

      const logTaskId = publishLogTaskId;
      let freeAiSiteRestrictions = false;
      if (logTaskId) {
        const [genLog] = await db
          .select({ billingKind: aiMusicGenerationLogs.billingKind })
          .from(aiMusicGenerationLogs)
          .where(and(eq(aiMusicGenerationLogs.userId, userId), eq(aiMusicGenerationLogs.taskId, logTaskId)))
          .limit(1);
        /** 관리자는 billing_kind 가 admin — 무료 한도 전용 제한 플래그 미적용 */
        if (genLog?.billingKind === "free" || genLog?.billingKind === "promo") {
          freeAiSiteRestrictions = true;
        }
      }
      /** 비구독(무료 플랜) 공개는 taskId·생성 로그 불일치 시에도 벨소리 등 사이트 전용 제한(플래그) 적용 */
      if (!isPaidTier) {
        freeAiSiteRestrictions = true;
      }

      const ownerSiteDownload = mayEventMultiPublish;

      // 4) DB에 음악 등록
      const resolvedAiProvider =
        generationProvider === "aimusicapi" || generationProvider === "suno" ? generationProvider : "suno";

      const newMusic = await storage.createMusic({
        title: trackTitle,
        artist: artistName,
        filename: audioFilename,
        imageFilename: savedImagePath,
        genre: resolvedGenre,
        tags: cleanedTags,
        lyrics: null,
        isAi: true,
        aiProvider: resolvedAiProvider,
        freeAiSiteRestrictions,
        price: 0,
        isDownloadable: ownerSiteDownload,
        userId,
      });

      if (logTaskId) {
        try {
          const [logRow] = await db
            .select()
            .from(aiMusicGenerationLogs)
            .where(and(eq(aiMusicGenerationLogs.userId, userId), eq(aiMusicGenerationLogs.taskId, logTaskId)))
            .limit(1);
          if (logRow) {
            const clipStr = typeof publishClipId === "string" ? publishClipId.trim() : "";
            const entry = {
              musicId: newMusic.id,
              clipId: clipStr || null,
              deployment: "site",
              publishedAt: new Date().toISOString(),
            };
            const prev = Array.isArray(logRow.publishments) ? logRow.publishments : [];
            await db
              .update(aiMusicGenerationLogs)
              .set({ publishments: [...prev, entry] })
              .where(eq(aiMusicGenerationLogs.id, logRow.id));
          }
        } catch (logErr) {
          console.error("[ai-music publish generation log]", logErr);
        }
      }

      console.log(`[ai-music publish] userId=${userId} isPaid=${isPaidTier} musicId=${newMusic.id} title="${trackTitle}"`);
      res.status(201).json({ music: newMusic });
    } catch (e) {
      console.error("[ai-music publish]", e);
      res.status(500).json({ message: "공개 처리 중 오류가 발생했습니다." });
    }
  });

  /** AI 음악 생성 완료 후 사이트 공개 유도 — 인앱 알림만(이메일·푸시 없음). task당 1회. */
  app.post("/api/ai-music/publish-nudge", isAuthenticated, async (req, res) => {
    try {
      // @ts-ignore
      const userId = req.user?.claims?.sub as string;
      const taskId = typeof req.body?.taskId === "string" ? req.body.taskId.trim() : "";
      if (!taskId) {
        return res.status(400).json({ message: "taskId가 필요합니다." });
      }

      const [logRow] = await db
        .select({ id: aiMusicGenerationLogs.id })
        .from(aiMusicGenerationLogs)
        .where(and(eq(aiMusicGenerationLogs.userId, userId), eq(aiMusicGenerationLogs.taskId, taskId)))
        .limit(1);
      if (!logRow) {
        return res.status(403).json({ message: "해당 생성 요청을 찾을 수 없습니다." });
      }

      const [dup] = await db
        .select({ id: notifications.id })
        .from(notifications)
        .where(
          and(
            eq(notifications.userId, userId),
            eq(notifications.type, "ai_publish_nudge"),
            sql`coalesce(${notifications.payload}->>'taskId','') = ${taskId}`,
          ),
        )
        .limit(1);
      if (dup) {
        return res.status(204).end();
      }

      const [user] = await db.select().from(users).where(eq(users.id, userId));
      const displayName =
        (user?.username && String(user.username).trim()) ||
        (user?.firstName && String(user.firstName).trim()) ||
        (user?.email ? String(user.email).split("@")[0] : "") ||
        "회원";

      const message = `${displayName}님, 만드신 음악은 어떠신가요? 마음에 드신다면 지금 베니사운드에 공개하셔서 ${displayName}님이 만드신 음악을 모두에게 자랑해 보세요.`;

      await storage.createNotification({
        userId,
        type: "ai_publish_nudge",
        message,
        payload: { userName: displayName, taskId },
        url: "/create-music",
      });

      res.status(201).json({ ok: true });
    } catch (e) {
      console.error("[ai-music publish-nudge]", e);
      res.status(500).json({ message: "알림 등록에 실패했습니다." });
    }
  });

  // === Music Routes ===
  app.get(api.music.list.path, async (req, res) => {
    const { genre, search, page, limit } = req.query as { genre?: string; search?: string; page?: string; limit?: string };
    const pageNum = Math.max(1, parseInt(page || "1", 10));
    const limitNum = Math.min(500, Math.max(1, parseInt(limit || "30", 10)));
    const result = await storage.getMusicList(genre, search, pageNum, limitNum);
    res.json(result);
  });

  /** 홈 「신곡」: 배포 발매일·승인일 우선, 부족 시 Spotify 앨범 연동 곡(업로드 순) */
  app.get("/api/music/home-new-releases", async (req, res) => {
    try {
      const limitNum = Math.min(32, Math.max(1, parseInt(String(req.query.limit || "16"), 10) || 16));
      const data = await storage.getHomeNewReleases(limitNum);
      res.json(data);
    } catch (e) {
      console.error("[home-new-releases]", e);
      res.status(500).json({ message: "목록을 불러올 수 없습니다" });
    }
  });

  /** 해외(Spotify) 출시: env 아티스트 목록 + 배포 완료 유통(DB)의 spotify_album_id·UPC 병합. 선택: SPOTIFY_INTERNATIONAL_FROM_USER_IDS 로 등록자만 */
  app.get("/api/music/international-releases", async (req, res) => {
    try {
      const pageNum = Math.max(1, parseInt(String(req.query.page || "1"), 10) || 1);
      const limitNum = Math.min(100, Math.max(1, parseInt(String(req.query.limit || "30"), 10) || 30));
      const userFilter = getEnvInternationalFromUserIds();
      const filterOwners = userFilter.length > 0 ? userFilter : undefined;
      const merge = await storage.getDistributionInternationalMergeSources(filterOwners);
      const dbSeeds = await storage.getInternationalReleasesDbSeeds(filterOwners);
      const seedMusicByAlbum = new Map(dbSeeds.map((s) => [s.spotifyAlbumId, s.musicId]));
      const { data, total } = await fetchInternationalReleasesPage(
        pageNum,
        limitNum,
        {
          extraSpotifyAlbumIds: merge.spotifyAlbumIds,
          extraUpcs: merge.upcs,
        },
        dbSeeds,
      );
      if (total === 0 && /^(1|true|yes)$/i.test(String(process.env.SPOTIFY_DEBUG_INTL ?? "").trim())) {
        console.warn("[international-releases] empty", {
          mergeSpotifyAlbumIds: merge.spotifyAlbumIds.length,
          mergeUpcs: merge.upcs.length,
          dbSeedRows: dbSeeds.length,
          userFilterCount: userFilter.length,
          hasArtistEnv: String(process.env.SPOTIFY_INTERNATIONAL_ARTIST_IDS ?? "").trim().length > 0,
        });
      }
      const siteIds = await storage.resolveSiteMusicIdsForInternationalReleases(
        data.map((d) => ({ spotifyAlbumId: d.id, title: d.title, artists: d.artists })),
      );
      const enriched = data.map((d, i) => {
        const { sourceMusicId, ...rest } = d as typeof d & { sourceMusicId?: number };
        return {
          ...rest,
          siteMusicId: sourceMusicId ?? seedMusicByAlbum.get(d.id) ?? siteIds[i] ?? null,
        };
      });
      res.json({ data: enriched, total, page: pageNum, limit: limitNum });
    } catch (e) {
      console.error("[international-releases]", e);
      res.status(500).json({ message: "목록을 불러올 수 없습니다" });
    }
  });

  /** 태그 UI 제거 후 호환용 — 항상 빈 배열 */
  app.get("/api/music/tags", (_req, res) => {
    res.json([]);
  });

  app.get("/api/music/genres", async (_req, res) => {
    try {
      const canonical = getCanonicalMusicGenreLabels();
      const [distinctMusic, curatedList] = await Promise.all([
        db.execute(sql`SELECT DISTINCT genre FROM music WHERE genre IS NOT NULL AND trim(genre) != '' ORDER BY genre`),
        storage.getCuratedPlaylists(),
      ]);
      const fromMusic = (distinctMusic.rows as { genre: string }[]).map((r) => r.genre.trim());
      const fromCurated: string[] = [];
      for (const pl of curatedList) {
        if (pl.genreMain && pl.genreMain.trim()) fromCurated.push(pl.genreMain.trim());
        if (pl.genreSub && pl.genreSub.trim()) fromCurated.push(pl.genreSub.trim());
      }
      const combined = Array.from(new Set([...canonical, ...fromMusic, ...fromCurated]))
        .filter(Boolean)
        .sort((a, b) => a.localeCompare(b, "ko"));
      res.json(combined);
    } catch (e) {
      console.error("[music/genres]", e);
      res.json([]);
    }
  });

  app.get("/api/music/my-likes", isAuthenticated, async (req, res) => {
    // @ts-ignore
    const userId = req.user.claims.sub;
    const likedMusic = await storage.getLikedMusic(userId);
    res.json(likedMusic.map(m => m.id));
  });

  app.get("/api/music/like-counts", async (_req, res) => {
    try {
      const counts = await storage.getMusicLikeCounts();
      res.json(counts);
    } catch (err) {
      res.status(500).json({ message: "좋아요 수를 불러올 수 없습니다" });
    }
  });

  app.get("/api/music/play-counts", async (_req, res) => {
    try {
      const counts = await storage.getMusicPlayCounts();
      res.json(counts);
    } catch (err) {
      res.status(500).json({ message: "재생 수를 불러올 수 없습니다" });
    }
  });

  app.get("/api/music/top-weekly", async (req, res) => {
    try {
      const limit = Math.min(50, Math.max(1, parseInt(String(req.query.limit), 10) || 10));
      const list = await storage.getWeeklyTopTracks(limit);
      res.json(list);
    } catch (e) {
      console.error("[music/top-weekly]", e);
      res.json([]);
    }
  });

  app.get("/api/music/recent", async (req, res) => {
    try {
      const limit = Math.min(50, Math.max(1, parseInt(String(req.query.limit), 10) || 12));
      const days = Math.min(90, Math.max(1, parseInt(String(req.query.days), 10) || 7));
      const list = await storage.getRecentMusic(days, limit);
      res.json(list);
    } catch (e) {
      console.error("[music/recent]", e);
      res.json([]);
    }
  });

  app.get("/api/artists/top-weekly", async (req, res) => {
    try {
      const limit = Math.min(20, Math.max(1, parseInt(String(req.query.limit), 10) || 8));
      const artists = await storage.getWeeklyTopArtists(limit);
      res.json({ artists });
    } catch (e) {
      console.error("[artists/top-weekly]", e);
      res.json({ artists: [] });
    }
  });

  app.get("/api/music/popular", async (req, res) => {
    try {
      const result = await db.execute(sql`
        SELECT 
          m.*,
          u.subscription_tier as uploader_subscription_tier,
          u.subscription_expires_at as uploader_subscription_expires_at,
          u.role as uploader_role,
          COALESCE(l.like_count, 0) as like_count,
          COALESCE(s.stream_seconds, 0) as stream_seconds,
          (COALESCE(l.like_count, 0) * 100 + COALESCE(s.stream_seconds, 0)) as popularity_score
        FROM music m
        LEFT JOIN users u ON u.id = m.user_id
        LEFT JOIN (
          SELECT music_id, COUNT(*) as like_count FROM likes GROUP BY music_id
        ) l ON l.music_id = m.id
        LEFT JOIN (
          SELECT music_id, SUM(duration_seconds) as stream_seconds FROM streaming_logs GROUP BY music_id
        ) s ON s.music_id = m.id
        ORDER BY popularity_score DESC
        LIMIT 20
      `);
      const now = new Date();
      const rows = (result.rows as any[]).map(r => {
        const tier = r.uploader_subscription_tier;
        const expiresAt = r.uploader_subscription_expires_at;
        const subscriptionPremium =
          isPaidSubscriptionTierId(tier) && (expiresAt == null || new Date(expiresAt) > now);
        const isPremium = r.uploader_role === "admin" || subscriptionPremium;
        return {
          id: Number(r.id),
          title: r.title,
          artist: r.artist,
          filename: r.filename,
          imageFilename: r.image_filename,
          genre: r.genre,
          tags: r.tags,
          isAi: r.is_ai,
          price: Number(r.price || 0),
          isDownloadable: r.is_downloadable,
          userId: r.user_id,
          createdAt: r.created_at,
          uploaderSubscriptionTier: apiUploaderSubscriptionTierForClient(isPremium, r.uploader_role, tier),
          likeCount: Number(r.like_count || 0),
          streamSeconds: Number(r.stream_seconds || 0),
        };
      });
      res.json(rows);
    } catch (error) {
      res.status(500).json({ message: "인기 음원을 불러올 수 없습니다" });
    }
  });

  app.get("/api/music/random-cover", isAuthenticated, async (req, res) => {
    try {
      const musicKeywords = [
        "music", "guitar", "piano", "concert", "headphones", "vinyl",
        "microphone", "studio", "drums", "saxophone", "violin", "dj",
        "synthesizer", "audio", "musician", "orchestra", "notes",
        "acoustic", "singing", "band", "record", "speakers"
      ];
      const keyword = musicKeywords[Math.floor(Math.random() * musicKeywords.length)];
      const random = Math.floor(Math.random() * 1000);
      const response = await fetch(
        `https://source.unsplash.com/600x600/?${keyword}&sig=${random}`,
        { redirect: "manual" }
      );
      const redirectUrl = response.headers.get("location");
      if (redirectUrl) {
        res.json({ imageUrl: redirectUrl });
      } else {
        const fallbackRes = await fetch("https://picsum.photos/600/600", { redirect: "manual" });
        const fallbackUrl = fallbackRes.headers.get("location");
        res.json({ imageUrl: fallbackUrl || `https://picsum.photos/seed/${random}/600/600` });
      }
    } catch (err) {
      console.error("Random cover fetch error:", err);
      const fallback = `https://picsum.photos/seed/${Date.now()}/600/600`;
      res.json({ imageUrl: fallback });
    }
  });

  /** 음원 스트리밍 (더 구체적인 경로이므로 api.music.get보다 먼저 등록) */
  app.get("/api/music/:id/stream", async (req, res) => {
    try {
      const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      const id = parsePositiveIntParam(raw);
      if (id == null) {
        return res.status(400).json({ error: "잘못된 음원 ID입니다" });
      }
      const music = await storage.getMusicById(id);
      if (!music) {
        return res.status(404).json({ error: "Music not found" });
      }
      const fn = music.filename || "";

      // ── 1) 외부 URL (https://...) → 직접 리다이렉트
      if (/^https?:\/\//i.test(fn)) {
        res.set("Cache-Control", "no-store");
        return res.redirect(302, fn);
      }

      // ── 2) fileId 추출: /objects/uploads/UUID 포함 모든 경로 처리
      let fileId = "";
      const objMatch = fn.match(/\/objects\/uploads\/(.+)$/);
      if (objMatch) {
        fileId = objMatch[1];
      } else if (fn.startsWith("uploads/")) {
        fileId = fn.replace(/^uploads\//, "");
      } else if (/^[a-f0-9-]{36}(\.[a-z]+)?$/i.test(fn.trim())) {
        fileId = fn.trim();
      } else if (fn.includes("/")) {
        fileId = fn.split("/").pop() || "";
      } else {
        fileId = fn;
      }
      fileId = fileId.replace(/^\//, "");
      if (!fileId) {
        res.set("Content-Type", "audio/mpeg");
        return res.status(404).end();
      }
      const baseId = fileId.replace(/\.(mp3|wav|ogg)$/i, "");
      const candidates = [
        path.join(uploadsDir, fileId),
        path.join(uploadsDir, `${baseId}.mp3`),
        path.join(uploadsDir, `${baseId}.wav`),
        path.join(uploadsDir, `${baseId}.ogg`),
      ];
      const localPath = candidates.find((p) => existsSync(p));
      if (!localPath) {
        // 로컬에 없으면 /objects/ 경로로 리다이렉트 (Replit object storage 폴백)
        if (fn.startsWith("/objects/") || fn.startsWith("objects/")) {
          const objPath = fn.startsWith("/") ? fn : `/${fn}`;
          res.set("Cache-Control", "no-store");
          return res.redirect(302, objPath);
        }
        res.set("Content-Type", "audio/mpeg");
        return res.status(404).end();
      }
      const ext = path.extname(localPath).toLowerCase();
      const mime: Record<string, string> = {
        ".mp3": "audio/mpeg",
        ".wav": "audio/wav",
        ".ogg": "audio/ogg",
      };
      const contentType = mime[ext] || "audio/mpeg";
      const stat = statSync(localPath);
      const fileSize = stat.size;
      const rangeHeader = req.headers.range;

      res.set("Accept-Ranges", "bytes");
      res.set("Content-Type", contentType);
      res.set("Cache-Control", "public, max-age=3600, stale-while-revalidate=86400");
      res.set("Last-Modified", stat.mtime.toUTCString());
      const etag = `W/\"${fileSize}-${Math.floor(stat.mtimeMs)}\"`;
      res.set("ETag", etag);
      // 일부 브라우저/프록시에서 다운로드로 처리되지 않도록 inline 힌트
      res.set("Content-Disposition", "inline");

      // 조건부 GET (range 없는 경우에만)
      if (!rangeHeader) {
        const ifNoneMatch = req.headers["if-none-match"];
        const ifModifiedSince = req.headers["if-modified-since"];
        if (ifNoneMatch && String(ifNoneMatch).trim() === etag) {
          return res.status(304).end();
        }
        if (ifModifiedSince) {
          const ims = new Date(String(ifModifiedSince)).getTime();
          if (!Number.isNaN(ims) && stat.mtime.getTime() <= ims) {
            return res.status(304).end();
          }
        }
      }

      if (rangeHeader) {
        const m = /^bytes=(\d*)-(\d*)$/i.exec(String(rangeHeader).trim());
        if (!m) {
          res.status(416);
          res.set("Content-Range", `bytes */${fileSize}`);
          return res.end();
        }
        const startStr = m[1];
        const endStr = m[2];
        let start: number | null = startStr ? parseInt(startStr, 10) : null;
        let end: number | null = endStr ? parseInt(endStr, 10) : null;
        if (start != null && Number.isNaN(start)) start = null;
        if (end != null && Number.isNaN(end)) end = null;

        // suffix-byte-range-spec: bytes=-500 (마지막 500바이트)
        if (start == null && end != null) {
          const suffixLen = Math.max(0, end);
          start = Math.max(0, fileSize - suffixLen);
          end = fileSize - 1;
        } else {
          if (start == null) start = 0;
          if (end == null || end >= fileSize) end = fileSize - 1;
        }
        if (start >= fileSize || start < 0 || end < 0 || start > end) {
          res.status(416);
          res.set("Content-Range", `bytes */${fileSize}`);
          return res.end();
        }
        const chunkSize = end - start + 1;
        res.status(206);
        res.set("Content-Range", `bytes ${start}-${end}/${fileSize}`);
        res.set("Content-Length", String(chunkSize));
        const stream = createReadStream(localPath, { start, end });
        res.on("close", () => stream.destroy());
        stream.on("error", () => {
          if (!res.headersSent) res.status(500).end();
          else res.destroy();
        });
        stream.pipe(res);
      } else {
        res.set("Content-Length", String(fileSize));
        const stream = createReadStream(localPath);
        res.on("close", () => stream.destroy());
        stream.on("error", () => {
          if (!res.headersSent) res.status(500).end();
          else res.destroy();
        });
        stream.pipe(res);
      }
    } catch (e) {
      if (res.headersSent) return;
      console.error("[api/music/:id/stream]", e);
      res.status(500).json({ error: "음원 스트리밍 중 오류가 발생했습니다" });
    }
  });

  app.get(api.music.get.path, async (req, res) => {
    try {
      const id = parsePositiveIntParam(req.params.id);
      if (id == null) {
        return res.status(400).json({ message: "잘못된 음원 ID입니다" });
      }
      const music = await storage.getMusicById(id);
      if (!music) {
        return res.status(404).json({ message: "Music not found" });
      }
      const uploader = await storage.getUserById(music.userId);
      const now = new Date();
      const subscriptionPremium =
        isPaidSubscriptionTierId(uploader?.subscriptionTier ?? "") &&
        (uploader?.subscriptionExpiresAt == null || new Date(uploader.subscriptionExpiresAt) > now);
      const uploaderIsPremium = (uploader as any)?.role === "admin" || subscriptionPremium;
      res.json({
        ...music,
        uploaderSubscriptionTier: apiUploaderSubscriptionTierForClient(
          uploaderIsPremium,
          (uploader as { role?: string | null } | null)?.role,
          uploader?.subscriptionTier,
        ),
        uploaderDonationBadge: (uploader as any)?.donationBadge ?? null,
        uploader: uploader ? { id: uploader.id, firstName: uploader.firstName, lastName: uploader.lastName, profileImageUrl: uploader.profileImageUrl, email: uploader.email, subscriptionTier: uploader.subscriptionTier } : null,
      });
    } catch (e) {
      console.error("[api/music GET]", e);
      res.status(500).json({ message: "음원 정보를 불러올 수 없습니다" });
    }
  });

  app.get("/api/music/:id/similar", async (req, res) => {
    const id = parsePositiveIntParam(req.params.id);
    const limit = Math.min(20, Math.max(1, parseInt(String(req.query.limit), 10) || 8));
    try {
      if (id == null) return res.json([]);
      const base = await storage.getMusicById(id);
      if (!base) return res.json([]);
      const data = await storage.getSimilarMusic(id, limit);
      res.json(data);
    } catch (e) {
      console.error("[music/similar]", e);
      res.json([]);
    }
  });

  app.get("/api/curated-playlists", async (_req, res) => {
    try {
      const list = await storage.getCuratedPlaylists();
      res.json(list);
    } catch (e) {
      console.error("[curated-playlists]", e);
      res.json([]);
    }
  });

  app.get("/api/curated-playlists/:slug", async (req, res) => {
    const slug = req.params.slug;
    if (!slug) return res.status(404).json({ message: "Not found" });
    try {
      const playlist = await storage.getCuratedPlaylistBySlug(slug);
      if (!playlist) return res.status(404).json({ message: "Playlist not found" });
      res.json(playlist);
    } catch (e) {
      console.error("[curated-playlists/:slug]", e);
      res.status(500).json({ message: "Error loading playlist" });
    }
  });

  app.get("/api/music/missing-files", async (_req, res) => {
    try {
      const uploadsDir = path.resolve(process.cwd(), "local-uploads", "uploads");
      const extractFileId = (fn: string): string => {
        if (!fn) return "";
        const objMatch = fn.match(/\/objects\/uploads\/(.+)$/);
        if (objMatch) return objMatch[1];
        if (fn.startsWith("uploads/")) return fn.replace(/^uploads\//, "");
        if (/^[a-f0-9-]{36}(\.[a-z]+)?$/i.test(fn.trim())) return fn.trim();
        if (fn.includes("/")) return fn.split("/").pop() || "";
        return fn.replace(/^\//, "");
      };
      const all = await db.select({ id: music.id, title: music.title, artist: music.artist, filename: music.filename }).from(music);
      const missing = all.filter((m) => {
        const fileId = extractFileId(m.filename || "");
        if (!fileId) return true;
        const candidates = [
          path.join(uploadsDir, fileId),
          path.join(uploadsDir, `${fileId}.mp3`),
          path.join(uploadsDir, fileId.replace(/\.(mp3|wav|ogg)$/i, "")),
          path.join(uploadsDir, fileId.replace(/\.(mp3|wav|ogg)$/i, "") + ".mp3"),
        ];
        return !candidates.some((p) => existsSync(p));
      });
      res.json({
        total: all.length,
        missing: missing.length,
        list: missing.map((m) => {
          const fileId = extractFileId(m.filename || "");
          const hasExt = /\.(mp3|wav|ogg)$/i.test(fileId);
          return {
            id: m.id,
            title: m.title,
            artist: m.artist,
            fileId,
            saveAs: hasExt ? fileId : `${fileId.replace(/\.(mp3|wav|ogg)$/i, "")}.mp3`,
          };
        }),
      });
    } catch (err) {
      console.error("Missing files check:", err);
      res.status(500).json({ error: "조회 실패" });
    }
  });

  app.get("/api/upload-limit", isAuthenticated, async (req, res) => {
    try {
      // @ts-ignore
      const userId = req.user.claims.sub;
      const { isPremium } = await ensureExpiredSubscriptionDowngrade(userId);
      if (isPremium) {
        return res.json({ limited: false, current: 0, limit: -1 });
      }
      const now = new Date();
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      const result = await db.execute(sql`
        SELECT COUNT(*) as count FROM music 
        WHERE user_id = ${userId} AND created_at >= ${monthStart.toISOString()}
      `);
      const count = Number(result.rows[0]?.count || 0);
      res.json({ limited: count >= 10, current: count, limit: 10 });
    } catch (error) {
      res.json({ limited: false, current: 0, limit: 10 });
    }
  });

  const MUSIC_VIDEO_DOWNLOAD_PRICE_WON = 300;

  function resolveUploadedVideoPath(videoUrl: string): { localPath: string | null; safeId: string } {
    const raw = String(videoUrl || "").trim();
    const match = raw.match(/\/objects\/uploads\/([^/?#]+)/i);
    const safeId = decodeURIComponent(match?.[1] || raw.split("/").pop() || "").replace(/^\//, "");
    if (!safeId) return { localPath: null, safeId: "" };
    const baseId = safeId.replace(/\.(mp4|webm|mov)$/i, "");
    const candidates = [
      path.join(uploadsDir, safeId),
      path.join(uploadsDir, `${baseId}.mp4`),
      path.join(uploadsDir, `${baseId}.webm`),
      path.join(uploadsDir, `${baseId}.mov`),
    ];
    return { localPath: candidates.find((p) => existsSync(p)) ?? null, safeId };
  }

  function serveMusicVideoInlineStream(localPath: string, req: any, res: any): void {
    const ext = path.extname(localPath).toLowerCase() || ".mp4";
    const mime: Record<string, string> = { ".mp4": "video/mp4", ".webm": "video/webm", ".mov": "video/quicktime" };
    const contentType = mime[ext] || "video/mp4";
    const stat = statSync(localPath);
    const fileSize = stat.size;
    const rangeHeader = req.headers.range;

    res.set("Accept-Ranges", "bytes");
    res.set("Content-Type", contentType);
    res.set("Content-Disposition", "inline");
    res.set("Cache-Control", "private, no-store");

    if (rangeHeader) {
      const m = /^bytes=(\d*)-(\d*)$/i.exec(String(rangeHeader).trim());
      if (!m) {
        res.status(416);
        res.set("Content-Range", `bytes */${fileSize}`);
        res.end();
        return;
      }
      const startStr = m[1];
      const endStr = m[2];
      let start: number | null = startStr ? parseInt(startStr, 10) : null;
      let end: number | null = endStr ? parseInt(endStr, 10) : null;
      if (start != null && Number.isNaN(start)) start = null;
      if (end != null && Number.isNaN(end)) end = null;
      if (start == null && end != null) {
        const suffixLen = Math.max(0, end);
        start = Math.max(0, fileSize - suffixLen);
        end = fileSize - 1;
      } else {
        if (start == null) start = 0;
        if (end == null || end >= fileSize) end = fileSize - 1;
      }
      if (start >= fileSize || start < 0 || end < 0 || start > end) {
        res.status(416);
        res.set("Content-Range", `bytes */${fileSize}`);
        res.end();
        return;
      }
      const chunkSize = end - start + 1;
      res.status(206);
      res.set("Content-Range", `bytes ${start}-${end}/${fileSize}`);
      res.set("Content-Length", String(chunkSize));
      const stream = createReadStream(localPath, { start, end });
      res.on("close", () => stream.destroy());
      stream.on("error", () => {
        if (!res.headersSent) res.status(500).end();
        else res.destroy();
      });
      stream.pipe(res);
      return;
    }

    res.set("Content-Length", String(fileSize));
    const stream = createReadStream(localPath);
    res.on("close", () => stream.destroy());
    stream.on("error", () => {
      if (!res.headersSent) res.status(500).end();
      else res.destroy();
    });
    stream.pipe(res);
  }

  app.get("/api/music-videos", async (req, res) => {
    try {
      const viewerId = (req as any).user?.claims?.sub ? String((req as any).user.claims.sub) : "";
      const rows = await db
        .select({
          id: musicVideos.id,
          userId: musicVideos.userId,
          title: musicVideos.title,
          description: musicVideos.description,
          videoUrl: musicVideos.videoUrl,
          originalFilename: musicVideos.originalFilename,
          durationSec: musicVideos.durationSec,
          fileSize: musicVideos.fileSize,
          playCount: musicVideos.playCount,
          createdAt: musicVideos.createdAt,
          username: users.username,
          firstName: users.firstName,
          lastName: users.lastName,
          profileImageUrl: users.profileImageUrl,
          likeCount: sql<number>`(
            SELECT COUNT(*)::int FROM music_video_likes mvl WHERE mvl.video_id = ${musicVideos.id}
          )`,
          commentCount: sql<number>`(
            SELECT COUNT(*)::int FROM music_video_comments mvc WHERE mvc.video_id = ${musicVideos.id}
          )`,
          likedByMe: viewerId
            ? sql<boolean>`EXISTS (
                SELECT 1 FROM music_video_likes mvl WHERE mvl.video_id = ${musicVideos.id} AND mvl.user_id = ${viewerId}
              )`
            : sql<boolean>`false`,
          purchasedByMe: viewerId
            ? sql<boolean>`EXISTS (
                SELECT 1 FROM music_video_purchases mvp WHERE mvp.video_id = ${musicVideos.id} AND mvp.buyer_id = ${viewerId}
              )`
            : sql<boolean>`false`,
        })
        .from(musicVideos)
        .leftJoin(users, eq(musicVideos.userId, users.id))
        .orderBy(desc(musicVideos.createdAt))
        .limit(80);
      res.json(
        rows.map((row) => ({
          id: row.id,
          title: row.title,
          description: row.description,
          videoUrl: row.videoUrl,
          originalFilename: row.originalFilename,
          durationSec: row.durationSec,
          fileSize: row.fileSize,
          playCount: row.playCount,
          likeCount: row.likeCount ?? 0,
          commentCount: row.commentCount ?? 0,
          likedByMe: Boolean(row.likedByMe),
          purchasedByMe: Boolean(row.purchasedByMe),
          downloadPrice: MUSIC_VIDEO_DOWNLOAD_PRICE_WON,
          createdAt: row.createdAt,
          creator: {
            id: row.userId,
            name: row.username || [row.firstName, row.lastName].filter(Boolean).join(" ").trim() || "VenySound",
            profileImageUrl: row.profileImageUrl,
          },
        })),
      );
    } catch (e) {
      console.error("[music-videos GET]", e);
      res.status(500).json({ message: "뮤직비디오 목록을 불러오지 못했습니다." });
    }
  });

  app.post("/api/music-videos/:id/play", async (req, res) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isInteger(id) || id <= 0) {
        return res.status(400).json({ message: "Invalid music video id." });
      }
      const [row] = await db
        .update(musicVideos)
        .set({
          playCount: sql`${musicVideos.playCount} + 1`,
          updatedAt: new Date(),
        })
        .where(eq(musicVideos.id, id))
        .returning({ playCount: musicVideos.playCount });
      if (!row) return res.status(404).json({ message: "Music video not found." });
      res.json({ playCount: row.playCount });
    } catch (e) {
      console.error("[music-videos play]", e);
      res.status(500).json({ message: "뮤직비디오 재생 수를 반영하지 못했습니다." });
    }
  });

  app.post("/api/music-videos/:id/like", isAuthenticated, async (req, res) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ message: "Invalid music video id." });
      const userId = String((req as any).user?.claims?.sub || "");
      const [video] = await db.select({ id: musicVideos.id }).from(musicVideos).where(eq(musicVideos.id, id)).limit(1);
      if (!video) return res.status(404).json({ message: "Music video not found." });
      const [existing] = await db
        .select({ id: musicVideoLikes.id })
        .from(musicVideoLikes)
        .where(and(eq(musicVideoLikes.videoId, id), eq(musicVideoLikes.userId, userId)))
        .limit(1);
      let liked = false;
      if (existing) {
        await db.delete(musicVideoLikes).where(eq(musicVideoLikes.id, existing.id));
      } else {
        await db.insert(musicVideoLikes).values({ videoId: id, userId }).onConflictDoNothing();
        liked = true;
      }
      const [countRow] = await db
        .select({ count: sql<number>`COUNT(*)::int` })
        .from(musicVideoLikes)
        .where(eq(musicVideoLikes.videoId, id));
      res.json({ liked, likeCount: countRow?.count ?? 0 });
    } catch (e) {
      console.error("[music-videos like]", e);
      res.status(500).json({ message: "좋아요 반영에 실패했습니다." });
    }
  });

  app.get("/api/music-videos/:id/comments", async (req, res) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ message: "Invalid music video id." });
      const viewerId = (req as any).user?.claims?.sub ? String((req as any).user.claims.sub) : "";
      const rows = await db
        .select({
          id: musicVideoComments.id,
          parentId: musicVideoComments.parentId,
          content: musicVideoComments.content,
          createdAt: musicVideoComments.createdAt,
          userId: musicVideoComments.userId,
          username: users.username,
          firstName: users.firstName,
          lastName: users.lastName,
          profileImageUrl: users.profileImageUrl,
          likeCount: sql<number>`(
            SELECT COUNT(*)::int FROM music_video_comment_likes mvcl WHERE mvcl.comment_id = ${musicVideoComments.id}
          )`,
          likedByMe: viewerId
            ? sql<boolean>`EXISTS (
                SELECT 1 FROM music_video_comment_likes mvcl WHERE mvcl.comment_id = ${musicVideoComments.id} AND mvcl.user_id = ${viewerId}
              )`
            : sql<boolean>`false`,
        })
        .from(musicVideoComments)
        .leftJoin(users, eq(musicVideoComments.userId, users.id))
        .where(eq(musicVideoComments.videoId, id))
        .orderBy(asc(musicVideoComments.createdAt))
        .limit(200);
      res.json(
        rows.map((row) => ({
          id: row.id,
          parentId: row.parentId,
          content: row.content,
          createdAt: row.createdAt,
          likeCount: row.likeCount ?? 0,
          likedByMe: Boolean(row.likedByMe),
          user: {
            id: row.userId,
            name: row.username || [row.firstName, row.lastName].filter(Boolean).join(" ").trim() || "VenySound",
            profileImageUrl: row.profileImageUrl,
          },
        })),
      );
    } catch (e) {
      console.error("[music-videos comments GET]", e);
      res.status(500).json({ message: "댓글을 불러오지 못했습니다." });
    }
  });

  app.post("/api/music-videos/:id/comments", isAuthenticated, async (req, res) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ message: "Invalid music video id." });
      const body = req.body as { content?: string; parentId?: number | null };
      const content = String(body?.content || "").trim().slice(0, 1000);
      if (!content) return res.status(400).json({ message: "댓글을 입력해 주세요." });
      const parentId = body.parentId == null || body.parentId === 0 ? null : Number(body.parentId);
      if (parentId != null && (!Number.isInteger(parentId) || parentId <= 0)) {
        return res.status(400).json({ message: "Invalid parent comment id." });
      }
      const userId = String((req as any).user?.claims?.sub || "");
      const [video] = await db.select({ id: musicVideos.id }).from(musicVideos).where(eq(musicVideos.id, id)).limit(1);
      if (!video) return res.status(404).json({ message: "Music video not found." });
      if (parentId != null) {
        const [parent] = await db
          .select({ id: musicVideoComments.id })
          .from(musicVideoComments)
          .where(and(eq(musicVideoComments.id, parentId), eq(musicVideoComments.videoId, id)))
          .limit(1);
        if (!parent) return res.status(404).json({ message: "Parent comment not found." });
      }
      const [comment] = await db.insert(musicVideoComments).values({ videoId: id, parentId, userId, content }).returning();
      res.status(201).json(comment);
    } catch (e) {
      console.error("[music-videos comments POST]", e);
      res.status(500).json({ message: "댓글 작성에 실패했습니다." });
    }
  });

  app.post("/api/music-videos/comments/:commentId/like", isAuthenticated, async (req, res) => {
    try {
      const commentId = Number(req.params.commentId);
      if (!Number.isInteger(commentId) || commentId <= 0) return res.status(400).json({ message: "Invalid comment id." });
      const userId = String((req as any).user?.claims?.sub || "");
      const [comment] = await db.select({ id: musicVideoComments.id }).from(musicVideoComments).where(eq(musicVideoComments.id, commentId)).limit(1);
      if (!comment) return res.status(404).json({ message: "Comment not found." });
      const [existing] = await db
        .select({ id: musicVideoCommentLikes.id })
        .from(musicVideoCommentLikes)
        .where(and(eq(musicVideoCommentLikes.commentId, commentId), eq(musicVideoCommentLikes.userId, userId)))
        .limit(1);
      let liked = false;
      if (existing) {
        await db.delete(musicVideoCommentLikes).where(eq(musicVideoCommentLikes.id, existing.id));
      } else {
        await db.insert(musicVideoCommentLikes).values({ commentId, userId }).onConflictDoNothing();
        liked = true;
      }
      const [countRow] = await db
        .select({ count: sql<number>`COUNT(*)::int` })
        .from(musicVideoCommentLikes)
        .where(eq(musicVideoCommentLikes.commentId, commentId));
      res.json({ liked, likeCount: countRow?.count ?? 0 });
    } catch (e) {
      console.error("[music-videos comment like]", e);
      res.status(500).json({ message: "댓글 좋아요 반영에 실패했습니다." });
    }
  });

  app.delete("/api/music-videos/comments/:commentId", isAuthenticated, async (req, res) => {
    try {
      const commentId = Number(req.params.commentId);
      if (!Number.isInteger(commentId) || commentId <= 0) return res.status(400).json({ message: "Invalid comment id." });
      const userId = String((req as any).user?.claims?.sub || "");
      const [comment] = await db
        .select({ id: musicVideoComments.id, userId: musicVideoComments.userId, videoId: musicVideoComments.videoId, parentId: musicVideoComments.parentId })
        .from(musicVideoComments)
        .where(eq(musicVideoComments.id, commentId))
        .limit(1);
      if (!comment) return res.status(404).json({ message: "Comment not found." });
      if (String(comment.userId) !== userId) return res.status(403).json({ message: "본인이 작성한 댓글만 삭제할 수 있습니다." });
      if (comment.parentId == null) {
        await db.delete(musicVideoComments).where(or(eq(musicVideoComments.id, commentId), eq(musicVideoComments.parentId, commentId)));
      } else {
        await db.delete(musicVideoComments).where(eq(musicVideoComments.id, commentId));
      }
      const [countRow] = await db
        .select({ count: sql<number>`COUNT(*)::int` })
        .from(musicVideoComments)
        .where(eq(musicVideoComments.videoId, comment.videoId));
      res.json({ deleted: true, commentCount: countRow?.count ?? 0 });
    } catch (e) {
      console.error("[music-videos comments DELETE]", e);
      res.status(500).json({ message: "댓글 삭제에 실패했습니다." });
    }
  });

  app.get("/api/music-videos/:id/stream", async (req, res) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ message: "Invalid music video id." });
      const [video] = await db
        .select({ videoUrl: musicVideos.videoUrl })
        .from(musicVideos)
        .where(eq(musicVideos.id, id))
        .limit(1);
      if (!video) return res.status(404).json({ message: "Music video not found." });
      const { localPath } = resolveUploadedVideoPath(video.videoUrl);
      if (!localPath) return res.status(404).json({ message: "MP4 파일을 찾을 수 없습니다." });
      serveMusicVideoInlineStream(localPath, req, res);
    } catch (e) {
      console.error("[music-videos stream]", e);
      if (!res.headersSent) res.status(500).json({ message: "뮤직비디오 스트림에 실패했습니다." });
    }
  });

  app.get("/api/music-videos/:id/download", isAuthenticated, async (req, res) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ message: "Invalid music video id." });
      const userId = String((req as any).user?.claims?.sub || "");
      const [video] = await db.select().from(musicVideos).where(eq(musicVideos.id, id)).limit(1);
      if (!video) return res.status(404).json({ message: "Music video not found." });
      const isOwnerDownload = String(video.userId) === userId;
      if (!isOwnerDownload) {
        const [purchased] = await db
          .select({ id: musicVideoPurchases.id })
          .from(musicVideoPurchases)
          .where(and(eq(musicVideoPurchases.videoId, id), eq(musicVideoPurchases.buyerId, userId)))
          .limit(1);
        if (!purchased) {
          const deducted = await storage.deductCredits(userId, MUSIC_VIDEO_DOWNLOAD_PRICE_WON);
          if (!deducted) {
            return res.status(402).json({
              message: "지갑 잔액이 부족합니다. 충전 후 다시 시도해 주세요.",
              insufficientCredits: true,
            });
          }
          const [purchase] = await db
            .insert(musicVideoPurchases)
            .values({
              buyerId: userId,
              videoId: id,
              sellerId: video.userId,
              amount: MUSIC_VIDEO_DOWNLOAD_PRICE_WON,
            })
            .onConflictDoNothing()
            .returning({ id: musicVideoPurchases.id });
          if (purchase) {
            await storage.addToBalance(video.userId, MUSIC_VIDEO_DOWNLOAD_PRICE_WON);
            await storage.createCreditTransaction({
              userId,
              type: "music_video_purchase",
              amount: -MUSIC_VIDEO_DOWNLOAD_PRICE_WON,
              description: `"${video.title}" MP4 다운로드`,
              relatedId: purchase.id,
            });
            await storage.createCreditTransaction({
              userId: video.userId,
              type: "music_video_sale",
              amount: MUSIC_VIDEO_DOWNLOAD_PRICE_WON,
              description: `"${video.title}" MP4 다운로드 수익`,
              relatedId: purchase.id,
            });
          }
        }
      }
      const { localPath, safeId } = resolveUploadedVideoPath(video.videoUrl);
      if (!localPath) return res.status(404).json({ message: "MP4 파일을 찾을 수 없습니다." });
      const ext = path.extname(localPath).toLowerCase() || ".mp4";
      const mime: Record<string, string> = { ".mp4": "video/mp4", ".webm": "video/webm", ".mov": "video/quicktime" };
      const safeTitle = sanitizeDownloadFileName(video.title, safeId.replace(/\.[^.]+$/, "") || "music-video");
      res.set("Content-Type", mime[ext] || "video/mp4");
      res.set("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(safeTitle + ext)}`);
      res.set("Content-Length", String(statSync(localPath).size));
      createReadStream(localPath).pipe(res);
    } catch (e) {
      console.error("[music-videos download]", e);
      res.status(500).json({ message: "MP4 다운로드에 실패했습니다." });
    }
  });

  app.delete("/api/music-videos/:id", isAuthenticated, async (req, res) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ message: "Invalid music video id." });
      const userId = String((req as any).user?.claims?.sub || "");
      const role = await storage.getUserRole(userId);
      if (role !== "admin") return res.status(403).json({ message: "관리자 권한이 필요합니다." });
      const [deleted] = await db
        .delete(musicVideos)
        .where(eq(musicVideos.id, id))
        .returning({ id: musicVideos.id });
      if (!deleted) return res.status(404).json({ message: "Music video not found." });
      res.json({ deleted: true, id: deleted.id });
    } catch (e) {
      console.error("[music-videos DELETE]", e);
      res.status(500).json({ message: "뮤직비디오 삭제에 실패했습니다." });
    }
  });

  app.post("/api/music-videos", isAuthenticated, async (req, res) => {
    try {
      const body = req.body as {
        title?: string;
        description?: string;
        videoUrl?: string;
        originalFilename?: string;
        durationSec?: number;
        fileSize?: number;
      };
      const title = String(body.title || "").trim().slice(0, 180);
      const videoUrl = String(body.videoUrl || "").trim();
      if (!title) return res.status(400).json({ message: "제목을 입력해 주세요." });
      if (!videoUrl || !/^\/objects\/uploads\/[^/?#]+/i.test(videoUrl)) {
        return res.status(400).json({ message: "업로드된 MP4 파일 경로가 필요합니다." });
      }
      // @ts-ignore
      const userId = req.user.claims.sub;
      const [row] = await db
        .insert(musicVideos)
        .values({
          userId,
          title,
          description: String(body.description || "").trim().slice(0, 1200) || null,
          videoUrl,
          originalFilename: String(body.originalFilename || "").trim().slice(0, 260) || null,
          durationSec: Number.isFinite(body.durationSec) ? Math.max(0, Math.floor(Number(body.durationSec))) : null,
          fileSize: Number.isFinite(body.fileSize) ? Math.max(0, Math.floor(Number(body.fileSize))) : null,
        })
        .returning();
      res.status(201).json(row);
    } catch (e) {
      console.error("[music-videos POST]", e);
      res.status(500).json({ message: "뮤직비디오를 등록하지 못했습니다." });
    }
  });

  app.post(api.music.create.path, isAuthenticated, async (req, res) => {
    try {
      const input = api.music.create.input.parse(req.body);
      // @ts-ignore
      const userId = req.user.claims.sub;

      const { isPremium } = await ensureExpiredSubscriptionDowngrade(userId);
      if (!isPremium) {
        const now = new Date();
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
        const uploadCount = await db.execute(sql`
          SELECT COUNT(*) as count FROM music 
          WHERE user_id = ${userId} AND created_at >= ${monthStart.toISOString()}
        `);
        const count = Number(uploadCount.rows[0]?.count || 0);
        if (count >= 10) {
          return res.status(403).json({ 
            message: "Free 플랜은 월 10곡까지 업로드할 수 있습니다. 프리미엄으로 업그레이드하면 무제한 업로드가 가능합니다.",
            code: "UPLOAD_LIMIT_REACHED",
            current: count,
            limit: 10
          });
        }
      }

      const imageFilename = input.imageFilename;
      // 수익 활동(가격/유료 다운로드)은 프리미엄 회원만 가능
      const isDownloadable = isPremium ? input.isDownloadable : false;
      const price = isPremium ? input.price : 0;

      const music = await storage.createMusic({ ...input, imageFilename, isDownloadable, price, userId, tags: null });
      // 비동기로 "좋아할 만한 신곡" 알림 (이메일 + 푸시 + 앱 내 알림)
      const baseUrl = (process.env.SITE_URL || "https://venysound.com").replace(/\/$/, "");
      const musicUrl = `${baseUrl}/music/${music.id}`;
      setImmediate(async () => {
        try {
          const recipients = await storage.getUsersToNotifyForNewMusic({
            id: music.id,
            title: music.title,
            artist: music.artist,
            genre: music.genre ?? undefined,
            userId,
          });
          for (const r of recipients) {
            const u = await storage.getUserById(r.userId);
            const displayName = u?.firstName || "회원";
            await storage.createNotification({
              userId: r.userId,
              type: "new_music_for_you",
              message: `${displayName}님이 좋아할 만한 음악이 신곡으로 등록되었습니다`,
              payload: { fromName: displayName, musicTitle: music.title, artist: music.artist, musicId: music.id },
              url: `/music/${music.id}`,
            });
            if (r.notifyNewMusicEmail && r.email) {
              await sendNewMusicNotificationEmail(r.email, {
                userName: displayName,
                musicTitle: music.title,
                artist: music.artist,
                musicUrl,
              });
            }
          }
          const pushUserIds = recipients.filter((r) => r.notifyNewMusicPush).map((r) => r.userId);
          if (pushUserIds.length > 0) {
            const subs = await storage.getPushSubscriptionsByUserIds(pushUserIds);
            for (const sub of subs) {
              const u = await storage.getUserById(sub.userId);
              const name = u?.firstName || "회원";
              await sendPushNotification(
                { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
                {
                  title: "신곡 알림",
                  body: `${name}님이 좋아할 만한 음악이 등록되었어요: ${music.title} - ${music.artist}`,
                  url: musicUrl,
                }
              );
            }
          }
        } catch (e) {
          console.error("[new-music-notify]", e);
        }
      });
      res.status(201).json(music);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      console.error("Music create error:", err);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post("/api/music/generate-cover", isAuthenticated, async (req, res) => {
    try {
      // @ts-ignore
      const userId = req.user.claims.sub;
      const { isPremium } = await ensureExpiredSubscriptionDowngrade(userId);
      if (!isPremium) {
        return res.status(403).json({ message: "프리미엄 구독이 필요한 기능입니다" });
      }

      const { title, artist, genre } = req.body;
      if (!title || !artist) {
        return res.status(400).json({ message: "제목과 아티스트 정보가 필요합니다" });
      }

      const sanitize = (input: string, maxLen = 100) =>
        input.replace(/[^\w\sㄱ-ㅎㅏ-ㅣ가-힣a-zA-Z0-9\-.,!?&()]/g, "").slice(0, maxLen).trim();

      const safeTitle = sanitize(String(title));
      const safeArtist = sanitize(String(artist));
      const safeGenre = sanitize(String(genre || "music"), 50);

      const promptParts = [
        "Create an album cover art for a music track titled",
        JSON.stringify(safeTitle),
        "by",
        safeArtist + ".",
        "Genre:",
        safeGenre + ".",
        "Style: modern, abstract, artistic album artwork with vibrant colors. No text or words on the image.",
      ];
      const prompt = promptParts.join(" ");
      const imageBuffer = await generateImageBuffer(prompt, "1024x1024");
      const objectPath = saveBufferToLocalUploads(imageBuffer, ".png");
      res.json({ objectPath });
    } catch (err: any) {
      console.error("AI cover generation error:", err?.message || err);
      if (err?.status) console.error("AI API status:", err.status);
      res.status(500).json({ message: "AI 커버 생성에 실패했습니다. 다시 시도해주세요." });
    }
  });

  // Update music (owner; 관리자는 spotifyAlbumId만 타인 음원에 설정 가능 — 해외 출시 DB 병합용)
  app.patch("/api/music/:id", isAuthenticated, async (req, res) => {
    try {
      // @ts-ignore
      const userId = req.user.claims.sub;
      const musicId = Number(req.params.id);
      const existing = await storage.getMusicById(musicId);
      if (!existing) return res.status(404).json({ message: "음원을 찾을 수 없습니다" });

      const role = await storage.getUserRole(userId);
      const isAdminUser = role === "admin";
      const isOwner = existing.userId === userId;

      if (!isOwner && !isAdminUser) {
        return res.status(403).json({ message: "본인의 음원만 수정할 수 있습니다" });
      }

      const { title, artist, genre, tags, lyrics, isAi, imageFilename, price, isDownloadable, spotifyAlbumId } = req.body;

      if (!isOwner && isAdminUser) {
        const otherFields = [
          title,
          artist,
          genre,
          tags,
          lyrics,
          isAi,
          imageFilename,
          price,
          isDownloadable,
        ].some((v) => v !== undefined);
        if (otherFields) {
          return res.status(400).json({
            message: "관리자는 다른 회원 음원에 spotifyAlbumId(해외 앨범 연동)만 수정할 수 있습니다.",
          });
        }
        if (spotifyAlbumId === undefined) {
          return res.status(400).json({ message: "수정할 spotifyAlbumId 값을 보내 주세요." });
        }
        const raw = spotifyAlbumId == null ? "" : String(spotifyAlbumId).trim();
        const updateData: { spotifyAlbumId: string | null } = {
          spotifyAlbumId: null,
        };
        if (raw) {
          const id = parseSpotifyAlbumIdFromUserInput(raw);
          if (!id) {
            return res.status(400).json({
              message:
                "Spotify 앨범·싱글 ID를 찾을 수 없습니다. 숫자·영문 ID만 입력하거나, open.spotify.com/album/… 전체 주소를 붙여넣어 주세요.",
            });
          }
          updateData.spotifyAlbumId = id;
        }
        const updated = await storage.updateMusic(musicId, updateData);
        return res.json(updated);
      }

      if (title !== undefined && !title.trim()) return res.status(400).json({ message: "제목을 입력해주세요" });
      if (artist !== undefined && !artist.trim()) return res.status(400).json({ message: "아티스트를 입력해주세요" });

      const { isPremium } = await ensureExpiredSubscriptionDowngrade(userId);
      const updateData: any = {};
      if (title !== undefined) updateData.title = title.trim();
      if (artist !== undefined) updateData.artist = artist.trim();
      if (genre !== undefined) updateData.genre = genre;
      if (tags !== undefined) updateData.tags = tags;
      if (lyrics !== undefined) updateData.lyrics = lyrics;
      if (isAi !== undefined) updateData.isAi = isAi;
      if (imageFilename !== undefined) updateData.imageFilename = imageFilename;
      if (existing.freeAiSiteRestrictions) {
        if (price !== undefined && Number(price) > 0) {
          return res.status(400).json({
            message: "무료 플랜 AI 월 한도로 공개된 곡은 유료 다운로드·판매 설정을 켤 수 없습니다.",
          });
        }
        if (isDownloadable === true) {
          return res.status(400).json({
            message: "무료 플랜 AI 월 한도로 공개된 곡은 다운로드 판매를 허용할 수 없습니다.",
          });
        }
      }
      if (price !== undefined) updateData.price = isPremium ? (Number(price) || 0) : 0;
      if (isDownloadable !== undefined) updateData.isDownloadable = isPremium ? Boolean(isDownloadable) : false;
      if (existing.freeAiSiteRestrictions) {
        updateData.price = 0;
        updateData.isDownloadable = false;
      }
      /** Spotify 앨범 ID는 관리자만 설정(해외 탭 DB 연동). 일반 소유자 PATCH는 무시 */
      if (spotifyAlbumId !== undefined && isAdminUser) {
        const raw = spotifyAlbumId == null ? "" : String(spotifyAlbumId).trim();
        if (!raw) updateData.spotifyAlbumId = null;
        else {
          const id = parseSpotifyAlbumIdFromUserInput(raw);
          if (!id) {
            return res.status(400).json({
              message:
                "Spotify 앨범·싱글 ID를 찾을 수 없습니다. 숫자·영문 ID만 입력하거나, open.spotify.com/album/… 전체 주소를 붙여넣어 주세요.",
            });
          }
          updateData.spotifyAlbumId = id;
        }
      }
      const updated = await storage.updateMusic(musicId, updateData);
      res.json(updated);
    } catch (err) {
      console.error("Music update error:", err);
      res.status(500).json({ message: "음원 수정에 실패했습니다" });
    }
  });

  function isOpenAiQuotaOrRateLimit(err: unknown): boolean {
    const e = err as {
      status?: number;
      statusCode?: number;
      code?: string;
      message?: string;
      error?: { code?: string; type?: string };
    };
    if (!e) return false;
    if (e.status === 429 || e.statusCode === 429) return true;
    if (e.code === "insufficient_quota" || e.error?.code === "insufficient_quota" || e.error?.type === "insufficient_quota")
      return true;
    const msg = String(e.message ?? "");
    if (/429/.test(msg) && /quota|billing|insufficient_quota|rate limit/i.test(msg)) return true;
    return false;
  }

  /** AI 가사 자동 정렬: 플레인 가사 + 음원 → Whisper로 LRC 생성 후 저장 */
  app.post("/api/music/:id/align-lyrics", isAuthenticated, async (req, res) => {
    try {
      // @ts-ignore
      const userId = req.user.claims.sub;
      const musicId = Number(req.params.id);
      const existing = await storage.getMusicById(musicId);
      if (!existing) return res.status(404).json({ message: "음원을 찾을 수 없습니다" });
      if (existing.userId !== userId) return res.status(403).json({ message: "본인의 음원만 정렬할 수 있습니다" });

      const plainLyrics = (req.body.lyrics != null ? String(req.body.lyrics) : (existing.lyrics ?? "")).trim();
      if (!plainLyrics) return res.status(400).json({ message: "가사를 입력하거나, 먼저 음원에 가사를 저장해 주세요." });

      const fn = existing.filename || "";
      let fileId = "";
      const objMatch = fn.match(/\/objects\/uploads\/(.+)$/);
      if (objMatch) fileId = objMatch[1];
      else if (fn.startsWith("uploads/")) fileId = fn.replace(/^uploads\//, "");
      else if (/^[a-f0-9-]{36}(\.[a-z]+)?$/i.test(fn.trim())) fileId = fn.trim();
      else if (fn.includes("/")) fileId = fn.split("/").pop() || "";
      else fileId = fn;
      fileId = fileId.replace(/^\//, "");
      if (!fileId) return res.status(404).json({ message: "파일 경로를 찾을 수 없습니다" });

      const baseId = fileId.replace(/\.(mp3|wav|ogg)$/i, "");
      const candidates = [
        path.join(uploadsDir, fileId),
        path.join(uploadsDir, `${baseId}.mp3`),
        path.join(uploadsDir, `${baseId}.wav`),
        path.join(uploadsDir, `${baseId}.ogg`),
      ];
      const localPath = candidates.find((p) => existsSync(p));
      if (!localPath) return res.status(404).json({ message: "음원 파일을 찾을 수 없습니다" });

      const language = req.body.language ? String(req.body.language).slice(0, 10) : undefined;
      const lrc = await alignLyricsToAudio(localPath, plainLyrics, language);
      await storage.updateMusic(musicId, { lyrics: lrc });
      res.json({ lyrics: lrc });
    } catch (err: any) {
      if (err?.message?.includes("OPENAI_API_KEY")) {
        return res.status(503).json({ message: "AI 가사 정렬을 사용하려면 서버에 OPENAI_API_KEY를 설정해 주세요." });
      }
      if (isOpenAiQuotaOrRateLimit(err)) {
        console.warn("align-lyrics: OpenAI quota/rate limit (429 / insufficient_quota)");
        return res.status(503).json({
          message:
            "OpenAI 사용 한도가 부족하거나 요청이 많습니다. 대시보드 결제·한도를 확인한 뒤 잠시 후 다시 시도해 주세요.",
        });
      }
      console.error("align-lyrics error:", err);
      res.status(500).json({ message: err?.message || "가사 정렬에 실패했습니다" });
    }
  });

  /** 음원 소유자: 동영상 플랫폼 홍보용 메타 문구(한·영) 자동 생성 */
  app.post("/api/music/:id/promo-social-kit", isAuthenticated, async (req, res) => {
    try {
      // @ts-ignore
      const userId = req.user.claims.sub;
      const musicId = Number(req.params.id);
      if (!Number.isFinite(musicId) || musicId <= 0) {
        return res.status(400).json({ message: "잘못된 음원 ID입니다." });
      }

      const [promoUser0] = await db.select().from(users).where(eq(users.id, userId));
      if (!promoUser0) {
        return res.status(404).json({ message: "사용자를 찾을 수 없습니다." });
      }
      await maybePersistSubscriptionRow(userId, promoUser0);
      const [promoUser] = await db.select().from(users).where(eq(users.id, userId));
      const promoRow = promoUser!;
      const promoNow = new Date();
      if (promoRow.role !== "admin" && !isActivePaidSubscription(promoRow, promoNow)) {
        return res.status(403).json({
          message: "홍보 문구 자동 생성은 유료 구독(유효 기간 내) 회원만 사용할 수 있습니다.",
          code: "PROMO_SOCIAL_KIT_PAID_ONLY",
        });
      }

      const existing = await storage.getMusicById(musicId);
      if (!existing) return res.status(404).json({ message: "음원을 찾을 수 없습니다" });
      if (existing.userId !== userId) {
        return res.status(403).json({ message: "본인이 올린 음원만 생성할 수 있습니다." });
      }

      const siteBase = (process.env.SITE_URL || "https://venysound.com").replace(/\/$/, "");
      const trackUrl = `${siteBase}/music/${musicId}`;
      const lyricsPlain = (existing.lyrics ?? "")
        .replace(/\[\d{1,2}:\d{2}(?:\.\d+)?\]/g, " ")
        .replace(/\r\n/g, "\n")
        .trim();
      const lyricsSnippet = lyricsPlain.slice(0, 2800);

      const kit = await generatePromoSocialKit({
        title: existing.title ?? "",
        artist: existing.artist ?? "",
        genre: existing.genre,
        tags: existing.tags,
        lyricsSnippet: lyricsSnippet || null,
        isAi: Boolean(existing.isAi),
        trackUrl,
        siteLabel: "Veny Sound",
      });
      res.json(kit);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg === "OPENAI_API_KEY_MISSING" || msg.includes("OPENAI_API_KEY")) {
        return res.status(503).json({
          message:
            "홍보 문구 생성을 사용하려면 서버 환경에 OPENAI_API_KEY 또는 AI_INTEGRATIONS_OPENAI_API_KEY 중 하나를 설정한 뒤 프로세스를 재시작해 주세요.",
        });
      }
      const httpStatus =
        err && typeof err === "object" && "status" in err && typeof (err as { status: unknown }).status === "number"
          ? (err as { status: number }).status
          : undefined;
      const lower = msg.toLowerCase();
      if (httpStatus === 401 || lower.includes("incorrect api key") || lower.includes("invalid_api_key")) {
        return res.status(502).json({
          message: "OpenAI API 키가 잘못되었거나 만료되었습니다. .env의 키 앞뒤 공백·따옴표를 제거한 뒤 재시작해 주세요.",
        });
      }
      if (httpStatus === 429 || lower.includes("rate_limit")) {
        return res.status(429).json({ message: "OpenAI 요청 한도에 걸렸습니다. 잠시 후 다시 시도해 주세요." });
      }
      if (
        lower.includes("insufficient_quota") ||
        lower.includes("billing") ||
        lower.includes("payment") ||
        lower.includes("exceeded your current quota")
      ) {
        return res.status(402).json({
          message:
            "OpenAI 계정에 사용 가능한 크레딧이 없거나 결제 수단이 필요합니다. https://platform.openai.com/settings/organization/billing 에서 확인해 주세요.",
        });
      }
      console.error("promo-social-kit error:", err);
      const detail = msg
        .replace(/sk-[a-zA-Z0-9_-]{10,}/gi, "sk-…")
        .replace(/\r?\n/g, " ")
        .slice(0, 400);
      res.status(500).json({
        message: "홍보 문구 생성에 실패했습니다.",
        detail: detail.length > 0 ? detail : undefined,
      });
    }
  });

  // Delete music (owner or admin)
  app.delete("/api/music/:id", isAuthenticated, async (req, res) => {
    try {
      // @ts-ignore
      const userId = req.user.claims.sub;
      const musicId = Number(req.params.id);
      const existing = await storage.getMusicById(musicId);
      if (!existing) return res.status(404).json({ message: "음원을 찾을 수 없습니다" });

      const role = await storage.getUserRole(userId);
      if (existing.userId !== userId && role !== "admin") {
        return res.status(403).json({ message: "삭제 권한이 없습니다" });
      }

      await storage.deleteMusic(musicId);
      res.json({ success: true });
    } catch (err) {
      console.error("Music delete error:", err);
      res.status(500).json({ message: "음원 삭제에 실패했습니다" });
    }
  });

  app.post(api.music.like.path, isAuthenticated, async (req, res) => {
    // @ts-ignore
    const userId = req.user.claims.sub;
    const musicId = Number(req.params.id);
    const music = await storage.getMusicById(musicId);
    
    if (!music) return res.status(404).json({ message: "Music not found" });

    const liked = await storage.toggleLike(userId, musicId);
    
    if (liked && music.userId !== userId) {
        // @ts-ignore
      const likerName = req.user.claims.first_name || "사용자";
      await storage.createNotification({
        userId: music.userId,
        type: "like",
        message: `${likerName}님이 "${music.title}" 곡을 좋아합니다`,
        payload: { fromName: likerName, musicTitle: music.title },
        url: `/music/${musicId}`
      });
      queueActivityEmail(music.userId, "like", {
        actorName: likerName,
        musicTitle: music.title,
        actionPath: `/music/${musicId}`,
      });
    }

    res.json({ liked });
  });

  // === Review Routes ===
  app.get(api.reviews.list.path, async (req, res) => {
    const reviews = await storage.getReviewsByMusicId(Number(req.params.id));
    res.json(reviews);
  });

  app.post(api.reviews.create.path, isAuthenticated, async (req, res) => {
    try {
      const input = api.reviews.create.input.parse(req.body);
      // @ts-ignore
      const userId = req.user.claims.sub;
      const review = await storage.createReview({
        ...input,
        userId,
        musicId: Number(req.params.id)
      });
      const musicItem = await storage.getMusicById(Number(req.params.id));
      if (musicItem && musicItem.userId !== userId) {
        const reviewerName = (req as any).user?.claims?.first_name || "사용자";
        await storage.createNotification({
          userId: musicItem.userId,
          type: "review",
          message: `${reviewerName}님이 "${musicItem.title}" 곡에 리뷰를 남겼습니다`,
          payload: { fromName: reviewerName, musicTitle: musicItem.title },
          url: `/music/${req.params.id}`,
        });
        queueActivityEmail(musicItem.userId, "review", {
          actorName: reviewerName,
          musicTitle: musicItem.title,
          snippet: input.content?.trim(),
          actionPath: `/music/${req.params.id}`,
        });
      }
      res.status(201).json(review);
    } catch (err) {
      res.status(400).json({ message: "Invalid input" });
    }
  });

  // === Music Story Routes (창작 히스토리) ===
  app.get(api.musicStories.list.path, async (req, res) => {
    const stories = await storage.getMusicStoriesByMusicId(Number(req.params.id));
    res.json(stories);
  });

  app.post(api.musicStories.create.path, isAuthenticated, async (req, res) => {
    try {
      const input = api.musicStories.create.input.parse(req.body);
      // @ts-ignore
      const userId = req.user.claims.sub;
      const musicId = Number(req.params.id);
      const musicItem = await storage.getMusicById(musicId);
      if (!musicItem) return res.status(404).json({ message: "Music not found" });
      if (musicItem.userId !== userId) return res.status(403).json({ message: "Only the uploader can write a creative story" });
      const story = await storage.createMusicStory({ ...input, userId, musicId });
      res.status(201).json(story);
    } catch (err) {
      res.status(400).json({ message: "Invalid input" });
    }
  });

  app.patch(api.musicStories.update.path, isAuthenticated, async (req, res) => {
    try {
      const { content } = req.body;
      if (!content || typeof content !== "string" || !content.trim()) {
        return res.status(400).json({ message: "Content is required" });
      }
      // @ts-ignore
      const userId = req.user.claims.sub;
      const storyId = Number(req.params.id);
      const storyResult = await db.select().from(musicStoriesTable).where(eq(musicStoriesTable.id, storyId));
      if (!storyResult.length) return res.status(404).json({ message: "Story not found" });
      if (storyResult[0].userId !== userId) return res.status(403).json({ message: "Only the author can edit this story" });
      const updated = await storage.updateMusicStory(storyId, content.trim());
      if (!updated) return res.status(404).json({ message: "Story not found" });
      res.json(updated);
    } catch (err) {
      res.status(400).json({ message: "Invalid input" });
    }
  });

  app.delete(api.musicStories.delete.path, isAuthenticated, async (req, res) => {
    try {
      // @ts-ignore
      const userId = req.user.claims.sub;
      const storyId = Number(req.params.id);
      const storyResult = await db.select().from(musicStoriesTable).where(eq(musicStoriesTable.id, storyId));
      if (!storyResult.length) return res.status(404).json({ message: "Story not found" });
      if (storyResult[0].userId !== userId) return res.status(403).json({ message: "Only the author can delete this story" });
      await storage.deleteMusicStory(storyId);
      res.json({ success: true });
    } catch (err) {
      res.status(400).json({ message: "Failed to delete story" });
    }
  });

  app.get(api.musicStories.getComments.path, async (req, res) => {
    const comments = await storage.getStoryComments(Number(req.params.id));
    res.json(comments);
  });

  app.post(api.musicStories.createComment.path, isAuthenticated, async (req, res) => {
    try {
      const input = api.musicStories.createComment.input.parse(req.body);
      // @ts-ignore
      const userId = req.user.claims.sub;
      const storyId = Number(req.params.id);
      const [storyRow] = await db.select({ userId: musicStoriesTable.userId, musicId: musicStoriesTable.musicId }).from(musicStoriesTable).where(eq(musicStoriesTable.id, storyId));
      const comment = await storage.createStoryComment({ ...input, userId, storyId });
      if (storyRow && storyRow.userId !== userId) {
        const commenterName = (req as any).user?.claims?.first_name || "사용자";
        await storage.createNotification({
          userId: storyRow.userId,
          type: "story_comment",
          message: `${commenterName}님이 창작 히스토리에 댓글을 남겼습니다`,
          payload: { fromName: commenterName },
          url: storyRow.musicId ? `/music/${storyRow.musicId}` : "/explore",
        });
        queueActivityEmail(storyRow.userId, "story_comment", {
          actorName: commenterName,
          snippet: input.content?.trim(),
          actionPath: storyRow.musicId ? `/music/${storyRow.musicId}` : "/explore",
        });
      }
      res.status(201).json(comment);
    } catch (err) {
      res.status(400).json({ message: "Invalid input" });
    }
  });

  // === Playlist Routes ===
  app.get(api.playlists.list.path, isAuthenticated, async (req, res) => {
    // @ts-ignore
    const userId = req.user.claims.sub;
    const playlists = await storage.getPlaylistsByUser(userId);
    res.json(playlists);
  });

  app.post(api.playlists.create.path, isAuthenticated, async (req, res) => {
    try {
      const input = api.playlists.create.input.parse(req.body);
      // @ts-ignore
      const userId = req.user.claims.sub;
      const playlist = await storage.createPlaylist({ ...input, userId });
      res.status(201).json(playlist);
    } catch (err) {
      res.status(400).json({ message: "Invalid input" });
    }
  });

  app.post(api.playlists.addMusic.path, isAuthenticated, async (req, res) => {
    const playlistId = Number(req.params.id);
    if (!Number.isFinite(playlistId) || playlistId < 1) {
      return res.status(400).json({ message: "플레이리스트 ID가 올바르지 않습니다." });
    }
    const rawMid = (req.body as { musicId?: unknown })?.musicId;
    const musicIdNum = typeof rawMid === "string" ? Number(rawMid) : typeof rawMid === "number" ? rawMid : NaN;
    const parsed = api.playlists.addMusic.input.safeParse({ musicId: musicIdNum });
    if (!parsed.success) {
      return res.status(400).json({ message: "음원 ID(musicId)가 올바르지 않습니다." });
    }
    const { musicId } = parsed.data;

    const playlist = await storage.getPlaylistById(playlistId);
    // @ts-ignore
    if (!playlist || playlist.userId !== req.user.claims.sub) {
      return res.status(404).json({ message: "플레이리스트를 찾을 수 없거나 권한이 없습니다." });
    }

    try {
      await storage.addMusicToPlaylist(playlistId, musicId);
    } catch (e) {
      console.error("[playlists addMusic]", e);
      return res.status(500).json({ message: "플레이리스트에 곡을 추가하지 못했습니다." });
    }
    res.json({ success: true });
  });

  app.get(api.playlists.get.path, async (req, res) => {
    const playlist = await storage.getPlaylistById(Number(req.params.id));
    if (!playlist) return res.status(404).json({ message: "Playlist not found" });
    res.json(playlist);
  });

  // === Community/Post Routes ===
  app.get(api.posts.list.path, async (req, res) => {
    const { category, search } = req.query as { category?: string, search?: string };
    const posts = await storage.getPosts(category, search);
    res.json(posts);
  });

  app.get(api.posts.get.path, async (req, res) => {
    const post = await storage.getPostById(Number(req.params.id));
    if (!post) return res.status(404).json({ message: "Post not found" });
    const p = post as any;
    res.json({ ...p, userId: p.userId ?? p.user_id ?? p.user?.id ?? null });
  });

  /** 게시글 조회수 +1 (세션당 1회는 클라이언트 sessionStorage로 중복 방지) */
  app.post("/api/posts/:id/view", async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id <= 0) return res.status(400).json({ message: "Invalid id" });
    const ok = await storage.incrementPostViewCount(id);
    if (!ok) return res.status(404).json({ message: "Post not found" });
    res.json({ ok: true });
  });

  app.post(api.posts.create.path, isAuthenticated, async (req, res) => {
    try {
      const input = api.posts.create.input.parse(req.body);
      // @ts-ignore
      const userId = req.user.claims.sub;
      const post = await storage.createPost({ ...input, userId });
      res.status(201).json(post);
    } catch (err) {
      res.status(400).json({ message: "Invalid input" });
    }
  });

  app.patch("/api/posts/:id", isAuthenticated, async (req, res) => {
    // @ts-ignore
    const userId = req.user?.claims?.sub != null ? String(req.user.claims.sub) : "";
    if (!userId) return res.status(401).json({ message: "인증 정보가 없습니다" });
    const postId = Number(req.params.id);
    const body = req.body || {};
    const title = typeof body.title === "string" ? body.title.trim() : undefined;
    const content = typeof body.content === "string" ? body.content.trim() : undefined;
    const category = body.category !== undefined ? (body.category === null || body.category === "" ? null : String(body.category).trim()) : undefined;
    const attachment = body.attachment !== undefined ? (body.attachment === null || body.attachment === "" ? null : String(body.attachment).trim()) : undefined;
    const success = await storage.updatePost(postId, userId, { title, content, category, attachment });
    if (!success) return res.status(403).json({ message: "수정 권한이 없습니다" });
    const post = await storage.getPostById(postId);
    res.json(post);
  });

  app.delete("/api/posts/:id", isAuthenticated, async (req, res) => {
    // @ts-ignore
    const userId = req.user?.claims?.sub != null ? String(req.user.claims.sub) : "";
    if (!userId) return res.status(401).json({ message: "인증 정보가 없습니다" });
    const postId = Number(req.params.id);
    const success = await storage.deletePost(postId, userId);
    if (!success) return res.status(403).json({ message: "삭제 권한이 없습니다" });
    res.json({ success: true });
  });

  app.get(api.posts.getComments.path, async (req, res) => {
    const comments = await storage.getPostComments(Number(req.params.id));
    res.json(comments.map((c: any) => ({
      ...c,
      userId: c.userId ?? (c as any).user_id ?? c.user?.id ?? null,
    })));
  });

  app.post(api.posts.createComment.path, isAuthenticated, async (req, res) => {
    try {
      const input = api.posts.createComment.input.parse(req.body);
      // @ts-ignore
      const userId = req.user.claims.sub;
      const postId = Number(req.params.id);
      const post = await storage.getPostById(postId);
      const comment = await storage.createPostComment({
        ...input,
        userId,
        postId,
      });
      if (post && (post as any).userId !== userId) {
        const commenterName = (req as any).user?.claims?.first_name || "사용자";
        await storage.createNotification({
          userId: (post as any).userId,
          type: "post_comment",
          message: `${commenterName}님이 게시글에 댓글을 남겼습니다`,
          payload: { fromName: commenterName },
          url: `/posts/${postId}`,
        });
        queueActivityEmail((post as any).userId, "post_comment", {
          actorName: commenterName,
          postTitle: (post as any).title ?? "",
          snippet: input.content?.trim(),
          actionPath: `/posts/${postId}`,
        });
      }
      res.status(201).json(comment);
    } catch (err) {
      res.status(400).json({ message: "Invalid input" });
    }
  });

  app.patch("/api/comments/:commentId", isAuthenticated, async (req, res) => {
    // @ts-ignore
    const userId = req.user.claims.sub;
    const commentId = Number(req.params.commentId);
    const { content } = req.body;
    if (typeof content !== "string" || !content.trim()) {
      return res.status(400).json({ message: "내용을 입력해주세요" });
    }
    const success = await storage.updatePostComment(commentId, userId, content.trim());
    if (!success) {
      return res.status(403).json({ message: "수정 권한이 없습니다" });
    }
    res.json({ success: true });
  });

  app.delete("/api/comments/:commentId", isAuthenticated, async (req, res) => {
    // @ts-ignore
    const userId = req.user.claims.sub;
    const commentId = Number(req.params.commentId);
    const success = await storage.deletePostComment(commentId, userId);
    if (!success) {
      return res.status(403).json({ message: "삭제 권한이 없습니다" });
    }
    res.json({ success: true });
  });

  // === User Routes ===
  app.post(api.users.follow.path, isAuthenticated, async (req, res) => {
    try {
      // @ts-ignore
      const followerId = req.user?.claims?.sub;
      const followedId = req.params?.id as string;

      if (!followerId || !followedId) {
        return res.status(400).json({ message: "잘못된 요청입니다." });
      }
      if (followerId === followedId) {
        return res.status(400).json({ message: "자기 자신을 팔로우할 수 없습니다" });
      }

      const following = await storage.toggleFollow(followerId, followedId);

      if (following) {
        // @ts-ignore
        const followerName = req.user.claims.first_name || "사용자";
        await storage.createNotification({
          userId: followedId,
          type: "follow",
          message: `${followerName}님이 팔로우하기 시작했습니다`,
          payload: { fromName: followerName },
          url: `/profile/${followerId}`
        });
        queueActivityEmail(followedId, "follow", {
          actorName: followerName,
          actionPath: `/profile/${followerId}`,
        });
      }

      return res.json({ following });
    } catch (err) {
      console.error("[follow] Error:", err);
      return res.status(500).json({ message: err instanceof Error ? err.message : "팔로우 처리에 실패했습니다." });
    }
  });

  app.get(api.users.getProfile.path, async (req, res) => {
    const userId = req.params.id;
    if (!userId) {
      return res.status(404).json({ message: "프로필을 찾을 수 없습니다." });
    }
    // @ts-ignore
    const currentUserId = req.user?.claims?.sub;

    const user = await storage.getUserById(userId);
    if (!user) {
      return res.status(404).json({ message: "프로필을 찾을 수 없습니다." });
    }

    const [uploadedMusic, likedMusic, followerCount, followingCount, userPlaylists, userPosts, followers, following] = await Promise.all([
      storage.getMusicByUser(userId),
      storage.getLikedMusic(userId),
      storage.getFollowerCount(userId),
      storage.getFollowingCount(userId),
      storage.getPlaylistsByUser(userId),
      storage.getPostsByUser(userId),
      storage.getFollowers(userId),
      storage.getFollowing(userId),
    ]);

    let isFollowing = false;
    if (currentUserId && currentUserId !== userId) {
      isFollowing = await storage.isFollowing(currentUserId, userId);
    }

    res.json({
      user,
      uploadedMusic,
      likedMusic,
      followerCount,
      followingCount,
      playlists: userPlaylists,
      posts: userPosts,
      followers,
      following,
      isFollowing
    });
  });

  app.patch("/api/users/:id/profile", isAuthenticated, async (req, res) => {
    try {
      // @ts-ignore
      const currentUserId = req.user.claims.sub;
      const targetId = req.params.id;
      if (currentUserId !== targetId) {
        return res.status(403).json({ message: "본인 프로필만 수정할 수 있습니다" });
      }
      const { firstName, lastName, profileImageUrl, username } = req.body;
      const updated = await storage.updateUserProfile(targetId, {
        ...(firstName !== undefined && { firstName: String(firstName) }),
        ...(lastName !== undefined && { lastName: String(lastName) }),
        ...(profileImageUrl !== undefined && { profileImageUrl: profileImageUrl ? String(profileImageUrl) : "" }),
        ...(username !== undefined && { username: username ? String(username) : "" }),
        ...(req.body.notifyNewMusicEmail !== undefined && { notifyNewMusicEmail: Boolean(req.body.notifyNewMusicEmail) }),
        ...(req.body.notifyNewMusicPush !== undefined && { notifyNewMusicPush: Boolean(req.body.notifyNewMusicPush) }),
        ...(req.body.notifyActivityEmail !== undefined && { notifyActivityEmail: Boolean(req.body.notifyActivityEmail) }),
      });
      if (!updated) return res.status(404).json({ message: "프로필을 찾을 수 없습니다" });
      res.json(updated);
    } catch (err) {
      console.error("Profile update error:", err);
      res.status(500).json({ message: "프로필 수정에 실패했습니다" });
    }
  });

  // Web Push: VAPID public key (for client to subscribe)
  app.get("/api/push-vapid-public", (_req, res) => {
    const key = process.env.VAPID_PUBLIC_KEY;
    res.json({ publicKey: key || null });
  });

  // Web Push: save subscription for "new music for you" push
  app.post("/api/push-subscribe", isAuthenticated, async (req, res) => {
    try {
      // @ts-ignore
      const userId = req.user.claims.sub;
      const { endpoint, keys } = req.body;
      if (!endpoint || !keys?.p256dh || !keys?.auth) {
        return res.status(400).json({ message: "endpoint and keys.p256dh, keys.auth required" });
      }
      await storage.addPushSubscription(userId, {
        endpoint: String(endpoint),
        p256dh: String(keys.p256dh),
        auth: String(keys.auth),
      });
      res.json({ ok: true });
    } catch (err: any) {
      console.error("Push subscribe error:", err);
      res.status(500).json({ message: "푸시 구독 저장에 실패했습니다" });
    }
  });

  // Delete playlist
  app.delete("/api/playlists/:id", isAuthenticated, async (req, res) => {
    const playlistId = Number(req.params.id);
    const playlist = await storage.getPlaylistById(playlistId);
    // @ts-ignore
    if (!playlist || playlist.userId !== req.user.claims.sub) {
      return res.status(404).json({ message: "플레이리스트를 찾을 수 없습니다" });
    }
    await storage.deletePlaylist(playlistId);
    res.json({ success: true });
  });

  // Remove music from playlist
  app.delete("/api/playlists/:id/music/:musicId", isAuthenticated, async (req, res) => {
    const playlistId = Number(req.params.id);
    const musicId = Number(req.params.musicId);
    const playlist = await storage.getPlaylistById(playlistId);
    // @ts-ignore
    if (!playlist || playlist.userId !== req.user.claims.sub) {
      return res.status(404).json({ message: "플레이리스트를 찾을 수 없습니다" });
    }
    await storage.removeMusicFromPlaylist(playlistId, musicId);
    res.json({ success: true });
  });

  // Mark all notifications as read
  app.patch("/api/notifications/read-all", isAuthenticated, async (req, res) => {
    // @ts-ignore
    const userId = req.user.claims.sub;
    await storage.markAllNotificationsRead(userId);
    res.json({ success: true });
  });

  // === Notification Routes ===
  app.get(api.notifications.list.path, isAuthenticated, async (req, res) => {
    // @ts-ignore
    const userId = req.user.claims.sub;
    const notifs = await storage.getNotifications(userId);
    const serialized = notifs.map((n: any) => ({
      ...n,
      createdAt: n.createdAt instanceof Date ? n.createdAt.toISOString() : n.createdAt,
    }));
    res.json(serialized);
  });

  app.patch(api.notifications.markRead.path, isAuthenticated, async (req, res) => {
    const id = Number(req.params.id);
    await storage.markNotificationRead(id);
    res.json({ success: true });
  });

  app.delete("/api/notifications/:id", isAuthenticated, async (req, res) => {
    const id = Number(req.params.id);
    // @ts-ignore
    const userId = req.user.claims.sub;
    const deleted = await storage.deleteNotification(id, userId);
    if (!deleted) return res.status(404).json({ message: "알림을 찾을 수 없습니다." });
    res.json({ success: true });
  });

  // === Analytics (public: 방문 기록) ===
  /** PC/모바일/태블릿. Sec-CH-UA-Mobile(크롬·엣지 등) 우선, 없으면 User-Agent 휴리스틱 */
  function getDeviceTypeFromRequest(req: Request): string {
    const uaRaw = req.headers["user-agent"];
    const uaStr = typeof uaRaw === "string" ? uaRaw : "";
    const u = uaStr.toLowerCase();

    const platformHint = String(req.headers["sec-ch-ua-platform"] ?? "")
      .replace(/"/g, "")
      .trim()
      .toLowerCase();

    // iPadOS "데스크톱용 웹사이트 요청": UA는 Macintosh처럼 보이지만 플랫폼 힌트는 iOS → PC로 오분류 방지
    if (uaStr && /macintosh/i.test(uaStr) && platformHint.includes("ios")) {
      return "tablet";
    }

    const ch = String(req.headers["sec-ch-ua-mobile"] ?? "")
      .trim()
      .replace(/^["']|["']$/g, "");
    if (ch === "?0") return "desktop";
    if (ch === "?1") return "mobile";

    if (!uaStr) return "unknown";

    if (/ipad|ipados/i.test(uaStr) || /tablet(?! pc)/i.test(u) || /playbook|silk|kindle\b|nexus 7|nexus 9|sm-t[0-9]{2,}|gt-(p|n)[0-9]/i.test(u)) {
      return "tablet";
    }
    if (/iphone|ipod|windows phone|iemobile|blackberry|bb10|webos/i.test(u)) return "mobile";
    if (/android/i.test(u)) {
      if (/\bmobile\b|\bmobi\b/i.test(u)) return "mobile";
      return "tablet";
    }
    if (/\bopera mini\b/i.test(u)) return "mobile";
    if (/\bmobile\b/i.test(u)) return "mobile";
    return "desktop";
  }
  function refererDomain(referer: string | undefined): string | null {
    if (!referer) return null;
    try {
      const u = new URL(referer);
      return u.hostname || null;
    } catch {
      return null;
    }
  }

  /** analytics 방문자 키 — localStorage 없는 모바일/사설 모드에서 매 요청마다 새 UUID가 되던 문제 완화 */
  const VISITOR_KEY_COOKIE = "vs_vkey";
  const VISITOR_KEY_COOKIE_MAX_AGE_SEC = 365 * 24 * 60 * 60;
  const UUID_V4_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

  function readCookie(req: Request, name: string): string | null {
    const raw = req.headers.cookie;
    if (!raw || typeof raw !== "string") return null;
    const parts = raw.split(";").map((s) => s.trim());
    const prefix = `${name}=`;
    for (const p of parts) {
      if (p.startsWith(prefix)) {
        try {
          return decodeURIComponent(p.slice(prefix.length));
        } catch {
          return p.slice(prefix.length);
        }
      }
    }
    return null;
  }

  function appendVisitorKeyCookie(res: Response, visitorKey: string) {
    const isProd = process.env.NODE_ENV === "production";
    const enc = encodeURIComponent(visitorKey);
    const bits = [
      `${VISITOR_KEY_COOKIE}=${enc}`,
      "Path=/",
      `Max-Age=${VISITOR_KEY_COOKIE_MAX_AGE_SEC}`,
      "SameSite=Lax",
      "HttpOnly",
    ];
    if (isProd) bits.push("Secure");
    res.append("Set-Cookie", bits.join("; "));
  }

  /** Passport 세션에서 사용자 ID 추출 (전략·세션 저장 형태·req._userProperty 대비) */
  function getVisitorSessionUserId(req: Request): string | undefined {
    const r = req as Request & {
      user?: unknown;
      _userProperty?: string;
      session?: { passport?: { user?: unknown } };
    };
    const pick = (u: unknown): string | undefined => {
      if (typeof u === "string" && u.trim().length > 0) return u.trim();
      if (u && typeof u === "object") {
        const o = u as { claims?: { sub?: unknown }; id?: unknown };
        const sub = o.claims?.sub;
        if (sub != null && String(sub).trim().length > 0) return String(sub).trim();
        if (typeof o.id === "string" && o.id.length > 0) return o.id;
        if (typeof o.id === "number" && Number.isFinite(o.id)) return String(o.id);
      }
      return undefined;
    };
    const prop = typeof r._userProperty === "string" && r._userProperty.trim() ? r._userProperty.trim() : "user";
    const fromProp = pick((r as unknown as Record<string, unknown>)[prop]);
    if (fromProp) return fromProp;
    const fromUser = pick(r.user);
    if (fromUser) return fromUser;
    return pick(r.session?.passport?.user);
  }

  /** POST/GET 공통. 모바일에서 POST fetch 가 실패할 때 GET(쿠키 동일) 폴백용 */
  async function recordAnalyticsVisitCore(
    req: Request,
    res: Response,
    pathRaw: string,
    visitorKeyIn: string | null,
    utmSource: string | undefined
  ): Promise<string> {
    const path = typeof pathRaw === "string" && pathRaw.trim() ? pathRaw.trim() : "/";
    const fromClient =
      typeof visitorKeyIn === "string" && visitorKeyIn.trim().length > 0 ? visitorKeyIn.trim() : null;
    const fromClientOk = fromClient && UUID_V4_RE.test(fromClient) ? fromClient : null;
    const fromCookieRaw = readCookie(req, VISITOR_KEY_COOKIE);
    const fromCookieOk = fromCookieRaw && UUID_V4_RE.test(fromCookieRaw) ? fromCookieRaw : null;
    const visitorKey = fromClientOk ?? fromCookieOk ?? crypto.randomUUID();
    appendVisitorKeyCookie(res, visitorKey);
    const ip = getClientIpForGeo(req);
    const ipHash = ip ? crypto.createHash("sha256").update(ip).digest("hex").slice(0, 16) : undefined;
    const deviceType = getDeviceTypeFromRequest(req);
    const refererDomainVal = refererDomain(req.headers["referer"]);
    let countryCode: string | undefined;
    let region: string | undefined;
    if (ip && !/^127\.|^10\.|^172\.(1[6-9]|2[0-9]|3[01])\.|^192\.168\.|^::1$|^fc00:/i.test(ip)) {
      try {
        const geo = geoip.lookup(ip);
        if (geo) {
          countryCode = geo.country ?? undefined;
          region = geo.region ?? undefined;
        }
      } catch (_) {}
    }
    const sessionUserId = getVisitorSessionUserId(req);
    try {
      await storage.recordVisit(visitorKey, path, {
        userId: sessionUserId,
        ipHash,
        deviceType,
        refererDomain: refererDomainVal ?? undefined,
        utmSource,
        countryCode,
        region,
      });
    } catch (e) {
      console.error("[analytics/visit] recordVisit failed (table may be missing – run db:push):", e);
    }
    return visitorKey;
  }

  app.post("/api/analytics/visit", async (req, res) => {
    const path = typeof req.body?.path === "string" && req.body.path.trim() ? req.body.path.trim() : "/";
    const visitorKeyBody =
      typeof req.body?.visitorKey === "string" && req.body.visitorKey.trim().length > 0
        ? req.body.visitorKey.trim()
        : null;
    const utmSource =
      typeof req.body?.utmSource === "string"
        ? req.body.utmSource
        : typeof req.query?.utm_source === "string"
          ? req.query.utm_source
          : undefined;
    const visitorKey = await recordAnalyticsVisitCore(req, res, path, visitorKeyBody, utmSource);
    res.json({ ok: true, visitorKey });
  });

  /**
   * 모바일 WebKit 등에서 JSON POST 가 막히는 경우 대비. 세션 쿠키는 GET 에도 붙는 경우가 많음.
   * (CSRF 관점에서 이상적이지 않으나 공개 방문 집계 전용)
   */
  app.get("/api/analytics/visit", async (req, res) => {
    const path =
      typeof req.query.path === "string" && req.query.path.trim().length > 0 ? req.query.path.trim() : "/";
    const visitorKeyQ =
      typeof req.query.visitorKey === "string" && req.query.visitorKey.trim().length > 0
        ? req.query.visitorKey.trim()
        : null;
    const utmSource =
      typeof req.query.utmSource === "string"
        ? req.query.utmSource
        : typeof req.query.utm_source === "string"
          ? req.query.utm_source
          : undefined;
    const visitorKey = await recordAnalyticsVisitCore(req, res, path, visitorKeyQ, utmSource);
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
    res.setHeader("Pragma", "no-cache");
    res.json({ ok: true, visitorKey });
  });

  function sanitizeConversionMeta(raw: unknown): Record<string, unknown> | null {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
    const o = raw as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    let n = 0;
    for (const [k, v] of Object.entries(o)) {
      if (n >= 10) break;
      if (!/^[a-z][a-z0-9_]{0,31}$/.test(k)) continue;
      if (typeof v === "string" && v.length <= 120) {
        out[k] = v.slice(0, 120);
        n++;
      } else if (typeof v === "number" && Number.isFinite(v) && Math.abs(v) < 1e12) {
        out[k] = v;
        n++;
      } else if (typeof v === "boolean") {
        out[k] = v;
        n++;
      }
    }
    return Object.keys(out).length ? out : null;
  }

  function resolveAnalyticsVisitorKey(req: Request, res: Response, visitorKeyIn: string | null): string {
    const fromClient =
      typeof visitorKeyIn === "string" && visitorKeyIn.trim().length > 0 ? visitorKeyIn.trim() : null;
    const fromClientOk = fromClient && UUID_V4_RE.test(fromClient) ? fromClient : null;
    const fromCookieRaw = readCookie(req, VISITOR_KEY_COOKIE);
    const fromCookieOk = fromCookieRaw && UUID_V4_RE.test(fromCookieRaw) ? fromCookieRaw : null;
    const visitorKey = fromClientOk ?? fromCookieOk ?? crypto.randomUUID();
    appendVisitorKeyCookie(res, visitorKey);
    return visitorKey;
  }

  /** 가입 퍼널 등 (클라이언트 이벤트 — 재생·세션 로직과 무관) */
  app.post("/api/analytics/conversion", async (req, res) => {
    const eventName =
      typeof req.body?.event === "string" && req.body.event.trim().length > 0 ? req.body.event.trim() : "";
    if (!isAllowedSignupConversionEvent(eventName)) {
      return res.status(400).json({ ok: false, error: "invalid_event" });
    }
    const vkIn =
      typeof req.body?.visitorKey === "string" && req.body.visitorKey.trim().length > 0
        ? req.body.visitorKey.trim()
        : null;
    const visitorKey = resolveAnalyticsVisitorKey(req, res, vkIn);
    const meta = sanitizeConversionMeta(req.body?.meta);
    try {
      await storage.recordConversionEvent(visitorKey, eventName, meta);
    } catch (e) {
      console.error("[analytics/conversion] record failed:", e);
    }
    res.json({ ok: true, visitorKey });
  });

  // === Admin Middleware ===
  const isAdmin = async (req: any, res: any, next: any) => {
    if (!req.user?.claims?.sub) {
      return res.status(401).json({ message: "로그인이 필요합니다" });
    }
    const role = await storage.getUserRole(req.user.claims.sub);
    if (role !== "admin") {
      return res.status(403).json({ message: "관리자 권한이 필요합니다" });
    }
    next();
  };

  // === Distribution (platform-managed global release) ===
  app.post("/api/distribution/releases", isAuthenticated, async (req, res) => {
    try {
      // @ts-ignore
      const ownerUserId = req.user.claims.sub as string;
      const musicId = Number(req.body?.musicId);
      const releaseTitle = String(req.body?.releaseTitle ?? "").trim();
      const artistName = String(req.body?.artistName ?? "").trim();
      const rightsConfirmed = Boolean(req.body?.rightsConfirmed);
      const releaseDateRaw = req.body?.releaseDate;
      const releaseDate = releaseDateRaw ? new Date(releaseDateRaw) : null;
      if (!musicId || !releaseTitle || !artistName) {
        return res.status(400).json({ message: "musicId, releaseTitle, artistName은 필수입니다." });
      }
      if (!rightsConfirmed) {
        return res.status(400).json({ message: "권리 확인 동의가 필요합니다." });
      }
      const m = await storage.getMusicById(musicId);
      if (!m) return res.status(404).json({ message: "음원을 찾을 수 없습니다." });
      if (m.userId !== ownerUserId) return res.status(403).json({ message: "본인 음원만 유통 신청할 수 있습니다." });
      const row = await storage.createDistributionRelease({
        ownerUserId,
        musicId,
        releaseTitle,
        artistName,
        rightsConfirmed,
        releaseDate: releaseDate && !isNaN(releaseDate.getTime()) ? releaseDate : null,
      });
      res.status(201).json(row);
    } catch (e: any) {
      console.error("[distribution/releases POST]", e);
      res.status(500).json({ message: e?.message ?? "유통 신청 초안 생성에 실패했습니다." });
    }
  });

  app.get("/api/distribution/releases/my", isAuthenticated, async (req, res) => {
    try {
      // @ts-ignore
      const ownerUserId = req.user.claims.sub as string;
      const rows = await storage.listMyDistributionReleases(ownerUserId);
      res.json(rows);
    } catch (e: any) {
      console.error("[distribution/releases/my GET]", e);
      res.status(500).json({ message: e?.message ?? "내 유통 목록을 불러올 수 없습니다." });
    }
  });

  app.get("/api/distribution/music/my", isAuthenticated, async (req, res) => {
    try {
      // @ts-ignore
      const ownerUserId = req.user.claims.sub as string;
      const rows = await storage.getMusicByUser(ownerUserId);
      res.json(rows.map((m) => ({
        id: m.id,
        title: m.title,
        artist: m.artist,
      })));
    } catch (e: any) {
      console.error("[distribution/music/my GET]", e);
      res.status(500).json({ message: e?.message ?? "내 음원 목록을 불러올 수 없습니다." });
    }
  });

  app.post("/api/distribution/releases/:id/submit", isAuthenticated, async (req, res) => {
    try {
      // @ts-ignore
      const ownerUserId = req.user.claims.sub as string;
      const releaseId = Number(req.params.id);
      if (!releaseId) return res.status(400).json({ message: "유효한 release id가 필요합니다." });
      await storage.submitDistributionRelease(ownerUserId, releaseId);
      res.json({ success: true });
    } catch (e: any) {
      const msg = String(e?.message ?? "");
      const status = msg.includes("not found") ? 404 : msg.includes("cannot") || msg.includes("rights") ? 400 : 500;
      console.error("[distribution/releases/:id/submit POST]", e);
      res.status(status).json({ message: e?.message ?? "유통 신청 제출에 실패했습니다." });
    }
  });

  app.get("/api/distribution/balance", isAuthenticated, async (req, res) => {
    try {
      // @ts-ignore
      const userId = req.user.claims.sub as string;
      const summary = await storage.getDistributionBalanceSummary(userId);
      res.json(summary);
    } catch (e: any) {
      console.error("[distribution/balance GET]", e);
      res.status(500).json({ message: e?.message ?? "유통 정산 요약을 불러올 수 없습니다." });
    }
  });

  // === Distribution package export (metadata.json + metadata.csv + zip) ===
  app.get("/api/distribution/releases/:id/package-download", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const releaseId = parsePositiveIntParam(String(req.params.id ?? ""));
      if (!releaseId) return res.status(400).json({ message: "유효한 release id가 필요합니다." });

      const distributorRaw = typeof req.query?.distributor === "string" ? req.query.distributor : "generic";
      const distributor = distributorRaw.trim().toLowerCase();
      const allowed = new Set(["distrokid", "tuneCore".toLowerCase(), "cdbaby", "ditto", "onerpm", "generic"]);
      const distributorFinal = allowed.has(distributor) ? distributor : "generic";

      const adminReleases = await storage.listAdminDistributionReleases();
      const release = adminReleases.find((r: any) => r.id === releaseId);
      if (!release) return res.status(404).json({ message: "유통 신청을 찾을 수 없습니다." });

      // 기존 호환: approved면 그대로 허용
      // 새 규칙: QC 통과(qcStatus=passed)면 delivered/live에서도 허용
      if (release.status !== "approved" && release.qcStatus !== "passed") {
        return res.status(400).json({ message: "QC 통과 또는 승인된 릴리즈만 유통 패키지를 다운로드할 수 있습니다." });
      }

      const music = await storage.getMusicById(release.musicId);
      if (!music) return res.status(404).json({ message: "음원을 찾을 수 없습니다." });

      function resolveLocalAudioPath(fileRef: string): string | null {
        const fn = fileRef || "";
        if (/^https?:\/\//i.test(fn)) return null;

        let fileId = "";
        const objMatch = fn.match(/\/objects\/uploads\/(.+)$/);
        if (objMatch) {
          fileId = objMatch[1];
        } else if (fn.startsWith("uploads/")) {
          fileId = fn.replace(/^uploads\//, "");
        } else if (/^[a-f0-9-]{36}(\.[a-z]+)?$/i.test(fn.trim())) {
          fileId = fn.trim();
        } else if (fn.includes("/")) {
          fileId = fn.split("/").pop() || "";
        } else {
          fileId = fn;
        }

        fileId = fileId.replace(/^\//, "");
        if (!fileId) return null;

        const baseId = fileId.replace(/\.(mp3|wav|ogg)$/i, "");
        const candidates = [
          path.join(uploadsDir, fileId),
          path.join(uploadsDir, `${baseId}.mp3`),
          path.join(uploadsDir, `${baseId}.wav`),
          path.join(uploadsDir, `${baseId}.ogg`),
        ];
        return candidates.find((p) => existsSync(p)) ?? null;
      }

      function resolveLocalCoverPath(imageRef: string | null | undefined): { path: string; ext: string } | null {
        if (!imageRef) return null;
        const fn = imageRef || "";
        if (/^https?:\/\//i.test(fn)) return null;

        let fileId = "";
        const objMatch = fn.match(/\/objects\/uploads\/(.+)$/);
        if (objMatch) {
          fileId = objMatch[1];
        } else if (fn.startsWith("uploads/")) {
          fileId = fn.replace(/^uploads\//, "");
        } else if (/^[a-f0-9-]{36}(\.[a-z]+)?$/i.test(fn.trim())) {
          fileId = fn.trim();
        } else if (fn.includes("/")) {
          fileId = fn.split("/").pop() || "";
        } else {
          fileId = fn;
        }

        fileId = fileId.replace(/^\//, "");
        if (!fileId) return null;

        const baseId = fileId.replace(/\.(png|jpe?g|webp|gif|avif)$/i, "");
        const candidates = [
          { p: path.join(uploadsDir, `${baseId}.jpg`), ext: ".jpg" },
          { p: path.join(uploadsDir, `${baseId}.jpeg`), ext: ".jpeg" },
          { p: path.join(uploadsDir, `${baseId}.png`), ext: ".png" },
          { p: path.join(uploadsDir, `${baseId}.webp`), ext: ".webp" },
          { p: path.join(uploadsDir, `${baseId}.gif`), ext: ".gif" },
          { p: path.join(uploadsDir, `${baseId}.avif`), ext: ".avif" },
          { p: path.join(uploadsDir, fileId), ext: path.extname(fileId).toLowerCase() || ".jpg" },
        ];
        const found = candidates.find((c) => existsSync(c.p));
        if (!found) return null;
        return { path: found.p, ext: found.ext };
      }

      const localAudioPath = resolveLocalAudioPath(music.filename);
      let localCover = resolveLocalCoverPath(music.imageFilename);
      // QC용으로 통과시킬 뿐 아니라 zip에 실제 커버를 넣기 위해 원격 cover URL이면 다운로드를 시도합니다.
      if (!localCover && music.imageFilename && /^https?:\/\//i.test(String(music.imageFilename))) {
        try {
          const coverUrl = String(music.imageFilename);
          const u = new URL(coverUrl);
          const extCandidate = path.extname(u.pathname).toLowerCase();
          const ext =
            [".jpg", ".jpeg", ".png", ".webp"].includes(extCandidate) ? extCandidate : ".jpg";
          const targetPath = path.join(uploadsDir, `remote_cover_${releaseId}${ext}`);
          const response = await fetch(coverUrl);
          if (response.ok) {
            const arrayBuffer = await response.arrayBuffer();
            writeFileSync(targetPath, Buffer.from(arrayBuffer));
            localCover = { path: targetPath, ext };
          }
        } catch (e) {
          // ignore: QC에서는 원격 커버도 통과시키지만, 다운로드 실패 시 템플릿에서 placeholder를 넣습니다.
        }
      }

      const releaseDate = release.releaseDate ? new Date(release.releaseDate) : null;
      const releaseDateStr = releaseDate && !isNaN(releaseDate.getTime()) ? releaseDate.toISOString().slice(0, 10) : "";

      const metadataJson = {
        distributor: distributorFinal,
        release: {
          title: release.releaseTitle,
          artist: release.artistName,
          releaseDate: releaseDateStr || null,
          genre: music.genre ?? null,
          tags: music.tags ?? null,
        },
        track: {
          title: music.title,
          artist: music.artist,
          isrc: null,
        },
        audio: {
          included: !!localAudioPath,
          originalRef: music.filename,
          includedFileName: localAudioPath ? `track.${path.extname(localAudioPath).replace(".", "")}` : "track.wav",
        },
        artwork: {
          included: !!localCover,
          originalRef: music.imageFilename ?? null,
          includedFileName: localCover
            ? localCover.ext.toLowerCase().replace(".", "") === "jpg" || localCover.ext.toLowerCase() === ".jpeg"
              ? "cover.jpg"
              : `cover${localCover.ext.toLowerCase()}`
            : "cover.jpg",
        },
        credits: {
          composer: null,
          lyricist: null,
          performer: null,
          masterOwner: null,
        },
        note: "This is a platform-export template for distributor submission. Add/replace missing ISRC/credits/proof details as required by each distributor.",
      };

      // Generic CSV template (starter)
      const metadataCsv = [
        [
          "Title",
          "Artist",
          "Genre",
          "Release Date",
          "ISRC",
          "Composer",
          "Lyricist",
          "Performer",
          "Master Owner",
          "Artwork File",
          "Audio File",
          "Distributor",
        ].join(","),
        [
          JSON.stringify(metadataJson.track.title),
          JSON.stringify(metadataJson.track.artist),
          JSON.stringify(metadataJson.release.genre ?? ""),
          JSON.stringify(metadataJson.release.releaseDate ?? ""),
          JSON.stringify(metadataJson.track.isrc ?? ""),
          JSON.stringify(metadataJson.credits.composer ?? ""),
          JSON.stringify(metadataJson.credits.lyricist ?? ""),
          JSON.stringify(metadataJson.credits.performer ?? ""),
          JSON.stringify(metadataJson.credits.masterOwner ?? ""),
          JSON.stringify(metadataJson.artwork.includedFileName),
          JSON.stringify(metadataJson.audio.includedFileName),
          JSON.stringify(distributorFinal),
        ].join(","),
      ].join("\n");

      const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
      const filename = `venysound_distribution_${releaseId}_${timestamp}.zip`;

      res.setHeader("Content-Type", "application/zip");
      res.setHeader("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`);

      const archive = archiver("zip", { zlib: { level: 6 } });
      archive.on("error", (err: any) => {
        console.error("Distribution package archive error:", err);
        if (!res.headersSent) res.status(500).end();
      });
      archive.pipe(res);

      archive.append(JSON.stringify(metadataJson, null, 2), { name: "metadata.json" });
      archive.append(metadataCsv, { name: "metadata.csv" });

      // Artwork
      if (localCover) {
        const lc = localCover.ext.toLowerCase();
        const coverEntryName = lc === ".jpg" || lc === ".jpeg" ? "cover.jpg" : `cover${lc}`;
        archive.file(localCover.path, { name: coverEntryName });
      } else {
        archive.append("cover.jpg not found on server. Please add cover art manually if your distributor requires it.", { name: "cover.jpg" });
      }

      // Track
      if (localAudioPath) {
        const ext = path.extname(localAudioPath).toLowerCase(); // .mp3/.wav/.ogg
        const audioEntryName = ext ? `track${ext}` : "track.wav";
        archive.file(localAudioPath, { name: audioEntryName.replace(/^\./, ".") });

        if (ext !== ".wav") {
          archive.append(
            "WAV export is not available in this template build. Add/convert WAV/FLAC master files manually if required by your distributor.",
            { name: "track.wav" }
          );
        }
      } else {
        archive.append("track.wav not found on server. Please add master audio files manually.", { name: "track.wav" });
      }

      archive.finalize();
    } catch (e: any) {
      console.error("[distribution package-download GET]", e);
      res.status(500).json({ message: e?.message ?? "유통 패키지 생성에 실패했습니다." });
    }
  });

  // === Admin Routes ===
  app.get("/api/admin/visitor-count", isAuthenticated, isAdmin, (_req, res) => {
    res.json({ count: visitorCount });
  });

  app.get("/api/admin/current-visitors", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const minutes = Math.min(60, Math.max(1, parseInt(String(req.query?.minutes), 10) || 15));
      const detail = await storage.getCurrentVisitorsDetail(minutes);
      res.json({ count: detail.count, visitors: detail.visitors });
    } catch (e) {
      console.error("[admin/current-visitors]", e);
      res.json({ count: 0, visitors: [] });
    }
  });

  app.get("/api/admin/stats", isAuthenticated, isAdmin, async (req, res) => {
    const stats = await storage.getAdminStats();
    res.json(stats);
  });

  app.get("/api/admin/analytics", isAuthenticated, isAdmin, async (_req, res) => {
    try {
      const analytics = await storage.getAdminAnalytics();
      res.json(analytics);
    } catch (e) {
      console.error("[admin/analytics]", e);
      res.json({ dailyVisitors: 0, totalVisitors: 0, pageViewsToday: 0, pageViewsTotal: 0 });
    }
  });

  app.get("/api/admin/analytics/status", isAuthenticated, isAdmin, async (_req, res) => {
    try {
      const tableExists = await storage.checkAnalyticsTableExists();
      res.json({ tableExists });
    } catch (e) {
      console.error("[admin/analytics/status]", e);
      res.json({ tableExists: false });
    }
  });

  app.get("/api/admin/credits-charged", isAuthenticated, isAdmin, async (_req, res) => {
    try {
      const total = await storage.getTotalCreditsCharged();
      res.json({ totalCreditsCharged: total });
    } catch (e) {
      console.error("[admin/credits-charged]", e);
      res.json({ totalCreditsCharged: 0 });
    }
  });

  /** payments 기준 매출(구독·크레딧 충전 원화). period=all | month | days&days=N */
  app.get("/api/admin/revenue-summary", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const parsed = parseAdminRevenueRangeQuery({
        period: typeof req.query.period === "string" ? req.query.period : "all",
        days: typeof req.query.days === "string" ? req.query.days : "",
      });
      if (!parsed.ok) return res.status(400).json({ message: parsed.error });
      let filters: { start?: Date; endExclusive?: Date; endInclusive?: Date } | undefined;
      if (parsed.start != null && parsed.endExclusive != null) {
        filters = { start: parsed.start, endExclusive: parsed.endExclusive };
      } else if (parsed.start != null && parsed.endInclusive != null) {
        filters = { start: parsed.start, endInclusive: parsed.endInclusive };
      }
      const summary = await storage.getAdminRevenueSummary(filters);
      res.json({ rangeLabel: parsed.label, ...summary });
    } catch (e) {
      console.error("[admin/revenue-summary]", e);
      res.status(500).json({ message: "매출 요약을 불러오지 못했습니다." });
    }
  });

  /** 결제 완료 건 목록(회원 식별). period=all | month | days, kind=all|subscription|credit, limit&offset */
  app.get("/api/admin/revenue-payments", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const parsed = parseAdminRevenueRangeQuery({
        period: typeof req.query.period === "string" ? req.query.period : "all",
        days: typeof req.query.days === "string" ? req.query.days : "",
      });
      if (!parsed.ok) return res.status(400).json({ message: parsed.error });
      let dateFilters: { start?: Date; endExclusive?: Date; endInclusive?: Date } | undefined;
      if (parsed.start != null && parsed.endExclusive != null) {
        dateFilters = { start: parsed.start, endExclusive: parsed.endExclusive };
      } else if (parsed.start != null && parsed.endInclusive != null) {
        dateFilters = { start: parsed.start, endInclusive: parsed.endInclusive };
      }
      const kindRaw = typeof req.query.kind === "string" ? req.query.kind.toLowerCase() : "all";
      const kind = kindRaw === "subscription" || kindRaw === "credit" ? kindRaw : "all";
      const limit = Math.min(200, Math.max(1, parseInt(String(req.query.limit ?? "50"), 10) || 50));
      const offset = Math.max(0, parseInt(String(req.query.offset ?? "0"), 10) || 0);
      const result = await storage.listAdminRevenuePayments({ dateFilters, kind, limit, offset });
      res.json({
        rangeLabel: parsed.label,
        kind,
        limit,
        offset,
        total: result.total,
        rows: result.rows.map((r) => ({
          ...r,
          createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : String(r.createdAt),
        })),
      });
    } catch (e) {
      console.error("[admin/revenue-payments]", e);
      res.status(500).json({ message: "결제 목록을 불러오지 못했습니다." });
    }
  });

  app.get("/api/admin/stats/regions", isAuthenticated, isAdmin, async (_req, res) => {
    try {
      const rows = await storage.getAdminStatsByRegion();
      res.json(rows);
    } catch (e) {
      console.error("[admin/stats/regions]", e);
      res.json([]);
    }
  });

  app.get("/api/admin/stats/devices", isAuthenticated, isAdmin, async (_req, res) => {
    try {
      const rows = await storage.getAdminStatsByDevice();
      res.json(rows);
    } catch (e) {
      console.error("[admin/stats/devices]", e);
      res.json([]);
    }
  });

  app.get("/api/admin/stats/sources", isAuthenticated, isAdmin, async (_req, res) => {
    try {
      const rows = await storage.getAdminStatsBySource();
      res.json(rows);
    } catch (e) {
      console.error("[admin/stats/sources]", e);
      res.json([]);
    }
  });

  app.get("/api/admin/analytics/trend", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const days = Math.min(90, Math.max(1, parseInt(String(req.query.days), 10) || 7));
      const rows = await storage.getAdminAnalyticsTrend(days);
      res.json(rows);
    } catch (e) {
      console.error("[admin/analytics/trend]", e);
      res.json([]);
    }
  });

  app.get("/api/admin/analytics/signup-funnel", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const days = Math.min(90, Math.max(1, parseInt(String(req.query.days), 10) || 7));
      const tableExists = await storage.checkConversionEventsTableExists();
      const counts = tableExists ? await storage.getAdminSignupFunnelCounts(days) : [];
      res.json({ days, tableExists, counts });
    } catch (e) {
      console.error("[admin/analytics/signup-funnel]", e);
      res.json({ days: 7, tableExists: false, counts: [] });
    }
  });

  /** 일자(Asia/Seoul)별 방문자 요약: 첫·마지막 페이지뷰, 간격(체류 추정), 페이지뷰 수 */
  app.get("/api/admin/visitor-sessions", isAuthenticated, isAdmin, async (req, res) => {
    const dateStr = typeof req.query.date === "string" ? req.query.date.trim() : "";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
      return res.status(400).json({ message: "date=YYYY-MM-DD 형식이 필요합니다." });
    }
    const limit = Math.min(200, Math.max(1, parseInt(String(req.query.limit), 10) || 50));
    const offset = Math.max(0, parseInt(String(req.query.offset), 10) || 0);
    try {
      const { rows, total } = await storage.getAdminVisitorSessionsByDate(dateStr, limit, offset);
      res.json({
        total,
        date: dateStr,
        rows: rows.map((r) => ({
          userId: r.userId,
          visitorKey: r.visitorKey,
          firstAt: r.firstAt instanceof Date ? r.firstAt.toISOString() : String(r.firstAt),
          lastAt: r.lastAt instanceof Date ? r.lastAt.toISOString() : String(r.lastAt),
          durationSeconds: r.durationSeconds,
          pageViews: r.pageViews,
          countryCode: r.countryCode,
          region: r.region,
          email: r.email,
          username: r.username,
          firstName: r.firstName,
          lastName: r.lastName,
          subscriptionTier: r.subscriptionTier,
        })),
      });
    } catch (e) {
      console.error("[admin/visitor-sessions]", e);
      res.status(500).json({ message: "조회에 실패했습니다." });
    }
  });

  /** 로그인한 회원의 페이지 이동 기록 (회원 ID = users.id, 세션과 동일) */
  app.get("/api/admin/access-logs", isAuthenticated, isAdmin, async (req, res) => {
    const userId = typeof req.query.userId === "string" ? req.query.userId.trim() : "";
    if (!userId) {
      return res.status(400).json({ message: "userId가 필요합니다." });
    }
    const limit = Math.min(200, Math.max(1, parseInt(String(req.query.limit), 10) || 50));
    const offset = Math.max(0, parseInt(String(req.query.offset), 10) || 0);
    try {
      const { logs, total } = await storage.getAdminUserAccessLogs(userId, limit, offset);
      res.json({
        total,
        logs: logs.map((row) => ({
          id: row.id,
          path: row.path,
          deviceType: row.deviceType,
          visitedAt: row.visitedAt instanceof Date ? row.visitedAt.toISOString() : String(row.visitedAt),
        })),
      });
    } catch (e) {
      console.error("[admin/access-logs]", e);
      res.status(500).json({ message: "조회에 실패했습니다." });
    }
  });

  // 사이트 공지 팝업 (메인 접속 시 노출) — 공개 API. 쿼리 lang=en|ja|zh|ko 에 따라 번역된 내용 반환
  app.get("/api/announcement/active", async (req, res) => {
    try {
      const lang = (req.query.lang as string)?.toLowerCase()?.replace(/-.*$/, "").slice(0, 2) || undefined;
      const announcement = await storage.getActiveSiteAnnouncement(lang);
      if (!announcement) return res.json(null);
      res.json({
        id: announcement.id,
        content: announcement.content,
        imageUrl: announcement.imageUrl ?? null,
        textSize: announcement.textSize ?? "md",
        startsAt: announcement.startsAt.toISOString(),
        endsAt: announcement.endsAt.toISOString(),
      });
    } catch (e) {
      console.error("[announcement/active]", e);
      res.json(null);
    }
  });

  // 사이트 공지 리스트 (공개용) — 최신순 최대 50개 (`lang`: content_translations 우선)
  app.get("/api/announcements/site", async (req, res) => {
    try {
      const rawLang = typeof req.query.lang === "string" ? req.query.lang.trim().split("-")[0].toLowerCase() : "";
      const lang = /^[a-z]{2}$/.test(rawLang) ? rawLang : undefined;
      const list = await storage.getSiteAnnouncements(lang);
      res.json(
        list.map((a) => ({
          id: a.id,
          content: a.content,
          imageUrl: a.imageUrl ?? null,
          showAsPopup: (a as any).showAsPopup !== false,
          viewCount: (a as any).viewCount ?? 0,
          startsAt: a.startsAt.toISOString(),
          endsAt: a.endsAt.toISOString(),
          createdAt: a.createdAt.toISOString(),
        }))
      );
    } catch (e) {
      console.error("[announcements/site]", e);
      res.json([]);
    }
  });

  // 공지 조회 시 조회수 증가 (공개)
  app.post("/api/announcements/site/:id/view", async (req, res) => {
    try {
      const id = parseInt(req.params.id, 10);
      if (!Number.isFinite(id)) return res.status(400).json({ message: "Invalid id" });
      const viewCount = await storage.incrementSiteAnnouncementViewCount(id);
      res.json({ viewCount });
    } catch (e) {
      console.error("[announcements/site view]", e);
      res.status(500).json({ message: "Failed to record view" });
    }
  });

  // 동영상 가이드 (공개용)
  app.get("/api/guide-videos", async (_req, res) => {
    try {
      const list = await storage.getGuideVideos();
      res.json(
        list.map((v) => ({
          id: v.id,
          title: v.title,
          description: v.description,
          youtubeUrl: v.youtubeUrl,
          sortOrder: v.sortOrder,
          createdAt: v.createdAt.toISOString(),
          updatedAt: v.updatedAt.toISOString(),
        }))
      );
    } catch (e) {
      console.error("[guide-videos]", e);
      res.json([]);
    }
  });

  app.get("/api/admin/site-announcements", isAuthenticated, isAdmin, async (_req, res) => {
    try {
      const list = await storage.getSiteAnnouncements();
      res.json(list.map((a) => ({ ...a, startsAt: a.startsAt.toISOString(), endsAt: a.endsAt.toISOString(), createdAt: a.createdAt.toISOString() })));
    } catch (e) {
      console.error("[admin/site-announcements]", e);
      res.json([]);
    }
  });

  app.post("/api/admin/site-announcements", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const { content, imageUrl, textSize, showAsPopup, startsAt, endsAt } = req.body;
      if (!content || typeof content !== "string" || !startsAt || !endsAt) {
        return res.status(400).json({ message: "content, startsAt, endsAt가 필요합니다" });
      }
      const start = new Date(startsAt);
      const end = new Date(endsAt);
      if (isNaN(start.getTime()) || isNaN(end.getTime()) || end <= start) {
        return res.status(400).json({ message: "시작·종료 일시가 유효하지 않습니다" });
      }
      const imageUrlVal = typeof imageUrl === "string" && imageUrl.trim() ? imageUrl.trim() : null;
      const textSizeVal = typeof textSize === "string" && ["sm", "md", "lg"].includes(textSize) ? textSize : null;
      const saved = await storage.saveSiteAnnouncement({ content: content.trim(), imageUrl: imageUrlVal, textSize: textSizeVal, showAsPopup: showAsPopup !== false, startsAt: start, endsAt: end });
      // 언어별 자동 번역 후 DB 반영 (번역 실패 시에도 공지는 저장됨)
      try {
        const translations = await translateAnnouncementContent(content.trim());
        if (Object.keys(translations).length > 0) {
          await storage.updateSiteAnnouncementTranslations(saved.id, translations);
        }
      } catch (e) {
        console.warn("[site-announcements translate]", e);
      }
      res.json({ ...saved, startsAt: saved.startsAt.toISOString(), endsAt: saved.endsAt.toISOString() });
    } catch (e: any) {
      console.error("[admin/site-announcements POST]", e);
      const msg = e?.message || "";
      const hint = msg.includes("does not exist") || msg.includes("relation")
        ? " DB 테이블이 없습니다. 서버에서 npm run db:site-announcements 실행 후 다시 시도하세요."
        : "";
      res.status(500).json({ message: "저장에 실패했습니다." + hint });
    }
  });

  app.put("/api/admin/site-announcements/:id", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isInteger(id) || id < 1) return res.status(400).json({ message: "유효하지 않은 ID입니다" });
      const { content, imageUrl, textSize, showAsPopup, startsAt, endsAt } = req.body;
      if (!content || typeof content !== "string" || !startsAt || !endsAt) {
        return res.status(400).json({ message: "content, startsAt, endsAt가 필요합니다" });
      }
      const start = new Date(startsAt);
      const end = new Date(endsAt);
      if (isNaN(start.getTime()) || isNaN(end.getTime()) || end <= start) {
        return res.status(400).json({ message: "시작·종료 일시가 유효하지 않습니다" });
      }
      const imageUrlVal = typeof imageUrl === "string" && imageUrl.trim() ? imageUrl.trim() : null;
      const textSizeVal = typeof textSize === "string" && ["sm", "md", "lg"].includes(textSize) ? textSize : null;
      const saved = await storage.updateSiteAnnouncement(id, { content: content.trim(), imageUrl: imageUrlVal, textSize: textSizeVal, showAsPopup: showAsPopup !== false, startsAt: start, endsAt: end });
      try {
        const translations = await translateAnnouncementContent(content.trim());
        if (Object.keys(translations).length > 0) {
          await storage.updateSiteAnnouncementTranslations(id, translations);
        }
      } catch (e) {
        console.warn("[site-announcements translate]", e);
      }
      res.json({ ...saved, startsAt: saved.startsAt.toISOString(), endsAt: saved.endsAt.toISOString() });
    } catch (e: any) {
      console.error("[admin/site-announcements PUT]", e);
      res.status(500).json({ message: e?.message || "수정에 실패했습니다." });
    }
  });

  app.delete("/api/admin/site-announcements/:id", isAuthenticated, isAdmin, async (req, res) => {
    try {
      await storage.deleteSiteAnnouncement(Number(req.params.id));
      res.json({ success: true });
    } catch (e) {
      console.error("[admin/site-announcements DELETE]", e);
      res.status(500).json({ message: "삭제에 실패했습니다" });
    }
  });

  // 동영상 가이드 (관리자용 CRUD)
  app.get("/api/admin/guide-videos", isAuthenticated, isAdmin, async (_req, res) => {
    try {
      const list = await storage.getGuideVideos();
      res.json(
        list.map((v) => ({
          id: v.id,
          title: v.title,
          description: v.description,
          youtubeUrl: v.youtubeUrl,
          sortOrder: v.sortOrder,
          createdAt: v.createdAt.toISOString(),
          updatedAt: v.updatedAt.toISOString(),
        }))
      );
    } catch (e) {
      console.error("[admin/guide-videos]", e);
      res.json([]);
    }
  });

  app.post("/api/admin/guide-videos", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const { title, description, youtubeUrl, sortOrder } = req.body || {};
      if (!title || typeof title !== "string" || !youtubeUrl || typeof youtubeUrl !== "string") {
        return res.status(400).json({ message: "title, youtubeUrl 이 필요합니다." });
      }
      await storage.createGuideVideo({
        title: title.trim(),
        description: typeof description === "string" ? description.trim() : undefined,
        youtubeUrl: youtubeUrl.trim(),
        sortOrder: typeof sortOrder === "number" ? sortOrder : null,
      });
      res.json({ success: true });
    } catch (e: any) {
      console.error("[admin/guide-videos POST]", e);
      const msg = e?.message || "";
      const hint = msg.includes("guide_videos") && msg.includes("does not exist")
        ? " DB 테이블이 없습니다. 서버에서 npm run db:guide-videos 실행 후 다시 시도하세요."
        : "";
      res.status(500).json({ message: "저장에 실패했습니다." + hint });
    }
  });

  app.put("/api/admin/guide-videos/:id", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const id = Number(req.params.id);
      const { title, description, youtubeUrl, sortOrder } = req.body || {};
      if (!title || typeof title !== "string" || !youtubeUrl || typeof youtubeUrl !== "string") {
        return res.status(400).json({ message: "title, youtubeUrl 이 필요합니다." });
      }
      await storage.updateGuideVideo(id, {
        title: title.trim(),
        description: typeof description === "string" ? description.trim() : undefined,
        youtubeUrl: youtubeUrl.trim(),
        sortOrder: typeof sortOrder === "number" ? sortOrder : null,
      });
      res.json({ success: true });
    } catch (e) {
      console.error("[admin/guide-videos PUT]", e);
      res.status(500).json({ message: "수정에 실패했습니다." });
    }
  });

  app.delete("/api/admin/guide-videos/:id", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const id = Number(req.params.id);
      await storage.deleteGuideVideo(id);
      res.json({ success: true });
    } catch (e) {
      console.error("[admin/guide-videos DELETE]", e);
      res.status(500).json({ message: "삭제에 실패했습니다." });
    }
  });

  app.get("/api/admin/curated-playlists", isAuthenticated, isAdmin, async (_req, res) => {
    try {
      const list = await storage.getCuratedPlaylists();
      res.json(list);
    } catch (e) {
      console.error("[admin/curated-playlists]", e);
      res.json([]);
    }
  });

  app.post("/api/admin/curated-playlists", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const { name, description, slug, coverImageFilename, genreMain, genreSub } = req.body || {};
      if (!name || typeof name !== "string" || !slug || typeof slug !== "string") {
        return res.status(400).json({ message: "name, slug 이 필요합니다." });
      }
      const { id } = await storage.createCuratedPlaylist({
        name: String(name).trim(),
        description: typeof description === "string" && description.trim() ? description.trim() : null,
        slug: String(slug).trim(),
        coverImageFilename: typeof coverImageFilename === "string" && coverImageFilename.trim() ? coverImageFilename.trim() : null,
        genreMain: typeof genreMain === "string" && genreMain.trim() ? genreMain.trim() : null,
        genreSub: typeof genreSub === "string" && genreSub.trim() ? genreSub.trim() : null,
      });
      res.json({ success: true, id });
    } catch (e: any) {
      console.error("[admin/curated-playlists POST]", e);
      res.status(500).json({ message: e?.message?.includes("unique") ? "이미 사용 중인 slug입니다." : "저장에 실패했습니다." });
    }
  });

  app.put("/api/admin/curated-playlists/:id", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const id = Number(req.params.id);
      const { name, description, slug, sortOrder, coverImageFilename, genreMain, genreSub } = req.body || {};
      await storage.updateCuratedPlaylist(id, {
        ...(name !== undefined && { name: String(name).trim() }),
        ...(description !== undefined && { description: description === "" ? null : String(description) }),
        ...(slug !== undefined && { slug: String(slug).trim() }),
        ...(typeof sortOrder === "number" && { sortOrder }),
        ...(coverImageFilename !== undefined && {
          coverImageFilename: coverImageFilename === "" ? null : String(coverImageFilename),
        }),
        ...(genreMain !== undefined && { genreMain: genreMain === "" ? null : String(genreMain) }),
        ...(genreSub !== undefined && { genreSub: genreSub === "" ? null : String(genreSub) }),
      });
      res.json({ success: true });
    } catch (e) {
      console.error("[admin/curated-playlists PUT]", e);
      res.status(500).json({ message: "수정에 실패했습니다." });
    }
  });

  app.delete("/api/admin/curated-playlists/:id", isAuthenticated, isAdmin, async (req, res) => {
    try {
      await storage.deleteCuratedPlaylist(Number(req.params.id));
      res.json({ success: true });
    } catch (e) {
      console.error("[admin/curated-playlists DELETE]", e);
      res.status(500).json({ message: "삭제에 실패했습니다." });
    }
  });

  app.get("/api/admin/curated-playlists/:id/tracks", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const id = Number(req.params.id);
      const musicIds = await storage.getCuratedPlaylistTrackIds(id);
      res.json({ musicIds });
    } catch (e) {
      console.error("[admin/curated-playlists tracks GET]", e);
      res.status(500).json({ message: "트랙 목록을 불러올 수 없습니다." });
    }
  });

  app.put("/api/admin/curated-playlists/:id/tracks", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const id = Number(req.params.id);
      const { musicIds } = req.body || {};
      const ids = Array.isArray(musicIds) ? musicIds.filter((x): x is number => typeof x === "number") : [];
      await storage.setCuratedPlaylistTracks(id, ids);
      res.json({ success: true });
    } catch (e: any) {
      console.error("[admin/curated-playlists tracks PUT]", e);
      res.status(500).json({ message: e?.message ?? "트랙 저장에 실패했습니다." });
    }
  });

  app.get("/api/admin/posts", isAuthenticated, isAdmin, async (req, res) => {
    const posts = await storage.getAllPostsAdmin();
    res.json(posts);
  });

  app.delete("/api/admin/posts/:id", isAuthenticated, isAdmin, async (req, res) => {
    await storage.deletePostAdmin(Number(req.params.id));
    res.json({ success: true });
  });

  app.get("/api/admin/users", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const search = req.query.search as string | undefined;
      const limit = Math.min(200, Math.max(1, parseInt(String(req.query.limit ?? "50"), 10) || 50));
      const offset = Math.max(0, parseInt(String(req.query.offset ?? "0"), 10) || 0);
      const { rows, total } = await storage.getAllUsers(search, limit, offset);
      res.json({ users: rows, total, limit, offset });
    } catch (e: any) {
      console.error("[admin/users]", e);
      res.status(500).json({ message: e?.message ?? "회원 목록을 불러오지 못했습니다." });
    }
  });

  /** 이메일·users.id로 단일 행 존재 여부 (접속 요약 vs 회원 목록 대조용) */
  app.get("/api/admin/users/lookup", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const email = typeof req.query.email === "string" ? req.query.email.trim() : "";
      const userId = typeof req.query.userId === "string" ? req.query.userId.trim() : "";
      if (!email && !userId) {
        return res.status(400).json({ message: "email 또는 userId 쿼리가 필요합니다." });
      }
      const user = await storage.findUserForAdminLookup({ email: email || undefined, userId: userId || undefined });
      res.json({ found: !!user, user: user ?? null });
    } catch (e: any) {
      console.error("[admin/users/lookup]", e);
      res.status(500).json({ message: e?.message ?? "조회에 실패했습니다." });
    }
  });

  /** 관리자: 회원 지갑 잔액·크레딧 거래·결제(구독·크레딧 충전) 내역 */
  app.get("/api/admin/users/:id/wallet", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const targetId = req.params.id as string;
      const txLimit = Math.min(200, Math.max(1, parseInt(String(req.query.txLimit ?? "50"), 10) || 50));
      const txOffset = Math.max(0, parseInt(String(req.query.txOffset ?? "0"), 10) || 0);
      const payLimit = Math.min(200, Math.max(1, parseInt(String(req.query.payLimit ?? "50"), 10) || 50));
      const payOffset = Math.max(0, parseInt(String(req.query.payOffset ?? "0"), 10) || 0);
      const detail = await storage.getAdminUserWalletDetail(targetId, { txLimit, txOffset, payLimit, payOffset });
      if (!detail) return res.status(404).json({ message: "회원을 찾을 수 없습니다" });
      const subscriptionExpiresAt =
        detail.user.subscriptionExpiresAt instanceof Date
          ? detail.user.subscriptionExpiresAt.toISOString()
          : detail.user.subscriptionExpiresAt
            ? String(detail.user.subscriptionExpiresAt)
            : null;
      const promoAiCreditsExpiresAt =
        detail.user.promoAiCreditsExpiresAt instanceof Date
          ? detail.user.promoAiCreditsExpiresAt.toISOString()
          : detail.user.promoAiCreditsExpiresAt
            ? String(detail.user.promoAiCreditsExpiresAt)
            : null;
      res.json({
        user: { ...detail.user, subscriptionExpiresAt, promoAiCreditsExpiresAt },
        creditSummary: detail.creditSummary,
        aiMusicMonthly: detail.aiMusicMonthly,
        creditTransactions: {
          total: detail.creditTransactions.total,
          rows: detail.creditTransactions.rows.map((tx: any) => ({
            ...tx,
            createdAt: tx.createdAt instanceof Date ? tx.createdAt.toISOString() : tx.createdAt,
          })),
        },
        payments: {
          total: detail.payments.total,
          rows: detail.payments.rows.map((p: any) => ({
            ...p,
            createdAt: p.createdAt instanceof Date ? p.createdAt.toISOString() : p.createdAt,
          })),
        },
      });
    } catch (e: any) {
      console.error("[admin/users/:id/wallet]", e);
      res.status(500).json({ message: e?.message ?? "조회에 실패했습니다." });
    }
  });

  app.post("/api/admin/users/:id/credits/adjust", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const targetId = req.params.id as string;
      const amount = Math.trunc(Number((req.body as { amount?: unknown })?.amount));
      const reason = String((req.body as { reason?: unknown })?.reason ?? "").trim();
      // @ts-ignore
      const adminId = String(req.user?.claims?.sub ?? "admin");

      if (!Number.isFinite(amount) || amount === 0) {
        return res.status(400).json({ message: "조정 금액은 0이 아닌 정수여야 합니다." });
      }
      if (!reason) {
        return res.status(400).json({ message: "관리자 조정 사유를 입력해 주세요." });
      }

      const result = await db.transaction(async (tx) => {
        const [u] = await tx
          .select({ id: users.id, credits: users.credits })
          .from(users)
          .where(eq(users.id, targetId))
          .for("update");
        if (!u) {
          const err = new Error("회원을 찾을 수 없습니다.");
          (err as any).statusCode = 404;
          throw err;
        }

        const previous = Math.max(0, Number(u.credits ?? 0));
        const next = previous + amount;
        if (next < 0) {
          const err = new Error("차감 후 잔액이 0원보다 작아질 수 없습니다.");
          (err as any).statusCode = 400;
          throw err;
        }

        await tx
          .update(users)
          .set({ credits: next, updatedAt: new Date() })
          .where(eq(users.id, targetId));
        await tx.insert(creditTransactions).values({
          userId: targetId,
          type: "admin_adjustment",
          amount,
          description: `관리자 수동 조정: ${reason} (admin:${adminId}, ${previous}원 → ${next}원)`,
        });
        return { previous, next };
      });

      res.json({ ok: true, amount, previous: result.previous, next: result.next });
    } catch (e: any) {
      console.error("[admin/users/:id/credits/adjust]", e);
      res.status(e?.statusCode ?? 500).json({ message: e?.message ?? "크레딧 조정에 실패했습니다." });
    }
  });

  /**
   * 관리자: 구독 AI 지갑을 **현재 플랜 월 공급가(부가세 제외)** 기준만 남기고 재구성(이월 제거).
   * 중복 월 충전 버그 등으로 한도가 부풀어 오른 회원 정리용.
   */
  app.post(
    "/api/admin/users/:id/subscription-ai-wallet/rebuild-plan-only",
    isAuthenticated,
    isAdmin,
    async (req, res) => {
      try {
        const targetId = req.params.id as string;
        const now = new Date();
        const state = await adminRebuildSubscriptionAiWalletToPlanOnly(targetId, now);
        if (!state) {
          return res.status(400).json({ message: "활성 유료 구독이 아니거나 재구성에 실패했습니다." });
        }
        res.json({
          ok: true,
          walletSum: state.walletSum,
          periodConsumed: state.periodConsumed,
          periodKey: state.periodKey,
          monthlyGrant: state.monthlyGrant,
          limitDisplay: state.limitDisplay,
        });
      } catch (e: any) {
        console.error("[admin subscription-ai-wallet rebuild-plan-only]", e);
        res.status(500).json({ message: e?.message ?? "재구성에 실패했습니다." });
      }
    },
  );

  /** 관리자: 회원 월별 AI 음악 사용량(ai_music_usage.count) 수동 설정 */
  app.patch("/api/admin/users/:id/ai-music-usage", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const targetId = req.params.id as string;
      const u = await storage.getUserById(targetId);
      if (!u) return res.status(404).json({ message: "회원을 찾을 수 없습니다" });

      const body = req.body as { periodMonth?: string; used?: unknown };
      if (body.used === undefined || body.used === null) {
        return res.status(400).json({ message: "used 필드가 필요합니다." });
      }
      const used = Math.max(0, Math.floor(Number(body.used)));
      if (!Number.isFinite(used)) {
        return res.status(400).json({ message: "used는 0 이상 정수여야 합니다." });
      }

      let usageKey: string;
      if (typeof body.periodMonth === "string" && body.periodMonth.trim()) {
        const p = body.periodMonth.trim();
        if (/^\d{4}-\d{2}$/.test(p) || /^sub:\d+$/.test(p)) usageKey = p;
        else {
          return res.status(400).json({
            message: "periodMonth는 YYYY-MM 또는 월간 구독 버킷용 sub:<unixMs> 형식이어야 합니다.",
          });
        }
      } else {
        const now = new Date();
        usageKey = getAiMusicUsagePeriodKey(u, u.role ?? null, now);
      }

      const nowPatch = new Date();
      if (isUserPaidSubscriptionActive(u, nowPatch)) {
        const ok = await adminSetSubscriptionAiPeriodConsumedWon(targetId, used, nowPatch);
        if (!ok) {
          return res.status(400).json({ message: "활성 유료 구독 AI 한도 반영에 실패했습니다. 구독 상태를 확인해 주세요." });
        }
        return res.json({ success: true, userId: targetId, periodMonth: usageKey, used, mode: "subscription_wallet" });
      }

      const [existing] = await db
        .select()
        .from(aiMusicUsage)
        .where(and(eq(aiMusicUsage.userId, targetId), eq(aiMusicUsage.periodMonth, usageKey)));

      if (existing) {
        await db
          .update(aiMusicUsage)
          .set({ count: used, updatedAt: new Date() })
          .where(and(eq(aiMusicUsage.userId, targetId), eq(aiMusicUsage.periodMonth, usageKey)));
      } else {
        await db.insert(aiMusicUsage).values({ userId: targetId, periodMonth: usageKey, count: used });
      }

      res.json({ success: true, userId: targetId, periodMonth: usageKey, used });
    } catch (e: any) {
      console.error("[admin/users/:id/ai-music-usage]", e);
      res.status(500).json({ message: e?.message ?? "저장에 실패했습니다." });
    }
  });

  app.get("/api/admin/ai-music-generation-logs", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const limit = Math.min(500, Math.max(1, parseInt(String(req.query.limit || "200"), 10)));
      const [[countRow], rows] = await Promise.all([
        db.select({ total: sql<number>`count(*)::int` }).from(aiMusicGenerationLogs),
        db
          .select({
            id: aiMusicGenerationLogs.id,
            userId: aiMusicGenerationLogs.userId,
            createdAt: aiMusicGenerationLogs.createdAt,
            billingKind: aiMusicGenerationLogs.billingKind,
            subscriptionTierAt: aiMusicGenerationLogs.subscriptionTierAt,
            provider: aiMusicGenerationLogs.provider,
            taskId: aiMusicGenerationLogs.taskId,
            requestTitle: aiMusicGenerationLogs.requestTitle,
            requestSummary: aiMusicGenerationLogs.requestSummary,
            creditsCharged: aiMusicGenerationLogs.creditsCharged,
            chargeStatus: aiMusicGenerationLogs.chargeStatus,
            failureMessage: aiMusicGenerationLogs.failureMessage,
            publishments: aiMusicGenerationLogs.publishments,
            userEmail: users.email,
            userFirstName: users.firstName,
          })
          .from(aiMusicGenerationLogs)
          .leftJoin(users, eq(aiMusicGenerationLogs.userId, users.id))
          .orderBy(desc(aiMusicGenerationLogs.createdAt))
          .limit(limit),
      ]);
      const total = Number(countRow?.total ?? 0);
      res.json({ total, rows });
    } catch (e) {
      console.error("[admin ai-music-generation-logs]", e);
      res.status(500).json({ message: "AI 음악 생성 로그를 불러올 수 없습니다." });
    }
  });

  app.delete("/api/admin/users/:id", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const targetId = req.params.id as string;
      // @ts-ignore
      if (targetId === req.user.claims.sub) {
        return res.status(400).json({ message: "자기 자신은 삭제할 수 없습니다" });
      }
      await storage.deleteUser(targetId);
      return res.json({ success: true });
    } catch (err: any) {
      console.error("[admin deleteUser]", err);
      return res.status(500).json({ message: err?.message || "회원 삭제에 실패했습니다." });
    }
  });

  app.patch("/api/admin/users/:id/role", isAuthenticated, isAdmin, async (req, res) => {
    const targetId = req.params.id as string;
    const { role } = req.body;
    if (!role || !["user", "admin"].includes(role)) {
      return res.status(400).json({ message: "유효하지 않은 역할입니다" });
    }
    // @ts-ignore
    if (targetId === req.user.claims.sub) {
      return res.status(400).json({ message: "자기 자신의 권한은 변경할 수 없습니다" });
    }
    await storage.updateUserRole(targetId, role);
    res.json({ success: true });
  });

  app.patch("/api/admin/users/:id/subscription", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const targetId = req.params.id as string;
      const { tier } = req.body;
      if (!tier || !["free", "starter", "basic", "pro", "premium"].includes(tier)) {
        return res.status(400).json({ message: "유효하지 않은 구독 플랜입니다" });
      }
      let expiresAt: Date | null = null;
      if (tier !== "free") {
        expiresAt = new Date();
        expiresAt.setFullYear(expiresAt.getFullYear() + 99);
      }
      await storage.updateUserSubscription(targetId, tier, expiresAt);
      if (tier !== "free") {
        const label =
          tier === "premium"
            ? "프리미엄"
            : tier === "pro"
              ? "Pro"
              : tier === "basic"
                ? "Basic"
                : tier === "starter"
                  ? "Starter"
                  : tier;
        await storage.createNotification({
          userId: targetId,
          type: "system",
          message: `관리자에 의해 ${label} 회원으로 적용되었습니다.`,
          url: "/pricing",
        });
      }
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ message: "구독 상태 변경에 실패했습니다" });
    }
  });

  app.get("/api/admin/check", isAuthenticated, async (req, res) => {
    // @ts-ignore
    const role = await storage.getUserRole(req.user.claims.sub);
    res.json({ isAdmin: role === "admin" });
  });

  app.get("/api/admin/distribution/releases", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const status = typeof req.query.status === "string" ? req.query.status : undefined;
      const rows = await storage.listAdminDistributionReleases(status);
      res.json(rows);
    } catch (e: any) {
      console.error("[admin/distribution/releases GET]", e);
      res.status(500).json({ message: e?.message ?? "유통 신청 목록을 불러올 수 없습니다." });
    }
  });

  app.post("/api/admin/distribution/releases/:id/review", isAuthenticated, isAdmin, async (req, res) => {
    try {
      // @ts-ignore
      const adminUserId = req.user.claims.sub as string;
      const releaseId = Number(req.params.id);
      const action = req.body?.action === "approved" ? "approved" : req.body?.action === "rejected" ? "rejected" : null;
      const reason = typeof req.body?.reason === "string" ? req.body.reason.trim() : null;
      if (!releaseId || !action) {
        return res.status(400).json({ message: "releaseId/action 값이 유효하지 않습니다." });
      }
      const updated = await storage.reviewDistributionRelease({ adminUserId, releaseId, action, reason });
      if (!updated) return res.status(404).json({ message: "유통 신청을 찾을 수 없습니다." });
      if (updated.ownerUserId) {
        await storage.createNotification({
          userId: updated.ownerUserId,
          type: "system",
          message: action === "approved" ? "유통 신청이 승인되었습니다." : "유통 신청이 반려되었습니다.",
          payload: { releaseId: updated.id, reason: updated.rejectionReason ?? undefined },
          url: "/dashboard",
        });
      }
      res.json(updated);
    } catch (e: any) {
      console.error("[admin/distribution/releases/:id/review POST]", e);
      res.status(500).json({ message: e?.message ?? "유통 신청 검토 처리에 실패했습니다." });
    }
  });

  // === Admin: Company batch publish (API integration placeholder) ===
  // 현재 버전에서는 Distributor API 실제 호출 대신, approved 릴리즈를 'live'로 전환합니다.
  app.post("/api/admin/distribution/batch-submit", isAuthenticated, isAdmin, async (req, res) => {
    try {
      // @ts-ignore
      const adminUserId = req.user.claims.sub as string;

      const rawDistributor = typeof req.body?.distributor === "string" ? req.body.distributor : "distrokid";
      const distributor = rawDistributor.trim().toLowerCase();
      const allowed = new Set(["distrokid", "tuneCore".toLowerCase(), "cdbaby", "ditto", "onerpm", "generic"]);
      const distributorFinal = allowed.has(distributor) ? distributor : "distrokid";

      const approvedReleases = await storage.listAdminDistributionReleases("approved");
      let updatedCount = 0;

      for (const r of approvedReleases) {
        const submitResult = await submitDistributionReleaseToDistributor({
          adminUserId,
          release: r,
          distributor: distributorFinal,
        });

        // publishDistributionRelease가 delivered 상태 + externalReleaseRef를 세팅하므로,
        // 여기서는 결과로부터 ownerUserId 기반 notification만 남깁니다.
        if (r.ownerUserId) {
          await storage.createNotification({
            userId: r.ownerUserId,
            type: "system",
            message: "유통이 시작되었습니다.",
            payload: { releaseId: r.id, distributor: distributorFinal, externalReleaseRef: submitResult.externalReleaseRef },
            url: "/dashboard",
          });
          updatedCount += 1;
        }
      }

      res.json({ success: true, updatedCount, distributor: distributorFinal });
    } catch (e: any) {
      console.error("[admin/distribution/batch-submit POST]", e);
      res.status(500).json({ message: e?.message ?? "유통 일괄 배포에 실패했습니다." });
    }
  });

  // === Admin: Platform Readiness mode (QC + checklist) ===
  app.post("/api/admin/distribution/releases/:id/qc-run", isAuthenticated, isAdmin, async (req, res) => {
    try {
      // @ts-ignore
      const adminUserId = req.user.claims.sub as string;
      const releaseId = parsePositiveIntParam(String(req.params.id ?? ""));
      if (!releaseId) return res.status(400).json({ message: "유효한 release id가 필요합니다." });

      const updated = await storage.runDistributionQc({ adminUserId, releaseId });
      if (!updated) return res.status(404).json({ message: "유통 신청을 찾을 수 없습니다." });

      res.json({ success: true, qcStatus: updated.qcStatus, releaseId: updated.id });
    } catch (e: any) {
      res.status(400).json({ message: e?.message ?? "유통 QC 실행에 실패했습니다." });
    }
  });

  // === Admin: Distributor API 미연동 시 외부 릴리즈 ref 수동 연결 ===
  // DistroKid/TuneCore에 업로드 후, Distributor가 알려준 외부 릴리즈 ID/Ref를 여기 붙이면
  // webhooks(status/payouts)가 해당 release를 찾아 상태를 업데이트할 수 있습니다.
  app.post("/api/admin/distribution/releases/:id/link-external-ref", isAuthenticated, isAdmin, async (req, res) => {
    try {
      // @ts-ignore
      const adminUserId = req.user.claims.sub as string;
      const releaseId = parsePositiveIntParam(String(req.params.id ?? ""));
      if (!releaseId) return res.status(400).json({ message: "유효한 release id가 필요합니다." });

      const externalReleaseRefRaw = typeof req.body?.externalReleaseRef === "string" ? req.body.externalReleaseRef : "";
      const externalReleaseRef = externalReleaseRefRaw.trim();
      const status =
        req.body?.status === "live" ? "live" : "delivered";

      if (!externalReleaseRef) return res.status(400).json({ message: "externalReleaseRef 가 필요합니다." });

      const updated = await storage.linkDistributionReleaseExternalRef({
        adminUserId,
        releaseId,
        externalReleaseRef,
        status,
      });

      if (!updated) return res.status(404).json({ message: "유통 신청을 찾을 수 없습니다." });
      res.json({ success: true, releaseId: updated.id, externalReleaseRef: updated.externalReleaseRef, status: updated.status });
    } catch (e: any) {
      res.status(400).json({ message: e?.message ?? "외부 릴리즈 ref 연결에 실패했습니다." });
    }
  });

  // === Distributor Webhooks (status / payouts) ===
  // 보안: 헤더 `x-distribution-webhook-secret` 값이 ENV와 일치해야 합니다.
  function requireDistributionWebhookSecret(req: any, res: any, next: any) {
    const expected = String(process.env.DISTRIBUTION_WEBHOOK_SECRET ?? "").trim();
    const provided = String(req.headers["x-distribution-webhook-secret"] ?? "").trim();
    if (!expected) {
      return res.status(500).json({ message: "DISTRIBUTION_WEBHOOK_SECRET is not configured" });
    }
    if (!provided || provided !== expected) {
      return res.status(401).json({ message: "Invalid webhook secret" });
    }
    next();
  }

  app.post("/api/distribution/webhooks/:distributor/status", requireDistributionWebhookSecret, async (req, res) => {
    try {
      const externalReleaseRef = typeof req.body?.externalReleaseRef === "string" ? req.body.externalReleaseRef.trim() : "";
      const statusRaw = req.body?.status;
      const status = statusRaw === "live" ? "live" : statusRaw === "delivered" ? "delivered" : null;
      if (!externalReleaseRef || !status) {
        return res.status(400).json({ message: "externalReleaseRef/status 값이 유효하지 않습니다." });
      }
      const updated = await storage.setDistributionReleaseStatusByExternalRef({ externalReleaseRef, status });
      if (!updated) return res.status(404).json({ message: "유통 릴리즈를 찾을 수 없습니다." });
      console.info("[distribution webhook status]", { externalReleaseRef, status, releaseId: updated.id });
      res.json({ success: true, releaseId: updated.id, status: updated.status });
    } catch (e: any) {
      console.error("[distribution webhook status POST]", e);
      res.status(500).json({ message: e?.message ?? "상태 웹훅 처리에 실패했습니다." });
    }
  });

  app.post("/api/distribution/webhooks/:distributor/payouts", requireDistributionWebhookSecret, async (req, res) => {
    try {
      const externalReleaseRef = typeof req.body?.externalReleaseRef === "string" ? req.body.externalReleaseRef.trim() : "";
      const periodMonth = typeof req.body?.periodMonth === "string" ? req.body.periodMonth.trim() : "";
      const grossAmount = Number(req.body?.grossAmount);
      const platformFeeAmount = req.body?.platformFeeAmount == null ? undefined : Number(req.body.platformFeeAmount);

      if (!externalReleaseRef || !periodMonth || !Number.isFinite(grossAmount)) {
        return res.status(400).json({ message: "externalReleaseRef/periodMonth/grossAmount 값이 유효하지 않습니다." });
      }
      if (!/^\d{4}-\d{2}$/.test(periodMonth)) {
        return res.status(400).json({ message: "periodMonth must be YYYY-MM" });
      }

      const release = await storage.getDistributionReleaseByExternalRef(externalReleaseRef);
      if (!release) return res.status(404).json({ message: "유통 릴리즈를 찾을 수 없습니다." });

      const already = await storage.hasPaidDistributionPayout({ releaseId: release.id, periodMonth });
      if (already) {
        return res.json({ success: true, skipped: true, releaseId: release.id, periodMonth });
      }

      await storage.addDistributionEarning({
        releaseId: release.id,
        periodMonth,
        grossAmount,
        platformFeeAmount: platformFeeAmount == null ? undefined : platformFeeAmount,
        source: "distributor_webhook",
        externalRef: `${externalReleaseRef}:${periodMonth}`,
      });

      console.info("[distribution webhook payouts]", { externalReleaseRef, periodMonth, grossAmount, releaseId: release.id });
      res.json({ success: true, releaseId: release.id, periodMonth });
    } catch (e: any) {
      console.error("[distribution webhook payouts POST]", e);
      res.status(500).json({ message: e?.message ?? "수익 웹훅 처리에 실패했습니다." });
    }
  });

  app.post("/api/admin/distribution/releases/:id/earnings", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const releaseId = Number(req.params.id);
      const periodMonth = String(req.body?.periodMonth ?? "").trim();
      const grossAmount = Number(req.body?.grossAmount);
      const platformFeeAmount = req.body?.platformFeeAmount == null ? undefined : Number(req.body.platformFeeAmount);
      const source = typeof req.body?.source === "string" ? req.body.source.trim() : undefined;
      const externalRef = typeof req.body?.externalRef === "string" ? req.body.externalRef.trim() : undefined;
      if (!releaseId || !periodMonth || !Number.isFinite(grossAmount)) {
        return res.status(400).json({ message: "releaseId/periodMonth/grossAmount 값이 유효하지 않습니다." });
      }
      const result = await storage.addDistributionEarning({
        releaseId,
        periodMonth,
        grossAmount,
        platformFeeAmount,
        source,
        externalRef,
      });
      res.json({ success: true, ...result });
    } catch (e: any) {
      const msg = String(e?.message ?? "");
      const status =
        msg.includes("not found") ||
        msg.includes("split") ||
        msg.includes("periodMonth") ||
        msg.includes("cannot accept earnings") ||
        msg.includes("release cannot accept earnings") ||
        msg.includes("approved") // 과거 오류 메시지 호환
          ? 400
          : 500;
      console.error("[admin/distribution/releases/:id/earnings POST]", e);
      res.status(status).json({ message: e?.message ?? "유통 정산 입력에 실패했습니다." });
    }
  });

  /** DistroKid 등에서 내려받은 수익 표를 붙여넣어 일괄 반입 (공식 API 없을 때) */
  app.post("/api/admin/distribution/import-earnings", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const periodMonth = String(req.body?.periodMonth ?? "").trim();
      if (!/^\d{4}-\d{2}$/.test(periodMonth)) {
        return res.status(400).json({ message: "periodMonth는 YYYY-MM 형식이어야 합니다." });
      }
      const rawDistributor =
        typeof req.body?.defaultDistributor === "string" ? req.body.defaultDistributor.trim().toLowerCase() : "distrokid";
      const allowedDist = new Set(["distrokid", "tunecore", "cdbaby", "ditto", "onerpm", "generic"]);
      const defaultDistributor = allowedDist.has(rawDistributor) ? rawDistributor : "distrokid";

      type EntryRow = { externalReleaseRef: string; grossAmount: number; platformFeeAmount?: number };
      const merged: EntryRow[] = [];

      const rawEntries = req.body?.entries;
      if (Array.isArray(rawEntries)) {
        for (const e of rawEntries) {
          const ref = typeof e?.externalReleaseRef === "string" ? e.externalReleaseRef.trim() : "";
          const grossAmount = Number(e?.grossAmount);
          const platformFeeAmount = e?.platformFeeAmount == null ? undefined : Number(e.platformFeeAmount);
          if (!ref || !Number.isFinite(grossAmount)) continue;
          merged.push({
            externalReleaseRef: ref,
            grossAmount: Math.floor(grossAmount),
            platformFeeAmount:
              platformFeeAmount != null && Number.isFinite(platformFeeAmount) ? Math.floor(platformFeeAmount) : undefined,
          });
        }
      }

      const csvText = typeof req.body?.csvText === "string" ? req.body.csvText : "";
      if (csvText.trim()) {
        for (const p of parseDistributionImportCsv(csvText)) {
          merged.push({
            externalReleaseRef: p.ref,
            grossAmount: p.grossAmount,
            platformFeeAmount: p.platformFeeAmount,
          });
        }
      }

      if (merged.length === 0) {
        return res.status(400).json({ message: "entries 또는 csvText에 유효한 행이 없습니다." });
      }

      const skipped: { externalReleaseRef: string; reason: string }[] = [];
      const errors: { externalReleaseRef: string; message: string }[] = [];
      let applied = 0;

      for (const row of merged) {
        const rawRef = row.externalReleaseRef.trim();
        let lookupRef = rawRef;
        let rel = await storage.getDistributionReleaseByExternalRef(lookupRef);
        if (!rel && !rawRef.includes(":")) {
          lookupRef = `${defaultDistributor}:${rawRef}`;
          rel = await storage.getDistributionReleaseByExternalRef(lookupRef);
        }
        if (!rel) {
          errors.push({ externalReleaseRef: row.externalReleaseRef, message: "유통 릴리즈를 찾을 수 없습니다." });
          continue;
        }
        const dup = await storage.hasDistributionLedgerForReleaseMonth(rel.id, periodMonth);
        if (dup) {
          skipped.push({ externalReleaseRef: row.externalReleaseRef, reason: "해당 월 정산 원장이 이미 있습니다." });
          continue;
        }
        try {
          await storage.addDistributionEarning({
            releaseId: rel.id,
            periodMonth,
            grossAmount: row.grossAmount,
            platformFeeAmount: row.platformFeeAmount,
            source: "admin_csv_import",
            externalRef: `admin_csv:${lookupRef}:${periodMonth}`,
          });
          applied += 1;
        } catch (e: any) {
          errors.push({ externalReleaseRef: row.externalReleaseRef, message: String(e?.message ?? "정산 반입 실패") });
        }
      }

      res.json({
        success: true,
        periodMonth,
        applied,
        skipped,
        errors,
      });
    } catch (e: any) {
      console.error("[admin/distribution/import-earnings POST]", e);
      res.status(500).json({ message: e?.message ?? "정산 일괄 반입에 실패했습니다." });
    }
  });

  app.get("/api/admin/radio/channels", isAuthenticated, isAdmin, async (_req, res) => {
    try {
      const list = await storage.listAllRadioChannels();
      res.json(list);
    } catch (e) {
      console.error("[admin/radio/channels]", e);
      res.status(500).json({ message: "방송 채널 목록을 불러올 수 없습니다" });
    }
  });

  // === Copyright Report Routes ===
  app.post("/api/copyright-reports", isAuthenticated, async (req, res) => {
    try {
      // @ts-ignore
      const reporterId = req.user.claims.sub;
      const { musicId, reason, originalArtist, originalTitle, details } = req.body;
      if (!musicId || !reason) {
        return res.status(400).json({ message: "음원 ID와 신고 사유는 필수입니다" });
      }
      const musicItem = await storage.getMusicById(Number(musicId));
      if (!musicItem) return res.status(404).json({ message: "음원을 찾을 수 없습니다" });

      const report = await storage.createCopyrightReport({
        musicId: Number(musicId),
        reporterId,
        reason,
        originalArtist: originalArtist || null,
        originalTitle: originalTitle || null,
        details: details || null,
      });

      await storage.createNotification({
        userId: musicItem.userId,
        type: "copyright",
        message: `"${musicItem.title}" 음원에 대한 저작권 신고가 접수되었습니다`,
        payload: { musicTitle: musicItem.title },
        url: `/music/${musicId}`,
      });

      res.status(201).json(report);
    } catch (err) {
      console.error("Copyright report error:", err);
      res.status(500).json({ message: "신고 접수에 실패했습니다" });
    }
  });

  app.get("/api/copyright-reports/my", isAuthenticated, async (req, res) => {
    // @ts-ignore
    const userId = req.user.claims.sub;
    const reports = await storage.getCopyrightReportsByUser(userId);
    res.json(reports);
  });

  app.get("/api/admin/copyright-reports", isAuthenticated, isAdmin, async (req, res) => {
    const status = req.query.status as string | undefined;
    const reports = await storage.getAllCopyrightReports(status);
    res.json(reports);
  });

  app.patch("/api/admin/copyright-reports/:id", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const { status, adminNote } = req.body;
      if (!status || !["pending", "reviewing", "resolved", "rejected"].includes(status)) {
        return res.status(400).json({ message: "유효하지 않은 상태입니다" });
      }
      const updated = await storage.updateCopyrightReportStatus(Number(req.params.id), status, adminNote);
      if (!updated) return res.status(404).json({ message: "신고를 찾을 수 없습니다" });
      if (updated.reporterId) {
        const statusLabels: Record<string, string> = { pending: "검토 대기", reviewing: "검토 중", resolved: "처리 완료", rejected: "반려" };
        const musicItem = await storage.getMusicById(updated.musicId);
        await storage.createNotification({
          userId: updated.reporterId,
          type: "copyright",
          message: `"${musicItem?.title || "음원"}" 저작권 신고가 ${statusLabels[status] || status}(으)로 처리되었습니다.`,
          payload: { status, musicTitle: musicItem?.title },
          url: "/credits",
        });
      }
      res.json(updated);
    } catch (err) {
      console.error("Copyright report update error:", err);
      res.status(500).json({ message: "신고 처리에 실패했습니다" });
    }
  });

  app.get("/api/admin/user-reports", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const status = req.query.status as string | undefined;
      const reports = await storage.getAllUserReports(status);
      const withUsers = await Promise.all(reports.map(async (r: any) => {
        const reporter = await storage.getUserById(r.reporterId);
        const reported = await storage.getUserById(r.reportedUserId);
        return { ...r, reporterName: reporter ? `${reporter.firstName || ""} ${reporter.lastName || ""}`.trim() || reporter.email : "-", reportedUserName: reported ? `${reported.firstName || ""} ${reported.lastName || ""}`.trim() || reported.email : "-" };
      }));
      res.json(withUsers);
    } catch (err) {
      res.status(500).json({ message: "회원 신고 목록 조회 실패" });
    }
  });

  app.patch("/api/admin/user-reports/:id", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const { status, adminNote } = req.body;
      if (!status || !["pending", "reviewed", "resolved"].includes(status)) {
        return res.status(400).json({ message: "유효하지 않은 상태입니다" });
      }
      const report = await storage.getUserReportById(Number(req.params.id));
      await storage.updateUserReportStatus(Number(req.params.id), status, adminNote);
      if (report && report.reporterId) {
        const statusLabels: Record<string, string> = { pending: "검토 대기", reviewed: "검토 완료", resolved: "처리 완료" };
        await storage.createNotification({
          userId: report.reporterId,
          type: "system",
          message: `회원 신고가 ${statusLabels[status] || status}(으)로 처리되었습니다.`,
          payload: { status, adminNote: adminNote || undefined },
          url: "/messages",
        });
      }
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ message: "신고 처리에 실패했습니다" });
    }
  });

  // === 구독 API (페이업 카드 + 계좌이체 · 토스 미사용) ===

  app.get("/api/subscription/plans", async (_req, res) => {
    try {
      const plans = await db.select().from(subscriptionPlans);
      res.json(plans);
    } catch (err) {
      console.error("Plans fetch error:", err);
      res.status(500).json({ message: "플랜 정보를 불러올 수 없습니다" });
    }
  });

  app.get("/api/subscription/me", isAuthenticated, async (req, res) => {
    try {
      // @ts-ignore
      const userId = req.user.claims.sub;
      const now = new Date();
      try {
        await ensurePaidUserSubscriptionAiExhaustedIfWalletDepleted(userId, now);
      } catch (e) {
        console.error("[subscription/me] subscription AI budget exhaustion check", e);
      }
      const [user] = await db.select().from(users).where(eq(users.id, userId));
      if (!user) {
        return res.json({ subscription: null, tier: "free" });
      }

      const { subscriptionEntitlements, subscriptionTier, subscriptionExpiresAt, needsWrite } = subscriptionRowNeedsSync(
        user,
        now,
      );
      if (needsWrite) {
        await db
          .update(users)
          .set({
            subscriptionEntitlements,
            subscriptionTier,
            subscriptionExpiresAt,
            ...(subscriptionTier === "free" ? { subscriptionPlan: null } : {}),
            updatedAt: new Date(),
          })
          .where(eq(users.id, userId));
      }
      const [fresh] = await db.select().from(users).where(eq(users.id, userId));
      const row = fresh ?? user;
      if (isPaidSubscriptionTierId(String(row.subscriptionTier ?? "").trim().toLowerCase())) {
        const [latestSubPayment] = await db
          .select({ id: payments.id, status: payments.status })
          .from(payments)
          .where(and(eq(payments.userId, userId), inArray(payments.plan, PAID_PLAN_IDS_FOR_PAYMENTS)))
          .orderBy(desc(payments.createdAt))
          .limit(1);
        const latestSt = String(latestSubPayment?.status ?? "").trim().toLowerCase();
        const hasPaid = await userHasAnyPaidSubscriptionPayment(userId);
        if (latestSt === "refunded" || (isUserPaidSubscriptionActive(row, now) && !hasPaid)) {
          await resetUserSubscriptionToFree(userId);
          return res.json({ tier: "free" });
        }
      }
      if (isUserPaidSubscriptionActive(row, now)) {
        const aligned = await ensureUserSubscriptionBackedByPaidPayment(userId, now);
        if (aligned === "downgraded") {
          return res.json({ tier: "free" });
        }
        const [after] = await db.select().from(users).where(eq(users.id, userId));
        const live = after ?? row;
        if (isUserPaidSubscriptionActive(live, now) && live.subscriptionTier && live.subscriptionTier !== "free") {
          return res.json({
            tier: live.subscriptionTier,
            plan: live.subscriptionPlan,
            expiresAt: live.subscriptionExpiresAt,
          });
        }
      }

      res.json({ tier: "free" });
    } catch (err) {
      console.error("Subscription check error:", err);
      res.status(500).json({ message: "구독 정보를 불러올 수 없습니다" });
    }
  });

  app.post("/api/subscription/cancel", isAuthenticated, async (req, res) => {
    try {
      // @ts-ignore
      const userId = req.user.claims.sub;
      let [user] = await db.select().from(users).where(eq(users.id, userId));
      if (!user) return res.status(404).json({ message: "사용자를 찾을 수 없습니다" });

      const now = new Date();
      if (!isUserPaidSubscriptionActive(user, now)) {
        return res.status(400).json({ message: "현재 이용 중인 유료 구독이 없습니다." });
      }

      const [latestPendingPayup] = await db
        .select({ orderId: payments.orderId })
        .from(payments)
        .where(
          and(
            eq(payments.userId, userId),
            eq(payments.status, "pending"),
            eq(payments.paymentKey, PAYUP_SUBSCRIPTION_PAYMENT_KEY),
            inArray(payments.plan, PAID_PLAN_IDS_FOR_PAYMENTS),
          ),
        )
        .orderBy(desc(payments.createdAt))
        .limit(1);
      if (latestPendingPayup?.orderId) {
        await alignSubscriptionAfterPayupCheckoutAbandon(userId, latestPendingPayup.orderId, "cancel");
      }

      await tryReconcileAllPaidPayupSubscriptionsForUser(userId);
      const aligned = await ensureUserSubscriptionBackedByPaidPayment(userId, now);
      [user] = await db.select().from(users).where(eq(users.id, userId));
      if (!user || aligned === "downgraded" || !isUserPaidSubscriptionActive(user, now)) {
        return res.json({
          success: true,
          downgradedImmediately: true,
          message:
            "카드 결제가 취소·환불된 것으로 확인되어 무료 플랜으로 조정되었습니다. 요금 페이지가 갱신됩니다.",
        });
      }

      const displayed = computeDisplayedSubscriptionFromEntitlements(
        user.subscriptionEntitlements,
        user.subscriptionTier,
        user.subscriptionExpiresAt,
        now,
        user.subscriptionAiWallet,
      );
      let cancelPlanId: PaidSubscriptionTierId = "pro";
      if (isPaidSubscriptionTierId(displayed.subscriptionTier)) {
        cancelPlanId = displayed.subscriptionTier as PaidSubscriptionTierId;
      } else if (isPaidSubscriptionTierId(user.subscriptionTier ?? "")) {
        cancelPlanId = String(user.subscriptionTier).trim().toLowerCase() as PaidSubscriptionTierId;
      }
      const cancelRecipientName = `${user.firstName || ""} ${user.lastName || ""}`.trim() || null;
      const cancelEmail = user.email;

      /**
       * 회원「구독 해지」= **다음 자동 갱신(결제)만 중지**. 만료일·entitlements·구독 AI 지갑은 유지.
       * 카드사/PG에서 결제가 취소·환불된 경우는 별도(웹훅·관리자 PG상태 확인)로 DB를 되돌려 즉시 무료화.
       */
      await db
        .update(users)
        .set({
          tossBillingKey: null,
          tossCustomerKey: null,
          subscriptionPlan: null,
          updatedAt: new Date(),
        })
        .where(eq(users.id, userId));

      void sendSubscriptionEmail(cancelEmail, {
        kind: "cancelled",
        planId: cancelPlanId,
        recipientName: cancelRecipientName,
      });

      res.json({
        success: true,
        downgradedImmediately: false,
        message:
          "다음 결제(갱신)는 중지되었습니다. 표시된 만료일까지는 유료 혜택(음악 생성 한도 등)이 그대로 유지됩니다.",
      });
    } catch (err) {
      console.error("Cancel subscription error:", err);
      res.status(500).json({ message: "구독 해지에 실패했습니다" });
    }
  });

  app.get("/api/subscription/payments", isAuthenticated, async (req, res) => {
    try {
      // @ts-ignore
      const userId = req.user.claims.sub;
      const result = await db.select().from(payments).where(eq(payments.userId, userId));
      res.json(result);
    } catch (err) {
      console.error("Payment history error:", err);
      res.status(500).json({ message: "결제 내역을 불러올 수 없습니다" });
    }
  });

  // === 계좌이체 구독 (Bank Transfer Subscription) ===
  app.get("/api/subscription/bank-info", async (_req, res) => {
    const bankName = process.env.BANK_NAME || "입력된 은행명 없음";
    const bankAccount = process.env.BANK_ACCOUNT || "";
    const bankHolder = process.env.BANK_HOLDER || "";
    const planIds: PaidSubscriptionTierId[] = ["starter", "basic", "pro", "premium"];
    const plans = await db.select().from(subscriptionPlans).where(inArray(subscriptionPlans.id, planIds));
    const plansOut = planIds.map((id) => {
      const row = plans.find((p) => p.id === id);
      const n = normalizeSubscriptionPlanPrices(id, row?.monthlyPrice, row?.yearlyPrice);
      const defaultName = id === "starter" ? "Starter" : id === "basic" ? "Basic" : id === "pro" ? "Pro" : "Premium";
      return {
        id,
        name: row?.name ?? defaultName,
        monthlyPrice: n.monthly,
        yearlyPrice: n.yearly,
      };
    });
    const proN = normalizeSubscriptionPlanPrices(
      "pro",
      plans.find((p) => p.id === "pro")?.monthlyPrice,
      plans.find((p) => p.id === "pro")?.yearlyPrice,
    );
    res.json({
      bankName,
      bankAccount,
      bankHolder,
      plans: plansOut,
      amountMonthly: proN.monthly,
      amountYearly: proN.yearly,
    });
  });

  app.post("/api/subscription/request-bank", isAuthenticated, async (req, res) => {
    try {
      // @ts-ignore
      const userId = req.user.claims.sub;
      const { billingPeriod, planId } = req.body;
      if (!billingPeriod || !["monthly", "yearly"].includes(billingPeriod)) {
        return res.status(400).json({ message: "결제 주기를 선택해주세요" });
      }
      if (!planId || !isPaidSubscriptionTierId(String(planId))) {
        return res.status(400).json({ message: "유효하지 않은 플랜입니다" });
      }
      const plan = planId as PaidSubscriptionTierId;
      const [user] = await db.select().from(users).where(eq(users.id, userId));
      if (!user) return res.status(404).json({ message: "사용자를 찾을 수 없습니다" });

      let amount: number;
      try {
        const [planRow] = await db.select().from(subscriptionPlans).where(eq(subscriptionPlans.id, plan)).limit(1);
        const fb = SUBSCRIPTION_PLAN_FALLBACK[plan];
        if (!planRow) {
          const supply = billingPeriod === "monthly" ? fb.monthly : fb.yearly;
          amount = subscriptionTotalVatInclusiveWon(supply);
        } else {
          const n = normalizeSubscriptionPlanPrices(plan, planRow.monthlyPrice, planRow.yearlyPrice);
          const supply = billingPeriod === "monthly" ? n.monthly : n.yearly;
          amount = subscriptionTotalVatInclusiveWon(supply);
        }
      } catch {
        const fb = SUBSCRIPTION_PLAN_FALLBACK[plan];
        const supply = billingPeriod === "monthly" ? fb.monthly : fb.yearly;
        amount = subscriptionTotalVatInclusiveWon(supply);
      }
      const orderId = `BANK_${userId.replace(/[^a-zA-Z0-9_-]/g, "_").substring(0, 20)}_${Date.now()}`;

      await db.insert(payments).values({
        userId,
        orderId,
        paymentKey: "bank_transfer",
        amount,
        status: "pending",
        plan,
        billingPeriod,
      });

      const bankName = process.env.BANK_NAME || "은행명";
      const bankAccount = process.env.BANK_ACCOUNT || "";
      const bankHolder = process.env.BANK_HOLDER || "";
      res.json({
        success: true,
        orderId,
        bankInfo: { bankName, bankAccount, bankHolder },
        amount,
        billingPeriod,
        planId: plan,
        message: `입금 신청이 등록되었습니다. ${amount.toLocaleString("ko-KR")}원을 아래 계좌로 입금해 주시면 확인 후 즉시 ${plan === "premium" ? "프리미엄" : plan === "pro" ? "Pro" : plan === "basic" ? "Basic" : plan === "starter" ? "Starter" : plan}이 적용됩니다.`,
      });
    } catch (err: any) {
      console.error("Request bank subscription error:", err);
      let message = err?.message || err?.code || "입금 신청에 실패했습니다";
      if (typeof message === "string" && (message.includes("payments") || message.includes("subscription_plans")) && message.toLowerCase().includes("relation")) {
        message = "결제 테이블이 없습니다. 로컬 개발 시 script/create-subscription-tables.sql 을 DB에 실행해주세요.";
      }
      res.status(500).json({ message: typeof message === "string" ? message : "입금 신청에 실패했습니다" });
    }
  });

  /**
   * [페이업] 인증결제 DANAL 다이렉트 규격서 — 3.1 주문 `POST /ap/api/payment/{merchantId}/order`
   * → 3.2 결제창(STARTURL/STARTPARAMS/CANCELURL/CARDCODE) → 3.3 auth_return `RETURNPARAMS` → 3.4 `POST {payUrl}` JSON
   */
  app.post("/api/subscription/payup/order", isAuthenticated, async (req, res) => {
    try {
      const cred = getPayupCredentials();
      if (!cred.ok) {
        return res.status(503).json({ message: cred.message });
      }
      const site = payupSubscriptionSiteBase();
      if (!site) {
        return res.status(503).json({ message: "SITE_URL 이 설정되어야 카드 결제 복귀 URL을 만들 수 있습니다." });
      }
      // @ts-ignore
      const userId = req.user.claims.sub as string;
      const { billingPeriod, planId, userAgentKind } = req.body ?? {};
      if (!billingPeriod || !["monthly", "yearly"].includes(billingPeriod)) {
        return res.status(400).json({ message: "결제 주기를 선택해주세요" });
      }
      if (!planId || !isPaidSubscriptionTierId(String(planId))) {
        return res.status(400).json({ message: "유효하지 않은 플랜입니다" });
      }
      const plan = planId as PaidSubscriptionTierId;
      const [user] = await db.select().from(users).where(eq(users.id, userId));
      if (!user) return res.status(404).json({ message: "사용자를 찾을 수 없습니다" });

      let amount: number;
      try {
        const [planRow] = await db.select().from(subscriptionPlans).where(eq(subscriptionPlans.id, plan)).limit(1);
        const fb = SUBSCRIPTION_PLAN_FALLBACK[plan];
        if (!planRow) {
          const supply = billingPeriod === "monthly" ? fb.monthly : fb.yearly;
          amount = subscriptionTotalVatInclusiveWon(supply);
        } else {
          const n = normalizeSubscriptionPlanPrices(plan, planRow.monthlyPrice, planRow.yearlyPrice);
          const supply = billingPeriod === "monthly" ? n.monthly : n.yearly;
          amount = subscriptionTotalVatInclusiveWon(supply);
        }
      } catch {
        const fb = SUBSCRIPTION_PLAN_FALLBACK[plan];
        const supply = billingPeriod === "monthly" ? fb.monthly : fb.yearly;
        amount = subscriptionTotalVatInclusiveWon(supply);
      }

      const orderNumber = newPayupSubscriptionOrderNumber();
      const timestamp = payupTimestamp14();
      let amtForOrder: string;
      try {
        amtForOrder = formatPayupOrderAmountForRequest(amount);
      } catch {
        return res.status(400).json({ message: "결제 금액이 페이업 전문 한도를 초과합니다." });
      }

      const amtForSignature = formatPayupOrderAmountForSignature(amount, amtForOrder);
      const signature = signPayupDirectOrder(cred.merchantId, orderNumber, amtForSignature, cred.apiCertKey, timestamp);
      const displayNameRaw = `${user.firstName || ""} ${user.lastName || ""}`.trim() || user.email || "회원";
      const displayName = sanitizePayupOrderField(displayNameRaw, 50) || "회원";
      /** 규격서 3.1 userAgent 길이 2 — 모바일 WM, 그 외 PC */
      const userAgent = userAgentKind === "MW" || userAgentKind === "mw" ? "WM" : "PC";
      const cardCode4 = (process.env.PAYUP_SUBSCRIPTION_CARDCODE ?? "0000").replace(/\D/g, "").padStart(4, "0").slice(0, 4);
      const authReturnUrl = `${site}/api/subscription/payup/complete`.slice(0, 200);

      const itemName = sanitizePayupOrderField(
        `VenySound ${plan} ${billingPeriod === "monthly" ? "월간" : "연간"}`,
        100,
      );
      const orderPath = `/ap/api/payment/${encodeURIComponent(cred.merchantId)}/order`;
      /** 가맹점 ID는 주문 URL 경로에 포함됨. 페이업 운영: 규격 표에 없는 본문 필드는 전문 파싱 오류 유발 가능 — merchantId 는 기본으로 JSON에 넣지 않음. 필요 시만 PAYUP_ORDER_INCLUDE_MERCHANT_IN_BODY=true */
      /** 페이업·다날 AP 전문은 필드 길이·빈 값에 민감 — 이메일 없으면 키 자체를 보내지 않음 */
      const userEmailTrim = sanitizePayupOrderField((user.email || "").trim(), 50);
      /** 기본 true: USESKIPPAGE·QUOTA 미전송(전문 파싱 오류 완화). 예전 전문이 필요하면 PAYUP_ORDER_STRIP_NONSPEC_FIELDS=false */
      const stripNonspec =
        String(process.env.PAYUP_ORDER_STRIP_NONSPEC_FIELDS ?? "true").trim().toLowerCase() !== "false";
      const orderBody: Record<string, string> = {
        orderNumber,
        amount: amtForOrder,
        itemName,
        userName: displayName,
        userAgent,
        signature,
        timestamp,
        auth_return: authReturnUrl,
        CARDCODE: cardCode4,
      };
      if (!stripNonspec) {
        orderBody.USESKIPPAGE = "Y";
        /** 규격서 부록: 일시불 00 (2자리) */
        orderBody.QUOTA = "00";
      }
      if (String(process.env.PAYUP_ORDER_INCLUDE_MERCHANT_IN_BODY ?? "").trim().toLowerCase() === "true") {
        orderBody.merchantId = cred.merchantId;
      }
      /**
       * 모바일(WM): 일부 단말·인앱 브라우저에서 복귀 안정화를 위해 returnUrl 권장.
       * 가맹점이 6003 등으로 거절하면 PAYUP_ORDER_WM_RETURN_URL=false 로 끄세요.
       */
      const wmReturnOff = String(process.env.PAYUP_ORDER_WM_RETURN_URL ?? "").trim().toLowerCase() === "false";
      if (userAgent === "WM" && !wmReturnOff) {
        orderBody.returnUrl = authReturnUrl;
      }
      if (userEmailTrim) {
        orderBody.userEmail = userEmailTrim;
      }

      const orderPayload = applyPayupOrderJsonKeyCasing(orderBody);

      const [inserted] = await db
        .insert(payments)
        .values({
          userId,
          orderId: orderNumber,
          paymentKey: PAYUP_SUBSCRIPTION_PAYMENT_KEY,
          amount,
          status: "pending",
          plan,
          billingPeriod,
        })
        .returning({ id: payments.id });

      const insertedId = inserted?.id;
      if (!insertedId) {
        return res.status(500).json({ message: "결제 준비 레코드를 만들지 못했습니다." });
      }

      const orderBodyFormat = String(process.env.PAYUP_ORDER_BODY_FORMAT ?? "").trim().toLowerCase();
      const useFormBody = orderBodyFormat === "form" || orderBodyFormat === "urlencoded";
      /** 페이업 AP `/order` 는 대부분 `application/json` 만 허용해 form-first 시 415가 난다 — 항상 JSON 우선, form 은 보조 */
      let orderRes = await payupPostJson<Record<string, unknown>>(cred, orderPath, orderPayload);
      if (!orderRes.ok && useFormBody) {
        const formRes = await payupPostUrlEncodedJson<Record<string, unknown>>(cred, orderPath, orderPayload);
        if (formRes.ok || orderRes.status === 415) {
          orderRes = formRes;
        }
      }
      if (!orderRes.ok) {
        const safeBody = JSON.stringify(
          Object.fromEntries(
            Object.entries(orderPayload).map(([k, v]) => [k, /signature/i.test(k) ? "[redacted]" : v]),
          ),
        );
        console.error(
          "[payup] order failed",
          {
            status: orderRes.status,
            message: orderRes.message,
            orderNumber,
            path: orderPath,
            bodyFormat: useFormBody ? "json_then_form_if_needed" : "json",
            bodyKeys: Object.keys(orderPayload),
            amountStyle: String(process.env.PAYUP_ORDER_AMOUNT_STYLE ?? "").trim() || "plain(default)",
            jsonKeys: String(process.env.PAYUP_ORDER_JSON_KEYS ?? "").trim() || "lower(default)",
            payupOrderMerchantInBody: Boolean(orderPayload.merchantId || orderPayload.MERCHANTID),
            payupOrderStripNonspec: stripNonspec,
            signatureAmount: amtForSignature,
            bodyAmount: amtForOrder,
            safeBody: safeBody.slice(0, 1500),
          },
          orderRes.bodyText?.slice(0, 800),
        );
        await db.delete(payments).where(eq(payments.id, insertedId));
        /** 502는 리버스 프록시 장애와 혼동되므로, 페이업 거절·통신 실패는 422로 구분 */
        return res.status(422).json({
          message: orderRes.message || "페이업 주문(order) 요청에 실패했습니다.",
          detail: orderRes.bodyText,
          payupHttpStatus: orderRes.status,
        });
      }

      const d = orderRes.data;
      if (!d || typeof d !== "object") {
        await db.delete(payments).where(eq(payments.id, insertedId));
        return res.status(422).json({ message: "페이업 주문 응답이 비어 있습니다." });
      }
      const flat = payupOrderResponseAsFlatRecord(d as Record<string, unknown>);
      const pf = pickPayupDirectOrderFields(flat);
      if (pf.responseCode !== "0000" || !pf.payUrl || !pf.starturl || !pf.startparams) {
        await db.delete(payments).where(eq(payments.id, insertedId));
        let preview = "";
        try {
          preview = JSON.stringify(flat).slice(0, 600);
        } catch {
          /* ignore */
        }
        return res.status(422).json({
          message: pf.responseMsg || `페이업 주문 거절(${pf.responseCode || "?"})`,
          responseCode: pf.responseCode || undefined,
          detail: pf.responseMsg,
          missing: {
            payUrl: !pf.payUrl,
            starturl: !pf.starturl,
            startparams: !pf.startparams,
          },
          payupResponseKeys: Object.keys(flat).slice(0, 40),
          payupResponsePreview: preview || undefined,
        });
      }

      const cancelOut = (pf.cancelUrl && pf.cancelUrl.length > 0 ? pf.cancelUrl : `${site}/pricing?payup=cancel`).slice(
        0,
        255,
      );
      const cardOut = (pf.cardCode && pf.cardCode.length >= 4 ? pf.cardCode : cardCode4).slice(0, 4);

      const pgTxnOrder = pickPayupStr(flat, "transactionId", "TRANSACTIONID", "tranId", "TRAN_ID");
      const pgTidOrder = pickPayupStr(flat, "tid", "TID");
      const payupMetaBase: Record<string, unknown> = {
        payUrl: pf.payUrl,
        startUrl: pf.starturl,
        cancelUrl: cancelOut,
        cardCode: cardOut,
        merchantOrderId: orderNumber,
      };
      if (pgTxnOrder) payupMetaBase.pgTransactionId = pgTxnOrder;
      if (pgTidOrder && pgTidOrder !== pgTxnOrder) payupMetaBase.pgTid = pgTidOrder;

      await db.update(payments).set({ payupMeta: payupMetaBase }).where(eq(payments.id, insertedId));

      return res.json({
        starturl: pf.starturl,
        startparams: pf.startparams,
        cancelUrl: cancelOut,
        cardCode: cardOut,
        orderNumber,
      });
    } catch (err: any) {
      console.error("PayUp subscription order error:", err);
      res.status(500).json({ message: err?.message || "페이업 주문 처리에 실패했습니다" });
    }
  });

  /** 규격서 3.3·3.4 — auth_return 수신 후 payUrl 로 RETURNPARAMS(JSON) 승인. 일부 PG는 브라우저 GET 리다이렉트로 복귀 → GET·POST 모두 수신 */
  const handlePayupSubscriptionComplete = async (req: Request, res: Response): Promise<void> => {
    try {
      const cred = getPayupCredentials();
      if (!cred.ok) {
        redirectPricingPayupOutcome(res, "fail");
        return;
      }
      const body = (req.body && typeof req.body === "object" ? req.body : {}) as Record<string, unknown>;
      const q = req.query as Record<string, unknown>;
      let blob = readPayupReturnParamsFromReq(req);
      if (!blob.trim()) {
        const synth = buildPayupReturnParamsBlobFromQueryBody(q, body);
        if (synth) blob = synth;
      }
      const parsed = blob ? tryParsePayupReturnJson(blob) : null;

      const pickFlat = (src: Record<string, unknown>, k: string): string => {
        const v = src[k];
        if (typeof v === "string" && v.trim()) return v.trim();
        if (Array.isArray(v) && typeof v[0] === "string" && v[0].trim()) return v[0].trim();
        return "";
      };
      let orderNumber =
        (parsed && payupOrderNumberFromParsed(parsed)) ||
        (typeof body.orderNumber === "string" && body.orderNumber.trim()) ||
        (typeof body.orderId === "string" && body.orderId.trim()) ||
        pickFlat(body, "orderNumber") ||
        pickFlat(body, "orderId") ||
        pickFlat(body, "moid") ||
        pickFlat(body, "MOID") ||
        pickFlat(q, "orderNumber") ||
        pickFlat(q, "orderId") ||
        pickFlat(q, "moid") ||
        pickFlat(q, "MOID") ||
        "";

      /** 일부 복귀: 쿼리 transactionId 에 가맹점 주문번호(S…)만 있고 본문 JSON에는 orderNumber 키가 없음 */
      if (!orderNumber) {
        const tidQ = pickFlat(q, "transactionId") || pickFlat(q, "TRANSACTIONID");
        if (tidQ && looksLikeVenysoundPayupMerchantOrderId(tidQ)) {
          const canon = tidQ.toUpperCase();
          const [hit] = await db
            .select()
            .from(payments)
            .where(sql`lower(trim(${payments.orderId})) = ${canon.toLowerCase()}`)
            .limit(1);
          if (hit) orderNumber = String(hit.orderId ?? "").trim().toUpperCase();
        }
      }

      /** 쿼리 transactionId 가 PG TID 인 경우 — 주문 응답에서 저장한 payup_meta.pgTransactionId / pgTid 로 역조회 */
      if (!orderNumber) {
        const pgRef =
          pickFlat(q, "transactionId") ||
          pickFlat(q, "TRANSACTIONID") ||
          pickFlat(q, "TID") ||
          pickFlat(q, "tid") ||
          pickFlat(body, "transactionId") ||
          pickFlat(body, "TRANSACTIONID") ||
          pickFlat(body, "TID") ||
          pickFlat(body, "tid");
        if (pgRef && !looksLikeVenysoundPayupMerchantOrderId(pgRef)) {
          const hit = await findPendingPayupSubscriptionByPgRef(pgRef);
          if (hit) orderNumber = hit.orderId;
        }
      }

      if (orderNumber && looksLikeVenysoundPayupMerchantOrderId(orderNumber)) {
        orderNumber = orderNumber.toUpperCase();
      }

      if (!orderNumber) {
        console.warn("[payup] complete: orderNumber 없음", req.method, {
          queryKeys: Object.keys(q),
          queryValueLens: Object.entries(q)
            .slice(0, 16)
            .map(([k, v]) => [k, typeof v === "string" ? v.length : Array.isArray(v) ? String(v[0] ?? "").length : 0]),
          hasBody: Object.keys(body).length > 0,
          blobLen: blob.length,
        });
        redirectPricingPayupOutcome(res, "fail");
        return;
      }

      const [payment] = await db.select().from(payments).where(eq(payments.orderId, orderNumber));
      if (!payment) {
        console.warn("[payup] complete: 알 수 없는 주문", orderNumber);
        redirectPricingPayupOutcome(res, "fail");
        return;
      }
      if (payment.status === "paid") {
        redirectPricingPayupOutcome(res, "success");
        return;
      }
      if (payment.paymentKey !== PAYUP_SUBSCRIPTION_PAYMENT_KEY || payment.status !== "pending") {
        redirectPricingPayupOutcome(res, "fail");
        return;
      }

      const meta = payment.payupMeta as Record<string, unknown> | null | undefined;
      const payUrlRaw = meta && typeof meta.payUrl === "string" ? meta.payUrl.trim() : "";
      if (!payUrlRaw || !blob.trim()) {
        console.error("[payup] complete: payUrl 또는 RETURNPARAMS 없음", orderNumber);
        redirectPricingPayupOutcome(res, "fail");
        return;
      }

      const payRes = await payupDirectPostPayUrl(cred, payUrlRaw, blob.trim());
      if (!payRes.ok || !payRes.data || typeof payRes.data !== "object") {
        const bt = "bodyText" in payRes ? String((payRes as { bodyText?: string }).bodyText ?? "") : "";
        const payResMessage = "message" in payRes ? payRes.message : undefined;
        console.error("[payup] payUrl 승인 실패", payResMessage, orderNumber, "http", payRes.status, bt.slice(0, 500));
        redirectPricingPayupOutcome(res, "fail");
        return;
      }
      const payData = payRes.data as Record<string, unknown>;
      if ((pickPayupStr(payData, "responseCode", "RESPONSECODE") ?? "") !== "0000") {
        console.error(
          "[payup] 승인 거절",
          orderNumber,
          pickPayupStr(payData, "responseCode", "RESPONSECODE"),
          pickPayupStr(payData, "responseMsg", "RESPONSEMSG"),
        );
        redirectPricingPayupOutcome(res, "fail");
        return;
      }
      const txnId = payupTxnIdFromParsed(payData);
      if (!txnId) {
        console.error("[payup] 승인 응답에 transactionId 없음", orderNumber);
        redirectPricingPayupOutcome(res, "fail");
        return;
      }
      const amtResp = Number(pickPayupStr(payData, "amount", "AMOUNT"));
      if (Number.isFinite(amtResp) && amtResp > 0 && amtResp !== payment.amount) {
        console.error("[payup] 승인 금액 불일치", payment.amount, amtResp, orderNumber);
        redirectPricingPayupOutcome(res, "fail");
        return;
      }

      const now = new Date();
      const { computed, payUser, tierPaid, expiresAt } = await applyBankTransferSubscriptionToUserFromPayment(payment);
      await db
        .update(payments)
        .set({
          status: "paid",
          paymentKey: `payup:${txnId}`,
          payupMeta: {
            ...(meta && typeof meta === "object" ? meta : {}),
            completedAt: now.toISOString(),
            txnId,
          },
        })
        .where(eq(payments.id, payment.id));

      const bankSubKind = payUser ? subscriptionPaymentEmailKind(payUser, now, tierPaid) : "started";
      const bankBp =
        payment.billingPeriod === "yearly" || payment.billingPeriod === "monthly"
          ? payment.billingPeriod
          : null;
      const bankRecipient = payUser ? `${payUser.firstName || ""} ${payUser.lastName || ""}`.trim() || null : null;
      await notifyUserSubscriptionPaidInApp({
        userId: payment.userId,
        tierPaid,
        billingPeriod: bankBp,
        amountWon: payment.amount,
        source: "payup_card",
      });
      void sendSubscriptionEmail(payUser?.email, {
        kind: bankSubKind,
        planId: tierPaid,
        billingPeriod: bankBp,
        expiresAt: computed.subscriptionExpiresAt ?? expiresAt,
        amountWon: payment.amount,
        recipientName: bankRecipient,
      });

      redirectPricingPayupOutcome(res, "success");
    } catch (err) {
      console.error("PayUp subscription complete error:", err);
      redirectPricingPayupOutcome(res, "fail");
    }
  };
  app.post("/api/subscription/payup/complete", handlePayupSubscriptionComplete);
  app.get("/api/subscription/payup/complete", handlePayupSubscriptionComplete);

  /**
   * 카드창 복귀 후 멤버십이 안 바뀐 것처럼 보일 때 — 동일 주문이 서버에서 paid 됐는지 확인 (폴링·복구 UI용)
   */
  app.get("/api/subscription/payup/checkout-status", isAuthenticated, async (req, res) => {
    try {
      const orderNumber = String(req.query.orderNumber ?? "").trim();
      if (!orderNumber) {
        return res.status(400).json({ message: "orderNumber 가 필요합니다." });
      }
      // @ts-ignore
      const userId = req.user.claims.sub as string;
      const [row] = await db.select().from(payments).where(eq(payments.orderId, orderNumber));
      if (!row || row.userId !== userId) {
        return res.json({ status: "none" as const });
      }
      if (row.status === "paid") {
        const repair = await repairPaidSubscriptionPaymentReflectionIfNeeded(row);
        return res.json({ status: "paid" as const, repaired: repair.repaired });
      }
      if (row.status === "pending" && row.paymentKey === PAYUP_SUBSCRIPTION_PAYMENT_KEY) {
        return res.json({ status: "pending" as const });
      }
      return res.json({ status: "none" as const });
    } catch (err) {
      console.error("[payup] checkout-status", err);
      res.status(500).json({ message: "상태를 확인하지 못했습니다." });
    }
  });

  /**
   * 카드사에는 승인됐는데 /complete 가 호출되지 않아 pending 만 남은 경우 —
   * PAYUP_TXN_RECONCILE_PATH 로 PG 조회 후 0000 이면 paid+구독 반영.
   * body.orderNumber 가 있으면 해당 주문만, 없으면 최근 pending 을 순서대로 시도.
   */
  app.post("/api/subscription/payup/sync-approved-pending", isAuthenticated, async (req, res) => {
    try {
      const rawOrder = String((req.body as { orderNumber?: unknown })?.orderNumber ?? "").trim();
      const orderUpper = rawOrder.toUpperCase();
      // @ts-ignore
      const userId = req.user.claims.sub as string;

      const baseWhere = and(
        eq(payments.userId, userId),
        eq(payments.status, "pending"),
        eq(payments.paymentKey, PAYUP_SUBSCRIPTION_PAYMENT_KEY),
        inArray(payments.plan, PAID_PLAN_IDS_FOR_PAYMENTS),
      );
      const rows = await db
        .select()
        .from(payments)
        .where(orderUpper ? and(baseWhere, eq(payments.orderId, orderUpper)) : baseWhere)
        .orderBy(desc(payments.createdAt))
        .limit(orderUpper ? 1 : 12);

      if (!rows.length) {
        return res.status(404).json({ ok: false, message: "해당 미승인 카드 구독 주문을 찾을 수 없습니다." });
      }

      let lastMsg = "";
      for (const row of rows) {
        const out = await finalizePayupPendingSubscriptionFromPgInquiryForRow(row);
        if (out.ok) return res.json({ ...out, ok: true });
        lastMsg = out.message;
      }
      return res.status(400).json({ ok: false, message: lastMsg || "PG 승인 반영에 실패했습니다." });
    } catch (err) {
      console.error("[payup] sync-approved-pending", err);
      res.status(500).json({ ok: false, message: "처리하지 못했습니다." });
    }
  });

  /** 관리자: 미승인 카드 구독 1건 — PG 조회로 실제 승인이면 paid+회원 구독 반영 */
  app.post("/api/admin/payments/:id/finalize-payup-pending-inquiry", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const paymentId = String(req.params.id ?? "").trim();
      if (!paymentId) return res.status(400).json({ message: "id 가 필요합니다." });
      const [p] = await db.select().from(payments).where(eq(payments.id, paymentId));
      if (!p) return res.status(404).json({ message: "결제 건을 찾을 수 없습니다." });
      const out = await finalizePayupPendingSubscriptionFromPgInquiryForRow(p);
      if (!out.ok) return res.status(400).json({ message: out.message });
      res.json({ success: true, orderId: out.orderId, alreadyPaid: out.alreadyPaid === true });
    } catch (err) {
      console.error("[admin finalize-payup-pending-inquiry]", err);
      res.status(500).json({ message: "처리하지 못했습니다." });
    }
  });

  const payupWebhookSecretOk = (req: Request): boolean => {
    const secret = (process.env.PAYUP_WEBHOOK_SECRET ?? "").trim();
    if (!secret) return true;
    const auth = (req.get("authorization") ?? "").trim();
    if (auth === `Bearer ${secret}`) return true;
    if ((req.get("x-payup-webhook-secret") ?? "").trim() === secret) return true;
    return false;
  };

  const handlePayupPgNotifyWebhook = async (req: Request, res: Response): Promise<void> => {
    try {
      if (!payupWebhookSecretOk(req)) {
        res.status(401).json({ ok: false, message: "unauthorized" });
        return;
      }
      let rawBody: unknown = req.body;
      if (typeof rawBody === "string") {
        try {
          rawBody = JSON.parse(rawBody);
        } catch {
          rawBody = {};
        }
      }
      const qFlat = flattenPayupWebhookPayload(req.query as unknown);
      const bFlat = flattenPayupWebhookPayload(rawBody);
      const flat = { ...qFlat, ...bFlat };
      const result = await tryRevertPaidPayupSubscriptionFromNotifyFlat(flat);
      if (result.action === "reverted" && result.downgradedUser && result.userId) {
        try {
          await storage.createNotification({
            userId: result.userId,
            type: "system",
            message:
              "구독 카드 결제가 페이업에서 취소·환불 처리되어 무료 플랜으로 조정되었습니다. AI 생성 한도가 갱신됩니다.",
            payload: { subscriptionReverted: true, source: "payup_webhook" },
            url: "/create-music",
          });
        } catch (e) {
          console.error("[payup webhook] notification", e);
        }
      }
      if (String(process.env.PAYUP_WEBHOOK_DEBUG ?? "").trim().toLowerCase() === "true") {
        console.log("[payup webhook]", result.action, result.detail, Object.keys(flat).slice(0, 40));
      }
      res.json({ ok: true, ...result });
    } catch (e) {
      console.error("[payup webhook]", e);
      res.status(500).json({ ok: false, message: "webhook error" });
    }
  };

  /** 페이업·PG에서 취소·환불 통지 URL로 등록 (본문 형식은 가맹점 계약 문서 기준). `PAYUP_WEBHOOK_SECRET` 설정 시 Bearer 또는 x-payup-webhook-secret 일치 필요 */
  app.post("/api/webhooks/payup", handlePayupPgNotifyWebhook);
  app.get("/api/webhooks/payup", handlePayupPgNotifyWebhook);

  /**
   * 로그인 사용자 최신 페이업 카드 구독(paid)에 대해 PG 조회 API로 취소 여부를 맞춤.
   * `PAYUP_TXN_RECONCILE_PATH` 가 비어 있으면 HTTP 조회는 하지 않음(웹훅만으로 동기화 가능).
   */
  app.post("/api/subscription/payup/reconcile-latest", isAuthenticated, async (req, res) => {
    try {
      const force =
        String((req.body as { force?: unknown } | undefined)?.force ?? "").trim().toLowerCase() === "true" ||
        String(req.query.force ?? "").trim().toLowerCase() === "true";
      // @ts-ignore
      const userId = req.user.claims.sub as string;
      const pathSet = (process.env.PAYUP_TXN_RECONCILE_PATH ?? "").trim().length > 0;
      if (!pathSet) {
        return res.json({
          ok: true,
          action: "http_not_configured" as const,
          hint: "Set PAYUP_TXN_RECONCILE_PATH from PayUp docs, or register webhook to POST/GET /api/webhooks/payup",
        });
      }
      const cred = getPayupCredentials();
      if (!cred.ok) {
        return res.json({ ok: true, action: "payup_credentials_missing" as const });
      }
      const [latest] = await db
        .select()
        .from(payments)
        .where(
          and(
            eq(payments.userId, userId),
            eq(payments.status, "paid"),
            inArray(payments.plan, PAID_PLAN_IDS_FOR_PAYMENTS),
            or(
              sql`${payments.paymentKey} ILIKE 'payup:%'`,
              and(
                sql`coalesce(trim(${payments.payupMeta}->>'txnId'), '') <> ''`,
                sql`coalesce(${payments.paymentKey}, '') <> 'bank_transfer'`,
              ),
            ),
          ),
        )
        .orderBy(desc(payments.createdAt))
        .limit(1);
      if (!latest) {
        return res.json({ ok: true, action: "none" as const, reason: "no_paid_payup_subscription" });
      }
      const meta =
        latest.payupMeta && typeof latest.payupMeta === "object" ? (latest.payupMeta as Record<string, unknown>) : {};
      const last = meta.pgReconcileCheckedAt;
      if (
        !force &&
        typeof last === "string" &&
        last.length >= 10 &&
        !Number.isNaN(Date.parse(last)) &&
        Date.now() - Date.parse(last) < 180_000
      ) {
        return res.json({ ok: true, action: "throttled" as const });
      }
      const pk = String(latest.paymentKey ?? "").trim();
      const fromPk = /^payup:(.+)$/i.exec(pk);
      const txnId =
        (fromPk?.[1] ?? "").trim() ||
        (typeof meta.txnId === "string" ? meta.txnId.trim() : "");
      if (!txnId) {
        return res.json({ ok: true, action: "none" as const, reason: "no_txn_id" });
      }
      const pg = await payupHttpReconcileTransactionCancelled(cred, txnId);
      const mergedMeta: Record<string, unknown> = {
        ...meta,
        pgReconcileCheckedAt: new Date().toISOString(),
      };
      if (!pg.ok) {
        mergedMeta.pgReconcileLastError = pg.message;
      } else if ("skipped" in pg && pg.skipped) {
        mergedMeta.pgReconcileLastError = pg.reason;
      } else {
        mergedMeta.pgReconcileLastError = null;
      }
      await db.update(payments).set({ payupMeta: mergedMeta }).where(eq(payments.id, latest.id));

      if (!pg.ok) {
        return res.json({ ok: true, action: "http_error" as const, message: pg.message });
      }
      if ("skipped" in pg && pg.skipped) {
        return res.json({ ok: true, action: "http_skipped" as const, reason: pg.reason });
      }
      if (!("cancelledAtPg" in pg) || !pg.cancelledAtPg) {
        return res.json({ ok: true, action: "still_paid_at_pg" as const });
      }
      const out = await revertPayupCardSubscriptionPaymentById(latest.id);
      if (!out.ok) {
        return res.json({ ok: true, action: "revert_failed" as const, message: out.message });
      }
      if (out.noop === "already_refunded") {
        return res.json({ ok: true, action: "already_refunded_db" as const });
      }
      if (out.downgradedUser) {
        try {
          await storage.createNotification({
            userId: out.userId,
            type: "system",
            message:
              "구독 카드 결제가 페이업에서 취소·환불로 확인되어 무료 플랜으로 조정되었습니다. AI 생성 한도가 갱신됩니다.",
            payload: { subscriptionReverted: true, source: "payup_http_reconcile" },
            url: "/create-music",
          });
        } catch (e) {
          console.error("[payup reconcile-latest] notify", e);
        }
      }
      res.json({
        ok: true,
        action: out.downgradedUser ? ("reverted" as const) : ("refunded_payment_only" as const),
      });
    } catch (err) {
      console.error("[payup reconcile-latest]", err);
      res.status(500).json({ message: "처리하지 못했습니다." });
    }
  });

  /** PG 취소·실패 복귀 후 구독·결제 행 보정 (주문번호 없으면 최근 pending 페이업 주문) */
  app.post("/api/subscription/payup/align-after-abandon", isAuthenticated, async (req, res) => {
    try {
      // @ts-ignore
      const userId = req.user.claims.sub as string;
      const outcomeRaw = String((req.body as { outcome?: unknown })?.outcome ?? "cancel").trim().toLowerCase();
      const outcome: "cancel" | "fail" = outcomeRaw === "fail" ? "fail" : "cancel";
      const orderRaw = String((req.body as { orderNumber?: unknown })?.orderNumber ?? "").trim().toUpperCase();

      if (orderRaw && looksLikeVenysoundPayupMerchantOrderId(orderRaw)) {
        const aligned = await alignSubscriptionAfterPayupCheckoutAbandon(userId, orderRaw, outcome);
        return res.json({ ok: true as const, ...aligned });
      }

      const [latestPending] = await db
        .select()
        .from(payments)
        .where(
          and(
            eq(payments.userId, userId),
            eq(payments.status, "pending"),
            eq(payments.paymentKey, PAYUP_SUBSCRIPTION_PAYMENT_KEY),
            inArray(payments.plan, PAID_PLAN_IDS_FOR_PAYMENTS),
          ),
        )
        .orderBy(desc(payments.createdAt))
        .limit(1);
      if (latestPending?.orderId) {
        const aligned = await alignSubscriptionAfterPayupCheckoutAbandon(userId, latestPending.orderId, outcome);
        return res.json({ ok: true as const, ...aligned });
      }

      await tryReconcileAllPaidPayupSubscriptionsForUser(userId);
      const now = new Date();
      const downgraded = (await ensureUserSubscriptionBackedByPaidPayment(userId, now)) === "downgraded";
      const tier = await subscriptionMeTierForUser(userId, now);
      return res.json({ ok: true as const, tier, downgraded });
    } catch (err) {
      console.error("[payup] align-after-abandon", err);
      return res.status(500).json({ message: "처리하지 못했습니다." });
    }
  });

  /**
   * PG 취소·승인 실패 후 브라우저가 `?payup=cancel|fail` 로만 복귀할 때 — 서버는 PG 취소를 직접 받지 못하므로
   * 클라이언트가 sessionStorage 의 주문번호와 함께 호출하면 인앱 알림 1회(중복 방지: payup_meta.abandonNotifiedAt).
   * SMS 는 본 API에 없음(페이업/별도 문자 대행 설정 필요).
   */
  app.post("/api/subscription/payup/client-outcome", isAuthenticated, async (req, res) => {
    try {
      const orderNumberRaw = String(req.body?.orderNumber ?? "").trim();
      const orderNumber = orderNumberRaw.toUpperCase();
      const outcome = String(req.body?.outcome ?? "").trim().toLowerCase();
      if (!orderNumber || !looksLikeVenysoundPayupMerchantOrderId(orderNumber)) {
        return res.status(400).json({ message: "유효하지 않은 주문번호입니다." });
      }
      if (outcome !== "cancel" && outcome !== "fail") {
        return res.status(400).json({ message: "outcome 은 cancel 또는 fail 이어야 합니다." });
      }
      // @ts-ignore
      const userId = req.user.claims.sub as string;
      const [row] = await db.select().from(payments).where(eq(payments.orderId, orderNumber)).limit(1);
      if (!row || row.userId !== userId) {
        const tierOnly = await subscriptionMeTierForUser(userId, new Date());
        return res.json({ ok: true as const, tier: tierOnly, downgraded: false });
      }

      const meta = (row.payupMeta && typeof row.payupMeta === "object" ? row.payupMeta : {}) as Record<string, unknown>;
      const alreadyNotified =
        typeof meta.abandonNotifiedAt === "string" && meta.abandonNotifiedAt.length >= 10;
      if (!alreadyNotified) {
        const message =
          outcome === "cancel"
            ? "카드 구독 결제를 취소하셨습니다. 청구·승인 여부는 카드사·페이업 내역에서 확인할 수 있습니다."
            : "카드 구독 결제가 승인 단계에서 완료되지 않았습니다. 잠시 후 다시 시도하거나 계좌이체를 이용해 주세요.";
        try {
          await storage.createNotification({
            userId,
            type: "system",
            message,
            payload: { payupAbandon: true, orderId: orderNumber, outcome },
            url: "/pricing",
          });
        } catch (e) {
          console.error("[payup] client-outcome notification", e);
        }
      }

      const aligned = await alignSubscriptionAfterPayupCheckoutAbandon(userId, orderNumber, outcome);
      if (!alreadyNotified && row.status === "pending" && row.paymentKey === PAYUP_SUBSCRIPTION_PAYMENT_KEY) {
        const [again] = await db.select().from(payments).where(eq(payments.id, row.id));
        const m2 =
          again?.payupMeta && typeof again.payupMeta === "object"
            ? (again.payupMeta as Record<string, unknown>)
            : meta;
        if (typeof m2.abandonNotifiedAt !== "string" || m2.abandonNotifiedAt.length < 10) {
          await db
            .update(payments)
            .set({
              payupMeta: {
                ...m2,
                abandonNotifiedAt: new Date().toISOString(),
                abandonOutcome: outcome,
              },
            })
            .where(eq(payments.id, row.id));
        }
      }

      return res.json({
        ok: true as const,
        tier: aligned.tier,
        downgraded: aligned.downgraded,
        skipped: alreadyNotified ? (true as const) : undefined,
      });
    } catch (err) {
      console.error("[payup] client-outcome", err);
      return res.status(500).json({ message: "처리하지 못했습니다." });
    }
  });

  /** [페이업] 신용카드 부분취소 RESTful API — 관리자 전용 */
  app.post("/api/admin/payup/part-cancel", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const cred = getPayupCredentials();
      if (!cred.ok) {
        return res.status(503).json({ message: cred.message });
      }
      const transactionId = typeof req.body?.transactionId === "string" ? req.body.transactionId.trim() : "";
      const cancelAmount = Number(req.body?.cancelAmount);
      const cancelReason =
        typeof req.body?.cancelReason === "string" ? req.body.cancelReason.trim() : "관리자 부분취소";
      if (!transactionId) {
        return res.status(400).json({ message: "transactionId 가 필요합니다." });
      }
      if (!Number.isFinite(cancelAmount) || cancelAmount < 1) {
        return res.status(400).json({ message: "cancelAmount 는 1 이상의 숫자여야 합니다." });
      }
      const out = await payupPostPartCancel(cred, { transactionId, cancelAmount, cancelReason });
      if (!out.ok) {
        return res.status(502).json({ message: out.message, detail: out.bodyText });
      }
      res.json(out.data);
    } catch (err: any) {
      console.error("[admin payup part-cancel]", err);
      res.status(500).json({ message: err?.message || "부분취소 요청에 실패했습니다" });
    }
  });

  /** 관리자: 우리 사이트에서 페이업 카드 구독 전액취소를 실행하고, 성공 응답을 받은 뒤 DB를 refunded 로 동기화 */
  app.post("/api/admin/payments/:id/cancel-payup-subscription", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const paymentId = String(req.params.id ?? "").trim();
      if (!paymentId) return res.status(400).json({ message: "id 가 필요합니다." });
      const [payment] = await db.select().from(payments).where(eq(payments.id, paymentId));
      if (!payment) return res.status(404).json({ message: "결제 건을 찾을 수 없습니다." });

      const status = String(payment.status ?? "").trim().toLowerCase();
      if (status === "refunded") {
        const out = await revertPayupCardSubscriptionPaymentById(payment.id);
        if (!out.ok) return res.status(400).json({ message: out.message });
        if (out.downgradedUser) {
          try {
            await storage.createNotification({
              userId: out.userId,
              type: "system",
              message:
                "援щ룆 移대뱶 寃곗젣媛 痍⑥냼 泥섎━?섏뼱 臾대즺 ?뚮옖?쇰줈 議곗젙?섏뿀?듬땲?? AI ?앹꽦 ?쒕룄媛 媛깆떊?⑸땲??",
              payload: { subscriptionReverted: true, source: "payup_admin_cancel_api_already_refunded" },
              url: "/create-music",
            });
          } catch (e) {
            console.error("[admin cancel-payup-subscription] notify already-refunded", e);
          }
        }
        return res.json({ success: true, alreadyRefunded: true, downgradedUser: out.downgradedUser });
      }
      if (status !== "paid") {
        return res.status(400).json({ message: `paid 상태의 페이업 카드 구독 건만 취소할 수 있습니다. (현재: ${payment.status ?? "?"})` });
      }
      if (!isPayupPaidSubscriptionPayment(payment)) {
        return res.status(400).json({ message: "페이업 카드 구독 결제만 취소할 수 있습니다." });
      }

      const cred = getPayupCredentials();
      if (!cred.ok) return res.status(503).json({ message: cred.message });
      const transactionId = payupTransactionIdFromPayment(payment);
      if (!transactionId) {
        return res.status(400).json({ message: "결제 건에 페이업 거래번호(transactionId)가 없습니다." });
      }

      const cancelRes = await payupPostCancel2(cred, { transactionId });
      if (!cancelRes.ok) {
        return res.status(502).json({ message: cancelRes.message, detail: cancelRes.bodyText });
      }
      const cancelResult = payupCancelApiResponseResult(cancelRes.data);
      if (!cancelResult.ok) {
        const preview = payupJsonPreview(cancelRes.data);
        console.error("[admin cancel-payup-subscription] unrecognized cancel response", {
          paymentId: payment.id,
          orderId: payment.orderId,
          transactionId: `${transactionId.slice(0, 8)}...`,
          responseCode: cancelResult.responseCode || null,
          responseMsg: cancelResult.responseMsg || null,
          keys: Object.keys(cancelResult.flat).slice(0, 40),
          preview,
        });
        return res.status(502).json({
          message: "페이업 취소 API 응답에서 취소 성공을 확인하지 못했습니다.",
          responseCode: cancelResult.responseCode || undefined,
          responseMsg: cancelResult.responseMsg || undefined,
          detail: preview || undefined,
        });
      }

      const meta =
        payment.payupMeta && typeof payment.payupMeta === "object"
          ? ({ ...(payment.payupMeta as Record<string, unknown>) } as Record<string, unknown>)
          : {};
      await db
        .update(payments)
        .set({
          payupMeta: {
            ...meta,
            pgCancelApiCalledAt: new Date().toISOString(),
            pgCancelApiResponseCode: cancelResult.responseCode || null,
            pgCancelApiResponseMsg: cancelResult.responseMsg || null,
          },
        })
        .where(eq(payments.id, payment.id));

      const out = await revertPayupCardSubscriptionPaymentById(payment.id);
      if (!out.ok) return res.status(400).json({ message: out.message });
      if (out.noop === "already_refunded") {
        return res.json({ success: true, alreadyRefunded: true, downgradedUser: false });
      }
      if (out.downgradedUser) {
        try {
          await storage.createNotification({
            userId: out.userId,
            type: "system",
            message:
              "구독 카드 결제가 취소 처리되어 무료 플랜으로 조정되었습니다. AI 생성 한도가 갱신됩니다.",
            payload: { subscriptionReverted: true, source: "payup_admin_cancel_api" },
            url: "/create-music",
          });
        } catch (e) {
          console.error("[admin cancel-payup-subscription] notify", e);
        }
      }
      res.json({ success: true, downgradedUser: out.downgradedUser });
    } catch (err: any) {
      console.error("[admin cancel-payup-subscription]", err);
      res.status(500).json({ message: err?.message || "페이업 취소 처리에 실패했습니다." });
    }
  });

  app.post("/api/admin/payments/:id/confirm-bank", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const paymentId = req.params.id as string;
      const [payment] = await db.select().from(payments).where(eq(payments.id, paymentId));
      if (!payment) return res.status(404).json({ message: "결제 건을 찾을 수 없습니다" });
      if (payment.status !== "pending" || payment.paymentKey !== "bank_transfer") {
        return res.status(400).json({ message: "계좌이체 대기 건만 확인할 수 있습니다" });
      }

      const planNorm = String(payment.plan ?? "").trim().toLowerCase();

      if (planNorm === "credit_charge") {
        const supplyWon = walletSupplyWonFromTotalPaymentVatInclusive(payment.amount);
        await storage.addCredits(payment.userId, supplyWon);
        await storage.createCreditTransaction({
          userId: payment.userId,
          type: "charge",
          amount: supplyWon,
          description: `지갑 충전 ${supplyWon.toLocaleString("ko-KR")}원 적립 (계좌이체, 총결제 ${payment.amount.toLocaleString("ko-KR")}원)`,
        });
        await storage.createNotification({
          userId: payment.userId,
          type: "system",
          message: `지갑에 ${supplyWon.toLocaleString("ko-KR")}원이 충전되었습니다`,
          payload: { amount: supplyWon, balanceWon: supplyWon },
          url: "/credits",
        });
        await db.update(payments).set({ status: "paid" }).where(eq(payments.id, paymentId));
        return res.json({ success: true, credits: supplyWon, balanceWon: supplyWon });
      }

      const now = new Date();
      const { computed, payUser, tierPaid, expiresAt } = await applyBankTransferSubscriptionToUserFromPayment(payment);
      await db.update(payments).set({ status: "paid" }).where(eq(payments.id, paymentId));

      const bankSubKind = payUser ? subscriptionPaymentEmailKind(payUser, now, tierPaid) : "started";
      const bankBp =
        payment.billingPeriod === "yearly" || payment.billingPeriod === "monthly"
          ? payment.billingPeriod
          : null;
      const bankRecipient = payUser
        ? `${payUser.firstName || ""} ${payUser.lastName || ""}`.trim() || null
        : null;
      await notifyUserSubscriptionPaidInApp({
        userId: payment.userId,
        tierPaid,
        billingPeriod: bankBp,
        amountWon: payment.amount,
        source: "bank_transfer",
      });
      void sendSubscriptionEmail(payUser?.email, {
        kind: bankSubKind,
        planId: tierPaid,
        billingPeriod: bankBp,
        expiresAt: computed.subscriptionExpiresAt ?? expiresAt,
        amountWon: payment.amount,
        recipientName: bankRecipient,
      });

      res.json({ success: true, expiresAt, tier: computed.subscriptionTier });
    } catch (err) {
      console.error("Confirm bank payment error:", err);
      res.status(500).json({ message: "입금 확인 처리에 실패했습니다" });
    }
  });

  /**
   * 이미 paid 인 계좌이체 구독 건에 대해 users.subscription* 만 다시 적용.
   * (과거 버그: 먼저 paid 처리 후 유저 갱신이 실패하면 결제만 남고 티어는 free 인 경우 복구)
   */
  app.post("/api/admin/payments/:id/repair-bank-subscription", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const paymentId = req.params.id as string;
      const [payment] = await db.select().from(payments).where(eq(payments.id, paymentId));
      if (!payment) return res.status(404).json({ message: "결제 건을 찾을 수 없습니다" });
      const paymentKey = String(payment.paymentKey ?? "").trim();
      const canRepairSubscriptionPayment =
        paymentKey === "bank_transfer" || isPayupPaidSubscriptionPayment(payment);
      if (!canRepairSubscriptionPayment) {
        return res.status(400).json({ message: "구독 결제 반영 복구가 가능한 건이 아닙니다" });
      }
      if (payment.status !== "paid") {
        return res.status(400).json({ message: "완료(paid)된 결제만 구독 반영 복구가 가능합니다" });
      }
      const planNorm = String(payment.plan ?? "").trim().toLowerCase();
      if (planNorm === "credit_charge" || !isPaidSubscriptionTierId(planNorm)) {
        return res.status(400).json({ message: "구독(유료 플랜) 결제 건만 복구할 수 있습니다" });
      }

      /**
       * 매 클릭마다 만료를 `지금+1달`로 다시 잡으면 merge 가 미세하게 연장되어
       * subscription-ai-wallet 의 subPeriodRenewedForward 로 월 공급가가 반복 충전됨 → 기존 활성 만료일 고정.
       */
      const tierPaid = planNorm as PaidSubscriptionTierId;
      const now = new Date();
      const [payUserBefore] = await db.select().from(users).where(eq(users.id, payment.userId));
      const view = buildEntitlementsView(
        payUserBefore?.subscriptionEntitlements,
        payUserBefore?.subscriptionTier,
        payUserBefore?.subscriptionExpiresAt,
        now,
      );
      const prevIso = view[tierPaid];
      const prevPaidExpiry = prevIso ? parseIsoDate(prevIso) : null;
      const applyOpts =
        prevPaidExpiry && prevPaidExpiry > now && !Number.isNaN(prevPaidExpiry.getTime())
          ? { subscriptionExpiresAtOverride: prevPaidExpiry }
          : undefined;

      if (await paidSubscriptionPaymentAlreadyReflected(payment)) {
        return res.json({ success: true, alreadyApplied: true, tier: planNorm, expiresAt: null });
      }

      const { computed, expiresAt } = await applyBankTransferSubscriptionToUserFromPayment(payment, applyOpts);
      // 복구 시에는 메일을 보내지 않음 (과거 입금 확인 메일과 중복 방지)
      res.json({ success: true, tier: computed.subscriptionTier, expiresAt: computed.subscriptionExpiresAt ?? expiresAt });
    } catch (err: any) {
      console.error("[repair-bank-subscription]", err);
      const msg = err?.message === "NOT_A_PAID_SUBSCRIPTION_PLAN" ? "유효한 구독 플랜이 아닙니다" : "구독 반영에 실패했습니다";
      res.status(500).json({ message: msg });
    }
  });

  /**
   * 페이업에서 카드 구독 승인 후 취소·환불한 경우 — PG는 취소됐으나 DB만 paid 인 상태를 맞출 때 사용.
   * 해당 payments 행을 refunded 로 두고, 회원에게 다른 paid 유료 구독 결제가 없으면 구독·구독 AI 지갑을 무료로 초기화.
   */
  app.post("/api/admin/payments/:id/revoke-payup-subscription", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const paymentId = req.params.id as string;
      const out = await revertPayupCardSubscriptionPaymentById(paymentId);
      if (!out.ok) {
        return res.status(400).json({ message: out.message });
      }
      if (out.noop === "already_refunded") {
        return res.json({ success: true, alreadyRefunded: true, downgradedUser: false });
      }
      if (out.downgradedUser) {
        try {
          await storage.createNotification({
            userId: out.userId,
            type: "system",
            message:
              "구독 결제가 환불·취소 처리되어 무료 플랜으로 조정되었습니다. AI 생성 한도는 무료 기준으로 다시 표시됩니다.",
            payload: { subscriptionReverted: true },
            url: "/pricing",
          });
        } catch (e) {
          console.error("[admin revoke-payup-subscription] notify", e);
        }
      }
      res.json({ success: true, downgradedUser: out.downgradedUser });
    } catch (err: any) {
      console.error("[admin revoke-payup-subscription]", err);
      res.status(500).json({ message: err?.message || "처리에 실패했습니다." });
    }
  });

  /**
   * 페이업 거래조회로 카드 구독 결제의 현재 PG 상태를 확인한다.
   * 승인 상태면 DB를 유지하고, 취소·환불 상태가 확인될 때만 refunded + 필요 시 회원 무료화.
   */
  app.post("/api/admin/payments/:id/reconcile-payup-subscription-status", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const paymentId = String(req.params.id ?? "").trim();
      if (!paymentId) return res.status(400).json({ message: "id 가 필요합니다." });
      const [payment] = await db.select().from(payments).where(eq(payments.id, paymentId));
      if (!payment) return res.status(404).json({ message: "결제 건을 찾을 수 없습니다." });

      const out = await reconcilePayupCardSubscriptionPaymentStatusFromPg(payment, "payup_admin_reconcile");
      if (!out.ok) {
        return res.status(400).json({ message: out.message });
      }
      res.json({ success: true, ...out });
    } catch (err: any) {
      console.error("[admin reconcile-payup-subscription-status]", err);
      res.status(500).json({ message: err?.message || "처리에 실패했습니다." });
    }
  });

  /**
   * 테스트·스테이징: 본인 최신 페이업 카드 구독 paid 건을 위와 동일하게 되돌림. 운영에서는 .env 에 넣지 말 것.
   * PAYUP_ALLOW_USER_SELF_REVERT=true 일 때만 허용.
   */
  app.post("/api/subscription/payup/self-revert-last-card-payment", isAuthenticated, async (req, res) => {
    try {
      if (String(process.env.PAYUP_ALLOW_USER_SELF_REVERT ?? "").trim().toLowerCase() !== "true") {
        return res.status(403).json({ message: "비활성화되어 있습니다." });
      }
      // @ts-ignore
      const userId = req.user.claims.sub as string;
      const [latest] = await db
        .select()
        .from(payments)
        .where(
          and(
            eq(payments.userId, userId),
            eq(payments.status, "paid"),
            inArray(payments.plan, PAID_PLAN_IDS_FOR_PAYMENTS),
            or(
              sql`${payments.paymentKey} ILIKE 'payup:%'`,
              and(
                sql`coalesce(trim(${payments.payupMeta}->>'txnId'), '') <> ''`,
                sql`coalesce(${payments.paymentKey}, '') <> 'bank_transfer'`,
              ),
            ),
          ),
        )
        .orderBy(desc(payments.createdAt))
        .limit(1);
      if (!latest) {
        return res.status(404).json({ message: "되돌릴 페이업 카드 구독 결제(paid)가 없습니다." });
      }
      const out = await revertPayupCardSubscriptionPaymentById(latest.id);
      if (!out.ok) {
        return res.status(400).json({ message: out.message });
      }
      if (out.noop === "already_refunded") {
        return res.json({ success: true, alreadyRefunded: true, downgradedUser: false, paymentId: latest.id });
      }
      if (out.downgradedUser) {
        try {
          await storage.createNotification({
            userId: out.userId,
            type: "system",
            message:
              "구독 결제가 되돌려져 무료 플랜으로 조정되었습니다. AI 생성 한도는 무료 기준으로 다시 표시됩니다.",
            payload: { subscriptionSelfReverted: true },
            url: "/create-music",
          });
        } catch (e) {
          console.error("[payup self-revert] notify", e);
        }
      }
      res.json({ success: true, paymentId: latest.id, downgradedUser: out.downgradedUser });
    } catch (err: any) {
      console.error("[payup self-revert]", err);
      res.status(500).json({ message: err?.message || "처리에 실패했습니다." });
    }
  });

  app.delete("/api/admin/payments/:id", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const paymentId = req.params.id as string;
      const [payment] = await db.select().from(payments).where(eq(payments.id, paymentId));
      if (!payment) return res.status(404).json({ message: "결제 건을 찾을 수 없습니다" });
      if (payment.status !== "pending") {
        return res.status(400).json({ message: "대기(pending) 건만 삭제할 수 있습니다" });
      }
      const key = String(payment.paymentKey ?? "");
      if (key !== "bank_transfer" && key !== PAYUP_SUBSCRIPTION_PAYMENT_KEY) {
        return res.status(400).json({
          message: "계좌이체 입금 대기 또는 페이업 카드 구독(미승인) 대기 건만 삭제할 수 있습니다",
        });
      }
      await db
        .delete(payments)
        .where(
          and(
            eq(payments.id, payment.id),
            eq(payments.status, "pending"),
            or(eq(payments.paymentKey, "bank_transfer"), eq(payments.paymentKey, PAYUP_SUBSCRIPTION_PAYMENT_KEY)),
          ),
        );
      res.json({ success: true });
    } catch (err) {
      console.error("Delete pending admin payment error:", err);
      res.status(500).json({ message: "삭제에 실패했습니다" });
    }
  });

  app.get("/api/admin/pending-bank-payments", isAuthenticated, isAdmin, async (_req, res) => {
    try {
      const list = await db
        .select({
          id: payments.id,
          userId: payments.userId,
          orderId: payments.orderId,
          amount: payments.amount,
          plan: payments.plan,
          billingPeriod: payments.billingPeriod,
          createdAt: payments.createdAt,
          email: users.email,
          firstName: users.firstName,
          lastName: users.lastName,
        })
        .from(payments)
        .leftJoin(users, eq(payments.userId, users.id))
        .where(and(eq(payments.status, "pending"), eq(payments.paymentKey, "bank_transfer")))
        .orderBy(desc(payments.createdAt));
      res.json(list);
    } catch (err) {
      console.error("Pending bank payments error:", err);
      res.status(500).json({ message: "목록을 불러올 수 없습니다" });
    }
  });

  /**
   * 페이업 카드 구독 내역: (1) 미승인 pending·payup_direct 전체 (2) 승인 완료 paid / 취소·환불 refunded — 최근 paidDays 일(기본 365).
   * 승인·취소 분은 **페이업 관리자 화면이 아니라 DB** 기준: `paid/refunded` 이고 (`payment_key` 가 payup: 로 시작하거나 `payup_meta.txnId` 가 있는 구독 건).
   * 페이업에만 승인이 있고 DB가 아직 `pending`이면 미승인으로만 보이며, `/complete`·관리자「PG승인→DB반영」으로 맞춘 뒤 승인완료로 잡힌다.
   */
  app.get("/api/admin/pending-payup-subscription-payments", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const paidDaysRaw = Number(String((req.query as { paidDays?: string }).paidDays ?? "").trim());
      const paidDays = Number.isFinite(paidDaysRaw) ? Math.min(1095, Math.max(1, paidDaysRaw)) : 365;
      const paidSince = new Date(Date.now() - paidDays * 86_400_000);
      /** DB plan 대소문자·공백 차이로 inArray 가 빗나가는 경우 방지 (유료 구독 티어 ID 고정 집합) */
      const paidPlanTierInListSql = sql`lower(trim(coalesce(${payments.plan}, ''))) in ('starter', 'basic', 'pro', 'premium')`;
      const autoReconcileDisabled =
        String((req.query as { autoReconcile?: string }).autoReconcile ?? "").trim().toLowerCase() === "false" ||
        String((req.query as { autoReconcile?: string }).autoReconcile ?? "").trim() === "0";

      if (!autoReconcileDisabled && (process.env.PAYUP_TXN_RECONCILE_PATH ?? "").trim().length > 0) {
        const nowMs = Date.now();
        const throttleMs = 5 * 60_000;
        const autoCandidates = await db
          .select()
          .from(payments)
          .where(
            and(
              sql`lower(trim(coalesce(${payments.status}, ''))) = 'paid'`,
              or(
                sql`${payments.paymentKey} ILIKE 'payup:%'`,
                and(
                  sql`coalesce(trim(${payments.payupMeta}->>'txnId'), '') <> ''`,
                  sql`coalesce(${payments.paymentKey}, '') <> 'bank_transfer'`,
                ),
              ),
              paidPlanTierInListSql,
              gte(payments.createdAt, paidSince),
            ),
          )
          .orderBy(desc(payments.createdAt))
          .limit(50);

        for (const candidate of autoCandidates) {
          if (nowMs - payupMetaLastReconcileCheckedAt(candidate.payupMeta) < throttleMs) continue;
          try {
            const out = await reconcilePayupCardSubscriptionPaymentStatusFromPg(candidate, "payup_admin_auto_reconcile");
            if (!out.ok) {
              console.warn("[payup auto reconcile] skipped", candidate.orderId, out.message);
            }
          } catch (e) {
            console.error("[payup auto reconcile]", candidate.orderId, e);
          }
        }
      }

      const baseCols = {
        id: payments.id,
        userId: payments.userId,
        orderId: payments.orderId,
        amount: payments.amount,
        plan: payments.plan,
        billingPeriod: payments.billingPeriod,
        createdAt: payments.createdAt,
        paymentStatus: payments.status,
        paymentKey: payments.paymentKey,
        email: users.email,
        firstName: users.firstName,
        lastName: users.lastName,
      };

      const pendingList = await db
        .select(baseCols)
        .from(payments)
        .leftJoin(users, eq(payments.userId, users.id))
        .where(and(eq(payments.status, "pending"), eq(payments.paymentKey, PAYUP_SUBSCRIPTION_PAYMENT_KEY)))
        .orderBy(desc(payments.createdAt));

      const finalizedList = await db
        .select(baseCols)
        .from(payments)
        .leftJoin(users, eq(payments.userId, users.id))
        .where(
          and(
            sql`lower(trim(coalesce(${payments.status}, ''))) in ('paid', 'refunded')`,
            or(
              sql`${payments.paymentKey} ILIKE 'payup:%'`,
              and(
                sql`coalesce(trim(${payments.payupMeta}->>'txnId'), '') <> ''`,
                sql`coalesce(${payments.paymentKey}, '') <> 'bank_transfer'`,
              ),
            ),
            paidPlanTierInListSql,
            gte(payments.createdAt, paidSince),
          ),
        )
        .orderBy(desc(payments.createdAt))
        .limit(800);

      const seen = new Set<string>();
      const rows: Array<(typeof pendingList)[number] & { cardApprovalStatus: "pending" | "approved" | "refunded" }> = [];
      for (const r of pendingList) {
        const id = String(r.id);
        if (seen.has(id)) continue;
        seen.add(id);
        rows.push({ ...r, cardApprovalStatus: "pending" });
      }
      for (const r of finalizedList) {
        const id = String(r.id);
        if (seen.has(id)) continue;
        seen.add(id);
        rows.push({
          ...r,
          cardApprovalStatus: String(r.paymentStatus ?? "").trim().toLowerCase() === "refunded" ? "refunded" : "approved",
        });
      }
      rows.sort((a, b) => {
        if (a.cardApprovalStatus !== b.cardApprovalStatus) {
          const rank = { pending: 0, approved: 1, refunded: 2 } as const;
          return rank[a.cardApprovalStatus] - rank[b.cardApprovalStatus];
        }
        const ta = a.createdAt instanceof Date ? a.createdAt.getTime() : new Date(String(a.createdAt)).getTime();
        const tb = b.createdAt instanceof Date ? b.createdAt.getTime() : new Date(String(b.createdAt)).getTime();
        return tb - ta;
      });

      res.json(rows);
    } catch (err) {
      console.error("Pending PayUp subscription payments error:", err);
      res.status(500).json({ message: "목록을 불러올 수 없습니다" });
    }
  });

  // === Credits (크레딧) Routes ===
  app.get("/api/credits", isAuthenticated, async (req, res) => {
    try {
      // @ts-ignore
      const userId = req.user.claims.sub;
      await voidExpiredPromoAiCreditsForUser(userId, new Date());
      const [uCr] = await db
        .select({
          credits: users.credits,
          promoAiCreditsWon: users.promoAiCreditsWon,
          promoAiCreditsExpiresAt: users.promoAiCreditsExpiresAt,
        })
        .from(users)
        .where(eq(users.id, userId));
      const balanceWon = uCr?.credits ?? 0;
      res.json({
        balanceWon,
        credits: balanceWon,
        promoAiCreditsWon: uCr?.promoAiCreditsWon ?? 0,
        promoAiCreditsExpiresAt: uCr?.promoAiCreditsExpiresAt
          ? uCr.promoAiCreditsExpiresAt instanceof Date
            ? uCr.promoAiCreditsExpiresAt.toISOString()
            : String(uCr.promoAiCreditsExpiresAt)
          : null,
      });
    } catch (err) {
      res.status(500).json({ message: "지갑 잔액을 불러올 수 없습니다" });
    }
  });

  /** 5월 신규가입 이벤트 — 공개 메타(비로그인) */
  app.get("/api/events/may-2026/public", async (_req, res) => {
    try {
      const approvedMemberCount = await countMay2026ApprovedMembers();
      res.json({
        signupWindowStart: may2026SignupWindowStartUtc().toISOString(),
        signupWindowEndExclusive: may2026SignupWindowEndExclusiveUtc().toISOString(),
        promoGrantTracks: MAY_2026_EVENT_PROMO_GRANT_TRACKS,
        promoWalletExpiresAt: may2026PromoWalletExpiresAtUtc().toISOString(),
        approvedMemberCap: MAY_2026_EVENT_APPROVED_MEMBER_CAP,
        approvedMemberCount,
      });
    } catch (e) {
      console.error("[events/may-2026/public]", e);
      res.status(500).json({ message: "이벤트 정보를 불러오지 못했습니다." });
    }
  });

  /** 이벤트 신청 상태·프로모 잔액(로그인) */
  app.get("/api/events/may-2026/me", isAuthenticated, async (req, res) => {
    try {
      // @ts-ignore
      const userId = req.user.claims.sub as string;
      await voidExpiredPromoAiCreditsForUser(userId, new Date());
      const [u] = await db.select().from(users).where(eq(users.id, userId));
      if (!u) return res.status(404).json({ message: "사용자를 찾을 수 없습니다." });
      const appRow = await getMay2026EventApplicationForUser(userId);
      res.json({
        eligibleSignup: isUserCreatedInMay2026CampaignWindow(u.createdAt ?? null),
        application: appRow
          ? {
              id: appRow.id,
              status: appRow.status,
              applicantMessage: appRow.applicantMessage,
              adminNote: appRow.adminNote,
              createdAt: appRow.createdAt instanceof Date ? appRow.createdAt.toISOString() : appRow.createdAt,
              reviewedAt: appRow.reviewedAt
                ? appRow.reviewedAt instanceof Date
                  ? appRow.reviewedAt.toISOString()
                  : appRow.reviewedAt
                : null,
            }
          : null,
        promoAiCreditsWon: u.promoAiCreditsWon ?? 0,
        promoAiCreditsExpiresAt: u.promoAiCreditsExpiresAt
          ? u.promoAiCreditsExpiresAt instanceof Date
            ? u.promoAiCreditsExpiresAt.toISOString()
            : String(u.promoAiCreditsExpiresAt)
          : null,
      });
    } catch (e) {
      console.error("[events/may-2026/me]", e);
      res.status(500).json({ message: "불러오기에 실패했습니다." });
    }
  });

  /** 5월 이벤트 가입 신청 */
  app.post("/api/events/may-2026/apply", isAuthenticated, async (req, res) => {
    try {
      // @ts-ignore
      const userId = req.user.claims.sub as string;
      const [u] = await db.select().from(users).where(eq(users.id, userId));
      if (!u) return res.status(404).json({ message: "사용자를 찾을 수 없습니다." });
      if (!isUserCreatedInMay2026CampaignWindow(u.createdAt ?? null)) {
        return res.status(403).json({ message: "이벤트 대상이 아닙니다. (2026년 5월 중 가입한 회원만 신청할 수 있습니다.)" });
      }
      const msgRaw = (req.body as { message?: unknown })?.message;
      const applicantMessage = typeof msgRaw === "string" ? msgRaw.trim().slice(0, 2000) : "";
      const existing = await getMay2026EventApplicationForUser(userId);
      if (existing?.status === "pending") {
        return res.status(409).json({ message: "이미 검토 대기 중인 신청이 있습니다." });
      }
      if (existing?.status === "approved") {
        return res.status(409).json({ message: "이미 승인된 이벤트 회원입니다." });
      }
      const approvedMembers = await countMay2026ApprovedMembers();
      if (approvedMembers >= MAY_2026_EVENT_APPROVED_MEMBER_CAP) {
        return res.status(403).json({
          message: `이벤트 승인 인원이 ${MAY_2026_EVENT_APPROVED_MEMBER_CAP}명에 도달하여 신청을 받지 않습니다.`,
        });
      }
      await db.insert(may2026EventApplications).values({
        userId,
        status: "pending",
        applicantMessage: applicantMessage || null,
      });
      res.status(201).json({ ok: true });
    } catch (e) {
      console.error("[events/may-2026/apply]", e);
      res.status(500).json({ message: "신청 처리에 실패했습니다." });
    }
  });

  app.get("/api/admin/may-2026-event/applications", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const statusRaw = typeof req.query?.status === "string" ? req.query.status.trim() : "pending";
      const status = statusRaw === "all" ? "all" : statusRaw === "approved" || statusRaw === "rejected" ? statusRaw : "pending";
      const rows =
        status === "all"
          ? await db.select().from(may2026EventApplications).orderBy(asc(may2026EventApplications.createdAt))
          : await db
              .select()
              .from(may2026EventApplications)
              .where(eq(may2026EventApplications.status, status))
              .orderBy(asc(may2026EventApplications.createdAt));
      const out = [];
      for (const r of rows) {
        const [u] = await db
          .select({
            email: users.email,
            username: users.username,
            firstName: users.firstName,
            createdAt: users.createdAt,
          })
          .from(users)
          .where(eq(users.id, r.userId))
          .limit(1);
        out.push({
          ...r,
          userEmail: u?.email ?? null,
          userUsername: u?.username ?? null,
          userFirstName: u?.firstName ?? null,
          userCreatedAt: u?.createdAt ? (u.createdAt instanceof Date ? u.createdAt.toISOString() : u.createdAt) : null,
        });
      }
      res.json(out);
    } catch (e) {
      console.error("[admin/may-2026-event/applications]", e);
      res.status(500).json({ message: "목록을 불러올 수 없습니다." });
    }
  });

  app.post("/api/admin/may-2026-event/applications/:id/approve", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isFinite(id) || id < 1) return res.status(400).json({ message: "잘못된 신청 번호입니다." });
      // @ts-ignore
      const adminId = req.user.claims.sub as string;
      const [appRow] = await db.select().from(may2026EventApplications).where(eq(may2026EventApplications.id, id)).limit(1);
      if (!appRow) return res.status(404).json({ message: "신청을 찾을 수 없습니다." });
      if (appRow.status !== "pending") {
        return res.status(409).json({ message: "대기 중인 신청만 승인할 수 있습니다." });
      }
      const targetUserId = appRow.userId;
      const expiresAt = may2026PromoWalletExpiresAtUtc();
      await db.transaction(async (tx) => {
        await tx.execute(sql`SELECT pg_advisory_xact_lock(90261026)`);
        const capCheck = await tx.execute(
          sql`SELECT count(DISTINCT user_id)::int AS c FROM may_2026_event_applications WHERE status = 'approved'`,
        );
        const approvedNow = Number((capCheck.rows[0] as { c?: unknown } | undefined)?.c ?? 0);
        if (!Number.isFinite(approvedNow) || approvedNow >= MAY_2026_EVENT_APPROVED_MEMBER_CAP) {
          throw new Error("MAY2026_APPROVAL_CAP_FULL");
        }
        const [u] = await tx.select().from(users).where(eq(users.id, targetUserId)).limit(1);
        if (!u) throw new Error("USER_NOT_FOUND");
        const cur = Math.max(0, Number(u.promoAiCreditsWon ?? 0));
        await tx
          .update(users)
          .set({
            promoAiCreditsWon: cur + MAY_2026_EVENT_PROMO_GRANT_TRACKS,
            promoAiCreditsExpiresAt: expiresAt,
            updatedAt: new Date(),
          })
          .where(eq(users.id, targetUserId));
        const adminNoteApprove =
          typeof (req.body as { note?: unknown } | undefined)?.note === "string"
            ? String((req.body as { note: string }).note).trim().slice(0, 500) || null
            : null;
        await tx
          .update(may2026EventApplications)
          .set({
            status: "approved",
            reviewedAt: new Date(),
            reviewedByUserId: adminId,
            adminNote: adminNoteApprove,
          })
          .where(eq(may2026EventApplications.id, id));
      });
      await storage.createNotification({
        userId: targetUserId,
        type: "system",
        message: `5월 이벤트 무료 AI 곡 ${MAY_2026_EVENT_PROMO_GRANT_TRACKS.toLocaleString("ko-KR")}곡분이 충전되었습니다. (1회 생성이 보통 2곡이면 2곡씩 차감, 5월 말까지)`,
        payload: { kind: "may2026_event_promo", tracksGranted: MAY_2026_EVENT_PROMO_GRANT_TRACKS },
        url: "/events/may-2026",
      });
      res.json({ ok: true });
    } catch (e) {
      console.error("[admin/may-2026-event/approve]", e);
      const msg = (e as Error)?.message || "";
      if (msg === "MAY2026_APPROVAL_CAP_FULL") {
        return res.status(409).json({
          message: `승인 가능 인원이 ${MAY_2026_EVENT_APPROVED_MEMBER_CAP}명에 도달했습니다. (동시 승인 시도일 수 있습니다. 목록을 새로고침해 주세요.)`,
        });
      }
      res.status(500).json({ message: msg || "승인 처리에 실패했습니다." });
    }
  });

  app.post("/api/admin/may-2026-event/applications/:id/reject", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isFinite(id) || id < 1) return res.status(400).json({ message: "잘못된 신청 번호입니다." });
      // @ts-ignore
      const adminId = req.user.claims.sub as string;
      const note = typeof (req.body as { note?: unknown })?.note === "string" ? (req.body as { note: string }).note.trim().slice(0, 500) : "";
      const [appRow] = await db.select().from(may2026EventApplications).where(eq(may2026EventApplications.id, id)).limit(1);
      if (!appRow) return res.status(404).json({ message: "신청을 찾을 수 없습니다." });
      if (appRow.status !== "pending") {
        return res.status(409).json({ message: "대기 중인 신청만 반려할 수 있습니다." });
      }
      await db
        .update(may2026EventApplications)
        .set({
          status: "rejected",
          reviewedAt: new Date(),
          reviewedByUserId: adminId,
          adminNote: note || null,
        })
        .where(eq(may2026EventApplications.id, id));
      await storage.createNotification({
        userId: appRow.userId,
        type: "system",
        message: "5월 이벤트 가입 신청이 반려되었습니다. 자세한 사항은 고객센터로 문의해 주세요.",
        payload: { kind: "may2026_event_rejected" },
        url: "/events/may-2026",
      });
      res.json({ ok: true });
    } catch (e) {
      console.error("[admin/may-2026-event/reject]", e);
      res.status(500).json({ message: "반려 처리에 실패했습니다." });
    }
  });

  app.get("/api/credits/transactions", isAuthenticated, async (req, res) => {
    try {
      // @ts-ignore
      const userId = req.user.claims.sub;
      const transactions = await storage.getCreditTransactions(userId);
      const serialized = transactions.map((tx: any) => ({
        ...tx,
        createdAt: tx.createdAt instanceof Date ? tx.createdAt.toISOString() : tx.createdAt,
      }));
      res.json(serialized);
    } catch (err) {
      res.status(500).json({ message: "거래 내역을 불러올 수 없습니다" });
    }
  });

  /** 예전 토스 즉시충전 경로 — PG는 페이업으로 전환 예정. 지갑 충전은 계좌이체(/api/credits/request-bank)만 사용. */
  app.post("/api/credits/charge", isAuthenticated, async (_req, res) => {
    return res.status(503).json({
      message:
        "카드 즉시 지갑 충전은 중단되었습니다. 아래「계좌이체로 충전 신청」을 이용해 주세요. (페이업 카드 연동은 별도 배포에서 제공합니다.)",
    });
  });

  // 크레딧 계좌이체 충전 신청 (amount = 총결재금액 = 충전금+부가세10%)
  app.post("/api/credits/request-bank", isAuthenticated, async (req, res) => {
    try {
      // @ts-ignore
      const userId = req.user.claims.sub;
      const { amount } = req.body;
      if (!amount || amount < WALLET_TOPUP_MIN_TOTAL_WON) {
        return res.status(400).json({
          message: `최소 충전 금액(총결제, 부가세 포함)은 ${WALLET_TOPUP_MIN_TOTAL_WON.toLocaleString("ko-KR")}원입니다`,
        });
      }
      const orderId = `CREDIT_${userId.replace(/[^a-zA-Z0-9_-]/g, "_").substring(0, 20)}_${Date.now()}`;
      await db.insert(payments).values({
        userId,
        orderId,
        paymentKey: "bank_transfer",
        amount,
        status: "pending",
        plan: "credit_charge",
        billingPeriod: null,
      });
      await storage.createNotification({
        userId,
        type: "system",
        message: `입금 신청이 접수되었습니다. 총 ${amount.toLocaleString()}원을 등록된 계좌로 입금해 주세요.`,
        payload: { amount },
        url: "/credits",
      });
      const adminRows = await db.select({ id: users.id }).from(users).where(eq(users.role, "admin"));
      for (const admin of adminRows) {
        if (admin.id === userId) continue;
        await storage.createNotification({
          userId: admin.id,
          type: "system",
          message: `새 지갑 입금 신청이 있습니다. (총 ${amount.toLocaleString()}원)`,
          payload: { amount },
          url: getAdminPagePath(),
        });
      }
      const bankName = process.env.BANK_NAME || "은행명";
      const bankAccount = process.env.BANK_ACCOUNT || "";
      const bankHolder = process.env.BANK_HOLDER || "";
      res.json({
        success: true,
        orderId,
        bankInfo: { bankName, bankAccount, bankHolder },
        amount,
        message: "입금 신청이 등록되었습니다. 아래 계좌로 입금해 주시면 확인 후 지갑에 원화가 충전됩니다.",
      });
    } catch (err: any) {
      console.error("Credits request-bank error:", err);
      res.status(500).json({ message: err?.message || "입금 신청에 실패했습니다" });
    }
  });

  // 충전 크레딧 환불 신청 (정책 검토 후 관리자가 승인 시 잔액만 차감; 원화 환불은 운영에서 별도 처리)
  app.post("/api/credits/refund-request", isAuthenticated, async (req, res) => {
    try {
      // @ts-ignore
      const userId = req.user.claims.sub as string;
      const proof = (req.body as { refundProofToken?: unknown }).refundProofToken;
      if (!verifyCreditRefundProof(proof, userId)) {
        return res.status(403).json({
          message: "이메일 인증이 필요합니다. 인증 코드를 요청한 뒤 확인해 주세요.",
        });
      }
      const creditsRaw = Number((req.body as { credits?: unknown }).credits);
      const reason = typeof (req.body as { reason?: unknown }).reason === "string" ? String((req.body as { reason: string }).reason).trim().slice(0, 2000) : "";
      if (!Number.isFinite(creditsRaw) || creditsRaw < 1 || !Number.isInteger(creditsRaw)) {
        return res.status(400).json({ message: "환불 요청 금액(원)은 1 이상의 정수여야 합니다" });
      }
      const credits = Math.floor(creditsRaw);
      const balance = await storage.getUserCredits(userId);
      if (credits > balance) {
        return res.status(400).json({ message: "지갑 잔액보다 많은 금액은 신청할 수 없습니다" });
      }
      const [pending] = await db
        .select({ id: creditRefundRequests.id })
        .from(creditRefundRequests)
        .where(and(eq(creditRefundRequests.userId, userId), eq(creditRefundRequests.status, "pending")))
        .limit(1);
      if (pending) {
        return res.status(400).json({ message: "이미 처리 대기 중인 환불 신청이 있습니다" });
      }
      const [inserted] = await db.transaction(async (tx) => {
        const [row] = await tx
          .insert(creditRefundRequests)
          .values({ userId, creditsAmount: credits, reason: reason || null, status: "pending" })
          .returning();
        if (!row) throw new Error("INSERT_FAILED");
        await tx.insert(creditRefundEvents).values({
          refundRequestId: row.id,
          eventType: "request_created",
          actorUserId: userId,
          metadata: { credits, reason: reason || null },
          note: null,
        });
        return [row];
      });
      await storage.createNotification({
        userId,
        type: "system",
        message: `지갑 환불 신청이 접수되었습니다. (${credits.toLocaleString()}원) 검토 후 안내드립니다.`,
        payload: { refundRequestId: inserted.id, credits },
        url: "/credits",
      });
      const adminRows = await db.select({ id: users.id }).from(users).where(eq(users.role, "admin"));
      for (const admin of adminRows) {
        if (admin.id === userId) continue;
        await storage.createNotification({
          userId: admin.id,
          type: "system",
          message: `새 지갑 환불 신청: ${credits.toLocaleString()}원`,
          payload: { refundRequestId: inserted.id, userId },
          url: getAdminPagePath(),
        });
      }
      res.json({ success: true, id: inserted.id, message: "환불 신청이 접수되었습니다" });
    } catch (err: any) {
      const msg = String(err?.message || "");
      if (msg.toLowerCase().includes("credit_refund_requests") && msg.toLowerCase().includes("relation")) {
        return res.status(500).json({
          message:
            "DB에 credit_refund_requests 테이블이 없습니다. 서버에서 npm run db:deploy 를 실행하거나, deploy/credit-refund-requests.sql(또는 script/migrations/011-credit-refund-requests.sql)을 DB에 적용해 주세요.",
        });
      }
      console.error("Credits refund-request error:", err);
      res.status(500).json({ message: "환불 신청에 실패했습니다" });
    }
  });

  app.get("/api/credits/refund-requests", isAuthenticated, async (req, res) => {
    try {
      // @ts-ignore
      const userId = req.user.claims.sub as string;
      const rows = await db
        .select()
        .from(creditRefundRequests)
        .where(eq(creditRefundRequests.userId, userId))
        .orderBy(desc(creditRefundRequests.createdAt));
      const serialized = rows.map((r) => ({
        ...r,
        createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : r.createdAt,
        processedAt: r.processedAt instanceof Date ? r.processedAt.toISOString() : r.processedAt,
        krwRefundCompletedAt:
          r.krwRefundCompletedAt instanceof Date ? r.krwRefundCompletedAt.toISOString() : r.krwRefundCompletedAt,
      }));
      res.json(serialized);
    } catch (err: any) {
      console.error("Credits refund-requests list error:", err);
      res.status(500).json({ message: "목록을 불러올 수 없습니다" });
    }
  });

  app.get("/api/admin/credit-refund-requests", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const statusFilter = typeof req.query.status === "string" ? req.query.status : "all";
      const refundProcessorUser = alias(users, "credit_refund_processor");
      const krwRecorderUser = alias(users, "credit_refund_krw_recorder");
      const selectCols = {
        id: creditRefundRequests.id,
        userId: creditRefundRequests.userId,
        creditsAmount: creditRefundRequests.creditsAmount,
        reason: creditRefundRequests.reason,
        status: creditRefundRequests.status,
        adminNote: creditRefundRequests.adminNote,
        createdAt: creditRefundRequests.createdAt,
        processedAt: creditRefundRequests.processedAt,
        processedByUserId: creditRefundRequests.processedByUserId,
        krwRefundAmountWon: creditRefundRequests.krwRefundAmountWon,
        krwRefundCompletedAt: creditRefundRequests.krwRefundCompletedAt,
        krwRefundNote: creditRefundRequests.krwRefundNote,
        krwRefundRecordedByUserId: creditRefundRequests.krwRefundRecordedByUserId,
        email: users.email,
        firstName: users.firstName,
        lastName: users.lastName,
        processorEmail: refundProcessorUser.email,
        processorFirstName: refundProcessorUser.firstName,
        processorLastName: refundProcessorUser.lastName,
        krwRecorderEmail: krwRecorderUser.email,
        krwRecorderFirstName: krwRecorderUser.firstName,
        krwRecorderLastName: krwRecorderUser.lastName,
      };
      const fromJoin = () =>
        db
          .select(selectCols)
          .from(creditRefundRequests)
          .leftJoin(users, eq(creditRefundRequests.userId, users.id))
          .leftJoin(refundProcessorUser, eq(creditRefundRequests.processedByUserId, refundProcessorUser.id))
          .leftJoin(krwRecorderUser, eq(creditRefundRequests.krwRefundRecordedByUserId, krwRecorderUser.id));
      let rows;
      if (statusFilter === "pending") {
        rows = await fromJoin()
          .where(eq(creditRefundRequests.status, "pending"))
          .orderBy(desc(creditRefundRequests.createdAt));
      } else if (statusFilter === "approved" || statusFilter === "rejected") {
        rows = await fromJoin()
          .where(eq(creditRefundRequests.status, statusFilter))
          .orderBy(desc(creditRefundRequests.createdAt));
      } else {
        rows = await fromJoin().orderBy(desc(creditRefundRequests.createdAt));
      }
      res.json(
        rows.map((r) => ({
          ...r,
          createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : r.createdAt,
          processedAt: r.processedAt instanceof Date ? r.processedAt.toISOString() : r.processedAt,
          krwRefundCompletedAt:
            r.krwRefundCompletedAt instanceof Date ? r.krwRefundCompletedAt.toISOString() : r.krwRefundCompletedAt,
        })),
      );
    } catch (err) {
      console.error("Admin credit-refund-requests error:", err);
      res.status(500).json({ message: "목록을 불러올 수 없습니다" });
    }
  });

  app.post("/api/admin/credit-refund-requests/:id/approve", isAuthenticated, isAdmin, async (req, res) => {
    try {
      // @ts-ignore
      const adminId = req.user.claims.sub as string;
      const id = parseInt(String(req.params.id), 10);
      if (!Number.isFinite(id) || id < 1) {
        return res.status(400).json({ message: "잘못된 요청입니다" });
      }
      let approvedUserId = "";
      let approvedAmount = 0;
      await db.transaction(async (tx) => {
        const [row] = await tx
          .select()
          .from(creditRefundRequests)
          .where(and(eq(creditRefundRequests.id, id), eq(creditRefundRequests.status, "pending")));
        if (!row) {
          throw new Error("NOT_PENDING");
        }
        const [u] = await tx.select({ credits: users.credits }).from(users).where(eq(users.id, row.userId));
        const bal = u?.credits ?? 0;
        if (bal < row.creditsAmount) {
          throw new Error("INSUFFICIENT_BALANCE");
        }
        approvedUserId = row.userId;
        approvedAmount = row.creditsAmount;
        await tx
          .update(users)
          .set({ credits: sql`COALESCE(${users.credits}, 0) - ${row.creditsAmount}`, updatedAt: new Date() })
          .where(eq(users.id, row.userId));
        const createdAtIso =
          row.createdAt instanceof Date ? row.createdAt.toISOString() : String(row.createdAt ?? "");
        await tx.insert(creditTransactions).values({
          userId: row.userId,
          type: "refund",
          amount: -row.creditsAmount,
          description: `환불 승인 (신청 #${row.id}, 접수 ${createdAtIso}, ${row.creditsAmount} 크레딧 차감. 원화 환불 별도 입금)`,
        });
        await tx
          .update(creditRefundRequests)
          .set({ status: "approved", processedAt: new Date(), adminNote: null, processedByUserId: adminId })
          .where(eq(creditRefundRequests.id, id));
        await tx.insert(creditRefundEvents).values({
          refundRequestId: id,
          eventType: "admin_approved",
          actorUserId: adminId,
          metadata: { creditsAmount: row.creditsAmount, requestCreatedAt: createdAtIso },
          note: null,
        });
      });
      const newBal = await storage.getUserCredits(approvedUserId);
      await storage.createNotification({
        userId: approvedUserId,
        type: "system",
        message: `크레딧 환불이 승인되어 ${approvedAmount.toLocaleString()} 크레딧이 차감되었습니다. 현재 잔액 ${newBal.toLocaleString()} 크레딧. 원화 환불은 별도 안내에 따라 진행됩니다.`,
        payload: { refundRequestId: id, creditsDeducted: approvedAmount },
        url: "/credits",
      });
      res.json({ success: true, message: "승인되었습니다. 사용자 크레딧이 차감되었습니다." });
    } catch (err: any) {
      const m = err?.message || String(err);
      if (m === "NOT_PENDING") return res.status(400).json({ message: "대기 중인 신청이 아닙니다" });
      if (m === "INSUFFICIENT_BALANCE") return res.status(400).json({ message: "사용자 잔액이 부족합니다. 거절하거나 잔액을 확인하세요." });
      console.error("Approve credit refund error:", err);
      res.status(500).json({ message: "처리에 실패했습니다" });
    }
  });

  app.post("/api/admin/credit-refund-requests/:id/reject", isAuthenticated, isAdmin, async (req, res) => {
    try {
      // @ts-ignore
      const adminId = req.user.claims.sub as string;
      const id = parseInt(String(req.params.id), 10);
      if (!Number.isFinite(id) || id < 1) {
        return res.status(400).json({ message: "잘못된 요청입니다" });
      }
      const note =
        typeof (req.body as { adminNote?: unknown })?.adminNote === "string"
          ? String((req.body as { adminNote: string }).adminNote).trim().slice(0, 2000)
          : "";
      const [updated] = await db.transaction(async (tx) => {
        const [u] = await tx
          .update(creditRefundRequests)
          .set({ status: "rejected", adminNote: note || null, processedAt: new Date(), processedByUserId: adminId })
          .where(and(eq(creditRefundRequests.id, id), eq(creditRefundRequests.status, "pending")))
          .returning();
        if (u) {
          await tx.insert(creditRefundEvents).values({
            refundRequestId: id,
            eventType: "admin_rejected",
            actorUserId: adminId,
            metadata: { adminNote: note || null },
            note: note || null,
          });
        }
        return [u];
      });
      if (!updated) {
        return res.status(400).json({ message: "대기 중인 신청이 아닙니다" });
      }
      await storage.createNotification({
        userId: updated.userId,
        type: "system",
        message: note
          ? `크레딧 환불 신청이 반려되었습니다. 사유: ${note.slice(0, 200)}`
          : "크레딧 환불 신청이 반려되었습니다.",
        payload: { refundRequestId: id },
        url: "/credits",
      });
      res.json({ success: true, message: "반려 처리되었습니다" });
    } catch (err) {
      console.error("Reject credit refund error:", err);
      res.status(500).json({ message: "처리에 실패했습니다" });
    }
  });

  app.post("/api/admin/credit-refund-requests/:id/krw-refund", isAuthenticated, isAdmin, async (req, res) => {
    try {
      // @ts-ignore
      const adminId = req.user.claims.sub as string;
      const id = parseInt(String(req.params.id), 10);
      if (!Number.isFinite(id) || id < 1) {
        return res.status(400).json({ message: "잘못된 요청입니다" });
      }
      const amountRaw = Number((req.body as { amountWon?: unknown }).amountWon);
      const krwNote =
        typeof (req.body as { note?: unknown })?.note === "string"
          ? String((req.body as { note: string }).note).trim().slice(0, 2000)
          : "";
      if (!Number.isFinite(amountRaw) || amountRaw < 0 || !Number.isInteger(amountRaw)) {
        return res.status(400).json({ message: "원화 금액은 0 이상의 정수(원)여야 합니다" });
      }
      const amountWon = Math.floor(amountRaw);
      const [row] = await db.select().from(creditRefundRequests).where(eq(creditRefundRequests.id, id)).limit(1);
      if (!row) {
        return res.status(404).json({ message: "신청을 찾을 수 없습니다" });
      }
      if (row.status !== "approved") {
        return res.status(400).json({ message: "승인된 신청만 원화 환불을 기록할 수 있습니다" });
      }
      const now = new Date();
      await db.transaction(async (tx) => {
        await tx
          .update(creditRefundRequests)
          .set({
            krwRefundAmountWon: amountWon,
            krwRefundCompletedAt: now,
            krwRefundNote: krwNote || null,
            krwRefundRecordedByUserId: adminId,
          })
          .where(eq(creditRefundRequests.id, id));
        await tx.insert(creditRefundEvents).values({
          refundRequestId: id,
          eventType: "krw_refund_recorded",
          actorUserId: adminId,
          metadata: { amountWon },
          note: krwNote || null,
        });
      });
      await storage.createNotification({
        userId: row.userId,
        type: "system",
        message:
          amountWon > 0
            ? `크레딧 환불(신청 #${id}) 원화 ${amountWon.toLocaleString()}원 입금이 기록되었습니다.`
            : `크레딧 환불(신청 #${id}) 관련 원화 처리 메모가 등록되었습니다.`,
        payload: { refundRequestId: id, krwAmountWon: amountWon },
        url: "/credits",
      });
      res.json({ success: true, message: "원화 환불이 기록되었습니다" });
    } catch (err) {
      console.error("Krw refund record error:", err);
      res.status(500).json({ message: "기록에 실패했습니다" });
    }
  });

  app.get("/api/admin/credit-refund-requests/:id/events", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const id = parseInt(String(req.params.id), 10);
      if (!Number.isFinite(id) || id < 1) {
        return res.status(400).json({ message: "잘못된 요청입니다" });
      }
      const rows = await db
        .select()
        .from(creditRefundEvents)
        .where(eq(creditRefundEvents.refundRequestId, id))
        .orderBy(asc(creditRefundEvents.id));
      res.json(
        rows.map((e) => ({
          ...e,
          createdAt: e.createdAt instanceof Date ? e.createdAt.toISOString() : e.createdAt,
        })),
      );
    } catch (err) {
      console.error("Refund events list error:", err);
      res.status(500).json({ message: "이력을 불러올 수 없습니다" });
    }
  });

  // === Radio (베니방송국) Routes ===
  // 1) 라이브 중인 채널만
  app.get("/api/radio/channels/live", async (_req, res) => {
    try {
      const list = await storage.listLiveRadioChannels();
      res.json(list);
    } catch (e) {
      console.error("[radio/channels/live]", e);
      res.status(500).json({ message: "라이브 채널 목록을 불러올 수 없습니다" });
    }
  });

  // 2) 생성된 모든 방송 채널 목록 (상태와 상관없이)
  app.get("/api/radio/channels", async (_req, res) => {
    try {
      const list = await storage.listAllRadioChannels();
      res.json(list);
    } catch (e) {
      console.error("[radio/channels GET]", e);
      res.status(500).json({ message: "방송 채널 목록을 불러올 수 없습니다" });
    }
  });

  app.get("/api/radio/channels/me", isAuthenticated, async (req, res) => {
    try {
      // @ts-ignore
      const userId = req.user.claims.sub;
      const channel = await storage.getRadioChannelByOwnerId(userId);
      res.json(channel ?? null);
    } catch (e) {
      console.error("[radio/channels/me]", e);
      res.status(500).json({ message: "내 채널 정보를 불러올 수 없습니다" });
    }
  });

  app.get("/api/radio/channels/:slug/staff", async (req, res) => {
    try {
      const slug = String(req.params.slug || "").trim().toLowerCase();
      if (!slug) return res.status(404).json({ message: "채널을 찾을 수 없습니다" });
      const channel = await storage.getRadioChannelBySlug(slug);
      if (!channel) return res.status(404).json({ message: "채널을 찾을 수 없습니다" });
      const list = await storage.getRadioChannelStaff(channel.id);
      res.json(list);
    } catch (e) {
      console.error("[radio/channels/:slug/staff GET]", e);
      res.status(500).json({ message: "스텝 목록을 불러올 수 없습니다" });
    }
  });

  app.post("/api/radio/channels/:slug/staff", isAuthenticated, async (req, res) => {
    try {
      const slug = String(req.params.slug || "").trim().toLowerCase();
      if (!slug) return res.status(404).json({ message: "채널을 찾을 수 없습니다" });
      const channel = await storage.getRadioChannelBySlug(slug);
      if (!channel) return res.status(404).json({ message: "채널을 찾을 수 없습니다" });
      const userId = (req as any).user?.claims?.sub;
      if (channel.ownerId !== userId) return res.status(403).json({ message: "방장만 스텝을 추가할 수 있습니다." });
      const { username, userId: bodyUserId, role } = req.body || {};
      const targetUserId = typeof bodyUserId === "string" && bodyUserId ? bodyUserId : (username ? await storage.getUserIdByUsername(String(username)) : undefined);
      if (!targetUserId) return res.status(400).json({ message: "사용자를 찾을 수 없습니다. 로그인 아이디 또는 이메일을 확인해 주세요." });
      if (targetUserId === channel.ownerId) return res.status(400).json({ message: "방장은 스텝으로 추가할 수 없습니다." });
      const validRole = role === "sub_host" ? "sub_host" : role === "cj" ? "cj" : "staff";
      await storage.addRadioChannelStaff(channel.id, targetUserId, validRole);
      const list = await storage.getRadioChannelStaff(channel.id);
      res.json(list);
    } catch (e) {
      console.error("[radio/channels/:slug/staff POST]", e);
      res.status(500).json({ message: "스텝 추가에 실패했습니다." });
    }
  });

  app.delete("/api/radio/channels/:slug/staff/:userId", isAuthenticated, async (req, res) => {
    try {
      const slug = String(req.params.slug || "").trim().toLowerCase();
      const targetUserId = String(req.params.userId ?? "");
      if (!slug || !targetUserId) return res.status(404).json({ message: "채널을 찾을 수 없습니다" });
      const channel = await storage.getRadioChannelBySlug(slug);
      if (!channel) return res.status(404).json({ message: "채널을 찾을 수 없습니다" });
      const userId = (req as any).user?.claims?.sub;
      if (channel.ownerId !== userId) return res.status(403).json({ message: "방장만 스텝을 제거할 수 있습니다." });
      await storage.removeRadioChannelStaff(channel.id, targetUserId);
      const list = await storage.getRadioChannelStaff(channel.id);
      res.json(list);
    } catch (e) {
      console.error("[radio/channels/:slug/staff DELETE]", e);
      res.status(500).json({ message: "스텝 제거에 실패했습니다." });
    }
  });

  app.get("/api/radio/channels/:slug", async (req, res) => {
    try {
      const slug = String(req.params.slug || "").trim().toLowerCase();
      if (!slug) return res.status(404).json({ message: "채널을 찾을 수 없습니다" });
      const channel = await storage.getRadioChannelBySlug(slug);
      if (!channel) return res.status(404).json({ message: "채널을 찾을 수 없습니다" });
      const out: any = { ...channel, nowPlayingLocalTitle: radioLocalTitles.get(slug) ?? null };
      if (channel.nowPlayingStartedAt) {
        const started = (channel.nowPlayingStartedAt as Date).getTime();
        out.nowPlayingElapsedSeconds = Math.max(0, Math.floor((Date.now() - started) / 1000));
      } else {
        out.nowPlayingElapsedSeconds = null;
      }
      const owner = await storage.getUserById(channel.ownerId);
      out.ownerDisplayName = owner?.firstName || owner?.username || channel.ownerId?.slice(0, 8) || "DJ";
      if (req.isAuthenticated() && (req as any).user?.claims?.sub) {
        const uid = (req as any).user.claims.sub;
        const isOwner = channel.ownerId === uid;
        const isCurrentHost = (channel as any).currentHostId === uid;
        out.canManage = isOwner || isCurrentHost || (await storage.isRadioChannelStaff(channel.id, uid));
        out.canControlBroadcast = isOwner || isCurrentHost;
      } else {
        out.canManage = false;
        out.canControlBroadcast = false;
      }
      res.json(out);
    } catch (e) {
      console.error("[radio/channels/:slug]", e);
      res.status(500).json({ message: "채널 정보를 불러올 수 없습니다" });
    }
  });

  // 채널 연속 스트림: 한 URL로 현재 곡 + 다음 곡 이어서 재생 (DJ 모니터/리스너 한 번 play()로 연속 재생)
  app.get("/api/radio/channels/:slug/stream", async (req, res) => {
    const slug = String(req.params.slug || "").trim().toLowerCase();
    if (!slug) return res.status(404).end();
    // NOTE: /api/music/:id/stream 와 동일한 경로 규칙을 사용해야 한다.
    // 이전엔 ".."로 상위 폴더를 보고 있어 실제 파일이 있어도 못 찾아 504(프록시 타임아웃)를 유발할 수 있었다.
    const uploadsDirInner = path.resolve(process.cwd(), "local-uploads", "uploads");
    const getLocalPathForMusicId = async (
      musicId: number
    ): Promise<{ path: string; contentType: string } | { objectUrl: string } | null> => {
      const music = await storage.getMusicById(musicId);
      if (!music) return null;
      const fn = music.filename || "";
      let fileId = "";
      const objMatch = fn.match(/\/objects\/uploads\/(.+)$/);
      if (objMatch) fileId = objMatch[1];
      else if (fn.startsWith("uploads/")) fileId = fn.replace(/^uploads\//, "");
      else if (/^[a-f0-9-]{36}(\.[a-z]+)?$/i.test(fn.trim())) fileId = fn.trim();
      else if (fn.includes("/")) fileId = fn.split("/").pop() || "";
      else fileId = fn;
      fileId = fileId.replace(/^\//, "");
      if (!fileId) return null;
      const baseId = fileId.replace(/\.(mp3|wav|ogg)$/i, "");
      const candidates = [
        path.join(uploadsDirInner, fileId),
        path.join(uploadsDirInner, `${baseId}.mp3`),
        path.join(uploadsDirInner, `${baseId}.wav`),
        path.join(uploadsDirInner, `${baseId}.ogg`),
      ];
      const localPath = candidates.find((p) => existsSync(p));
      if (!localPath) {
        // 객체 스토리지에만 있는 음원인 경우: 연속 스트림으로 "이어붙이기"는 못하지만,
        // 적어도 504로 죽지 않게 해당 파일로 리다이렉트한다.
        if (typeof fn === "string" && fn.startsWith("/objects/")) {
          return { objectUrl: fn };
        }
        return null;
      }
      const ext = path.extname(localPath).toLowerCase();
      const mime: Record<string, string> = { ".mp3": "audio/mpeg", ".wav": "audio/wav", ".ogg": "audio/ogg" };
      return { path: localPath, contentType: mime[ext] || "audio/mpeg" };
    };
    try {
      res.set("Cache-Control", "no-store");
      res.set("Content-Disposition", "inline");
      let lastStreamedId: number | null = null;
      const pump = async () => {
        while (!res.writableEnded) {
          const ch = await storage.getRadioChannelBySlug(slug);
          if (!ch || ch.status !== "live") break;
          const musicId = ch.nowPlayingMusicId ?? null;
          if (musicId == null) {
            await new Promise((r) => setTimeout(r, 1500));
            continue;
          }
          const info = await getLocalPathForMusicId(musicId);
          if (!info) {
            // 파일을 못 찾으면 무한 대기하지 말고 응답을 종료해 프록시 504를 피한다.
            // 클라이언트는 nowPlaying 변경 시 재요청(또는 재시도)한다.
            if (!res.headersSent) {
              res.status(404).end();
              return;
            }
            try { res.end(); } catch (_) {}
            return;
          }
          if ("objectUrl" in info) {
            if (!res.headersSent) {
              res.set("Cache-Control", "no-store");
              res.redirect(302, info.objectUrl);
              return;
            }
            try { res.end(); } catch (_) {}
            return;
          }
          if (lastStreamedId === musicId) {
            await new Promise((r) => setTimeout(r, 1000));
            lastStreamedId = null;
            continue;
          }
          lastStreamedId = musicId;
          if (!res.headersSent) {
            res.set("Content-Type", info.contentType);
            res.status(200);
          }
          await new Promise<void>((resolve, reject) => {
            const fileStream = createReadStream(info.path);
            fileStream.pipe(res, { end: false });
            fileStream.on("end", () => resolve());
            fileStream.on("error", (err) => {
              fileStream.destroy();
              reject(err);
            });
            res.on("close", () => {
              fileStream.destroy();
              resolve();
            });
          });
          if (res.writableEnded) break;
        }
        if (!res.writableEnded) res.end();
      };
      pump().catch((e) => {
        if (!res.writableEnded) {
          try { res.end(); } catch (_) {}
        }
        console.warn("[radio/channels/:slug/stream]", e);
      });
    } catch (e) {
      if (!res.headersSent) res.status(500).end();
      console.warn("[radio/channels/:slug/stream]", e);
    }
  });

  app.post("/api/radio/channels", isAuthenticated, async (req, res) => {
    try {
      // @ts-ignore
      const userId = req.user.claims.sub;
      const existing = await storage.getRadioChannelByOwnerId(userId);
      if (existing) {
        return res.status(400).json({ message: "이미 채널이 있습니다. 한 계정당 하나의 채널만 만들 수 있습니다." });
      }
      const { name, slug, description, coverFilename, homepageUrl: bodyHomepageUrl } = req.body || {};
      if (!name || !slug || typeof name !== "string" || typeof slug !== "string") {
        return res.status(400).json({ message: "채널 이름과 슬러그를 입력하세요." });
      }
      const safeSlug = slug.trim().toLowerCase().replace(/[^a-z0-9-_]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "") || "channel";
      let homepageUrl: string | null = null;
      if (bodyHomepageUrl !== undefined && bodyHomepageUrl !== null && String(bodyHomepageUrl).trim()) {
        const n = normalizeRadioHomepageUrl(bodyHomepageUrl);
        if (!n.ok) return res.status(400).json({ message: "올바른 홈페이지 주소(URL)를 입력해 주세요." });
        homepageUrl = n.value;
      }
      const { id } = await storage.createRadioChannel({
        ownerId: userId,
        name: name.trim(),
        slug: safeSlug,
        description: description?.trim() || null,
        homepageUrl,
        coverFilename: coverFilename || null,
      });
      res.status(201).json({ id, slug: safeSlug });
    } catch (e) {
      console.error("[radio/channels create]", e);
      res.status(500).json({ message: "채널 생성에 실패했습니다" });
    }
  });

  // 개발용 단순 송출 테스트 엔드포인트 (radio-audio-test.html 전용)
  if (process.env.NODE_ENV === "development") {
    app.patch("/api/dev/radio/channels/:slug", async (req, res) => {
      try {
        const slug = String(req.params.slug || "").trim().toLowerCase();
        if (!slug) return res.status(404).json({ message: "채널을 찾을 수 없습니다." });
        const channel = await storage.getRadioChannelBySlug(slug);
        if (!channel) return res.status(404).json({ message: "채널을 찾을 수 없습니다." });
        const { status, nowPlayingMusicId, nowPlayingStartedAt } = req.body || {};
        const updates: any = {};
        if (status) updates.status = String(status);
        if (nowPlayingMusicId !== undefined) {
          const idNum = nowPlayingMusicId == null ? null : Number(nowPlayingMusicId);
          updates.nowPlayingMusicId = idNum;
          updates.nowPlayingStartedAt = idNum != null
            ? (nowPlayingStartedAt ? new Date(nowPlayingStartedAt) : new Date())
            : null;
        }
        await storage.updateRadioChannel(channel.id, updates);
        const updated = await storage.getRadioChannelBySlug(slug);
        return res.json(updated);
      } catch (e) {
        console.error("[dev/radio/channels patch]", e);
        return res.status(500).json({ message: "채널 업데이트 실패 (dev)" });
      }
    });
  }

  app.patch("/api/radio/channels/:slug", isAuthenticated, async (req, res) => {
    try {
      const userId = (req as any).user?.claims?.sub;
      const slug = String(req.params.slug || "").trim().toLowerCase();
      if (!slug) return res.status(404).json({ message: "채널을 찾을 수 없습니다." });
      const channel = await storage.getRadioChannelBySlug(slug);
      if (!channel) return res.status(404).json({ message: "채널을 찾을 수 없습니다." });
      const role = await storage.getUserRole(userId);
      const isOwner = channel.ownerId === userId;
      const isCurrentHost = (channel as any).currentHostId === userId;
      const isAdminUser = role === "admin";
      const canManage = isOwner || isCurrentHost || isAdminUser;

      const { status, nowPlayingMusicId, nowPlayingStartedAt, nowPlayingObjectPath: bodyNowPlayingObjectPath, nowPlayingLocalTitle: bodyNowPlayingLocalTitle, afterTempNextSnapshotIndex: bodyAfterTempNextSnapshotIndex, currentHostId: bodyCurrentHostId, scheduledStartAt: bodyScheduledStartAt, scheduledEndAt: bodyScheduledEndAt, notice: bodyNotice, homepageUrl: bodyHomepageUrl, homeTickerText: bodyHomeTickerText, queueMusicIds: bodyQueueMusicIds, currentTrackDurationSeconds: bodyCurrentTrackDurationSeconds, queueDurationsSeconds: bodyQueueDurationsSeconds, advanceToNextTrack: bodyAdvanceToNextTrack, currentTrackId: bodyCurrentTrackId } = req.body || {};
      const updates: { status?: string; nowPlayingMusicId?: number | null; nowPlayingStartedAt?: Date | null; nowPlayingObjectPath?: string | null; nowPlayingTempDurationSeconds?: number | null; nowPlayingTempNextSnapshotIndex?: number | null; currentHostId?: string | null; scheduledStartAt?: Date | null; scheduledEndAt?: Date | null; notice?: string | null; playlistSnapshot?: { musicIds: number[]; durationsSeconds: number[]; currentIndex: number } | null } = {};

      if (bodyCurrentHostId !== undefined) {
        if (!isOwner) return res.status(403).json({ message: "채널 소유자만 인수인계할 수 있습니다." });
        const newHostId = bodyCurrentHostId === null || bodyCurrentHostId === "" ? null : String(bodyCurrentHostId);
        if (newHostId) {
          const isStaff = await storage.isRadioChannelStaff(channel.id, newHostId);
          if (newHostId !== channel.ownerId && !isStaff) return res.status(400).json({ message: "송출을 넘길 수 있는 사람은 방장 또는 스텝만 가능합니다." });
        }
        updates.currentHostId = newHostId;
      }

      if (!canManage && Object.keys(updates).length === 0) return res.status(403).json({ message: "채널 소유자 또는 현재 송출 호스트만 수정할 수 있습니다." });
      if (status !== undefined && String(status) === "ended" && !isOwner && !isCurrentHost && !isAdminUser) {
        return res.status(403).json({ message: "방송 종료는 방장 또는 현재 송출 호스트만 가능합니다." });
      }
      if (canManage) {
        // DJ 모니터 곡 끝 시 즉시 다음 곡으로 진행 (낙관적 락: currentTrackId 일치할 때만 진행)
        const snap = (channel as any).playlistSnapshot as { musicIds: number[]; durationsSeconds: number[]; currentIndex: number } | null;
        if (bodyAdvanceToNextTrack && snap && Array.isArray(snap.musicIds) && snap.musicIds.length > 0) {
          const ch = channel as any;
          const expectedTrackId = bodyCurrentTrackId != null ? Number(bodyCurrentTrackId) : null;
          if (expectedTrackId != null && !Number.isNaN(expectedTrackId)) {
            const serverTrackId = ch.nowPlayingMusicId ?? null;
            if (serverTrackId !== expectedTrackId) {
              const updated = await storage.getRadioChannelBySlug(slug);
              return res.status(409).json({ ...updated, _alreadyAdvanced: true });
            }
          }
          let nextId: number;
          let nextIndex: number;
          if (ch.nowPlayingObjectPath != null && ch.nowPlayingTempNextSnapshotIndex != null) {
            nextIndex = ch.nowPlayingTempNextSnapshotIndex;
            nextId = snap.musicIds[nextIndex];
          } else if (ch.nowPlayingMusicId != null) {
            const currentIdx = snap.musicIds.indexOf(ch.nowPlayingMusicId);
            const fromIndex = currentIdx >= 0 ? currentIdx : snap.currentIndex;
            nextIndex = (fromIndex + 1) % snap.musicIds.length;
            nextId = snap.musicIds[nextIndex];
          } else {
            nextIndex = 0;
            nextId = snap.musicIds[0];
          }
          await storage.updateRadioChannel(channel.id, {
            nowPlayingMusicId: nextId,
            nowPlayingStartedAt: new Date(),
            nowPlayingObjectPath: null,
            nowPlayingTempDurationSeconds: null,
            nowPlayingTempNextSnapshotIndex: null,
            playlistSnapshot: { musicIds: snap.musicIds, durationsSeconds: snap.durationsSeconds, currentIndex: nextIndex },
          });
          radioLocalTitles.delete(slug);
          const updated = await storage.getRadioChannelBySlug(slug);
          broadcastToRadioChannel(slug, {
            type: "radio_now_playing",
            slug,
            musicId: nextId,
            nowPlayingObjectPath: null,
            nowPlayingLocalTitle: null,
            startedAt: new Date().toISOString(),
            elapsedSeconds: 0,
          });
          return res.json(updated);
        }
        if (status !== undefined && ["draft", "live", "paused", "ended"].includes(String(status))) {
          updates.status = String(status);
          if (String(status) === "ended") {
            updates.currentHostId = null;
            updates.nowPlayingMusicId = null;
            updates.nowPlayingStartedAt = null;
            updates.nowPlayingObjectPath = null;
            radioLocalTitles.delete(slug);
            updates.nowPlayingTempDurationSeconds = null;
            updates.nowPlayingTempNextSnapshotIndex = null;
            updates.playlistSnapshot = null;
          }
        }
        if (nowPlayingMusicId !== undefined) {
          updates.nowPlayingMusicId = nowPlayingMusicId === null || nowPlayingMusicId === "" ? null : Number(nowPlayingMusicId);
          if (updates.nowPlayingMusicId != null) {
            updates.nowPlayingObjectPath = null;
            radioLocalTitles.delete(slug);
            updates.nowPlayingTempDurationSeconds = null;
            updates.nowPlayingTempNextSnapshotIndex = null;
          }
        }
        if (bodyNowPlayingObjectPath !== undefined) {
          updates.nowPlayingObjectPath = typeof bodyNowPlayingObjectPath === "string" && bodyNowPlayingObjectPath.trim() ? bodyNowPlayingObjectPath.trim() : null;
          if (updates.nowPlayingObjectPath) {
            updates.nowPlayingMusicId = null;
            updates.nowPlayingStartedAt = new Date();
            radioLocalTitles.set(slug, typeof bodyNowPlayingLocalTitle === "string" && bodyNowPlayingLocalTitle.trim() ? bodyNowPlayingLocalTitle.trim().slice(0, 200) : null);
            const dur = typeof bodyCurrentTrackDurationSeconds === "number" && bodyCurrentTrackDurationSeconds > 0 ? bodyCurrentTrackDurationSeconds : 240;
            updates.nowPlayingTempDurationSeconds = Math.ceil(dur);
            const nextIdx = typeof bodyAfterTempNextSnapshotIndex === "number" && Number.isInteger(bodyAfterTempNextSnapshotIndex) ? bodyAfterTempNextSnapshotIndex : 0;
            updates.nowPlayingTempNextSnapshotIndex = nextIdx;
          } else {
            radioLocalTitles.delete(slug);
            updates.nowPlayingTempDurationSeconds = null;
            updates.nowPlayingTempNextSnapshotIndex = null;
          }
        }
        if (nowPlayingStartedAt !== undefined) updates.nowPlayingStartedAt = nowPlayingStartedAt ? new Date(nowPlayingStartedAt) : null;
        if (updates.nowPlayingMusicId !== undefined && updates.nowPlayingStartedAt === undefined) updates.nowPlayingStartedAt = new Date();
        // 재생 큐 스냅샷: DJ가 보낸 큐+길이 저장 → 송출 브라우저를 닫아도 서버가 다음 곡 자동 진행
        const queueMusicIds = Array.isArray(bodyQueueMusicIds) ? bodyQueueMusicIds.filter((x: unknown) => typeof x === "number" && Number.isInteger(x)) as number[] : null;
        const queueDurationsSeconds = Array.isArray(bodyQueueDurationsSeconds) ? bodyQueueDurationsSeconds as number[] : null;
        const currentTrackDuration = typeof bodyCurrentTrackDurationSeconds === "number" && bodyCurrentTrackDurationSeconds > 0 ? bodyCurrentTrackDurationSeconds : null;
        if (queueMusicIds && queueMusicIds.length > 0 && updates.nowPlayingMusicId != null) {
          const currentIndex = queueMusicIds.indexOf(updates.nowPlayingMusicId);
          if (currentIndex >= 0) {
            const durationsSeconds = (queueDurationsSeconds && queueDurationsSeconds.length === queueMusicIds.length)
              ? queueDurationsSeconds.slice(0, queueMusicIds.length)
              : queueMusicIds.map(() => 240);
            const durationForCurrent = currentTrackDuration ?? durationsSeconds[currentIndex] ?? 240;
            if (currentTrackDuration != null && durationsSeconds[currentIndex] === 240) {
              durationsSeconds[currentIndex] = Math.ceil(durationForCurrent);
            } else if (currentTrackDuration != null) {
              durationsSeconds[currentIndex] = Math.ceil(durationForCurrent);
            }
            updates.playlistSnapshot = { musicIds: queueMusicIds, durationsSeconds, currentIndex };
          }
        } else if (
          currentTrackDuration != null &&
          channel.playlistSnapshot &&
          updates.nowPlayingMusicId === undefined &&
          (channel as any).nowPlayingObjectPath == null
        ) {
          const snap = channel.playlistSnapshot;
          const idx = snap.currentIndex;
          const newDurations = [...snap.durationsSeconds];
          if (idx >= 0 && idx < newDurations.length) {
            newDurations[idx] = Math.ceil(currentTrackDuration);
            updates.playlistSnapshot = { ...snap, durationsSeconds: newDurations };
          }
        }
        // 로컬 파일(object path) 송출: play 직후 duration 미확정이면 기본 240초로 잡혀 곡이 끝나기 전에 서버가 넘길 수 있음 → 메타데이터 로드 후 보정
        if (
          currentTrackDuration != null &&
          (channel as any).nowPlayingObjectPath != null &&
          (channel as any).nowPlayingMusicId == null &&
          bodyNowPlayingObjectPath === undefined &&
          updates.nowPlayingObjectPath === undefined
        ) {
          updates.nowPlayingTempDurationSeconds = Math.ceil(currentTrackDuration);
        }
      }
      if (isOwner || isAdminUser) {
        if (bodyScheduledStartAt !== undefined) updates.scheduledStartAt = bodyScheduledStartAt === null || bodyScheduledStartAt === "" ? null : new Date(bodyScheduledStartAt);
        if (bodyScheduledEndAt !== undefined) updates.scheduledEndAt = bodyScheduledEndAt === null || bodyScheduledEndAt === "" ? null : new Date(bodyScheduledEndAt);
        if (bodyNotice !== undefined) {
          const text = typeof bodyNotice === "string" ? bodyNotice.trim() : "";
          updates.notice = text ? text.slice(0, 200) : null;
        }
        const { name: bodyName, description: bodyDescription, coverFilename: bodyCoverFilename } = req.body || {};
        if (bodyName !== undefined) {
          const trimmed = typeof bodyName === "string" ? bodyName.trim() : "";
          if (trimmed) (updates as any).name = trimmed.slice(0, 50);
        }
        if (bodyDescription !== undefined) {
          const trimmed = typeof bodyDescription === "string" ? bodyDescription.trim() : "";
          (updates as any).description = trimmed ? trimmed.slice(0, 200) : null;
        }
        if (bodyHomepageUrl !== undefined) {
          if (bodyHomepageUrl === null || bodyHomepageUrl === "") {
            (updates as any).homepageUrl = null;
          } else {
            const n = normalizeRadioHomepageUrl(bodyHomepageUrl);
            if (!n.ok) return res.status(400).json({ message: "올바른 홈페이지 주소(URL)를 입력해 주세요." });
            (updates as any).homepageUrl = n.value;
          }
        }
        if (bodyHomeTickerText !== undefined) {
          if (bodyHomeTickerText === null || bodyHomeTickerText === "") {
            (updates as any).homeTickerText = null;
          } else {
            const raw = typeof bodyHomeTickerText === "string" ? bodyHomeTickerText : "";
            const oneLine = raw.replace(/\r?\n/g, " ").replace(/\s+/g, " ").trim();
            (updates as any).homeTickerText = oneLine ? oneLine.slice(0, 200) : null;
          }
        }
        if (bodyCoverFilename !== undefined) {
          (updates as any).coverFilename = typeof bodyCoverFilename === "string" && bodyCoverFilename.trim() ? bodyCoverFilename.trim() : null;
        }
      }

      if (Object.keys(updates).length > 0) {
        await storage.updateRadioChannel(channel.id, updates);
      }
      const updated = await storage.getRadioChannelBySlug(slug);
      if ((updates.nowPlayingMusicId !== undefined || updates.nowPlayingObjectPath !== undefined) && updated) {
        const startedAt = updated!.nowPlayingStartedAt ? (updated!.nowPlayingStartedAt as Date).getTime() : 0;
        const elapsedSeconds = startedAt ? Math.max(0, Math.floor((Date.now() - startedAt) / 1000)) : 0;
        broadcastToRadioChannel(slug, {
          type: "radio_now_playing",
          slug,
          musicId: updated!.nowPlayingMusicId ?? null,
          nowPlayingObjectPath: (updated as any).nowPlayingObjectPath ?? null,
          nowPlayingLocalTitle: radioLocalTitles.get(slug) ?? null,
          startedAt: updated!.nowPlayingStartedAt ? (updated!.nowPlayingStartedAt as Date).toISOString() : null,
          elapsedSeconds,
        });
      }
      if (updates.status === "ended" && updated) {
        try {
          await storage.deleteRadioChatMessagesByChannel(updated.id);
        } catch (e) {
          console.warn("[radio] deleteRadioChatMessagesByChannel failed", e);
        }
        const endedByUserId = (req as any).user?.claims?.sub;
        let hostDisplayName: string = "DJ";
        if (endedByUserId) {
          try {
            const hostUser = await storage.getUserById(endedByUserId);
            hostDisplayName = (hostUser?.username ?? hostUser?.firstName ?? hostUser?.id ?? "DJ") as string;
          } catch (_) {}
        }
        broadcastToRadioChannel(slug, { type: "radio_broadcast_ended", slug, hostDisplayName });
      }
      res.json(updated);
    } catch (e) {
      console.error("[radio/channels PATCH]", e);
      res.status(500).json({ message: "채널 수정에 실패했습니다" });
    }
  });

  // 리스너가 곡 종료 시 즉시 다음 곡 진행 요청 (낙관적 락: currentMusicId가 서버와 일치할 때만 진행)
  app.post("/api/radio/channels/:slug/client-advance", async (req, res) => {
    try {
      const slug = String(req.params.slug).trim().toLowerCase();
      const currentMusicId = req.body?.currentMusicId != null ? Number(req.body.currentMusicId) : null;
      const channel = await storage.getRadioChannelBySlug(slug);
      if (!channel || channel.status !== "live") return res.json({ ok: false, reason: "not_live" });
      // 송출실(DJ)이 활성화된 경우 리스너가 임의로 곡을 넘기지 않도록 차단
      if ((channel as any).currentHostId) return res.json({ ok: false, reason: "studio_active" });
      const snap = channel.playlistSnapshot as { musicIds: number[]; durationsSeconds: number[]; currentIndex: number } | null;
      if (!snap || !Array.isArray(snap.musicIds) || snap.musicIds.length === 0) return res.json({ ok: false, reason: "no_playlist" });
      // 낙관적 락: 이미 다른 리스너가 진행했으면 무시
      if (currentMusicId != null && channel.nowPlayingMusicId !== currentMusicId) return res.json({ ok: false, reason: "already_advanced" });
      const curIdx =
        currentMusicId != null
          ? snap.musicIds[snap.currentIndex] === currentMusicId
            ? snap.currentIndex
            : snap.musicIds.indexOf(currentMusicId)
          : snap.currentIndex;
      const nextIndex = curIdx >= 0 ? (curIdx + 1) % snap.musicIds.length : 0;
      const nextId = snap.musicIds[nextIndex];
      await storage.updateRadioChannel(channel.id, {
        nowPlayingMusicId: nextId,
        nowPlayingStartedAt: new Date(),
        nowPlayingObjectPath: null,
        nowPlayingTempDurationSeconds: null,
        nowPlayingTempNextSnapshotIndex: null,
        playlistSnapshot: { musicIds: snap.musicIds, durationsSeconds: snap.durationsSeconds, currentIndex: nextIndex },
      });
      radioLocalTitles.delete(slug);
      broadcastToRadioChannel(slug, {
        type: "radio_now_playing",
        slug,
        musicId: nextId,
        nowPlayingObjectPath: null,
        nowPlayingLocalTitle: null,
        startedAt: new Date().toISOString(),
        elapsedSeconds: 0,
      });
      return res.json({ ok: true, nextMusicId: nextId });
    } catch (e) {
      console.error("[client-advance]", e);
      return res.status(500).json({ ok: false });
    }
  });

  // 서버 자동 진행: DJ 송출창을 닫아도 플레이리스트 순서대로 곡이 계속 재생됨
  const AUTO_ADVANCE_INTERVAL_MS = 3000;
  setInterval(async () => {
    try {
      const channels = await storage.listLiveRadioChannelsForAutoAdvance();
      const now = Date.now();
      for (const ch of channels) {
        // 송출실(DJ)이 활성화된 경우 서버 자동 진행 건너뜀 (DJ가 직접 제어)
        if ((ch as any).currentHostId) continue;
        const started = (ch.nowPlayingStartedAt as Date).getTime();
        const snap = ch.playlistSnapshot;
        if (!snap || snap.musicIds.length === 0) continue;

        let durationMs: number;
        if (ch.nowPlayingObjectPath != null && ch.nowPlayingTempDurationSeconds != null) {
          durationMs = ch.nowPlayingTempDurationSeconds * 1000;
        } else if (ch.nowPlayingMusicId != null) {
          // 동일 musicId가 큐에 여러 번 있으면 indexOf는 첫 번째만 보므로, currentIndex와 일치할 때는 스냅샷 인덱스를 우선한다.
          const idxPreferred =
            snap.musicIds[snap.currentIndex] === ch.nowPlayingMusicId ? snap.currentIndex : snap.musicIds.indexOf(ch.nowPlayingMusicId);
          const idx = idxPreferred >= 0 ? idxPreferred : snap.currentIndex;
          const rawDur = idx >= 0 && idx < snap.durationsSeconds.length ? snap.durationsSeconds[idx] : 0;
          const dur = typeof rawDur === "number" && rawDur > 0 ? rawDur : 240;
          durationMs = dur * 1000;
        } else {
          continue;
        }

        // 스냅샷 길이가 실제보다 짧을 때 곡 중간에 넘어가는 것 방지: 고정 4.5초보다 곡 길이 비례 여유(상한 있음)
        const AUTO_ADVANCE_END_SLACK_MS = Math.min(22_000, Math.max(8_000, Math.floor(durationMs * 0.12)));
        if (now - started < durationMs + AUTO_ADVANCE_END_SLACK_MS) continue;

        // 다음 곡 결정
        let nextIndex: number;
        if (ch.nowPlayingObjectPath != null && ch.nowPlayingTempNextSnapshotIndex != null) {
          nextIndex = ch.nowPlayingTempNextSnapshotIndex;
        } else if (ch.nowPlayingMusicId != null) {
          const curIdxAuto =
            snap.musicIds[snap.currentIndex] === ch.nowPlayingMusicId
              ? snap.currentIndex
              : snap.musicIds.indexOf(ch.nowPlayingMusicId);
          const curIdxSafe = curIdxAuto >= 0 ? curIdxAuto : snap.currentIndex;
          nextIndex = (curIdxSafe + 1) % snap.musicIds.length;
        } else {
          nextIndex = 0;
        }
        if (nextIndex >= snap.musicIds.length) nextIndex = 0;
        const nextId = snap.musicIds[nextIndex];

        await storage.updateRadioChannel(ch.id, {
          nowPlayingMusicId: nextId,
          nowPlayingStartedAt: new Date(),
          nowPlayingObjectPath: null,
          nowPlayingTempDurationSeconds: null,
          nowPlayingTempNextSnapshotIndex: null,
          playlistSnapshot: { musicIds: snap.musicIds, durationsSeconds: snap.durationsSeconds, currentIndex: nextIndex },
        });
        radioLocalTitles.delete(ch.slug);
        broadcastToRadioChannel(ch.slug, {
          type: "radio_now_playing",
          slug: ch.slug,
          musicId: nextId,
          nowPlayingObjectPath: null,
          nowPlayingLocalTitle: null,
          startedAt: new Date().toISOString(),
          elapsedSeconds: 0,
        });
      }
    } catch (e) {
      console.error("[radio auto-advance]", e);
    }
  }, AUTO_ADVANCE_INTERVAL_MS);

  // 라디오 채팅 보관 기간: 1일 (오래된 채팅 자동 삭제)
  const RADIO_CHAT_TTL_DAYS = 1;
  const RADIO_CHAT_CLEANUP_INTERVAL_MS = 60 * 60 * 1000; // 1시간마다
  setInterval(async () => {
    try {
      await storage.deleteRadioChatMessagesOlderThanDays(RADIO_CHAT_TTL_DAYS);
    } catch (e) {
      console.warn("[radio chat cleanup]", e);
    }
  }, RADIO_CHAT_CLEANUP_INTERVAL_MS);

  app.delete("/api/radio/channels/:slug", isAuthenticated, async (req, res) => {
    try {
      const userId = (req as any).user?.claims?.sub;
      const slug = String(req.params.slug || "").trim().toLowerCase();
      if (!slug) return res.status(404).json({ message: "채널을 찾을 수 없습니다." });
      const channel = await storage.getRadioChannelBySlug(slug);
      if (!channel) return res.status(404).json({ message: "채널을 찾을 수 없습니다." });
      const role = await storage.getUserRole(userId);
      const isOwner = channel.ownerId === userId;
      const isAdminUser = role === "admin";
      if (!isOwner && !isAdminUser) return res.status(403).json({ message: "채널 소유자 또는 관리자만 삭제할 수 있습니다." });
      await storage.deleteRadioChannel(channel.id);
      res.status(204).send();
    } catch (e) {
      console.error("[radio/channels DELETE]", e);
      res.status(500).json({ message: "채널 삭제에 실패했습니다" });
    }
  });

  app.get("/api/radio/channels/:slug/chat", isAuthenticated, async (req, res) => {
    try {
      const slug = String(req.params.slug || "").trim().toLowerCase();
      if (!slug) return res.status(404).json({ message: "채널을 찾을 수 없습니다" });
      const channel = await storage.getRadioChannelBySlug(slug);
      if (!channel) return res.status(404).json({ message: "채널을 찾을 수 없습니다" });
      const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit), 10) || 50));
      const messages = await storage.getRadioChatMessages(channel.id, limit);
      res.json(messages);
    } catch (e) {
      console.error("[radio/channels/:slug/chat]", e);
      if ((e as any)?.code === "42P01" || String((e as any)?.message || "").includes("does not exist")) {
        return res.json([]);
      }
      res.status(500).json({ message: "채팅 내역을 불러올 수 없습니다" });
    }
  });

  app.get("/api/radio/channels/:slug/requests", async (req, res) => {
    try {
      const slug = String(req.params.slug || "").trim().toLowerCase();
      if (!slug) return res.status(404).json({ message: "채널을 찾을 수 없습니다" });
      const channel = await storage.getRadioChannelBySlug(slug);
      if (!channel) return res.status(404).json({ message: "채널을 찾을 수 없습니다" });
      const status = typeof req.query.status === "string" ? req.query.status : undefined;
      const list = await storage.getRadioSongRequestsByChannel(channel.id, status);
      res.json(list);
    } catch (e) {
      console.error("[radio/channels/:slug/requests]", e);
      if ((e as any)?.code === "42P01" || String((e as any)?.message || "").includes("does not exist")) {
        return res.json([]);
      }
      res.status(500).json({ message: "신청곡 목록을 불러올 수 없습니다" });
    }
  });

  app.post("/api/radio/channels/:slug/requests", isAuthenticated, async (req, res) => {
    try {
      const slug = String(req.params.slug || "").trim().toLowerCase();
      if (!slug) return res.status(404).json({ message: "채널을 찾을 수 없습니다" });
      const channel = await storage.getRadioChannelBySlug(slug);
      if (!channel) return res.status(404).json({ message: "채널을 찾을 수 없습니다" });
      // @ts-ignore
      const userId = req.user.claims.sub;
      const { musicId, title, artist, message } = req.body || {};
      const musicIdNum = musicId != null ? Number(musicId) : null;
      if (musicIdNum != null && !Number.isNaN(musicIdNum)) {
        const musicExists = await storage.getMusicById(musicIdNum);
        if (!musicExists) return res.status(400).json({ message: "해당 음원을 찾을 수 없습니다." });
      }
      const row = await storage.createRadioSongRequest({
        channelId: channel.id,
        userId,
        musicId: musicIdNum != null && !Number.isNaN(musicIdNum) ? musicIdNum : null,
        title: title != null ? String(title).trim().slice(0, 200) : null,
        artist: artist != null ? String(artist).trim().slice(0, 200) : null,
        message: message != null ? String(message).trim().slice(0, 300) : null,
      });
      // 송출실(스튜디오)에 실시간으로 신청곡 알림
      broadcastToRadioChannel(slug, {
        type: "radio_new_request",
        slug,
        request: {
          id: row.id,
          musicId: row.musicId,
          title: row.title,
          artist: row.artist,
          status: row.status,
          createdAt: row.createdAt,
        },
      });
      res.status(201).json(row);
    } catch (e: any) {
      console.error("[radio/channels/:slug/requests POST]", e);
      const code = e?.code;
      const msg = e?.message || "";
      if (code === "42P01" || msg.includes("does not exist")) {
        return res.status(500).json({ message: "신청곡 테이블이 없습니다. npm run db:deploy 또는 deploy/radio-chat-and-requests.sql 을 실행해 주세요." });
      }
      if (code === "23503") {
        return res.status(400).json({ message: "채널 또는 음원 정보가 올바르지 않습니다." });
      }
      res.status(500).json({ message: e?.message || "신청곡 등록에 실패했습니다" });
    }
  });

  app.patch("/api/radio/channels/:slug/requests/:id", isAuthenticated, async (req, res) => {
    try {
      const slug = String(req.params.slug ?? "");
      const id = String(req.params.id ?? "");
      const channel = await storage.getRadioChannelBySlug(slug);
      if (!channel) return res.status(404).json({ message: "채널을 찾을 수 없습니다" });
      // @ts-ignore
      const userId = req.user.claims.sub;
      const role = await storage.getUserRole(userId);
      const isOwner = channel.ownerId === userId;
      const isCurrentHost = (channel as any).currentHostId === userId;
      const isAdminUser = role === "admin";
      const isStaff = await storage.isRadioChannelStaff(channel.id, userId);
      const canManageRequests = isOwner || isCurrentHost || isAdminUser || isStaff;
      if (!canManageRequests) return res.status(403).json({ message: "운영진(방장/스텝/CJ)만 수정할 수 있습니다" });
      const requestId = parseInt(id, 10);
      if (Number.isNaN(requestId)) return res.status(400).json({ message: "잘못된 요청입니다" });
      const { status, sortOrder } = req.body || {};
      const updates: { status?: string; sortOrder?: number } = {};
      if (status !== undefined && ["pending", "playing", "played", "cancelled"].includes(String(status))) updates.status = String(status);
      if (sortOrder !== undefined) updates.sortOrder = Number(sortOrder);
      if (Object.keys(updates).length > 0) await storage.updateRadioSongRequest(requestId, channel.id, updates);
      const list = await storage.getRadioSongRequestsByChannel(channel.id);
      res.json(list);
    } catch (e) {
      console.error("[radio/channels/:slug/requests PATCH]", e);
      res.status(500).json({ message: "수정에 실패했습니다" });
    }
  });

  // === Tips (후원) Routes ===
  app.post("/api/tips", isAuthenticated, async (req, res) => {
    try {
      // @ts-ignore
      const fromUserId = req.user.claims.sub;
      const { toUserId, musicId, amount, message } = req.body;

      if (!toUserId || !amount || amount < 100) {
        return res.status(400).json({ message: "후원 금액은 최소 100원입니다" });
      }
      if (fromUserId === toUserId) {
        return res.status(400).json({ message: "자기 자신에게 후원할 수 없습니다" });
      }

      if (musicId != null && musicId !== "") {
        const mid = Number(musicId);
        if (Number.isFinite(mid) && mid > 0) {
          const tipMusic = await storage.getMusicById(mid);
          if (tipMusic?.freeAiSiteRestrictions) {
            return res.status(400).json({ message: "이 음원에는 후원을 보낼 수 없습니다." });
          }
        }
      }

      const deducted = await storage.deductCredits(fromUserId, amount);
      if (!deducted) {
        return res.status(400).json({ message: "지갑 잔액이 부족합니다. 충전 후 다시 시도해 주세요.", insufficientCredits: true });
      }

      const tip = await storage.createTip({ fromUserId, toUserId, musicId: musicId || null, amount, message: message || null });
      await storage.addToBalance(toUserId, amount);

      const fromUser = await storage.getUserById(fromUserId);
      const fromName = fromUser?.firstName || "누군가";

      await storage.createCreditTransaction({
        userId: fromUserId,
        type: "tip_sent",
        amount: -amount,
        description: `후원 보내기`,
        relatedId: tip.id,
      });
      await storage.createCreditTransaction({
        userId: toUserId,
        type: "tip_received",
        amount,
        description: `${fromName}님 후원`,
        relatedId: tip.id,
      });

      await storage.createNotification({
        userId: toUserId,
        type: "tip",
        message: `${fromName}님이 ${amount.toLocaleString()}원을 후원했습니다${message ? `: "${message}"` : ""}`,
        payload: { fromName, amount, tipMessage: message || undefined },
        url: musicId ? `/explore` : undefined,
      });

      // 후원 뱃지 자동 계산 및 업데이트
      const totalSent = await storage.getTipsTotalSent(fromUserId);
      const newBadge = calculateDonationBadge(totalSent);
      const currentBadge = fromUser?.donationBadge ?? null;
      if (newBadge !== currentBadge) {
        await storage.updateDonationBadge(fromUserId, newBadge);
        if (newBadge) {
          const badgeNames: Record<string, string> = { seed: "🌱 씨앗", sprout: "🌿 새싹", supporter: "⭐ 후원자", sponsor: "💎 스폰서" };
          await storage.createNotification({
            userId: fromUserId,
            type: "badge",
            message: `축하합니다! ${badgeNames[newBadge]} 후원 뱃지를 획득했습니다!`,
            payload: { badgeKey: newBadge },
          });
        }
      }

      res.json({ ...tip, donationBadge: newBadge });
    } catch (err) {
      console.error("Tip error:", err);
      res.status(500).json({ message: "후원에 실패했습니다" });
    }
  });

  app.get("/api/tips/sent", isAuthenticated, async (req, res) => {
    try {
      // @ts-ignore
      const userId = req.user.claims.sub;
      const tipsList = await storage.getTipsByUser(userId);
      res.json(tipsList);
    } catch (err) {
      res.status(500).json({ message: "후원 내역을 불러올 수 없습니다" });
    }
  });

  app.get("/api/tips/received", isAuthenticated, async (req, res) => {
    try {
      // @ts-ignore
      const userId = req.user.claims.sub;
      const tipsList = await storage.getTipsReceived(userId);
      res.json(tipsList);
    } catch (err) {
      res.status(500).json({ message: "받은 후원 내역을 불러올 수 없습니다" });
    }
  });

  // === Purchases (유료 다운로드) Routes ===
  app.post("/api/purchases", isAuthenticated, async (req, res) => {
    try {
      // @ts-ignore
      const buyerId = req.user.claims.sub;
      const { musicId } = req.body;

      if (!musicId) {
        return res.status(400).json({ message: "음원 정보가 필요합니다" });
      }

      const musicItem = await storage.getMusicById(musicId);
      if (!musicItem) {
        return res.status(404).json({ message: "음원을 찾을 수 없습니다" });
      }
      if (musicItem.freeAiSiteRestrictions) {
        return res.status(400).json({ message: "이 음원은 유료 다운로드·구매가 제공되지 않습니다." });
      }
      if (!musicItem.isDownloadable || !musicItem.price || musicItem.price <= 0) {
        return res.status(400).json({ message: "이 음원은 유료 다운로드가 불가능합니다" });
      }
      if (buyerId === musicItem.userId) {
        return res.status(400).json({ message: "자신의 음원은 무료로 다운로드할 수 있습니다" });
      }

      const alreadyPurchased = await storage.hasPurchased(buyerId, musicId);
      if (alreadyPurchased) {
        return res.status(400).json({ message: "이미 구매한 음원입니다", alreadyPurchased: true });
      }

      const deducted = await storage.deductCredits(buyerId, musicItem.price);
      if (!deducted) {
        return res.status(400).json({ message: "지갑 잔액이 부족합니다. 충전 후 다시 시도해 주세요.", insufficientCredits: true });
      }

      const purchase = await storage.createPurchase({
        buyerId,
        musicId,
        sellerId: musicItem.userId,
        amount: musicItem.price,
      });
      await storage.addToBalance(musicItem.userId, musicItem.price);

      await storage.createCreditTransaction({
        userId: buyerId,
        type: "purchase",
        amount: -musicItem.price,
        description: `"${musicItem.title}" 구매`,
        relatedId: purchase.id,
      });

      const buyer = await storage.getUserById(buyerId);
      const buyerName = buyer?.firstName || "누군가";
      await storage.createNotification({
        userId: musicItem.userId,
        type: "purchase",
        message: `${buyerName}님이 "${musicItem.title}"을(를) ${musicItem.price.toLocaleString()}원에 구매했습니다`,
        payload: { fromName: buyerName, musicTitle: musicItem.title, price: musicItem.price },
        url: `/explore`,
      });

      res.json(purchase);
    } catch (err) {
      console.error("Purchase error:", err);
      res.status(500).json({ message: "구매에 실패했습니다" });
    }
  });

  app.get("/api/purchases/check/:musicId", isAuthenticated, async (req, res) => {
    try {
      // @ts-ignore
      const buyerId = req.user.claims.sub;
      const musicId = Number(req.params.musicId);
      const purchased = await storage.hasPurchased(buyerId, musicId);
      res.json({ purchased });
    } catch (err) {
      res.status(500).json({ message: "구매 확인에 실패했습니다" });
    }
  });

  app.get("/api/purchases/my", isAuthenticated, async (req, res) => {
    try {
      // @ts-ignore
      const userId = req.user.claims.sub;
      const purchasesList = await storage.getPurchasesByUser(userId);
      res.json(purchasesList);
    } catch (err) {
      res.status(500).json({ message: "구매 내역을 불러올 수 없습니다" });
    }
  });

  app.get("/api/music/:id/download", isAuthenticated, async (req, res) => {
    try {
      // @ts-ignore
      const userId = req.user.claims.sub;
      const musicId = Number(req.params.id);

      const musicItem = await storage.getMusicById(musicId);
      if (!musicItem) {
        return res.status(404).json({ message: "음원을 찾을 수 없습니다" });
      }
      const isOwnerDownload = String(musicItem.userId) === String(userId);
      if (musicItem.freeAiSiteRestrictions && !isOwnerDownload) {
        return res.status(403).json({ message: "이 음원은 다운로드가 제공되지 않습니다." });
      }

      if (!isOwnerDownload) {
        const purchased = await storage.hasPurchased(userId, musicId);
        if (!purchased) {
          return res.status(403).json({ message: "구매한 음원만 다운로드할 수 있습니다" });
        }
      }

      const fn = musicItem.filename || "";
      let fileId = "";
      const objMatch = fn.match(/\/objects\/uploads\/(.+)$/);
      if (objMatch) fileId = objMatch[1];
      else if (fn.startsWith("uploads/")) fileId = fn.replace(/^uploads\//, "");
      else if (/^[a-f0-9-]{36}(\.[a-z]+)?$/i.test(fn.trim())) fileId = fn.trim();
      else if (fn.includes("/")) fileId = fn.split("/").pop() || "";
      else fileId = fn;
      fileId = fileId.replace(/^\//, "");

      if (!fileId) {
        return res.status(404).json({ message: "파일 경로를 찾을 수 없습니다" });
      }

      const baseId = fileId.replace(/\.(mp3|wav|ogg)$/i, "");
      const candidates = [
        path.join(uploadsDir, fileId),
        path.join(uploadsDir, `${baseId}.mp3`),
        path.join(uploadsDir, `${baseId}.wav`),
        path.join(uploadsDir, `${baseId}.ogg`),
      ];
      const localPath = candidates.find((p) => existsSync(p));
      const safeTitle = (musicItem.title || "music").replace(/[^\w\s가-힣-]/g, "").trim();
      const extFromFileId = path.extname(fileId).toLowerCase() || ".mp3";

      if (localPath) {
        const ext = path.extname(localPath).toLowerCase();
        const mime: Record<string, string> = {
          ".mp3": "audio/mpeg",
          ".wav": "audio/wav",
          ".ogg": "audio/ogg",
        };
        res.set("Content-Type", mime[ext] || "audio/mpeg");
        res.set("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(safeTitle + ext)}`);
        const fileStat = statSync(localPath);
        res.set("Content-Length", String(fileStat.size));
        createReadStream(localPath).pipe(res);
        return;
      }

      return res.status(404).json({ message: "음원 파일을 찾을 수 없습니다" });
    } catch (err) {
      res.status(500).json({ message: "다운로드에 실패했습니다" });
    }
  });

  app.get("/api/music/:id/ringtone", isAuthenticated, async (req, res) => {
    try {
      // @ts-ignore
      const userId = req.user.claims.sub;
      const musicId = Number(req.params.id);

      const musicItem = await storage.getMusicById(musicId);
      if (!musicItem) {
        return res.status(404).json({ message: "음원을 찾을 수 없습니다" });
      }
      if (musicItem.freeAiSiteRestrictions) {
        return res.status(403).json({ message: "이 음원은 벨소리 다운로드를 제공하지 않습니다." });
      }

      const isOwner = String(musicItem.userId) === String(userId);
      /** 벨소리는 본인 곡만 무료, 타인 곡은 음원 다운로드 정책과 무관하게 200원(로컬 파일만 있으면 허용) */

      const fn = musicItem.filename || "";
      let fileId = "";
      const objMatch = fn.match(/\/objects\/uploads\/(.+)$/);
      if (objMatch) fileId = objMatch[1];
      else if (fn.startsWith("uploads/")) fileId = fn.replace(/^uploads\//, "");
      else if (/^[a-f0-9-]{36}(\.[a-z]+)?$/i.test(fn.trim())) fileId = fn.trim();
      else if (fn.includes("/")) fileId = fn.split("/").pop() || "";
      else fileId = fn;
      fileId = fileId.replace(/^\//, "");

      if (!fileId) {
        return res.status(404).json({ message: "파일 경로를 찾을 수 없습니다" });
      }

      const baseId = fileId.replace(/\.(mp3|wav|ogg)$/i, "");
      const candidates = [
        path.join(uploadsDir, fileId),
        path.join(uploadsDir, `${baseId}.mp3`),
        path.join(uploadsDir, `${baseId}.wav`),
        path.join(uploadsDir, `${baseId}.ogg`),
      ];
      const localPath = candidates.find((p) => existsSync(p));
      const safeTitle = (musicItem.title || "music").replace(/[^\w\s가-힣-]/g, "").trim();
      const ringtoneBase = `${safeTitle}_벨소리`;

      if (!localPath) {
        return res.status(404).json({ message: "음원 파일을 찾을 수 없습니다" });
      }

      let mp3Buf: Buffer;
      try {
        mp3Buf = await encodeRingtoneClipMp3(localPath);
      } catch (encErr) {
        console.error("ringtone clip encode:", encErr);
        return res.status(500).json({ message: "벨소리 파일을 만들 수 없습니다. 잠시 후 다시 시도해 주세요." });
      }

      const fee = RINGTONE_FEE_WON;
      /** 본인 음원이 아니면 벨소리마다 200원(음원 유료·무료 다운로드 여부와 무관) */
      if (!isOwner) {
        const deducted = await storage.deductCredits(userId, fee);
        if (!deducted) {
          return res.status(400).json({
            message: "지갑 잔액이 부족합니다. 충전 후 다시 시도해 주세요.",
            insufficientCredits: true,
          });
        }
        const sellerId = String(musicItem.userId);
        await storage.addToBalance(sellerId, fee);
        const musicTitleEsc = musicItem.title || "음원";
        await storage.createCreditTransaction({
          userId,
          type: "ringtone_fee",
          amount: -fee,
          description: `「${musicTitleEsc}」 벨소리`,
          relatedId: musicId,
        });
        await storage.createCreditTransaction({
          userId: sellerId,
          type: "ringtone_income",
          amount: fee,
          description: "벨소리 수익",
          relatedId: musicId,
        });
        const buyer = await storage.getUserById(userId);
        const buyerName = buyer?.firstName || "리스너";
        await storage.createNotification({
          userId,
          type: "ringtone_paid",
          message: `「${musicTitleEsc}」 벨소리 다운로드로 ${fee.toLocaleString()}원이 차감되었습니다.`,
          payload: { musicTitle: musicTitleEsc, amount: fee },
          url: `/music/${musicId}`,
        });
        await storage.createNotification({
          userId: sellerId,
          type: "ringtone_earned",
          message: `${buyerName}님이 「${musicTitleEsc}」 벨소리로 ${fee.toLocaleString()}원을 지급했습니다.`,
          payload: { fromName: buyerName, musicTitle: musicTitleEsc, amount: fee },
          url: `/music/${musicId}`,
        });
      }

      res.set("Content-Type", "audio/mpeg");
      res.set("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(ringtoneBase + ".mp3")}`);
      res.set("Content-Length", String(mp3Buf.length));
      res.send(mp3Buf);
    } catch (err) {
      console.error("ringtone route:", err);
      res.status(500).json({ message: "다운로드에 실패했습니다" });
    }
  });

  // === Earnings (수익) Routes ===
  app.get("/api/earnings", isAuthenticated, async (req, res) => {
    try {
      // @ts-ignore
      const userId = req.user.claims.sub;
      const summary = await storage.getEarningsSummary(userId);
      res.json(summary);
    } catch (err) {
      res.status(500).json({ message: "수익 정보를 불러올 수 없습니다" });
    }
  });

  app.get("/api/earnings/sales", isAuthenticated, async (req, res) => {
    try {
      // @ts-ignore
      const userId = req.user.claims.sub;
      const sales = await storage.getSalesByUser(userId);
      res.json(sales);
    } catch (err) {
      res.status(500).json({ message: "판매 내역을 불러올 수 없습니다" });
    }
  });

  // === Withdrawals (출금) Routes ===
  app.post("/api/withdrawals", isAuthenticated, async (req, res) => {
    try {
      // @ts-ignore
      const userId = req.user.claims.sub;
      const { amount, bankName, accountNumber, accountHolder } = req.body;

      if (!amount || amount < 1000) {
        return res.status(400).json({ message: "최소 출금 금액은 1,000원입니다" });
      }

      const balance = await storage.getUserBalance(userId);
      if (balance < amount) {
        return res.status(400).json({ message: "잔액이 부족합니다" });
      }
      if (!bankName || !accountNumber || !accountHolder) {
        return res.status(400).json({ message: "계좌 정보를 모두 입력해주세요" });
      }

      const fee = Math.floor(amount * 0.15);
      const vat = Math.floor(fee * 0.1);
      const totalDeduction = fee + vat;
      const netAmount = amount - totalDeduction;

      const deducted = await storage.deductBalance(userId, amount);
      if (!deducted) {
        return res.status(400).json({ message: "잔액이 부족합니다" });
      }

      const withdrawal = await storage.createWithdrawal({
        userId,
        amount,
        fee,
        netAmount,
        bankName,
        accountNumber,
        accountHolder,
      });

      res.json(withdrawal);
    } catch (err) {
      console.error("Withdrawal error:", err);
      res.status(500).json({ message: "출금 요청에 실패했습니다" });
    }
  });

  app.get("/api/withdrawals", isAuthenticated, async (req, res) => {
    try {
      // @ts-ignore
      const userId = req.user.claims.sub;
      const withdrawalsList = await storage.getWithdrawalsByUser(userId);
      res.json(withdrawalsList);
    } catch (err) {
      res.status(500).json({ message: "출금 내역을 불러올 수 없습니다" });
    }
  });

  // Admin withdrawal management
  app.get("/api/admin/withdrawals", isAuthenticated, async (req, res) => {
    try {
      // @ts-ignore
      const userId = req.user.claims.sub;
      const role = await storage.getUserRole(userId);
      if (role !== "admin") return res.status(403).json({ message: "관리자 권한이 필요합니다" });

      const status = req.query.status as string | undefined;
      const allWithdrawals = await storage.getAllWithdrawals(status);
      res.json(allWithdrawals);
    } catch (err) {
      res.status(500).json({ message: "출금 목록을 불러올 수 없습니다" });
    }
  });

  app.patch("/api/admin/withdrawals/:id", isAuthenticated, async (req, res) => {
    try {
      // @ts-ignore
      const userId = req.user.claims.sub;
      const role = await storage.getUserRole(userId);
      if (role !== "admin") return res.status(403).json({ message: "관리자 권한이 필요합니다" });

      const withdrawalId = Number(req.params.id);
      const { status, adminNote } = req.body;

      if (!["approved", "rejected"].includes(status)) {
        return res.status(400).json({ message: "유효하지 않은 상태입니다" });
      }

      if (status === "rejected") {
        const existing = await storage.getWithdrawalsByUser("");
        const allWithdrawals = await storage.getAllWithdrawals();
        const target = allWithdrawals.find((w: any) => w.id === withdrawalId);
        if (target && target.status === "pending") {
          await storage.addToBalance(target.userId, target.amount);
        }
      }

      const updated = await storage.updateWithdrawalStatus(withdrawalId, status, adminNote);
      if (updated && updated.userId) {
        const statusLabel = status === "approved" ? "승인" : "거절";
        await storage.createNotification({
          userId: updated.userId,
          type: "system",
          message: `출금 신청이 ${statusLabel}되었습니다.${adminNote ? ` (${adminNote})` : ""}`,
          payload: { status, adminNote: adminNote || undefined },
          url: "/credits",
        });
      }
      res.json(updated);
    } catch (err) {
      console.error("Withdrawal update error:", err);
      res.status(500).json({ message: "출금 상태 변경에 실패했습니다" });
    }
  });

  // === Streaming Logs ===

  // Record streaming duration
  app.get("/api/streaming-limit", async (req, res) => {
    try {
      // @ts-ignore
      const userId = req.user?.claims?.sub;
      if (!userId) return res.json({ limited: false });
      const { isPremium } = await ensureExpiredSubscriptionDowngrade(userId);
      if (isPremium) return res.json({ limited: false });
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const result = await db.execute(sql`
        SELECT COUNT(DISTINCT music_id) as count FROM streaming_logs 
        WHERE user_id = ${userId} AND created_at >= ${today.toISOString()}
      `);
      const count = Number(result.rows[0]?.count || 0);
      res.json({ limited: count >= 100, current: count, limit: 100 });
    } catch (error) {
      res.json({ limited: false });
    }
  });

  app.post("/api/streaming-log", async (req, res) => {
    try {
      const { musicId, durationSeconds } = req.body;
      if (!musicId || !durationSeconds || durationSeconds < 1) {
        return res.status(400).json({ message: "잘못된 요청입니다" });
      }
      // @ts-ignore
      const userId = req.user?.claims?.sub || null;

      if (userId) {
        const { isPremium } = await ensureExpiredSubscriptionDowngrade(userId);
        if (!isPremium) {
          const today = new Date();
          today.setHours(0, 0, 0, 0);
          const result = await db.execute(sql`
            SELECT COUNT(DISTINCT music_id) as count FROM streaming_logs 
            WHERE user_id = ${userId} AND created_at >= ${today.toISOString()}
          `);
          const count = Number(result.rows[0]?.count || 0);
          if (count >= 100) {
            return res.status(403).json({ 
              message: "Free 플랜은 일일 100곡까지 스트리밍할 수 있습니다. 프리미엄으로 업그레이드하면 무제한 스트리밍이 가능합니다.",
              code: "STREAMING_LIMIT_REACHED"
            });
          }
        }
      }

      await db.insert(streamingLogs).values({
        userId,
        musicId: Number(musicId),
        durationSeconds: Math.round(Number(durationSeconds)),
      });
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ message: "스트리밍 기록 실패" });
    }
  });

  // Get total streaming time for a user's uploaded music
  app.get("/api/streaming-stats/:userId", async (req, res) => {
    try {
      const userId = req.params.userId;
      const totalResult = await db.execute(sql`
        SELECT 
          COALESCE(SUM(sl.duration_seconds), 0) as total_seconds,
          COUNT(sl.id) as total_plays
        FROM streaming_logs sl
        INNER JOIN music m ON sl.music_id = m.id
        WHERE m.user_id = ${userId}
      `);
      const perTrackResult = await db.execute(sql`
        SELECT 
          m.id as music_id,
          m.title,
          m.artist,
          m.image_filename as image,
          COALESCE(SUM(sl.duration_seconds), 0) as total_seconds,
          COUNT(sl.id) as play_count
        FROM music m
        LEFT JOIN streaming_logs sl ON sl.music_id = m.id
        WHERE m.user_id = ${userId}
        GROUP BY m.id, m.title, m.artist, m.image_filename
        ORDER BY total_seconds DESC
      `);
      const totalRow = totalResult.rows[0] as any;
      const tracks = (perTrackResult.rows as any[]).map(r => ({
        musicId: Number(r.music_id),
        title: r.title,
        artist: r.artist,
        image: r.image,
        totalSeconds: Number(r.total_seconds || 0),
        playCount: Number(r.play_count || 0),
      }));
      res.json({
        totalSeconds: Number(totalRow?.total_seconds || 0),
        totalPlays: Number(totalRow?.total_plays || 0),
        tracks,
      });
    } catch (error) {
      res.json({ totalSeconds: 0, totalPlays: 0, tracks: [] });
    }
  });

  app.get("/api/streaming-log/music/:musicId", async (req, res) => {
    try {
      const musicId = Number(req.params.musicId);
      const result = await db.execute(sql`
        SELECT 
          COALESCE(SUM(duration_seconds), 0) as total_duration,
          COUNT(id) as total_plays
        FROM streaming_logs
        WHERE music_id = ${musicId}
      `);
      const row = result.rows[0] as any;
      res.json({
        totalPlays: Number(row?.total_plays || 0),
        totalDuration: Number(row?.total_duration || 0),
      });
    } catch (error) {
      res.json({ totalPlays: 0, totalDuration: 0 });
    }
  });

  // === Artist Dashboard Stats ===
  app.get("/api/dashboard/my-music-stats", isAuthenticated, async (req, res) => {
    try {
      const userId = (req as any).user.claims.sub;
      const dailyPlays = await db.execute(sql`
        SELECT 
          DATE(sl.created_at) as date,
          COUNT(sl.id) as plays,
          COALESCE(SUM(sl.duration_seconds), 0) as duration
        FROM streaming_logs sl
        JOIN music m ON sl.music_id = m.id
        WHERE m.user_id = ${userId}
          AND sl.created_at >= NOW() - INTERVAL '30 days'
        GROUP BY DATE(sl.created_at)
        ORDER BY date ASC
      `);

      const hourlyPlays = await db.execute(sql`
        SELECT 
          EXTRACT(HOUR FROM sl.created_at) as hour,
          COUNT(sl.id) as plays
        FROM streaming_logs sl
        JOIN music m ON sl.music_id = m.id
        WHERE m.user_id = ${userId}
          AND sl.created_at >= NOW() - INTERVAL '30 days'
        GROUP BY EXTRACT(HOUR FROM sl.created_at)
        ORDER BY hour ASC
      `);

      const topTracks = await db.execute(sql`
        SELECT 
          m.id, m.title, m.artist, m.image_filename as "imageFilename",
          COUNT(sl.id) as plays,
          COALESCE(SUM(sl.duration_seconds), 0) as duration
        FROM streaming_logs sl
        JOIN music m ON sl.music_id = m.id
        WHERE m.user_id = ${userId}
        GROUP BY m.id, m.title, m.artist, m.image_filename
        ORDER BY plays DESC
        LIMIT 10
      `);

      const totals = await db.execute(sql`
        SELECT 
          COUNT(sl.id) as total_plays,
          COALESCE(SUM(sl.duration_seconds), 0) as total_duration,
          COUNT(DISTINCT sl.user_id) as unique_listeners
        FROM streaming_logs sl
        JOIN music m ON sl.music_id = m.id
        WHERE m.user_id = ${userId}
      `);

      const myMusicCount = await db.execute(sql`
        SELECT COUNT(id) as count FROM music WHERE user_id = ${userId}
      `);

      res.json({
        dailyPlays: dailyPlays.rows,
        hourlyPlays: hourlyPlays.rows,
        topTracks: topTracks.rows,
        totals: totals.rows[0] || { total_plays: 0, total_duration: 0, unique_listeners: 0 },
        musicCount: Number((myMusicCount.rows[0] as any)?.count || 0),
      });
    } catch (error: any) {
      res.status(500).json({ message: "통계 조회 실패: " + (error?.message || "") });
    }
  });

  // === Announcements (Artist -> Followers) ===
  app.post("/api/announcements", isAuthenticated, async (req, res) => {
    try {
      const userId = (req as any).user.claims.sub;
      const parsed = insertAnnouncementSchema.safeParse({ ...req.body, artistId: userId });
      if (!parsed.success) {
        return res.status(400).json({ message: "입력값이 올바르지 않습니다" });
      }

      const [announcement] = await db.insert(announcements).values(parsed.data).returning();

      const followerRows = await db.select({ followerId: follows.followerId })
        .from(follows)
        .where(eq(follows.followedId, userId));

      if (followerRows.length > 0) {
        const userData = await db.select({ username: users.username }).from(users).where(eq(users.id, userId));
        const artistName = userData[0]?.username || "아티스트";

        const notifValues = followerRows.map(f => ({
          userId: f.followerId,
          type: "announcement",
          message: `${artistName}님의 공지: ${parsed.data.title}`,
          url: `/announcements/${announcement.id}`,
          isRead: false,
        }));
        await db.insert(notifications).values(notifValues);
        for (const f of followerRows) {
          await storage.pruneNotificationsForUser(f.followerId, 20);
        }
      }

      res.json(announcement);
    } catch (error: any) {
      res.status(500).json({ message: "공지 등록 실패: " + (error?.message || "") });
    }
  });

  app.get("/api/announcements/my", isAuthenticated, async (req, res) => {
    try {
      const userId = (req as any).user.claims.sub;
      const result = await db.select().from(announcements)
        .where(eq(announcements.artistId, userId))
        .orderBy(desc(announcements.createdAt));
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ message: "공지 조회 실패" });
    }
  });

  app.get("/api/announcements/artist/:artistId", async (req, res) => {
    try {
      const artistId = req.params.artistId;
      const result = await db.select().from(announcements)
        .where(eq(announcements.artistId, artistId))
        .orderBy(desc(announcements.createdAt))
        .limit(20);
      res.json(result);
    } catch (error: any) {
      res.json([]);
    }
  });

  app.delete("/api/announcements/:id", isAuthenticated, async (req, res) => {
    try {
      const userId = (req as any).user.claims.sub;
      const announcementId = Number(req.params.id);
      const [existing] = await db.select().from(announcements).where(eq(announcements.id, announcementId));
      if (!existing || existing.artistId !== userId) {
        return res.status(403).json({ message: "권한이 없습니다" });
      }
      await db.delete(announcements).where(eq(announcements.id, announcementId));
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ message: "공지 삭제 실패" });
    }
  });

  // === Direct Messages Routes ===
  app.get("/api/conversations", isAuthenticated, async (req, res) => {
    try {
      // @ts-ignore
      const userId = req.user.claims.sub;
      const convos = await storage.getConversationsByUser(userId);
      const serialized = convos.map((c: any) => ({ ...c, last_msg_time: toUTCISO(c.last_msg_time) }));
      res.json(serialized);
    } catch (error: any) {
      console.error("Conversations list error:", error?.message ?? error);
      res.status(500).json({ message: "대화 목록 조회 실패" });
    }
  });

  app.post("/api/conversations", isAuthenticated, async (req, res) => {
    try {
      // @ts-ignore
      const userId = req.user.claims.sub;
      const { otherUserId } = req.body;
      if (!otherUserId || otherUserId === userId) {
        return res.status(400).json({ message: "유효하지 않은 사용자입니다" });
      }
      const conv = await storage.getOrCreateConversation(userId, otherUserId);
      res.json(conv);
    } catch (error: any) {
      if (error?.code === "MESSAGES_NOT_ACCEPTED") {
        return res.status(403).json({ message: "해당 사용자는 새 메시지를 받지 않도록 설정했습니다." });
      }
      if (error?.code === "BLOCKED") {
        return res.status(403).json({ message: "메시지를 보낼 수 없습니다." });
      }
      res.status(500).json({ message: "대화 생성 실패" });
    }
  });

  app.get("/api/users/me/message-settings", isAuthenticated, async (req, res) => {
    try {
      // @ts-ignore
      const userId = req.user.claims.sub;
      const u = await storage.getUserById(userId);
      const allow = u?.allowDirectMessages ?? u?.allow_direct_messages ?? true;
      res.json({ allowDirectMessages: !!allow });
    } catch (e: any) {
      res.status(500).json({ message: e?.message || "조회 실패" });
    }
  });

  app.patch("/api/users/me/message-settings", isAuthenticated, async (req, res) => {
    try {
      // @ts-ignore
      const userId = req.user.claims.sub;
      const { allowDirectMessages } = req.body;
      if (typeof allowDirectMessages !== "boolean") {
        return res.status(400).json({ message: "allowDirectMessages는 true/false여야 합니다." });
      }
      await storage.updateUserProfile(userId, { allowDirectMessages });
      res.json({ allowDirectMessages });
    } catch (e: any) {
      res.status(500).json({ message: e?.message || "설정 저장 실패" });
    }
  });

  app.get("/api/blocked-users", isAuthenticated, async (req, res) => {
    try {
      // @ts-ignore
      const userId = req.user.claims.sub;
      const ids = await storage.getBlockedUserIds(userId);
      const users = await Promise.all(ids.map((id) => storage.getUserById(id)));
      res.json(users.filter(Boolean).map((u: any) => ({ id: u.id, firstName: u.firstName, lastName: u.lastName, profileImageUrl: u.profileImageUrl })));
    } catch (e: any) {
      res.status(500).json({ message: e?.message || "조회 실패" });
    }
  });

  app.post("/api/block/:userId", isAuthenticated, async (req, res) => {
    try {
      // @ts-ignore
      const blockerId = req.user.claims.sub;
      const blockedId = String(req.params.userId ?? "");
      if (!blockedId || blockedId === blockerId) {
        return res.status(400).json({ message: "유효하지 않은 사용자입니다." });
      }
      await storage.blockUser(blockerId, blockedId);
      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ message: e?.message || "차단 실패" });
    }
  });

  app.delete("/api/block/:userId", isAuthenticated, async (req, res) => {
    try {
      // @ts-ignore
      const blockerId = req.user.claims.sub;
      const blockedId = String(req.params.userId ?? "");
      if (!blockedId) return res.status(400).json({ message: "유효하지 않은 사용자입니다." });
      await storage.unblockUser(blockerId, blockedId);
      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ message: e?.message || "차단 해제 실패" });
    }
  });

  app.post("/api/report-user", isAuthenticated, async (req, res) => {
    try {
      // @ts-ignore
      const reporterId = req.user.claims.sub;
      const { reportedUserId, reason, messageId, conversationId } = req.body;
      if (!reportedUserId || !reason || !reason.trim()) {
        return res.status(400).json({ message: "신고 대상과 사유를 입력해주세요." });
      }
      await storage.createUserReport({ reporterId, reportedUserId, reason: reason.trim(), messageId, conversationId });
      const adminRows = await db.select({ id: users.id }).from(users).where(eq(users.role, "admin"));
      for (const admin of adminRows) {
        await storage.createNotification({
          userId: admin.id,
          type: "system",
          message: "새 회원 신고가 접수되었습니다.",
          payload: { reportedUserId },
          url: getAdminPagePath(),
        });
      }
      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ message: e?.message || "신고 접수 실패" });
    }
  });

  app.get("/api/conversations/:id/messages", isAuthenticated, async (req, res) => {
    try {
      // @ts-ignore
      const userId = req.user.claims.sub;
      const conversationId = parseInt(req.params.id as string);
      const isParticipant = await storage.isConversationParticipant(conversationId, userId);
      if (!isParticipant) {
        return res.status(403).json({ message: "접근 권한이 없습니다" });
      }
      const before = req.query.before ? parseInt(req.query.before as string) : undefined;
      const messages = await storage.getMessages(conversationId, 50, before);
      await storage.markMessagesRead(conversationId, userId);
      const serialized = messages.map((m: any) => {
        const created_at = toUTCISO(m.created_at ?? m.createdAt);
        return {
          ...m,
          created_at,
          content: m.content ?? m.body ?? "",
          sender_id: m.sender_id ?? m.senderId,
          sender_first_name: m.sender_first_name,
          sender_last_name: m.sender_last_name,
          sender_image: m.sender_image,
        };
      });
      res.json(serialized);
    } catch (error: any) {
      res.status(500).json({ message: "메시지 조회 실패" });
    }
  });

  app.post("/api/conversations/:id/messages", isAuthenticated, async (req, res) => {
    try {
      // @ts-ignore
      const userId = req.user.claims.sub;
      const conversationId = parseInt(req.params.id as string);
      const isParticipant = await storage.isConversationParticipant(conversationId, userId);
      if (!isParticipant) {
        return res.status(403).json({ message: "접근 권한이 없습니다" });
      }
      const { content } = req.body;
      if (!content || !content.trim()) {
        return res.status(400).json({ message: "메시지 내용을 입력해주세요" });
      }
      const msg = await storage.createMessage(conversationId, userId, content.trim());

      const convos = await storage.getConversationsByUser(userId);
      const thisConvo = convos.find((c: any) => c.id === conversationId);
      if (thisConvo) {
        const otherUserId = thisConvo.other_user_id ?? thisConvo.otherUserId;
        const sender = await storage.getUserById(userId);
        const at = (msg as any).createdAt ?? (msg as any).created_at;
        sendToUser(otherUserId, {
          type: "new_message",
          conversationId,
          message: {
            ...msg,
            created_at: toUTCISO(at),
            sender_first_name: sender?.firstName || "",
            sender_last_name: sender?.lastName || "",
            sender_image: sender?.profileImageUrl || null,
          },
        });
        const senderLabel = `${sender?.firstName || ""} ${sender?.lastName || ""}`.trim() || "사용자";
        queueActivityEmail(otherUserId, "dm", {
          actorName: senderLabel,
          snippet: content.trim(),
          actionPath: "/messages",
        });
      }

      const at = (msg as any).createdAt ?? (msg as any).created_at;
      res.json({ ...msg, created_at: toUTCISO(at) });
    } catch (error: any) {
      console.error("Message send error:", error?.message ?? error);
      res.status(500).json({ message: "메시지 전송 실패" });
    }
  });

  app.get("/api/messages/unread-count", isAuthenticated, async (req, res) => {
    try {
      // @ts-ignore
      const userId = req.user.claims.sub;
      const count = await storage.getUnreadMessageCount(userId);
      res.json({ count });
    } catch (error: any) {
      res.status(500).json({ message: "읽지 않은 메시지 수 조회 실패" });
    }
  });

  app.post("/api/conversations/:id/read", isAuthenticated, async (req, res) => {
    try {
      // @ts-ignore
      const userId = req.user.claims.sub;
      const conversationId = parseInt(req.params.id as string);
      const isParticipant = await storage.isConversationParticipant(conversationId, userId);
      if (!isParticipant) {
        return res.status(403).json({ message: "접근 권한이 없습니다" });
      }
      await storage.markMessagesRead(conversationId, userId);
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ message: "읽음 처리 실패" });
    }
  });

  // === Database Backup (Admin only) ===
  app.get("/api/admin/code-download", isAuthenticated, isAdmin, (req, res) => {
    try {
      const projectRoot = process.cwd();
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
      const filename = `베니사운드_소스코드_${timestamp}.zip`;

      const EXCLUDE = new Set(["node_modules", ".git", "local-uploads", "dist", ".next"]);

      res.setHeader("Content-Type", "application/zip");
      res.setHeader("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`);

      const archive = archiver("zip", { zlib: { level: 6 } });

      archive.on("error", (err: any) => {
        console.error("Archive error:", err);
        if (!res.headersSent) res.status(500).end();
      });

      archive.pipe(res);

      // 최상위 항목만 순회하여 제외 폴더 건너뜀
      const entries = readdirSync(projectRoot);
      for (const entry of entries) {
        if (EXCLUDE.has(entry)) continue;
        const fullPath = path.join(projectRoot, entry);
        const stat = lstatSync(fullPath);
        if (stat.isDirectory()) {
          archive.directory(fullPath, entry);
        } else {
          archive.file(fullPath, { name: entry });
        }
      }

      archive.finalize();
    } catch (error: any) {
      console.error("Code download error:", error);
      if (!res.headersSent) {
        res.status(500).json({ message: "코드 다운로드 실패: " + (error?.message || "알 수 없는 오류") });
      }
    }
  });

  app.get("/api/admin/uploads-download", isAuthenticated, isAdmin, (req, res) => {
    try {
      const uploadsRoot = path.resolve(process.cwd(), "local-uploads");
      if (!existsSync(uploadsRoot)) {
        return res.status(404).json({ message: "local-uploads 폴더가 없습니다" });
      }

      const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
      const filename = `베니사운드_음원파일_${timestamp}.zip`;

      res.setHeader("Content-Type", "application/zip");
      res.setHeader("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`);

      const archive = archiver("zip", { zlib: { level: 6 } });

      archive.on("error", (err: any) => {
        console.error("Uploads archive error:", err);
        if (!res.headersSent) res.status(500).end();
      });

      archive.pipe(res);
      archive.directory(uploadsRoot, "local-uploads");
      archive.finalize();
    } catch (error: any) {
      console.error("Uploads download error:", error);
      if (!res.headersSent) {
        res.status(500).json({ message: "음원 다운로드 실패: " + (error?.message || "알 수 없는 오류") });
      }
    }
  });

  // 서버가 직접 지정 경로(E: 또는 .env BACKUP_LOCAL_DIR)에 저장 (Windows 로컬 PC 전용 — VPS에서는 실행 불가)
  app.post("/api/admin/save-to-local", isAuthenticated, isAdmin, async (req, res) => {
    if (process.platform !== "win32") {
      return res.status(400).json({
        message: "전체 백업 저장(E드라이브)은 Windows 로컬 PC에서만 사용할 수 있습니다. 서버(VPS)에서는 실행되지 않습니다.",
        results: [],
      });
    }
    const results: { type: string; file: string; success: boolean; error?: string }[] = [];
    try {
      const preferredDir = process.env.BACKUP_LOCAL_DIR || "E:\\뉴베니사운드백업폴더";
      let LOCAL_BACKUP_DIR: string;
      try {
        mkdirSync(preferredDir, { recursive: true });
        LOCAL_BACKUP_DIR = preferredDir;
      } catch (e: any) {
        const fallback = path.join(process.cwd(), "backups", "local");
        mkdirSync(fallback, { recursive: true });
        LOCAL_BACKUP_DIR = fallback;
        console.warn("[admin save-to-local] Preferred dir failed, using fallback:", preferredDir, e?.message);
      }
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);

    // 1. DB 백업
    try {
      const dbUrl = process.env.DATABASE_URL;
      if (!dbUrl) throw new Error("DATABASE_URL 없음");
      const pgDumpCandidates = [
        "pg_dump",
        "C:\\Program Files\\PostgreSQL\\18\\bin\\pg_dump.exe",
        "C:\\Program Files\\PostgreSQL\\17\\bin\\pg_dump.exe",
        "C:\\Program Files\\PostgreSQL\\16\\bin\\pg_dump.exe",
        "C:\\Program Files\\PostgreSQL\\15\\bin\\pg_dump.exe",
      ];
      const pgDumpPath = pgDumpCandidates.find((p) => {
        try { execSync(`"${p}" --version`, { stdio: "pipe" }); return true; } catch { return false; }
      });
      if (!pgDumpPath) throw new Error("pg_dump을 찾을 수 없음");
      const dump = execSync(`"${pgDumpPath}" "${dbUrl}" --no-owner --no-acl`, {
        maxBuffer: 50 * 1024 * 1024,
        encoding: "utf-8",
      });
      const dbFile = path.join(LOCAL_BACKUP_DIR, `베니사운드_DB백업_${timestamp}.sql`);
      writeFileSync(dbFile, dump, "utf-8");
      results.push({ type: "DB", file: dbFile, success: true });
    } catch (e: any) {
      results.push({ type: "DB", file: "", success: false, error: e?.message });
    }

    // 2. 소스코드 ZIP
    try {
      const projectRoot = process.cwd();
      const EXCLUDE = new Set(["node_modules", ".git", "local-uploads", "dist", ".next", ".env"]);
      const codeFile = path.join(LOCAL_BACKUP_DIR, `베니사운드_소스코드_${timestamp}.zip`);

      await new Promise<void>((resolve, reject) => {
        const output = createWriteStream(codeFile);
        const archive = archiver("zip", { zlib: { level: 6 } });
        archive.on("error", reject);
        output.on("close", resolve);
        archive.pipe(output);
        const entries = readdirSync(projectRoot);
        for (const entry of entries) {
          if (EXCLUDE.has(entry)) continue;
          const fullPath = path.join(projectRoot, entry);
          const stat = lstatSync(fullPath);
          if (stat.isDirectory()) archive.directory(fullPath, entry);
          else archive.file(fullPath, { name: entry });
        }
        archive.finalize();
      });
      results.push({ type: "소스코드", file: codeFile, success: true });
    } catch (e: any) {
      results.push({ type: "소스코드", file: "", success: false, error: e?.message });
    }

    // 3. 음원파일 ZIP
    try {
      const uploadsRoot = path.resolve(process.cwd(), "local-uploads");
      if (!existsSync(uploadsRoot)) throw new Error("local-uploads 폴더 없음");
      const uploadsFile = path.join(LOCAL_BACKUP_DIR, `베니사운드_음원파일_${timestamp}.zip`);

      await new Promise<void>((resolve, reject) => {
        const output = createWriteStream(uploadsFile);
        const archive = archiver("zip", { zlib: { level: 6 } });
        archive.on("error", reject);
        output.on("close", resolve);
        archive.pipe(output);
        archive.directory(uploadsRoot, "음원파일");
        archive.finalize();
      });
      results.push({ type: "음원파일", file: uploadsFile, success: true });
    } catch (e: any) {
      results.push({ type: "음원파일", file: "", success: false, error: e?.message });
    }

      res.json({ dir: LOCAL_BACKUP_DIR, results });
    } catch (err: any) {
      console.error("[admin save-to-local]", err);
      res.status(500).json({ message: err?.message || "백업 저장 실패", results: [] });
    }
  });

  app.post("/api/admin/server-backup", isAuthenticated, isAdmin, async (_req, res) => {
    try {
      if (process.platform === "win32") {
        return res.status(400).json({ message: "이 백업 기능은 서버(VPS)에서만 사용할 수 있습니다." });
      }

      const projectRoot = process.cwd();
      const serverRoot = path.resolve(projectRoot, "..");
      const uploadsRoot = path.resolve(projectRoot, "local-uploads");
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);

      const dbFilename = `베니사운드_DB백업_${timestamp}.sql`;
      const codeFilename = `베니사운드_소스코드_${timestamp}.zip`;
      const uploadsFilename = `베니사운드_음원파일_${timestamp}.zip`;

      const dbPath = path.join(serverRoot, dbFilename);
      const codePath = path.join(serverRoot, codeFilename);
      const uploadsPath = path.join(serverRoot, uploadsFilename);

      // 1) DB 덤프 생성 (pg_dump는 리눅스 서버에 설치되어 있다고 가정)
      try {
        execSync(`sudo -u postgres pg_dump venysounddb > "${dbPath}"`, {
          maxBuffer: 50 * 1024 * 1024,
          stdio: "ignore",
          shell: "/bin/bash",
        });
      } catch (err: any) {
        console.error("Server backup - DB dump error:", err?.message || err);
        return res.status(500).json({ message: "DB 백업 생성에 실패했습니다. 서버의 pg_dump 설치를 확인해주세요." });
      }

      // 2) 소스코드 ZIP 생성
      const EXCLUDE = new Set(["node_modules", ".git", "local-uploads", "dist", ".next", ".env"]);
      try {
        await new Promise<void>((resolve, reject) => {
          const output = createWriteStream(codePath);
          const archive = archiver("zip", { zlib: { level: 6 } });
          archive.on("error", reject);
          output.on("close", resolve);
          archive.pipe(output);

          const entries = readdirSync(projectRoot);
          for (const entry of entries) {
            if (EXCLUDE.has(entry)) continue;
            const fullPath = path.join(projectRoot, entry);
            const stat = lstatSync(fullPath);
            if (stat.isDirectory()) {
              archive.directory(fullPath, entry);
            } else {
              archive.file(fullPath, { name: entry });
            }
          }

          archive.finalize();
        });
      } catch (err: any) {
        console.error("Server backup - code zip error:", err?.message || err);
        return res.status(500).json({ message: "소스코드 압축 생성에 실패했습니다." });
      }

      // 3) 음원/업로드 ZIP 생성
      try {
        if (!existsSync(uploadsRoot)) {
          console.warn("Server backup - uploads directory not found:", uploadsRoot);
        } else {
          await new Promise<void>((resolve, reject) => {
            const output = createWriteStream(uploadsPath);
            const archive = archiver("zip", { zlib: { level: 6 } });
            archive.on("error", reject);
            output.on("close", resolve);
            archive.pipe(output);
            archive.directory(uploadsRoot, "local-uploads");
            archive.finalize();
          });
        }
      } catch (err: any) {
        console.error("Server backup - uploads zip error:", err?.message || err);
        return res.status(500).json({ message: "음원/업로드 파일 압축 생성에 실패했습니다." });
      }

      res.json({
        message: "원격 서버에 백업 파일이 생성되었습니다.",
        files: {
          db: dbPath,
          code: codePath,
          uploads: uploadsPath,
        },
      });
    } catch (error: any) {
      console.error("Server backup unexpected error:", error?.message || error);
      res.status(500).json({ message: "백업 생성 실패: " + (error?.message || "알 수 없는 오류") });
    }
  });

  return httpServer;
}
