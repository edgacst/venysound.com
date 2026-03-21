import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/hooks/use-auth";
import { LOGIN_PATH } from "@/lib/site-paths";
import { useToast } from "@/hooks/use-toast";
import { Coins, Plus, Gift, Download, Loader2, Clock, CreditCard, Landmark, Sparkles, Undo2 } from "lucide-react";
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
import { CREDIT_TO_WON, creditsSupplyWon, creditsTotalWithVatWon } from "@shared/credits-pricing";

const CREDIT_PACKAGES = [
  { amount: 500, label: "500" },
  { amount: 1000, label: "1,000" },
  { amount: 1500, label: "1,500" },
  { amount: 2000, label: "2,000" },
  { amount: 2500, label: "2,500" },
  { amount: 3000, label: "3,000" },
];

const creditsToWon = creditsSupplyWon;
const totalWithVat = creditsTotalWithVatWon;

export default function Credits() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedPackage, setSelectedPackage] = useState<number | null>(null);
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

  const { data: creditData, isLoading } = useQuery<{ credits: number }>({
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
            toast({ title: t("credits.chargeComplete", "충전 완료"), description: t("credits.chargeCompleteDesc", "크레딧이 충전되었습니다. 현재 잔액: ") + (data.credits ?? 0).toLocaleString() });
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
    mutationFn: async ({ credits, reason }: { credits: number; reason: string }) => {
      const res = await apiRequest("POST", "/api/credits/refund-request", { credits, reason });
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
      toast({ title: t('credits.chargeComplete', '충전 완료'), description: t('credits.chargeCompleteDesc', '크레딧이 충전되었습니다. 현재 잔액: ') + data.credits?.toLocaleString() });
      queryClient.invalidateQueries({ queryKey: ["/api/credits"] });
      queryClient.invalidateQueries({ queryKey: ["/api/credits/transactions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/earnings"] });
      setSelectedPackage(null);
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
    if (!selectedPackage || !user || !tossClientKey?.clientKey) return;
    const amount = totalWithVat(selectedPackage);
    const orderId = `CREDIT_${String(user.id).replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 20)}_${Date.now()}`;
    // amount는 원화 결제금액 (크레딧 수량 × 7.5원 + 부가세 10%)
    sessionStorage.setItem("credit_charge", JSON.stringify({ amount }));
    setTossLoading(true);
    try {
      const tossPayments = await loadTossPayments(tossClientKey.clientKey);
      const baseUrl = window.location.origin;
      await tossPayments.requestPayment("카드", {
        amount,
        orderId,
        orderName: t("credits.orderName", "크레딧 충전"),
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
          <p className="text-muted-foreground mb-4">{t('credits.loginRequiredDesc', '크레딧을 충전하려면 먼저 로그인해주세요')}</p>
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
          <h1 className="text-3xl font-bold mb-2" data-testid="text-credits-title">{t('credits.title', '크레딧 충전')}</h1>
          <p className="text-muted-foreground">{t('credits.subtitle', '크레딧을 충전하여 아티스트를 후원하고 음원을 구매하세요')}</p>
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
                <p className="text-sm text-muted-foreground">{t('credits.myCredits', '내 크레딧')}</p>
                <p className="text-3xl font-bold" data-testid="text-credit-balance">
                  {isLoading ? <Loader2 className="animate-spin" size={24} /> : (creditData?.credits || 0).toLocaleString()}
                </p>
              </div>
            </div>
            <Badge variant="outline" className="text-sm px-3 py-1">
              {t('credits.exchangeRate', '1 크레딧 = 7.5원')}
            </Badge>
          </div>
        </Card>

        <Card className="p-6 mb-8 border-border/80">
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <Undo2 className="text-orange-400" size={20} />
                {t("credits.refundSectionTitle", "충전 크레딧 환불")}
              </h2>
              <p className="text-sm text-muted-foreground mt-1">
                {t(
                  "credits.refundSectionDesc",
                  "미사용 충전 크레딧에 대한 환불은 환불 정책(7일 이내 등)에 따라 검토됩니다. 승인 시 크레딧만 차감되며, 원화 환불은 별도로 안내됩니다.",
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
              {refundRequests.map((r) => (
                <div
                  key={r.id}
                  className="flex flex-wrap items-center justify-between gap-2 text-sm rounded-lg bg-muted/30 px-3 py-2"
                  data-testid={`refund-request-${r.id}`}
                >
                  <span className="tabular-nums">{r.creditsAmount.toLocaleString()} {t("credits.creditUnit", "크레딧")}</span>
                  <Badge variant={r.status === "pending" ? "secondary" : r.status === "approved" ? "default" : "destructive"}>
                    {r.status === "pending"
                      ? t("credits.refundStatusPending", "검토 중")
                      : r.status === "approved"
                        ? t("credits.refundStatusApproved", "승인")
                        : t("credits.refundStatusRejected", "반려")}
                  </Badge>
                  <span className="text-xs text-muted-foreground w-full flex flex-col gap-0.5 sm:items-end sm:text-right">
                    {r.createdAt ? (
                      <span>
                        {t("credits.refundRequestedAtLabel", "신청")}{" "}
                        {new Date(r.createdAt).toLocaleString("ko-KR")}
                      </span>
                    ) : null}
                    {r.status !== "pending" && r.processedAt ? (
                      <span>
                        {t("credits.refundProcessedAtLabel", "처리")}{" "}
                        {new Date(r.processedAt).toLocaleString("ko-KR")}
                      </span>
                    ) : null}
                    {r.krwRefundCompletedAt ? (
                      <span>
                        {t("credits.refundKrwRecordedLabel", "원화 입금 기록")}{" "}
                        {r.krwRefundAmountWon != null ? `${r.krwRefundAmountWon.toLocaleString()}${t("common.won", "원")}` : "—"}
                        {" · "}
                        {new Date(r.krwRefundCompletedAt).toLocaleString("ko-KR")}
                        {r.krwRefundNote ? ` · ${r.krwRefundNote}` : ""}
                      </span>
                    ) : null}
                    {r.adminNote ? <span className="break-words max-w-full">{r.adminNote}</span> : null}
                  </span>
                </div>
              ))}
            </div>
          ) : null}
        </Card>

        <Dialog open={refundOpen} onOpenChange={setRefundOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>{t("credits.refundDialogTitle", "충전 크레딧 환불 신청")}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label htmlFor="refund-credits">{t("credits.refundCreditsLabel", "환불 요청 크레딧")}</Label>
                <input
                  id="refund-credits"
                  type="number"
                  min={1}
                  max={creditData?.credits ?? 0}
                  className="mt-1 flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={refundCreditsInput}
                  onChange={(e) => setRefundCreditsInput(e.target.value)}
                  placeholder={t("credits.refundCreditsPlaceholder", "숫자 입력")}
                />
                <p className="text-xs text-muted-foreground mt-1">
                  {t("credits.refundMaxHint", "보유: {{n}} 크레딧", { n: (creditData?.credits ?? 0).toLocaleString() })}
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
              <Button
                className="w-full"
                disabled={refundRequestMutation.isPending}
                onClick={() => {
                  const n = parseInt(refundCreditsInput, 10);
                  if (!Number.isFinite(n) || n < 1) {
                    toast({ title: t("credits.refundInvalidAmount", "올바른 크레딧 수를 입력해 주세요"), variant: "destructive" });
                    return;
                  }
                  if (n > (creditData?.credits ?? 0)) {
                    toast({ title: t("credits.refundExceedsBalance", "보유 크레딧을 초과할 수 없습니다"), variant: "destructive" });
                    return;
                  }
                  refundRequestMutation.mutate({ credits: n, reason: refundReason.trim() });
                }}
              >
                {refundRequestMutation.isPending ? <Loader2 className="animate-spin" size={18} /> : t("credits.refundSubmit", "신청하기")}
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        <div className="mb-8">
          <h2 className="text-xl font-semibold mb-4">{t('credits.selectPackage', '충전 패키지 선택')}</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {CREDIT_PACKAGES.map((pkg) => (
              <Card
                key={pkg.amount}
                className={`p-5 cursor-pointer transition-all relative ${
                  selectedPackage === pkg.amount
                    ? "ring-2 ring-primary"
                    : "hover-elevate"
                }`}
                onClick={() => setSelectedPackage(pkg.amount)}
                data-testid={`card-package-${pkg.amount}`}
              >
                <div className="text-center">
                  <div className="flex items-center justify-center gap-1 mb-2">
                    <Coins size={18} className="text-primary" />
                    <span className="text-2xl font-bold">{pkg.label}</span>
                  </div>
                  <p className="text-sm text-muted-foreground">{creditsToWon(pkg.amount).toLocaleString()}{t('credits.won', '원')}</p>
                </div>
              </Card>
            ))}
          </div>
        </div>

        {selectedPackage && (
          <Card className="p-6 mb-8">
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <div>
                <p className="text-sm text-muted-foreground">{t('credits.selectedPackage', '선택한 패키지')}</p>
                <p className="text-xl font-bold">{selectedPackage.toLocaleString()} {t('credits.creditUnit', '크레딧')}</p>
                <p className="text-sm text-muted-foreground mt-1">
                  {t('credits.totalPaymentLine', { charge: creditsToWon(selectedPackage).toLocaleString(), total: totalWithVat(selectedPackage).toLocaleString(), defaultValue: `충전금 ${creditsToWon(selectedPackage).toLocaleString()}원 + 부가세 10% = 총결재 ${totalWithVat(selectedPackage).toLocaleString()}원` })}
                </p>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setSelectedPackage(null)}>{t('credits.cancel', '취소')}</Button>
                <Button
                  onClick={() => {
                    setBankRequestResult(null);
                    setBankModalOpen(true);
                  }}
                  data-testid="button-charge"
                >
                  <Landmark size={16} className="mr-2" />
                  {t('credits.bankTransferCharge', '계좌이체로 충전 신청')}
                </Button>
              </div>
            </div>
            <p className="text-xs text-muted-foreground mt-3">
              {t('credits.tosPaymentNotice', '현재 토스결제는 준비중에 있습니다. 지금은 계좌 이체만 가능합니다.')}
              {bankInfo && (
                <span className="block mt-1 font-medium"> {bankInfo.bankName} {bankInfo.bankAccount} {bankInfo.bankHolder}</span>
              )}
            </p>
          </Card>
        )}

        <Dialog open={bankModalOpen} onOpenChange={setBankModalOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>{t('credits.bankTransferTitle', '계좌이체로 크레딧 충전')}</DialogTitle>
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
            ) : selectedPackage != null ? (
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  {t('credits.modalIntro', { charge: creditsToWon(selectedPackage).toLocaleString("ko-KR"), total: totalWithVat(selectedPackage).toLocaleString("ko-KR"), defaultValue: `충전금 ${creditsToWon(selectedPackage).toLocaleString("ko-KR")}원 + 부가세 10% = 총결재 ${totalWithVat(selectedPackage).toLocaleString("ko-KR")}원을 아래 계좌로 입금해 주시면 확인 후 크레딧이 충전됩니다.` })}
                </p>
                {bankInfo && (
                  <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-2 text-sm">
                    <p><span className="font-medium">{t('pricing.bankName', '은행')}:</span> {bankInfo.bankName}</p>
                    <p><span className="font-medium">{t('pricing.accountNumber', '계좌번호')}:</span> {bankInfo.bankAccount}</p>
                    <p><span className="font-medium">{t('pricing.accountHolder', '예금주')}:</span> {bankInfo.bankHolder}</p>
                    <p><span className="font-medium">{t('pricing.amount', '입금액')}:</span> {totalWithVat(selectedPackage).toLocaleString("ko-KR")}{t('pricing.won', '원')} ({t('credits.depositAmountWithVat', { total: totalWithVat(selectedPackage).toLocaleString("ko-KR"), charge: creditsToWon(selectedPackage).toLocaleString("ko-KR"), defaultValue: `${creditsToWon(selectedPackage).toLocaleString("ko-KR")}원 + 부가세 10%` })})</p>
                  </div>
                )}
                <Button
                  className="w-full"
                  onClick={() => requestBankMutation.mutate(totalWithVat(selectedPackage))}
                  disabled={requestBankMutation.isPending}
                >
                  {requestBankMutation.isPending ? t('credits.processing', '처리 중...') : t('pricing.submitBankRequest', '입금 신청하기')}
                </Button>
              </div>
            ) : null}
          </DialogContent>
        </Dialog>

        <div>
          <h2 className="text-xl font-semibold mb-4">{t('credits.transactionHistory', '크레딧 사용 내역')}</h2>
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
                          {tx.amount > 0 ? "+" : ""}{tx.amount.toLocaleString()}
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
