import { db } from "./db";
import path from "path";
import { existsSync } from "fs";
import { 
  music, likes, follows, reviews, playlists, playlistMusic, posts, postComments, notifications, copyrightReports, tips, purchases, creditTransactions, withdrawals, streamingLogs, creditRefundRequests,
  analyticsVisits, analyticsConversionEvents, siteAnnouncements, guideVideos, curatedPlaylists, curatedPlaylistMusic,
  distributionReleases, distributionSplits, distributionEarningsLedger, distributionPayouts,
  radioChannels, radioChatMessages, radioSongRequests, radioChannelStaff,
  conversations, directMessages, musicStories, storyComments, userBlocks, userReports,
  pushSubscriptions,
  type InsertMusic, type UserType, type Music, type CreateReviewRequest, type CreatePlaylistRequest,
  type CreatePostRequest, type CreatePostCommentRequest, type NotificationResponse, type CopyrightReport, type CreateCopyrightReportRequest,
  type Tip, type Purchase, type Conversation, type DirectMessage,
  type MusicStory, type StoryComment, type CreateMusicStoryRequest, type CreateStoryCommentRequest,
  type DistributionRelease
} from "@shared/schema";
import { eq, desc, asc, and, or, inArray, notInArray, sql, count, lte, gte, lt, ne, isNotNull, type SQL } from "drizzle-orm";
import type { MusicWithUploaderTier } from "@shared/schema";
import { users, payments, aiMusicUsage } from "@shared/models/auth";
import { PAID_SUBSCRIPTION_TIER_IDS } from "@shared/subscription-plan-pricing";
import {
  FREE_AI_MUSIC_LIMIT_PER_MONTH,
  getAiMusicMonthlyUsageLimit,
  getAiMusicUsagePeriodKey,
  isUserPaidSubscriptionActive,
} from "@shared/subscription-entitlements";
import { syncSubscriptionAiWalletForPaidUser } from "./subscription-ai-wallet";
import { ANALYTICS_DWELL_HEARTBEAT_PATH } from "@shared/analytics-constants";

/**
 * 곡 목록 장르 필터·업로드 UI·송출실 곡검색과 동일한 기준.
 * 대분류 키를 선택하면 이 배열에 포함된 music.genre 값이 모두 매칭됩니다.
 */
/** DistroKid 등 external_release_ref 에서 UPC 숫자만 추출 (예: distrokid:825628673111) */
function extractUpcFromExternalReleaseRef(ref: string | null | undefined): string | null {
  if (!ref) return null;
  const t = ref.trim();
  if (!t) return null;
  const tail = t.includes(":") ? t.slice(t.lastIndexOf(":") + 1).trim() : t;
  if (/^\d{8,14}$/.test(tail)) return tail;
  return null;
}

export const MUSIC_GENRE_GROUPS: Record<string, string[]> = {
  "팝뮤직": ["팝뮤직", "팝발라드", "댄스팝", "일렉트로팝", "인디팝", "틴팝", "신스팝", "드림팝", "시티팝"],
  "국내가요": ["국내가요", "케이팝", "발라드", "트로트", "국내OST", "어쿠스틱가요", "K-POP", "KPOP"],
  "월드뮤직": ["월드뮤직", "라틴음악", "아프로비트", "레게", "플라멩코", "켈틱", "인도음악", "중동음악"],
  "경음악": ["경음악", "재즈", "클래식", "뉴에이지", "태교음악", "카페음악", "힐링"],
  "찬양": ["찬양", "CCM", "워십", "복음성가"],
  "기타": ["기타"],
};

/** API `/api/music/genres`·UI 드롭다운용: 대분류+세부 전체 라벨 */
export function getCanonicalMusicGenreLabels(): string[] {
  const s = new Set<string>();
  for (const [, subs] of Object.entries(MUSIC_GENRE_GROUPS)) {
    for (const g of subs) s.add(g);
  }
  for (const main of Object.keys(MUSIC_GENRE_GROUPS)) {
    s.add(main);
  }
  return Array.from(s).sort((a, b) => a.localeCompare(b, "ko"));
}

/** 사이트 공지 본문: `content_translations[lang]`이 있으면 사용, 없으면 기본 `content` */
export function resolveSiteAnnouncementContentForLang(
  defaultContent: string,
  rawTranslations: unknown,
  lang?: string,
): string {
  if (!lang) return defaultContent;
  const translations: Record<string, string> =
    typeof rawTranslations === "string"
      ? (() => {
          try {
            return JSON.parse(rawTranslations) ?? {};
          } catch {
            return {};
          }
        })()
      : ((rawTranslations ?? {}) as Record<string, string>);
  const tr = translations[lang]?.trim();
  return tr || defaultContent;
}

export interface IStorage {
  // Music
  createMusic(musicData: InsertMusic & { userId: string }): Promise<Music>;
  getMusicList(genre?: string, search?: string, page?: number, limit?: number): Promise<{ data: MusicWithUploaderTier[]; total: number }>;
  /** 글로벌 배포(발매일·승인일 기준) 또는 Spotify 앨범 연동 곡 — 홈 「신곡」 */
  getHomeNewReleases(limit?: number): Promise<MusicWithUploaderTier[]>;
  getMusicById(id: number): Promise<Music | undefined>;
  getMusicByUser(userId: string): Promise<MusicWithUploaderTier[]>;
  
  updateMusic(id: number, data: { title?: string; artist?: string; genre?: string; tags?: string; lyrics?: string | null; isAi?: boolean; imageFilename?: string | null; price?: number; isDownloadable?: boolean; spotifyAlbumId?: string | null }): Promise<Music | undefined>;
  /** Spotify 해외 출시 항목과 동일한 사이트 음원 id (spotify_album_id 우선, 없으면 제목·대표 아티스트 퍼지 매칭) */
  resolveSiteMusicIdsForInternationalReleases(
    items: { spotifyAlbumId: string; title: string; artists: string }[],
  ): Promise<(number | null)[]>;
  /**
   * 해외 탭 병합용: 배포 완료(delivered/live) 유통 건의 Spotify 앨범 id 및 DistroKid UPC(외부 ref).
   * filterOwnerUserIds 가 있으면 해당 업로더(등록자)만, 없으면 전체.
   */
  getDistributionInternationalMergeSources(filterOwnerUserIds?: string[]): Promise<{ spotifyAlbumIds: string[]; upcs: string[] }>;
  /**
   * 배포 완료(delivered/live) + music.spotify_album_id 가 있는 건만.
   * Spotify API 없이 해외 탭 카드 메타(제목·아티스트·커버·링크)를 채울 때 사용.
   */
  getInternationalReleasesDbSeeds(filterOwnerUserIds?: string[]): Promise<
    {
      spotifyAlbumId: string;
      title: string;
      artists: string;
      imageUrl: string | null;
      releaseDate: string | null;
      musicId: number;
    }[]
  >;
  deleteMusic(id: number): Promise<void>;

  // Likes
  toggleLike(userId: string, musicId: number): Promise<boolean>;
  getLikedMusic(userId: string): Promise<Music[]>;
  isLiked(userId: string, musicId: number): Promise<boolean>;
  getMusicLikeCounts(): Promise<Record<number, number>>;
  getMusicLikeCount(musicId: number): Promise<number>;
  getMusicPlayCounts(): Promise<Record<number, number>>;

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
  incrementPostViewCount(id: number): Promise<boolean>;
  updatePost(id: number, userId: string, data: { title?: string; content?: string; category?: string | null; attachment?: string | null }): Promise<boolean>;
  deletePost(id: number, userId: string): Promise<boolean>;
  createPostComment(comment: CreatePostCommentRequest & { userId: string, postId: number }): Promise<any>;
  getPostComments(postId: number): Promise<any[]>;
  updatePostComment(id: number, userId: string, content: string): Promise<boolean>;
  deletePostComment(id: number, userId: string): Promise<boolean>;

  // Users
  getUserById(id: string): Promise<any | undefined>;
  updateUserProfile(userId: string, data: { firstName?: string; lastName?: string; profileImageUrl?: string; username?: string; allowDirectMessages?: boolean; notifyNewMusicEmail?: boolean; notifyNewMusicPush?: boolean; notifyActivityEmail?: boolean }): Promise<any | undefined>;

  // New music notifications (email + push)
  getUsersToNotifyForNewMusic(music: { id: number; title: string; artist: string; genre?: string | null; userId: string }): Promise<{ userId: string; email: string | null; notifyNewMusicEmail: boolean; notifyNewMusicPush: boolean }[]>;
  getPushSubscriptions(userId: string): Promise<{ id: number; endpoint: string; p256dh: string; auth: string }[]>;
  getPushSubscriptionsByUserIds(userIds: string[]): Promise<{ userId: string; endpoint: string; p256dh: string; auth: string }[]>;
  addPushSubscription(userId: string, sub: { endpoint: string; p256dh: string; auth: string }): Promise<void>;

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
  deleteNotification(id: number, userId: string): Promise<boolean>;

  // Admin
  getAdminStats(): Promise<{
    totalUsers: number;
    totalMusic: number;
    totalLikes: number;
    totalComments: number;
  }>;
  recordVisit(visitorKey: string, path: string, extra?: { userId?: string; ipHash?: string; countryCode?: string; region?: string; deviceType?: string; refererDomain?: string; utmSource?: string }): Promise<void>;
  /** 최근 N분 analytics_visits 기준 고유 방문자( visitor_key )별 최신 활동 — 관리자 현재 접속자 목록 */
  getCurrentVisitorsDetail(lastMinutes: number): Promise<{
    count: number;
    visitors: { userId: string | null; displayName: string; lastPath: string | null; lastSeenAt: string }[];
  }>;
  getAdminUserAccessLogs(userId: string, limit: number, offset: number): Promise<{ logs: { id: number; visitedAt: Date; path: string; deviceType: string | null }[]; total: number }>;
  /** 일자(Asia/Seoul)별 방문자 단위: 첫·마지막 페이지뷰 시각 및 그 간격(초), 페이지뷰 수, GeoIP(국가·지역) */
  getAdminVisitorSessionsByDate(dateStr: string, limit: number, offset: number): Promise<{
    rows: {
      userId: string | null;
      visitorKey: string;
      firstAt: Date;
      lastAt: Date;
      durationSeconds: number;
      pageViews: number;
      countryCode: string | null;
      region: string | null;
      email: string | null;
      username: string | null;
      firstName: string | null;
      lastName: string | null;
      subscriptionTier: string | null;
    }[];
    total: number;
  }>;
  checkAnalyticsTableExists(): Promise<boolean>;
  checkConversionEventsTableExists(): Promise<boolean>;
  recordConversionEvent(visitorKey: string, eventName: string, meta?: Record<string, unknown> | null): Promise<void>;
  getAdminSignupFunnelCounts(days: number): Promise<{ eventName: string; count: number }[]>;
  getAdminAnalytics(): Promise<{ dailyVisitors: number; totalVisitors: number; pageViewsToday: number; pageViewsTotal: number }>;
  getAdminStatsByRegion(): Promise<{ countryCode: string | null; region: string | null; count: number }[]>;
  getAdminStatsByDevice(): Promise<{ deviceType: string | null; count: number }[]>;
  getAdminStatsBySource(): Promise<{ source: string; count: number }[]>;
  getAdminAnalyticsTrend(days: number): Promise<{ date: string; uniqueVisitors: number; pageViews: number }[]>;
  getTotalCreditsCharged(): Promise<number>;
  /** `payments` 테이블 기준: status=paid 구독·크레딧 충전 원화 합계, 미입금(pending bank·별도 페이업 카드) 합계(기간 무관) */
  getAdminRevenueSummary(filters?: {
    start?: Date;
    endExclusive?: Date;
    endInclusive?: Date;
  }): Promise<{
    subscriptionByPlan: { plan: string; totalWon: number; count: number }[];
    subscriptionTotalWon: number;
    subscriptionCount: number;
    creditChargeTotalWon: number;
    creditChargeCount: number;
    paidGrandTotalWon: number;
    pendingSubscriptionWon: number;
    pendingSubscriptionCount: number;
    pendingCreditChargeWon: number;
    pendingCreditChargeCount: number;
    /** 페이업 카드 구독: PG 승인 전·복귀 실패 등으로 `payment_key=payup_direct` 인 pending (routes 의 PAYUP_SUBSCRIPTION_PAYMENT_KEY 와 동일) */
    pendingPayupSubscriptionWon: number;
    pendingPayupSubscriptionCount: number;
    pendingTotalWon: number;
  }>;
  /** 관리자: 결제 완료 건 목록(회원 정보 포함). kind로 구독/크레딧 필터 */
  listAdminRevenuePayments(input: {
    dateFilters?: { start?: Date; endExclusive?: Date; endInclusive?: Date };
    kind: "all" | "subscription" | "credit";
    limit: number;
    offset: number;
  }): Promise<{
    total: number;
    rows: {
      id: string;
      userId: string;
      orderId: string;
      amount: number;
      plan: string | null;
      billingPeriod: string | null;
      paymentKey: string | null;
      /** 승인 완료 시 payup_meta.txnId (payment_key 가 비정상일 때 PG취소 반영 판별용) */
      payupMetaTxnId: string | null;
      createdAt: Date;
      email: string | null;
      firstName: string | null;
      lastName: string | null;
      username: string | null;
      paymentKind: "subscription" | "credit";
    }[];
  }>;
  createDistributionRelease(input: { ownerUserId: string; musicId: number; releaseTitle: string; artistName: string; rightsConfirmed: boolean; releaseDate?: Date | null }): Promise<DistributionRelease>;
  listMyDistributionReleases(ownerUserId: string): Promise<DistributionRelease[]>;
  submitDistributionRelease(ownerUserId: string, releaseId: number): Promise<void>;
  listAdminDistributionReleases(status?: string): Promise<DistributionRelease[]>;
  reviewDistributionRelease(input: { adminUserId: string; releaseId: number; action: "approved" | "rejected"; reason?: string | null }): Promise<DistributionRelease | undefined>;
  /** Platform Readiness mode: release 오디오/커버 로컬 존재 및 기본 포맷 규격 체크 */
  runDistributionQc(input: { adminUserId: string; releaseId: number }): Promise<DistributionRelease | undefined>;
  /** Admin: 외부 릴리즈 ref 수동 연결(Distributor API 없을 때 수동 업로드 후 필요) */
  linkDistributionReleaseExternalRef(input: {
    adminUserId: string;
    releaseId: number;
    externalReleaseRef: string;
    status: "delivered" | "live";
  }): Promise<DistributionRelease | undefined>;
  addDistributionEarning(input: { releaseId: number; periodMonth: string; grossAmount: number; platformFeeAmount?: number; source?: string | null; externalRef?: string | null }): Promise<{ ledgerRows: number; netAmount: number; platformAmount: number; distributedAmount: number }>;
  /** 해당 릴리즈·정산월에 원장이 이미 있으면 true (일괄 반입 중복 방지) */
  hasDistributionLedgerForReleaseMonth(releaseId: number, periodMonth: string): Promise<boolean>;
  getDistributionBalanceSummary(userId: string): Promise<{ totalEarned: number; totalPaid: number; available: number }>;
  getActiveSiteAnnouncement(lang?: string): Promise<{ id: number; content: string; imageUrl: string | null; textSize: string | null; startsAt: Date; endsAt: Date } | null>;
  getSiteAnnouncements(lang?: string): Promise<{ id: number; content: string; imageUrl: string | null; showAsPopup: boolean; startsAt: Date; endsAt: Date; createdAt: Date }[]>;
  saveSiteAnnouncement(data: { content: string; imageUrl?: string | null; textSize?: string | null; showAsPopup?: boolean; startsAt: Date; endsAt: Date }): Promise<{ id: number; content: string; imageUrl: string | null; startsAt: Date; endsAt: Date }>;
  updateSiteAnnouncementTranslations(id: number, translations: Record<string, string>): Promise<void>;
  deleteSiteAnnouncement(id: number): Promise<void>;
  getGuideVideos(): Promise<{ id: number; title: string; description: string | null; youtubeUrl: string; sortOrder: number | null; createdAt: Date; updatedAt: Date }[]>;
  createGuideVideo(data: { title: string; description?: string; youtubeUrl: string; sortOrder?: number | null }): Promise<void>;
  updateGuideVideo(id: number, data: { title: string; description?: string; youtubeUrl: string; sortOrder?: number | null }): Promise<void>;
  deleteGuideVideo(id: number): Promise<void>;
  getCuratedPlaylists(): Promise<{ id: number; name: string; description: string | null; slug: string; sortOrder: number; coverImageFilename: string | null }[]>;
  getCuratedPlaylistBySlug(slug: string): Promise<{ id: number; name: string; description: string | null; slug: string; tracks: MusicWithUploaderTier[] } | null>;
  getSimilarMusic(musicId: number, limit?: number): Promise<MusicWithUploaderTier[]>;
  getWeeklyTopTracks(limit?: number): Promise<(MusicWithUploaderTier & { playCount: number; totalSeconds: number })[]>;
  getRecentMusic(days?: number, limit?: number): Promise<MusicWithUploaderTier[]>;
  getWeeklyTopArtist(limitTracks?: number): Promise<{ userId: string; firstName: string | null; lastName: string | null; profileImageUrl: string | null; playCount: number; totalSeconds: number; tracks: MusicWithUploaderTier[] } | null>;
  getWeeklyTopArtists(limit?: number): Promise<Array<{ userId: string; firstName: string | null; lastName: string | null; profileImageUrl: string | null; playCount: number; totalSeconds: number }>>;
  createCuratedPlaylist(data: { name: string; description?: string | null; slug: string }): Promise<{ id: number }>;
  updateCuratedPlaylist(id: number, data: { name?: string; description?: string | null; slug?: string; sortOrder?: number }): Promise<void>;
  deleteCuratedPlaylist(id: number): Promise<void>;
  setCuratedPlaylistTracks(curatedPlaylistId: number, musicIds: number[]): Promise<void>;
  getCuratedPlaylistTrackIds(curatedPlaylistId: number): Promise<number[]>;

  // Radio channels (베니방송국)
  createRadioChannel(data: { ownerId: string; name: string; slug: string; description?: string | null; homepageUrl?: string | null; homeTickerText?: string | null; coverFilename?: string | null }): Promise<{ id: number }>;
  getRadioChannelByOwnerId(ownerId: string): Promise<{ id: number; name: string; slug: string; description: string | null; homepageUrl: string | null; homeTickerText: string | null; coverFilename: string | null; status: string; visibility: string; nowPlayingMusicId: number | null; nowPlayingStartedAt: Date | null } | undefined>;
  getRadioChannelBySlug(slug: string): Promise<{ id: number; ownerId: string; name: string; slug: string; description: string | null; homepageUrl: string | null; homeTickerText: string | null; coverFilename: string | null; status: string; visibility: string; nowPlayingMusicId: number | null; nowPlayingStartedAt: Date | null; currentHostId: string | null; currentHostUsername?: string | null; scheduledStartAt: Date | null; scheduledEndAt: Date | null; notice: string | null; playlistSnapshot: { musicIds: number[]; durationsSeconds: number[]; currentIndex: number } | null } | undefined>;
  listLiveRadioChannels(): Promise<{
    id: number;
    ownerId: string;
    name: string;
    slug: string;
    description: string | null;
    coverFilename: string | null;
    scheduledStartAt: Date | null;
    scheduledEndAt: Date | null;
    notice: string | null;
    updatedAt: Date | null;
    ownerDisplayName: string;
    homeTickerText: string | null;
  }[]>;
  listLiveRadioChannelsForAutoAdvance(): Promise<{ id: number; slug: string; nowPlayingMusicId: number; nowPlayingStartedAt: Date; playlistSnapshot: { musicIds: number[]; durationsSeconds: number[]; currentIndex: number } }[]>;
  listAllRadioChannels(): Promise<{
    id: number;
    ownerId: string;
    name: string;
    slug: string;
    status: string;
    description: string | null;
    coverFilename: string | null;
    ownerUsername: string | null;
    ownerDisplayName: string;
    updatedAt: Date | null;
  }[]>;
  updateRadioChannel(id: number, data: { name?: string; slug?: string; description?: string | null; homepageUrl?: string | null; homeTickerText?: string | null; coverFilename?: string | null; status?: string; visibility?: string; nowPlayingMusicId?: number | null; nowPlayingStartedAt?: Date | null; nowPlayingObjectPath?: string | null; nowPlayingTempDurationSeconds?: number | null; nowPlayingTempNextSnapshotIndex?: number | null; currentHostId?: string | null; scheduledStartAt?: Date | null; scheduledEndAt?: Date | null; notice?: string | null; playlistSnapshot?: { musicIds: number[]; durationsSeconds: number[]; currentIndex: number } | null }): Promise<void>;
  deleteRadioChannel(id: number): Promise<void>;

  createRadioChatMessage(channelId: number, userId: string, content: string): Promise<{ id: number; channelId: number; userId: string; content: string; createdAt: Date }>;
  getRadioChatMessages(channelId: number, limit?: number): Promise<{ id: number; channelId: number; userId: string; content: string; createdAt: Date; username?: string | null }[]>;
  deleteRadioChatMessagesByChannel(channelId: number): Promise<void>;
  deleteRadioChatMessagesOlderThanDays(days: number): Promise<void>;
  createRadioSongRequest(data: { channelId: number; userId: string; musicId?: number | null; title?: string | null; artist?: string | null; message?: string | null }): Promise<{ id: number; channelId: number; userId: string; musicId: number | null; title: string | null; artist: string | null; message: string | null; status: string; sortOrder: number; createdAt: Date }>;
  getRadioSongRequestsByChannel(channelId: number, status?: string): Promise<{ id: number; channelId: number; userId: string; musicId: number | null; title: string | null; artist: string | null; message: string | null; status: string; sortOrder: number; createdAt: Date; musicTitle?: string | null; musicArtist?: string | null }[]>;
  updateRadioSongRequest(id: number, channelId: number, data: { status?: string; sortOrder?: number }): Promise<void>;

  getRadioChannelStaff(channelId: number): Promise<{ id: number; channelId: number; userId: string; role: string; username?: string | null }[]>;
  isRadioChannelStaff(channelId: number, userId: string): Promise<boolean>;
  addRadioChannelStaff(channelId: number, userId: string, role: string): Promise<void>;
  removeRadioChannelStaff(channelId: number, userId: string): Promise<void>;
  getUserIdByUsername(username: string): Promise<string | undefined>;

  getAllUsers(search?: string, limit?: number, offset?: number): Promise<{ rows: any[]; total: number }>;
  /** 관리자: 접속 로그와 회원 목록 불일치 조사용 */
  findUserForAdminLookup(params: { email?: string; userId?: string }): Promise<any | null>;
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
  /** 관리자: 회원별 지갑·크레딧 거래·결제(구독·크레딧충전) 요약 */
  getAdminUserWalletDetail(
    userId: string,
    input: { txLimit?: number; txOffset?: number; payLimit?: number; payOffset?: number },
  ): Promise<{
    user: {
      id: string;
      email: string | null;
      username: string | null;
      firstName: string | null;
      lastName: string | null;
      role: string | null;
      credits: number | null;
      subscriptionTier: string | null;
      subscriptionExpiresAt: Date | null;
      subscriptionPlan: string | null;
      subscriptionEntitlements: unknown;
    };
    creditSummary: { totalCreditsIn: number; totalCreditsOut: number; currentBalance: number };
    creditTransactions: { total: number; rows: any[] };
    payments: { total: number; rows: any[] };
    /** 구독 월 AI 한도 vs 충전 지갑(users.credits)은 별개 */
    aiMusicMonthly: {
      periodMonth: string;
      limit: number;
      used: number;
      unit: "songs" | "credits" | "won" | "unlimited";
      /** 활성 유료 구독 지갑 경로만: 플랜 월 공급가 합(부가세 제외) — basic 단일이면 9000 */
      planGrantWon?: number | null;
      /** 구독 AI 이월 지갑 잔액(원). limit(총 한도) ≈ used + walletRemaining 아님 — limit = walletRemaining + used */
      walletRemainingWon?: number | null;
    };
  } | null>;

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

  // Block & Report
  blockUser(blockerId: string, blockedId: string): Promise<void>;
  unblockUser(blockerId: string, blockedId: string): Promise<void>;
  getBlockedUserIds(userId: string): Promise<string[]>;
  isBlocked(blockerId: string, blockedId: string): Promise<boolean>;
  createUserReport(data: { reporterId: string; reportedUserId: string; reason: string; messageId?: number; conversationId?: number }): Promise<any>;
  getUserReportById(id: number): Promise<any | undefined>;
  getAllUserReports(status?: string): Promise<any[]>;
  updateUserReportStatus(id: number, status: string, adminNote?: string): Promise<void>;
}

function normalizeInternationalMatchString(s: string): string {
  return s
    .normalize("NFKC")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

function primaryArtistFromSpotifyArtists(artists: string): string {
  const first = artists.split(",")[0]?.trim() ?? "";
  return first || artists.trim();
}

/** Spotify 앨범명·사이트 곡명 비교용 — (feat. …), - Single 등 제거 */
function stripForIntlTitleMatch(s: string): string {
  let t = s.normalize("NFKC").trim();
  t = t.replace(/\s*\((feat|ft|featuring)[^)]*\)/gi, "");
  t = t.replace(/\s*\[(explicit|clean|radio edit|instrumental)[^\]]*\]/gi, "");
  t = t.replace(/\s*\(360[^)]*\)/gi, "");
  t = t.replace(/\s*-\s*(single|ep|deluxe edition|remaster(ed)?)\s*$/i, "");
  t = t.replace(/\s+/g, " ").trim();
  return t;
}

/** Spotify 아티스트 문자열을 쉼표·& 로 나눔 (콜라보·다중 표기) */
function spotifyArtistSegments(artists: string): string[] {
  const parts = artists.split(",").map((s) => s.trim()).filter(Boolean);
  const out: string[] = [];
  for (const p of parts) {
    for (const q of p.split(/\s*&\s*/)) {
      const t = q.trim();
      if (t) out.push(t);
    }
  }
  return [...new Set(out)];
}

/** 앨범/트랙명 변형 — 괄호 부제 제거, -·: 분할 등 */
function titleVariantsForIntl(raw: string): string[] {
  const seen = new Set<string>();
  const add = (s: string) => {
    const u = stripForIntlTitleMatch(s).trim();
    if (u.length > 0) seen.add(u);
  };
  add(raw);
  const base = stripForIntlTitleMatch(raw);
  const noParen = base.replace(/\s*\([^)]{1,56}\)\s*$/g, "").trim();
  if (noParen.length > 0 && noParen !== base) add(noParen);
  for (const seg of base.split(/\s*[-–—:]\s*/)) {
    const t = seg.trim();
    if (t.length >= 3) add(t);
  }
  return [...seen];
}

/**
 * 구두점·공백·버전 표기 차이 무시 비교용 키 (영문·숫자·한글 음절만 유지).
 * Spotify 앨범명 vs 사이트 곡명, ver.1 / ver1 / (Ver 2) 등 흡수.
 */
function compactKeyIntl(raw: string): string {
  let u = stripForIntlTitleMatch(raw);
  u = u.replace(/[''`´]/g, "");
  u = u.replace(/\bver\.?\s*(\d+)\b/gi, "ver$1");
  u = u.replace(/\bversion\s*(\d+)\b/gi, "ver$1");
  return normalizeInternationalMatchString(u).replace(/[^a-z0-9가-힣]/gi, "");
}

/** DB 컬럼용: 소문자·trim 후 영숫자·한글만 남김 (compactKeyIntl 과 동일 규칙) */
function sqlMusicTitleCompact() {
  return sql`regexp_replace(lower(trim(${music.title})), E'[^a-z0-9가-힣ㄱ-ㅎㅏ-ㅣ]', '', 'g')`;
}

function sqlMusicArtistCompact() {
  return sql`regexp_replace(lower(trim(${music.artist})), E'[^a-z0-9가-힣ㄱ-ㅎㅏ-ㅣ]', '', 'g')`;
}

export class DatabaseStorage implements IStorage {
  // Music
  async createMusic(musicData: InsertMusic & { userId: string }): Promise<Music> {
    const [newMusic] = await db.insert(music).values(musicData).returning();
    return newMusic;
  }

  async getMusicList(genre?: string, search?: string, page: number = 1, limit: number = 30): Promise<{ data: Music[]; total: number }> {
    const conditions = [];
    if (genre) {
      if (MUSIC_GENRE_GROUPS[genre]) {
        conditions.push(inArray(music.genre, MUSIC_GENRE_GROUPS[genre]));
      } else {
        conditions.push(eq(music.genre, genre));
      }
    }
    if (search) {
      conditions.push(sql`(${music.title} ILIKE ${`%${search}%`} OR ${music.artist} ILIKE ${`%${search}%`} OR ${music.genre} ILIKE ${`%${search}%`})`);
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
      aiProvider: music.aiProvider,
      freeAiSiteRestrictions: music.freeAiSiteRestrictions,
      price: music.price,
      isDownloadable: music.isDownloadable,
      userId: music.userId,
      spotifyAlbumId: music.spotifyAlbumId,
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
      const subscriptionPremium = (_uploaderTier === "pro" || _uploaderTier === "premium") && (_uploaderExpiresAt == null || new Date(_uploaderExpiresAt) > now);
      const isPremium = _uploaderRole === "admin" || subscriptionPremium;
      return { ...rest, uploaderSubscriptionTier: isPremium ? (_uploaderTier ?? "pro") : "free", uploaderDonationBadge: null } as MusicWithUploaderTier;
    });

    return { data, total };
  }

  async getHomeNewReleases(limit: number = 16): Promise<MusicWithUploaderTier[]> {
    const safeLimit = Math.min(50, Math.max(1, limit));
    const releaseStatuses = ["live", "delivered", "approved", "submitted"];

    const musicCols = {
      id: music.id,
      title: music.title,
      artist: music.artist,
      filename: music.filename,
      imageFilename: music.imageFilename,
      genre: music.genre,
      tags: music.tags,
      lyrics: music.lyrics,
      isAi: music.isAi,
      aiProvider: music.aiProvider,
      freeAiSiteRestrictions: music.freeAiSiteRestrictions,
      price: music.price,
      isDownloadable: music.isDownloadable,
      userId: music.userId,
      spotifyAlbumId: music.spotifyAlbumId,
      createdAt: music.createdAt,
    };

    const sortRelease = sql`coalesce(${distributionReleases.releaseDate}, ${distributionReleases.approvedAt}, ${distributionReleases.submittedAt}, ${music.createdAt})`;

    const rowsDr = await db
      .select({
        ...musicCols,
        _uploaderTier: users.subscriptionTier,
        _uploaderExpiresAt: users.subscriptionExpiresAt,
        _uploaderRole: users.role,
      })
      .from(music)
      .innerJoin(distributionReleases, eq(music.id, distributionReleases.musicId))
      .leftJoin(users, eq(music.userId, users.id))
      .where(
        and(
          inArray(distributionReleases.status, releaseStatuses),
          or(
            isNotNull(distributionReleases.releaseDate),
            isNotNull(distributionReleases.approvedAt),
            isNotNull(distributionReleases.submittedAt),
          ),
        ),
      )
      .orderBy(desc(sortRelease))
      .limit(safeLimit);

    const now = new Date();
    const toTiered = (rows: typeof rowsDr): MusicWithUploaderTier[] =>
      rows.map((r) => {
        const { _uploaderTier, _uploaderExpiresAt, _uploaderRole, ...rest } = r as (typeof rowsDr)[0] & {
          _uploaderTier: string | null;
          _uploaderExpiresAt: Date | string | null;
          _uploaderRole: string | null;
        };
        const subscriptionPremium =
          (_uploaderTier === "pro" || _uploaderTier === "premium") &&
          (_uploaderExpiresAt == null || new Date(_uploaderExpiresAt) > now);
        const isPremium = _uploaderRole === "admin" || subscriptionPremium;
        return {
          ...rest,
          uploaderSubscriptionTier: isPremium ? (_uploaderTier ?? "pro") : "free",
          uploaderDonationBadge: null,
        } as MusicWithUploaderTier;
      });

    let out = toTiered(rowsDr);
    const seen = new Set(out.map((m) => m.id));

    if (out.length < safeLimit) {
      const need = safeLimit - out.length;
      const excludeIds = [...seen];
      const spotifyWhere: SQL[] = [
        isNotNull(music.spotifyAlbumId),
        sql`trim(${music.spotifyAlbumId}) != ''`,
      ];
      if (excludeIds.length) spotifyWhere.push(notInArray(music.id, excludeIds));
      const rowsSp = await db
        .select({
          ...musicCols,
          _uploaderTier: users.subscriptionTier,
          _uploaderExpiresAt: users.subscriptionExpiresAt,
          _uploaderRole: users.role,
        })
        .from(music)
        .leftJoin(users, eq(music.userId, users.id))
        .where(and(...spotifyWhere))
        .orderBy(desc(music.createdAt))
        .limit(need);
      out = [...out, ...toTiered(rowsSp)];
    }

    return out.slice(0, safeLimit);
  }

  async getMusicById(id: number): Promise<Music | undefined> {
    const [found] = await db.select().from(music).where(eq(music.id, id));
    return found;
  }

  /** "이 곡을 좋아한 사람이 좋아한 다른 곡" — 좋아요 기반 추천 */
  async getSimilarMusicByLikes(musicId: number, limit: number = 8): Promise<MusicWithUploaderTier[]> {
    const safeLimit = Math.min(20, Math.max(1, limit));
    const idResult = await db.execute(sql`
      SELECT l2.music_id AS id
      FROM likes l1
      JOIN likes l2 ON l1.user_id = l2.user_id AND l2.music_id <> ${musicId}
      WHERE l1.music_id = ${musicId}
      GROUP BY l2.music_id
      ORDER BY COUNT(*) DESC
      LIMIT ${safeLimit}
    `);
    const ids = (idResult.rows as { id: number }[]).map((r) => r.id);
    if (ids.length === 0) return [];

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
      aiProvider: music.aiProvider,
      freeAiSiteRestrictions: music.freeAiSiteRestrictions,
      price: music.price,
      isDownloadable: music.isDownloadable,
      userId: music.userId,
      spotifyAlbumId: music.spotifyAlbumId,
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
      .where(inArray(music.id, ids));

    const orderMap = new Map(ids.map((id, i) => [id, i]));
    rows.sort((a, b) => (orderMap.get(a.id) ?? 999) - (orderMap.get(b.id) ?? 999));
    const now = new Date();
    return rows.map((r) => {
      const { _uploaderTier, _uploaderExpiresAt, _uploaderRole, ...rest } = r as (typeof rows)[0] & { _uploaderTier: string | null; _uploaderExpiresAt: Date | string | null; _uploaderRole: string | null };
      const subscriptionPremium = (_uploaderTier === "pro" || _uploaderTier === "premium") && (_uploaderExpiresAt == null || new Date(_uploaderExpiresAt) > now);
      const isPremium = _uploaderRole === "admin" || subscriptionPremium;
      return { ...rest, uploaderSubscriptionTier: isPremium ? (_uploaderTier ?? "pro") : "free", uploaderDonationBadge: null } as MusicWithUploaderTier;
    });
  }

  async getSimilarMusic(musicId: number, limit: number = 8): Promise<MusicWithUploaderTier[]> {
    const byLikes = await this.getSimilarMusicByLikes(musicId, limit);
    if (byLikes.length > 0) return byLikes;

    const current = await this.getMusicById(musicId);
    if (!current) return [];
    const safeLimit = Math.min(20, Math.max(1, limit));
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
      aiProvider: music.aiProvider,
      freeAiSiteRestrictions: music.freeAiSiteRestrictions,
      price: music.price,
      isDownloadable: music.isDownloadable,
      userId: music.userId,
      spotifyAlbumId: music.spotifyAlbumId,
      createdAt: music.createdAt,
    };
    const baseSelect = db
      .select({
        ...musicColumns,
        _uploaderTier: users.subscriptionTier,
        _uploaderExpiresAt: users.subscriptionExpiresAt,
        _uploaderRole: users.role,
      })
      .from(music)
      .leftJoin(users, eq(music.userId, users.id));

    // 1) 같은 세부 장르(예: 팝발라드) 우선
    let sameGenreRows: any[] = [];
    if (current.genre) {
      sameGenreRows = await baseSelect
        .where(and(ne(music.id, musicId), eq(music.genre, current.genre)))
        .orderBy(desc(music.createdAt))
        .limit(safeLimit);
    }

    // 2) 부족하면 같은 아티스트 곡으로 채우기 (장르 무관)
    let rows: any[] = sameGenreRows;
    if (rows.length < safeLimit) {
      const remaining = safeLimit - rows.length;
      const sameArtistRows = await baseSelect
        .where(and(ne(music.id, musicId), eq(music.userId, current.userId)))
        .orderBy(desc(music.createdAt))
        .limit(remaining);
      const existingIds = new Set(rows.map((r: any) => r.id));
      for (const r of sameArtistRows) {
        if (!existingIds.has((r as any).id)) {
          rows.push(r);
          existingIds.add((r as any).id);
        }
      }
    }

    const now = new Date();
    return rows.map((r) => {
      const { _uploaderTier, _uploaderExpiresAt, _uploaderRole, ...rest } = r as typeof rows[0] & { _uploaderTier: string | null; _uploaderExpiresAt: Date | string | null; _uploaderRole: string | null };
      const subscriptionPremium = (_uploaderTier === "pro" || _uploaderTier === "premium") && (_uploaderExpiresAt == null || new Date(_uploaderExpiresAt) > now);
      const isPremium = _uploaderRole === "admin" || subscriptionPremium;
      return { ...rest, uploaderSubscriptionTier: isPremium ? (_uploaderTier ?? "pro") : "free", uploaderDonationBadge: null } as MusicWithUploaderTier;
    });
  }

  async getWeeklyTopTracks(limit: number = 10): Promise<(MusicWithUploaderTier & { playCount: number; totalSeconds: number })[]> {
    const safeLimit = Math.min(50, Math.max(1, limit));
    const sqlResult = await db.execute(sql`
      SELECT
        m.id,
        m.title,
        m.artist,
        m.filename,
        m.image_filename,
        m.genre,
        m.tags,
        m.lyrics,
        m.is_ai,
        m.ai_provider,
        m.free_ai_site_restrictions,
        m.price,
        m.is_downloadable,
        m.user_id,
        m.spotify_album_id,
        m.created_at,
        u.subscription_tier AS uploader_subscription_tier,
        u.subscription_expires_at AS uploader_subscription_expires_at,
        u.role AS uploader_role,
        COUNT(sl.id)::int AS play_count,
        COALESCE(SUM(sl.duration_seconds), 0)::int AS total_seconds
      FROM streaming_logs sl
      JOIN music m ON sl.music_id = m.id
      LEFT JOIN users u ON m.user_id = u.id
      WHERE sl.created_at >= NOW() - INTERVAL '7 days'
      GROUP BY
        m.id, m.title, m.artist, m.filename, m.image_filename, m.genre, m.tags, m.lyrics,
        m.is_ai, m.ai_provider, m.free_ai_site_restrictions, m.price, m.is_downloadable, m.user_id, m.spotify_album_id, m.created_at,
        u.subscription_tier, u.subscription_expires_at, u.role
      ORDER BY play_count DESC, total_seconds DESC
      LIMIT ${safeLimit}
    `);

    const rows = sqlResult.rows as any[];
    const now = new Date();
    return rows.map((r) => {
      const subscriptionPremium =
        (r.uploader_subscription_tier === "pro" || r.uploader_subscription_tier === "premium") &&
        (r.uploader_subscription_expires_at == null || new Date(r.uploader_subscription_expires_at) > now);
      const isPremium = r.uploader_role === "admin" || subscriptionPremium;
      const base: MusicWithUploaderTier = {
        id: r.id,
        title: r.title,
        artist: r.artist,
        filename: r.filename,
        imageFilename: r.image_filename,
        genre: r.genre,
        tags: r.tags,
        lyrics: r.lyrics,
        isAi: r.is_ai,
        aiProvider: r.ai_provider ?? null,
        freeAiSiteRestrictions: Boolean(r.free_ai_site_restrictions),
        price: r.price,
        isDownloadable: r.is_downloadable,
        userId: r.user_id,
        spotifyAlbumId: r.spotify_album_id ?? null,
        createdAt: r.created_at,
        uploaderSubscriptionTier: isPremium ? (r.uploader_subscription_tier ?? "pro") : "free",
        uploaderDonationBadge: null,
      };
      return {
        ...base,
        playCount: Number(r.play_count || 0),
        totalSeconds: Number(r.total_seconds || 0),
      };
    });
  }

  async getRecentMusic(days: number = 7, limit: number = 12): Promise<MusicWithUploaderTier[]> {
    const safeDays = Math.min(90, Math.max(1, Math.floor(days)));
    const safeLimit = Math.min(50, Math.max(1, limit));
    const since = new Date();
    since.setDate(since.getDate() - safeDays);

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
      aiProvider: music.aiProvider,
      freeAiSiteRestrictions: music.freeAiSiteRestrictions,
      price: music.price,
      isDownloadable: music.isDownloadable,
      userId: music.userId,
      spotifyAlbumId: music.spotifyAlbumId,
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
      .where(gte(music.createdAt, since))
      .orderBy(desc(music.createdAt))
      .limit(safeLimit);

    let rows = await query;

    // 만약 최근 N일에 곡이 거의 없다면, 단순 최신곡으로 보정
    if (rows.length === 0) {
      rows = await db
        .select({
          ...musicColumns,
          _uploaderTier: users.subscriptionTier,
          _uploaderExpiresAt: users.subscriptionExpiresAt,
          _uploaderRole: users.role,
        })
        .from(music)
        .leftJoin(users, eq(music.userId, users.id))
        .orderBy(desc(music.createdAt))
        .limit(safeLimit);
    }

    const now = new Date();
    return rows.map((r) => {
      const { _uploaderTier, _uploaderExpiresAt, _uploaderRole, ...rest } = r as typeof rows[0] & { _uploaderTier: string | null; _uploaderExpiresAt: Date | string | null; _uploaderRole: string | null };
      const subscriptionPremium =
        (_uploaderTier === "pro" || _uploaderTier === "premium") &&
        (_uploaderExpiresAt == null || new Date(_uploaderExpiresAt) > now);
      const isPremium = _uploaderRole === "admin" || subscriptionPremium;
      return { ...rest, uploaderSubscriptionTier: isPremium ? (_uploaderTier ?? "pro") : "free", uploaderDonationBadge: null } as MusicWithUploaderTier;
    });
  }

  async getWeeklyTopArtist(limitTracks: number = 5): Promise<{ userId: string; firstName: string | null; lastName: string | null; profileImageUrl: string | null; playCount: number; totalSeconds: number; tracks: MusicWithUploaderTier[] } | null> {
    const safeLimitTracks = Math.min(20, Math.max(1, limitTracks));
    const result = await db.execute(sql`
      SELECT
        m.user_id AS user_id,
        u.first_name,
        u.last_name,
        u.profile_image_url,
        COUNT(sl.id)::int AS play_count,
        COALESCE(SUM(sl.duration_seconds), 0)::int AS total_seconds
      FROM streaming_logs sl
      JOIN music m ON sl.music_id = m.id
      LEFT JOIN users u ON m.user_id = u.id
      WHERE sl.created_at >= NOW() - INTERVAL '7 days'
      GROUP BY m.user_id, u.first_name, u.last_name, u.profile_image_url
      ORDER BY play_count DESC, total_seconds DESC
      LIMIT 1
    `);
    const row = result.rows[0] as any;
    if (!row || !row.user_id) return null;

    const artistId = String(row.user_id);
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
      aiProvider: music.aiProvider,
      freeAiSiteRestrictions: music.freeAiSiteRestrictions,
      price: music.price,
      isDownloadable: music.isDownloadable,
      userId: music.userId,
      spotifyAlbumId: music.spotifyAlbumId,
      createdAt: music.createdAt,
    };

    const trackRows = await db
      .select({
        ...musicColumns,
        _uploaderTier: users.subscriptionTier,
        _uploaderExpiresAt: users.subscriptionExpiresAt,
        _uploaderRole: users.role,
      })
      .from(music)
      .leftJoin(users, eq(music.userId, users.id))
      .where(eq(music.userId, artistId))
      .orderBy(desc(music.createdAt))
      .limit(safeLimitTracks);

    const now = new Date();
    const tracks: MusicWithUploaderTier[] = trackRows.map((r) => {
      const { _uploaderTier, _uploaderExpiresAt, _uploaderRole, ...rest } = r as typeof trackRows[0] & { _uploaderTier: string | null; _uploaderExpiresAt: Date | string | null; _uploaderRole: string | null };
      const subscriptionPremium =
        (_uploaderTier === "pro" || _uploaderTier === "premium") &&
        (_uploaderExpiresAt == null || new Date(_uploaderExpiresAt) > now);
      const isPremium = _uploaderRole === "admin" || subscriptionPremium;
      return { ...rest, uploaderSubscriptionTier: isPremium ? (_uploaderTier ?? "pro") : "free", uploaderDonationBadge: null } as MusicWithUploaderTier;
    });

    return {
      userId: artistId,
      firstName: row.first_name ?? null,
      lastName: row.last_name ?? null,
      profileImageUrl: row.profile_image_url ?? null,
      playCount: Number(row.play_count || 0),
      totalSeconds: Number(row.total_seconds || 0),
      tracks,
    };
  }

  async getWeeklyTopArtists(limit: number = 8): Promise<Array<{ userId: string; firstName: string | null; lastName: string | null; profileImageUrl: string | null; playCount: number; totalSeconds: number }>> {
    const safeLimit = Math.min(20, Math.max(1, limit));
    const result = await db.execute(sql`
      SELECT
        m.user_id AS user_id,
        u.first_name,
        u.last_name,
        u.profile_image_url,
        COUNT(sl.id)::int AS play_count,
        COALESCE(SUM(sl.duration_seconds), 0)::int AS total_seconds
      FROM streaming_logs sl
      JOIN music m ON sl.music_id = m.id
      LEFT JOIN users u ON m.user_id = u.id
      WHERE sl.created_at >= NOW() - INTERVAL '7 days'
      GROUP BY m.user_id, u.first_name, u.last_name, u.profile_image_url
      ORDER BY play_count DESC, total_seconds DESC
      LIMIT ${safeLimit}
    `);
    return (result.rows as any[])
      .map((row) => ({
        userId: String(row.user_id ?? ""),
        firstName: row.first_name ?? null,
        lastName: row.last_name ?? null,
        profileImageUrl: row.profile_image_url ?? null,
        playCount: Number(row.play_count || 0),
        totalSeconds: Number(row.total_seconds || 0),
      }))
      .filter((a) => a.userId.length > 0);
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
      aiProvider: music.aiProvider,
      freeAiSiteRestrictions: music.freeAiSiteRestrictions,
      price: music.price,
      isDownloadable: music.isDownloadable,
      userId: music.userId,
      spotifyAlbumId: music.spotifyAlbumId,
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
      const subscriptionPremium = (_uploaderTier === "pro" || _uploaderTier === "premium") && (_uploaderExpiresAt == null || new Date(_uploaderExpiresAt) > now);
      const isPremium = _uploaderRole === "admin" || subscriptionPremium;
      return { ...rest, uploaderSubscriptionTier: isPremium ? (_uploaderTier ?? "pro") : "free", uploaderDonationBadge: null } as MusicWithUploaderTier;
    });
  }

  async updateMusic(
    id: number,
    data: {
      title?: string;
      artist?: string;
      genre?: string;
      tags?: string;
      lyrics?: string | null;
      isAi?: boolean;
      imageFilename?: string | null;
      price?: number;
      isDownloadable?: boolean;
      spotifyAlbumId?: string | null;
      freeAiSiteRestrictions?: boolean;
    },
  ): Promise<Music | undefined> {
    const [updated] = await db.update(music).set(data).where(eq(music.id, id)).returning();
    return updated;
  }

  /** Spotify 앨범명·아티스트와 사이트 music 행 퍼지 매칭 (제목 변형·아티스트 & 분리·아티스트 없는 초장문 제목) */
  private async findMusicIdFuzzyInternationalMatch(title: string, artists: string): Promise<number | null> {
    const segments = spotifyArtistSegments(artists);
    const toTry =
      segments.length > 0 ? segments : [primaryArtistFromSpotifyArtists(artists)].filter(Boolean);
    const variants = titleVariantsForIntl(title);
    for (const variant of variants) {
      for (const seg of toTry) {
        const id = await this.findMusicIdFuzzyInternationalMatchForArtist(variant, seg);
        if (id != null) return id;
      }
    }
    for (const v of variants) {
      const nt = normalizeInternationalMatchString(v);
      if (nt.length >= 11) {
        const id = await this.findMusicIdTitleOnlyExact(nt);
        if (id != null) return id;
      }
    }
    for (const v of variants) {
      const ck = compactKeyIntl(v);
      if (ck.length >= 18) {
        const id = await this.findMusicIdTitleOnlyCompact(ck);
        if (id != null) return id;
      }
    }
    return null;
  }

  /** 제목 압축 키만 완전 일치 — 긴 제목만(동명곡 완화), 아티스트 무관 */
  private async findMusicIdTitleOnlyCompact(ck: string): Promise<number | null> {
    const dbT = sqlMusicTitleCompact();
    const rows = await db
      .select({ id: music.id })
      .from(music)
      .where(sql`${dbT} = ${ck}`)
      .orderBy(desc(music.createdAt))
      .limit(1);
    return rows[0]?.id ?? null;
  }

  /** 아티스트 매칭 없이 제목만 완전 일치 — 제목이 충분히 길 때만(동명 단곡 오탐 완화) */
  private async findMusicIdTitleOnlyExact(nt: string): Promise<number | null> {
    const dbTitle = sql`regexp_replace(lower(trim(${music.title})), E'\\s+', ' ', 'g')`;
    const rows = await db
      .select({ id: music.id })
      .from(music)
      .where(sql`${dbTitle} = ${nt}`)
      .orderBy(desc(music.createdAt))
      .limit(1);
    return rows[0]?.id ?? null;
  }

  private async findMusicIdFuzzyInternationalMatchForArtist(title: string, singleArtist: string): Promise<number | null> {
    const nt = normalizeInternationalMatchString(stripForIntlTitleMatch(title));
    const na = normalizeInternationalMatchString(singleArtist);
    if (!nt || !na) return null;

    const dbTitle = sql`regexp_replace(lower(trim(${music.title})), E'\\s+', ' ', 'g')`;
    const ar = sql`regexp_replace(lower(trim(${music.artist})), E'\\s+', ' ', 'g')`;
    const artistMatchStrict = or(
      sql`${ar} = ${na}`,
      sql`${ar} LIKE ${`${na}%`}`,
      sql`${na} LIKE concat(${ar}, '%')`,
    )!;
    const artistMatch =
      na.length >= 4 ? or(artistMatchStrict, sql`strpos(${ar}, ${na}) > 0`)! : artistMatchStrict;

    // 1) 제목 정확 일치 (동명 다수면 최신 1건)
    const exactRows = await db
      .select({ id: music.id })
      .from(music)
      .where(and(sql`${dbTitle} = ${nt}`, artistMatch))
      .orderBy(desc(music.createdAt))
      .limit(1);
    if (exactRows.length > 0) return exactRows[0].id;

    // 2) 한쪽이 다른 쪽으로 시작(싱글·트렁케이션·부제 차이)
    const prefixMatch = or(
      sql`strpos(${dbTitle}, ${nt}) = 1`,
      and(sql`char_length(${dbTitle}) >= 6`, sql`strpos(${nt}, ${dbTitle}) = 1`)!,
    )!;
    const prefixRows = await db
      .select({ id: music.id })
      .from(music)
      .where(and(prefixMatch, artistMatch))
      .orderBy(desc(music.createdAt))
      .limit(1);
    if (prefixRows.length > 0) return prefixRows[0].id;

    // 3) 한쪽 문자열이 다른 쪽에 포함 (긴 쪽이 짧은 쪽을 포함 — 오탐 줄이기 위해 최소 길이)
    if (nt.length < 5) return null;
    const containMatch = or(sql`strpos(${dbTitle}, ${nt}) > 0`, sql`strpos(${nt}, ${dbTitle}) > 0`)!;
    const containRows = await db
      .select({ id: music.id })
      .from(music)
      .where(and(containMatch, artistMatch))
      .orderBy(desc(music.createdAt))
      .limit(1);
    if (containRows.length > 0) return containRows[0].id;

    const compactId = await this.findMusicIdCompactIntlMatch(title, singleArtist);
    if (compactId != null) return compactId;

    return null;
  }

  /**
   * 구두점·대소문·공백 제거 후 제목·아티스트 비교.
   * 사이트 `artist`에 괄호/부가 표기가 있어도 strpos 로 잡음.
   */
  private async findMusicIdCompactIntlMatch(title: string, singleArtist: string): Promise<number | null> {
    const ckT = compactKeyIntl(title);
    const ckA = compactKeyIntl(singleArtist);
    if (ckT.length < 5 || ckA.length < 3) return null;

    const dbT = sqlMusicTitleCompact();
    const dbA = sqlMusicArtistCompact();

    const artistOk =
      ckA.length >= 5
        ? or(sql`${dbA} = ${ckA}`, sql`strpos(${dbA}, ${ckA}) > 0`, sql`strpos(${ckA}, ${dbA}) > 0`)!
        : or(sql`${dbA} = ${ckA}`, sql`strpos(${dbA}, ${ckA}) > 0`)!;

    const exactT = await db
      .select({ id: music.id })
      .from(music)
      .where(and(sql`${dbT} = ${ckT}`, artistOk))
      .orderBy(desc(music.createdAt))
      .limit(1);
    if (exactT.length > 0) return exactT[0].id;

    if (ckT.length >= 6) {
      const titleLoose = or(sql`strpos(${dbT}, ${ckT}) > 0`, sql`strpos(${ckT}, ${dbT}) > 0`)!;
      const loose = await db
        .select({ id: music.id })
        .from(music)
        .where(and(titleLoose, artistOk))
        .orderBy(desc(music.createdAt))
        .limit(1);
      if (loose.length > 0) return loose[0].id;
    }

    return null;
  }

  async resolveSiteMusicIdsForInternationalReleases(
    items: { spotifyAlbumId: string; title: string; artists: string }[],
  ): Promise<(number | null)[]> {
    if (items.length === 0) return [];
    const albumIds = [...new Set(items.map((i) => i.spotifyAlbumId).filter(Boolean))];
    const exactMap = new Map<string, number>();
    if (albumIds.length > 0) {
      const exactRows = await db
        .select({ id: music.id, spotifyAlbumId: music.spotifyAlbumId })
        .from(music)
        .where(and(isNotNull(music.spotifyAlbumId), inArray(music.spotifyAlbumId, albumIds)))
        .orderBy(desc(music.createdAt));
      for (const row of exactRows) {
        const aid = row.spotifyAlbumId;
        if (aid && !exactMap.has(aid)) exactMap.set(aid, row.id);
      }
    }

    const out: (number | null)[] = [];
    for (const item of items) {
      const byAlbum = exactMap.get(item.spotifyAlbumId);
      if (byAlbum != null) {
        out.push(byAlbum);
        continue;
      }
      const fid = await this.findMusicIdFuzzyInternationalMatch(item.title, item.artists);
      out.push(fid);
    }
    return out;
  }

  async getDistributionInternationalMergeSources(
    filterOwnerUserIds?: string[],
  ): Promise<{ spotifyAlbumIds: string[]; upcs: string[] }> {
    const statusOk = inArray(distributionReleases.status, ["delivered", "live"]);
    const ownerOk =
      filterOwnerUserIds && filterOwnerUserIds.length > 0
        ? inArray(music.userId, filterOwnerUserIds)
        : undefined;
    const whereClause = ownerOk ? and(statusOk, ownerOk) : statusOk;

    const rows = await db
      .select({
        spotifyAlbumId: music.spotifyAlbumId,
        externalReleaseRef: distributionReleases.externalReleaseRef,
      })
      .from(distributionReleases)
      .innerJoin(music, eq(distributionReleases.musicId, music.id))
      .where(whereClause);

    const albumIdSet = new Set<string>();
    const upcSet = new Set<string>();
    /** Spotify 앨범 ID는 보통 22자이나 API·파서와 동일하게 10~32 허용 */
    const spotifyAlbumIdShape = /^[0-9A-Za-z]{10,32}$/;

    for (const r of rows) {
      const sid = r.spotifyAlbumId?.trim();
      if (sid && spotifyAlbumIdShape.test(sid)) {
        albumIdSet.add(sid);
        continue;
      }
      const upc = extractUpcFromExternalReleaseRef(r.externalReleaseRef);
      if (upc) upcSet.add(upc);
    }

    return {
      spotifyAlbumIds: [...albumIdSet],
      upcs: [...upcSet],
    };
  }

  async getInternationalReleasesDbSeeds(
    filterOwnerUserIds?: string[],
  ): Promise<
    {
      spotifyAlbumId: string;
      title: string;
      artists: string;
      imageUrl: string | null;
      releaseDate: string | null;
      musicId: number;
    }[]
  > {
    const statusOk = inArray(distributionReleases.status, ["delivered", "live"]);
    const ownerOk =
      filterOwnerUserIds && filterOwnerUserIds.length > 0
        ? inArray(music.userId, filterOwnerUserIds)
        : undefined;
    const whereClause = and(statusOk, ownerOk, isNotNull(music.spotifyAlbumId));

    const rows = await db
      .select({
        spotifyAlbumId: music.spotifyAlbumId,
        musicId: music.id,
        musicTitle: music.title,
        musicArtist: music.artist,
        imageFilename: music.imageFilename,
        distTitle: distributionReleases.releaseTitle,
        distArtist: distributionReleases.artistName,
        distReleaseDate: distributionReleases.releaseDate,
      })
      .from(distributionReleases)
      .innerJoin(music, eq(distributionReleases.musicId, music.id))
      .where(whereClause);

    const shape = /^[0-9A-Za-z]{10,32}$/;
    const out: {
      spotifyAlbumId: string;
      title: string;
      artists: string;
      imageUrl: string | null;
      releaseDate: string | null;
      musicId: number;
    }[] = [];

    for (const r of rows) {
      const sid = r.spotifyAlbumId?.trim();
      if (!sid || !shape.test(sid)) continue;
      const title = (r.distTitle?.trim() || r.musicTitle || "").trim() || r.musicTitle;
      const artists = (r.distArtist?.trim() || r.musicArtist || "").trim() || r.musicArtist;
      let imageUrl: string | null = null;
      const fn = r.imageFilename?.trim();
      if (fn) {
        imageUrl =
          fn.startsWith("http://") || fn.startsWith("https://") || fn.startsWith("/")
            ? fn
            : `/objects/${fn}`;
      }
      let releaseDate: string | null = null;
      if (r.distReleaseDate) {
        try {
          releaseDate = r.distReleaseDate.toISOString().slice(0, 10);
        } catch {
          releaseDate = null;
        }
      }
      out.push({ spotifyAlbumId: sid, title, artists, imageUrl, releaseDate, musicId: r.musicId });
    }
    return out;
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

  async getMusicPlayCounts(): Promise<Record<number, number>> {
    const results = await db.select({
      musicId: streamingLogs.musicId,
      count: sql<number>`count(*)::int`,
    }).from(streamingLogs).groupBy(streamingLogs.musicId);
    const map: Record<number, number> = {};
    for (const r of results) {
      map[r.musicId] = r.count;
    }
    return map;
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

  async incrementPostViewCount(id: number): Promise<boolean> {
    const updated = await db
      .update(posts)
      .set({ viewCount: sql`${posts.viewCount} + 1` })
      .where(eq(posts.id, id))
      .returning({ id: posts.id });
    return updated.length > 0;
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

  async updateUserProfile(userId: string, data: { firstName?: string; lastName?: string; profileImageUrl?: string; username?: string; allowDirectMessages?: boolean; notifyNewMusicEmail?: boolean; notifyNewMusicPush?: boolean; notifyActivityEmail?: boolean }): Promise<any | undefined> {
    const set: Record<string, unknown> = { updatedAt: new Date() };
    if (data.firstName !== undefined) set.firstName = data.firstName.trim() || null;
    if (data.lastName !== undefined) set.lastName = data.lastName.trim() || null;
    if (data.profileImageUrl !== undefined) set.profileImageUrl = data.profileImageUrl.trim() || null;
    if (data.username !== undefined) set.username = data.username.trim() || null;
    if (data.allowDirectMessages !== undefined) set.allowDirectMessages = data.allowDirectMessages;
    if (data.notifyNewMusicEmail !== undefined) set.notifyNewMusicEmail = data.notifyNewMusicEmail;
    if (data.notifyNewMusicPush !== undefined) set.notifyNewMusicPush = data.notifyNewMusicPush;
    if (data.notifyActivityEmail !== undefined) set.notifyActivityEmail = data.notifyActivityEmail;
    if (Object.keys(set).length <= 1) return this.getUserById(userId);
    const [user] = await db.update(users).set(set).where(eq(users.id, userId)).returning();
    return user;
  }

    /** 신곡 업로드 시 알림 보낼 회원: 같은 장르 또는 같은 아티스트(업로더) 곡을 좋아한 유저 (업로더 본인 제외, 최대 300명) */
  async getUsersToNotifyForNewMusic(m: { id: number; title: string; artist: string; genre?: string | null; userId: string }): Promise<{ userId: string; email: string | null; notifyNewMusicEmail: boolean; notifyNewMusicPush: boolean }[]> {
    const limit = 300;
    const uploaderId = m.userId;
    const hasGenre = m.genre != null && m.genre !== "";
    const result = await db.execute(hasGenre
      ? sql`
          SELECT DISTINCT u.id AS user_id, u.email, COALESCE(u.notify_new_music_email, true) AS notify_email, COALESCE(u.notify_new_music_push, true) AS notify_push
          FROM likes l
          JOIN music mus ON mus.id = l.music_id
          JOIN users u ON u.id = l.user_id
          WHERE l.user_id <> ${uploaderId}
            AND (mus.user_id = ${uploaderId} OR mus.genre = ${m.genre!})
          LIMIT ${limit}
        `
      : sql`
          SELECT DISTINCT u.id AS user_id, u.email, COALESCE(u.notify_new_music_email, true) AS notify_email, COALESCE(u.notify_new_music_push, true) AS notify_push
          FROM likes l
          JOIN music mus ON mus.id = l.music_id
          JOIN users u ON u.id = l.user_id
          WHERE l.user_id <> ${uploaderId}
            AND mus.user_id = ${uploaderId}
          LIMIT ${limit}
        `
    );
    const rows = result.rows as { user_id: string; email: string | null; notify_email: boolean; notify_push: boolean }[];
    const seen = new Set<string>();
    const out: { userId: string; email: string | null; notifyNewMusicEmail: boolean; notifyNewMusicPush: boolean }[] = [];
    for (const r of rows) {
      if (seen.has(r.user_id)) continue;
      seen.add(r.user_id);
      out.push({
        userId: r.user_id,
        email: r.email,
        notifyNewMusicEmail: r.notify_email,
        notifyNewMusicPush: r.notify_push,
      });
    }
    return out;
  }

  async getPushSubscriptions(userId: string): Promise<{ id: number; endpoint: string; p256dh: string; auth: string }[]> {
    const rows = await db.select({ id: pushSubscriptions.id, endpoint: pushSubscriptions.endpoint, p256dh: pushSubscriptions.p256dh, auth: pushSubscriptions.auth })
      .from(pushSubscriptions)
      .where(eq(pushSubscriptions.userId, userId));
    return rows;
  }

  async getPushSubscriptionsByUserIds(userIds: string[]): Promise<{ userId: string; endpoint: string; p256dh: string; auth: string }[]> {
    if (userIds.length === 0) return [];
    const rows = await db.select({ userId: pushSubscriptions.userId, endpoint: pushSubscriptions.endpoint, p256dh: pushSubscriptions.p256dh, auth: pushSubscriptions.auth })
      .from(pushSubscriptions)
      .where(inArray(pushSubscriptions.userId, userIds));
    return rows;
  }

  async addPushSubscription(userId: string, sub: { endpoint: string; p256dh: string; auth: string }): Promise<void> {
    await db.insert(pushSubscriptions).values({
      userId,
      endpoint: sub.endpoint,
      p256dh: sub.p256dh,
      auth: sub.auth,
    }).onConflictDoUpdate({
      target: [pushSubscriptions.endpoint],
      set: { userId, p256dh: sub.p256dh, auth: sub.auth },
    });
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

  async deleteNotification(id: number, userId: string): Promise<boolean> {
    const [deleted] = await db.delete(notifications).where(and(eq(notifications.id, id), eq(notifications.userId, userId))).returning({ id: notifications.id });
    return !!deleted;
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

  async recordVisit(visitorKey: string, path: string, extra?: { userId?: string; ipHash?: string; countryCode?: string; region?: string; deviceType?: string; refererDomain?: string; utmSource?: string }): Promise<void> {
    await db.insert(analyticsVisits).values({
      visitorKey,
      path,
      userId: extra?.userId ?? null,
      ipHash: extra?.ipHash ?? null,
      countryCode: extra?.countryCode ?? null,
      region: extra?.region ?? null,
      deviceType: extra?.deviceType ?? null,
      refererDomain: extra?.refererDomain ?? null,
      utmSource: extra?.utmSource ?? null,
    });
  }

  async getAdminUserAccessLogs(userId: string, limit: number, offset: number): Promise<{ logs: { id: number; visitedAt: Date; path: string; deviceType: string | null }[]; total: number }> {
    const safeLimit = Math.min(200, Math.max(1, Math.floor(limit)));
    const safeOffset = Math.max(0, Math.floor(offset));
    try {
      const [countRow] = await db
        .select({ total: sql<number>`count(*)::int` })
        .from(analyticsVisits)
        .where(eq(analyticsVisits.userId, userId));
      const total = countRow?.total ?? 0;
      const rows = await db
        .select({
          id: analyticsVisits.id,
          visitedAt: analyticsVisits.visitedAt,
          path: analyticsVisits.path,
          deviceType: analyticsVisits.deviceType,
        })
        .from(analyticsVisits)
        .where(eq(analyticsVisits.userId, userId))
        .orderBy(desc(analyticsVisits.visitedAt))
        .limit(safeLimit)
        .offset(safeOffset);
      return { logs: rows, total };
    } catch {
      return { logs: [], total: 0 };
    }
  }

  async getAdminVisitorSessionsByDate(dateStr: string, limit: number, offset: number): Promise<{
    rows: {
      userId: string | null;
      visitorKey: string;
      firstAt: Date;
      lastAt: Date;
      durationSeconds: number;
      pageViews: number;
      countryCode: string | null;
      region: string | null;
      email: string | null;
      username: string | null;
      firstName: string | null;
      lastName: string | null;
      subscriptionTier: string | null;
    }[];
    total: number;
  }> {
    const safeLimit = Math.min(200, Math.max(1, Math.floor(limit)));
    const safeOffset = Math.max(0, Math.floor(offset));
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
      return { rows: [], total: 0 };
    }
    const start = new Date(`${dateStr}T00:00:00+09:00`);
    const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
    try {
      /** 같은 visitor_key 는 하루 1행으로 묶음. 비로그인 후 로그인한 경우에도 최종 user_id·구독 플랜이 붙도록 함(예전에는 v:/u: 로 이중 행). */
      const countResult = await db.execute(sql`
        SELECT count(*)::int AS c FROM (
          SELECT 1 FROM analytics_visits
          WHERE visited_at >= ${start} AND visited_at < ${end}
          GROUP BY visitor_key
        ) t
      `);
      const total = Number((countResult.rows[0] as { c: number })?.c ?? 0);

      const rowsResult = await db.execute(sql`
        SELECT
          s.user_id AS user_id,
          s.visitor_key AS visitor_key,
          s.first_at AS first_at,
          s.last_at AS last_at,
          s.duration_seconds AS duration_seconds,
          s.page_views AS page_views,
          s.country_code AS country_code,
          s.region AS region,
          u.email AS email,
          u.username AS username,
          u.first_name AS first_name,
          u.last_name AS last_name,
          u.subscription_tier AS subscription_tier
        FROM (
          SELECT
            v.visitor_key AS visitor_key,
            (array_agg(v.user_id ORDER BY v.visited_at DESC) FILTER (WHERE v.user_id IS NOT NULL))[1] AS user_id,
            min(v.visited_at) AS first_at,
            max(v.visited_at) AS last_at,
            (extract(epoch FROM max(v.visited_at) - min(v.visited_at)))::int AS duration_seconds,
            (count(*) filter (where v.path <> ${ANALYTICS_DWELL_HEARTBEAT_PATH}))::int AS page_views,
            max(v.country_code) AS country_code,
            max(v.region) AS region
          FROM analytics_visits v
          WHERE v.visited_at >= ${start} AND v.visited_at < ${end}
          GROUP BY v.visitor_key
        ) s
        LEFT JOIN users u ON u.id = s.user_id
        ORDER BY s.first_at DESC
        LIMIT ${safeLimit} OFFSET ${safeOffset}
      `);

      const rows = (rowsResult.rows as Record<string, unknown>[]).map((r) => ({
        userId: (r.user_id as string | null) ?? null,
        visitorKey: String(r.visitor_key ?? ""),
        firstAt: r.first_at instanceof Date ? r.first_at : new Date(String(r.first_at)),
        lastAt: r.last_at instanceof Date ? r.last_at : new Date(String(r.last_at)),
        durationSeconds: Number(r.duration_seconds ?? 0),
        pageViews: Number(r.page_views ?? 0),
        countryCode: (r.country_code as string | null) ?? null,
        region: (r.region as string | null) ?? null,
        email: (r.email as string | null) ?? null,
        username: (r.username as string | null) ?? null,
        firstName: (r.first_name as string | null) ?? null,
        lastName: (r.last_name as string | null) ?? null,
        subscriptionTier: (r.subscription_tier as string | null) ?? null,
      }));
      return { rows, total };
    } catch {
      return { rows: [], total: 0 };
    }
  }

  async checkAnalyticsTableExists(): Promise<boolean> {
    try {
      await db.select({ one: sql<number>`1` }).from(analyticsVisits).limit(1);
      return true;
    } catch {
      return false;
    }
  }

  async checkConversionEventsTableExists(): Promise<boolean> {
    try {
      await db.select({ one: sql<number>`1` }).from(analyticsConversionEvents).limit(1);
      return true;
    } catch {
      return false;
    }
  }

  async recordConversionEvent(visitorKey: string, eventName: string, meta?: Record<string, unknown> | null): Promise<void> {
    await db.insert(analyticsConversionEvents).values({
      visitorKey,
      eventName,
      meta: meta ?? null,
    });
  }

  async getAdminSignupFunnelCounts(days: number): Promise<{ eventName: string; count: number }[]> {
    const safeDays = Math.min(90, Math.max(1, Math.floor(Number(days) || 7)));
    const since = new Date(Date.now() - safeDays * 24 * 60 * 60 * 1000);
    try {
      const rows = await db
        .select({
          eventName: analyticsConversionEvents.eventName,
          count: sql<number>`count(*)::int`,
        })
        .from(analyticsConversionEvents)
        .where(gte(analyticsConversionEvents.createdAt, since))
        .groupBy(analyticsConversionEvents.eventName)
        .orderBy(asc(analyticsConversionEvents.eventName));
      return rows;
    } catch {
      return [];
    }
  }

  async getAdminStatsByRegion(): Promise<{ countryCode: string | null; region: string | null; count: number }[]> {
    try {
      const rows = await db.select({
        countryCode: analyticsVisits.countryCode,
        region: analyticsVisits.region,
        count: sql<number>`count(*)::int`,
      })
        .from(analyticsVisits)
        .where(ne(analyticsVisits.path, ANALYTICS_DWELL_HEARTBEAT_PATH))
        .groupBy(analyticsVisits.countryCode, analyticsVisits.region)
        .orderBy(desc(sql`count(*)`))
        .limit(20);
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
      })
        .from(analyticsVisits)
        .where(ne(analyticsVisits.path, ANALYTICS_DWELL_HEARTBEAT_PATH))
        .groupBy(analyticsVisits.deviceType)
        .orderBy(desc(sql`count(*)`))
        .limit(10);
      return rows;
    } catch {
      return [];
    }
  }

  async getAdminStatsBySource(): Promise<{ source: string; count: number }[]> {
    try {
      const result = await db.execute(sql`
        SELECT
          COALESCE(NULLIF(TRIM(referer_domain), ''), NULLIF(TRIM(utm_source), ''), 'direct') AS source,
          count(*)::int AS count
        FROM analytics_visits
        WHERE path <> ${ANALYTICS_DWELL_HEARTBEAT_PATH}
        GROUP BY 1
        ORDER BY count DESC
        LIMIT 15
      `);
      return (result.rows as { source: string; count: number }[]) ?? [];
    } catch {
      return [];
    }
  }

  async getAdminAnalyticsTrend(days: number): Promise<{ date: string; uniqueVisitors: number; pageViews: number }[]> {
    const safeDays = Math.min(Math.max(1, Math.floor(days)), 90);
    try {
      const rows = await db.execute(sql`
        SELECT
          to_char((visited_at AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Seoul', 'YYYY-MM-DD') as date,
          count(DISTINCT visitor_key)::int as unique_visitors,
          (count(*) filter (where path <> ${ANALYTICS_DWELL_HEARTBEAT_PATH}))::int as page_views
        FROM analytics_visits
        WHERE visited_at >= ((date_trunc('day', (now() AT TIME ZONE 'Asia/Seoul')) AT TIME ZONE 'Asia/Seoul') - make_interval(days => ${safeDays}))
        GROUP BY 1
        ORDER BY 1
      `);
      const out = (rows.rows as { date: string; unique_visitors: number; page_views: number }[]).map((r) => ({
        date: r.date,
        uniqueVisitors: r.unique_visitors ?? 0,
        pageViews: r.page_views ?? 0,
      }));
      return out;
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

  async getAdminRevenueSummary(filters?: {
    start?: Date;
    endExclusive?: Date;
    endInclusive?: Date;
  }): Promise<{
    subscriptionByPlan: { plan: string; totalWon: number; count: number }[];
    subscriptionTotalWon: number;
    subscriptionCount: number;
    creditChargeTotalWon: number;
    creditChargeCount: number;
    paidGrandTotalWon: number;
    pendingSubscriptionWon: number;
    pendingSubscriptionCount: number;
    pendingCreditChargeWon: number;
    pendingCreditChargeCount: number;
    pendingTotalWon: number;
  }> {
    const tierIds = [...PAID_SUBSCRIPTION_TIER_IDS] as string[];
    const paidDateClauses: SQL[] = [];
    if (filters?.start) paidDateClauses.push(gte(payments.createdAt, filters.start));
    if (filters?.endExclusive) paidDateClauses.push(lt(payments.createdAt, filters.endExclusive));
    if (filters?.endInclusive) paidDateClauses.push(lte(payments.createdAt, filters.endInclusive));

    const paidBase: SQL[] = [eq(payments.status, "paid"), ...paidDateClauses];

    const subWhere = and(...paidBase, inArray(payments.plan, tierIds));
    const subRows = await db
      .select({
        plan: payments.plan,
        totalWon: sql<number>`coalesce(sum(${payments.amount}), 0)::int`,
        cnt: sql<number>`count(*)::int`,
      })
      .from(payments)
      .where(subWhere)
      .groupBy(payments.plan);

    const subscriptionByPlan = subRows.map((r) => ({
      plan: r.plan ?? "unknown",
      totalWon: Number(r.totalWon ?? 0),
      count: Number(r.cnt ?? 0),
    }));
    const subscriptionTotalWon = subscriptionByPlan.reduce((s, x) => s + x.totalWon, 0);
    const subscriptionCount = subscriptionByPlan.reduce((s, x) => s + x.count, 0);

    const creditWhere = and(...paidBase, eq(payments.plan, "credit_charge"));
    const [creditAgg] = await db
      .select({
        totalWon: sql<number>`coalesce(sum(${payments.amount}), 0)::int`,
        cnt: sql<number>`count(*)::int`,
      })
      .from(payments)
      .where(creditWhere);

    const creditChargeTotalWon = Number(creditAgg?.totalWon ?? 0);
    const creditChargeCount = Number(creditAgg?.cnt ?? 0);
    const paidGrandTotalWon = subscriptionTotalWon + creditChargeTotalWon;

    const pendSubWhere = and(
      eq(payments.status, "pending"),
      eq(payments.paymentKey, "bank_transfer"),
      inArray(payments.plan, tierIds),
    );
    const [ps] = await db
      .select({
        totalWon: sql<number>`coalesce(sum(${payments.amount}), 0)::int`,
        cnt: sql<number>`count(*)::int`,
      })
      .from(payments)
      .where(pendSubWhere);

    const pendCredWhere = and(
      eq(payments.status, "pending"),
      eq(payments.paymentKey, "bank_transfer"),
      eq(payments.plan, "credit_charge"),
    );
    const [pc] = await db
      .select({
        totalWon: sql<number>`coalesce(sum(${payments.amount}), 0)::int`,
        cnt: sql<number>`count(*)::int`,
      })
      .from(payments)
      .where(pendCredWhere);

    const pendPayupSubWhere = and(
      eq(payments.status, "pending"),
      eq(payments.paymentKey, "payup_direct"),
      inArray(payments.plan, tierIds),
    );
    const [ppu] = await db
      .select({
        totalWon: sql<number>`coalesce(sum(${payments.amount}), 0)::int`,
        cnt: sql<number>`count(*)::int`,
      })
      .from(payments)
      .where(pendPayupSubWhere);

    const pendingSubscriptionWon = Number(ps?.totalWon ?? 0);
    const pendingSubscriptionCount = Number(ps?.cnt ?? 0);
    const pendingCreditChargeWon = Number(pc?.totalWon ?? 0);
    const pendingCreditChargeCount = Number(pc?.cnt ?? 0);
    const pendingPayupSubscriptionWon = Number(ppu?.totalWon ?? 0);
    const pendingPayupSubscriptionCount = Number(ppu?.cnt ?? 0);

    return {
      subscriptionByPlan,
      subscriptionTotalWon,
      subscriptionCount,
      creditChargeTotalWon,
      creditChargeCount,
      paidGrandTotalWon,
      pendingSubscriptionWon,
      pendingSubscriptionCount,
      pendingCreditChargeWon,
      pendingCreditChargeCount,
      pendingPayupSubscriptionWon,
      pendingPayupSubscriptionCount,
      pendingTotalWon: pendingSubscriptionWon + pendingCreditChargeWon,
    };
  }

  async listAdminRevenuePayments(input: {
    dateFilters?: { start?: Date; endExclusive?: Date; endInclusive?: Date };
    kind: "all" | "subscription" | "credit";
    limit: number;
    offset: number;
  }): Promise<{
    total: number;
    rows: {
      id: string;
      userId: string;
      orderId: string;
      amount: number;
      plan: string | null;
      billingPeriod: string | null;
      paymentKey: string | null;
      payupMetaTxnId: string | null;
      createdAt: Date;
      email: string | null;
      firstName: string | null;
      lastName: string | null;
      username: string | null;
      paymentKind: "subscription" | "credit";
    }[];
  }> {
    const tierIds = [...PAID_SUBSCRIPTION_TIER_IDS] as string[];
    const df = input.dateFilters;
    const dateParts: SQL[] = [];
    if (df?.start) dateParts.push(gte(payments.createdAt, df.start));
    if (df?.endExclusive) dateParts.push(lt(payments.createdAt, df.endExclusive));
    if (df?.endInclusive) dateParts.push(lte(payments.createdAt, df.endInclusive));

    const paid = eq(payments.status, "paid");
    let kindCond: SQL;
    if (input.kind === "subscription") {
      kindCond = inArray(payments.plan, tierIds);
    } else if (input.kind === "credit") {
      kindCond = eq(payments.plan, "credit_charge");
    } else {
      const sub = inArray(payments.plan, tierIds);
      const cr = eq(payments.plan, "credit_charge");
      kindCond = or(sub, cr)!;
    }

    const where = and(paid, kindCond, ...dateParts);

    const [countRow] = await db.select({ n: sql<number>`count(*)::int` }).from(payments).where(where);
    const total = Number(countRow?.n ?? 0);

    const safeLimit = Math.min(200, Math.max(1, Math.floor(input.limit)));
    const safeOffset = Math.max(0, Math.floor(input.offset));

    const rawRows = await db
      .select({
        id: payments.id,
        userId: payments.userId,
        orderId: payments.orderId,
        amount: payments.amount,
        plan: payments.plan,
        billingPeriod: payments.billingPeriod,
        paymentKey: payments.paymentKey,
        payupMetaTxnId: sql<string | null>`NULLIF(TRIM(${payments.payupMeta}->>'txnId'), '')`,
        createdAt: payments.createdAt,
        email: users.email,
        firstName: users.firstName,
        lastName: users.lastName,
        username: users.username,
      })
      .from(payments)
      .leftJoin(users, eq(payments.userId, users.id))
      .where(where)
      .orderBy(desc(payments.createdAt))
      .limit(safeLimit)
      .offset(safeOffset);

    const rows = rawRows.map((r) => ({
      id: r.id,
      userId: r.userId,
      orderId: r.orderId,
      amount: r.amount,
      plan: r.plan,
      billingPeriod: r.billingPeriod,
      paymentKey: r.paymentKey,
      payupMetaTxnId: r.payupMetaTxnId ?? null,
      createdAt: r.createdAt instanceof Date ? r.createdAt : new Date(String(r.createdAt)),
      email: r.email,
      firstName: r.firstName,
      lastName: r.lastName,
      username: r.username,
      paymentKind: r.plan === "credit_charge" ? ("credit" as const) : ("subscription" as const),
    }));

    return { total, rows };
  }

  async createDistributionRelease(input: {
    ownerUserId: string;
    musicId: number;
    releaseTitle: string;
    artistName: string;
    rightsConfirmed: boolean;
    releaseDate?: Date | null;
  }): Promise<DistributionRelease> {
    const [inserted] = await db.insert(distributionReleases).values({
      ownerUserId: input.ownerUserId,
      musicId: input.musicId,
      releaseTitle: input.releaseTitle,
      artistName: input.artistName,
      rightsConfirmed: input.rightsConfirmed,
      releaseDate: input.releaseDate ?? null,
      status: "draft",
      updatedAt: new Date(),
    }).returning();
    if (!inserted) throw new Error("distribution release create failed");

    // 기본 수익 배분: 유저 70% / 회사 30%
    const ownerSplitBps = 7000;
    const companySplitBps = 3000;
    const companyEmail = process.env.DISTRIBUTION_COMPANY_EMAIL || "freecompr20@gmail.com";
    const companyUserId = await this.getUserIdByUsername(companyEmail);

    const splitsToInsert: Array<{ releaseId: number; userId: string; splitBps: number }> = [];
    if (companyUserId && companyUserId !== input.ownerUserId) {
      splitsToInsert.push({ releaseId: inserted.id, userId: input.ownerUserId, splitBps: ownerSplitBps });
      splitsToInsert.push({ releaseId: inserted.id, userId: companyUserId, splitBps: companySplitBps });
    } else {
      // 회사 계정이 없거나 소유자와 동일 계정이면 기존과 동일하게 유저 100%로 폴백
      splitsToInsert.push({ releaseId: inserted.id, userId: input.ownerUserId, splitBps: 10000 });
    }

    await db.insert(distributionSplits).values(splitsToInsert).onConflictDoNothing();
    return inserted;
  }

  async listMyDistributionReleases(ownerUserId: string): Promise<DistributionRelease[]> {
    return await db
      .select()
      .from(distributionReleases)
      .where(eq(distributionReleases.ownerUserId, ownerUserId))
      .orderBy(desc(distributionReleases.createdAt));
  }

  async submitDistributionRelease(ownerUserId: string, releaseId: number): Promise<void> {
    const [row] = await db
      .select()
      .from(distributionReleases)
      .where(and(eq(distributionReleases.id, releaseId), eq(distributionReleases.ownerUserId, ownerUserId)))
      .limit(1);
    if (!row) throw new Error("release not found");
    if (!row.rightsConfirmed) throw new Error("rights not confirmed");
    if (!["draft", "rejected"].includes(row.status)) throw new Error("release cannot be submitted");
    await db
      .update(distributionReleases)
      .set({
        status: "submitted",
        submittedAt: new Date(),
        rejectionReason: null,
        updatedAt: new Date(),
      })
      .where(eq(distributionReleases.id, releaseId));
  }

  async listAdminDistributionReleases(status?: string): Promise<DistributionRelease[]> {
    const where = status && status !== "all" ? eq(distributionReleases.status, status) : undefined;
    return await db
      .select()
      .from(distributionReleases)
      .where(where)
      .orderBy(desc(distributionReleases.createdAt));
  }

  async runDistributionQc(input: { adminUserId: string; releaseId: number }): Promise<DistributionRelease | undefined> {
    const uploadsDir = path.resolve(process.cwd(), "local-uploads", "uploads");

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

      const baseId = fileId.replace(/\.(png|jpe?g|webp)$/i, "");
      const candidates = [
        { p: path.join(uploadsDir, `${baseId}.jpg`), ext: ".jpg" },
        { p: path.join(uploadsDir, `${baseId}.jpeg`), ext: ".jpeg" },
        { p: path.join(uploadsDir, `${baseId}.png`), ext: ".png" },
        { p: path.join(uploadsDir, `${baseId}.webp`), ext: ".webp" },
        { p: path.join(uploadsDir, fileId), ext: path.extname(fileId).toLowerCase() || ".jpg" },
      ];

      const found = candidates.find((c) => existsSync(c.p));
      return found ?? null;
    }

    const [release] = await db
      .select()
      .from(distributionReleases)
      .where(eq(distributionReleases.id, input.releaseId))
      .limit(1);

    if (!release) return undefined;

    // Platform Readiness mode:
    // 운영 테스트/상태 복구를 위해 approved뿐 아니라 delivered/live에서도 QC 실행을 허용한다.
    if (!["approved", "delivered", "live"].includes(release.status)) {
      throw new Error(`release qc only allowed in approved/delivered/live status (current: ${release.status})`);
    }

    const musicItem = await this.getMusicById(release.musicId);
    if (!musicItem) throw new Error("music not found for qc");

    const localAudioPath = musicItem.filename ? resolveLocalAudioPath(musicItem.filename) : null;
    const localCover = resolveLocalCoverPath(musicItem.imageFilename);
    const coverRef = musicItem.imageFilename;
    const isRemoteCover = !!coverRef && /^https?:\/\//i.test(String(coverRef));
    let remoteCoverExt: string | null = null;
    if (isRemoteCover) {
      try {
        const u = new URL(String(coverRef));
        const ext = path.extname(u.pathname).toLowerCase();
        if ([".jpg", ".jpeg", ".png", ".webp"].includes(ext)) remoteCoverExt = ext;
      } catch {
        // ignore
      }
    }

    const audioExt = localAudioPath ? path.extname(localAudioPath).toLowerCase() : "";
    const allowedAudioExt = new Set([".mp3", ".wav", ".ogg"]);

    const checklist = {
      rightsConfirmed: release.rightsConfirmed === true,
      titlePresent: !!release.releaseTitle?.trim(),
      artistPresent: !!release.artistName?.trim(),
      audioFileFound: !!localAudioPath,
      audioFormatAllowed: allowedAudioExt.has(audioExt),
      coverFileFound: !!localCover || isRemoteCover,
    };

    const failed = Object.entries(checklist).filter(([, v]) => !v).map(([k]) => k);
    const passed = failed.length === 0;

    const qcResults = {
      passed,
      failedChecks: failed,
      files: {
        audio: { included: !!localAudioPath, ext: audioExt || null, resolvedPath: localAudioPath || null },
        cover: {
          included: !!localCover || isRemoteCover,
          ext: localCover?.ext || remoteCoverExt || (isRemoteCover ? ".jpg" : null),
          resolvedPath: localCover?.path || (isRemoteCover ? String(coverRef) : null),
        },
      },
      checkedAt: new Date().toISOString(),
    };

    const [updated] = await db
      .update(distributionReleases)
      .set({
        qcStatus: passed ? "passed" : "failed",
        qcCheckedAt: new Date(),
        qcChecklist: checklist,
        qcResults,
        updatedAt: new Date(),
      })
      .where(eq(distributionReleases.id, input.releaseId))
      .returning();

    return updated;
  }

  async linkDistributionReleaseExternalRef(input: {
    adminUserId: string;
    releaseId: number;
    externalReleaseRef: string;
    status: "delivered" | "live";
  }): Promise<DistributionRelease | undefined> {
    const ext = input.externalReleaseRef.trim();
    if (!ext) throw new Error("externalReleaseRef is required");

    const [updated] = await db
      .update(distributionReleases)
      .set({
        externalReleaseRef: ext,
        status: input.status,
        updatedAt: new Date(),
      })
      .where(eq(distributionReleases.id, input.releaseId))
      .returning();

    return updated;
  }

  async reviewDistributionRelease(input: {
    adminUserId: string;
    releaseId: number;
    action: "approved" | "rejected";
    reason?: string | null;
  }): Promise<DistributionRelease | undefined> {
    const status = input.action === "approved" ? "approved" : "rejected";
    const [updated] = await db
      .update(distributionReleases)
      .set({
        status,
        approvedAt: input.action === "approved" ? new Date() : null,
        approvedByUserId: input.action === "approved" ? input.adminUserId : null,
        rejectionReason: input.action === "rejected" ? (input.reason ?? "관리자 반려") : null,
        updatedAt: new Date(),
      })
      .where(eq(distributionReleases.id, input.releaseId))
      .returning();
    return updated;
  }

  async publishDistributionRelease(input: {
    adminUserId: string;
    releaseId: number;
    distributor: string;
  }): Promise<DistributionRelease | undefined> {
    const [updated] = await db
      .update(distributionReleases)
      .set({
        status: "delivered",
        // 웹훅에서 외부 릴리즈를 매핑하기 위한 고정 ref
        externalReleaseRef: `${input.distributor}:${input.releaseId}`,
        updatedAt: new Date(),
      })
      .where(eq(distributionReleases.id, input.releaseId))
      .returning();

    return updated;
  }

  async getDistributionReleaseByExternalRef(externalReleaseRef: string): Promise<DistributionRelease | undefined> {
    const [row] = await db
      .select()
      .from(distributionReleases)
      .where(eq(distributionReleases.externalReleaseRef, externalReleaseRef))
      .limit(1);
    return row;
  }

  async hasDistributionLedgerForReleaseMonth(releaseId: number, periodMonth: string): Promise<boolean> {
    const [row] = await db
      .select({ id: distributionEarningsLedger.id })
      .from(distributionEarningsLedger)
      .where(
        and(
          eq(distributionEarningsLedger.releaseId, releaseId),
          eq(distributionEarningsLedger.periodMonth, periodMonth),
        ),
      )
      .limit(1);
    return row != null;
  }

  async setDistributionReleaseStatusByExternalRef(input: {
    externalReleaseRef: string;
    status: "delivered" | "live";
  }): Promise<DistributionRelease | undefined> {
    const [updated] = await db
      .update(distributionReleases)
      .set({
        status: input.status,
        updatedAt: new Date(),
      })
      .where(eq(distributionReleases.externalReleaseRef, input.externalReleaseRef))
      .returning();
    return updated;
  }

  async hasPaidDistributionPayout(input: { releaseId: number; periodMonth: string }): Promise<boolean> {
    const noteKey = `distribution_earnings:${input.releaseId}:${input.periodMonth}`;
    const [row] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(distributionPayouts)
      .where(and(eq(distributionPayouts.note, noteKey), eq(distributionPayouts.status, "paid")))
      .limit(1);
    return (row?.count ?? 0) > 0;
  }

  async addDistributionEarning(input: {
    releaseId: number;
    periodMonth: string;
    grossAmount: number;
    platformFeeAmount?: number;
    source?: string | null;
    externalRef?: string | null;
  }): Promise<{ ledgerRows: number; netAmount: number; platformAmount: number; distributedAmount: number }> {
    if (!/^\d{4}-\d{2}$/.test(input.periodMonth)) throw new Error("periodMonth must be YYYY-MM");
    const gross = Math.max(0, Math.floor(input.grossAmount));
    const platformFee = Math.max(0, Math.floor(input.platformFeeAmount ?? 0));
    const net = Math.max(0, gross - platformFee);

    const [release] = await db
      .select()
      .from(distributionReleases)
      .where(eq(distributionReleases.id, input.releaseId))
      .limit(1);
    if (!release) throw new Error("release not found");
    if (!["approved", "delivered", "live"].includes(release.status)) {
      throw new Error(`release cannot accept earnings in status: ${release.status}`);
    }

    const splits = await db
      .select({ userId: distributionSplits.userId, splitBps: distributionSplits.splitBps })
      .from(distributionSplits)
      .where(eq(distributionSplits.releaseId, input.releaseId));
    if (splits.length === 0) throw new Error("split not configured");

    const totalBps = splits.reduce((acc, s) => acc + Math.max(0, s.splitBps), 0);
    if (totalBps <= 0) throw new Error("invalid split bps");

    const rows = splits.map((s, idx) => {
      const isLast = idx === splits.length - 1;
      const allocated = isLast
        ? 0
        : Math.floor((net * Math.max(0, s.splitBps)) / totalBps);
      return { userId: s.userId, allocated };
    });
    const allocatedSoFar = rows.reduce((acc, s) => acc + s.allocated, 0);
    const finalRows = rows.map((r, idx) => (
      idx === rows.length - 1 ? { ...r, allocated: Math.max(0, net - allocatedSoFar) } : r
    ));
    const distributedAmount = finalRows.reduce((acc, r) => acc + r.allocated, 0);
    const platformAmount = Math.max(0, gross - distributedAmount);

    await db.transaction(async (tx) => {
      for (const r of finalRows) {
        const ext =
          input.externalRef && finalRows.length > 1
            ? `${input.externalRef}:${r.userId}`
            : input.externalRef ?? null;
        await tx.insert(distributionEarningsLedger).values({
          releaseId: input.releaseId,
          userId: r.userId,
          periodMonth: input.periodMonth,
          grossAmount: gross,
          platformFeeAmount: platformFee,
          netAmount: net,
          userAmount: r.allocated,
          platformAmount,
          source: input.source ?? null,
          externalRef: ext,
        });
      }
    });

    // 'delivered'/'live' 상태일 때는, earnings ledger를 기반으로 payout을 즉시 생성합니다.
    // (배치 지급/정산은 추후 확장 가능. 현재는 밸런스 UI 반영을 위해 paid로 기록합니다.)
    if (release.status === "approved" || release.status === "delivered" || release.status === "live") {
      const noteKey = `distribution_earnings:${input.releaseId}:${input.periodMonth}`;
      const ledgerSums = await db
        .select({
          userId: distributionEarningsLedger.userId,
          amount: sql<number>`COALESCE(SUM(${distributionEarningsLedger.userAmount}), 0)::int`,
        })
        .from(distributionEarningsLedger)
        .where(
          and(
            eq(distributionEarningsLedger.releaseId, input.releaseId),
            eq(distributionEarningsLedger.periodMonth, input.periodMonth),
          ),
        )
        .groupBy(distributionEarningsLedger.userId);

      const userIds = ledgerSums.map((r) => r.userId);
      const existing = await db
        .select({ userId: distributionPayouts.userId })
        .from(distributionPayouts)
        .where(
          and(
            inArray(distributionPayouts.userId, userIds),
            eq(distributionPayouts.note, noteKey),
            eq(distributionPayouts.status, "paid"),
          ),
        );
      const existingSet = new Set(existing.map((e) => e.userId));

      const payoutsToInsert = ledgerSums
        .filter((r) => r.amount > 0 && !existingSet.has(r.userId))
        .map((r) => ({
          userId: r.userId,
          amount: r.amount,
          status: "paid",
          note: noteKey,
          paidAt: new Date(),
        }));

      if (payoutsToInsert.length > 0) {
        await db.insert(distributionPayouts).values(payoutsToInsert);
      }
    }

    return {
      ledgerRows: finalRows.length,
      netAmount: net,
      platformAmount,
      distributedAmount,
    };
  }

  async getDistributionBalanceSummary(userId: string): Promise<{ totalEarned: number; totalPaid: number; available: number }> {
    const [earned] = await db
      .select({ total: sql<number>`COALESCE(SUM(${distributionEarningsLedger.userAmount}), 0)::int` })
      .from(distributionEarningsLedger)
      .where(eq(distributionEarningsLedger.userId, userId));
    const [paid] = await db
      .select({ total: sql<number>`COALESCE(SUM(${distributionPayouts.amount}), 0)::int` })
      .from(distributionPayouts)
      .where(and(eq(distributionPayouts.userId, userId), eq(distributionPayouts.status, "paid")));
    const totalEarned = earned?.total ?? 0;
    const totalPaid = paid?.total ?? 0;
    return {
      totalEarned,
      totalPaid,
      available: Math.max(0, totalEarned - totalPaid),
    };
  }

  /** 최근 N분 이내 페이지뷰를 기록한 고유 방문자 수 (실시간 접속자 수) */
  async getCurrentVisitorsCount(lastMinutes: number): Promise<number> {
    const safe = Math.min(60, Math.max(1, Math.floor(lastMinutes)));
    try {
      const [row] = await db.select({
        count: sql<number>`count(distinct ${analyticsVisits.visitorKey})::int`,
      }).from(analyticsVisits).where(sql`${analyticsVisits.visitedAt} >= now() - make_interval(mins => ${safe})`);
      return row?.count ?? 0;
    } catch {
      return 0;
    }
  }

  async getCurrentVisitorsDetail(lastMinutes: number): Promise<{
    count: number;
    visitors: { userId: string | null; displayName: string; lastPath: string | null; lastSeenAt: string }[];
  }> {
    const safe = Math.min(60, Math.max(1, Math.floor(lastMinutes)));
    try {
      const rowsResult = await db.execute(sql`
        SELECT
          s.user_id AS user_id,
          s.visitor_key AS visitor_key,
          s.last_path AS last_path,
          s.last_seen_at AS last_seen_at,
          u.username AS username,
          u.first_name AS first_name,
          u.email AS email
        FROM (
          SELECT
            visitor_key,
            (array_agg(user_id ORDER BY visited_at DESC) FILTER (WHERE user_id IS NOT NULL))[1] AS user_id,
            (array_agg(path ORDER BY visited_at DESC))[1] AS last_path,
            max(visited_at) AS last_seen_at
          FROM analytics_visits
          WHERE visited_at >= now() - make_interval(mins => ${safe})
          GROUP BY visitor_key
        ) s
        LEFT JOIN users u ON u.id = s.user_id
        ORDER BY s.last_seen_at DESC
      `);

      const rows = rowsResult.rows as Record<string, unknown>[];
      const visitors = rows.map((r) => {
        const userId = (r.user_id as string | null) ?? null;
        const vk = String(r.visitor_key ?? "");
        const lastAt = r.last_seen_at instanceof Date ? r.last_seen_at : new Date(String(r.last_seen_at));
        const rawPath = (r.last_path as string | null) ?? null;
        const lastPath =
          rawPath === ANALYTICS_DWELL_HEARTBEAT_PATH ? null : rawPath;
        let displayName: string;
        if (userId) {
          const fn = (r.first_name as string | null)?.trim();
          const un = (r.username as string | null)?.trim();
          const em = (r.email as string | null)?.trim();
          displayName = fn || un || em || `${userId.slice(0, 10)}…`;
        } else {
          const tail = vk.length > 6 ? vk.slice(-6) : vk || "?";
          displayName = `비로그인 ·${tail}`;
        }
        return {
          userId,
          displayName,
          lastPath,
          lastSeenAt: lastAt.toISOString(),
        };
      });
      return { count: visitors.length, visitors };
    } catch {
      return { count: 0, visitors: [] };
    }
  }

  async getAdminAnalytics(): Promise<{ dailyVisitors: number; totalVisitors: number; pageViewsToday: number; pageViewsTotal: number }> {
    // "오늘" = 한국(Asia/Seoul) 기준 자정~현재. visited_at이 UTC로 저장돼 있어도 일일/오늘 페이지뷰가 맞게 집계되도록.
    const todayCondition = sql`${analyticsVisits.visitedAt} >= (date_trunc('day', (now() AT TIME ZONE 'Asia/Seoul')) AT TIME ZONE 'Asia/Seoul')`;
    const notDwellHb = ne(analyticsVisits.path, ANALYTICS_DWELL_HEARTBEAT_PATH);
    try {
      const [dailyV] = await db.select({
        count: sql<number>`count(distinct ${analyticsVisits.visitorKey})::int`,
      }).from(analyticsVisits).where(todayCondition);
      const [totalV] = await db.select({
        count: sql<number>`count(distinct ${analyticsVisits.visitorKey})::int`,
      }).from(analyticsVisits);
      const [pvToday] = await db.select({
        count: sql<number>`count(*)::int`,
      }).from(analyticsVisits).where(and(todayCondition, notDwellHb));
      const [pvTotal] = await db.select({
        count: sql<number>`count(*)::int`,
      }).from(analyticsVisits).where(notDwellHb);
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
      }).from(analyticsVisits).where(and(fallback, notDwellHb));
      const [pvTotal] = await db.select({
        count: sql<number>`count(*)::int`,
      }).from(analyticsVisits).where(notDwellHb);
      return {
        dailyVisitors: dailyV?.count ?? 0,
        totalVisitors: totalV?.count ?? 0,
        pageViewsToday: pvToday?.count ?? 0,
        pageViewsTotal: pvTotal?.count ?? 0,
      };
    }
  }

  /** 관리자 회원 목록(페이지네이션). 최신 가입순. 검색: COALESCE+ILIKE. */
  async getAllUsers(search?: string, limit = 50, offset = 0): Promise<{ rows: any[]; total: number }> {
    const safeLimit = Math.min(200, Math.max(1, Math.floor(Number(limit) || 50)));
    const safeOffset = Math.max(0, Math.floor(Number(offset) || 0));
    const trimmed = typeof search === "string" ? search.trim() : "";

    const pat = `%${trimmed}%`;
    const searchWhere =
      trimmed.length > 0
        ? sql`(
            CAST(${users.id} AS TEXT) ILIKE ${pat}
            OR COALESCE(${users.email}, '') ILIKE ${pat}
            OR COALESCE(${users.username}, '') ILIKE ${pat}
            OR COALESCE(${users.firstName}, '') ILIKE ${pat}
            OR COALESCE(${users.lastName}, '') ILIKE ${pat}
          )`
        : undefined;

    if (searchWhere) {
      const [cnt] = await db
        .select({ c: sql<number>`count(*)::int` })
        .from(users)
        .where(searchWhere);
      const total = Number(cnt?.c ?? 0);
      const rows = await db
        .select()
        .from(users)
        .where(searchWhere)
        .orderBy(desc(users.createdAt))
        .limit(safeLimit)
        .offset(safeOffset);
      return { rows, total };
    }

    const [cnt] = await db.select({ c: sql<number>`count(*)::int` }).from(users);
    const total = Number(cnt?.c ?? 0);
    const rows = await db
      .select()
      .from(users)
      .orderBy(desc(users.createdAt))
      .limit(safeLimit)
      .offset(safeOffset);
    return { rows, total };
  }

  async findUserForAdminLookup(params: { email?: string; userId?: string }): Promise<any | null> {
    const uid = params.userId?.trim();
    if (uid) {
      const [u] = await db.select().from(users).where(eq(users.id, uid)).limit(1);
      return u ?? null;
    }
    const em = params.email?.trim();
    if (!em) return null;
    const [u] = await db
      .select()
      .from(users)
      .where(sql`LOWER(CAST(${users.email} AS TEXT)) = LOWER(${em})`)
      .limit(1);
    return u ?? null;
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
    await db.delete(analyticsVisits).where(eq(analyticsVisits.userId, id));
    await db.delete(pushSubscriptions).where(eq(pushSubscriptions.userId, id));
    await db.delete(userBlocks).where(eq(userBlocks.blockerId, id));
    await db.delete(userBlocks).where(eq(userBlocks.blockedId, id));
    await db.delete(userReports).where(eq(userReports.reporterId, id));
    await db.delete(userReports).where(eq(userReports.reportedUserId, id));
    await db.delete(creditRefundRequests).where(eq(creditRefundRequests.userId, id));

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
    if (tier === "free") {
      await db
        .update(users)
        .set({
          subscriptionTier: "free",
          subscriptionPlan: null,
          subscriptionExpiresAt: null,
          subscriptionEntitlements: {},
          updatedAt: new Date(),
        })
        .where(eq(users.id, id));
      return;
    }
    const subscriptionPlan = tier === "premium" ? "premium" : null;
    const iso = expiresAt ? expiresAt.toISOString() : new Date().toISOString();
    await db
      .update(users)
      .set({
        subscriptionTier: tier,
        subscriptionPlan,
        subscriptionExpiresAt: expiresAt,
        subscriptionEntitlements: { [tier]: iso },
        updatedAt: new Date(),
      })
      .where(eq(users.id, id));
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

  async getAdminUserWalletDetail(
    userId: string,
    input: { txLimit?: number; txOffset?: number; payLimit?: number; payOffset?: number },
  ): Promise<{
    user: {
      id: string;
      email: string | null;
      username: string | null;
      firstName: string | null;
      lastName: string | null;
      role: string | null;
      credits: number | null;
      subscriptionTier: string | null;
      subscriptionExpiresAt: Date | null;
      subscriptionPlan: string | null;
      subscriptionEntitlements: unknown;
    };
    creditSummary: { totalCreditsIn: number; totalCreditsOut: number; currentBalance: number };
    creditTransactions: { total: number; rows: any[] };
    payments: { total: number; rows: any[] };
    aiMusicMonthly: {
      periodMonth: string;
      limit: number;
      used: number;
      unit: "songs" | "credits" | "won" | "unlimited";
      planGrantWon?: number | null;
      walletRemainingWon?: number | null;
    };
  } | null> {
    const txLimit = Math.min(200, Math.max(1, Math.floor(Number(input.txLimit) || 50)));
    const txOffset = Math.max(0, Math.floor(Number(input.txOffset) || 0));
    const payLimit = Math.min(200, Math.max(1, Math.floor(Number(input.payLimit) || 50)));
    const payOffset = Math.max(0, Math.floor(Number(input.payOffset) || 0));

    const [user] = await db
      .select({
        id: users.id,
        email: users.email,
        username: users.username,
        firstName: users.firstName,
        lastName: users.lastName,
        role: users.role,
        credits: users.credits,
        subscriptionTier: users.subscriptionTier,
        subscriptionExpiresAt: users.subscriptionExpiresAt,
        subscriptionPlan: users.subscriptionPlan,
        subscriptionEntitlements: users.subscriptionEntitlements,
      })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    if (!user) return null;

    const now = new Date();
    let usagePeriodKey = getAiMusicUsagePeriodKey(user, user.role ?? null, now);
    let usedAi = 0;
    let aiLimit = getAiMusicMonthlyUsageLimit(user, user.role ?? null, now);
    let planGrantWon: number | null = null;
    let walletRemainingWon: number | null = null;
    if (user.role !== "admin" && isUserPaidSubscriptionActive(user, now)) {
      const w = await syncSubscriptionAiWalletForPaidUser(userId, now);
      if (w) {
        usagePeriodKey = w.periodKey;
        usedAi = w.periodConsumed;
        aiLimit = w.limitDisplay;
        planGrantWon = w.monthlyGrant;
        walletRemainingWon = w.walletSum;
      } else {
        const [usageRow] = await db
          .select()
          .from(aiMusicUsage)
          .where(and(eq(aiMusicUsage.userId, userId), eq(aiMusicUsage.periodMonth, usagePeriodKey)));
        usedAi = usageRow?.count ?? 0;
      }
    } else {
      const [usageRow] = await db
        .select()
        .from(aiMusicUsage)
        .where(and(eq(aiMusicUsage.userId, userId), eq(aiMusicUsage.periodMonth, usagePeriodKey)));
      usedAi = usageRow?.count ?? 0;
    }
    let aiUnit: "songs" | "credits" | "won" | "unlimited" = "won";
    if (aiLimit === -1) aiUnit = "unlimited";
    else if (aiLimit === FREE_AI_MUSIC_LIMIT_PER_MONTH && !isUserPaidSubscriptionActive(user, now)) aiUnit = "songs";
    else aiUnit = "won";

    const [txCountRow] = await db
      .select({ c: sql<number>`count(*)::int` })
      .from(creditTransactions)
      .where(eq(creditTransactions.userId, userId));
    const txTotal = Number(txCountRow?.c ?? 0);

    const txRows = await db
      .select()
      .from(creditTransactions)
      .where(eq(creditTransactions.userId, userId))
      .orderBy(desc(creditTransactions.createdAt))
      .limit(txLimit)
      .offset(txOffset);

    const [aggRow] = await db
      .select({
        totalIn: sql<number>`COALESCE(SUM(CASE WHEN ${creditTransactions.amount} > 0 THEN ${creditTransactions.amount} ELSE 0 END), 0)::int`,
        totalOut: sql<number>`COALESCE(SUM(CASE WHEN ${creditTransactions.amount} < 0 THEN (-${creditTransactions.amount}) ELSE 0 END), 0)::int`,
      })
      .from(creditTransactions)
      .where(eq(creditTransactions.userId, userId));

    const paidCond = and(eq(payments.userId, userId), eq(payments.status, "paid"));
    const [payCountRow] = await db.select({ c: sql<number>`count(*)::int` }).from(payments).where(paidCond);
    const payTotal = Number(payCountRow?.c ?? 0);
    const payRows = await db
      .select()
      .from(payments)
      .where(paidCond)
      .orderBy(desc(payments.createdAt))
      .limit(payLimit)
      .offset(payOffset);

    const bal = user.credits ?? 0;
    return {
      user,
      creditSummary: {
        totalCreditsIn: Number(aggRow?.totalIn ?? 0),
        totalCreditsOut: Number(aggRow?.totalOut ?? 0),
        currentBalance: bal,
      },
      creditTransactions: { total: txTotal, rows: txRows },
      payments: { total: payTotal, rows: payRows },
      aiMusicMonthly: {
        periodMonth: usagePeriodKey,
        usagePeriodKey,
        limit: aiLimit,
        used: usedAi,
        unit: aiUnit,
        ...(planGrantWon != null && walletRemainingWon != null
          ? { planGrantWon, walletRemainingWon }
          : {}),
      },
    };
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
    const otherUser = await this.getUserById(user2Id);
    const allow = otherUser?.allowDirectMessages ?? otherUser?.allow_direct_messages;
    if (allow === false) {
      const err = new Error("MESSAGES_NOT_ACCEPTED") as Error & { code?: string };
      err.code = "MESSAGES_NOT_ACCEPTED";
      throw err;
    }
    if (await this.isBlocked(user1Id, user2Id) || await this.isBlocked(user2Id, user1Id)) {
      const err = new Error("BLOCKED") as Error & { code?: string };
      err.code = "BLOCKED";
      throw err;
    }
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
    const blockedIds = await this.getBlockedUserIds(userId);
    const blockedMe = await this.getBlockedMeUserIds(userId);
    return (rows.rows as any[]).filter(
      (r) => !blockedIds.includes(r.other_user_id) && !blockedMe.includes(r.other_user_id)
    );
  }

  async getBlockedMeUserIds(userId: string): Promise<string[]> {
    const rows = await db.select({ blockerId: userBlocks.blockerId }).from(userBlocks).where(eq(userBlocks.blockedId, userId));
    return rows.map((r) => r.blockerId);
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

  async blockUser(blockerId: string, blockedId: string): Promise<void> {
    if (blockerId === blockedId) return;
    await db.insert(userBlocks).values({ blockerId, blockedId }).onConflictDoNothing({ target: [userBlocks.blockerId, userBlocks.blockedId] });
  }

  async unblockUser(blockerId: string, blockedId: string): Promise<void> {
    await db.delete(userBlocks).where(and(eq(userBlocks.blockerId, blockerId), eq(userBlocks.blockedId, blockedId)));
  }

  async getBlockedUserIds(userId: string): Promise<string[]> {
    const rows = await db.select({ blockedId: userBlocks.blockedId }).from(userBlocks).where(eq(userBlocks.blockerId, userId));
    return rows.map((r) => r.blockedId);
  }

  async isBlocked(blockerId: string, blockedId: string): Promise<boolean> {
    const rows = await db.select().from(userBlocks).where(and(eq(userBlocks.blockerId, blockerId), eq(userBlocks.blockedId, blockedId))).limit(1);
    return rows.length > 0;
  }

  async createUserReport(data: { reporterId: string; reportedUserId: string; reason: string; messageId?: number; conversationId?: number }): Promise<any> {
    const [report] = await db.insert(userReports).values(data).returning();
    return report;
  }

  async getUserReportById(id: number): Promise<any | undefined> {
    const [row] = await db.select().from(userReports).where(eq(userReports.id, id));
    return row;
  }

  async getAllUserReports(status?: string): Promise<any[]> {
    if (status && status !== "all") {
      return await db.select().from(userReports).where(eq(userReports.status, status)).orderBy(desc(userReports.createdAt));
    }
    return await db.select().from(userReports).orderBy(desc(userReports.createdAt));
  }

  async updateUserReportStatus(id: number, status: string, adminNote?: string): Promise<void> {
    const set: { status: string; adminNote?: string } = { status };
    if (adminNote !== undefined) set.adminNote = adminNote;
    await db.update(userReports).set(set).where(eq(userReports.id, id));
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
  async getActiveSiteAnnouncement(lang?: string): Promise<{ id: number; content: string; imageUrl: string | null; textSize: string | null; startsAt: Date; endsAt: Date } | null> {
    const now = new Date();
    const [row] = await db.select({
      id: siteAnnouncements.id,
      content: siteAnnouncements.content,
      contentTranslations: siteAnnouncements.contentTranslations,
      textSize: siteAnnouncements.textSize,
      imageUrl: siteAnnouncements.imageUrl,
      startsAt: siteAnnouncements.startsAt,
      endsAt: siteAnnouncements.endsAt,
    }).from(siteAnnouncements)
      .where(and(
        lte(siteAnnouncements.startsAt, now),
        gte(siteAnnouncements.endsAt, now),
        eq(siteAnnouncements.showAsPopup, true)
      ))
      .orderBy(desc(siteAnnouncements.createdAt))
      .limit(1);
    if (!row) return null;
    const content = resolveSiteAnnouncementContentForLang(row.content, row.contentTranslations, lang);
    const result: { id: number; content: string; imageUrl: string | null; textSize: string | null; startsAt: Date; endsAt: Date } = {
      id: row.id,
      content,
      imageUrl: row.imageUrl ?? null,
      textSize: row.textSize ?? null,
      startsAt: row.startsAt,
      endsAt: row.endsAt,
    };
    return result;
  }

  async getSiteAnnouncements(lang?: string): Promise<{ id: number; content: string; imageUrl: string | null; textSize: string | null; showAsPopup: boolean; viewCount: number; startsAt: Date; endsAt: Date; createdAt: Date }[]> {
    const rows = await db.select({
      id: siteAnnouncements.id,
      content: siteAnnouncements.content,
      contentTranslations: siteAnnouncements.contentTranslations,
      imageUrl: siteAnnouncements.imageUrl,
      textSize: siteAnnouncements.textSize,
      showAsPopup: siteAnnouncements.showAsPopup,
      viewCount: siteAnnouncements.viewCount,
      startsAt: siteAnnouncements.startsAt,
      endsAt: siteAnnouncements.endsAt,
      createdAt: siteAnnouncements.createdAt,
    }).from(siteAnnouncements).orderBy(desc(siteAnnouncements.createdAt)).limit(50);
    return rows.map((r) => ({
      id: r.id,
      content: resolveSiteAnnouncementContentForLang(r.content, r.contentTranslations, lang),
      imageUrl: r.imageUrl,
      textSize: r.textSize,
      showAsPopup: r.showAsPopup ?? true,
      viewCount: r.viewCount ?? 0,
      startsAt: r.startsAt,
      endsAt: r.endsAt,
      createdAt: r.createdAt ?? new Date(),
    }));
  }

  async incrementSiteAnnouncementViewCount(id: number): Promise<number> {
    const [row] = await db.update(siteAnnouncements)
      .set({ viewCount: sql`view_count + 1`, updatedAt: new Date() })
      .where(eq(siteAnnouncements.id, id))
      .returning({ viewCount: siteAnnouncements.viewCount });
    return row?.viewCount ?? 0;
  }

  async saveSiteAnnouncement(data: { content: string; imageUrl?: string | null; textSize?: string | null; showAsPopup?: boolean; startsAt: Date; endsAt: Date }): Promise<{ id: number; content: string; imageUrl: string | null; startsAt: Date; endsAt: Date }> {
    const textSizeVal = data.textSize && ["sm", "md", "lg"].includes(data.textSize) ? data.textSize : "md";
    const inserted = await db.insert(siteAnnouncements).values({
      content: data.content,
      imageUrl: data.imageUrl ?? null,
      textSize: textSizeVal,
      showAsPopup: data.showAsPopup !== false,
      startsAt: data.startsAt,
      endsAt: data.endsAt,
      updatedAt: new Date(),
    }).returning();
    const row = inserted[0];
    if (!row) throw new Error("Insert did not return row");
    return { id: row.id, content: row.content, imageUrl: row.imageUrl ?? null, startsAt: row.startsAt, endsAt: row.endsAt };
  }

  async updateSiteAnnouncement(id: number, data: { content: string; imageUrl?: string | null; textSize?: string | null; showAsPopup?: boolean; startsAt: Date; endsAt: Date }): Promise<{ id: number; content: string; imageUrl: string | null; startsAt: Date; endsAt: Date }> {
    const textSizeVal = data.textSize && ["sm", "md", "lg"].includes(data.textSize) ? data.textSize : "md";
    const updated = await db.update(siteAnnouncements).set({
      content: data.content,
      imageUrl: data.imageUrl ?? null,
      textSize: textSizeVal,
      showAsPopup: data.showAsPopup !== false,
      startsAt: data.startsAt,
      endsAt: data.endsAt,
      updatedAt: new Date(),
    }).where(eq(siteAnnouncements.id, id)).returning();
    const row = updated[0];
    if (!row) throw new Error("Update did not return row");
    return { id: row.id, content: row.content, imageUrl: row.imageUrl ?? null, startsAt: row.startsAt, endsAt: row.endsAt };
  }

  async updateSiteAnnouncementTranslations(id: number, translations: Record<string, string>): Promise<void> {
    await db.update(siteAnnouncements).set({ contentTranslations: translations, updatedAt: new Date() }).where(eq(siteAnnouncements.id, id));
  }

  async deleteSiteAnnouncement(id: number): Promise<void> {
    await db.delete(siteAnnouncements).where(eq(siteAnnouncements.id, id));
  }

  // 동영상 가이드 (관리자 등록, /guide 페이지에서 사용)
  async getGuideVideos(): Promise<{ id: number; title: string; description: string | null; youtubeUrl: string; sortOrder: number | null; createdAt: Date; updatedAt: Date }[]> {
    const rows = await db
      .select({
        id: guideVideos.id,
        title: guideVideos.title,
        description: guideVideos.description,
        youtubeUrl: guideVideos.youtubeUrl,
        sortOrder: guideVideos.sortOrder,
        createdAt: guideVideos.createdAt,
        updatedAt: guideVideos.updatedAt,
      })
      .from(guideVideos)
      .orderBy(guideVideos.sortOrder, desc(guideVideos.createdAt))
      .limit(50);
    return rows.map((r) => ({
      ...r,
      description: r.description ?? null,
      sortOrder: r.sortOrder ?? null,
      createdAt: r.createdAt ?? new Date(),
      updatedAt: r.updatedAt ?? new Date(),
    }));
  }

  async createGuideVideo(data: { title: string; description?: string; youtubeUrl: string; sortOrder?: number | null }): Promise<void> {
    await db.insert(guideVideos).values({
      title: data.title,
      description: data.description ?? null,
      youtubeUrl: data.youtubeUrl,
      sortOrder: data.sortOrder ?? null,
      updatedAt: new Date(),
    });
  }

  async updateGuideVideo(id: number, data: { title: string; description?: string; youtubeUrl: string; sortOrder?: number | null }): Promise<void> {
    await db
      .update(guideVideos)
      .set({
        title: data.title,
        description: data.description ?? null,
        youtubeUrl: data.youtubeUrl,
        sortOrder: data.sortOrder ?? null,
        updatedAt: new Date(),
      })
      .where(eq(guideVideos.id, id));
  }

  async deleteGuideVideo(id: number): Promise<void> {
    await db.delete(guideVideos).where(eq(guideVideos.id, id));
  }

  async getCuratedPlaylists(): Promise<{ id: number; name: string; description: string | null; slug: string; sortOrder: number; coverImageFilename: string | null; genreMain: string | null; genreSub: string | null }[]> {
    const baseRows = await db
      .select({
        id: curatedPlaylists.id,
        name: curatedPlaylists.name,
        description: curatedPlaylists.description,
        slug: curatedPlaylists.slug,
        sortOrder: curatedPlaylists.sortOrder,
        coverImageFilename: curatedPlaylists.coverImageFilename,
        genreMain: curatedPlaylists.genreMain,
        genreSub: curatedPlaylists.genreSub,
      })
      .from(curatedPlaylists)
      .orderBy(asc(curatedPlaylists.sortOrder), asc(curatedPlaylists.id));
    const results: { id: number; name: string; description: string | null; slug: string; sortOrder: number; coverImageFilename: string | null; genreMain: string | null; genreSub: string | null }[] = [];
    for (const pl of baseRows) {
      const explicitCover = pl.coverImageFilename;
      let coverImageFilename: string | null = explicitCover ?? null;
      if (!coverImageFilename) {
        const [firstTrack] = await db
          .select({ imageFilename: music.imageFilename })
          .from(curatedPlaylistMusic)
          .leftJoin(music, eq(curatedPlaylistMusic.musicId, music.id))
          .where(eq(curatedPlaylistMusic.curatedPlaylistId, pl.id))
          .orderBy(asc(curatedPlaylistMusic.sortOrder))
          .limit(1);
        coverImageFilename = firstTrack?.imageFilename ?? null;
      }
      results.push({
        id: pl.id,
        name: pl.name,
        description: pl.description,
        slug: pl.slug,
        sortOrder: pl.sortOrder,
        coverImageFilename,
        genreMain: pl.genreMain ?? null,
        genreSub: pl.genreSub ?? null,
      });
    }
    return results;
  }

  async getCuratedPlaylistBySlug(slug: string): Promise<{ id: number; name: string; description: string | null; slug: string; coverImageFilename: string | null; genreMain: string | null; genreSub: string | null; tracks: MusicWithUploaderTier[] } | null> {
    const [pl] = await db
      .select({
        id: curatedPlaylists.id,
        name: curatedPlaylists.name,
        description: curatedPlaylists.description,
        slug: curatedPlaylists.slug,
        coverImageFilename: curatedPlaylists.coverImageFilename,
        genreMain: curatedPlaylists.genreMain,
        genreSub: curatedPlaylists.genreSub,
      })
      .from(curatedPlaylists)
      .where(eq(curatedPlaylists.slug, slug));
    if (!pl) return null;
    const entries = await db
      .select({ musicId: curatedPlaylistMusic.musicId, sortOrder: curatedPlaylistMusic.sortOrder })
      .from(curatedPlaylistMusic)
      .where(eq(curatedPlaylistMusic.curatedPlaylistId, pl.id))
      .orderBy(asc(curatedPlaylistMusic.sortOrder));
    const musicIds = entries.map((e) => e.musicId);
    if (musicIds.length === 0) {
      return {
        id: pl.id,
        name: pl.name,
        description: pl.description,
        slug: pl.slug,
        coverImageFilename: pl.coverImageFilename ?? null,
        genreMain: pl.genreMain ?? null,
        genreSub: pl.genreSub ?? null,
        tracks: [],
      };
    }
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
      aiProvider: music.aiProvider,
      freeAiSiteRestrictions: music.freeAiSiteRestrictions,
      price: music.price,
      isDownloadable: music.isDownloadable,
      userId: music.userId,
      spotifyAlbumId: music.spotifyAlbumId,
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
      .where(inArray(music.id, musicIds));
    const orderMap = new Map(entries.map((e, i) => [e.musicId, i]));
    const now = new Date();
    const tracks: MusicWithUploaderTier[] = rows
      .map((r) => {
        const { _uploaderTier, _uploaderExpiresAt, _uploaderRole, ...rest } = r as typeof rows[0] & { _uploaderTier: string | null; _uploaderExpiresAt: Date | string | null; _uploaderRole: string | null };
const subscriptionPremium = (_uploaderTier === "pro" || _uploaderTier === "premium") && (_uploaderExpiresAt == null || new Date(_uploaderExpiresAt) > now);
      const isPremium = _uploaderRole === "admin" || subscriptionPremium;
        return { ...rest, uploaderSubscriptionTier: isPremium ? (_uploaderTier ?? "pro") : "free", uploaderDonationBadge: null } as MusicWithUploaderTier & { _sortOrder: number };
      })
      .map((t) => {
        const sortOrder = orderMap.get(t.id) ?? 999;
        return { ...t, _sortOrder: sortOrder };
      })
      .sort((a, b) => a._sortOrder - b._sortOrder)
      .map(({ _sortOrder, ...t }) => t as MusicWithUploaderTier);
    return {
      id: pl.id,
      name: pl.name,
      description: pl.description,
      slug: pl.slug,
      coverImageFilename: pl.coverImageFilename ?? null,
      genreMain: pl.genreMain ?? null,
      genreSub: pl.genreSub ?? null,
      tracks,
    };
  }

  async createCuratedPlaylist(data: { name: string; description?: string | null; slug: string; coverImageFilename?: string | null; genreMain?: string | null; genreSub?: string | null }): Promise<{ id: number }> {
    const [row] = await db
      .insert(curatedPlaylists)
      .values({
        name: data.name,
        description: data.description ?? null,
        slug: data.slug.trim().toLowerCase().replace(/\s+/g, "-"),
        coverImageFilename: data.coverImageFilename ?? null,
        genreMain: data.genreMain ?? null,
        genreSub: data.genreSub ?? null,
      })
      .returning({ id: curatedPlaylists.id });
    if (!row) throw new Error("Failed to create curated playlist");
    return { id: row.id };
  }

  async updateCuratedPlaylist(id: number, data: { name?: string; description?: string | null; slug?: string; sortOrder?: number; coverImageFilename?: string | null; genreMain?: string | null; genreSub?: string | null }): Promise<void> {
    const set: Record<string, unknown> = {};
    if (data.name !== undefined) set.name = data.name;
    if (data.description !== undefined) set.description = data.description;
    if (data.slug !== undefined) set.slug = data.slug.trim().toLowerCase().replace(/\s+/g, "-");
    if (data.sortOrder !== undefined) set.sortOrder = data.sortOrder;
    if (data.coverImageFilename !== undefined) set.coverImageFilename = data.coverImageFilename;
    if (data.genreMain !== undefined) set.genreMain = data.genreMain;
    if (data.genreSub !== undefined) set.genreSub = data.genreSub;
    if (Object.keys(set).length === 0) return;
    await db.update(curatedPlaylists).set(set as any).where(eq(curatedPlaylists.id, id));
  }

  async deleteCuratedPlaylist(id: number): Promise<void> {
    await db.delete(curatedPlaylistMusic).where(eq(curatedPlaylistMusic.curatedPlaylistId, id));
    await db.delete(curatedPlaylists).where(eq(curatedPlaylists.id, id));
  }

  async setCuratedPlaylistTracks(curatedPlaylistId: number, musicIds: number[]): Promise<void> {
    await db.delete(curatedPlaylistMusic).where(eq(curatedPlaylistMusic.curatedPlaylistId, curatedPlaylistId));
    if (musicIds.length === 0) return;
    await db.insert(curatedPlaylistMusic).values(
      musicIds.map((musicId, i) => ({
        curatedPlaylistId,
        musicId,
        sortOrder: i,
      }))
    );
  }

  async getCuratedPlaylistTrackIds(curatedPlaylistId: number): Promise<number[]> {
    const rows = await db
      .select({ musicId: curatedPlaylistMusic.musicId })
      .from(curatedPlaylistMusic)
      .where(eq(curatedPlaylistMusic.curatedPlaylistId, curatedPlaylistId))
      .orderBy(asc(curatedPlaylistMusic.sortOrder));
    return rows.map((r) => r.musicId);
  }

  // Radio channels
  async createRadioChannel(data: { ownerId: string; name: string; slug: string; description?: string | null; homepageUrl?: string | null; homeTickerText?: string | null; coverFilename?: string | null }): Promise<{ id: number }> {
    const [row] = await db.insert(radioChannels).values({
      ownerId: data.ownerId,
      name: data.name,
      slug: data.slug,
      description: data.description ?? null,
      homepageUrl: data.homepageUrl ?? null,
      homeTickerText: data.homeTickerText ?? null,
      coverFilename: data.coverFilename ?? null,
    }).returning({ id: radioChannels.id });
    return { id: row!.id };
  }

  async getRadioChannelByOwnerId(ownerId: string) {
    const [row] = await db.select({
      id: radioChannels.id,
      name: radioChannels.name,
      slug: radioChannels.slug,
      description: radioChannels.description,
      homepageUrl: radioChannels.homepageUrl,
      homeTickerText: radioChannels.homeTickerText,
      coverFilename: radioChannels.coverFilename,
      status: radioChannels.status,
      visibility: radioChannels.visibility,
      nowPlayingMusicId: radioChannels.nowPlayingMusicId,
      nowPlayingStartedAt: radioChannels.nowPlayingStartedAt,
    }).from(radioChannels).where(eq(radioChannels.ownerId, ownerId));
    return row;
  }

  async getRadioChannelBySlug(slug: string) {
    const [row] = await db.select({
      id: radioChannels.id,
      ownerId: radioChannels.ownerId,
      name: radioChannels.name,
      slug: radioChannels.slug,
      description: radioChannels.description,
      homepageUrl: radioChannels.homepageUrl,
      homeTickerText: radioChannels.homeTickerText,
      coverFilename: radioChannels.coverFilename,
      status: radioChannels.status,
      visibility: radioChannels.visibility,
      nowPlayingMusicId: radioChannels.nowPlayingMusicId,
      nowPlayingStartedAt: radioChannels.nowPlayingStartedAt,
      nowPlayingObjectPath: radioChannels.nowPlayingObjectPath,
      nowPlayingTempDurationSeconds: radioChannels.nowPlayingTempDurationSeconds,
      nowPlayingTempNextSnapshotIndex: radioChannels.nowPlayingTempNextSnapshotIndex,
      currentHostId: radioChannels.currentHostId,
      currentHostUsername: users.username,
      scheduledStartAt: radioChannels.scheduledStartAt,
      scheduledEndAt: radioChannels.scheduledEndAt,
      notice: radioChannels.notice,
      playlistSnapshot: radioChannels.playlistSnapshot,
    }).from(radioChannels).leftJoin(users, eq(radioChannels.currentHostId, users.id)).where(eq(radioChannels.slug, slug));
    if (!row) return undefined;
    const snap = row.playlistSnapshot as { musicIds?: number[]; durationsSeconds?: number[]; currentIndex?: number } | null;
    const playlistSnapshot = snap && Array.isArray(snap.musicIds) && Array.isArray(snap.durationsSeconds) && typeof snap.currentIndex === "number"
      ? { musicIds: snap.musicIds, durationsSeconds: snap.durationsSeconds, currentIndex: snap.currentIndex }
      : null;
    return {
      id: row.id,
      ownerId: row.ownerId,
      name: row.name,
      slug: row.slug,
      description: row.description,
      homepageUrl: row.homepageUrl ?? null,
      homeTickerText: row.homeTickerText ?? null,
      coverFilename: row.coverFilename,
      status: row.status,
      visibility: row.visibility,
      nowPlayingMusicId: row.nowPlayingMusicId,
      nowPlayingStartedAt: row.nowPlayingStartedAt,
      nowPlayingObjectPath: row.nowPlayingObjectPath ?? null,
      nowPlayingTempDurationSeconds: row.nowPlayingTempDurationSeconds ?? null,
      nowPlayingTempNextSnapshotIndex: row.nowPlayingTempNextSnapshotIndex ?? null,
      currentHostId: row.currentHostId ?? null,
      currentHostUsername: row.currentHostUsername ?? undefined,
      scheduledStartAt: row.scheduledStartAt ?? null,
      scheduledEndAt: row.scheduledEndAt ?? null,
      notice: row.notice ?? null,
      playlistSnapshot,
    };
  }

  async listLiveRadioChannels() {
    const rows = await db
      .select({
        id: radioChannels.id,
        ownerId: radioChannels.ownerId,
        name: radioChannels.name,
        slug: radioChannels.slug,
        description: radioChannels.description,
        coverFilename: radioChannels.coverFilename,
        scheduledStartAt: radioChannels.scheduledStartAt,
        scheduledEndAt: radioChannels.scheduledEndAt,
        notice: radioChannels.notice,
        updatedAt: radioChannels.updatedAt,
        homeTickerText: radioChannels.homeTickerText,
        ownerUsername: users.username,
        ownerFirstName: users.firstName,
      })
      .from(radioChannels)
      .leftJoin(users, eq(radioChannels.ownerId, users.id))
      .where(eq(radioChannels.status, "live"))
      .orderBy(desc(radioChannels.updatedAt));
    return rows.map((r) => {
      const display =
        `${(r.ownerFirstName || "").trim() || (r.ownerUsername || "").trim() || ""}`.trim() ||
        `${String(r.ownerId).slice(0, 8)}…`;
      return {
        id: r.id,
        ownerId: r.ownerId,
        name: r.name,
        slug: r.slug,
        description: r.description ?? null,
        coverFilename: r.coverFilename ?? null,
        scheduledStartAt: r.scheduledStartAt ?? null,
        scheduledEndAt: r.scheduledEndAt ?? null,
        notice: r.notice ?? null,
        updatedAt: r.updatedAt ?? null,
        ownerDisplayName: display,
        homeTickerText: r.homeTickerText ?? null,
      };
    });
  }

  async listLiveRadioChannelsForAutoAdvance(): Promise<{ id: number; slug: string; nowPlayingMusicId: number | null; nowPlayingObjectPath: string | null; nowPlayingStartedAt: Date; nowPlayingTempDurationSeconds: number | null; nowPlayingTempNextSnapshotIndex: number | null; playlistSnapshot: { musicIds: number[]; durationsSeconds: number[]; currentIndex: number } | null }[]> {
    const rows = await db.select({
      id: radioChannels.id,
      slug: radioChannels.slug,
      nowPlayingMusicId: radioChannels.nowPlayingMusicId,
      nowPlayingObjectPath: radioChannels.nowPlayingObjectPath,
      nowPlayingStartedAt: radioChannels.nowPlayingStartedAt,
      nowPlayingTempDurationSeconds: radioChannels.nowPlayingTempDurationSeconds,
      nowPlayingTempNextSnapshotIndex: radioChannels.nowPlayingTempNextSnapshotIndex,
      playlistSnapshot: radioChannels.playlistSnapshot,
    }).from(radioChannels).where(eq(radioChannels.status, "live"));
    const out: { id: number; slug: string; nowPlayingMusicId: number | null; nowPlayingObjectPath: string | null; nowPlayingStartedAt: Date; nowPlayingTempDurationSeconds: number | null; nowPlayingTempNextSnapshotIndex: number | null; playlistSnapshot: { musicIds: number[]; durationsSeconds: number[]; currentIndex: number } | null }[] = [];
    for (const r of rows) {
      if (!r.nowPlayingStartedAt) continue;
      const snap = r.playlistSnapshot as { musicIds?: number[]; durationsSeconds?: number[]; currentIndex?: number } | null;
      const playlistSnapshot = snap && Array.isArray(snap.musicIds) && Array.isArray(snap.durationsSeconds) && typeof snap.currentIndex === "number"
        ? { musicIds: snap.musicIds, durationsSeconds: snap.durationsSeconds, currentIndex: snap.currentIndex }
        : null;
      if (r.nowPlayingObjectPath != null) {
        if (playlistSnapshot == null || r.nowPlayingTempDurationSeconds == null || r.nowPlayingTempNextSnapshotIndex == null) continue;
        out.push({
          id: r.id,
          slug: r.slug,
          nowPlayingMusicId: null,
          nowPlayingObjectPath: r.nowPlayingObjectPath,
          nowPlayingStartedAt: r.nowPlayingStartedAt as Date,
          nowPlayingTempDurationSeconds: r.nowPlayingTempDurationSeconds,
          nowPlayingTempNextSnapshotIndex: r.nowPlayingTempNextSnapshotIndex,
          playlistSnapshot,
        });
      } else if (r.nowPlayingMusicId != null && playlistSnapshot != null) {
        out.push({
          id: r.id,
          slug: r.slug,
          nowPlayingMusicId: r.nowPlayingMusicId,
          nowPlayingObjectPath: null,
          nowPlayingStartedAt: r.nowPlayingStartedAt as Date,
          nowPlayingTempDurationSeconds: null,
          nowPlayingTempNextSnapshotIndex: null,
          playlistSnapshot,
        });
      }
    }
    return out;
  }

  async listAllRadioChannels(): Promise<{
    id: number;
    ownerId: string;
    name: string;
    slug: string;
    status: string;
    description: string | null;
    coverFilename: string | null;
    ownerUsername: string | null;
    updatedAt: Date | null;
  }[]> {
    const rows = await db.select({
      id: radioChannels.id,
      ownerId: radioChannels.ownerId,
      name: radioChannels.name,
      slug: radioChannels.slug,
      status: radioChannels.status,
      description: radioChannels.description,
      coverFilename: radioChannels.coverFilename,
      ownerUsername: users.username,
      ownerFirstName: users.firstName,
      updatedAt: radioChannels.updatedAt,
    }).from(radioChannels).leftJoin(users, eq(radioChannels.ownerId, users.id)).orderBy(desc(radioChannels.updatedAt));
    return rows.map((r) => {
      const display =
        `${(r.ownerFirstName || "").trim() || (r.ownerUsername || "").trim() || ""}`.trim() ||
        `${String(r.ownerId).slice(0, 8)}…`;
      return {
        id: r.id,
        ownerId: r.ownerId,
        name: r.name,
        slug: r.slug,
        status: r.status,
        description: r.description ?? null,
        coverFilename: r.coverFilename ?? null,
        ownerUsername: r.ownerUsername ?? null,
        ownerDisplayName: display,
        updatedAt: r.updatedAt ?? null,
      };
    });
  }

  async updateRadioChannel(id: number, data: { name?: string; slug?: string; description?: string | null; homepageUrl?: string | null; homeTickerText?: string | null; coverFilename?: string | null; status?: string; visibility?: string; nowPlayingMusicId?: number | null; nowPlayingStartedAt?: Date | null; nowPlayingObjectPath?: string | null; nowPlayingTempDurationSeconds?: number | null; nowPlayingTempNextSnapshotIndex?: number | null; currentHostId?: string | null; scheduledStartAt?: Date | null; scheduledEndAt?: Date | null; notice?: string | null; playlistSnapshot?: { musicIds: number[]; durationsSeconds: number[]; currentIndex: number } | null }): Promise<void> {
    const set: Record<string, unknown> = { updatedAt: new Date() };
    if (data.name !== undefined) set.name = data.name;
    if (data.slug !== undefined) set.slug = data.slug;
    if (data.description !== undefined) set.description = data.description;
    if (data.homepageUrl !== undefined) set.homepageUrl = data.homepageUrl;
    if (data.homeTickerText !== undefined) set.homeTickerText = data.homeTickerText;
    if (data.coverFilename !== undefined) set.coverFilename = data.coverFilename;
    if (data.status !== undefined) set.status = data.status;
    if (data.visibility !== undefined) set.visibility = data.visibility;
    if (data.nowPlayingMusicId !== undefined) set.nowPlayingMusicId = data.nowPlayingMusicId;
    if (data.nowPlayingStartedAt !== undefined) set.nowPlayingStartedAt = data.nowPlayingStartedAt;
    if (data.nowPlayingObjectPath !== undefined) set.nowPlayingObjectPath = data.nowPlayingObjectPath;
    if (data.nowPlayingTempDurationSeconds !== undefined) set.nowPlayingTempDurationSeconds = data.nowPlayingTempDurationSeconds;
    if (data.nowPlayingTempNextSnapshotIndex !== undefined) set.nowPlayingTempNextSnapshotIndex = data.nowPlayingTempNextSnapshotIndex;
    if (data.currentHostId !== undefined) set.currentHostId = data.currentHostId;
    if (data.scheduledStartAt !== undefined) set.scheduledStartAt = data.scheduledStartAt;
    if (data.scheduledEndAt !== undefined) set.scheduledEndAt = data.scheduledEndAt;
    if (data.notice !== undefined) set.notice = data.notice;
    if (data.playlistSnapshot !== undefined) set.playlistSnapshot = data.playlistSnapshot;
    await db.update(radioChannels).set(set as any).where(eq(radioChannels.id, id));
  }

  async deleteRadioChannel(id: number): Promise<void> {
    await db.delete(radioChannels).where(eq(radioChannels.id, id));
  }

  async createRadioChatMessage(channelId: number, userId: string, content: string) {
    const [row] = await db.insert(radioChatMessages).values({ channelId, userId, content }).returning();
    return row as { id: number; channelId: number; userId: string; content: string; createdAt: Date };
  }

  async getRadioChatMessages(channelId: number, limit = 100) {
    const rows = await db.select({
      id: radioChatMessages.id,
      channelId: radioChatMessages.channelId,
      userId: radioChatMessages.userId,
      content: radioChatMessages.content,
      createdAt: radioChatMessages.createdAt,
      username: users.username,
      firstName: users.firstName,
    })
      .from(radioChatMessages)
      .leftJoin(users, eq(radioChatMessages.userId, users.id))
      .where(eq(radioChatMessages.channelId, channelId))
      .orderBy(desc(radioChatMessages.createdAt))
      .limit(limit);
    return rows.reverse().map((r) => ({
      id: r.id,
      channelId: r.channelId,
      userId: r.userId,
      content: r.content,
      createdAt: r.createdAt,
      username:
        (r.firstName && String(r.firstName).trim()) ||
        (r.username && String(r.username).trim()) ||
        (r.userId ? String(r.userId).slice(0, 8) : null),
    }));
  }

  async deleteRadioChatMessagesByChannel(channelId: number): Promise<void> {
    await db.delete(radioChatMessages).where(eq(radioChatMessages.channelId, channelId));
  }

  async deleteRadioChatMessagesOlderThanDays(days: number): Promise<void> {
    const safeDays = Number.isFinite(days) && days > 0 ? days : 1;
    const cutoff = new Date(Date.now() - safeDays * 24 * 60 * 60 * 1000);
    await db.delete(radioChatMessages).where(lte(radioChatMessages.createdAt, cutoff));
  }

  async createRadioSongRequest(data: { channelId: number; userId: string; musicId?: number | null; title?: string | null; artist?: string | null; message?: string | null }) {
    const [row] = await db.insert(radioSongRequests).values({
      channelId: data.channelId,
      userId: data.userId,
      musicId: data.musicId ?? null,
      title: data.title ?? null,
      artist: data.artist ?? null,
      message: data.message ?? null,
    }).returning();
    return row as { id: number; channelId: number; userId: string; musicId: number | null; title: string | null; artist: string | null; message: string | null; status: string; sortOrder: number; createdAt: Date };
  }

  async getRadioSongRequestsByChannel(channelId: number, status?: string) {
    const rows = await db.select({
      id: radioSongRequests.id,
      channelId: radioSongRequests.channelId,
      userId: radioSongRequests.userId,
      musicId: radioSongRequests.musicId,
      title: radioSongRequests.title,
      artist: radioSongRequests.artist,
      message: radioSongRequests.message,
      status: radioSongRequests.status,
      sortOrder: radioSongRequests.sortOrder,
      createdAt: radioSongRequests.createdAt,
      musicTitle: music.title,
      musicArtist: music.artist,
    })
      .from(radioSongRequests)
      .leftJoin(music, eq(radioSongRequests.musicId, music.id))
      .where(status ? and(eq(radioSongRequests.channelId, channelId), eq(radioSongRequests.status, status)) : eq(radioSongRequests.channelId, channelId))
      .orderBy(asc(radioSongRequests.sortOrder), asc(radioSongRequests.createdAt));
    return rows.map((r) => ({
      id: r.id,
      channelId: r.channelId,
      userId: r.userId,
      musicId: r.musicId,
      title: r.title,
      artist: r.artist,
      message: r.message,
      status: r.status,
      sortOrder: r.sortOrder,
      createdAt: r.createdAt,
      musicTitle: r.musicTitle ?? null,
      musicArtist: r.musicArtist ?? null,
    }));
  }

  async updateRadioSongRequest(id: number, channelId: number, data: { status?: string; sortOrder?: number }) {
    const set: Record<string, unknown> = {};
    if (data.status !== undefined) set.status = data.status;
    if (data.sortOrder !== undefined) set.sortOrder = data.sortOrder;
    if (Object.keys(set).length === 0) return;
    await db.update(radioSongRequests).set(set as any).where(and(eq(radioSongRequests.id, id), eq(radioSongRequests.channelId, channelId)));
  }

  async getRadioChannelStaff(channelId: number) {
    const rows = await db.select({
      id: radioChannelStaff.id,
      channelId: radioChannelStaff.channelId,
      userId: radioChannelStaff.userId,
      role: radioChannelStaff.role,
      username: users.username,
    })
      .from(radioChannelStaff)
      .leftJoin(users, eq(radioChannelStaff.userId, users.id))
      .where(eq(radioChannelStaff.channelId, channelId));
    return rows.map((r) => ({
      id: r.id,
      channelId: r.channelId,
      userId: r.userId,
      role: r.role,
      username: r.username ?? null,
    }));
  }

  async isRadioChannelStaff(channelId: number, userId: string): Promise<boolean> {
    const [row] = await db.select({ id: radioChannelStaff.id })
      .from(radioChannelStaff)
      .where(and(eq(radioChannelStaff.channelId, channelId), eq(radioChannelStaff.userId, userId)));
    return !!row;
  }

  async addRadioChannelStaff(channelId: number, userId: string, role: string): Promise<void> {
    const validRole = role === "sub_host" ? "sub_host" : role === "cj" ? "cj" : "staff";
    await db.insert(radioChannelStaff).values({
      channelId,
      userId,
      role: validRole,
    }).onConflictDoUpdate({
      target: [radioChannelStaff.channelId, radioChannelStaff.userId],
      set: { role: validRole },
    });
  }

  async removeRadioChannelStaff(channelId: number, userId: string): Promise<void> {
    await db.delete(radioChannelStaff).where(and(eq(radioChannelStaff.channelId, channelId), eq(radioChannelStaff.userId, userId)));
  }

  async getUserIdByUsername(username: string): Promise<string | undefined> {
    const term = username.trim();
    if (!term) return undefined;
    const [row] = await db.select({ id: users.id }).from(users).where(
      or(
        sql`lower(${users.username}) = lower(${term})`,
        sql`lower(${users.email}) = lower(${term})`
      )
    );
    return row?.id;
  }
}

export const storage = new DatabaseStorage();
