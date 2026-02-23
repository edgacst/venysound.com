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
} from "lucide-react";
import { PageTransition } from "@/components/PageTransition";

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

export default function Admin() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
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

        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-10">
          <Card className="p-4 text-center border-primary/30" data-testid="stat-visitor-count">
            <div className="text-sm text-muted-foreground mb-1 flex items-center justify-center gap-1">
              <Activity size={14} /> {t('admin.currentVisitors', '현재 접속자')}
            </div>
            <div className="text-3xl font-bold">{visitorData?.count ?? 0}</div>
            <div className="text-xs text-muted-foreground mt-1">{t('admin.visitorsRefresh', '15초마다 갱신')}</div>
          </Card>
          <Card className="p-4 text-center" data-testid="stat-total-users">
            <div className="text-sm text-muted-foreground mb-1 flex items-center justify-center gap-1">
              <Users size={14} /> {t('admin.totalUsers', '전체 회원 수')}
            </div>
            <div className="text-3xl font-bold min-h-[2.25rem] flex items-center justify-center">
              {loadingStats ? <Loader2 className="w-6 h-6 animate-spin text-primary" /> : (stats?.totalUsers ?? 0)}
            </div>
          </Card>
          <Card className="p-4 text-center" data-testid="stat-total-music">
            <div className="text-sm text-muted-foreground mb-1 flex items-center justify-center gap-1">
              <Music size={14} /> {t('admin.totalMusic', '전체 음원 수')}
            </div>
            <div className="text-3xl font-bold min-h-[2.25rem] flex items-center justify-center">
              {loadingStats ? <Loader2 className="w-6 h-6 animate-spin text-primary" /> : (stats?.totalMusic ?? 0)}
            </div>
          </Card>
          <Card className="p-4 text-center" data-testid="stat-total-likes">
            <div className="text-sm text-muted-foreground mb-1 flex items-center justify-center gap-1">
              <Heart size={14} /> {t('admin.totalLikes', '총 좋아요 수')}
            </div>
            <div className="text-3xl font-bold min-h-[2.25rem] flex items-center justify-center">
              {loadingStats ? <Loader2 className="w-6 h-6 animate-spin text-primary" /> : (stats?.totalLikes ?? 0)}
            </div>
          </Card>
          <Card className="p-4 text-center" data-testid="stat-total-comments">
            <div className="text-sm text-muted-foreground mb-1 flex items-center justify-center gap-1">
              <MessageSquare size={14} /> {t('admin.totalComments', '총 댓글 수')}
            </div>
            <div className="text-3xl font-bold min-h-[2.25rem] flex items-center justify-center">
              {loadingStats ? <Loader2 className="w-6 h-6 animate-spin text-primary" /> : (stats?.totalComments ?? 0)}
            </div>
          </Card>
        </div>

        <h2 className="text-xl font-bold mb-4" data-testid="text-post-management-title">{t('admin.postManagement', '커뮤니티 글 관리')}</h2>
        <Card className="mb-10 overflow-hidden">
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
                      <td className="p-3 max-w-[200px] truncate">{post.title}</td>
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
                  <th className="text-left p-3 font-medium">{t('admin.role', '권한')}</th>
                  <th className="text-left p-3 font-medium">{t('admin.subscription', '구독')}</th>
                  <th className="text-left p-3 font-medium">{t('admin.manage', '관리')}</th>
                </tr>
              </thead>
              <tbody>
                {loadingUsers ? (
                  <tr>
                    <td colSpan={6} className="text-center p-8">
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
                    <td colSpan={6} className="text-center p-8 text-muted-foreground">{t('admin.noUsers', '회원이 없습니다')}</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>

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
      </div>
      </div>
    </PageTransition>
  );
}
