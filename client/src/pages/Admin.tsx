import { useState, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Navigation } from "@/components/Navigation";
import { useAuth } from "@/hooks/use-auth";
import { useLocation } from "wouter";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { useTranslation } from 'react-i18next';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from "recharts";
import {
  Users,
  Music,
  Heart,
  MessageSquare,
  RefreshCw,
  Trash2,
  ShieldCheck,
  Shield,
  Loader2,
  Flag,
  CheckCircle,
  XCircle,
  Clock,
  Search,
  Banknote,
  Database,
  HardDrive,
  Landmark,
  Activity,
  Calendar,
  UserCheck,
  Eye,
  Coins,
  Megaphone,
  Video,
  ListMusic,
} from "lucide-react";
import { PageTransition } from "@/components/PageTransition";
import { useUpload } from "@/hooks/use-upload";

const reasonLabels: Record<string, string> = {
  unauthorized_use: "무단 사용",
  plagiarism: "표절",
  false_attribution: "허위 아티스트 표기",
  ai_without_credit: "AI 생성물 미표기",
  other: "기타",
};

const statusLabels: Record<string, string> = {
  pending: "대기중",
  reviewing: "검토중",
  resolved: "처리완료",
  rejected: "반려",
};

const curatedMainGenres: Record<string, string[]> = {
  "팝뮤직": ["팝발라드", "댄스팝", "일렉트로팝", "인디팝", "틴팝", "신스팝", "드림팝", "시티팝"],
  "국내가요": ["케이팝", "발라드", "트로트", "국내OST", "어쿠스틱가요"],
  "월드뮤직": ["라틴음악", "아프로비트", "레게", "플라멩코", "켈틱", "인도음악", "중동음악"],
  "경음악": ["재즈", "클래식", "뉴에이지", "태교음악", "카페음악"],
  "기타": [],
};

export default function Admin() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { uploadFile: uploadCuratedImage, isUploading: isUploadingCuratedImage } = useUpload();
  const [userSearch, setUserSearch] = useState("");
  const [reportStatusFilter, setReportStatusFilter] = useState("all");
  const [withdrawalFilter, setWithdrawalFilter] = useState("all");
  const [adminNotes, setAdminNotes] = useState<Record<number, string>>({});
  const [savingLocal, setSavingLocal] = useState(false);
  const [savingServer, setSavingServer] = useState(false);
  const [backupPwOpen, setBackupPwOpen] = useState(false);
  const [backupPw, setBackupPw] = useState("");
  const [backupPwError, setBackupPwError] = useState("");
  const [showBackupPw, setShowBackupPw] = useState(false);
  const backupPwRef = useRef<HTMLInputElement>(null);
  const [withdrawalNotes, setWithdrawalNotes] = useState<Record<number, string>>({});
  const [announcementContent, setAnnouncementContent] = useState("");
  const [announcementImageUrl, setAnnouncementImageUrl] = useState("");
  const [announcementTextSize, setAnnouncementTextSize] = useState<"sm" | "md" | "lg">("md");
  const [announcementStartsAt, setAnnouncementStartsAt] = useState("");
  const [announcementEndsAt, setAnnouncementEndsAt] = useState("");
  const [guideVideoTitle, setGuideVideoTitle] = useState("");
  const [guideVideoDescription, setGuideVideoDescription] = useState("");
  const [guideVideoYoutubeUrl, setGuideVideoYoutubeUrl] = useState("");
  const [guideVideoSortOrder, setGuideVideoSortOrder] = useState<number | "">("");
  const [curatedName, setCuratedName] = useState("");
  const [curatedDesc, setCuratedDesc] = useState("");
  const [curatedSlug, setCuratedSlug] = useState("");
  const [curatedTracksDialogId, setCuratedTracksDialogId] = useState<number | null>(null);
  const [curatedTracksText, setCuratedTracksText] = useState("");
  const [curatedGenreMainForFill, setCuratedGenreMainForFill] = useState<string>("");
  const [curatedGenreSubForFill, setCuratedGenreSubForFill] = useState<string>("");
  const [curatedCoverFile, setCuratedCoverFile] = useState<File | null>(null);
  const [curatedCoverPreview, setCuratedCoverPreview] = useState<string | null>(null);
  const [curatedMainGenre, setCuratedMainGenre] = useState<string>("");
  const [curatedSubGenre, setCuratedSubGenre] = useState<string>("");
  const curatedSubGenres = curatedMainGenre ? curatedMainGenres[curatedMainGenre] || [] : [];

  const { data: adminCheck, isLoading: checkingAdmin } = useQuery<{ isAdmin: boolean }>({
    queryKey: ["/api/admin/check"],
    enabled: !!user,
  });

  const { data: stats, isLoading: loadingStats } = useQuery<{
    totalUsers: number;
    totalMusic: number;
    totalLikes: number;
    totalComments: number;
  }>({
    queryKey: ["/api/admin/stats"],
    enabled: adminCheck?.isAdmin === true,
  });

  const { data: visitorData } = useQuery<{ count: number }>({
    queryKey: ["/api/admin/visitor-count"],
    queryFn: async () => {
      const res = await fetch("/api/admin/visitor-count", { credentials: "include" });
      if (!res.ok) return { count: 0 };
      return res.json();
    },
    enabled: adminCheck?.isAdmin === true,
    refetchInterval: 15000,
  });

  const { data: analytics, isLoading: loadingAnalytics } = useQuery<{
    dailyVisitors: number;
    totalVisitors: number;
    pageViewsToday: number;
    pageViewsTotal: number;
  }>({
    queryKey: ["/api/admin/analytics"],
    queryFn: async () => {
      const res = await fetch("/api/admin/analytics", { credentials: "include" });
      if (!res.ok) return { dailyVisitors: 0, totalVisitors: 0, pageViewsToday: 0, pageViewsTotal: 0 };
      return res.json();
    },
    enabled: adminCheck?.isAdmin === true,
    refetchInterval: 60000,
  });

  const { data: analyticsStatus } = useQuery<{ tableExists: boolean }>({
    queryKey: ["/api/admin/analytics/status"],
    queryFn: async () => {
      const res = await fetch("/api/admin/analytics/status", { credentials: "include" });
      if (!res.ok) return { tableExists: false };
      return res.json();
    },
    enabled: adminCheck?.isAdmin === true,
    refetchInterval: 60000,
  });

  const { data: creditsChargedData } = useQuery<{ totalCreditsCharged: number }>({
    queryKey: ["/api/admin/credits-charged"],
    queryFn: async () => {
      const res = await fetch("/api/admin/credits-charged", { credentials: "include" });
      if (!res.ok) return { totalCreditsCharged: 0 };
      return res.json();
    },
    enabled: adminCheck?.isAdmin === true,
    refetchInterval: 60000,
  });

  const { data: statsByRegion } = useQuery<{ countryCode: string | null; region: string | null; count: number }[]>({
    queryKey: ["/api/admin/stats/regions"],
    queryFn: async () => {
      const res = await fetch("/api/admin/stats/regions", { credentials: "include" });
      if (!res.ok) return [];
      const data = await res.json();
      return Array.isArray(data) ? data : [];
    },
    enabled: adminCheck?.isAdmin === true,
    refetchInterval: 60000,
  });

  const { data: statsByDevice } = useQuery<{ deviceType: string | null; count: number }[]>({
    queryKey: ["/api/admin/stats/devices"],
    queryFn: async () => {
      const res = await fetch("/api/admin/stats/devices", { credentials: "include" });
      if (!res.ok) return [];
      const data = await res.json();
      return Array.isArray(data) ? data : [];
    },
    enabled: adminCheck?.isAdmin === true,
    refetchInterval: 60000,
  });

  const [analyticsTrendDays, setAnalyticsTrendDays] = useState(7);
  const { data: analyticsTrend } = useQuery<{ date: string; uniqueVisitors: number; pageViews: number }[]>({
    queryKey: ["/api/admin/analytics/trend", analyticsTrendDays],
    queryFn: async () => {
      const res = await fetch(`/api/admin/analytics/trend?days=${analyticsTrendDays}`, { credentials: "include" });
      if (!res.ok) return [];
      const data = await res.json();
      return Array.isArray(data) ? data : [];
    },
    enabled: adminCheck?.isAdmin === true,
    refetchInterval: 60000,
  });

  const { data: statsBySource } = useQuery<{ source: string; count: number }[]>({
    queryKey: ["/api/admin/stats/sources"],
    queryFn: async () => {
      const res = await fetch("/api/admin/stats/sources", { credentials: "include" });
      if (!res.ok) return [];
      const data = await res.json();
      return Array.isArray(data) ? data : [];
    },
    enabled: adminCheck?.isAdmin === true,
    refetchInterval: 60000,
  });

  const { data: siteAnnouncementsList, refetch: refetchSiteAnnouncements } = useQuery<{ id: number; content: string; imageUrl: string | null; startsAt: string; endsAt: string; createdAt: string }[]>({
    queryKey: ["/api/admin/site-announcements"],
    queryFn: async () => {
      const res = await fetch("/api/admin/site-announcements", { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: adminCheck?.isAdmin === true,
  });

  type GuideVideoItem = { id: number; title: string; description: string | null; youtubeUrl: string; sortOrder: number | null; createdAt: string; updatedAt: string };
  const { data: guideVideosList, refetch: refetchGuideVideos } = useQuery<GuideVideoItem[]>({
    queryKey: ["/api/admin/guide-videos"],
    queryFn: async () => {
      const res = await fetch("/api/admin/guide-videos", { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: adminCheck?.isAdmin === true,
  });

  const { data: curatedPlaylistsList, refetch: refetchCurated } = useQuery<{ id: number; name: string; description: string | null; slug: string; sortOrder: number; coverImageFilename?: string | null; genreMain?: string | null; genreSub?: string | null }[]>({
    queryKey: ["/api/admin/curated-playlists"],
    queryFn: async () => {
      const res = await fetch("/api/admin/curated-playlists", { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: adminCheck?.isAdmin === true,
  });

  const createCuratedMutation = useMutation({
    mutationFn: async (body: { name: string; description?: string | null; slug: string; coverImageFilename?: string | null; genreMain?: string | null; genreSub?: string | null }) => {
      const res = await fetch("/api/admin/curated-playlists", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d?.message || "Failed");
      }
    },
    onSuccess: () => {
      refetchCurated();
      setCuratedName("");
      setCuratedDesc("");
      setCuratedSlug("");
      setCuratedMainGenre("");
      setCuratedSubGenre("");
      setCuratedCoverFile(null);
      setCuratedCoverPreview(null);
      toast({ title: t('admin.curatedCreated', '테마 플레이리스트가 추가되었습니다.') });
    },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const deleteCuratedMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/admin/curated-playlists/${id}`, { method: "DELETE", credentials: "include" });
      if (!res.ok) throw new Error("Failed");
    },
    onSuccess: () => {
      refetchCurated();
      toast({ title: t('admin.curatedDeleted', '삭제되었습니다.') });
    },
  });

  const setCuratedTracksMutation = useMutation({
    mutationFn: async ({ id, musicIds }: { id: number; musicIds: number[] }) => {
      const res = await fetch(`/api/admin/curated-playlists/${id}/tracks`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ musicIds }),
      });
      if (!res.ok) throw new Error("Failed");
    },
    onSuccess: () => {
      setCuratedTracksDialogId(null);
      setCuratedTracksText("");
      refetchCurated();
      toast({ title: t('admin.curatedTracksSaved', '트랙이 저장되었습니다.') });
    },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const createGuideVideoMutation = useMutation({
    mutationFn: async (body: { title: string; description?: string; youtubeUrl: string; sortOrder?: number | null }) => {
      const res = await fetch("/api/admin/guide-videos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || "저장 실패");
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/guide-videos"] });
      queryClient.invalidateQueries({ queryKey: ["/api/guide-videos"] });
      toast({ title: t('admin.guideVideoAdded', '동영상 가이드가 추가되었습니다.') });
      setGuideVideoTitle("");
      setGuideVideoDescription("");
      setGuideVideoYoutubeUrl("");
      setGuideVideoSortOrder("");
    },
    onError: (err: any) => {
      toast({ title: err?.message || "저장 실패", variant: "destructive" });
    },
  });

  const deleteGuideVideoMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", "/api/admin/guide-videos/" + id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/guide-videos"] });
      queryClient.invalidateQueries({ queryKey: ["/api/guide-videos"] });
      toast({ title: t('admin.guideVideoDeleted', '동영상 가이드가 삭제되었습니다') });
    },
    onError: (err: any) => {
      toast({ title: err?.message || "삭제 실패", variant: "destructive" });
    },
  });

  const saveAnnouncementMutation = useMutation({
    mutationFn: async (body: { content: string; imageUrl?: string | null; startsAt: string; endsAt: string }) => {
      const res = await fetch("/api/admin/site-announcements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || "저장 실패");
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/site-announcements"] });
      toast({ title: t('admin.announcementSaved', '공지가 저장되었습니다. 설정한 기간에 메인 접속 시 팝업으로 노출됩니다.') });
      setAnnouncementContent("");
      setAnnouncementImageUrl("");
      setAnnouncementStartsAt("");
      setAnnouncementEndsAt("");
    },
    onError: (err: any) => {
      toast({ title: err?.message || "저장 실패", variant: "destructive" });
    },
  });

  const deleteAnnouncementMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", "/api/admin/site-announcements/" + id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/site-announcements"] });
      toast({ title: t('admin.announcementDeleted', '공지가 삭제되었습니다') });
    },
  });

  const { data: adminPosts, isLoading: loadingPosts } = useQuery<any[]>({
    queryKey: ["/api/admin/posts"],
    enabled: adminCheck?.isAdmin === true,
  });

  const { data: adminUsers, isLoading: loadingUsers, refetch: refetchUsers } = useQuery<any[]>({
    queryKey: ["/api/admin/users", userSearch],
    queryFn: async () => {
      const url = userSearch ? `/api/admin/users?search=${encodeURIComponent(userSearch)}` : "/api/admin/users";
      const res = await fetch(url, { credentials: "include", cache: "no-store" });
      if (!res.ok) throw new Error("Failed to fetch users");
      return res.json();
    },
    enabled: adminCheck?.isAdmin === true,
  });

  const deletePostMutation = useMutation({
    mutationFn: async (postId: number) => {
      await apiRequest("DELETE", "/api/admin/posts/" + postId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/posts"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/stats"] });
      toast({ title: t('admin.postDeleted', '게시글이 삭제되었습니다') });
    },
  });

  const deleteUserMutation = useMutation({
    mutationFn: async (userId: string) => {
      await apiRequest("DELETE", "/api/admin/users/" + userId, undefined, { timeoutMs: 120000 });
    },
    onSuccess: async () => {
      await queryClient.refetchQueries({ queryKey: ["/api/admin/users"] });
      await queryClient.refetchQueries({ queryKey: ["/api/admin/stats"] });
      toast({ title: t('admin.userDeleted', '회원이 삭제되었습니다') });
    },
    onError: (err: any) => {
      toast({ title: err?.message || t('admin.deleteFailed', '삭제에 실패했습니다'), variant: "destructive" });
    },
  });

  const updateRoleMutation = useMutation({
    mutationFn: async ({ userId, role }: { userId: string; role: string }) => {
      await apiRequest("PATCH", "/api/admin/users/" + userId + "/role", { role });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      toast({ title: t('admin.roleChanged', '권한이 변경되었습니다') });
    },
    onError: (err: any) => {
      toast({ title: err?.message || t('admin.roleChangeFailed', '권한 변경에 실패했습니다'), variant: "destructive" });
    },
  });

  const updateSubscriptionMutation = useMutation({
    mutationFn: async ({ userId, tier }: { userId: string; tier: string }) => {
      await apiRequest("PATCH", "/api/admin/users/" + userId + "/subscription", { tier });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      toast({ title: t('admin.subscriptionChanged', '구독 상태가 변경되었습니다') });
    },
    onError: (err: any) => {
      toast({ title: err?.message || t('admin.subscriptionChangeFailed', '구독 상태 변경에 실패했습니다'), variant: "destructive" });
    },
  });

  const { data: copyrightReports, isLoading: loadingReports } = useQuery<any[]>({
    queryKey: ["/api/admin/copyright-reports", reportStatusFilter],
    queryFn: async () => {
      const url = reportStatusFilter !== "all"
        ? `/api/admin/copyright-reports?status=${reportStatusFilter}`
        : "/api/admin/copyright-reports";
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch reports");
      return res.json();
    },
    enabled: adminCheck?.isAdmin === true,
  });

  const updateReportMutation = useMutation({
    mutationFn: async ({ id, status, adminNote }: { id: number; status: string; adminNote?: string }) => {
      await apiRequest("PATCH", "/api/admin/copyright-reports/" + id, { status, adminNote });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/copyright-reports"] });
      toast({ title: t('admin.reportUpdated', '신고 상태가 업데이트되었습니다') });
    },
    onError: (err: any) => {
      toast({ title: err?.message || t('admin.updateFailed', '업데이트에 실패했습니다'), variant: "destructive" });
    },
  });

  const { data: adminWithdrawals, isLoading: loadingWithdrawals } = useQuery<any[]>({
    queryKey: ["/api/admin/withdrawals", withdrawalFilter],
    queryFn: async () => {
      const url = withdrawalFilter !== "all"
        ? `/api/admin/withdrawals?status=${withdrawalFilter}`
        : "/api/admin/withdrawals";
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch withdrawals");
      return res.json();
    },
    enabled: adminCheck?.isAdmin === true,
  });

  const updateWithdrawalMutation = useMutation({
    mutationFn: async ({ id, status, adminNote }: { id: number; status: string; adminNote?: string }) => {
      await apiRequest("PATCH", "/api/admin/withdrawals/" + id, { status, adminNote });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/withdrawals"] });
      toast({ title: t('admin.withdrawalUpdated', '출금 상태가 업데이트되었습니다') });
    },
    onError: (err: any) => {
      toast({ title: err?.message || t('admin.updateFailed', '업데이트에 실패했습니다'), variant: "destructive" });
    },
  });

  const { data: pendingBankPayments, isLoading: loadingPendingBank } = useQuery<any[]>({
    queryKey: ["/api/admin/pending-bank-payments"],
    queryFn: async () => {
      const res = await fetch("/api/admin/pending-bank-payments", { credentials: "include", cache: "no-store" });
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
    enabled: adminCheck?.isAdmin === true,
  });

  const confirmBankMutation = useMutation({
    mutationFn: async (paymentId: string) => {
      await apiRequest("POST", `/api/admin/payments/${paymentId}/confirm-bank`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/pending-bank-payments"] });
      toast({ title: t('admin.bankPaymentConfirmed', '입금 확인 처리되었습니다') });
    },
    onError: (err: any) => {
      toast({ title: err?.message || t('admin.updateFailed', '업데이트에 실패했습니다'), variant: "destructive" });
    },
  });

  const deleteBankMutation = useMutation({
    mutationFn: async (paymentId: string) => {
      const res = await apiRequest("DELETE", `/api/admin/payments/${paymentId}`);
      if (!res.ok) throw new Error("삭제에 실패했습니다");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/pending-bank-payments"] });
      toast({ title: t('admin.paymentDeleted', '입금 대기 건이 삭제되었습니다') });
    },
    onError: (err: any) => {
      toast({ title: err?.message || t('admin.deleteFailed', '삭제에 실패했습니다'), variant: "destructive" });
    },
  });

  const { data: userReportsList, isLoading: loadingUserReports } = useQuery<any[]>({
    queryKey: ["/api/admin/user-reports"],
    queryFn: async () => {
      const res = await fetch("/api/admin/user-reports", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
    enabled: adminCheck?.isAdmin === true,
  });

  const updateUserReportMutation = useMutation({
    mutationFn: async ({ id, status, adminNote }: { id: number; status: string; adminNote?: string }) => {
      await apiRequest("PATCH", "/api/admin/user-reports/" + id, { status, adminNote });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/user-reports"] });
      toast({ title: t('admin.reportUpdated', '신고 상태가 업데이트되었습니다') });
    },
    onError: (err: any) => {
      toast({ title: err?.message || t('admin.updateFailed', '업데이트에 실패했습니다'), variant: "destructive" });
    },
  });

  if (checkingAdmin) {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <Navigation />
        <div className="flex items-center justify-center min-h-[60vh]">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      </div>
    );
  }

  if (!user || !adminCheck?.isAdmin) {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <Navigation />
        <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
          <Shield className="w-16 h-16 text-muted-foreground" />
          <h1 className="text-2xl font-bold" data-testid="text-access-denied">{t('admin.accessDenied', '접근 권한이 없습니다')}</h1>
          <p className="text-muted-foreground">{t('admin.adminOnly', '관리자만 접근할 수 있는 페이지입니다')}</p>
          <Button onClick={() => setLocation("/")} data-testid="button-go-home">{t('admin.goHome', '홈으로 돌아가기')}</Button>
        </div>
      </div>
    );
  }

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  };

  const formatDateTime = (dateStr: string) => {
    const d = new Date(dateStr);
    return `${formatDate(dateStr)} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  };

  return (
    <PageTransition>
      <div className="min-h-screen bg-background flex flex-col">
        <Navigation />
        <div className="container max-w-6xl mx-auto px-4 py-8">
          <h1 className="text-2xl font-bold mb-6" data-testid="text-admin-title">{t('admin.dashboard', '관리자 대시보드')}</h1>

          <Tabs defaultValue="stats" className="w-full">
            <TabsList className="mb-4 flex flex-wrap gap-1 h-auto">
              <TabsTrigger value="stats" className="gap-1.5">
                {t('admin.statsOverview', '통계')}
                <Badge variant="secondary" className="ml-0.5 text-[10px] h-5 px-1.5">{stats?.totalUsers ?? "-"}</Badge>
              </TabsTrigger>
              <TabsTrigger value="posts" className="gap-1.5">
                {t('admin.postManagement', '글 관리')}
                <Badge variant="secondary" className="ml-0.5 text-[10px] h-5 px-1.5" data-testid="badge-posts-count">{adminPosts?.length ?? 0}</Badge>
              </TabsTrigger>
              <TabsTrigger value="copyright" className="gap-1.5">
                {t('admin.copyrightManagement', '저작권')}
                <Badge variant="secondary" className="ml-0.5 text-[10px] h-5 px-1.5" data-testid="badge-copyright-count">{copyrightReports?.length ?? 0}</Badge>
              </TabsTrigger>
              <TabsTrigger value="user-reports" className="gap-1.5">
                {t('admin.userReports', '회원 신고')}
                <Badge variant="secondary" className="ml-0.5 text-[10px] h-5 px-1.5" data-testid="badge-user-reports-count">{userReportsList?.length ?? 0}</Badge>
              </TabsTrigger>
              <TabsTrigger value="users" className="gap-1.5">
                {t('admin.userManagement', '회원')}
                <Badge variant="secondary" className="ml-0.5 text-[10px] h-5 px-1.5" data-testid="badge-users-count">{stats?.totalUsers ?? adminUsers?.length ?? 0}</Badge>
              </TabsTrigger>
              <TabsTrigger value="bank" className="gap-1.5">
                {t('admin.pendingBankPayments', '입금 대기')}
                <Badge variant="secondary" className="ml-0.5 text-[10px] h-5 px-1.5" data-testid="badge-bank-count">{pendingBankPayments?.length ?? 0}</Badge>
              </TabsTrigger>
              <TabsTrigger value="withdrawal" className="gap-1.5">
                {t('admin.withdrawalManagement', '출금')}
                <Badge variant="secondary" className="ml-0.5 text-[10px] h-5 px-1.5" data-testid="badge-withdrawal-count">{adminWithdrawals?.length ?? 0}</Badge>
              </TabsTrigger>
              <TabsTrigger value="announcement">{t('admin.siteAnnouncement', '공지 팝업')}</TabsTrigger>
              <TabsTrigger value="guide-videos">{t('admin.guideVideos', '동영상 가이드 관리')}</TabsTrigger>
              <TabsTrigger value="curated">{t('admin.curatedPlaylists', '테마 플레이리스트')}</TabsTrigger>
              <TabsTrigger value="backup">{t('admin.databaseBackup', '백업')}</TabsTrigger>
            </TabsList>
            <TabsContent value="stats">
        {/* 통계 총괄 */}
        <section className="mb-10">
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2" data-testid="text-stats-section">
            <Activity size={18} className="text-primary" />
            {t('admin.statsOverview', '통계')}
          </h2>

          {analyticsStatus?.tableExists === false && (
            <Alert variant="destructive" className="mb-4 border-amber-500/50 bg-amber-500/10 text-amber-700 dark:text-amber-400 dark:bg-amber-500/10">
              <AlertTitle>{t('admin.analyticsTableMissingTitle', '방문/페이지뷰 통계 테이블 없음')}</AlertTitle>
              <AlertDescription>
                {t('admin.analyticsTableMissingDesc', 'analytics_visits 테이블이 DB에 없어 일일·누적 방문자, 페이지뷰, 지역/디바이스 통계가 0으로 나옵니다. 서버에서 deploy/create-analytics-table.sql 을 실행해 주세요. (예: psql "$DATABASE_URL" -f deploy/create-analytics-table.sql)')}
              </AlertDescription>
            </Alert>
          )}

          {/* 방문자·페이지뷰 */}
          <h3 className="text-sm font-medium text-muted-foreground mb-3 flex items-center gap-1.5">
            <Eye size={16} />
            {t('admin.visitorAndPageViews', '방문자 · 페이지뷰')}
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 sm:gap-4 mb-6">
            <Card className="p-3 sm:p-4 text-center border-primary/30 min-h-[100px] flex flex-col justify-center" data-testid="stat-visitor-count">
              <div className="text-xs sm:text-sm text-muted-foreground mb-1 flex items-center justify-center gap-1 flex-wrap">
                <Activity size={14} className="shrink-0" /> <span className="leading-tight">{t('admin.currentVisitors', '현재 접속자')}</span>
              </div>
              <div className="text-2xl sm:text-3xl font-bold tabular-nums">{visitorData?.count ?? 0}</div>
              <div className="text-[10px] sm:text-xs text-muted-foreground mt-0.5">{t('admin.visitorsRefresh', '15초마다 갱신')}</div>
            </Card>
            <Card className="p-3 sm:p-4 text-center min-h-[100px] flex flex-col justify-center" data-testid="stat-daily-visitors">
              <div className="text-xs sm:text-sm text-muted-foreground mb-1 flex items-center justify-center gap-1 flex-wrap">
                <Calendar size={14} className="shrink-0" /> <span className="leading-tight">{t('admin.dailyVisitors', '일일 방문자')}</span>
              </div>
              <div className="text-2xl sm:text-3xl font-bold tabular-nums min-h-[2.25rem] flex items-center justify-center">
                {loadingAnalytics ? <Loader2 className="w-5 h-5 sm:w-6 sm:h-6 animate-spin text-primary" /> : (analytics?.dailyVisitors ?? 0)}
              </div>
            </Card>
            <Card className="p-3 sm:p-4 text-center min-h-[100px] flex flex-col justify-center" data-testid="stat-total-visitors">
              <div className="text-xs sm:text-sm text-muted-foreground mb-1 flex items-center justify-center gap-1 flex-wrap">
                <UserCheck size={14} className="shrink-0" /> <span className="leading-tight">{t('admin.totalVisitors', '누적 방문자')}</span>
              </div>
              <div className="text-2xl sm:text-3xl font-bold tabular-nums min-h-[2.25rem] flex items-center justify-center text-primary">
                {loadingAnalytics ? <Loader2 className="w-5 h-5 sm:w-6 sm:h-6 animate-spin text-primary" /> : (analytics?.totalVisitors ?? 0)}
              </div>
            </Card>
            <Card className="p-3 sm:p-4 text-center min-h-[100px] flex flex-col justify-center" data-testid="stat-page-views-today">
              <div className="text-xs sm:text-sm text-muted-foreground mb-1 flex items-center justify-center gap-1 flex-wrap">
                <Eye size={14} className="shrink-0" /> <span className="leading-tight">{t('admin.pageViewsToday', '오늘 페이지뷰')}</span>
              </div>
              <div className="text-2xl sm:text-3xl font-bold tabular-nums min-h-[2.25rem] flex items-center justify-center">
                {loadingAnalytics ? <Loader2 className="w-5 h-5 sm:w-6 sm:h-6 animate-spin text-primary" /> : (analytics?.pageViewsToday ?? 0)}
              </div>
            </Card>
            <Card className="p-3 sm:p-4 text-center min-h-[100px] flex flex-col justify-center" data-testid="stat-page-views-total">
              <div className="text-xs sm:text-sm text-muted-foreground mb-1 flex items-center justify-center gap-1 flex-wrap">
                <Eye size={14} className="shrink-0" /> <span className="leading-tight">{t('admin.pageViewsTotal', '총 페이지뷰')}</span>
              </div>
              <div className="text-2xl sm:text-3xl font-bold tabular-nums min-h-[2.25rem] flex items-center justify-center text-primary">
                {loadingAnalytics ? <Loader2 className="w-5 h-5 sm:w-6 sm:h-6 animate-spin text-primary" /> : (analytics?.pageViewsTotal ?? 0)}
              </div>
            </Card>
          </div>

          {/* 서비스 통계 */}
          <h3 className="text-sm font-medium text-muted-foreground mb-3 flex items-center gap-1.5">
            <Database size={16} />
            {t('admin.serviceStats', '서비스 통계')}
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 sm:gap-4">
            <Card className="p-3 sm:p-4 text-center min-h-[100px] flex flex-col justify-center" data-testid="stat-total-users">
              <div className="text-xs sm:text-sm text-muted-foreground mb-1 flex items-center justify-center gap-1 flex-wrap">
                <Users size={14} className="shrink-0" /> <span className="leading-tight">{t('admin.totalUsers', '전체 회원 수')}</span>
              </div>
              <div className="text-2xl sm:text-3xl font-bold tabular-nums min-h-[2.25rem] flex items-center justify-center text-primary">
                {loadingStats ? <Loader2 className="w-5 h-5 sm:w-6 sm:h-6 animate-spin text-primary" /> : (stats?.totalUsers ?? 0)}
              </div>
            </Card>
            <Card className="p-3 sm:p-4 text-center min-h-[100px] flex flex-col justify-center" data-testid="stat-total-music">
              <div className="text-xs sm:text-sm text-muted-foreground mb-1 flex items-center justify-center gap-1 flex-wrap">
                <Music size={14} className="shrink-0" /> <span className="leading-tight">{t('admin.totalMusic', '전체 음원 수')}</span>
              </div>
              <div className="text-2xl sm:text-3xl font-bold tabular-nums min-h-[2.25rem] flex items-center justify-center text-primary">
                {loadingStats ? <Loader2 className="w-5 h-5 sm:w-6 sm:h-6 animate-spin text-primary" /> : (stats?.totalMusic ?? 0)}
              </div>
            </Card>
            <Card className="p-3 sm:p-4 text-center min-h-[100px] flex flex-col justify-center" data-testid="stat-total-likes">
              <div className="text-xs sm:text-sm text-muted-foreground mb-1 flex items-center justify-center gap-1 flex-wrap">
                <Heart size={14} className="shrink-0" /> <span className="leading-tight">{t('admin.totalLikes', '총 좋아요 수')}</span>
              </div>
              <div className="text-2xl sm:text-3xl font-bold tabular-nums min-h-[2.25rem] flex items-center justify-center text-primary">
                {loadingStats ? <Loader2 className="w-5 h-5 sm:w-6 sm:h-6 animate-spin text-primary" /> : (stats?.totalLikes ?? 0)}
              </div>
            </Card>
            <Card className="p-3 sm:p-4 text-center min-h-[100px] flex flex-col justify-center" data-testid="stat-total-comments">
              <div className="text-xs sm:text-sm text-muted-foreground mb-1 flex items-center justify-center gap-1 flex-wrap">
                <MessageSquare size={14} className="shrink-0" /> <span className="leading-tight">{t('admin.totalComments', '총 댓글 수')}</span>
              </div>
              <div className="text-2xl sm:text-3xl font-bold tabular-nums min-h-[2.25rem] flex items-center justify-center text-primary">
                {loadingStats ? <Loader2 className="w-5 h-5 sm:w-6 sm:h-6 animate-spin text-primary" /> : (stats?.totalComments ?? 0)}
              </div>
            </Card>
            <Card className="p-3 sm:p-4 text-center min-h-[100px] flex flex-col justify-center" data-testid="stat-credits-charged">
              <div className="text-xs sm:text-sm text-muted-foreground mb-1 flex items-center justify-center gap-1 flex-wrap">
                <Coins size={14} className="shrink-0" /> <span className="leading-tight">{t('admin.totalCreditsCharged', '총 충전된 크레딧')}</span>
              </div>
              <div className="text-2xl sm:text-3xl font-bold tabular-nums min-h-[2.25rem] flex items-center justify-center text-primary">
                {(creditsChargedData?.totalCreditsCharged ?? 0).toLocaleString()}C
              </div>
            </Card>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
            <Card className="p-4 overflow-hidden">
              <h3 className="text-sm font-semibold mb-3">{t('admin.byRegion', '지역별 방문')}</h3>
              {Array.isArray(statsByRegion) && statsByRegion.length > 0 ? (
                <div className="h-48 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={statsByRegion.map((r) => ({ name: r.countryCode || r.region || "-", count: r.count }))} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                      <XAxis dataKey="name" tick={{ fontSize: 11 }} className="text-muted-foreground" />
                      <YAxis tick={{ fontSize: 11 }} className="text-muted-foreground" />
                      <Tooltip contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "var(--radius)" }} formatter={(v: number) => [v.toLocaleString(), t('admin.visits', '방문수')]} />
                      <Bar dataKey="count" radius={[4, 4, 0, 0]} fill="hsl(var(--primary))" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <p className="text-muted-foreground text-sm py-8 text-center">{t('admin.noRegionData', '수집된 지역 데이터 없음')}</p>
              )}
            </Card>
            <Card className="p-4 overflow-hidden">
              <h3 className="text-sm font-semibold mb-3">{t('admin.byDevice', '디바이스별 방문')}</h3>
              {Array.isArray(statsByDevice) && statsByDevice.length > 0 ? (
                <div className="h-48 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={statsByDevice.map((r) => ({ name: r.deviceType || "-", count: r.count }))} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                      <XAxis dataKey="name" tick={{ fontSize: 11 }} className="text-muted-foreground" />
                      <YAxis tick={{ fontSize: 11 }} className="text-muted-foreground" />
                      <Tooltip contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "var(--radius)" }} formatter={(v: number) => [v.toLocaleString(), t('admin.visits', '방문수')]} />
                      <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                        {(Array.isArray(statsByDevice) ? statsByDevice : []).map((_, i) => (
                          <Cell key={i} fill={["hsl(var(--primary))", "hsl(var(--primary) / 0.8)", "hsl(var(--primary) / 0.6)"][i % 3]} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <p className="text-muted-foreground text-sm py-8 text-center">{t('admin.noDeviceData', '수집된 디바이스 데이터 없음')}</p>
              )}
            </Card>
          </div>

          {/* 유입 경로 · 기간별 추이 */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
            <Card className="p-4 overflow-hidden">
              <h3 className="text-sm font-semibold mb-3">{t('admin.bySource', '유입 경로')}</h3>
              {Array.isArray(statsBySource) && statsBySource.length > 0 ? (
                <div className="h-48 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={statsBySource.map((r) => ({ name: r.source || "-", count: r.count }))} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                      <XAxis dataKey="name" tick={{ fontSize: 10 }} className="text-muted-foreground" />
                      <YAxis tick={{ fontSize: 11 }} className="text-muted-foreground" />
                      <Tooltip contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "var(--radius)" }} formatter={(v: number) => [v.toLocaleString(), t('admin.visits', '방문수')]} />
                      <Bar dataKey="count" radius={[4, 4, 0, 0]} fill="hsl(var(--primary) / 0.8)" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <p className="text-muted-foreground text-sm py-8 text-center">{t('admin.noSourceData', '수집된 유입 경로 데이터 없음')}</p>
              )}
            </Card>
            <Card className="p-4 overflow-hidden">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold">{t('admin.trend', '기간별 추이')}</h3>
                <div className="flex gap-1">
                  <Button type="button" variant={analyticsTrendDays === 7 ? "default" : "outline"} size="sm" onClick={() => setAnalyticsTrendDays(7)}>7{t('admin.days', '일')}</Button>
                  <Button type="button" variant={analyticsTrendDays === 30 ? "default" : "outline"} size="sm" onClick={() => setAnalyticsTrendDays(30)}>30{t('admin.days', '일')}</Button>
                </div>
              </div>
              {Array.isArray(analyticsTrend) && analyticsTrend.length > 0 ? (
                <div className="h-48 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={analyticsTrend} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                      <XAxis dataKey="date" tick={{ fontSize: 10 }} className="text-muted-foreground" />
                      <YAxis tick={{ fontSize: 11 }} className="text-muted-foreground" />
                      <Tooltip contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "var(--radius)" }} />
                      <Line type="monotone" dataKey="uniqueVisitors" name={t('admin.uniqueVisitors', '순 방문자')} stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
                      <Line type="monotone" dataKey="pageViews" name={t('admin.pageViews', '페이지뷰')} stroke="hsl(var(--primary) / 0.6)" strokeWidth={2} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <p className="text-muted-foreground text-sm py-8 text-center">{t('admin.noTrendData', '기간별 데이터 없음')}</p>
              )}
            </Card>
          </div>
        </section>
            </TabsContent>
            <TabsContent value="posts">
        <h2 className="text-xl font-bold mb-4" data-testid="text-post-management-title">{t('admin.postManagement', '커뮤니티 글 관리')}</h2>
        <Card className="mb-6 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm" data-testid="table-posts">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="text-left p-3 font-medium">{t('admin.postNumber', '글번호')}</th>
                  <th className="text-left p-3 font-medium">{t('admin.postTitle', '제목')}</th>
                  <th className="text-left p-3 font-medium">{t('admin.author', '작성자')}</th>
                  <th className="text-left p-3 font-medium">{t('admin.createdDate', '작성일')}</th>
                  <th className="text-left p-3 font-medium">{t('admin.commentCount', '댓글수')}</th>
                  <th className="text-left p-3 font-medium">{t('admin.manage', '관리')}</th>
                </tr>
              </thead>
              <tbody>
                {loadingPosts ? (
                  <tr>
                    <td colSpan={6} className="text-center p-8">
                      <Loader2 className="w-5 h-5 animate-spin mx-auto text-primary" />
                    </td>
                  </tr>
                ) : adminPosts && adminPosts.length > 0 ? (
                  adminPosts.map((post: any) => (
                    <tr key={post.id} className="border-b border-border/50" data-testid={`row-post-${post.id}`}>
                      <td className="p-3">{post.id}</td>
                      <td className="p-3 max-w-[200px] truncate" title={post.title}>{post.title}</td>
                      <td className="p-3">{post.user?.firstName || post.userId}</td>
                      <td className="p-3 text-muted-foreground">{post.createdAt ? formatDateTime(post.createdAt) : "-"}</td>
                      <td className="p-3">{post.commentCount ?? 0}</td>
                      <td className="p-3">
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => deletePostMutation.mutate(post.id)}
                          disabled={deletePostMutation.isPending}
                          data-testid={`button-delete-post-${post.id}`}
                        >
                          <Trash2 size={14} className="mr-1" /> {t('admin.delete', '삭제')}
                        </Button>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={6} className="text-center p-8 text-muted-foreground">{t('admin.noPosts', '게시글이 없습니다')}</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
            </TabsContent>
            <TabsContent value="copyright">
        <h2 className="text-xl font-bold mb-4 flex items-center gap-2" data-testid="text-copyright-management-title">
          <Flag size={20} className="text-orange-500" /> {t('admin.copyrightManagement', '저작권 신고 관리')}
        </h2>
        <div className="flex items-center gap-2 mb-4 flex-wrap">
          <Select value={reportStatusFilter} onValueChange={setReportStatusFilter}>
            <SelectTrigger className="w-[180px]" data-testid="select-report-filter">
              <SelectValue placeholder={t('admin.statusFilter', '상태 필터')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('admin.all', '전체')}</SelectItem>
              <SelectItem value="pending">{t('admin.pending', '대기중')}</SelectItem>
              <SelectItem value="reviewing">{t('admin.reviewing', '검토중')}</SelectItem>
              <SelectItem value="resolved">{t('admin.resolved', '처리완료')}</SelectItem>
              <SelectItem value="rejected">{t('admin.rejected', '반려')}</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Card className="mb-10 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm" data-testid="table-copyright-reports">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="text-left p-3 font-medium">{t('admin.number', '번호')}</th>
                  <th className="text-left p-3 font-medium">{t('admin.music', '음원')}</th>
                  <th className="text-left p-3 font-medium">{t('admin.reportReason', '신고 사유')}</th>
                  <th className="text-left p-3 font-medium">{t('admin.reporter', '신고자')}</th>
                  <th className="text-left p-3 font-medium">{t('admin.originalArtist', '원작자/원곡')}</th>
                  <th className="text-left p-3 font-medium">{t('admin.status', '상태')}</th>
                  <th className="text-left p-3 font-medium">{t('admin.receivedDate', '접수일')}</th>
                  <th className="text-left p-3 font-medium">{t('admin.manage', '관리')}</th>
                </tr>
              </thead>
              <tbody>
                {loadingReports ? (
                  <tr>
                    <td colSpan={8} className="text-center p-8">
                      <Loader2 className="w-5 h-5 animate-spin mx-auto text-primary" />
                    </td>
                  </tr>
                ) : copyrightReports && copyrightReports.length > 0 ? (
                  copyrightReports.map((report: any) => (
                    <tr key={report.id} className="border-b border-border/50" data-testid={`row-report-${report.id}`}>
                      <td className="p-3">{report.id}</td>
                      <td className="p-3">
                        <div className="max-w-[150px]">
                          <div className="font-medium truncate">{report.musicTitle || t('admin.deletedMusic', '삭제된 음원')}</div>
                          <div className="text-xs text-muted-foreground truncate">{report.musicArtist || "-"}</div>
                        </div>
                      </td>
                      <td className="p-3">{reasonLabels[report.reason] || report.reason}</td>
                      <td className="p-3 text-xs">{report.reporterEmail || "-"}</td>
                      <td className="p-3">
                        <div className="text-xs">
                          {report.originalArtist && <div>{report.originalArtist}</div>}
                          {report.originalTitle && <div className="text-muted-foreground">{report.originalTitle}</div>}
                          {!report.originalArtist && !report.originalTitle && "-"}
                        </div>
                      </td>
                      <td className="p-3">
                        {report.status === "pending" && (
                          <Badge variant="secondary" className="gap-1">
                            <Clock size={12} /> {t('admin.pending', '대기중')}
                          </Badge>
                        )}
                        {report.status === "reviewing" && (
                          <Badge variant="default" className="bg-blue-600 gap-1 no-default-hover-elevate no-default-active-elevate">
                            <Search size={12} /> {t('admin.reviewing', '검토중')}
                          </Badge>
                        )}
                        {report.status === "resolved" && (
                          <Badge variant="default" className="bg-green-600 gap-1 no-default-hover-elevate no-default-active-elevate">
                            <CheckCircle size={12} /> {t('admin.resolved', '처리완료')}
                          </Badge>
                        )}
                        {report.status === "rejected" && (
                          <Badge variant="default" className="bg-gray-600 gap-1 no-default-hover-elevate no-default-active-elevate">
                            <XCircle size={12} /> {t('admin.rejected', '반려')}
                          </Badge>
                        )}
                      </td>
                      <td className="p-3 text-muted-foreground text-xs">{report.createdAt ? formatDateTime(report.createdAt) : "-"}</td>
                      <td className="p-3">
                        <div className="space-y-2 min-w-[200px]">
                          <Textarea
                            placeholder={t('admin.adminNote', '관리자 메모')}
                            value={adminNotes[report.id] ?? (report.adminNote || "")}
                            onChange={(e) => setAdminNotes({ ...adminNotes, [report.id]: e.target.value })}
                            rows={2}
                            className="text-xs"
                            data-testid={`textarea-admin-note-${report.id}`}
                          />
                          <div className="flex gap-1 flex-wrap">
                            {report.status !== "reviewing" && (
                              <Button
                                size="sm"
                                variant="outline"
                                className="text-blue-400 border-blue-400/30"
                                onClick={() => updateReportMutation.mutate({ id: report.id, status: "reviewing", adminNote: adminNotes[report.id] ?? report.adminNote })}
                                disabled={updateReportMutation.isPending}
                                data-testid={`button-review-report-${report.id}`}
                              >
                                {t('admin.reviewing', '검토중')}
                              </Button>
                            )}
                            {report.status !== "resolved" && (
                              <Button
                                size="sm"
                                variant="outline"
                                className="text-green-400 border-green-400/30"
                                onClick={() => updateReportMutation.mutate({ id: report.id, status: "resolved", adminNote: adminNotes[report.id] ?? report.adminNote })}
                                disabled={updateReportMutation.isPending}
                                data-testid={`button-resolve-report-${report.id}`}
                              >
                                {t('admin.resolved', '처리완료')}
                              </Button>
                            )}
                            {report.status !== "rejected" && (
                              <Button
                                size="sm"
                                variant="outline"
                                className="text-gray-400 border-gray-400/30"
                                onClick={() => updateReportMutation.mutate({ id: report.id, status: "rejected", adminNote: adminNotes[report.id] ?? report.adminNote })}
                                disabled={updateReportMutation.isPending}
                                data-testid={`button-reject-report-${report.id}`}
                              >
                                {t('admin.rejected', '반려')}
                              </Button>
                            )}
                          </div>
                        </div>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={8} className="text-center p-8 text-muted-foreground">
                      {reportStatusFilter !== "all" ? t('admin.noReportsFiltered', `"${statusLabels[reportStatusFilter]}" 상태의 신고가 없습니다`) : t('admin.noReports', '저작권 신고가 없습니다')}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
            </TabsContent>
            <TabsContent value="user-reports">
        <h2 className="text-xl font-bold mb-4 flex items-center gap-2" data-testid="text-user-reports-title">
          <MessageSquare size={20} className="text-amber-500" /> {t('admin.userReports', '회원 신고 (메시지)')}
        </h2>
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="text-left p-3 font-medium">{t('admin.number', '번호')}</th>
                  <th className="text-left p-3 font-medium">{t('admin.reporter', '신고자')}</th>
                  <th className="text-left p-3 font-medium">{t('admin.reportedUser', '피신고자')}</th>
                  <th className="text-left p-3 font-medium">{t('admin.reason', '사유')}</th>
                  <th className="text-left p-3 font-medium">{t('admin.status', '상태')}</th>
                  <th className="text-left p-3 font-medium">{t('admin.receivedDate', '접수일')}</th>
                  <th className="text-left p-3 font-medium">{t('admin.manage', '관리')}</th>
                </tr>
              </thead>
              <tbody>
                {loadingUserReports ? (
                  <tr><td colSpan={7} className="text-center p-8"><Loader2 className="animate-spin mx-auto text-primary" size={20} /></td></tr>
                ) : !userReportsList || userReportsList.length === 0 ? (
                  <tr><td colSpan={7} className="text-center p-8 text-muted-foreground">{t('admin.noUserReports', '회원 신고가 없습니다')}</td></tr>
                ) : (
                  userReportsList.map((r: any) => (
                    <tr key={r.id} className="border-b border-border/50">
                      <td className="p-3">{r.id}</td>
                      <td className="p-3">{r.reporterName || "-"}</td>
                      <td className="p-3">{r.reportedUserName || "-"}</td>
                      <td className="p-3 max-w-[200px] truncate" title={r.reason}>{r.reason}</td>
                      <td className="p-3">
                        {r.status === "pending" && <Badge variant="secondary"><Clock size={12} className="mr-1" />{t('admin.pending', '대기중')}</Badge>}
                        {r.status === "reviewed" && <Badge className="bg-blue-500/20 text-blue-400"><Search size={12} className="mr-1" />{t('admin.reviewing', '검토중')}</Badge>}
                        {r.status === "resolved" && <Badge className="bg-green-500/20 text-green-400"><CheckCircle size={12} className="mr-1" />{t('admin.resolved', '처리완료')}</Badge>}
                      </td>
                      <td className="p-3 text-muted-foreground text-xs">{r.createdAt ? formatDateTime(r.createdAt) : "-"}</td>
                      <td className="p-3">
                        <div className="flex gap-1 flex-wrap">
                          {r.status !== "reviewed" && (
                            <Button size="sm" variant="outline" onClick={() => updateUserReportMutation.mutate({ id: r.id, status: "reviewed" })} disabled={updateUserReportMutation.isPending}>{t('admin.reviewing', '검토중')}</Button>
                          )}
                          {r.status !== "resolved" && (
                            <Button size="sm" variant="outline" className="text-green-400 border-green-400/30" onClick={() => updateUserReportMutation.mutate({ id: r.id, status: "resolved" })} disabled={updateUserReportMutation.isPending}>{t('admin.resolved', '처리완료')}</Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Card>
            </TabsContent>
            <TabsContent value="users">
        <h2 className="text-xl font-bold mb-4" data-testid="text-user-management-title">{t('admin.userManagement', '회원 관리')}</h2>
        <div className="flex items-center gap-2 mb-4 flex-wrap">
          <Input
            placeholder={t('admin.searchUsers', '회원명, 이메일 검색')}
            value={userSearch}
            onChange={(e) => setUserSearch(e.target.value)}
            className="max-w-sm"
            data-testid="input-user-search"
          />
          <Button
            size="sm"
            variant="outline"
            onClick={() => refetchUsers()}
            data-testid="button-refresh-users"
          >
            <RefreshCw size={14} className="mr-1" /> {t('admin.refresh', '새로고침')}
          </Button>
        </div>
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm" data-testid="table-users">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="text-left p-3 font-medium">{t('admin.userId', '아이디')}</th>
                  <th className="text-left p-3 font-medium">{t('admin.email', '이메일')}</th>
                  <th className="text-left p-3 font-medium">{t('admin.joinDate', '가입일')}</th>
                  <th className="text-left p-3 font-medium">{t('admin.registerSource', '가입 경로')}</th>
                  <th className="text-left p-3 font-medium">{t('admin.role', '권한')}</th>
                  <th className="text-left p-3 font-medium">{t('admin.subscription', '구독')}</th>
                  <th className="text-left p-3 font-medium">{t('admin.manage', '관리')}</th>
                </tr>
              </thead>
              <tbody>
                {loadingUsers ? (
                  <tr>
                    <td colSpan={7} className="text-center p-8">
                      <Loader2 className="w-5 h-5 animate-spin mx-auto text-primary" />
                    </td>
                  </tr>
                ) : adminUsers && adminUsers.length > 0 ? (
                  adminUsers.map((u: any) => {
                    const isSelf = u.id === user?.id;
                    const isUserAdmin = u.role === "admin";
                    const isPremium = u.subscriptionTier === "premium";
                    return (
                      <tr key={u.id} className="border-b border-border/50" data-testid={`row-user-${u.id}`}>
                        <td className="p-3 font-mono text-xs max-w-[120px] truncate">{u.firstName || u.id}</td>
                        <td className="p-3">{u.email || "-"}</td>
                        <td className="p-3 text-muted-foreground">{u.createdAt ? formatDate(u.createdAt) : "-"}</td>
                        <td className="p-3">
                          <span className="text-muted-foreground" data-testid={`text-register-source-${u.id}`}>
                            {(() => {
                              let source = u.registerSource ?? u.register_source ?? "";
                              if (!source && typeof u.id === "string") {
                                if (u.id.startsWith("google_")) source = "google";
                                else if (u.id.startsWith("naver_")) source = "naver";
                                else if (u.id.startsWith("kakao_")) source = "kakao";
                                else if (u.id.startsWith("facebook_")) source = "facebook";
                                else if (u.id.startsWith("tiktok_")) source = "tiktok";
                              }
                              return source === "email" ? t('admin.registerSourceEmail', '이메일') : source === "google" ? "Google" : source === "naver" ? "네이버" : source === "kakao" ? "카카오" : source === "facebook" ? "Facebook" : source === "tiktok" ? "TikTok" : "-";
                            })()}
                          </span>
                        </td>
                        <td className="p-3">
                          {isUserAdmin ? (
                            <Badge variant="default" className="bg-red-600 text-white no-default-hover-elevate no-default-active-elevate" data-testid={`badge-role-${u.id}`}>{t('admin.adminRole', '관리자')}</Badge>
                          ) : (
                            <Badge variant="secondary" data-testid={`badge-role-${u.id}`}>{t('admin.userRole', '일반')}</Badge>
                          )}
                        </td>
                        <td className="p-3">
                          {isPremium ? (
                            <Badge variant="default" className="bg-purple-600 text-white no-default-hover-elevate no-default-active-elevate" data-testid={`badge-sub-${u.id}`}>Premium</Badge>
                          ) : (
                            <Badge variant="secondary" data-testid={`badge-sub-${u.id}`}>Free</Badge>
                          )}
                        </td>
                        <td className="p-3">
                          {isSelf ? (
                            <span className="text-muted-foreground text-xs" data-testid="text-self-label">{t('admin.self', '본인')}</span>
                          ) : (
                            <div className="flex items-center gap-2 flex-wrap">
                              <Button
                                size="sm"
                                variant="destructive"
                                onClick={() => {
                                  if (confirm(t('admin.confirmDeleteUser', `"${u.firstName || u.id}" 회원을 삭제하시겠습니까?`))) {
                                    deleteUserMutation.mutate(u.id);
                                  }
                                }}
                                disabled={deleteUserMutation.isPending}
                                data-testid={`button-delete-user-${u.id}`}
                              >
                                {t('admin.delete', '삭제')}
                              </Button>
                              {isUserAdmin ? (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => updateRoleMutation.mutate({ userId: u.id, role: "user" })}
                                  disabled={updateRoleMutation.isPending}
                                  data-testid={`button-demote-user-${u.id}`}
                                >
                                  {t('admin.demoteAdmin', '관리자해제')}
                                </Button>
                              ) : (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="text-blue-400 border-blue-400/30"
                                  onClick={() => updateRoleMutation.mutate({ userId: u.id, role: "admin" })}
                                  disabled={updateRoleMutation.isPending}
                                  data-testid={`button-promote-user-${u.id}`}
                                >
                                  <ShieldCheck size={14} className="mr-1" /> {t('admin.promoteAdmin', '관리자승격')}
                                </Button>
                              )}
                              {isPremium ? (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="text-orange-400 border-orange-400/30"
                                  onClick={() => {
                                    if (confirm(t('admin.confirmDowngrade', `"${u.firstName || u.id}" 회원의 프리미엄을 해제하시겠습니까?`))) {
                                      updateSubscriptionMutation.mutate({ userId: u.id, tier: "free" });
                                    }
                                  }}
                                  disabled={updateSubscriptionMutation.isPending}
                                  data-testid={`button-downgrade-user-${u.id}`}
                                >
                                  {t('admin.downgradePremium', '프리미엄해제')}
                                </Button>
                              ) : (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="text-purple-400 border-purple-400/30"
                                  onClick={() => {
                                    if (confirm(t('admin.confirmUpgrade', `"${u.firstName || u.id}" 회원을 프리미엄으로 승격하시겠습니까?`))) {
                                      updateSubscriptionMutation.mutate({ userId: u.id, tier: "premium" });
                                    }
                                  }}
                                  disabled={updateSubscriptionMutation.isPending}
                                  data-testid={`button-upgrade-user-${u.id}`}
                                >
                                  {t('admin.upgradePremium', '프리미엄부여')}
                                </Button>
                              )}
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={7} className="text-center p-8 text-muted-foreground">{t('admin.noUsers', '회원이 없습니다')}</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
            </TabsContent>
            <TabsContent value="bank">
        <Card className="p-4 sm:p-6 overflow-x-auto" data-testid="card-pending-bank-payments">
          <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
            <Landmark size={20} className="text-primary" /> {t('admin.pendingBankPayments', '계좌이체 입금 대기')}
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/10">
                  <th className="text-left p-3 font-medium">{t('admin.requester', '요청자')}</th>
                  <th className="text-left p-3 font-medium">{t('admin.orderId', '주문번호')}</th>
                  <th className="text-left p-3 font-medium">{t('admin.amount', '금액')}</th>
                  <th className="text-left p-3 font-medium">{t('admin.plan', '플랜')}</th>
                  <th className="text-left p-3 font-medium">{t('admin.requestDate', '요청일')}</th>
                  <th className="text-left p-3 font-medium">{t('admin.manage', '관리')}</th>
                </tr>
              </thead>
              <tbody>
                {loadingPendingBank ? (
                  <tr><td colSpan={6} className="text-center p-8"><Loader2 className="animate-spin mx-auto text-primary" size={20} /></td></tr>
                ) : pendingBankPayments && pendingBankPayments.length > 0 ? (
                  pendingBankPayments.map((p: any) => (
                    <tr key={p.id} className="border-b border-white/5">
                      <td className="p-3">{p.firstName && p.lastName ? `${p.firstName} ${p.lastName}` : p.email || p.userId}</td>
                      <td className="p-3 text-xs font-mono">{p.orderId}</td>
                      <td className="p-3 font-medium">{p.amount?.toLocaleString()}{t('common.won', '원')}</td>
                      <td className="p-3">{p.plan === "credit_charge" ? t('admin.creditCharge', '크레딧 충전') : (p.billingPeriod === "monthly" ? t('pricing.monthly', '월간') : t('pricing.yearly', '연간'))}</td>
                      <td className="p-3 text-xs text-muted-foreground">{p.createdAt ? new Date(p.createdAt).toLocaleString("ko-KR") : ""}</td>
                      <td className="p-3">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Button
                            size="sm"
                            onClick={() => confirmBankMutation.mutate(p.id)}
                            disabled={confirmBankMutation.isPending}
                          >
                            <CheckCircle size={12} className="mr-1" /> {t('admin.confirmPayment', '입금 확인')}
                          </Button>
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => deleteBankMutation.mutate(p.id)}
                            disabled={deleteBankMutation.isPending}
                          >
                            <Trash2 size={12} className="mr-1" /> {t('admin.delete', '삭제')}
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={6} className="text-center p-8 text-muted-foreground">{t('admin.noPendingBankPayments', '입금 대기 건이 없습니다')}</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
            </TabsContent>
            <TabsContent value="withdrawal">
        <Card className="p-4 sm:p-6 overflow-x-auto" data-testid="card-withdrawal-management">
          <h2 className="text-xl font-bold mb-4 flex items-center gap-2" data-testid="text-withdrawal-management-title">
            <Banknote size={20} className="text-primary" /> {t('admin.withdrawalManagement', '출금 관리')}
          </h2>
          <div className="flex items-center gap-3 mb-4 flex-wrap">
            <Select value={withdrawalFilter} onValueChange={setWithdrawalFilter}>
              <SelectTrigger className="w-40" data-testid="select-withdrawal-filter">
                <SelectValue placeholder={t('admin.statusFilter', '상태 필터')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('admin.all', '전체')}</SelectItem>
                <SelectItem value="pending">{t('admin.pending', '대기중')}</SelectItem>
                <SelectItem value="approved">{t('admin.approved', '승인')}</SelectItem>
                <SelectItem value="rejected">{t('admin.rejectedStatus', '거부')}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm" data-testid="table-withdrawals">
              <thead>
                <tr className="border-b border-white/10">
                  <th className="text-left p-3 font-medium">{t('admin.requester', '요청자')}</th>
                  <th className="text-left p-3 font-medium">{t('admin.amount', '금액')}</th>
                  <th className="text-left p-3 font-medium">{t('admin.fee', '수수료')}</th>
                  <th className="text-left p-3 font-medium">{t('admin.netAmount', '실수령액')}</th>
                  <th className="text-left p-3 font-medium">{t('admin.accountInfo', '계좌정보')}</th>
                  <th className="text-left p-3 font-medium">{t('admin.status', '상태')}</th>
                  <th className="text-left p-3 font-medium">{t('admin.requestDate', '요청일')}</th>
                  <th className="text-left p-3 font-medium">{t('admin.manage', '관리')}</th>
                </tr>
              </thead>
              <tbody>
                {loadingWithdrawals ? (
                  <tr><td colSpan={8} className="text-center p-8"><Loader2 className="animate-spin mx-auto text-primary" size={20} /></td></tr>
                ) : adminWithdrawals && adminWithdrawals.length > 0 ? (
                  adminWithdrawals.map((w: any) => (
                    <tr key={w.id} className="border-b border-white/5" data-testid={`row-withdrawal-${w.id}`}>
                      <td className="p-3">{w.user?.firstName || w.userId}</td>
                      <td className="p-3 font-medium">{w.amount?.toLocaleString()}{t('common.won', '원')}</td>
                      <td className="p-3 text-red-400">{w.fee?.toLocaleString()}{t('common.won', '원')}</td>
                      <td className="p-3 text-green-400 font-medium">{w.netAmount?.toLocaleString()}{t('common.won', '원')}</td>
                      <td className="p-3 text-xs">
                        {w.bankName && <span>{w.bankName} {w.accountNumber}<br />{w.accountHolder}</span>}
                      </td>
                      <td className="p-3">
                        {w.status === "pending" && <Badge variant="secondary"><Clock size={12} className="mr-1" />{t('admin.pending', '대기중')}</Badge>}
                        {w.status === "approved" && <Badge className="bg-green-500/20 text-green-400"><CheckCircle size={12} className="mr-1" />{t('admin.approved', '승인')}</Badge>}
                        {w.status === "rejected" && <Badge variant="destructive"><XCircle size={12} className="mr-1" />{t('admin.rejectedStatus', '거부')}</Badge>}
                      </td>
                      <td className="p-3 text-xs text-muted-foreground">{w.createdAt ? new Date(w.createdAt).toLocaleDateString("ko-KR") : ""}</td>
                      <td className="p-3">
                        {w.status === "pending" && (
                          <div className="flex flex-col gap-2">
                            <Textarea
                              value={withdrawalNotes[w.id] || ""}
                              onChange={(e) => setWithdrawalNotes(prev => ({ ...prev, [w.id]: e.target.value }))}
                              placeholder={t('admin.adminNote', '관리자 메모')}
                              className="text-xs min-w-[140px]"
                              rows={2}
                              data-testid={`textarea-withdrawal-note-${w.id}`}
                            />
                            <div className="flex gap-1.5 flex-wrap">
                              <Button
                                size="sm"
                                onClick={() => updateWithdrawalMutation.mutate({ id: w.id, status: "approved", adminNote: withdrawalNotes[w.id] })}
                                disabled={updateWithdrawalMutation.isPending}
                                data-testid={`button-approve-withdrawal-${w.id}`}
                              >
                                <CheckCircle size={12} className="mr-1" /> {t('admin.approved', '승인')}
                              </Button>
                              <Button
                                size="sm"
                                variant="destructive"
                                onClick={() => updateWithdrawalMutation.mutate({ id: w.id, status: "rejected", adminNote: withdrawalNotes[w.id] })}
                                disabled={updateWithdrawalMutation.isPending}
                                data-testid={`button-reject-withdrawal-${w.id}`}
                              >
                                <XCircle size={12} className="mr-1" /> {t('admin.rejectedStatus', '거부')}
                              </Button>
                            </div>
                          </div>
                        )}
                        {w.status !== "pending" && w.adminNote && (
                          <p className="text-xs text-muted-foreground">{t('admin.note', '메모')}: {w.adminNote}</p>
                        )}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={8} className="text-center p-8 text-muted-foreground">
                      {withdrawalFilter !== "all" ? t('admin.noWithdrawalsFiltered', `"${withdrawalFilter === "pending" ? "대기중" : withdrawalFilter === "approved" ? "승인" : "거부"}" 상태의 출금 요청이 없습니다`) : t('admin.noWithdrawals', '출금 요청이 없습니다')}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
            </TabsContent>
            <TabsContent value="announcement">
        <Card className="p-4 sm:p-6" data-testid="card-site-announcement">
          <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
            <Megaphone size={20} className="text-primary" /> {t('admin.siteAnnouncement', '공지 팝업')}
          </h2>
          <p className="text-sm text-muted-foreground mb-4">
            {t('admin.siteAnnouncementDesc', '공지 내용과 노출 시작·종료 일시를 설정하면, 메인 페이지(/) 접속 시 해당 기간에 팝업으로 표시됩니다.')}
          </p>
          <div className="space-y-4 max-w-xl">
            <div>
              <label className="text-sm font-medium mb-1 block">{t('admin.announcementContent', '공지 내용')}</label>
              <Textarea
                value={announcementContent}
                onChange={(e) => setAnnouncementContent(e.target.value)}
                placeholder={t('admin.announcementContentPlaceholder', '전체 방문자에게 보여줄 공지 텍스트')}
                className="min-h-[100px]"
                data-testid="textarea-announcement-content"
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">{t('admin.announcementTextSize', '텍스트 크기')}</label>
              <Select value={announcementTextSize} onValueChange={(v: "sm" | "md" | "lg") => setAnnouncementTextSize(v)}>
                <SelectTrigger className="w-full max-w-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="sm">{t('admin.textSizeSmall', '작게')}</SelectItem>
                  <SelectItem value="md">{t('admin.textSizeMedium', '보통')}</SelectItem>
                  <SelectItem value="lg">{t('admin.textSizeLarge', '크게')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">{t('admin.announcementImage', '공지 이미지 (선택)')}</label>
              <Input
                value={announcementImageUrl}
                onChange={(e) => setAnnouncementImageUrl(e.target.value)}
                placeholder={t('admin.announcementImagePlaceholder', '이미지 URL 또는 업로드 후 경로')}
                className="mb-2"
                data-testid="input-announcement-image"
              />
              <input
                type="file"
                accept="image/*"
                className="hidden"
                id="admin-announcement-image-upload"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  const formData = new FormData();
                  formData.append("file", file);
                  const res = await fetch("/api/uploads/local", { method: "POST", body: formData, credentials: "include" });
                  if (!res.ok) {
                    toast({ title: t('admin.imageUploadFailed', '이미지 업로드 실패'), variant: "destructive" });
                    return;
                  }
                  const data = await res.json();
                  if (data?.objectPath) setAnnouncementImageUrl(data.objectPath);
                  e.target.value = "";
                }}
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => document.getElementById("admin-announcement-image-upload")?.click()}
                data-testid="button-announcement-image-upload"
              >
                {t('admin.uploadImage', '이미지 업로드')}
              </Button>
              {announcementImageUrl ? (
                <p className="text-xs text-muted-foreground mt-1 truncate">{announcementImageUrl}</p>
              ) : null}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium mb-1 block">{t('admin.announcementStartsAt', '노출 시작')}</label>
                <Input
                  type="datetime-local"
                  value={announcementStartsAt}
                  onChange={(e) => setAnnouncementStartsAt(e.target.value)}
                  data-testid="input-announcement-starts"
                />
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">{t('admin.announcementEndsAt', '노출 종료')}</label>
                <Input
                  type="datetime-local"
                  value={announcementEndsAt}
                  onChange={(e) => setAnnouncementEndsAt(e.target.value)}
                  data-testid="input-announcement-ends"
                />
              </div>
            </div>
            <Button
              onClick={() => {
                if (!announcementContent.trim()) {
                  toast({ title: t('admin.announcementContentRequired', '공지 내용을 입력하세요'), variant: "destructive" });
                  return;
                }
                if (!announcementStartsAt || !announcementEndsAt) {
                  toast({ title: t('admin.announcementDateTimeRequired', '노출 시작·종료 일시를 모두 선택하세요'), variant: "destructive" });
                  return;
                }
                const start = new Date(announcementStartsAt);
                const end = new Date(announcementEndsAt);
                if (isNaN(start.getTime()) || isNaN(end.getTime())) {
                  toast({ title: t('admin.announcementDateTimeInvalid', '노출 시작·종료 일시를 올바르게 선택하세요'), variant: "destructive" });
                  return;
                }
                if (end <= start) {
                  toast({ title: t('admin.announcementEndAfterStart', '종료 일시는 시작 일시보다 뒤여야 합니다'), variant: "destructive" });
                  return;
                }
                saveAnnouncementMutation.mutate({
                  content: announcementContent.trim(),
                  imageUrl: announcementImageUrl.trim() || null,
                  textSize: announcementTextSize,
                  startsAt: start.toISOString(),
                  endsAt: end.toISOString(),
                });
              }}
              disabled={saveAnnouncementMutation.isPending}
              data-testid="button-save-announcement"
            >
              {saveAnnouncementMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
              {t('admin.saveAnnouncement', '공지 저장')}
            </Button>
          </div>
          {siteAnnouncementsList && siteAnnouncementsList.length > 0 && (
            <div className="mt-6 pt-6 border-t border-border">
              <h3 className="text-sm font-semibold mb-2">{t('admin.savedAnnouncements', '저장된 공지')}</h3>
              <ul className="space-y-2">
                {siteAnnouncementsList.map((a) => (
                  <li key={a.id} className="flex items-start justify-between gap-2 p-3 rounded-lg bg-muted/30 text-sm">
                    <div className="min-w-0 flex-1">
                      <p className="line-clamp-2 text-foreground">{a.content}</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {t('admin.announcementStartsAt', '노출 시작')}: {isNaN(new Date(a.startsAt).getTime()) ? String(a.startsAt) : new Date(a.startsAt).toLocaleString("ko-KR")} ~ {t('admin.announcementEndsAt', '노출 종료')}: {isNaN(new Date(a.endsAt).getTime()) ? String(a.endsAt) : new Date(a.endsAt).toLocaleString("ko-KR")}
                      </p>
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="shrink-0 text-destructive hover:text-destructive"
                      onClick={() => { if (confirm(t('admin.confirmDeleteAnnouncement', '이 공지를 삭제하시겠습니까?'))) deleteAnnouncementMutation.mutate(a.id); }}
                      disabled={deleteAnnouncementMutation.isPending}
                      data-testid={`button-delete-announcement-${a.id}`}
                    >
                      <Trash2 size={14} />
                    </Button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Card>
            </TabsContent>
            <TabsContent value="guide-videos">
        <Card className="p-4 sm:p-6" data-testid="card-guide-videos">
          <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
            <Video size={20} className="text-primary" /> {t('admin.guideVideos', '동영상 가이드 관리')}
          </h2>
          <p className="text-sm text-muted-foreground mb-4">
            {t('admin.guideVideosDesc', '가이드 페이지(/guide)의 "동영상 가이드" 탭에 노출될 유튜브 영상을 등록합니다.')}
          </p>
          <div className="space-y-4 max-w-xl mb-6">
            <div>
              <label className="text-sm font-medium mb-1 block">{t('admin.guideVideoTitle', '제목')}</label>
              <Input
                value={guideVideoTitle}
                onChange={(e) => setGuideVideoTitle(e.target.value)}
                placeholder={t('admin.guideVideoTitlePlaceholder', '예: 업로드 방법')}
                data-testid="input-guide-video-title"
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">{t('admin.guideVideoDescription', '설명 (선택)')}</label>
              <Textarea
                value={guideVideoDescription}
                onChange={(e) => setGuideVideoDescription(e.target.value)}
                placeholder={t('admin.guideVideoDescriptionPlaceholder', '간단한 설명')}
                className="min-h-[60px]"
                data-testid="textarea-guide-video-description"
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">{t('admin.guideVideoYoutubeUrl', '유튜브 URL')}</label>
              <Input
                value={guideVideoYoutubeUrl}
                onChange={(e) => setGuideVideoYoutubeUrl(e.target.value)}
                placeholder="https://www.youtube.com/watch?v=..."
                data-testid="input-guide-video-youtube"
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">{t('admin.guideVideoSortOrder', '정렬 순서 (선택, 숫자 작을수록 먼저)')}</label>
              <Input
                type="number"
                value={guideVideoSortOrder === "" ? "" : guideVideoSortOrder}
                onChange={(e) => setGuideVideoSortOrder(e.target.value === "" ? "" : Number(e.target.value))}
                placeholder="0"
                data-testid="input-guide-video-sort"
              />
            </div>
            <Button
              onClick={() => {
                if (!guideVideoTitle.trim()) {
                  toast({ title: t('admin.guideVideoTitleRequired', '제목을 입력하세요'), variant: "destructive" });
                  return;
                }
                if (!guideVideoYoutubeUrl.trim()) {
                  toast({ title: t('admin.guideVideoUrlRequired', '유튜브 URL을 입력하세요'), variant: "destructive" });
                  return;
                }
                createGuideVideoMutation.mutate({
                  title: guideVideoTitle.trim(),
                  description: guideVideoDescription.trim() || undefined,
                  youtubeUrl: guideVideoYoutubeUrl.trim(),
                  sortOrder: guideVideoSortOrder === "" ? null : Number(guideVideoSortOrder),
                });
              }}
              disabled={createGuideVideoMutation.isPending}
              data-testid="button-add-guide-video"
            >
              {createGuideVideoMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
              {t('admin.addGuideVideo', '동영상 추가')}
            </Button>
          </div>
          {guideVideosList && guideVideosList.length > 0 && (
            <div className="pt-6 border-t border-border">
              <h3 className="text-sm font-semibold mb-2">{t('admin.registeredGuideVideos', '등록된 동영상 가이드')}</h3>
              <ul className="space-y-2">
                {guideVideosList.map((v) => (
                  <li key={v.id} className="flex items-start justify-between gap-2 p-3 rounded-lg bg-muted/30 text-sm">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-foreground">{v.title}</p>
                      {v.description && <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{v.description}</p>}
                      <p className="text-xs text-muted-foreground mt-1 truncate">{v.youtubeUrl}</p>
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="shrink-0 text-destructive hover:text-destructive"
                      onClick={() => { if (confirm(t('admin.confirmDeleteGuideVideo', '이 동영상 가이드를 삭제하시겠습니까?'))) deleteGuideVideoMutation.mutate(v.id); }}
                      disabled={deleteGuideVideoMutation.isPending}
                      data-testid={`button-delete-guide-video-${v.id}`}
                    >
                      <Trash2 size={14} />
                    </Button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Card>
            </TabsContent>
            <TabsContent value="curated">
        <Card className="p-4 sm:p-6">
          <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
            <ListMusic size={20} className="text-primary" /> {t('admin.curatedPlaylists', '테마 플레이리스트')}
          </h2>
          <p className="text-sm text-muted-foreground mb-4">
            {t('admin.curatedPlaylistsDesc', '음원 목록(/music) 상단에 노출되는 테마/무드 플레이리스트입니다. 이름·슬러그·설명·장르·커버 이미지를 설정하고 트랙(음원 ID)을 지정하세요.')}
          </p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4 max-w-2xl">
            <div>
              <label className="text-sm font-medium mb-1 block">{t('admin.curatedName', '이름')}</label>
              <Input value={curatedName} onChange={(e) => setCuratedName(e.target.value)} placeholder="예: 작업할 때" />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">{t('admin.curatedSlug', '슬러그 (URL)')}</label>
              <Input value={curatedSlug} onChange={(e) => setCuratedSlug(e.target.value)} placeholder="예: work" />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">{t('admin.curatedDescription', '설명 (선택)')}</label>
              <Input value={curatedDesc} onChange={(e) => setCuratedDesc(e.target.value)} placeholder="집중이 잘 될 곡들" />
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-6 max-w-2xl">
            <div>
              <label className="text-sm font-medium mb-1 block">대표 장르 (대분류)</label>
              <Select
                value={curatedMainGenre}
                onValueChange={(v) => {
                  setCuratedMainGenre(v);
                  setCuratedSubGenre("");
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="대분류 선택" />
                </SelectTrigger>
                <SelectContent>
                  {Object.keys(curatedMainGenres).map((g) => (
                    <SelectItem key={g} value={g}>
                      {g}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">상세 장르 (소분류)</label>
              <Select
                value={curatedSubGenre}
                onValueChange={(v) => setCuratedSubGenre(v)}
                disabled={!curatedMainGenre || curatedSubGenres.length === 0}
              >
                <SelectTrigger>
                  <SelectValue placeholder={curatedMainGenre && curatedSubGenres.length === 0 ? "세부분류 없음" : "소분류 선택"} />
                </SelectTrigger>
                <SelectContent>
                  {curatedSubGenres.map((g) => (
                    <SelectItem key={g} value={g}>
                      {g}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">커버 이미지</label>
              <div className="flex items-center gap-3">
                <div className="w-16 h-16 rounded-md bg-muted overflow-hidden border border-border flex items-center justify-center">
                  {curatedCoverPreview ? (
                    <img src={curatedCoverPreview} alt="커버 미리보기" className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-xs text-muted-foreground">미리보기</span>
                  )}
                </div>
                <Input
                  type="file"
                  accept="image/*"
                  className="text-sm"
                  onChange={(e) => {
                    const file = e.target.files?.[0] ?? null;
                    setCuratedCoverFile(file);
                    if (file) {
                      const url = URL.createObjectURL(file);
                      setCuratedCoverPreview(url);
                    } else {
                      setCuratedCoverPreview(null);
                    }
                  }}
                />
              </div>
              <p className="mt-1 text-xs text-muted-foreground">권장: 정사각형 이미지, 최대 2MB</p>
            </div>
          </div>
          <Button
            onClick={() => {
              (async () => {
                if (!curatedName.trim() || !curatedSlug.trim()) {
                  toast({ title: t('admin.curatedNameSlugRequired', '이름과 슬러그를 입력하세요'), variant: "destructive" });
                  return;
                }

                let coverImageFilename: string | null | undefined = null;
                if (curatedCoverFile) {
                  const uploadRes = await uploadCuratedImage(curatedCoverFile);
                  if (!uploadRes) {
                    toast({ title: "커버 이미지 업로드 실패", variant: "destructive" });
                    return;
                  }
                  coverImageFilename = uploadRes.objectPath;
                }

                createCuratedMutation.mutate({
                  name: curatedName.trim(),
                  description: curatedDesc.trim() || null,
                  slug: curatedSlug.trim(),
                  coverImageFilename,
                  genreMain: curatedMainGenre || null,
                  genreSub: curatedSubGenre || null,
                });
              })();
            }}
            disabled={createCuratedMutation.isPending || isUploadingCuratedImage}
            className="gap-2"
          >
            {createCuratedMutation.isPending || isUploadingCuratedImage ? <Loader2 size={14} className="animate-spin" /> : null}
            {t('admin.addCurated', '플레이리스트 추가')}
          </Button>
          {curatedPlaylistsList && curatedPlaylistsList.length > 0 && (
            <div className="mt-6 pt-6 border-t border-border">
              <h3 className="text-sm font-semibold mb-2">{t('admin.registeredCurated', '등록된 테마 플레이리스트')}</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left p-2 font-medium">{t('admin.name', '이름')}</th>
                      <th className="text-left p-2 font-medium">slug</th>
                      <th className="text-left p-2 font-medium">{t('admin.manage', '관리')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {curatedPlaylistsList.map((pl) => (
                      <tr key={pl.id} className="border-b border-border/50">
                        <td className="p-2">{pl.name}</td>
                        <td className="p-2 text-muted-foreground">/curated/{pl.slug}</td>
                        <td className="p-2 flex gap-1 flex-wrap">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setCuratedTracksDialogId(pl.id);
                              setCuratedTracksText("");
                            }}
                          >
                            {t('admin.editTracks', '트랙 편집')}
                          </Button>
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => { if (confirm(t('admin.confirmDeleteCurated', '이 플레이리스트를 삭제하시겠습니까?'))) deleteCuratedMutation.mutate(pl.id); }}
                            disabled={deleteCuratedMutation.isPending}
                          >
                            <Trash2 size={14} />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </Card>
        <Dialog open={curatedTracksDialogId != null} onOpenChange={(open) => !open && setCuratedTracksDialogId(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t('admin.editTracks', '트랙 편집')}</DialogTitle>
            </DialogHeader>
            <p className="text-sm text-muted-foreground mb-2">
              {t('admin.curatedTracksHint', '음원 ID를 쉼표로 구분하여 입력하세요. (예: 1, 2, 5, 10)')}
            </p>
            <Textarea
              value={curatedTracksText}
              onChange={(e) => setCuratedTracksText(e.target.value)}
              placeholder="1, 2, 3"
              className="min-h-[120px] font-mono text-sm"
            />
            <div className="mt-4 space-y-2">
              <label className="text-sm font-medium block">{t('admin.curatedFillByGenre', '카테고리(장르)로 채우기')}</label>
              <div className="flex flex-col sm:flex-row gap-2 items-start sm:items-end">
                <div className="flex flex-col gap-2 w-full sm:w-80">
                  <Select
                    value={curatedGenreMainForFill}
                    onValueChange={(v) => {
                      setCuratedGenreMainForFill(v);
                      setCuratedGenreSubForFill("");
                    }}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="대분류 선택" />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.keys(curatedMainGenres).map((g) => (
                        <SelectItem key={g} value={g}>
                          {g}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select
                    value={curatedGenreSubForFill}
                    onValueChange={(v) => setCuratedGenreSubForFill(v)}
                    disabled={!curatedGenreMainForFill || (curatedMainGenres[curatedGenreMainForFill] || []).length === 0}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue
                        placeholder={
                          curatedGenreMainForFill && (curatedMainGenres[curatedGenreMainForFill] || []).length === 0
                            ? "세부분류 없음"
                            : "소분류 선택"
                        }
                      />
                    </SelectTrigger>
                    <SelectContent>
                      {(curatedMainGenres[curatedGenreMainForFill] || []).map((g) => (
                        <SelectItem key={g} value={g}>
                          {g}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  disabled={!curatedGenreMainForFill && !curatedGenreSubForFill}
                  onClick={async () => {
                    const genreForQuery = curatedGenreSubForFill || curatedGenreMainForFill;
                    if (!genreForQuery) {
                      toast({ title: t('admin.selectGenreFirst', '장르를 먼저 선택하세요'), variant: "destructive" });
                      return;
                    }
                    try {
                      const res = await fetch(`/api/music?genre=${encodeURIComponent(genreForQuery)}&limit=50`, { credentials: "include" });
                      if (!res.ok) {
                        toast({ title: t('admin.curatedGenreFetchFailed', '해당 장르의 곡을 불러오지 못했습니다.'), variant: "destructive" });
                        return;
                      }
                      const data = await res.json();
                      const ids = Array.isArray(data?.data) ? data.data.map((m: any) => m.id).filter((id: any) => typeof id === "number") : [];
                      setCuratedTracksText(ids.join(", "));
                      toast({ title: t('admin.curatedGenreFilled', '선택한 장르의 곡 ID가 채워졌습니다. 저장을 눌러 반영하세요.') });
                    } catch {
                      toast({ title: t('admin.curatedGenreFetchFailed', '해당 장르의 곡을 불러오지 못했습니다.'), variant: "destructive" });
                    }
                  }}
                >
                  {t('admin.fillWithGenre', '이 장르 곡으로 채우기')}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                {t('admin.curatedGenreNote', '※ 아래 저장 버튼을 눌러야 실제 플레이리스트에 반영됩니다.')}
              </p>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setCuratedTracksDialogId(null)}>{t('common.cancel', '취소')}</Button>
              <Button
                onClick={() => {
                  if (curatedTracksDialogId == null) return;
                  const musicIds = curatedTracksText.split(/[\s,]+/).map((s) => parseInt(s.trim(), 10)).filter((n) => !isNaN(n) && n > 0);
                  setCuratedTracksMutation.mutate({ id: curatedTracksDialogId, musicIds });
                }}
                disabled={setCuratedTracksMutation.isPending}
              >
                {setCuratedTracksMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : null}
                {t('admin.save', '저장')}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
            </TabsContent>
            <TabsContent value="backup">
        <Card className="p-4 sm:p-6" data-testid="card-database-backup">
          <h2 className="text-xl font-bold mb-4 flex items-center gap-2" data-testid="text-backup-title">
            <Database className="w-5 h-5 text-emerald-400" />
            {t('admin.databaseBackup', '백업')}
          </h2>
          <p className="text-sm text-muted-foreground mb-4">
            DB백업, 소스코드, 음원파일 3개를 한 번에 <strong className="text-foreground">E:\뉴베니사운드백업폴더</strong>에 저장합니다.<br />
            <span className="text-xs">베니사운드_DB백업_날짜.sql · 베니사운드_소스코드_날짜.zip · 베니사운드_음원파일_날짜.zip</span>
            <br />
            <span className="text-xs text-amber-600 dark:text-amber-400">※ Windows 로컬 PC에서만 사용하세요. 서버(VPS)에서는 실행되지 않습니다.</span>
          </p>
          <div className="flex flex-col sm:flex-row gap-3">
            <Button
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
              disabled={savingLocal}
              onClick={() => {
                setBackupPw("");
                setBackupPwError("");
                setShowBackupPw(false);
                setBackupPwOpen(true);
                setTimeout(() => backupPwRef.current?.focus(), 100);
              }}
              data-testid="button-save-local"
            >
              {savingLocal ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <HardDrive className="w-4 h-4 mr-2" />}
              {savingLocal ? "저장 중..." : "전체 백업 저장 (E드라이브)"}
            </Button>
            <Button
              variant="outline"
              className="border-emerald-500/50 text-emerald-500"
              disabled={savingServer}
              onClick={async () => {
                setSavingServer(true);
                try {
                  const res = await fetch("/api/admin/server-backup", {
                    method: "POST",
                    credentials: "include",
                  });
                  const data = await res.json().catch(() => ({}));
                  if (!res.ok) {
                    throw new Error(data?.message || "서버 백업 생성에 실패했습니다");
                  }
                  toast({
                    title: "서버 백업 생성 완료",
                    description:
                      "원격 서버 /var/www/venysound 경로에 백업 파일 3개가 생성되었습니다.\n" +
                      [data.files?.db, data.files?.code, data.files?.uploads]
                        .filter(Boolean)
                        .map((f: string) => f.split("/").pop())
                        .join("\n"),
                  });
                } catch (e: any) {
                  toast({
                    title: "서버 백업 실패",
                    description: e?.message || "원격 서버에 백업 파일을 생성하지 못했습니다.",
                    variant: "destructive",
                  });
                } finally {
                  setSavingServer(false);
                }
              }}
            >
              {savingServer ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Database className="w-4 h-4 mr-2" />}
              {savingServer ? "서버 백업 생성 중..." : "원격 서버에 백업 파일 생성"}
            </Button>
          </div>

          {/* 비밀번호 확인 다이얼로그 */}
          {backupPwOpen && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
              <div className="bg-background border border-border rounded-xl shadow-2xl p-6 w-80">
                <div className="flex items-center gap-2 mb-4">
                  <HardDrive className="w-5 h-5 text-emerald-400" />
                  <h3 className="font-bold text-base">백업 비밀번호 확인</h3>
                </div>
                <p className="text-sm text-muted-foreground mb-4">전체 백업을 실행하려면 비밀번호를 입력하세요.</p>
                <div className="relative mb-2">
                  <Input
                    ref={backupPwRef}
                    type={showBackupPw ? "text" : "password"}
                    placeholder="비밀번호"
                    value={backupPw}
                    onChange={(e) => { setBackupPw(e.target.value); setBackupPwError(""); }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") document.getElementById("backup-pw-confirm")?.click();
                      if (e.key === "Escape") setBackupPwOpen(false);
                    }}
                    className={backupPwError ? "border-red-500 pr-10" : "pr-10"}
                  />
                  <button
                    type="button"
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    onClick={() => setShowBackupPw(!showBackupPw)}
                  >
                    {showBackupPw ? (
                      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                    ) : (
                      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                    )}
                  </button>
                </div>
                {backupPwError && <p className="text-xs text-red-500 mb-3">{backupPwError}</p>}
                <div className="flex gap-2 mt-4">
                  <Button variant="outline" className="flex-1" onClick={() => setBackupPwOpen(false)}>취소</Button>
                  <Button
                    id="backup-pw-confirm"
                    className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white"
                    onClick={async () => {
                      const expectedPw = import.meta.env.VITE_BACKUP_PASSWORD || "kim1324";
                      if (backupPw !== expectedPw) {
                        setBackupPwError("비밀번호가 틀렸습니다.");
                        backupPwRef.current?.focus();
                        return;
                      }
                      setBackupPwOpen(false);
                      setSavingLocal(true);
                      try {
                        const ctrl = new AbortController();
                        const timeoutId = setTimeout(() => ctrl.abort(), 5 * 60 * 1000);
                        const res = await fetch("/api/admin/save-to-local", {
                          method: "POST",
                          credentials: "include",
                          signal: ctrl.signal,
                        });
                        clearTimeout(timeoutId);
                        const text = await res.text();
                        let data: { message?: string; results?: any[]; dir?: string } = {};
                        try {
                          data = text ? JSON.parse(text) : {};
                        } catch {
                          const msg = res.ok ? "응답 파싱 실패" : (res.status === 401 ? "로그인이 필요합니다. 관리자로 로그인 후 다시 시도하세요." : res.status === 403 ? "관리자 권한이 없습니다." : `서버 오류 (${res.status})`);
                          throw new Error(msg);
                        }
                        if (!res.ok) throw new Error(data.message || "저장 실패");
                        const succeeded = (data.results || []).filter((r: any) => r.success);
                        const failed = (data.results || []).filter((r: any) => !r.success);
                        if (succeeded.length > 0) {
                          toast({
                            title: `${succeeded.length}개 저장 완료`,
                            description: (data.dir ? `경로: ${data.dir}\n` : "") + succeeded.map((r: any) => `${r.type}: ${r.file.split("\\").pop()}`).join("\n"),
                          });
                        }
                        if (failed.length > 0) {
                          toast({
                            title: `${failed.length}개 저장 실패`,
                            description: failed.map((r: any) => `${r.type}: ${r.error}`).join("\n"),
                            variant: "destructive",
                          });
                        }
                      } catch (e: any) {
                        toast({ title: "저장 실패", description: e?.message, variant: "destructive" });
                      } finally {
                        setSavingLocal(false);
                      }
                    }}
                  >
                    확인
                  </Button>
                </div>
              </div>
            </div>
          )}
        </Card>
            </TabsContent>
          </Tabs>
      </div>
      </div>
    </PageTransition>
  );
}
