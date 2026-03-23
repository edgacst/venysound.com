import { pgTable, text, serial, integer, boolean, timestamp, primaryKey, jsonb, uniqueIndex } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { users } from "./models/auth";

// Export users table for use in other parts of the app
export { users } from "./models/auth";

// === TABLE DEFINITIONS ===

// Music table
export const music = pgTable("music", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  artist: text("artist").notNull(),
  filename: text("filename").notNull(),
  imageFilename: text("image_filename"),
  genre: text("genre"),
  tags: text("tags"),
  lyrics: text("lyrics"),
  isAi: boolean("is_ai").default(false),
  aiProvider: text("ai_provider"), // 'suno' 등 AI 제공사
  price: integer("price").default(0),
  isDownloadable: boolean("is_downloadable").default(false),
  userId: text("user_id").references(() => users.id).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

// Likes table (Many-to-Many: User <-> Music)
export const likes = pgTable("likes", {
  userId: text("user_id").references(() => users.id).notNull(),
  musicId: integer("music_id").references(() => music.id).notNull(),
}, (t) => [
  primaryKey({ columns: [t.userId, t.musicId] }),
]);

// Follows table (Many-to-Many: User <-> User)
export const follows = pgTable("follows", {
  followerId: text("follower_id").references(() => users.id).notNull(),
  followedId: text("followed_id").references(() => users.id).notNull(),
}, (t) => [
  primaryKey({ columns: [t.followerId, t.followedId] }),
]);

// Reviews table
export const reviews = pgTable("reviews", {
  id: serial("id").primaryKey(),
  content: text("content").notNull(),
  userId: text("user_id").references(() => users.id).notNull(),
  musicId: integer("music_id").references(() => music.id).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

// Playlists table
export const playlists = pgTable("playlists", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  userId: text("user_id").references(() => users.id).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

// Playlist-Music table (Many-to-Many: Playlist <-> Music)
export const playlistMusic = pgTable("playlist_music", {
  playlistId: integer("playlist_id").references(() => playlists.id).notNull(),
  musicId: integer("music_id").references(() => music.id).notNull(),
}, (t) => [
  primaryKey({ columns: [t.playlistId, t.musicId] }),
]);

// 테마/무드 플레이리스트 (사이트 기획, 관리자 편집)
export const curatedPlaylists = pgTable("curated_playlists", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  slug: text("slug").notNull(),
  sortOrder: integer("sort_order").default(0).notNull(),
  coverImageFilename: text("cover_image_filename"),
  genreMain: text("genre_main"),
  genreSub: text("genre_sub"),
  createdAt: timestamp("created_at").defaultNow(),
}, (t) => [uniqueIndex("curated_playlists_slug_unique").on(t.slug)]);

export const curatedPlaylistMusic = pgTable("curated_playlist_music", {
  id: serial("id").primaryKey(),
  curatedPlaylistId: integer("curated_playlist_id").references(() => curatedPlaylists.id, { onDelete: "cascade" }).notNull(),
  musicId: integer("music_id").references(() => music.id, { onDelete: "cascade" }).notNull(),
  sortOrder: integer("sort_order").default(0).notNull(),
});

// 베니방송국 채널
export const radioChannels = pgTable("radio_channels", {
  id: serial("id").primaryKey(),
  ownerId: text("owner_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  name: text("name").notNull(),
  slug: text("slug").notNull(),
  description: text("description"),
  coverFilename: text("cover_filename"),
  visibility: text("visibility").default("public").notNull(), // public | link_only | private
  inviteToken: text("invite_token"),
  status: text("status").default("draft").notNull(), // draft | live | paused | ended
  notice: text("notice"),
  nowPlayingMusicId: integer("now_playing_music_id").references(() => music.id, { onDelete: "set null" }),
  nowPlayingStartedAt: timestamp("now_playing_started_at"),
  nowPlayingObjectPath: text("now_playing_object_path"), // 로컬 파일 송출 시에만 사용. 음원 미등록, 임시 스트림
  nowPlayingTempDurationSeconds: integer("now_playing_temp_duration_seconds"),
  nowPlayingTempNextSnapshotIndex: integer("now_playing_temp_next_snapshot_index"),
  currentHostId: text("current_host_id").references(() => users.id, { onDelete: "set null" }),
  scheduledStartAt: timestamp("scheduled_start_at"),
  scheduledEndAt: timestamp("scheduled_end_at"),
  playlistSnapshot: jsonb("playlist_snapshot"), // { musicIds: number[], durationsSeconds: number[], currentIndex: number } — DJ 브라우저 종료 후 서버 자동 진행용
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (t) => [uniqueIndex("radio_channels_slug_unique").on(t.slug), uniqueIndex("radio_channels_owner_id").on(t.ownerId)]);

// 베니방송국 채널 채팅
export const radioChatMessages = pgTable("radio_chat_messages", {
  id: serial("id").primaryKey(),
  channelId: integer("channel_id").references(() => radioChannels.id, { onDelete: "cascade" }).notNull(),
  userId: text("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  content: text("content").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

// 베니방송국 신청곡
export const radioSongRequests = pgTable("radio_song_requests", {
  id: serial("id").primaryKey(),
  channelId: integer("channel_id").references(() => radioChannels.id, { onDelete: "cascade" }).notNull(),
  userId: text("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  musicId: integer("music_id").references(() => music.id, { onDelete: "set null" }),
  title: text("title"),
  artist: text("artist"),
  message: text("message"),
  status: text("status").default("pending").notNull(), // pending | playing | played | cancelled
  sortOrder: integer("sort_order").default(0).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

// 베니방송국 채널 스텝(부방장 등)
export const radioChannelStaff = pgTable("radio_channel_staff", {
  id: serial("id").primaryKey(),
  channelId: integer("channel_id").references(() => radioChannels.id, { onDelete: "cascade" }).notNull(),
  userId: text("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  role: text("role").default("staff").notNull(), // sub_host | staff
  createdAt: timestamp("created_at").defaultNow(),
}, (t) => [uniqueIndex("radio_channel_staff_channel_user").on(t.channelId, t.userId)]);

// Community Posts table
export const posts = pgTable("posts", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  content: text("content").notNull(),
  userId: text("user_id").references(() => users.id).notNull(),
  category: text("category"),
  attachment: text("attachment"), // Path in object storage
  viewCount: integer("view_count").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow(),
});

// Post Comments table
export const postComments = pgTable("post_comments", {
  id: serial("id").primaryKey(),
  content: text("content").notNull(),
  userId: text("user_id").references(() => users.id).notNull(),
  postId: integer("post_id").references(() => posts.id).notNull(),
  parentId: integer("parent_id"),
  createdAt: timestamp("created_at").defaultNow(),
});

// Web Push subscriptions (for "new music for you" push notifications)
export const pushSubscriptions = pgTable("push_subscriptions", {
  id: serial("id").primaryKey(),
  userId: text("user_id").references(() => users.id).notNull(),
  endpoint: text("endpoint").notNull(),
  p256dh: text("p256dh").notNull(),
  auth: text("auth").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
}, (t) => [uniqueIndex("push_subscriptions_endpoint_unique").on(t.endpoint)]);

// Notifications table
export const notifications = pgTable("notifications", {
  id: serial("id").primaryKey(),
  userId: text("user_id").references(() => users.id).notNull(),
  type: text("type").notNull(), // 'like', 'comment', 'follow', 'tip', 'badge', 'system'
  message: text("message").notNull(),
  payload: jsonb("payload").$type<Record<string, unknown>>(), // 번역용 파라미터 (nullable, fromName, musicTitle 등)
  url: text("url"),
  isRead: boolean("is_read").default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

// Copyright Reports table
export const copyrightReports = pgTable("copyright_reports", {
  id: serial("id").primaryKey(),
  musicId: integer("music_id").references(() => music.id).notNull(),
  reporterId: text("reporter_id").references(() => users.id).notNull(),
  reason: text("reason").notNull(),
  originalArtist: text("original_artist"),
  originalTitle: text("original_title"),
  details: text("details"),
  status: text("status").default("pending").notNull(),
  adminNote: text("admin_note"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Tips table (listener -> artist donations)
export const tips = pgTable("tips", {
  id: serial("id").primaryKey(),
  fromUserId: text("from_user_id").references(() => users.id).notNull(),
  toUserId: text("to_user_id").references(() => users.id).notNull(),
  musicId: integer("music_id").references(() => music.id),
  amount: integer("amount").notNull(),
  message: text("message"),
  createdAt: timestamp("created_at").defaultNow(),
});

// Purchases table (paid downloads)
export const purchases = pgTable("purchases", {
  id: serial("id").primaryKey(),
  buyerId: text("buyer_id").references(() => users.id).notNull(),
  musicId: integer("music_id").references(() => music.id).notNull(),
  sellerId: text("seller_id").references(() => users.id).notNull(),
  amount: integer("amount").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

// Analytics visits (일일/누적 방문자, 페이지뷰, 광고용 지역·디바이스 집계)
export const analyticsVisits = pgTable("analytics_visits", {
  id: serial("id").primaryKey(),
  visitedAt: timestamp("visited_at").defaultNow().notNull(),
  visitorKey: text("visitor_key").notNull(),
  path: text("path").notNull(),
  /** 로그인 세션이 있을 때만 기록 (익명 방문은 null) */
  userId: text("user_id").references(() => users.id),
  ipHash: text("ip_hash"),
  countryCode: text("country_code"),
  region: text("region"),
  deviceType: text("device_type"),
  refererDomain: text("referer_domain"),
  utmSource: text("utm_source"),
});

// 사이트 공지 (관리자 설정). showAsPopup=true면 메인 접속 시 팝업, false면 /notices 게시판에만 노출
export const siteAnnouncements = pgTable("site_announcements", {
  id: serial("id").primaryKey(),
  content: text("content").notNull(),
  contentTranslations: jsonb("content_translations").$type<Record<string, string>>().default({}),
  textSize: text("text_size").default("md"),
  imageUrl: text("image_url"),
  showAsPopup: boolean("show_as_popup").default(true), // true=메인 팝업, false=게시판(/notices)에만
  viewCount: integer("view_count").default(0),
  startsAt: timestamp("starts_at").notNull(),
  endsAt: timestamp("ends_at").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// 동영상 가이드 (관리자가 /guide 영상 링크를 등록)
export const guideVideos = pgTable("guide_videos", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description"),
  youtubeUrl: text("youtube_url").notNull(),
  sortOrder: integer("sort_order"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// === RELATIONS ===

export const usersRelations = relations(users, ({ many }) => ({
  uploadedMusic: many(music, { relationName: "uploader" }),
  reviews: many(reviews),
  playlists: many(playlists),
  posts: many(posts),
  postComments: many(postComments),
  notifications: many(notifications),
  pushSubscriptions: many(pushSubscriptions),
  likes: many(likes),
  followers: many(follows, { relationName: "follower" }),
  following: many(follows, { relationName: "following" }),
}));

export const musicRelations = relations(music, ({ one, many }) => ({
  uploader: one(users, {
    fields: [music.userId],
    references: [users.id],
    relationName: "uploader"
  }),
  reviews: many(reviews),
  likes: many(likes),
  playlistEntries: many(playlistMusic),
}));

export const likesRelations = relations(likes, ({ one }) => ({
  user: one(users, {
    fields: [likes.userId],
    references: [users.id],
  }),
  music: one(music, {
    fields: [likes.musicId],
    references: [music.id],
  }),
}));

export const reviewsRelations = relations(reviews, ({ one }) => ({
  user: one(users, {
    fields: [reviews.userId],
    references: [users.id],
  }),
  music: one(music, {
    fields: [reviews.musicId],
    references: [music.id],
  }),
}));

export const playlistsRelations = relations(playlists, ({ one, many }) => ({
  user: one(users, {
    fields: [playlists.userId],
    references: [users.id],
  }),
  entries: many(playlistMusic),
}));

export const playlistMusicRelations = relations(playlistMusic, ({ one }) => ({
  playlist: one(playlists, {
    fields: [playlistMusic.playlistId],
    references: [playlists.id],
  }),
  music: one(music, {
    fields: [playlistMusic.musicId],
    references: [music.id],
  }),
}));

export const curatedPlaylistsRelations = relations(curatedPlaylists, ({ many }) => ({
  tracks: many(curatedPlaylistMusic),
}));

export const curatedPlaylistMusicRelations = relations(curatedPlaylistMusic, ({ one }) => ({
  curatedPlaylist: one(curatedPlaylists, {
    fields: [curatedPlaylistMusic.curatedPlaylistId],
    references: [curatedPlaylists.id],
  }),
  music: one(music, {
    fields: [curatedPlaylistMusic.musicId],
    references: [music.id],
  }),
}));

export const postsRelations = relations(posts, ({ one, many }) => ({
  user: one(users, {
    fields: [posts.userId],
    references: [users.id],
  }),
  comments: many(postComments),
}));

export const postCommentsRelations = relations(postComments, ({ one }) => ({
  user: one(users, {
    fields: [postComments.userId],
    references: [users.id],
  }),
  post: one(posts, {
    fields: [postComments.postId],
    references: [posts.id],
  }),
}));

export const pushSubscriptionsRelations = relations(pushSubscriptions, ({ one }) => ({
  user: one(users, {
    fields: [pushSubscriptions.userId],
    references: [users.id],
  }),
}));

export const notificationsRelations = relations(notifications, ({ one }) => ({
  user: one(users, {
    fields: [notifications.userId],
    references: [users.id],
  }),
}));

export const copyrightReportsRelations = relations(copyrightReports, ({ one }) => ({
  music: one(music, {
    fields: [copyrightReports.musicId],
    references: [music.id],
  }),
  reporter: one(users, {
    fields: [copyrightReports.reporterId],
    references: [users.id],
  }),
}));

export const tipsRelations = relations(tips, ({ one }) => ({
  fromUser: one(users, {
    fields: [tips.fromUserId],
    references: [users.id],
  }),
  toUser: one(users, {
    fields: [tips.toUserId],
    references: [users.id],
  }),
  music: one(music, {
    fields: [tips.musicId],
    references: [music.id],
  }),
}));

export const purchasesRelations = relations(purchases, ({ one }) => ({
  buyer: one(users, {
    fields: [purchases.buyerId],
    references: [users.id],
  }),
  music: one(music, {
    fields: [purchases.musicId],
    references: [music.id],
  }),
  seller: one(users, {
    fields: [purchases.sellerId],
    references: [users.id],
  }),
}));

export const followsRelations = relations(follows, ({ one }) => ({
  follower: one(users, {
    fields: [follows.followerId],
    references: [users.id],
    relationName: "follower",
  }),
  followed: one(users, {
    fields: [follows.followedId],
    references: [users.id],
    relationName: "following",
  }),
}));

// Streaming Logs table (tracks play duration per song)
export const streamingLogs = pgTable("streaming_logs", {
  id: serial("id").primaryKey(),
  userId: text("user_id").references(() => users.id),
  musicId: integer("music_id").references(() => music.id).notNull(),
  durationSeconds: integer("duration_seconds").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const streamingLogsRelations = relations(streamingLogs, ({ one }) => ({
  user: one(users, {
    fields: [streamingLogs.userId],
    references: [users.id],
  }),
  music: one(music, {
    fields: [streamingLogs.musicId],
    references: [music.id],
  }),
}));

// Credit Transactions table (tracks all credit movements)
export const creditTransactions = pgTable("credit_transactions", {
  id: serial("id").primaryKey(),
  userId: text("user_id").references(() => users.id).notNull(),
  type: text("type").notNull(), // 'charge', 'tip_sent', 'purchase', 'tip_received', 'sale_received'
  amount: integer("amount").notNull(), // positive for additions, negative for deductions
  description: text("description"),
  relatedId: integer("related_id"), // tip or purchase id
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

// Withdrawals table (artist cash-out requests)
export const withdrawals = pgTable("withdrawals", {
  id: serial("id").primaryKey(),
  userId: text("user_id").references(() => users.id).notNull(),
  amount: integer("amount").notNull(),
  fee: integer("fee").notNull(), // 10% platform fee
  netAmount: integer("net_amount").notNull(), // amount - fee
  status: text("status").default("pending").notNull(), // pending, approved, rejected
  bankName: text("bank_name"),
  accountNumber: text("account_number"),
  accountHolder: text("account_holder"),
  adminNote: text("admin_note"),
  createdAt: timestamp("created_at").defaultNow(),
  processedAt: timestamp("processed_at"),
});

export const creditTransactionsRelations = relations(creditTransactions, ({ one }) => ({
  user: one(users, {
    fields: [creditTransactions.userId],
    references: [users.id],
  }),
}));

export const withdrawalsRelations = relations(withdrawals, ({ one }) => ({
  user: one(users, {
    fields: [withdrawals.userId],
    references: [users.id],
  }),
}));

/** 충전 크레딧 환불 신청 (관리자 승인 시 잔액 차감, 원화 환불은 별도 처리) */
export const creditRefundRequests = pgTable("credit_refund_requests", {
  id: serial("id").primaryKey(),
  userId: text("user_id").references(() => users.id).notNull(),
  creditsAmount: integer("credits_amount").notNull(),
  reason: text("reason"),
  status: text("status").default("pending").notNull(), // pending | approved | rejected
  adminNote: text("admin_note"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  processedAt: timestamp("processed_at", { withTimezone: true }),
  /** 승인/반려 처리한 관리자 user id (감사·CS 근거) */
  processedByUserId: text("processed_by_user_id").references(() => users.id),
  /** 원화 환불(입금) 처리 스냅샷 — 상세 이력은 credit_refund_events */
  krwRefundAmountWon: integer("krw_refund_amount_won"),
  krwRefundCompletedAt: timestamp("krw_refund_completed_at", { withTimezone: true }),
  krwRefundNote: text("krw_refund_note"),
  krwRefundRecordedByUserId: text("krw_refund_recorded_by_user_id").references(() => users.id),
});

/** 환불 신청·승인·반려·원화기록 등 append-only 감사 로그 */
export const creditRefundEvents = pgTable("credit_refund_events", {
  id: serial("id").primaryKey(),
  refundRequestId: integer("refund_request_id")
    .references(() => creditRefundRequests.id, { onDelete: "cascade" })
    .notNull(),
  eventType: text("event_type").notNull(),
  actorUserId: text("actor_user_id").references(() => users.id),
  metadata: jsonb("metadata"),
  note: text("note"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

export const creditRefundRequestsRelations = relations(creditRefundRequests, ({ one, many }) => ({
  user: one(users, {
    fields: [creditRefundRequests.userId],
    references: [users.id],
  }),
  refundEvents: many(creditRefundEvents),
}));

export const creditRefundEventsRelations = relations(creditRefundEvents, ({ one }) => ({
  refundRequest: one(creditRefundRequests, {
    fields: [creditRefundEvents.refundRequestId],
    references: [creditRefundRequests.id],
  }),
}));

/** 이메일 OTP (환불 등 민감 작업 본인확인). deploy/sensitive-email-otp.sql */
export const sensitiveEmailOtpChallenges = pgTable("sensitive_email_otp_challenges", {
  id: serial("id").primaryKey(),
  userId: text("user_id")
    .references(() => users.id, { onDelete: "cascade" })
    .notNull(),
  purpose: text("purpose").notNull(),
  codeHash: text("code_hash").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  verifyAttempts: integer("verify_attempts").default(0).notNull(),
  consumedAt: timestamp("consumed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

// Music Stories table (creative history by uploader)
export const musicStories = pgTable("music_stories", {
  id: serial("id").primaryKey(),
  musicId: integer("music_id").references(() => music.id).notNull(),
  userId: text("user_id").references(() => users.id).notNull(),
  content: text("content").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

// Story Comments table
export const storyComments = pgTable("story_comments", {
  id: serial("id").primaryKey(),
  storyId: integer("story_id").references(() => musicStories.id).notNull(),
  userId: text("user_id").references(() => users.id).notNull(),
  content: text("content").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const musicStoriesRelations = relations(musicStories, ({ one, many }) => ({
  music: one(music, {
    fields: [musicStories.musicId],
    references: [music.id],
  }),
  user: one(users, {
    fields: [musicStories.userId],
    references: [users.id],
  }),
  comments: many(storyComments),
}));

export const storyCommentsRelations = relations(storyComments, ({ one }) => ({
  story: one(musicStories, {
    fields: [storyComments.storyId],
    references: [musicStories.id],
  }),
  user: one(users, {
    fields: [storyComments.userId],
    references: [users.id],
  }),
}));

// === BASE SCHEMAS ===
export const insertMusicSchema = createInsertSchema(music).omit({ id: true, createdAt: true, userId: true });
export const insertReviewSchema = createInsertSchema(reviews).omit({ id: true, createdAt: true, userId: true, musicId: true });
export const insertPlaylistSchema = createInsertSchema(playlists).omit({ id: true, createdAt: true, userId: true });
export const insertPostSchema = createInsertSchema(posts).omit({ id: true, createdAt: true, userId: true });
export const insertPostCommentSchema = createInsertSchema(postComments).omit({ id: true, createdAt: true, userId: true, postId: true, parentId: true }).extend({ parentId: z.number().nullable().optional() });
export const insertMusicStorySchema = createInsertSchema(musicStories).omit({ id: true, createdAt: true, userId: true, musicId: true });
export const insertStoryCommentSchema = createInsertSchema(storyComments).omit({ id: true, createdAt: true, userId: true, storyId: true });
export const insertCopyrightReportSchema = createInsertSchema(copyrightReports).omit({ id: true, createdAt: true, updatedAt: true, reporterId: true, status: true, adminNote: true });
export const insertTipSchema = createInsertSchema(tips).omit({ id: true, createdAt: true, fromUserId: true });
export const insertPurchaseSchema = createInsertSchema(purchases).omit({ id: true, createdAt: true, buyerId: true });

// === EXPLICIT API CONTRACT TYPES ===

export type Music = typeof music.$inferSelect;
export type MusicWithUploaderTier = Music & { uploaderSubscriptionTier?: string | null; uploaderDonationBadge?: string | null };
export type UserType = typeof users.$inferSelect;
export type InsertMusic = z.infer<typeof insertMusicSchema>;

// Music with user info
export type MusicWithUser = Music & { uploader: UserType };

// Request types
export type CreateMusicRequest = InsertMusic;
export type UpdateMusicRequest = Partial<InsertMusic>;

export type CreateReviewRequest = z.infer<typeof insertReviewSchema>;
export type CreatePlaylistRequest = z.infer<typeof insertPlaylistSchema>;
export type AddToPlaylistRequest = { musicId: number };

export type CreatePostRequest = z.infer<typeof insertPostSchema>;
export type CreatePostCommentRequest = z.infer<typeof insertPostCommentSchema>;

// Response types
export type MusicResponse = Music;
export type PostResponse = typeof posts.$inferSelect & { user: UserType };
export type PostCommentResponse = typeof postComments.$inferSelect & { user: UserType };
export type PlaylistResponse = typeof playlists.$inferSelect;
export type NotificationResponse = typeof notifications.$inferSelect;

export type CopyrightReport = typeof copyrightReports.$inferSelect;
export type CreateCopyrightReportRequest = z.infer<typeof insertCopyrightReportSchema>;

export type Tip = typeof tips.$inferSelect;
export type CreateTipRequest = z.infer<typeof insertTipSchema>;
export type Purchase = typeof purchases.$inferSelect;
export type CreatePurchaseRequest = z.infer<typeof insertPurchaseSchema>;

export type CreditTransaction = typeof creditTransactions.$inferSelect;
export type Withdrawal = typeof withdrawals.$inferSelect;
export type CreditRefundRequest = typeof creditRefundRequests.$inferSelect;
export type CreditRefundEvent = typeof creditRefundEvents.$inferSelect;

export type MusicStory = typeof musicStories.$inferSelect;
export type StoryComment = typeof storyComments.$inferSelect;
export type CreateMusicStoryRequest = z.infer<typeof insertMusicStorySchema>;
export type CreateStoryCommentRequest = z.infer<typeof insertStoryCommentSchema>;

export const announcements = pgTable("announcements", {
  id: serial("id").primaryKey(),
  artistId: text("artist_id").references(() => users.id).notNull(),
  title: text("title").notNull(),
  content: text("content").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const announcementsRelations = relations(announcements, ({ one }) => ({
  artist: one(users, {
    fields: [announcements.artistId],
    references: [users.id],
  }),
}));

export const insertAnnouncementSchema = createInsertSchema(announcements).omit({ id: true, createdAt: true });
export type Announcement = typeof announcements.$inferSelect;
export type CreateAnnouncementRequest = z.infer<typeof insertAnnouncementSchema>;

export const conversations = pgTable("conversations", {
  id: serial("id").primaryKey(),
  user1Id: text("user1_id").references(() => users.id).notNull(),
  user2Id: text("user2_id").references(() => users.id).notNull(),
  lastMessageAt: timestamp("last_message_at").defaultNow(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const directMessages = pgTable("direct_messages", {
  id: serial("id").primaryKey(),
  conversationId: integer("conversation_id").references(() => conversations.id).notNull(),
  senderId: text("sender_id").references(() => users.id).notNull(),
  content: text("content").notNull(),
  isRead: boolean("is_read").default(false),
  createdAt: timestamp("created_at").defaultNow(),
});

export const conversationsRelations = relations(conversations, ({ one, many }) => ({
  user1: one(users, {
    fields: [conversations.user1Id],
    references: [users.id],
    relationName: "conversationUser1",
  }),
  user2: one(users, {
    fields: [conversations.user2Id],
    references: [users.id],
    relationName: "conversationUser2",
  }),
  messages: many(directMessages),
}));

export const directMessagesRelations = relations(directMessages, ({ one }) => ({
  conversation: one(conversations, {
    fields: [directMessages.conversationId],
    references: [conversations.id],
  }),
  sender: one(users, {
    fields: [directMessages.senderId],
    references: [users.id],
  }),
}));

export const insertDirectMessageSchema = createInsertSchema(directMessages).omit({ id: true, createdAt: true, isRead: true });
export type Conversation = typeof conversations.$inferSelect;
export type DirectMessage = typeof directMessages.$inferSelect;
export type InsertDirectMessage = z.infer<typeof insertDirectMessageSchema>;

// 차단: blocker가 blocked를 차단
export const userBlocks = pgTable("user_blocks", {
  id: serial("id").primaryKey(),
  blockerId: text("blocker_id").references(() => users.id).notNull(),
  blockedId: text("blocked_id").references(() => users.id).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
}, (t) => [uniqueIndex("user_blocks_blocker_blocked").on(t.blockerId, t.blockedId)]);
export const userBlocksRelations = relations(userBlocks, ({ one }) => ({
  blocker: one(users, { fields: [userBlocks.blockerId], references: [users.id] }),
  blocked: one(users, { fields: [userBlocks.blockedId], references: [users.id] }),
}));

// 메시지/사용자 신고
export const userReports = pgTable("user_reports", {
  id: serial("id").primaryKey(),
  reporterId: text("reporter_id").references(() => users.id).notNull(),
  reportedUserId: text("reported_user_id").references(() => users.id).notNull(),
  reason: text("reason").notNull(),
  messageId: integer("message_id").references(() => directMessages.id),
  conversationId: integer("conversation_id").references(() => conversations.id),
  status: text("status").default("pending"), // pending | reviewed | resolved
  adminNote: text("admin_note"),
  createdAt: timestamp("created_at").defaultNow(),
});
export const userReportsRelations = relations(userReports, ({ one }) => ({
  reporter: one(users, { fields: [userReports.reporterId], references: [users.id] }),
  reportedUser: one(users, { fields: [userReports.reportedUserId], references: [users.id] }),
}));
