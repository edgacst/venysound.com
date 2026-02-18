import { pgTable, text, serial, integer, boolean, timestamp, primaryKey } from "drizzle-orm/pg-core";
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

// Community Posts table
export const posts = pgTable("posts", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  content: text("content").notNull(),
  userId: text("user_id").references(() => users.id).notNull(),
  category: text("category"),
  attachment: text("attachment"), // Path in object storage
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

// Notifications table
export const notifications = pgTable("notifications", {
  id: serial("id").primaryKey(),
  userId: text("user_id").references(() => users.id).notNull(),
  type: text("type").notNull(), // 'like', 'comment', 'follow', 'system'
  message: text("message").notNull(),
  url: text("url"),
  isRead: boolean("is_read").default(false),
  createdAt: timestamp("created_at").defaultNow(),
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

// === RELATIONS ===

export const usersRelations = relations(users, ({ many }) => ({
  uploadedMusic: many(music, { relationName: "uploader" }),
  reviews: many(reviews),
  playlists: many(playlists),
  posts: many(posts),
  postComments: many(postComments),
  notifications: many(notifications),
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
  createdAt: timestamp("created_at").defaultNow(),
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
