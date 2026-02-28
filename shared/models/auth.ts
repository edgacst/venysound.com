import { sql } from "drizzle-orm";
import { boolean, index, integer, jsonb, pgTable, timestamp, varchar } from "drizzle-orm/pg-core";

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
  credits: integer("credits").default(0),
  balance: integer("balance").default(0),
  donationBadge: varchar("donation_badge"), // 'seed' | 'sprout' | 'supporter' | 'sponsor'
  registerSource: varchar("register_source"), // 'email' | 'google' | 'naver' | 'kakao' | 'facebook' | 'tiktok'
  allowDirectMessages: boolean("allow_direct_messages").default(true), // false면 새 대화 요청 거절
  notifyNewMusicEmail: boolean("notify_new_music_email").default(true),
  notifyNewMusicPush: boolean("notify_new_music_push").default(true),
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
  createdAt: timestamp("created_at").defaultNow(),
});
