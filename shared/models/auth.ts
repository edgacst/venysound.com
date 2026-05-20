import { sql } from "drizzle-orm";
import { boolean, index, integer, jsonb, pgTable, primaryKey, serial, text, timestamp, uniqueIndex, varchar } from "drizzle-orm/pg-core";
import type { AiWalletChunk } from "../subscription-ai-wallet";

// Session storage table (express-session + connect-pg-simple).
export const sessions = pgTable(
  "sessions",
  {
    sid: varchar("sid").primaryKey(),
    sess: jsonb("sess").notNull(),
    expire: timestamp("expire").notNull(),
  },
  (table) => [index("IDX_session_expire").on(table.expire)]
);

// User storage table.
export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  email: varchar("email").unique(),
  username: varchar("username").unique(),
  passwordHash: varchar("password_hash"),
  firstName: varchar("first_name"),
  lastName: varchar("last_name"),
  profileImageUrl: varchar("profile_image_url"),
  role: varchar("role").default("user"),
  tossBillingKey: varchar("toss_billing_key"),
  tossCustomerKey: varchar("toss_customer_key"),
  subscriptionTier: varchar("subscription_tier").default("free"),
  subscriptionPlan: varchar("subscription_plan"),
  subscriptionExpiresAt: timestamp("subscription_expires_at"),
  /** tier → 구독 만료 ISO 시각. 복수 플랜 동시 유효 시 월 AI 크레딧 등 합산에 사용 */
  subscriptionEntitlements: jsonb("subscription_entitlements")
    .$type<Record<string, string>>()
    .default(sql`'{}'::jsonb`),
  /** 지갑 잔액(원, 정수). DB 컬럼명은 레거시로 credits 유지 */
  credits: integer("credits").default(0),
  /** 5월 이벤트 등: AI 음악 생성에만 사용, 출금·일반 지갑 환불 대상 아님. 만료 시 소멸 */
  promoAiCreditsWon: integer("promo_ai_credits_won").default(0).notNull(),
  promoAiCreditsExpiresAt: timestamp("promo_ai_credits_expires_at", { withTimezone: true }),
  balance: integer("balance").default(0),
  donationBadge: varchar("donation_badge"), // 'seed' | 'sprout' | 'supporter' | 'sponsor'
  registerSource: varchar("register_source"), // 'email' | 'google' | 'naver' | 'kakao' | 'facebook' | 'tiktok'
  allowDirectMessages: boolean("allow_direct_messages").default(true), // false면 새 대화 요청 거절
  notifyNewMusicEmail: boolean("notify_new_music_email").default(true),
  notifyNewMusicPush: boolean("notify_new_music_push").default(true),
  /** 댓글·팔로우·쪽지·좋아요 등 활동 알림 이메일 (SMTP 설정 시) */
  notifyActivityEmail: boolean("notify_activity_email").default(true),
  /** 유료 구독 AI 예산: [{ won, creditedAt }] — 이월·12개월 만료·기간말 월 충전 */
  subscriptionAiWallet: jsonb("subscription_ai_wallet")
    .$type<AiWalletChunk[]>()
    .default(sql`'[]'::jsonb`),
  subscriptionAiPeriodKey: varchar("subscription_ai_period_key"),
  subscriptionAiPeriodConsumedWon: integer("subscription_ai_period_consumed_won").default(0),
  /** 기간별 마커 — 해당 값이면 이미 AI 예산 소진 알림·즉시 무료 전환 처리됨 */
  subscriptionAiBudgetExhaustionNoticeKey: varchar("subscription_ai_budget_exhaustion_notice_key"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export type UpsertUser = typeof users.$inferInsert;
export type User = typeof users.$inferSelect;

export const subscriptionPlans = pgTable("subscription_plans", {
  id: varchar("id").primaryKey(),
  name: varchar("name").notNull(),
  description: varchar("description"),
  monthlyPrice: integer("monthly_price").notNull(),
  yearlyPrice: integer("yearly_price").notNull(),
  features: jsonb("features"),
  createdAt: timestamp("created_at").defaultNow(),
});

export type SubscriptionPlan = typeof subscriptionPlans.$inferSelect;

export const payments = pgTable("payments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  orderId: varchar("order_id").notNull().unique(),
  paymentKey: varchar("payment_key"),
  amount: integer("amount").notNull(),
  status: varchar("status").default("pending"),
  plan: varchar("plan"),
  billingPeriod: varchar("billing_period"),
  /** 페이업 인증결제: payUrl·완료 메타 등 (구독 카드만 사용) */
  payupMeta: jsonb("payup_meta").$type<Record<string, unknown> | null>(),
  createdAt: timestamp("created_at").defaultNow(),
});

/** Free 플랜 월별 AI 음악 생성 횟수 (제한: 2곡/월) */
export const aiMusicUsage = pgTable(
  "ai_music_usage",
  {
    userId: varchar("user_id").notNull(),
    periodMonth: varchar("period_month").notNull(), // 'YYYY-MM'
    count: integer("count").default(0).notNull(),
    updatedAt: timestamp("updated_at").defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.periodMonth] })]
);

/** AI 음악 생성 1회 요청 단위 로그 (관리자 조회용). billing_kind: free | credits | admin */
export const aiMusicGenerationLogs = pgTable(
  "ai_music_generation_logs",
  {
    id: serial("id").primaryKey(),
    userId: varchar("user_id", { length: 128 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    billingKind: varchar("billing_kind", { length: 32 }).notNull(),
    subscriptionTierAt: varchar("subscription_tier_at", { length: 32 }),
    provider: varchar("provider", { length: 32 }).notNull(),
    taskId: varchar("task_id", { length: 128 }),
    requestTitle: varchar("request_title", { length: 512 }),
    requestSummary: text("request_summary"),
    creditsCharged: integer("credits_charged").default(0).notNull(),
    /** pending: 생성 요청만 기록(미과금) · charged: 성공 확정 후 과금 완료 · failed: 실패·미과금(또는 과금 오류) */
    chargeStatus: varchar("charge_status", { length: 32 }).notNull().default("charged"),
    failureMessage: text("failure_message"),
    /** 사이트 공개 등 배포 이력: [{ musicId, clipId?, deployment, publishedAt }] */
    publishments: jsonb("publishments")
      .$type<{ musicId: number; clipId?: string | null; deployment: string; publishedAt: string }[]>()
      .default([]),
  },
  (table) => [
    index("idx_ai_music_gen_logs_user").on(table.userId),
    index("idx_ai_music_gen_logs_task").on(table.taskId),
    index("idx_ai_music_gen_logs_created").on(table.createdAt),
  ]
);

/** AI 음악 생성 페이지「내 라이브러리」(기기 간 동기화 — 기존 localStorage 보완) */
/** KIE Suno Generate Voice — 회원당 등록 보이스 1개(voiceId) */
export const aiMusicUserVoices = pgTable("ai_music_user_voices", {
  userId: varchar("user_id", { length: 128 }).primaryKey(),
  voiceId: varchar("voice_id", { length: 128 }),
  voiceName: varchar("voice_name", { length: 120 }),
  style: text("style"),
  description: text("description"),
  singerSkillLevel: varchar("singer_skill_level", { length: 32 }).default("beginner"),
  validateTaskId: varchar("validate_task_id", { length: 128 }),
  status: varchar("status", { length: 32 }).default("none").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const aiMusicSavedTracks = pgTable(
  "ai_music_saved_tracks",
  {
    id: serial("id").primaryKey(),
    userId: varchar("user_id", { length: 128 }).notNull(),
    clientId: varchar("client_id", { length: 220 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    clipId: text("clip_id"),
    audioUrl: text("audio_url"),
    imageUrl: text("image_url"),
    title: text("title"),
    tags: text("tags"),
    prompt: text("prompt"),
    originalPrompt: text("original_prompt"),
    customMode: boolean("custom_mode").default(false).notNull(),
    generationTaskId: varchar("generation_task_id", { length: 128 }),
    generationProvider: varchar("generation_provider", { length: 32 }),
    uploadCount: integer("upload_count").default(0).notNull(),
    downloadCount: integer("download_count").default(0).notNull(),
    publishedToSite: boolean("published_to_site").default(false).notNull(),
  },
  (table) => [
    uniqueIndex("ai_music_saved_tracks_user_client").on(table.userId, table.clientId),
    index("idx_ai_music_saved_user_created").on(table.userId, table.createdAt),
  ]
);
