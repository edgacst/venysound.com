import { db } from "./db";
import { 
  music, likes, follows, reviews, playlists, playlistMusic, posts, postComments, notifications, copyrightReports, tips, purchases, creditTransactions, withdrawals, streamingLogs,
  analyticsVisits, siteAnnouncements,
  conversations, directMessages, musicStories, storyComments,
  type InsertMusic, type UserType, type Music, type CreateReviewRequest, type CreatePlaylistRequest,
  type CreatePostRequest, type CreatePostCommentRequest, type NotificationResponse, type CopyrightReport, type CreateCopyrightReportRequest,
  type Tip, type Purchase, type Conversation, type DirectMessage,
  type MusicStory, type StoryComment, type CreateMusicStoryRequest, type CreateStoryCommentRequest
} from "@shared/schema";
import { eq, desc, and, ilike, inArray, sql, count, lte, gte } from "drizzle-orm";
import type { MusicWithUploaderTier } from "@shared/schema";
import { users } from "@shared/models/auth";

export interface IStorage {
  // Music
  createMusic(musicData: InsertMusic & { userId: string }): Promise<Music>;
  getMusicList(genre?: string, search?: string, tag?: string, page?: number, limit?: number): Promise<{ data: MusicWithUploaderTier[]; total: number }>;
  getMusicById(id: number): Promise<Music | undefined>;
  getMusicByUser(userId: string): Promise<MusicWithUploaderTier[]>;
  
  updateMusic(id: number, data: { title?: string; artist?: string; genre?: string; tags?: string; lyrics?: string | null; isAi?: boolean; imageFilename?: string | null; price?: number; isDownloadable?: boolean }): Promise<Music | undefined>;
  deleteMusic(id: number): Promise<void>;

  // Likes
  toggleLike(userId: string, musicId: number): Promise<boolean>;
  getLikedMusic(userId: string): Promise<Music[]>;
  isLiked(userId: string, musicId: number): Promise<boolean>;
  getMusicLikeCounts(): Promise<Record<number, number>>;
  getMusicLikeCount(musicId: number): Promise<number>;

  // Follows
  toggleFollow(followerId: string, followedId: string): Promise<boolean>;
  getFollowers(userId: string): Promise<UserType[]>;
  getFollowing(userId: string): Promise<UserType[]>;
  isFollowing(followerId: string, followedId: string): Promise<boolean>;

  // Reviews
  createReview(review: CreateReviewRequest & { userId: string, musicId: number }): Promise<any>;
  getReviewsByMusicId(musicId: number): Promise<any[]>;
  getReviewsByUser(userId: string): Promise<any[]>;

  // Playlists
  createPlaylist(playlist: CreatePlaylistRequest & { userId: string }): Promise<any>;
  getPlaylistsByUser(userId: string): Promise<any[]>;
  getPlaylistById(id: number): Promise<any | undefined>;
  addMusicToPlaylist(playlistId: number, musicId: number): Promise<void>;
  
  // Community Posts
  createPost(post: CreatePostRequest & { userId: string }): Promise<any>;
  getPosts(category?: string, search?: string): Promise<any[]>;
  getPostById(id: number): Promise<any | undefined>;
  updatePost(id: number, userId: string, data: { title?: string; content?: string; category?: string | null; attachment?: string | null }): Promise<boolean>;
  deletePost(id: number, userId: string): Promise<boolean>;
  createPostComment(comment: CreatePostCommentRequest & { userId: string, postId: number }): Promise<any>;
  getPostComments(postId: number): Promise<any[]>;
  updatePostComment(id: number, userId: string, content: string): Promise<boolean>;
  deletePostComment(id: number, userId: string): Promise<boolean>;

  // Users
  getUserById(id: string): Promise<any | undefined>;
  updateUserProfile(userId: string, data: { firstName?: string; lastName?: string; profileImageUrl?: string; username?: string }): Promise<any | undefined>;

  // Follows - counts
  getFollowerCount(userId: string): Promise<number>;
  getFollowingCount(userId: string): Promise<number>;

  // Posts by user
  getPostsByUser(userId: string): Promise<any[]>;

  // Playlists
  deletePlaylist(id: number): Promise<void>;
  removeMusicFromPlaylist(playlistId: number, musicId: number): Promise<void>;

  // Notifications
  createNotification(notif: { userId: string, type: string, message: string, payload?: Record<string, unknown>, url?: string }): Promise<any>;
  getNotifications(userId: string): Promise<any[]>;
  markNotificationRead(id: number): Promise<void>;
  markAllNotificationsRead(userId: string): Promise<void>;

  // Admin
  getAdminStats(): Promise<{
    totalUsers: number;
    totalMusic: number;
    totalLikes: number;
    totalComments: number;
  }>;
  recordVisit(visitorKey: string, path: string, extra?: { ipHash?: string; countryCode?: string; region?: string; deviceType?: string; refererDomain?: string; utmSource?: string }): Promise<void>;
  getAdminAnalytics(): Promise<{ dailyVisitors: number; totalVisitors: number; pageViewsToday: number; pageViewsTotal: number }>;
  getAdminStatsByRegion(): Promise<{ countryCode: string | null; region: string | null; count: number }[]>;
  getAdminStatsByDevice(): Promise<{ deviceType: string | null; count: number }[]>;
  getTotalCreditsCharged(): Promise<number>;
  getActiveSiteAnnouncement(): Promise<{ id: number; content: string; imageUrl: string | null; startsAt: Date; endsAt: Date } | null>;
  getSiteAnnouncements(): Promise<{ id: number; content: string; imageUrl: string | null; startsAt: Date; endsAt: Date; createdAt: Date }[]>;
  saveSiteAnnouncement(data: { content: string; imageUrl?: string | null; startsAt: Date; endsAt: Date }): Promise<{ id: number; content: string; imageUrl: string | null; startsAt: Date; endsAt: Date }>;
  deleteSiteAnnouncement(id: number): Promise<void>;
  getAllUsers(search?: string): Promise<any[]>;
  getAllPostsAdmin(): Promise<any[]>;
  deletePostAdmin(id: number): Promise<void>;
  deleteUser(id: string): Promise<void>;
  updateUserRole(id: string, role: string): Promise<void>;
  updateUserSubscription(id: string, tier: string, expiresAt: Date | null): Promise<void>;
  getUserRole(id: string): Promise<string>;

  // Copyright Reports
  createCopyrightReport(report: CreateCopyrightReportRequest & { reporterId: string }): Promise<CopyrightReport>;
  getCopyrightReportsByUser(userId: string): Promise<any[]>;
  getAllCopyrightReports(status?: string): Promise<any[]>;
  updateCopyrightReportStatus(id: number, status: string, adminNote?: string): Promise<CopyrightReport | undefined>;
  getCopyrightReportsByMusic(musicId: number): Promise<CopyrightReport[]>;

  // Tips
  createTip(tip: { fromUserId: string; toUserId: string; musicId?: number | null; amount: number; message?: string | null }): Promise<Tip>;
  getTipsByUser(userId: string): Promise<any[]>;
  getTipsReceived(userId: string): Promise<any[]>;
  getTipsTotalSent(userId: string): Promise<number>;
  updateDonationBadge(userId: string, badge: string | null): Promise<void>;

  // Purchases
  createPurchase(purchase: { buyerId: string; musicId: number; sellerId: string; amount: number }): Promise<Purchase>;
  hasPurchased(buyerId: string, musicId: number): Promise<boolean>;
  getPurchasesByUser(userId: string): Promise<any[]>;
  getSalesByUser(userId: string): Promise<any[]>;

  // Earnings
  getUserBalance(userId: string): Promise<number>;
  addToBalance(userId: string, amount: number): Promise<void>;
  getEarningsSummary(userId: string): Promise<{ totalTips: number; totalSales: number; balance: number; credits: number }>;

  // Credits
  getUserCredits(userId: string): Promise<number>;
  addCredits(userId: string, amount: number): Promise<void>;
  deductCredits(userId: string, amount: number): Promise<boolean>;
  createCreditTransaction(tx: { userId: string; type: string; amount: number; description?: string; relatedId?: number }): Promise<any>;
  getCreditTransactions(userId: string): Promise<any[]>;

  // Withdrawals
  createWithdrawal(data: { userId: string; amount: number; fee: number; netAmount: number; bankName?: string; accountNumber?: string; accountHolder?: string }): Promise<any>;
  getWithdrawalsByUser(userId: string): Promise<any[]>;
  getAllWithdrawals(status?: string): Promise<any[]>;
  updateWithdrawalStatus(id: number, status: string, adminNote?: string): Promise<any>;
  deductBalance(userId: string, amount: number): Promise<boolean>;

  // Music Stories
  createMusicStory(data: CreateMusicStoryRequest & { userId: string; musicId: number }): Promise<MusicStory>;
  getMusicStoriesByMusicId(musicId: number): Promise<any[]>;
  updateMusicStory(id: number, content: string): Promise<MusicStory | undefined>;
  deleteMusicStory(id: number): Promise<void>;

  // Story Comments
  createStoryComment(data: CreateStoryCommentRequest & { userId: string; storyId: number }): Promise<StoryComment>;
  getStoryComments(storyId: number): Promise<any[]>;
  deleteStoryComment(id: number): Promise<void>;

  // Direct Messages
  getOrCreateConversation(user1Id: string, user2Id: string): Promise<Conversation>;
  isConversationParticipant(conversationId: number, userId: string): Promise<boolean>;
  getConversationsByUser(userId: string): Promise<any[]>;
  getMessages(conversationId: number, limit?: number, before?: number): Promise<any[]>;
  createMessage(conversationId: number, senderId: string, content: string): Promise<DirectMessage>;
  markMessagesRead(conversationId: number, userId: string): Promise<void>;
  getUnreadMessageCount(userId: string): Promise<number>;
}

export class DatabaseStorage implements IStorage {
  // Music
  async createMusic(musicData: InsertMusic & { userId: string }): Promise<Music> {
    const [newMusic] = await db.insert(music).values(musicData).returning();
    return newMusic;
  }

  async getMusicList(genre?: string, search?: string, tag?: string, page: number = 1, limit: number = 30): Promise<{ data: Music[]; total: number }> {
    const genreGroups: Record<string, string[]> = {
      "팝뮤직": ["팝뮤직", "팝발라드", "댄스팝", "일렉트로팝", "인디팝", "틴팝", "신스팝", "드림팝", "시티팝"],
      "국내가요": ["국내가요", "케이팝", "발라드", "트로트", "국내OST", "어쿠스틱가요", "K-POP", "KPOP"],
      "월드뮤직": ["월드뮤직", "라틴음악", "아프로비트", "레게", "플라멩코", "켈틱", "인도음악", "중동음악"],
      "경음악": ["경음악", "재즈", "클래식", "뉴에이지", "태교음악", "카페음악"],
    };

    const conditions = [];
    if (genre) {
      if (genreGroups[genre]) {
        conditions.push(inArray(music.genre, genreGroups[genre]));
      } else {
        conditions.push(eq(music.genre, genre));
      }
    }
    if (search) {
      conditions.push(sql`(${music.title} ILIKE ${`%${search}%`} OR ${music.artist} ILIKE ${`%${search}%`} OR ${music.genre} ILIKE ${`%${search}%`} OR ${music.tags} ILIKE ${`%${search}%`})`);
    }
    if (tag) {
      conditions.push(ilike(music.tags, `%${tag}%`));
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const countResult = await db.select({ count: sql<number>`count(*)` }).from(music).where(whereClause);
    const total = Number(countResult[0]?.count || 0);

    const offset = (page - 1) * limit;
    const musicColumns = {
      id: music.id,
      title: music.title,
      artist: music.artist,
      filename: music.filename,
      imageFilename: music.imageFilename,
      genre: music.genre,
      tags: music.tags,
      lyrics: music.lyrics,
      isAi: music.isAi,
      price: music.price,
      isDownloadable: music.isDownloadable,
      userId: music.userId,
      createdAt: music.createdAt,
    };
    let query = db
      .select({
        ...musicColumns,
        _uploaderTier: users.subscriptionTier,
        _uploaderExpiresAt: users.subscriptionExpiresAt,
        _uploaderRole: users.role,
      })
      .from(music)
      .leftJoin(users, eq(music.userId, users.id))
      .orderBy(desc(music.createdAt))
      .limit(limit)
      .offset(offset);
    if (whereClause) {
      // @ts-ignore
      query = query.where(whereClause);
    }
    const rows = await query;
    const now = new Date();
    const data: MusicWithUploaderTier[] = rows.map((r) => {
      const { _uploaderTier, _uploaderExpiresAt, _uploaderRole, ...rest } = r as typeof rows[0] & { _uploaderTier: string | null; _uploaderExpiresAt: Date | string | null; _uploaderRole: string | null };
      const subscriptionPremium = _uploaderTier === "premium" && (_uploaderExpiresAt == null || new Date(_uploaderExpiresAt) > now);
      const isPremium = _uploaderRole === "admin" || subscriptionPremium;
      return { ...rest, uploaderSubscriptionTier: isPremium ? "premium" : "free", uploaderDonationBadge: null } as MusicWithUploaderTier;
    });

    return { data, total };
  }

  async getMusicById(id: number): Promise<Music | undefined> {
    const [found] = await db.select().from(music).where(eq(music.id, id));
    return found;
  }

  async getMusicByUser(userId: string): Promise<MusicWithUploaderTier[]> {
    const musicColumns = {
      id: music.id,
      title: music.title,
      artist: music.artist,
      filename: music.filename,
      imageFilename: music.imageFilename,
      genre: music.genre,
      tags: music.tags,
      lyrics: music.lyrics,
      isAi: music.isAi,
      price: music.price,
      isDownloadable: music.isDownloadable,
      userId: music.userId,
      createdAt: music.createdAt,
    };
    const rows = await db
      .select({
        ...musicColumns,
        _uploaderTier: users.subscriptionTier,
        _uploaderExpiresAt: users.subscriptionExpiresAt,
        _uploaderRole: users.role,
      })
      .from(music)
      .leftJoin(users, eq(music.userId, users.id))
      .where(eq(music.userId, userId))
      .orderBy(desc(music.createdAt));
    const now = new Date();
    return rows.map((r) => {
      const { _uploaderTier, _uploaderExpiresAt, _uploaderRole, ...rest } = r as typeof rows[0] & { _uploaderTier: string | null; _uploaderExpiresAt: Date | string | null; _uploaderRole: string | null };
      const subscriptionPremium = _uploaderTier === "premium" && (_uploaderExpiresAt == null || new Date(_uploaderExpiresAt) > now);
      const isPremium = _uploaderRole === "admin" || subscriptionPremium;
      return { ...rest, uploaderSubscriptionTier: isPremium ? "premium" : "free", uploaderDonationBadge: null } as MusicWithUploaderTier;
    });
  }

  async updateMusic(id: number, data: { title?: string; artist?: string; genre?: string; tags?: string; lyrics?: string | null; isAi?: boolean; imageFilename?: string | null; price?: number; isDownloadable?: boolean }): Promise<Music | undefined> {
    const [updated] = await db.update(music).set(data).where(eq(music.id, id)).returning();
    return updated;
  }

  async deleteMusic(id: number): Promise<void> {
    await db.execute(sql`DELETE FROM streaming_logs WHERE music_id = ${id}`);
    await db.execute(sql`DELETE FROM likes WHERE music_id = ${id}`);
    await db.execute(sql`DELETE FROM reviews WHERE music_id = ${id}`);
    await db.execute(sql`DELETE FROM playlist_music WHERE music_id = ${id}`);
    await db.execute(sql`DELETE FROM tips WHERE music_id = ${id}`);
    await db.execute(sql`DELETE FROM purchases WHERE music_id = ${id}`);
    await db.execute(sql`DELETE FROM copyright_reports WHERE music_id = ${id}`);
    await db.execute(sql`DELETE FROM story_comments WHERE story_id IN (SELECT id FROM music_stories WHERE music_id = ${id})`);
    await db.execute(sql`DELETE FROM music_stories WHERE music_id = ${id}`);
    await db.execute(sql`DELETE FROM music WHERE id = ${id}`);
  }

  // Likes
  async toggleLike(userId: string, musicId: number): Promise<boolean> {
    const [existing] = await db.select().from(likes)
      .where(and(eq(likes.userId, userId), eq(likes.musicId, musicId)));
    
    if (existing) {
      await db.delete(likes).where(and(eq(likes.userId, userId), eq(likes.musicId, musicId)));
      return false;
    } else {
      await db.insert(likes).values({ userId, musicId });
      return true;
    }
  }

  async getLikedMusic(userId: string): Promise<Music[]> {
    const results = await db.select({
        music: music
      })
      .from(likes)
      .innerJoin(music, eq(likes.musicId, music.id))
      .where(eq(likes.userId, userId))
      .orderBy(desc(music.createdAt));
      
    return results.map(r => r.music);
  }

  async isLiked(userId: string, musicId: number): Promise<boolean> {
    const [existing] = await db.select().from(likes)
      .where(and(eq(likes.userId, userId), eq(likes.musicId, musicId)));
    return !!existing;
  }

  async getMusicLikeCounts(): Promise<Record<number, number>> {
    const results = await db.select({
      musicId: likes.musicId,
      count: sql<number>`count(*)::int`,
    }).from(likes).groupBy(likes.musicId);
    const map: Record<number, number> = {};
    for (const r of results) {
      map[r.musicId] = r.count;
    }
    return map;
  }

  async getMusicLikeCount(musicId: number): Promise<number> {
    const [result] = await db.select({
      count: sql<number>`count(*)::int`,
    }).from(likes).where(eq(likes.musicId, musicId));
    return result?.count ?? 0;
  }

  // Follows
  async toggleFollow(followerId: string, followedId: string): Promise<boolean> {
    if (!followerId || !followedId || followerId === followedId) return false;

    const [existing] = await db.select().from(follows)
      .where(and(eq(follows.followerId, followerId), eq(follows.followedId, followedId)));

    if (existing) {
      await db.delete(follows).where(and(eq(follows.followerId, followerId), eq(follows.followedId, followedId)));
      return false;
    }

    const [inserted] = await db.insert(follows).values({ followerId, followedId }).returning();
    return !!inserted;
  }

  async getFollowers(userId: string): Promise<UserType[]> {
    const results = await db.select({ user: users })
      .from(follows)
      .innerJoin(users, eq(follows.followerId, users.id))
      .where(eq(follows.followedId, userId));
    return results.map(r => r.user);
  }

  async getFollowing(userId: string): Promise<UserType[]> {
    const results = await db.select({ user: users })
      .from(follows)
      .innerJoin(users, eq(follows.followedId, users.id))
      .where(eq(follows.followerId, userId));
    return results.map(r => r.user);
  }

  async isFollowing(followerId: string, followedId: string): Promise<boolean> {
    const [existing] = await db.select().from(follows)
      .where(and(eq(follows.followerId, followerId), eq(follows.followedId, followedId)));
    return !!existing;
  }

  // Reviews
  async createReview(reviewData: CreateReviewRequest & { userId: string, musicId: number }): Promise<any> {
    const [review] = await db.insert(reviews).values(reviewData).returning();
    return review;
  }

  async getReviewsByMusicId(musicId: number): Promise<any[]> {
    return await db.select({
      review: reviews,
      user: users
    })
    .from(reviews)
    .innerJoin(users, eq(reviews.userId, users.id))
    .where(eq(reviews.musicId, musicId))
    .orderBy(desc(reviews.createdAt));
  }
  
  async getReviewsByUser(userId: string): Promise<any[]> {
    return await db.select().from(reviews).where(eq(reviews.userId, userId)).orderBy(desc(reviews.createdAt));
  }

  // Playlists
  async createPlaylist(playlistData: CreatePlaylistRequest & { userId: string }): Promise<any> {
    const [playlist] = await db.insert(playlists).values(playlistData).returning();
    return playlist;
  }

  async getPlaylistsByUser(userId: string): Promise<any[]> {
    return await db.select().from(playlists).where(eq(playlists.userId, userId)).orderBy(desc(playlists.createdAt));
  }

  async getPlaylistById(id: number): Promise<any | undefined> {
    const [playlist] = await db.select().from(playlists).where(eq(playlists.id, id));
    if (!playlist) return undefined;
    
    const musicItems = await db.select({ music: music })
      .from(playlistMusic)
      .innerJoin(music, eq(playlistMusic.musicId, music.id))
      .where(eq(playlistMusic.playlistId, id));
      
    return { ...playlist, musics: musicItems.map(m => m.music) };
  }

  async addMusicToPlaylist(playlistId: number, musicId: number): Promise<void> {
    await db.insert(playlistMusic).values({ playlistId, musicId }).onConflictDoNothing();
  }

  // Posts
  async createPost(postData: CreatePostRequest & { userId: string }): Promise<any> {
    const [post] = await db.insert(posts).values(postData).returning();
    return post;
  }

  async getPosts(category?: string, search?: string): Promise<any[]> {
    let query = db.select({
      post: posts,
      user: users
    }).from(posts).innerJoin(users, eq(posts.userId, users.id)).orderBy(desc(posts.createdAt));

    const conditions = [];
    if (category) conditions.push(eq(posts.category, category));
    if (search) conditions.push(sql`(${posts.title} ILIKE ${`%${search}%`} OR ${posts.content} ILIKE ${`%${search}%`})`);
    
    if (conditions.length > 0) {
      // @ts-ignore
      query = query.where(and(...conditions));
    }
    
    const results = await query;
    return results.map(r => ({ ...r.post, user: r.user }));
  }

  async getPostById(id: number): Promise<any | undefined> {
    const [result] = await db.select({
      post: posts,
      user: users
    }).from(posts).innerJoin(users, eq(posts.userId, users.id)).where(eq(posts.id, id));
    
    if (!result) return undefined;
    
    return { ...result.post, user: result.user };
  }

  async updatePost(id: number, _userId: string, data: { title?: string; content?: string; category?: string | null; attachment?: string | null }): Promise<boolean> {
    // NOTE: 로컬/개발 환경 편의를 위해 작성자 검증을 생략하고,
    // 인증된 사용자라면 게시글을 수정할 수 있도록 허용합니다.
    // 멀티 유저 권한 제어가 필요하면 여기에서 posts.userId와 userId를 비교하도록 복원하세요.
    const [row] = await db.select({ id: posts.id }).from(posts).where(eq(posts.id, id));
    if (!row) return false;
    const set: { title?: string; content?: string; category?: string | null; attachment?: string | null } = {};
    if (data.title !== undefined) set.title = data.title.trim();
    if (data.content !== undefined) set.content = data.content.trim();
    if (data.category !== undefined) set.category = data.category?.trim() || null;
    if (data.attachment !== undefined) set.attachment = data.attachment?.trim() || null;
    if (Object.keys(set).length === 0) return true;
    await db.update(posts).set(set).where(eq(posts.id, id));
    return true;
  }

  async deletePost(id: number, _userId: string): Promise<boolean> {
    // NOTE: 로컬/개발 환경 편의를 위해 작성자 검증을 생략하고,
    // 인증된 사용자라면 게시글을 삭제할 수 있도록 허용합니다.
    const [row] = await db.select({ id: posts.id }).from(posts).where(eq(posts.id, id));
    if (!row) return false;
    await db.delete(postComments).where(eq(postComments.postId, id));
    await db.delete(posts).where(eq(posts.id, id));
    return true;
  }

  async createPostComment(commentData: CreatePostCommentRequest & { userId: string, postId: number }): Promise<any> {
    const [comment] = await db.insert(postComments).values(commentData).returning();
    return comment;
  }

  async getPostComments(postId: number): Promise<any[]> {
    const results = await db.select({
      comment: postComments,
      user: users
    }).from(postComments)
      .innerJoin(users, eq(postComments.userId, users.id))
      .where(eq(postComments.postId, postId))
      .orderBy(postComments.createdAt);
      
    return results.map(r => ({ ...r.comment, user: r.user }));
  }

  async updatePostComment(id: number, userId: string, content: string): Promise<boolean> {
    const [comment] = await db.select().from(postComments).where(eq(postComments.id, id));
    if (!comment || comment.userId !== userId) return false;
    await db.update(postComments).set({ content: content.trim() }).where(eq(postComments.id, id));
    return true;
  }

  async deletePostComment(id: number, userId: string): Promise<boolean> {
    const [comment] = await db.select().from(postComments).where(eq(postComments.id, id));
    if (!comment || comment.userId !== userId) return false;
    await db.delete(postComments).where(eq(postComments.id, id));
    await db.delete(postComments).where(eq(postComments.parentId, id));
    return true;
  }

  // Users
  async getUserById(id: string): Promise<any | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async updateUserProfile(userId: string, data: { firstName?: string; lastName?: string; profileImageUrl?: string; username?: string }): Promise<any | undefined> {
    const set: { firstName?: string | null; lastName?: string | null; profileImageUrl?: string | null; username?: string | null; updatedAt: Date } = { updatedAt: new Date() };
    if (data.firstName !== undefined) set.firstName = data.firstName.trim() || null;
    if (data.lastName !== undefined) set.lastName = data.lastName.trim() || null;
    if (data.profileImageUrl !== undefined) set.profileImageUrl = data.profileImageUrl.trim() || null;
    if (data.username !== undefined) set.username = data.username.trim() || null;
    if (Object.keys(set).length <= 1) return this.getUserById(userId);
    const [user] = await db.update(users).set(set).where(eq(users.id, userId)).returning();
    return user;
  }

  // Notifications
  async createNotification(notifData: { userId: string, type: string, message: string, payload?: Record<string, unknown>, url?: string }): Promise<any> {
    const [notif] = await db.insert(notifications).values(notifData).returning();
    await this.pruneNotificationsForUser(notifData.userId, 20);
    return notif;
  }

  async getNotifications(userId: string, limit = 20): Promise<any[]> {
    return await db.select().from(notifications)
      .where(eq(notifications.userId, userId))
      .orderBy(desc(notifications.createdAt))
      .limit(limit);
  }

  /** 사용자당 알림을 최대 keepCount개만 유지하고 나머지 삭제 */
  async pruneNotificationsForUser(userId: string, keepCount = 20): Promise<void> {
    const idsToKeep = await db.select({ id: notifications.id })
      .from(notifications)
      .where(eq(notifications.userId, userId))
      .orderBy(desc(notifications.createdAt))
      .limit(keepCount);
    const keepSet = new Set(idsToKeep.map((r) => r.id));
    const all = await db.select({ id: notifications.id }).from(notifications).where(eq(notifications.userId, userId));
    const toDelete = all.filter((r) => !keepSet.has(r.id)).map((r) => r.id);
    if (toDelete.length > 0) {
      await db.delete(notifications).where(inArray(notifications.id, toDelete));
    }
  }

  async markNotificationRead(id: number): Promise<void> {
    await db.update(notifications).set({ isRead: true }).where(eq(notifications.id, id));
  }

  async markAllNotificationsRead(userId: string): Promise<void> {
    await db.update(notifications).set({ isRead: true }).where(eq(notifications.userId, userId));
  }

  async getFollowerCount(userId: string): Promise<number> {
    const result = await db.select({ count: sql<number>`count(*)::int` })
      .from(follows).where(eq(follows.followedId, userId));
    return result[0]?.count ?? 0;
  }

  async getFollowingCount(userId: string): Promise<number> {
    const result = await db.select({ count: sql<number>`count(*)::int` })
      .from(follows).where(eq(follows.followerId, userId));
    return result[0]?.count ?? 0;
  }

  async getPostsByUser(userId: string): Promise<any[]> {
    const results = await db.select({
      post: posts,
      user: users
    }).from(posts)
      .innerJoin(users, eq(posts.userId, users.id))
      .where(eq(posts.userId, userId))
      .orderBy(desc(posts.createdAt));
    return results.map(r => ({ ...r.post, user: r.user }));
  }

  async deletePlaylist(id: number): Promise<void> {
    await db.delete(playlistMusic).where(eq(playlistMusic.playlistId, id));
    await db.delete(playlists).where(eq(playlists.id, id));
  }

  async removeMusicFromPlaylist(playlistId: number, musicId: number): Promise<void> {
    await db.delete(playlistMusic).where(
      and(eq(playlistMusic.playlistId, playlistId), eq(playlistMusic.musicId, musicId))
    );
  }

  // Admin
  async getAdminStats() {
    const [userCount] = await db.select({ count: sql<number>`count(*)::int` }).from(users);
    const [musicCount] = await db.select({ count: sql<number>`count(*)::int` }).from(music);
    const [likeCount] = await db.select({ count: sql<number>`count(*)::int` }).from(likes);
    const [commentCount] = await db.select({ count: sql<number>`count(*)::int` }).from(postComments);
    const [reviewCount] = await db.select({ count: sql<number>`count(*)::int` }).from(reviews);
    return {
      totalUsers: userCount?.count ?? 0,
      totalMusic: musicCount?.count ?? 0,
      totalLikes: likeCount?.count ?? 0,
      totalComments: (commentCount?.count ?? 0) + (reviewCount?.count ?? 0),
    };
  }

  async recordVisit(visitorKey: string, path: string, extra?: { ipHash?: string; countryCode?: string; region?: string; deviceType?: string; refererDomain?: string; utmSource?: string }): Promise<void> {
    await db.insert(analyticsVisits).values({
      visitorKey,
      path,
      ipHash: extra?.ipHash ?? null,
      countryCode: extra?.countryCode ?? null,
      region: extra?.region ?? null,
      deviceType: extra?.deviceType ?? null,
      refererDomain: extra?.refererDomain ?? null,
      utmSource: extra?.utmSource ?? null,
    });
  }

  async getAdminStatsByRegion(): Promise<{ countryCode: string | null; region: string | null; count: number }[]> {
    try {
      const rows = await db.select({
        countryCode: analyticsVisits.countryCode,
        region: analyticsVisits.region,
        count: sql<number>`count(*)::int`,
      }).from(analyticsVisits).groupBy(analyticsVisits.countryCode, analyticsVisits.region).orderBy(desc(sql`count(*)`)).limit(20);
      return rows;
    } catch {
      return [];
    }
  }

  async getAdminStatsByDevice(): Promise<{ deviceType: string | null; count: number }[]> {
    try {
      const rows = await db.select({
        deviceType: analyticsVisits.deviceType,
        count: sql<number>`count(*)::int`,
      }).from(analyticsVisits).groupBy(analyticsVisits.deviceType).orderBy(desc(sql`count(*)`)).limit(10);
      return rows;
    } catch {
      return [];
    }
  }

  async getTotalCreditsCharged(): Promise<number> {
    const [row] = await db.select({
      total: sql<number>`COALESCE(SUM(${creditTransactions.amount}), 0)::int`,
    }).from(creditTransactions).where(
      and(eq(creditTransactions.type, "charge"), sql`${creditTransactions.amount} > 0`)
    );
    return row?.total ?? 0;
  }

  async getAdminAnalytics(): Promise<{ dailyVisitors: number; totalVisitors: number; pageViewsToday: number; pageViewsTotal: number }> {
    // "오늘" = 한국(Asia/Seoul) 기준 자정~현재. visited_at이 UTC로 저장돼 있어도 일일/오늘 페이지뷰가 맞게 집계되도록.
    const todayCondition = sql`${analyticsVisits.visitedAt} >= (date_trunc('day', (now() AT TIME ZONE 'Asia/Seoul')) AT TIME ZONE 'Asia/Seoul')`;
    try {
      const [dailyV] = await db.select({
        count: sql<number>`count(distinct ${analyticsVisits.visitorKey})::int`,
      }).from(analyticsVisits).where(todayCondition);
      const [totalV] = await db.select({
        count: sql<number>`count(distinct ${analyticsVisits.visitorKey})::int`,
      }).from(analyticsVisits);
      const [pvToday] = await db.select({
        count: sql<number>`count(*)::int`,
      }).from(analyticsVisits).where(todayCondition);
      const [pvTotal] = await db.select({
        count: sql<number>`count(*)::int`,
      }).from(analyticsVisits);
      return {
        dailyVisitors: dailyV?.count ?? 0,
        totalVisitors: totalV?.count ?? 0,
        pageViewsToday: pvToday?.count ?? 0,
        pageViewsTotal: pvTotal?.count ?? 0,
      };
    } catch {
      // 타임존 미지원 등으로 실패 시 서버 기준 "오늘"로 폴백
      const fallback = sql`${analyticsVisits.visitedAt} >= date_trunc('day', now())`;
      const [dailyV] = await db.select({
        count: sql<number>`count(distinct ${analyticsVisits.visitorKey})::int`,
      }).from(analyticsVisits).where(fallback);
      const [totalV] = await db.select({
        count: sql<number>`count(distinct ${analyticsVisits.visitorKey})::int`,
      }).from(analyticsVisits);
      const [pvToday] = await db.select({
        count: sql<number>`count(*)::int`,
      }).from(analyticsVisits).where(fallback);
      const [pvTotal] = await db.select({
        count: sql<number>`count(*)::int`,
      }).from(analyticsVisits);
      return {
        dailyVisitors: dailyV?.count ?? 0,
        totalVisitors: totalV?.count ?? 0,
        pageViewsToday: pvToday?.count ?? 0,
        pageViewsTotal: pvTotal?.count ?? 0,
      };
    }
  }

  async getAllUsers(search?: string): Promise<any[]> {
    let query = db.select().from(users).orderBy(desc(users.createdAt));
    if (search) {
      // @ts-ignore
      query = query.where(
        sql`(${users.id} ILIKE ${`%${search}%`} OR ${users.email} ILIKE ${`%${search}%`} OR ${users.firstName} ILIKE ${`%${search}%`})`
      );
    }
    return await query;
  }

  async getAllPostsAdmin(): Promise<any[]> {
    const results = await db.select({
      post: posts,
      user: users,
      commentCount: sql<number>`(SELECT count(*) FROM post_comments WHERE post_comments.post_id = ${posts.id})::int`,
    })
    .from(posts)
    .innerJoin(users, eq(posts.userId, users.id))
    .orderBy(desc(posts.id));
    return results.map(r => ({ ...r.post, user: r.user, commentCount: r.commentCount }));
  }

  async deletePostAdmin(id: number): Promise<void> {
    await db.delete(postComments).where(eq(postComments.postId, id));
    await db.delete(posts).where(eq(posts.id, id));
  }

  async deleteUser(id: string): Promise<void> {
    await db.delete(notifications).where(eq(notifications.userId, id));

    const userPostIds = await db.select({ id: posts.id }).from(posts).where(eq(posts.userId, id));
    for (const p of userPostIds) {
      await db.delete(postComments).where(eq(postComments.postId, p.id));
    }
    await db.delete(postComments).where(eq(postComments.userId, id));
    await db.delete(posts).where(eq(posts.userId, id));

    const userMusicIds = await db.select({ id: music.id }).from(music).where(eq(music.userId, id));
    const userMusicIdList = userMusicIds.map((m) => m.id);

    const userStoryIds = await db.select({ id: musicStories.id }).from(musicStories).where(eq(musicStories.userId, id));
    for (const s of userStoryIds) {
      await db.delete(storyComments).where(eq(storyComments.storyId, s.id));
    }
    await db.delete(storyComments).where(eq(storyComments.userId, id));
    await db.delete(musicStories).where(eq(musicStories.userId, id));

    if (userMusicIdList.length > 0) {
      await db.delete(copyrightReports).where(inArray(copyrightReports.musicId, userMusicIdList));
      await db.delete(tips).where(inArray(tips.musicId, userMusicIdList));
      await db.delete(purchases).where(inArray(purchases.musicId, userMusicIdList));
    }
    await db.delete(copyrightReports).where(eq(copyrightReports.reporterId, id));
    await db.delete(tips).where(eq(tips.fromUserId, id));
    await db.delete(tips).where(eq(tips.toUserId, id));
    await db.delete(purchases).where(eq(purchases.buyerId, id));
    await db.delete(purchases).where(eq(purchases.sellerId, id));
    await db.delete(streamingLogs).where(eq(streamingLogs.userId, id));
    await db.delete(creditTransactions).where(eq(creditTransactions.userId, id));
    await db.delete(withdrawals).where(eq(withdrawals.userId, id));

    const userConvoIds = await db.select({ id: conversations.id }).from(conversations)
      .where(eq(conversations.user1Id, id));
    const userConvoIds2 = await db.select({ id: conversations.id }).from(conversations)
      .where(eq(conversations.user2Id, id));
    const allConvoIds = [...userConvoIds, ...userConvoIds2].map((c) => c.id);
    if (allConvoIds.length > 0) {
      await db.delete(directMessages).where(inArray(directMessages.conversationId, allConvoIds));
    }
    await db.delete(directMessages).where(eq(directMessages.senderId, id));
    await db.delete(conversations).where(eq(conversations.user1Id, id));
    await db.delete(conversations).where(eq(conversations.user2Id, id));

    if (userMusicIdList.length > 0) {
      await db.delete(streamingLogs).where(inArray(streamingLogs.musicId, userMusicIdList));
    }
    for (const m of userMusicIds) {
      await db.delete(likes).where(eq(likes.musicId, m.id));
      await db.delete(reviews).where(eq(reviews.musicId, m.id));
      await db.delete(playlistMusic).where(eq(playlistMusic.musicId, m.id));
    }

    await db.delete(reviews).where(eq(reviews.userId, id));
    await db.delete(likes).where(eq(likes.userId, id));
    await db.delete(follows).where(eq(follows.followerId, id));
    await db.delete(follows).where(eq(follows.followedId, id));

    const userPlaylists = await db.select({ id: playlists.id }).from(playlists).where(eq(playlists.userId, id));
    for (const pl of userPlaylists) {
      await db.delete(playlistMusic).where(eq(playlistMusic.playlistId, pl.id));
    }
    await db.delete(playlists).where(eq(playlists.userId, id));
    await db.delete(music).where(eq(music.userId, id));
    await db.delete(users).where(eq(users.id, id));
  }

  async updateUserRole(id: string, role: string): Promise<void> {
    await db.update(users).set({ role }).where(eq(users.id, id));
  }

  async updateUserSubscription(id: string, tier: string, expiresAt: Date | null): Promise<void> {
    await db.update(users).set({ subscriptionTier: tier, subscriptionExpiresAt: expiresAt }).where(eq(users.id, id));
  }

  async getUserRole(id: string): Promise<string> {
    const [user] = await db.select({ role: users.role }).from(users).where(eq(users.id, id));
    return user?.role ?? "user";
  }

  // Copyright Reports
  async createCopyrightReport(report: CreateCopyrightReportRequest & { reporterId: string }): Promise<CopyrightReport> {
    const [newReport] = await db.insert(copyrightReports).values(report).returning();
    return newReport;
  }

  async getCopyrightReportsByUser(userId: string): Promise<any[]> {
    const results = await db.select({
      report: copyrightReports,
      musicTitle: music.title,
      musicArtist: music.artist,
    })
    .from(copyrightReports)
    .leftJoin(music, eq(copyrightReports.musicId, music.id))
    .where(eq(copyrightReports.reporterId, userId))
    .orderBy(desc(copyrightReports.createdAt));
    return results.map(r => ({
      ...r.report,
      musicTitle: r.musicTitle,
      musicArtist: r.musicArtist,
    }));
  }

  async getAllCopyrightReports(status?: string): Promise<any[]> {
    const conditions = [];
    if (status && status !== "all") {
      conditions.push(eq(copyrightReports.status, status));
    }
    const results = await db.select({
      report: copyrightReports,
      musicTitle: music.title,
      musicArtist: music.artist,
      reporterEmail: users.email,
    })
    .from(copyrightReports)
    .leftJoin(music, eq(copyrightReports.musicId, music.id))
    .leftJoin(users, eq(copyrightReports.reporterId, users.id))
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(copyrightReports.createdAt));
    return results.map(r => ({
      ...r.report,
      musicTitle: r.musicTitle,
      musicArtist: r.musicArtist,
      reporterEmail: r.reporterEmail,
    }));
  }

  async updateCopyrightReportStatus(id: number, status: string, adminNote?: string): Promise<CopyrightReport | undefined> {
    const updateData: any = { status, updatedAt: new Date() };
    if (adminNote !== undefined) updateData.adminNote = adminNote;
    const [updated] = await db.update(copyrightReports).set(updateData).where(eq(copyrightReports.id, id)).returning();
    return updated;
  }

  async getCopyrightReportsByMusic(musicId: number): Promise<CopyrightReport[]> {
    return await db.select().from(copyrightReports).where(eq(copyrightReports.musicId, musicId)).orderBy(desc(copyrightReports.createdAt));
  }

  // Tips
  async createTip(tipData: { fromUserId: string; toUserId: string; musicId?: number | null; amount: number; message?: string | null }): Promise<Tip> {
    const [tip] = await db.insert(tips).values(tipData).returning();
    return tip;
  }

  async getTipsByUser(userId: string): Promise<any[]> {
    const results = await db.select({
      tip: tips,
      toUser: users,
    })
    .from(tips)
    .innerJoin(users, eq(tips.toUserId, users.id))
    .where(eq(tips.fromUserId, userId))
    .orderBy(desc(tips.createdAt));
    return results.map(r => ({ ...r.tip, toUser: r.toUser }));
  }

  async getTipsReceived(userId: string): Promise<any[]> {
    const results = await db.select({
      tip: tips,
      fromUser: users,
    })
    .from(tips)
    .innerJoin(users, eq(tips.fromUserId, users.id))
    .where(eq(tips.toUserId, userId))
    .orderBy(desc(tips.createdAt));
    return results.map(r => ({ ...r.tip, fromUser: r.fromUser }));
  }

  async getTipsTotalSent(userId: string): Promise<number> {
    const result = await db.select({ total: sql<number>`coalesce(sum(${tips.amount}), 0)` })
      .from(tips)
      .where(eq(tips.fromUserId, userId));
    return Number(result[0]?.total ?? 0);
  }

  async updateDonationBadge(userId: string, badge: string | null): Promise<void> {
    await db.update(users).set({ donationBadge: badge ?? undefined }).where(eq(users.id, userId));
  }

  // Purchases
  async createPurchase(purchaseData: { buyerId: string; musicId: number; sellerId: string; amount: number }): Promise<Purchase> {
    const [purchase] = await db.insert(purchases).values(purchaseData).returning();
    return purchase;
  }

  async hasPurchased(buyerId: string, musicId: number): Promise<boolean> {
    const [existing] = await db.select().from(purchases)
      .where(and(eq(purchases.buyerId, buyerId), eq(purchases.musicId, musicId)));
    return !!existing;
  }

  async getPurchasesByUser(userId: string): Promise<any[]> {
    const results = await db.select({
      purchase: purchases,
      music: music,
    })
    .from(purchases)
    .innerJoin(music, eq(purchases.musicId, music.id))
    .where(eq(purchases.buyerId, userId))
    .orderBy(desc(purchases.createdAt));
    return results.map(r => ({ ...r.purchase, music: r.music }));
  }

  async getSalesByUser(userId: string): Promise<any[]> {
    const results = await db.select({
      purchase: purchases,
      music: music,
      buyer: users,
    })
    .from(purchases)
    .innerJoin(music, eq(purchases.musicId, music.id))
    .innerJoin(users, eq(purchases.buyerId, users.id))
    .where(eq(purchases.sellerId, userId))
    .orderBy(desc(purchases.createdAt));
    return results.map(r => ({ ...r.purchase, music: r.music, buyer: r.buyer }));
  }

  // Earnings
  async getUserBalance(userId: string): Promise<number> {
    const [user] = await db.select({ balance: users.balance }).from(users).where(eq(users.id, userId));
    return user?.balance ?? 0;
  }

  async addToBalance(userId: string, amount: number): Promise<void> {
    await db.update(users).set({ 
      balance: sql`COALESCE(${users.balance}, 0) + ${amount}` 
    }).where(eq(users.id, userId));
  }

  async getEarningsSummary(userId: string): Promise<{ totalTips: number; totalSales: number; balance: number; credits: number }> {
    const [tipSum] = await db.select({ 
      total: sql<number>`COALESCE(SUM(${tips.amount}), 0)::int` 
    }).from(tips).where(eq(tips.toUserId, userId));

    const [saleSum] = await db.select({ 
      total: sql<number>`COALESCE(SUM(${purchases.amount}), 0)::int` 
    }).from(purchases).where(eq(purchases.sellerId, userId));

    const balance = await this.getUserBalance(userId);
    const credits = await this.getUserCredits(userId);

    return {
      totalTips: tipSum?.total ?? 0,
      totalSales: saleSum?.total ?? 0,
      balance,
      credits,
    };
  }

  // Credits
  async getUserCredits(userId: string): Promise<number> {
    const [user] = await db.select({ credits: users.credits }).from(users).where(eq(users.id, userId));
    return user?.credits ?? 0;
  }

  async addCredits(userId: string, amount: number): Promise<void> {
    await db.update(users).set({ 
      credits: sql`COALESCE(${users.credits}, 0) + ${amount}` 
    }).where(eq(users.id, userId));
  }

  async deductCredits(userId: string, amount: number): Promise<boolean> {
    const currentCredits = await this.getUserCredits(userId);
    if (currentCredits < amount) return false;
    await db.update(users).set({ 
      credits: sql`COALESCE(${users.credits}, 0) - ${amount}` 
    }).where(eq(users.id, userId));
    return true;
  }

  async createCreditTransaction(tx: { userId: string; type: string; amount: number; description?: string; relatedId?: number }): Promise<any> {
    const [transaction] = await db.insert(creditTransactions).values(tx).returning();
    return transaction;
  }

  async getCreditTransactions(userId: string): Promise<any[]> {
    return await db.select().from(creditTransactions)
      .where(eq(creditTransactions.userId, userId))
      .orderBy(desc(creditTransactions.createdAt));
  }

  // Withdrawals
  async createWithdrawal(data: { userId: string; amount: number; fee: number; netAmount: number; bankName?: string; accountNumber?: string; accountHolder?: string }): Promise<any> {
    const [withdrawal] = await db.insert(withdrawals).values(data).returning();
    return withdrawal;
  }

  async getWithdrawalsByUser(userId: string): Promise<any[]> {
    return await db.select().from(withdrawals)
      .where(eq(withdrawals.userId, userId))
      .orderBy(desc(withdrawals.createdAt));
  }

  async getAllWithdrawals(status?: string): Promise<any[]> {
    const conditions = [];
    if (status && status !== "all") {
      conditions.push(eq(withdrawals.status, status));
    }
    const results = await db.select({
      withdrawal: withdrawals,
      user: users,
    })
    .from(withdrawals)
    .innerJoin(users, eq(withdrawals.userId, users.id))
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(withdrawals.createdAt));
    return results.map(r => ({ ...r.withdrawal, user: r.user }));
  }

  async updateWithdrawalStatus(id: number, status: string, adminNote?: string): Promise<any> {
    const updateData: any = { status, processedAt: new Date() };
    if (adminNote !== undefined) updateData.adminNote = adminNote;
    const [updated] = await db.update(withdrawals).set(updateData).where(eq(withdrawals.id, id)).returning();
    return updated;
  }

  async deductBalance(userId: string, amount: number): Promise<boolean> {
    const currentBalance = await this.getUserBalance(userId);
    if (currentBalance < amount) return false;
    await db.update(users).set({ 
      balance: sql`COALESCE(${users.balance}, 0) - ${amount}` 
    }).where(eq(users.id, userId));
    return true;
  }

  async isConversationParticipant(conversationId: number, userId: string): Promise<boolean> {
    const rows = await db.select().from(conversations)
      .where(and(
        eq(conversations.id, conversationId),
        sql`(${conversations.user1Id} = ${userId} OR ${conversations.user2Id} = ${userId})`
      ))
      .limit(1);
    return rows.length > 0;
  }

  async getOrCreateConversation(user1Id: string, user2Id: string): Promise<Conversation> {
    const [id1, id2] = [user1Id, user2Id].sort();
    const existing = await db.select().from(conversations)
      .where(and(eq(conversations.user1Id, id1), eq(conversations.user2Id, id2)))
      .limit(1);
    if (existing.length > 0) return existing[0];
    const [conv] = await db.insert(conversations).values({ user1Id: id1, user2Id: id2 }).returning();
    return conv;
  }

  async getConversationsByUser(userId: string): Promise<any[]> {
    const rows = await db.execute(sql`
      SELECT c.*, 
        COALESCE(dm.content, '') as last_message,
        dm.created_at as last_msg_time,
        dm.sender_id as last_sender_id,
        (SELECT COUNT(*)::int FROM direct_messages WHERE conversation_id = c.id AND sender_id != ${userId} AND is_read = false) as unread_count,
        CASE WHEN c.user1_id = ${userId} THEN u2.id ELSE u1.id END as other_user_id,
        CASE WHEN c.user1_id = ${userId} THEN u2.first_name ELSE u1.first_name END as other_first_name,
        CASE WHEN c.user1_id = ${userId} THEN u2.last_name ELSE u1.last_name END as other_last_name,
        CASE WHEN c.user1_id = ${userId} THEN u2.profile_image_url ELSE u1.profile_image_url END as other_profile_image
      FROM conversations c
      JOIN users u1 ON c.user1_id = u1.id
      JOIN users u2 ON c.user2_id = u2.id
      LEFT JOIN LATERAL (
        SELECT content, created_at, sender_id FROM direct_messages 
        WHERE conversation_id = c.id ORDER BY created_at DESC LIMIT 1
      ) dm ON true
      WHERE c.user1_id = ${userId} OR c.user2_id = ${userId}
      ORDER BY COALESCE(dm.created_at, c.created_at) DESC
    `);
    return rows.rows;
  }

  async getMessages(conversationId: number, limit: number = 50, before?: number): Promise<any[]> {
    let query;
    if (before) {
      query = sql`
        SELECT dm.*, u.first_name as sender_first_name, u.last_name as sender_last_name, u.profile_image_url as sender_image
        FROM direct_messages dm
        JOIN users u ON dm.sender_id = u.id
        WHERE dm.conversation_id = ${conversationId} AND dm.id < ${before}
        ORDER BY dm.created_at DESC LIMIT ${limit}
      `;
    } else {
      query = sql`
        SELECT dm.*, u.first_name as sender_first_name, u.last_name as sender_last_name, u.profile_image_url as sender_image
        FROM direct_messages dm
        JOIN users u ON dm.sender_id = u.id
        WHERE dm.conversation_id = ${conversationId}
        ORDER BY dm.created_at DESC LIMIT ${limit}
      `;
    }
    const rows = await db.execute(query);
    const list = rows.rows as any[];
    list.sort((a, b) => (a.id ?? 0) - (b.id ?? 0));
    return list;
  }

  async createMessage(conversationId: number, senderId: string, content: string): Promise<DirectMessage> {
    const now = new Date();
    const [msg] = await db.insert(directMessages).values({ conversationId, senderId, content, createdAt: now }).returning();
    await db.update(conversations).set({ lastMessageAt: new Date() }).where(eq(conversations.id, conversationId));
    return msg;
  }

  async markMessagesRead(conversationId: number, userId: string): Promise<void> {
    await db.update(directMessages).set({ isRead: true })
      .where(and(
        eq(directMessages.conversationId, conversationId),
        sql`${directMessages.senderId} != ${userId}`,
        eq(directMessages.isRead, false)
      ));
  }

  async getUnreadMessageCount(userId: string): Promise<number> {
    const result = await db.execute(sql`
      SELECT COUNT(*)::int as count FROM direct_messages dm
      JOIN conversations c ON dm.conversation_id = c.id
      WHERE (c.user1_id = ${userId} OR c.user2_id = ${userId})
        AND dm.sender_id != ${userId}
        AND dm.is_read = false
    `);
    return (result.rows[0] as any)?.count || 0;
  }

  // Music Stories
  async createMusicStory(data: CreateMusicStoryRequest & { userId: string; musicId: number }): Promise<MusicStory> {
    const [story] = await db.insert(musicStories).values(data).returning();
    return story;
  }

  async getMusicStoriesByMusicId(musicId: number): Promise<any[]> {
    const results = await db
      .select({ story: musicStories, user: users })
      .from(musicStories)
      .leftJoin(users, eq(musicStories.userId, users.id))
      .where(eq(musicStories.musicId, musicId))
      .orderBy(desc(musicStories.createdAt));
    return results;
  }

  async updateMusicStory(id: number, content: string): Promise<MusicStory | undefined> {
    const [updated] = await db.update(musicStories).set({ content }).where(eq(musicStories.id, id)).returning();
    return updated;
  }

  async deleteMusicStory(id: number): Promise<void> {
    await db.delete(storyComments).where(eq(storyComments.storyId, id));
    await db.delete(musicStories).where(eq(musicStories.id, id));
  }

  // Story Comments
  async createStoryComment(data: CreateStoryCommentRequest & { userId: string; storyId: number }): Promise<StoryComment> {
    const [comment] = await db.insert(storyComments).values(data).returning();
    return comment;
  }

  async getStoryComments(storyId: number): Promise<any[]> {
    const results = await db
      .select({ comment: storyComments, user: users })
      .from(storyComments)
      .leftJoin(users, eq(storyComments.userId, users.id))
      .where(eq(storyComments.storyId, storyId))
      .orderBy(desc(storyComments.createdAt));
    return results;
  }

  async deleteStoryComment(id: number): Promise<void> {
    await db.delete(storyComments).where(eq(storyComments.id, id));
  }

  // Site announcement popup (admin)
  async getActiveSiteAnnouncement(): Promise<{ id: number; content: string; imageUrl: string | null; startsAt: Date; endsAt: Date } | null> {
    const now = new Date();
    const [row] = await db.select().from(siteAnnouncements)
      .where(and(lte(siteAnnouncements.startsAt, now), gte(siteAnnouncements.endsAt, now)))
      .orderBy(desc(siteAnnouncements.createdAt))
      .limit(1);
    return row ? { id: row.id, content: row.content, imageUrl: row.imageUrl ?? null, startsAt: row.startsAt, endsAt: row.endsAt } : null;
  }

  async getSiteAnnouncements(): Promise<{ id: number; content: string; imageUrl: string | null; startsAt: Date; endsAt: Date; createdAt: Date }[]> {
    return db.select({
      id: siteAnnouncements.id,
      content: siteAnnouncements.content,
      imageUrl: siteAnnouncements.imageUrl,
      startsAt: siteAnnouncements.startsAt,
      endsAt: siteAnnouncements.endsAt,
      createdAt: siteAnnouncements.createdAt,
    }).from(siteAnnouncements).orderBy(desc(siteAnnouncements.createdAt)).limit(50);
  }

  async saveSiteAnnouncement(data: { content: string; imageUrl?: string | null; startsAt: Date; endsAt: Date }): Promise<{ id: number; content: string; imageUrl: string | null; startsAt: Date; endsAt: Date }> {
    const inserted = await db.insert(siteAnnouncements).values({
      content: data.content,
      imageUrl: data.imageUrl ?? null,
      startsAt: data.startsAt,
      endsAt: data.endsAt,
      updatedAt: new Date(),
    }).returning();
    const row = inserted[0];
    if (!row) throw new Error("Insert did not return row");
    return { id: row.id, content: row.content, imageUrl: row.imageUrl ?? null, startsAt: row.startsAt, endsAt: row.endsAt };
  }

  async deleteSiteAnnouncement(id: number): Promise<void> {
    await db.delete(siteAnnouncements).where(eq(siteAnnouncements.id, id));
  }
}

export const storage = new DatabaseStorage();
