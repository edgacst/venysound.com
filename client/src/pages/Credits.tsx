import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/hooks/use-auth";
import { LOGIN_PATH } from "@/lib/site-paths";
import { useToast } from "@/hooks/use-toast";
import { Coins, Plus, Minus, Gift, Download, Loader2, Clock, CreditCard, Landmark, Sparkles, Undo2 } from "lucide-react";
import { Link, useSearch } from "wouter";
import { Navigation } from "@/components/Navigation";
import { Footer } from "@/components/Footer";
import { PageTransition } from "@/components/PageTransition";
import { useTranslation } from 'react-i18next';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { apiRequest } from "@/lib/queryClient";
import { loadTossPayments } from "@tosspayments/tosspayments-sdk";
import {
  walletSupplyWonFromTotalPaymentVatInclusive,
  WALLET_TOPUP_DEFAULT_TOTAL_WON,
  WALLET_TOPUP_MIN_TOTAL_WON,
  WALLET_TOPUP_STEP_TOTAL_WON,
} from "@shared/credits-pricing";

const REFUND_OTP_PURPOSE = "credit_refund";

function maskEmailForDisplay(email: string): string {
  const trimmed = email.trim();
  const at = trimmed.indexOf("@");
  if (at <= 0) return "***";
  const local = trimmed.slice(0, at);
  const domain = trimmed.slice(at + 1);
  const head = local.slice(0, Math.min(2, local.length));
  return `${head}***@${domain}`;
}

export default function Credits() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [topupTotalWon, setTopupTotalWon] = useState(WALLET_TOPUP_DEFAULT_TOTAL_WON);
  const [bankModalOpen, setBankModalOpen] = useState(false);
  const [bankRequestResult, setBankRequestResult] = useState<{
    bankInfo: { bankName: string; bankAccount: string; bankHolder: string };
    amount: number;
    orderId: string;
    message: string;
  } | null>(null);
  const [tossLoading, setTossLoading] = useState(false);
  const [refundOpen, setRefundOpen] = useState(false);
  const [refundCreditsInput, setRefundCreditsInput] = useState("");
  const [refundReason, setRefundReason] = useState("");
  const REFUND_PAGE_SIZE = 100;
  const [refundHistoryPage, setRefundHistoryPage] = useState(1);
  const [refundOtpCode, setRefundOtpCode] = useState("");
  const [refundProofToken, setRefundProofToken] = useState("");
  const [refundVerified, setRefundVerified] = useState(false);
  const [refundVerifying, setRefundVerifying] = useState(false);
  const [refundSendingOtp, setRefundSendingOtp] = useState(false);
  const [bindEmailInput, setBindEmailInput] = useState("");
  const [bindEmailOtp, setBindEmailOtp] = useState("");
  const [bindSendingOtp, setBindSendingOtp] = useState(false);
  const [bindVerifying, setBindVerifying] = useState(false);

  const { data: creditData, isLoading } = useQuery<{ credits: number; balanceWon?: number }>({
    queryKey: ["/api/credits"],
    enabled: !!user,
    // 다른 사용자가 보낸 후원/구매로 값이 바뀌어도 즉시 반영되도록 함
    refetchOnWindowFocus: true,
    refetchOnMount: true,
  });

  const { data: refundRequests, isLoading: isLoadingRefunds } = useQuery<
    Array<{
      id: number;
      creditsAmount: number;
      reason: string | null;
      status: string;
      adminNote: string | null;
      createdAt: string;
      processedAt: string | null;
      processedByUserId?: string | null;
      krwRefundAmountWon?: number | null;
      krwRefundCompletedAt?: string | null;
      krwRefundNote?: string | null;
    }>
  >({
    queryKey: ["/api/credits/refund-requests"],
    enabled: !!user,
  });

  const refundTotalCount = refundRequests?.length ?? 0;
  const refundPageCount = Math.max(1, Math.ceil(refundTotalCount / REFUND_PAGE_SIZE));
  const refundHistoryItems =
    refundRequests?.slice((refundHistoryPage - 1) * REFUND_PAGE_SIZE, refundHistoryPage * REFUND_PAGE_SIZE) ?? [];

  const { data: transactions, isLoading: isLoadingTx } = useQuery<any[]>({
    queryKey: ["/api/credits/transactions"],
    enabled: !!user,
    refetchOnWindowFocus: true,
    refetchOnMount: true,
  });

  const { data: bankInfo } = useQuery<{ bankName: string; bankAccount: string; bankHolder: string }>({
    queryKey: ["/api/subscription/bank-info"],
    enabled: !!user || bankModalOpen,
  });

  const { data: tossClientKey } = useQuery<{ clientKey: string | null }>({
    queryKey: ["/api/toss/client-key"],
  });

  const searchString = useSearch();
  const isTossAvailable = !!tossClientKey?.clientKey;

  const balanceWon = creditData?.balanceWon ?? creditData?.credits ?? 0;
  const topupSupplyWon = walletSupplyWonFromTotalPaymentVatInclusive(topupTotalWon);

  // Handle Toss redirect: successUrl returns with ?paymentKey=...&orderId=...
  useEffect(() => {
    if (!user || !searchString) return;
    const params = new URLSearchParams(searchString.startsWith("?") ? searchString.slice(1) : searchString);
    const paymentKey = params.get("paymentKey");
    const orderId = params.get("orderId");
    if (!paymentKey || !orderId) return;
    const stored = sessionStorage.getItem("credit_charge");
    sessionStorage.removeItem("credit_charge");
    if (!stored) return;
    try {
      const { amount } = JSON.parse(stored) as { amount: number };
      if (!amount) return;
      fetch("/api/credits/charge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount, paymentKey, orderId }),
        credentials: "include",
      })
        .then((res) => res.json().then((data) => ({ ok: res.ok, data })))
        .then(({ ok, data }) => {
          if (ok) {
            queryClient.invalidateQueries({ queryKey: ["/api/credits"] });
            queryClient.invalidateQueries({ queryKey: ["/api/credits/transactions"] });
            queryClient.invalidateQueries({ queryKey: ["/api/earnings"] });
            toast({
              title: t("credits.chargeComplete", "충전 완료"),
              description:
                t("credits.chargeCompleteDescWon", "지갑에 원화가 반영되었습니다. 현재 잔액: ") +
                (data.balanceWon ?? data.credits ?? 0).toLocaleString() +
                t("common.won", "원"),
            });
          } else {
            toast({ title: t("credits.chargeFailed", "충전 실패"), description: data?.message ?? "결제 확인에 실패했습니다", variant: "destructive" });
          }
        })
        .catch(() => toast({ title: t("credits.chargeFailed", "충전 실패"), variant: "destructive" }));
      window.history.replaceState(null, "", "/credits");
    } catch {
      /* ignore */
    }
  }, [user, searchString, queryClient, toast, t]);

  useEffect(() => {
    if (!refundOpen) return;
    setRefundOtpCode("");
    setRefundProofToken("");
    setRefundVerified(false);
    setRefundVerifying(false);
    setRefundSendingOtp(false);
    setBindEmailInput("");
    setBindEmailOtp("");
    setBindSendingOtp(false);
    setBindVerifying(false);
    setRefundHistoryPage(1);
  }, [refundOpen]);

  useEffect(() => {
    setRefundHistoryPage(1);
  }, [refundTotalCount]);

  const requestBankMutation = useMutation({
    mutationFn: async (totalPayment: number) => {
      const res = await apiRequest("POST", "/api/credits/request-bank", { amount: totalPayment });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || "입금 신청에 실패했습니다");
      }
      return res.json();
    },
    onSuccess: (data) => {
      setBankRequestResult({
        bankInfo: data.bankInfo,
        amount: data.amount,
        orderId: data.orderId,
        message: data.message,
      });
      toast({ title: t('credits.bankRequestSubmitted', '입금 신청 완료'), description: data.message });
      queryClient.invalidateQueries({ queryKey: ["/api/credits"] });
      queryClient.invalidateQueries({ queryKey: ["/api/credits/transactions"] });
    },
    onError: (error: Error) => {
      toast({ title: t('credits.bankRequestFailed', '입금 신청 실패'), description: error.message, variant: "destructive" });
    },
  });

  const refundRequestMutation = useMutation({
    mutationFn: async ({
      credits,
      reason,
      refundProofToken: token,
    }: {
      credits: number;
      reason: string;
      refundProofToken: string;
    }) => {
      const res = await apiRequest("POST", "/api/credits/refund-request", {
        credits,
        reason,
        refundProofToken: token,
      });
      return res.json();
    },
    onSuccess: (data) => {
      toast({
        title: t("credits.refundRequestSubmitted", "환불 신청 완료"),
        description: (data as { message?: string }).message ?? t("credits.refundRequestSubmittedDesc", "검토 후 안내드립니다."),
      });
      setRefundOpen(false);
      setRefundCreditsInput("");
      setRefundReason("");
      setRefundOtpCode("");
      setRefundProofToken("");
      setRefundVerified(false);
      setRefundVerifying(false);
      queryClient.invalidateQueries({ queryKey: ["/api/credits/refund-requests"] });
      queryClient.invalidateQueries({ queryKey: ["/api/credits"] });
      queryClient.invalidateQueries({ queryKey: ["/api/credits/transactions"] });
    },
    onError: (error: Error) => {
      toast({ title: t("credits.refundRequestFailed", "신청 실패"), description: error.message, variant: "destructive" });
    },
  });

  const chargeMutation = useMutation({
    mutationFn: async (amount: number) => {
      const res = await fetch("/api/credits/charge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount }),
        credentials: "include",
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || t('credits.chargeFailed', '충전 실패'));
      }
      return res.json();
    },
    onSuccess: (data) => {
      toast({
        title: t("credits.chargeComplete", "충전 완료"),
        description:
          t("credits.chargeCompleteDescWon", "지갑에 원화가 반영되었습니다. 현재 잔액: ") +
          (data.balanceWon ?? data.credits)?.toLocaleString() +
          t("common.won", "원"),
      });
      queryClient.invalidateQueries({ queryKey: ["/api/credits"] });
      queryClient.invalidateQueries({ queryKey: ["/api/credits/transactions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/earnings"] });
      setTopupTotalWon(WALLET_TOPUP_DEFAULT_TOTAL_WON);
    },
    onError: (error: Error) => {
      toast({ title: t('credits.chargeFailed', '충전 실패'), description: error.message, variant: "destructive" });
    },
  });

  const getTypeLabel = (type: string) => {
    switch (type) {
      case "charge": return t('credits.typeCharge', '충전');
      case "tip_sent": return t('credits.typeTip', '후원');
      case "tip_received": return t('credits.typeTipReceived', '후원 받음');
      case "purchase": return t('credits.typePurchase', '구매');
      case "ai_music_create": return t('credits.typeAiMusicCreate', 'AI 음악 생성');
      case "refund": return t('credits.typeRefund', '환불');
      default: return type;
    }
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case "charge": return <Plus size={14} className="text-green-400" />;
      case "tip_sent": return <Gift size={14} className="text-yellow-500" />;
      case "tip_received": return <Gift size={14} className="text-green-400" />;
      case "purchase": return <Download size={14} className="text-blue-400" />;
      case "ai_music_create": return <Sparkles size={14} className="text-purple-400" />;
      case "refund": return <Undo2 size={14} className="text-orange-400" />;
      default: return <Coins size={14} />;
    }
  };

  const handleTossPayment = async () => {
    if (!user || !tossClientKey?.clientKey) return;
    if (topupTotalWon < WALLET_TOPUP_MIN_TOTAL_WON) return;
    const amount = topupTotalWon;
    const orderId = `WALLET_${String(user.id).replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 20)}_${Date.now()}`;
    sessionStorage.setItem("credit_charge", JSON.stringify({ amount }));
    setTossLoading(true);
    try {
      const tossPayments = await loadTossPayments(tossClientKey.clientKey);
      const baseUrl = window.location.origin;
      await tossPayments.requestPayment("카드", {
        amount,
        orderId,
        orderName: t("credits.orderNameWallet", "지갑 충전"),
        successUrl: `${baseUrl}/credits?payment=success`,
        failUrl: `${baseUrl}/credits?payment=fail`,
      });
    } catch (err: unknown) {
      const msg = err && typeof err === "object" && "message" in err ? String((err as { message: string }).message) : "";
      if (msg && !msg.includes("popup") && !msg.includes("cancel")) {
        toast({ title: t("credits.chargeFailed", "충전 실패"), description: msg, variant: "destructive" });
      }
      sessionStorage.removeItem("credit_charge");
    } finally {
      setTossLoading(false);
    }
  };

  if (!user) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center pb-24">
        <Navigation />
        <Card className="p-8 text-center max-w-sm">
          <Coins className="mx-auto mb-4 text-primary" size={48} />
          <h2 className="text-xl font-bold mb-2">{t('credits.loginRequired', '로그인이 필요합니다')}</h2>
          <p className="text-muted-foreground mb-4">{t("credits.loginRequiredDescWon", "지갑을 충전하려면 먼저 로그인해 주세요")}</p>
          <Link href={LOGIN_PATH}>
            <Button data-testid="button-go-login">{t('credits.goLogin', '로그인하기')}</Button>
          </Link>
        </Card>
        <Footer />
      </div>
    );
  }

  return (
    <PageTransition>
      <div className="min-h-screen bg-background flex flex-col pb-24">
        <Navigation />
        <div className="p-6 max-w-4xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2" data-testid="text-credits-title">{t("credits.titleWon", "지갑 충전")}</h1>
          <p className="text-muted-foreground">{t("credits.subtitleWon", "원화를 충전해 후원·유료 음원 구매·AI 생성 등에 사용하세요")}</p>
          <p className="text-xs text-muted-foreground mt-1">
            {t('credits.vatNotice', '표시된 총 결제액에는 부가세 10%가 포함됩니다. 현금영수증·세금계산서 발행 가능')}
          </p>
        </div>

        <Card className="p-6 mb-8">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-xl bg-primary/20 flex items-center justify-center">
                <Coins className="text-primary" size={28} />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">{t("credits.myBalanceWon", "내 지갑 잔액")}</p>
                <p className="text-3xl font-bold" data-testid="text-credit-balance">
                  {isLoading ? (
                    <Loader2 className="animate-spin" size={24} />
                  ) : (
                    <>
                      {balanceWon.toLocaleString()}
                      <span className="text-lg font-semibold text-muted-foreground ml-1">{t("common.won", "원")}</span>
                    </>
                  )}
                </p>
              </div>
            </div>
            <Badge variant="outline" className="text-sm px-3 py-1">
              {t("credits.vatIncludedHint", "총결제액에 부가세 10% 포함")}
            </Badge>
          </div>
        </Card>

        <Card className="p-6 mb-8 border-border/80">
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <Undo2 className="text-orange-400" size={20} />
                {t("credits.refundSectionTitleWon", "충전 원화 환불")}
              </h2>
              <p className="text-sm text-muted-foreground mt-1">
                {t(
                  "credits.refundSectionDesc",
                  "미사용 충전 분에 대한 환불은 환불 정책에 따라 검토됩니다. 승인 시 지갑 잔액만 차감되며, 통장 환불은 별도 안내입니다.",
                )}
              </p>
              <Link href="/refund-policy" className="text-xs text-primary hover:underline mt-2 inline-block">
                {t("credits.refundPolicyLink", "환불 정책 보기")}
              </Link>
            </div>
            <Button variant="outline" className="shrink-0 gap-2" onClick={() => setRefundOpen(true)} data-testid="button-refund-request">
              <Undo2 size={16} />
              {t("credits.refundRequestButton", "환불 신청")}
            </Button>
          </div>
          {isLoadingRefunds ? (
            <div className="flex justify-center py-4 mt-4">
              <Loader2 className="animate-spin text-muted-foreground" size={22} />
            </div>
          ) : refundRequests && refundRequests.length > 0 ? (
            <div className="mt-4 pt-4 border-t border-border/60 space-y-2">
              <p className="text-xs font-medium text-muted-foreground">{t("credits.refundHistoryTitle", "내 환불 신청")}</p>
              {refundHistoryItems.map((r) => {
                const statusText =
                  r.status === "pending"
                    ? t("credits.refundStatusPending", "검토 중")
                    : r.status === "approved"
                      ? t("credits.refundStatusApproved", "승인")
                      : t("credits.refundStatusRejected", "반려");
                const metaParts: string[] = [];
                if (r.createdAt) metaParts.push(`${t("credits.refundRequestedAtLabel", "신청")} ${new Date(r.createdAt).toLocaleString("ko-KR")}`);
                if (r.status !== "pending" && r.processedAt)
                  metaParts.push(`${t("credits.refundProcessedAtLabel", "처리")} ${new Date(r.processedAt).toLocaleString("ko-KR")}`);
                if (r.krwRefundCompletedAt) {
                  const krwAmountText = r.krwRefundAmountWon != null ? `${r.krwRefundAmountWon.toLocaleString()}${t("common.won", "원")}` : "—";
                  const krwDateText = new Date(r.krwRefundCompletedAt).toLocaleString("ko-KR");
                  metaParts.push(`${t("credits.refundKrwRecordedLabel", "원화 입금 기록")} ${krwAmountText} · ${krwDateText}${r.krwRefundNote ? ` · ${r.krwRefundNote}` : ""}`);
                }
                if (r.adminNote) metaParts.push(r.adminNote);
                const metaText = metaParts.join(" · ");
                return (
                  <div
                    key={r.id}
                    className="flex items-center justify-between gap-2 text-xs rounded-lg bg-muted/30 px-3 py-1.5"
                    data-testid={`refund-request-${r.id}`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="tabular-nums whitespace-nowrap shrink-0">
                        {r.creditsAmount.toLocaleString()}
                        {t("common.won", "원")}
                      </span>
                      <Badge variant={r.status === "pending" ? "secondary" : r.status === "approved" ? "default" : "destructive"} className="shrink-0">
                        {statusText}
                      </Badge>
                    </div>
                    <span
                      className="text-muted-foreground whitespace-nowrap overflow-hidden text-ellipsis max-w-[260px] sm:max-w-[420px]"
                      title={metaText || undefined}
                    >
                      {metaText || "—"}
                    </span>
                  </div>
                );
              })}
              {refundTotalCount > REFUND_PAGE_SIZE && (
                <div className="flex items-center justify-between gap-2 pt-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="shrink-0"
                    disabled={refundHistoryPage <= 1}
                    onClick={() => setRefundHistoryPage((p) => Math.max(1, p - 1))}
                    data-testid="refund-history-prev"
                  >
                    이전
                  </Button>
                  <div className="text-xs text-muted-foreground tabular-nums whitespace-nowrap">
                    {(refundHistoryPage - 1) * REFUND_PAGE_SIZE + 1}-{Math.min(refundHistoryPage * REFUND_PAGE_SIZE, refundTotalCount)} / {refundTotalCount}
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="shrink-0"
                    disabled={refundHistoryPage >= refundPageCount}
                    onClick={() => setRefundHistoryPage((p) => Math.min(refundPageCount, p + 1))}
                    data-testid="refund-history-next"
                  >
                    다음
                  </Button>
                </div>
              )}
            </div>
          ) : null}
        </Card>

        <Dialog
          open={refundOpen}
          onOpenChange={(open) => {
            setRefundOpen(open);
            if (!open) {
              setRefundOtpCode("");
              setRefundProofToken("");
              setRefundVerified(false);
              setRefundVerifying(false);
              setRefundSendingOtp(false);
              setBindEmailInput("");
              setBindEmailOtp("");
              setBindSendingOtp(false);
              setBindVerifying(false);
            }
          }}
        >
          <DialogContent className="sm:max-w-md max-h-[min(90vh,720px)] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{t("credits.refundDialogTitleWon", "충전 원화 환불 신청")}</DialogTitle>
              <p className="text-sm text-muted-foreground pt-1">
                {t(
                  "credits.refundDialogVerifyNote",
                  "아래 본인인증(이메일 코드)을 완료한 뒤 신청하기를 눌러 주세요.",
                )}
              </p>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label htmlFor="refund-credits">{t("credits.refundWonLabel", "환불 요청 금액(원)")}</Label>
                <input
                  id="refund-credits"
                  type="number"
                  min={1}
                  max={balanceWon}
                  className="mt-1 flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={refundCreditsInput}
                  onChange={(e) => setRefundCreditsInput(e.target.value)}
                  placeholder={t("credits.refundCreditsPlaceholder", "숫자 입력")}
                />
                <p className="text-xs text-muted-foreground mt-1">
                  {t("credits.refundMaxHintWon", "보유: {{n}}원", { n: balanceWon.toLocaleString() })}
                </p>
              </div>
              <div>
                <Label htmlFor="refund-reason">{t("credits.refundReasonLabel", "사유 (선택)")}</Label>
                <Textarea
                  id="refund-reason"
                  className="mt-1 min-h-[80px]"
                  value={refundReason}
                  onChange={(e) => setRefundReason(e.target.value)}
                  placeholder={t("credits.refundReasonPlaceholder", "요청 사유를 입력해 주세요")}
                />
              </div>
              <div className="rounded-lg border border-border/60 bg-muted/30 p-3 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <Label className="text-sm">{t("credits.identityVerifyTitle", "본인인증")}</Label>
                  {refundVerified ? (
                    <Badge variant="default" className="shrink-0">
                      {t("credits.identityVerified", "인증완료")}
                    </Badge>
                  ) : null}
                </div>
                {!user?.email ? (
                  <div className="space-y-3">
                    <p className="text-xs text-muted-foreground">
                      {t(
                        "credits.bindEmailForRefundHint",
                        "SNS만 연동된 계정은 이메일을 등록한 뒤 환불 본인인증을 진행할 수 있습니다. 아래에 본인 이메일을 입력하고 인증해 주세요.",
                      )}
                    </p>
                    <div>
                      <Label htmlFor="refund-bind-email" className="text-xs text-muted-foreground">
                        {t("credits.bindEmailLabel", "등록할 이메일")}
                      </Label>
                      <input
                        id="refund-bind-email"
                        type="email"
                        autoComplete="email"
                        className="mt-1 flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                        value={bindEmailInput}
                        onChange={(e) => setBindEmailInput(e.target.value)}
                        placeholder={t("credits.bindEmailPlaceholder", "example@email.com")}
                      />
                    </div>
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      className="w-full sm:w-auto"
                      disabled={bindSendingOtp || !bindEmailInput.trim()}
                      onClick={async () => {
                        setBindSendingOtp(true);
                        try {
                          await apiRequest("POST", "/api/auth/send-account-email-otp", { email: bindEmailInput.trim() });
                          toast({
                            title: t("credits.bindEmailOtpSent", "인증 메일 발송"),
                            description: t("credits.bindEmailOtpSentDesc", "메일함의 6자리 코드를 입력한 뒤 이메일 확인을 눌러 주세요."),
                          });
                        } catch (e: any) {
                          toast({
                            title: t("credits.refundOtpSendFailed", "발송 실패"),
                            description: e?.message || t("credits.refundOtpSendFailedDesc", "잠시 후 다시 시도해 주세요."),
                            variant: "destructive",
                          });
                        } finally {
                          setBindSendingOtp(false);
                        }
                      }}
                    >
                      {bindSendingOtp ? <Loader2 className="animate-spin" size={18} /> : t("credits.bindEmailSendCode", "인증 코드 보내기")}
                    </Button>
                    <div>
                      <Label htmlFor="refund-bind-otp" className="text-xs text-muted-foreground">
                        {t("credits.bindEmailOtpLabel", "이메일 인증 코드")}
                      </Label>
                      <input
                        id="refund-bind-otp"
                        inputMode="numeric"
                        autoComplete="one-time-code"
                        maxLength={6}
                        className="mt-1 flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm tracking-widest"
                        value={bindEmailOtp}
                        onChange={(e) => setBindEmailOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
                        placeholder={t("credits.refundOtpPlaceholder", "6자리")}
                      />
                    </div>
                    <Button
                      type="button"
                      variant="default"
                      size="sm"
                      className="w-full sm:w-auto"
                      disabled={bindVerifying || bindEmailOtp.length !== 6 || !bindEmailInput.trim()}
                      onClick={async () => {
                        setBindVerifying(true);
                        try {
                          await apiRequest("POST", "/api/auth/verify-account-email-otp", {
                            email: bindEmailInput.trim(),
                            code: bindEmailOtp,
                          });
                          await queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
                          setBindEmailOtp("");
                          toast({
                            title: t("credits.bindEmailDone", "이메일 등록 완료"),
                            description: t("credits.bindEmailDoneDesc", "이제 아래에서 환불 인증 코드를 요청할 수 있습니다."),
                          });
                        } catch (e: any) {
                          toast({
                            title: t("credits.identityVerifyFailed", "인증 실패"),
                            description: e?.message || t("credits.refundOtpWrong", "코드를 확인해 주세요."),
                            variant: "destructive",
                          });
                        } finally {
                          setBindVerifying(false);
                        }
                      }}
                    >
                      {bindVerifying ? <Loader2 className="animate-spin" size={18} /> : t("credits.bindEmailConfirm", "이메일 확인")}
                    </Button>
                  </div>
                ) : (
                  <>
                    <p className="text-xs text-muted-foreground">
                      {t("credits.refundOtpEmailHint", "등록 이메일로 코드가 전송됩니다: {{email}}", {
                        email: maskEmailForDisplay(user.email),
                      })}
                    </p>
                    <div className="flex flex-wrap items-end gap-2">
                      <Button
                        type="button"
                        variant="secondary"
                        className="shrink-0"
                        disabled={refundSendingOtp || refundVerified}
                        onClick={async () => {
                          setRefundSendingOtp(true);
                          try {
                            await apiRequest("POST", "/api/auth/send-sensitive-otp", { purpose: REFUND_OTP_PURPOSE });
                            toast({
                              title: t("credits.refundOtpSent", "인증 코드 발송"),
                              description: t("credits.refundOtpSentDesc", "이메일을 확인한 뒤 6자리 코드를 입력해 주세요."),
                            });
                          } catch (e: any) {
                            toast({
                              title: t("credits.refundOtpSendFailed", "발송 실패"),
                              description: e?.message || t("credits.refundOtpSendFailedDesc", "잠시 후 다시 시도해 주세요."),
                              variant: "destructive",
                            });
                          } finally {
                            setRefundSendingOtp(false);
                          }
                        }}
                      >
                        {refundSendingOtp ? <Loader2 className="animate-spin" size={18} /> : t("credits.refundOtpSend", "인증 코드 보내기")}
                      </Button>
                      <div className="flex-1 min-w-[140px]">
                        <Label htmlFor="refund-auth-otp" className="text-xs text-muted-foreground">
                          {t("credits.refundOtpLabel", "이메일 인증 코드")}
                        </Label>
                        <input
                          id="refund-auth-otp"
                          inputMode="numeric"
                          autoComplete="one-time-code"
                          maxLength={6}
                          className="mt-1 flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm tracking-widest"
                          value={refundOtpCode}
                          onChange={(e) => setRefundOtpCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                          placeholder={t("credits.refundOtpPlaceholder", "6자리")}
                          disabled={refundVerified}
                        />
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        className="shrink-0"
                        disabled={refundVerifying || refundVerified || refundOtpCode.length !== 6}
                        onClick={async () => {
                          setRefundVerifying(true);
                          try {
                            const res = await apiRequest("POST", "/api/auth/verify-sensitive-otp", {
                              purpose: REFUND_OTP_PURPOSE,
                              code: refundOtpCode,
                            });
                            const data = (await res.json()) as { refundProofToken?: string };
                            if (!data.refundProofToken) throw new Error("인증 응답이 올바르지 않습니다.");
                            setRefundProofToken(data.refundProofToken);
                            setRefundVerified(true);
                            toast({
                              title: t("credits.identityVerified", "인증완료"),
                              description: t("credits.identityVerifiedDesc", "환불 신청을 진행할 수 있습니다."),
                            });
                          } catch (e: any) {
                            setRefundVerified(false);
                            setRefundProofToken("");
                            toast({
                              title: t("credits.identityVerifyFailed", "인증 실패"),
                              description: e?.message || t("credits.refundOtpWrong", "코드를 확인해 주세요."),
                              variant: "destructive",
                            });
                          } finally {
                            setRefundVerifying(false);
                          }
                        }}
                      >
                        {refundVerifying ? <Loader2 className="animate-spin" size={18} /> : t("credits.refundOtpConfirm", "확인")}
                      </Button>
                    </div>
                    <p className="text-[10px] text-muted-foreground">
                      {t("credits.refundOtpHint", "환불 신청은 등록된 이메일로 받은 인증 코드로 본인 확인이 필요합니다. 코드는 약 10분간 유효합니다.")}
                    </p>
                  </>
                )}
              </div>
              <Button
                className="w-full"
                disabled={refundRequestMutation.isPending || !refundVerified || !refundProofToken}
                onClick={() => {
                  if (!refundVerified || !refundProofToken) {
                    toast({ title: t("credits.identityVerifyRequired", "본인인증이 필요합니다"), variant: "destructive" });
                    return;
                  }
                  const n = parseInt(refundCreditsInput, 10);
                  if (!Number.isFinite(n) || n < 1) {
                    toast({ title: t("credits.refundInvalidAmountWon", "올바른 원화 금액을 입력해 주세요"), variant: "destructive" });
                    return;
                  }
                  if (n > balanceWon) {
                    toast({ title: t("credits.refundExceedsBalanceWon", "지갑 잔액을 초과할 수 없습니다"), variant: "destructive" });
                    return;
                  }
                  refundRequestMutation.mutate({ credits: n, reason: refundReason.trim(), refundProofToken });
                }}
              >
                {refundRequestMutation.isPending ? <Loader2 className="animate-spin" size={18} /> : t("credits.refundSubmit", "신청하기")}
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        <div className="mb-8">
          <h2 className="text-xl font-semibold mb-4">{t("credits.topupAmountTitle", "충전 금액")}</h2>
          <Card className="p-6">
            <div className="flex flex-col sm:flex-row sm:items-center gap-6">
              <div className="flex items-center justify-center gap-3">
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="h-12 w-12 shrink-0"
                  disabled={topupTotalWon <= WALLET_TOPUP_MIN_TOTAL_WON}
                  onClick={() => setTopupTotalWon((v) => Math.max(WALLET_TOPUP_MIN_TOTAL_WON, v - WALLET_TOPUP_STEP_TOTAL_WON))}
                  aria-label={t("credits.decreaseTopup", "금액 감소")}
                  data-testid="button-topup-minus"
                >
                  <Minus className="h-5 w-5" />
                </Button>
                <div className="text-center min-w-[140px]">
                  <p className="text-xs text-muted-foreground mb-1">{t("credits.totalPaymentLabel", "총 결제(부가세 포함)")}</p>
                  <p className="text-3xl font-bold tabular-nums" data-testid="text-topup-total">
                    {topupTotalWon.toLocaleString()}
                    <span className="text-lg font-semibold text-muted-foreground ml-1">{t("common.won", "원")}</span>
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="h-12 w-12 shrink-0"
                  onClick={() => setTopupTotalWon((v) => v + WALLET_TOPUP_STEP_TOTAL_WON)}
                  aria-label={t("credits.increaseTopup", "금액 증가")}
                  data-testid="button-topup-plus"
                >
                  <Plus className="h-5 w-5" />
                </Button>
              </div>
              <div className="flex-1 space-y-1 text-sm text-muted-foreground border-t sm:border-t-0 sm:border-l border-border/60 pt-4 sm:pt-0 sm:pl-6">
                <p>
                  {t("credits.topupSupplyLine", "지갑 적립(공급가액): {{n}}원", {
                    n: topupSupplyWon.toLocaleString(),
                  })}
                </p>
                <p className="text-xs">{t("credits.topupStepHint", "기본 3,000원에서 +를 누를 때마다 2,000원씩 증가합니다.")}</p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2 mt-6">
              <Button
                variant="outline"
                onClick={() => {
                  setBankRequestResult(null);
                  setBankModalOpen(true);
                }}
                data-testid="button-charge-bank"
              >
                <Landmark size={16} className="mr-2" />
                {t("credits.bankTransferCharge", "계좌이체로 충전 신청")}
              </Button>
              {isTossAvailable ? (
                <Button onClick={() => void handleTossPayment()} disabled={tossLoading} data-testid="button-charge-toss">
                  {tossLoading ? <Loader2 className="animate-spin mr-2 h-4 w-4" /> : <CreditCard size={16} className="mr-2" />}
                  {t("credits.tossPay", "카드 결제")}
                </Button>
              ) : null}
            </div>
            {bankInfo && (
              <p className="text-xs text-muted-foreground mt-3 font-medium">
                {bankInfo.bankName} {bankInfo.bankAccount} {bankInfo.bankHolder}
              </p>
            )}
          </Card>
        </div>

        <Dialog open={bankModalOpen} onOpenChange={setBankModalOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>{t("credits.bankTransferTitleWon", "계좌이체로 지갑 충전")}</DialogTitle>
            </DialogHeader>
            {bankRequestResult ? (
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">{bankRequestResult.message}</p>
                <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-2 text-sm">
                  <p><span className="font-medium">{t('pricing.bankName', '은행')}:</span> {bankRequestResult.bankInfo.bankName}</p>
                  <p><span className="font-medium">{t('pricing.accountNumber', '계좌번호')}:</span> {bankRequestResult.bankInfo.bankAccount}</p>
                  <p><span className="font-medium">{t('pricing.accountHolder', '예금주')}:</span> {bankRequestResult.bankInfo.bankHolder}</p>
                  <p><span className="font-medium">{t('pricing.amount', '입금액')}:</span> {bankRequestResult.amount.toLocaleString("ko-KR")}{t('pricing.won', '원')}</p>
                  <p className="text-xs text-muted-foreground">{t('pricing.orderId', '신청 번호')}: {bankRequestResult.orderId}</p>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  {t(
                    "credits.modalIntroWon",
                    `충전금 {{charge}}원 + 부가세 10% = 총결제 {{total}}원을 아래 계좌로 입금해 주시면 확인 후 지갑에 반영됩니다.`,
                    {
                      charge: topupSupplyWon.toLocaleString("ko-KR"),
                      total: topupTotalWon.toLocaleString("ko-KR"),
                    },
                  )}
                </p>
                {bankInfo && (
                  <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-2 text-sm">
                    <p><span className="font-medium">{t('pricing.bankName', '은행')}:</span> {bankInfo.bankName}</p>
                    <p><span className="font-medium">{t('pricing.accountNumber', '계좌번호')}:</span> {bankInfo.bankAccount}</p>
                    <p><span className="font-medium">{t('pricing.accountHolder', '예금주')}:</span> {bankInfo.bankHolder}</p>
                    <p><span className="font-medium">{t('pricing.amount', '입금액')}:</span>{" "}
                      {`${topupTotalWon.toLocaleString("ko-KR")}${t('pricing.won', '원')} (${t('credits.depositAmountWithVat', { total: topupTotalWon.toLocaleString("ko-KR"), charge: topupSupplyWon.toLocaleString("ko-KR"), defaultValue: `${topupSupplyWon.toLocaleString("ko-KR")}원 + 부가세 10%` })})`}
                    </p>
                  </div>
                )}
                <Button
                  className="w-full"
                  onClick={() => requestBankMutation.mutate(topupTotalWon)}
                  disabled={requestBankMutation.isPending || topupTotalWon < WALLET_TOPUP_MIN_TOTAL_WON}
                >
                  {requestBankMutation.isPending ? t('credits.processing', '처리 중...') : t('pricing.submitBankRequest', '입금 신청하기')}
                </Button>
              </div>
            )}
          </DialogContent>
        </Dialog>

        <div>
          <h2 className="text-xl font-semibold mb-4">{t("credits.transactionHistoryWon", "지갑 사용 내역")}</h2>
          {isLoadingTx ? (
            <div className="flex justify-center py-8"><Loader2 className="animate-spin text-primary" size={24} /></div>
          ) : (!transactions || transactions.length === 0) ? (
            <Card className="p-8 text-center">
              <Clock className="mx-auto mb-3 text-muted-foreground opacity-50" size={40} />
              <p className="text-muted-foreground">{t('credits.noTransactions', '아직 거래 내역이 없습니다')}</p>
            </Card>
          ) : (
            <div className="max-h-[600px] overflow-y-auto pr-1">
              <div className="space-y-2">
                {transactions.map((tx: any) => (
                  <Card key={tx.id} className="p-4" data-testid={`card-transaction-${tx.id}`}>
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-8 h-8 rounded-lg bg-secondary flex items-center justify-center shrink-0">
                          {getTypeIcon(tx.type)}
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-medium">{getTypeLabel(tx.type)}</p>
                          {tx.description && <p className="text-xs text-muted-foreground truncate">{tx.description}</p>}
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <p className={`text-sm font-bold ${tx.amount > 0 ? "text-green-400" : "text-red-400"}`}>
                          {tx.amount > 0 ? "+" : ""}
                          {tx.amount.toLocaleString()}
                          {t("common.won", "원")}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {tx.createdAt
                            ? new Intl.DateTimeFormat("ko-KR", {
                                timeZone: "Asia/Seoul",
                                dateStyle: "short",
                                timeStyle: "short",
                                hour12: false,
                              }).format(new Date(tx.createdAt))
                            : ""}
                        </p>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
      <Footer />
      </div>
    </PageTransition>
  );
}
