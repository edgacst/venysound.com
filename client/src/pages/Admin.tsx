import { useState } from "react";
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
  ArrowDownToLine,
  Database,
  Download,
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

  const { data: adminPosts, isLoading: loadingPosts } = useQuery<any[]>({
    queryKey: ["/api/admin/posts"],
    enabled: adminCheck?.isAdmin === true,
  });

  const { data: adminUsers, isLoading: loadingUsers, refetch: refetchUsers } = useQuery<any[]>({
    queryKey: ["/api/admin/users", userSearch],
    queryFn: async () => {
      const url = userSearch ? `/api/admin/users?search=${encodeURIComponent(userSearch)}` : "/api/admin/users";
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch users");
      return res.json();
    },
    enabled: adminCheck?.isAdmin === true,
  });

  const deletePostMutation = useMutation({
    mutationFn: async (postId: number) => {
      await apiRequest("DELETE", `/api/admin/posts/${postId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/posts"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/stats"] });
      toast({ title: t('admin.postDeleted', '게시글이 삭제되었습니다') });
    },
  });

  const deleteUserMutation = useMutation({
    mutationFn: async (userId: string) => {
      await apiRequest("DELETE", `/api/admin/users/${userId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/stats"] });
      toast({ title: t('admin.userDeleted', '회원이 삭제되었습니다') });
    },
    onError: (err: any) => {
      toast({ title: err?.message || t('admin.deleteFailed', '삭제에 실패했습니다'), variant: "destructive" });
    },
  });

  const updateRoleMutation = useMutation({
    mutationFn: async ({ userId, role }: { userId: string; role: string }) => {
      await apiRequest("PATCH", `/api/admin/users/${userId}/role`, { role });
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
      await apiRequest("PATCH", `/api/admin/users/${userId}/subscription`, { tier });
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
      await apiRequest("PATCH", `/api/admin/copyright-reports/${id}`, { status, adminNote });
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
      await apiRequest("PATCH", `/api/admin/withdrawals/${id}`, { status, adminNote });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/withdrawals"] });
      toast({ title: t('admin.withdrawalUpdated', '출금 상태가 업데이트되었습니다') });
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

        {loadingStats ? (
          <div className="flex justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-10">
            <Card className="p-4 text-center" data-testid="stat-total-users">
              <div className="text-sm text-muted-foreground mb-1 flex items-center justify-center gap-1">
                <Users size={14} /> {t('admin.totalUsers', '전체 회원 수')}
              </div>
              <div className="text-3xl font-bold">{stats?.totalUsers ?? 0}</div>
            </Card>
            <Card className="p-4 text-center" data-testid="stat-total-music">
              <div className="text-sm text-muted-foreground mb-1 flex items-center justify-center gap-1">
                <Music size={14} /> {t('admin.totalMusic', '전체 음원 수')}
              </div>
              <div className="text-3xl font-bold">{stats?.totalMusic ?? 0}</div>
            </Card>
            <Card className="p-4 text-center" data-testid="stat-total-likes">
              <div className="text-sm text-muted-foreground mb-1 flex items-center justify-center gap-1">
                <Heart size={14} /> {t('admin.totalLikes', '총 좋아요 수')}
              </div>
              <div className="text-3xl font-bold">{stats?.totalLikes ?? 0}</div>
            </Card>
            <Card className="p-4 text-center" data-testid="stat-total-comments">
              <div className="text-sm text-muted-foreground mb-1 flex items-center justify-center gap-1">
                <MessageSquare size={14} /> {t('admin.totalComments', '총 댓글 수')}
              </div>
              <div className="text-3xl font-bold">{stats?.totalComments ?? 0}</div>
            </Card>
          </div>
        )}

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
            {t('admin.databaseBackup', '데이터베이스 백업')}
          </h2>
          <p className="text-sm text-muted-foreground mb-4">
            {t('admin.backupDesc', '현재 데이터베이스의 전체 데이터를 SQL 파일로 다운로드합니다. 백업 파일은 pg_dump 형식으로 생성됩니다.')}
          </p>
          <Button
            onClick={() => {
              const link = document.createElement("a");
              link.href = "/api/admin/backup";
              link.download = "";
              document.body.appendChild(link);
              link.click();
              document.body.removeChild(link);
              toast({ title: t('admin.backupStarted', '백업 다운로드가 시작되었습니다') });
            }}
            data-testid="button-download-backup"
          >
            <Download className="w-4 h-4 mr-2" />
            {t('admin.downloadBackup', 'SQL 백업 다운로드')}
          </Button>
        </Card>
      </div>
      </div>
    </PageTransition>
  );
}
