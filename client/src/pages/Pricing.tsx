import { useState, useEffect } from "react";
import { Link, useSearch } from "wouter";
import { Navigation } from "@/components/Navigation";
import { Footer } from "@/components/Footer";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/hooks/use-auth";
import { LOGIN_PATH } from "@/lib/site-paths";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import {
  Check,
  Crown,
  Music,
  Headphones,
  Radio,
  Sparkles,
  Shield,
  Loader2,
  Zap,
  Landmark,
  CreditCard,
  XCircle,
  Calendar,
  Star,
  Layers,
  Globe,
  FileText,
  type LucideIcon,
} from "lucide-react";
import { PageTransition } from "@/components/PageTransition";
import { useTranslation } from "react-i18next";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  normalizeSubscriptionPlanPrices,
  subscriptionTotalVatInclusiveWon,
  isPaidSubscriptionTierId,
  type PaidSubscriptionTierId,
} from "@shared/subscription-plan-pricing";
import { submitPayupDanalDirectCheckout } from "@/lib/payup-checkout";

const PAID_PLAN_ORDER: PaidSubscriptionTierId[] = ["starter", "basic", "pro", "premium"];

/** PG 복귀가 끊겨도 요금제에서 주문 상태를 다시 확인할 수 있게 */
const PAYUP_PENDING_ORDER_KEY = "venysound_payup_pending_order";

export default function Pricing() {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [billingPeriod, setBillingPeriod] = useState<"monthly" | "yearly">("monthly");

  const FREE_FEATURES: { icon: LucideIcon; text: string; sub?: string }[] = [
    { icon: Music, text: t("pricing.freeFeature1", "무제한 음원 스트리밍") },
    { icon: Music, text: t("pricing.freeFeature2", "무제한 음원 업로드") },
    { icon: Radio, text: t("pricing.freeFeature3", "내 방송 채널 운영") },
    { icon: Shield, text: t("pricing.freeFeature4", "커뮤니티 참여") },
    { icon: Headphones, text: t("pricing.freeFeature5", "고음질 스트리밍") },
    {
      icon: Sparkles,
      text: t("pricing.freeFeatureAiMusic", "AI 음원 생성 (월 2곡)"),
      sub: t("pricing.freeFeatureAiMusicDownloadNote", "사이트에 공개 후 다운로드 가능"),
    },
  ];

  const STARTER_FEATURES = [
    { icon: Star, text: t("pricing.starterFeature1", "Free 모든 기능") },
    { icon: Sparkles, text: t("pricing.starterFeatureAi", "입문용 약 66곡 생성 가능") },
    { icon: Shield, text: t("pricing.starterFeatureNoAds", "광고 없음") },
  ];

  const BASIC_FEATURES = [
    { icon: Layers, text: t("pricing.basicFeature1", "Free 모든 기능") },
    { icon: Sparkles, text: t("pricing.basicFeatureAi", "약 120곡 생성 가능") },
    { icon: Shield, text: t("pricing.basicFeatureNoAds", "광고 없음") },
  ];

  const PRO_FEATURES = [
    { icon: Crown, text: t("pricing.proFeatureAllFree", "Free 모든 기능") },
    { icon: Sparkles, text: t("pricing.proFeatureAiMusic", "약 200곡 생성 가능") },
    { icon: Shield, text: t("pricing.proFeatureNoAds", "광고 없음") },
    {
      icon: Globe,
      text: t(
        "pricing.proPremiumGlobalDistribution",
        "✓ DistroKid 연동 포함, 다수 스토어 글로벌유통 대행",
      ),
    },
  ];

  const PREMIUM_FEATURES = [
    { icon: Crown, text: t("pricing.premiumFeatureAllPro", "Pro 모든 기능") },
    { icon: Sparkles, text: t("pricing.premiumFeatureCredits", "약 300곡 생성 가능") },
    { icon: FileText, text: t("pricing.premiumFeatureScorePdf", "AI 라이브러리 악보 PDF 다운로드") },
    { icon: Crown, text: t("pricing.premiumFeature6", "프리미엄 배지") },
    { icon: Shield, text: t("pricing.premiumFeatureSupport", "우선 지원") },
    {
      icon: Globe,
      text: t(
        "pricing.proPremiumGlobalDistribution",
        "✓ DistroKid 연동 포함, 다수 스토어 글로벌유통 대행",
      ),
    },
  ];

  const [bankModalOpen, setBankModalOpen] = useState(false);
  const [selectedPlanId, setSelectedPlanId] = useState<PaidSubscriptionTierId>("pro");
  const [bankRequestResult, setBankRequestResult] = useState<{
    bankInfo: { bankName: string; bankAccount: string; bankHolder: string };
    amount: number;
    billingPeriod: string;
    orderId: string;
    message: string;
  } | null>(null);

  const { data: subscriptionData, isLoading: loadingSub } = useQuery<{
    tier: string;
    plan?: string;
    expiresAt?: string;
  }>({
    queryKey: ["/api/subscription/me"],
    enabled: !!user,
  });

  const { data: bankInfo } = useQuery<{
    bankName: string;
    bankAccount: string;
    bankHolder: string;
    amountMonthly: number;
    amountYearly: number;
    plans?: { id: string; name: string; monthlyPrice: number; yearlyPrice: number }[];
  }>({
    queryKey: ["/api/subscription/bank-info"],
    staleTime: 60_000,
  });

  const searchString = useSearch();

  const { data: payupStatus } = useQuery<{ payup: { configured: boolean; testMode: boolean } }>({
    queryKey: ["/api/payup/status"],
    staleTime: 60_000,
  });

  useEffect(() => {
    if (!searchString) return;
    const params = new URLSearchParams(searchString.startsWith("?") ? searchString.slice(1) : searchString);
    const p = params.get("payup");
    if (p === "success") {
      try {
        sessionStorage.removeItem(PAYUP_PENDING_ORDER_KEY);
      } catch {
        /* ignore */
      }
      toast({
        title: t("pricing.payupSuccessTitle", "구독 결제 완료"),
        description: t("pricing.payupSuccessDesc", "멤버십이 적용되었습니다."),
      });
      void queryClient.invalidateQueries({ queryKey: ["/api/subscription/me"] });
      void queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
      void queryClient.invalidateQueries({ queryKey: ["/api/ai-music/usage"] });
      window.history.replaceState(null, "", "/pricing");
    }
    if (p === "cancel" || p === "fail") {
      let pendingOrder = "";
      try {
        pendingOrder = (sessionStorage.getItem(PAYUP_PENDING_ORDER_KEY) ?? "").trim();
      } catch {
        /* ignore */
      }
      if (user && pendingOrder) {
        void fetch("/api/subscription/payup/client-outcome", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ orderNumber: pendingOrder, outcome: p === "cancel" ? "cancel" : "fail" }),
        })
          .then(() => {
            void queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
          })
          .catch(() => {
            /* 알림 실패는 요금/토스트와 무관 */
          });
      }
      try {
        sessionStorage.removeItem(PAYUP_PENDING_ORDER_KEY);
      } catch {
        /* ignore */
      }
      if (p === "cancel") {
        toast({
          title: t("pricing.payupCancelledTitle", "결제 취소"),
          description: t("pricing.payupCancelledDesc", "카드 결제를 완료하지 않았습니다."),
          variant: "destructive",
        });
      } else {
        toast({
          title: t("pricing.payupFailTitle", "결제 실패"),
          description: t("pricing.payupFailDesc", "카드 승인에 실패했습니다. 다시 시도하거나 계좌이체를 이용해 주세요."),
          variant: "destructive",
        });
      }
      /** 음악 생성 등 다른 탭·캐시에 남은 유료 한도 표시 제거 (취소해도 서버는 free 인데 클라만 오래된 경우) */
      void queryClient.invalidateQueries({ queryKey: ["/api/ai-music/usage"] });
      void queryClient.invalidateQueries({ queryKey: ["/api/subscription/me"] });
      void queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
      window.history.replaceState(null, "", "/pricing");
    }
  }, [searchString, toast, t, queryClient, user]);

  const [payupPendingOrder, setPayupPendingOrder] = useState<string | null>(null);
  useEffect(() => {
    if (!user) {
      setPayupPendingOrder(null);
      return;
    }
    try {
      const o = sessionStorage.getItem(PAYUP_PENDING_ORDER_KEY);
      setPayupPendingOrder(o && o.trim() ? o.trim() : null);
    } catch {
      setPayupPendingOrder(null);
    }
  }, [user?.id]);

  /** 페이업에서 취소·환불된 뒤에도 서버 paid 가 남은 경우 — 조회 경로 설정 시 자동 보정 */
  useEffect(() => {
    if (!user) return;
    void (async () => {
      try {
        const res = await apiRequest("POST", "/api/subscription/payup/reconcile-latest", {});
        const data = (await res.json()) as { action?: string };
        if (data?.action === "reverted") {
          void queryClient.invalidateQueries({ queryKey: ["/api/subscription/me"] });
          void queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
          void queryClient.invalidateQueries({ queryKey: ["/api/ai-music/usage"] });
        }
      } catch {
        /* ignore */
      }
    })();
  }, [user?.id, queryClient]);

  const payupStatusCheckMutation = useMutation({
    mutationFn: async (orderNumber: string) => {
      const res = await fetch(
        `/api/subscription/payup/checkout-status?orderNumber=${encodeURIComponent(orderNumber)}`,
        { credentials: "include", cache: "no-store" },
      );
      if (!res.ok) throw new Error("status");
      return res.json() as Promise<{ status: "paid" | "pending" | "none" }>;
    },
    onSuccess: (data) => {
      if (data.status === "paid") {
        try {
          sessionStorage.removeItem(PAYUP_PENDING_ORDER_KEY);
        } catch {
          /* ignore */
        }
        setPayupPendingOrder(null);
        toast({
          title: t("pricing.payupSuccessTitle", "구독 결제 완료"),
          description: t("pricing.payupSuccessDesc", "멤버십이 적용되었습니다."),
        });
        void queryClient.invalidateQueries({ queryKey: ["/api/subscription/me"] });
        void queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
        void queryClient.invalidateQueries({ queryKey: ["/api/ai-music/usage"] });
        return;
      }
      if (data.status === "pending") {
        toast({
          title: t("pricing.payupStatusPendingTitle", "아직 결제 완료 처리 전입니다"),
          description: t(
            "pricing.payupStatusPendingDesc",
            "PG에서 결제를 마쳤다면 잠시 후 다시「상태 확인」을 눌러 주세요. 계속 pending이면 고객센터로 문의해 주세요.",
          ),
        });
        return;
      }
      try {
        sessionStorage.removeItem(PAYUP_PENDING_ORDER_KEY);
      } catch {
        /* ignore */
      }
      setPayupPendingOrder(null);
      toast({
        title: t("pricing.payupStatusNoneTitle", "진행 중인 카드 주문이 없습니다"),
        description: t("pricing.payupStatusNoneDesc", "취소했거나 다른 계정으로 결제했을 수 있습니다. 필요하면 카드 결제를 다시 시도해 주세요."),
        variant: "destructive",
      });
      void queryClient.invalidateQueries({ queryKey: ["/api/ai-music/usage"] });
      void queryClient.invalidateQueries({ queryKey: ["/api/subscription/me"] });
      void queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
    },
    onError: () => {
      toast({
        title: t("pricing.payupStatusCheckFailed", "상태를 확인하지 못했습니다"),
        variant: "destructive",
      });
    },
  });

  const payupSubscribeMutation = useMutation({
    mutationFn: async ({ period, planId }: { period: "monthly" | "yearly"; planId: PaidSubscriptionTierId }) => {
      const isMobile =
        typeof window !== "undefined" &&
        (/Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini|Mobile/i.test(navigator.userAgent || "") ||
          (typeof window.matchMedia === "function" && window.matchMedia("(max-width: 768px)").matches));
      const res = await apiRequest("POST", "/api/subscription/payup/order", {
        billingPeriod: period,
        planId,
        userAgentKind: isMobile ? "MW" : "PC",
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as {
          message?: string;
          detail?: string;
          responseCode?: string;
          payupHttpStatus?: number;
          payupResponseKeys?: string[];
          payupResponsePreview?: string;
          missing?: Record<string, boolean>;
        };
        const base = data.message || "카드 결제 준비에 실패했습니다";
        const keys = Array.isArray(data.payupResponseKeys) ? data.payupResponseKeys.join(",") : "";
        const miss =
          data.missing && typeof data.missing === "object"
            ? Object.entries(data.missing)
                .filter(([, v]) => v)
                .map(([k]) => k)
                .join(",")
            : "";
        const extra = [
          data.responseCode,
          data.detail,
          data.payupHttpStatus != null ? `HTTP ${data.payupHttpStatus}` : "",
          keys ? `keys:${keys}` : "",
          miss ? `누락:${miss}` : "",
          data.payupResponsePreview ? data.payupResponsePreview.slice(0, 200) : "",
        ]
          .filter(Boolean)
          .join(" · ");
        throw new Error(extra ? `${base} (${extra.slice(0, 500)})` : base);
      }
      return res.json() as Promise<{
        starturl: string;
        startparams: string;
        cancelUrl: string;
        cardCode: string;
        orderNumber: string;
      }>;
    },
    onSuccess: (data) => {
      try {
        sessionStorage.setItem(PAYUP_PENDING_ORDER_KEY, data.orderNumber);
      } catch {
        /* ignore */
      }
      submitPayupDanalDirectCheckout({
        starturl: data.starturl,
        startparams: data.startparams,
        cancelUrl: data.cancelUrl,
        cardCode: data.cardCode,
      });
    },
    onError: (error: Error) => {
      toast({
        title: t("pricing.payupOrderFailedTitle", "카드 결제"),
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const requestBankMutation = useMutation({
    mutationFn: async ({ period, planId }: { period: "monthly" | "yearly"; planId: PaidSubscriptionTierId }) => {
      const res = await apiRequest("POST", "/api/subscription/request-bank", { billingPeriod: period, planId });
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
        billingPeriod: data.billingPeriod,
        orderId: data.orderId,
        message: data.message,
      });
      toast({ title: t("pricing.bankRequestSubmitted", "입금 신청 완료"), description: data.message });
      queryClient.invalidateQueries({ queryKey: ["/api/subscription/me"] });
    },
    onError: (error: Error) => {
      toast({ title: t("pricing.bankRequestFailed", "입금 신청 실패"), description: error.message, variant: "destructive" });
    },
  });

  const cancelMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/subscription/cancel");
      return res.json();
    },
    onSuccess: (data) => {
      toast({ title: t("pricing.cancelSuccess", "구독 해지"), description: data.message });
      void queryClient.invalidateQueries({ queryKey: ["/api/subscription/me"] });
      void queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
      void queryClient.invalidateQueries({ queryKey: ["/api/ai-music/usage"] });
    },
    onError: (error: Error) => {
      toast({ title: t("pricing.cancelFailed", "해지 실패"), description: error.message, variant: "destructive" });
    },
  });

  const handleBankTransferClick = (planId: PaidSubscriptionTierId) => {
    if (!user) {
      toast({
        title: t("pricing.loginRequired", "로그인이 필요합니다"),
        description: t("pricing.loginRequiredDesc", "유료 구독을 위해 먼저 로그인해주세요"),
        variant: "destructive",
      });
      window.location.href = LOGIN_PATH;
      return;
    }
    setSelectedPlanId(planId);
    setBankRequestResult(null);
    setBankModalOpen(true);
  };

  const handleBankRequestSubmit = () => {
    requestBankMutation.mutate({ period: billingPeriod, planId: selectedPlanId });
  };

  const tier = subscriptionData?.tier ?? "free";
  const isPaid = isPaidSubscriptionTierId(tier);

  function planNorm(id: PaidSubscriptionTierId) {
    const row = bankInfo?.plans?.find((p) => p.id === id);
    return normalizeSubscriptionPlanPrices(id, row?.monthlyPrice, row?.yearlyPrice);
  }

  const subscriptionPayAmount = subscriptionTotalVatInclusiveWon(
    billingPeriod === "monthly" ? planNorm(selectedPlanId).monthly : planNorm(selectedPlanId).yearly,
  );

  function bankTitleForPlan(id: PaidSubscriptionTierId): string {
    if (id === "premium") return t("pricing.bankTransferTitlePremium", "계좌이체로 Premium 구독");
    if (id === "pro") return t("pricing.bankTransferTitlePro", "계좌이체로 Pro 구독");
    if (id === "basic") return t("pricing.bankTransferTitleBasic", "계좌이체로 Basic 구독");
    return t("pricing.bankTransferTitleStarter", "계좌이체로 Starter 구독");
  }

  function renderPaidCard(id: PaidSubscriptionTierId) {
    const n = planNorm(id);
    const monthly = n.monthly;
    const yearly = n.yearly;
    const withVat = subscriptionTotalVatInclusiveWon(monthly);
    const withVatYearly = subscriptionTotalVatInclusiveWon(yearly);
    const isCurrent = tier === id;
    const features =
      id === "starter"
        ? STARTER_FEATURES
        : id === "basic"
          ? BASIC_FEATURES
          : id === "pro"
            ? PRO_FEATURES
            : PREMIUM_FEATURES;
    const title =
      id === "starter"
        ? t("pricing.starterPlanName", "Starter")
        : id === "basic"
          ? t("pricing.basicPlanName", "Basic")
          : id === "pro"
            ? t("pricing.proPlanName", "Pro")
            : t("pricing.premiumPlanName", "Premium");
    const desc =
      id === "starter"
        ? t("pricing.starterDescription", "입문용 약 66곡 생성 가능")
        : id === "basic"
          ? t("pricing.basicDescription", "약 120곡 생성 가능")
          : id === "pro"
            ? t("pricing.proDescription", "약 200곡 생성 가능")
            : t("pricing.premiumDescription", "약 300곡 생성 가능, 프리미엄 배지");
    const Icon =
      id === "starter" ? Star : id === "basic" ? Layers : id === "pro" ? Zap : Crown;
    const iconClass =
      id === "starter"
        ? "text-sky-400"
        : id === "basic"
          ? "text-cyan-400"
          : id === "pro"
            ? "text-primary"
            : "text-yellow-500";
    const checkClass =
      id === "premium" ? "text-yellow-500 shrink-0" : id === "pro" ? "text-primary shrink-0" : "text-muted-foreground shrink-0";

    return (
      <Card
        key={id}
        className={`p-6 relative flex flex-col ${
          id === "pro" ? "border-primary/50 shadow-lg shadow-primary/10" : ""
        }`}
        data-testid={`card-plan-${id}`}
      >
        {id === "pro" ? (
          <Badge
            variant="default"
            className="absolute -top-2.5 left-1/2 -translate-x-1/2 bg-primary px-3 text-xs no-default-hover-elevate no-default-active-elevate"
          >
            {t("pricing.popular", "인기")}
          </Badge>
        ) : null}
        <div className="mb-4">
          <h3 className="text-lg font-bold mb-1 flex items-center gap-1.5">
            <Icon size={18} className={iconClass} />
            {title}
          </h3>
          <p className="text-muted-foreground text-xs">{desc}</p>
        </div>
        <div className="mb-4">
          <span className="text-3xl font-bold tabular-nums">
            {monthly.toLocaleString("ko-KR")}
            {t("pricing.won", "원")}
          </span>
          <span className="text-muted-foreground text-sm">/{t("pricing.perMonth", "월")}</span>
          <p className="text-xs text-muted-foreground mt-0.5">
            {t("pricing.vatExcluded", "공급가")} · {t("pricing.vatSeparateLine", "부가세 별도")}
          </p>
          <p className="text-xs text-green-400 mt-1">
            {t("pricing.vatIncludedMonthlyLine", "부가세 포함 월 {{amount}}원", { amount: withVat.toLocaleString("ko-KR") })}
          </p>
          {billingPeriod === "yearly" && (
            <div className="mt-1 space-y-0.5">
              <div className="text-xs text-muted-foreground">
                {t("pricing.perYear", "년")} {yearly.toLocaleString("ko-KR")}
                {t("pricing.won", "원")} <span className="text-muted-foreground/80">({t("pricing.supplyPriceTag", "공급가")})</span>
              </div>
              <p className="text-xs text-green-400">
                {t("pricing.vatIncludedYearlyLine", "부가세 포함 연 {{amount}}원", { amount: withVatYearly.toLocaleString("ko-KR") })}
              </p>
            </div>
          )}
        </div>
        <div className="space-y-2 mb-6">
          {features.map((feature, i) => (
            <div key={i} className="flex items-center gap-2">
              <Check size={14} className={checkClass} />
              <span className="text-xs">{feature.text}</span>
            </div>
          ))}
        </div>
        <div className="mt-auto">
          {isCurrent ? (
            <div className="space-y-2">
              <div className="grid grid-cols-2 gap-2">
                <Button className="w-full" size="sm" disabled data-testid={`button-current-${id}`}>
                  <Icon size={14} className="mr-2" /> {t("pricing.currentPlan", "현재 플랜")}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full"
                  onClick={() => cancelMutation.mutate()}
                  disabled={cancelMutation.isPending}
                >
                  <XCircle size={14} className="mr-2" />
                  {t("pricing.cancelSubscription", "구독 해지")}
                </Button>
              </div>
              {subscriptionData?.expiresAt && (
                <p className="text-xs text-muted-foreground text-center flex items-center justify-center gap-1">
                  <Calendar size={12} />
                  {new Date(subscriptionData.expiresAt).toLocaleDateString("ko-KR")}
                </p>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              <Button
                className={`w-full ${id === "pro" ? "bg-primary" : ""}`}
                variant={id === "pro" ? "default" : id === "premium" ? "outline" : "secondary"}
                size="sm"
                onClick={() => handleBankTransferClick(id)}
                data-testid={`button-bank-subscribe-${id}`}
              >
                <Landmark size={14} className="mr-2" />
                {t("pricing.bankTransferSubscribe", "계좌이체로 구독하기")}
              </Button>
              {payupStatus?.payup?.configured ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="w-full"
                  disabled={payupSubscribeMutation.isPending}
                  onClick={() => {
                    if (!user) {
                      toast({
                        title: t("pricing.loginRequired", "로그인이 필요합니다"),
                        description: t("pricing.loginRequiredDesc", "유료 구독을 위해 먼저 로그인해주세요"),
                        variant: "destructive",
                      });
                      window.location.href = LOGIN_PATH;
                      return;
                    }
                    payupSubscribeMutation.mutate({ period: billingPeriod, planId: id });
                  }}
                  data-testid={`button-payup-subscribe-${id}`}
                >
                  <CreditCard size={14} className="mr-2" />
                  {payupSubscribeMutation.isPending
                    ? t("pricing.processing", "처리 중...")
                    : t("pricing.cardPayupSubscribe", "카드로 결제하기 (페이업)")}
                </Button>
              ) : null}
              <p className="text-xs text-muted-foreground text-center mt-1.5">
                {payupStatus?.payup?.configured
                  ? t("pricing.bankOrCardNote", "계좌이체 또는 카드(페이업)로 구독할 수 있습니다.")
                  : t("pricing.bankTransferOnlyNote", "당분간은 계좌 이체만 가능합니다")}
              </p>
            </div>
          )}
        </div>
      </Card>
    );
  }

  return (
    <PageTransition>
      <div className="min-h-screen bg-background flex flex-col">
        <Navigation />
        {user && payupPendingOrder ? (
          <div className="container max-w-7xl mx-auto px-4 pt-4" data-testid="card-payup-recovery">
            <Card className="p-4 border-amber-500/40 bg-amber-500/10">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 text-sm">
                <p className="text-muted-foreground">
                  {t(
                    "pricing.payupRecoveryHint",
                    "카드 결제창에서 돌아온 뒤 멤버십이 그대로라면, 복귀 처리가 끝나기 전일 수 있습니다. 아래를 눌러 서버 상태를 확인해 보세요.",
                  )}
                </p>
                <div className="flex flex-wrap gap-2 shrink-0">
                  <Button
                    type="button"
                    size="sm"
                    disabled={payupStatusCheckMutation.isPending}
                    onClick={() => payupPendingOrder && payupStatusCheckMutation.mutate(payupPendingOrder)}
                  >
                    {payupStatusCheckMutation.isPending ? (
                      <Loader2 className="w-4 h-4 animate-spin mr-1" />
                    ) : null}
                    {t("pricing.payupCheckStatus", "결제 상태 확인")}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      try {
                        sessionStorage.removeItem(PAYUP_PENDING_ORDER_KEY);
                      } catch {
                        /* ignore */
                      }
                      setPayupPendingOrder(null);
                    }}
                  >
                    {t("pricing.payupRecoveryDismiss", "나중에")}
                  </Button>
                </div>
              </div>
            </Card>
          </div>
        ) : null}
        <div className="container max-w-7xl mx-auto px-4 py-12">
          <div className="text-center mb-12">
            <h1 className="text-4xl font-bold mb-4" data-testid="text-pricing-title">
              <Crown className="inline-block mr-2 text-yellow-500" size={36} />
              {t("pricing.title", "Veny Sound 멤버십")}
            </h1>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto whitespace-pre-line">
              {t(
                "pricing.subtitle",
                "Starter부터 Premium까지, 플랜별 월 AI 음악 크레딧(500~2,000)과\n광고 없음 등 혜택을 선택하세요.",
              )}
            </p>
            <p
              className="text-sm sm:text-base font-semibold text-red-600 dark:text-red-400 max-w-2xl mx-auto mt-4 leading-relaxed whitespace-pre-line"
              data-testid="text-pricing-ai-rollover-notice"
            >
              {t(
                "pricing.aiBudgetRolloverNotice",
                "저희 멤버십은 타사이트와 달리 월사용한도가 소멸되지 않고 다음달로 이월됩니다.\n(이번달에 사용하지 않음 금액).",
              )}
            </p>
            <p className="text-sm text-muted-foreground max-w-2xl mx-auto mt-1 underline decoration-muted-foreground/50">
              {t("pricing.taxReceiptNote", "구독료에 대한 세금계산서, 현금 영수증 발행이 가능합니다.")}
            </p>
          </div>

          {user && loadingSub ? (
            <div className="flex justify-center py-20">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
          ) : (
            <>
              <div className="flex justify-center mb-8">
                <div className="inline-flex rounded-lg border border-border p-1 bg-card">
                  <button
                    type="button"
                    onClick={() => setBillingPeriod("monthly")}
                    className={`px-6 py-2 rounded-md text-sm font-medium transition-colors ${
                      billingPeriod === "monthly" ? "bg-primary text-primary-foreground" : "text-muted-foreground"
                    }`}
                    data-testid="button-monthly"
                  >
                    {t("pricing.monthly", "월간")}
                  </button>
                  <button
                    type="button"
                    onClick={() => setBillingPeriod("yearly")}
                    className={`px-6 py-2 rounded-md text-sm font-medium transition-colors ${
                      billingPeriod === "yearly" ? "bg-primary text-primary-foreground" : "text-muted-foreground"
                    }`}
                    data-testid="button-yearly"
                  >
                    {t("pricing.yearly", "연간")}
                    <Badge
                      variant="secondary"
                      className="ml-2 text-xs bg-green-600/20 text-green-400 no-default-hover-elevate no-default-active-elevate"
                    >
                      {t("pricing.discount", "10% 할인")}
                    </Badge>
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-6 mx-auto items-stretch">
                <Card className="p-6 relative" data-testid="card-free-plan">
                  <div className="mb-4">
                    <h3 className="text-lg font-bold mb-1">{t("pricing.freePlanName", "Free")}</h3>
                    <p className="text-muted-foreground text-xs">{t("pricing.freeDescription", "무제한 음원 스트리밍과 업로드")}</p>
                  </div>
                  <div className="mb-4">
                    <span className="text-3xl font-bold">0{t("pricing.won", "원")}</span>
                    <span className="text-muted-foreground text-sm">/{t("pricing.perMonth", "월")}</span>
                  </div>
                  <div className="space-y-2 mb-4">
                    {FREE_FEATURES.map((feature, i) => (
                      <div key={i} className={feature.sub ? "space-y-0.5" : ""}>
                        <div className="flex items-center gap-2">
                          <Check size={14} className="text-muted-foreground shrink-0" />
                          <span className="text-xs">{feature.text}</span>
                        </div>
                        {feature.sub ? (
                          <p className="pl-5 text-[11px] text-muted-foreground leading-snug">{feature.sub}</p>
                        ) : null}
                      </div>
                    ))}
                  </div>
                  <div className="mt-4">
                    {!isPaid ? null : (
                      <div className="grid gap-2">
                        <div className="grid grid-cols-2 gap-2">
                          <div className="flex items-center justify-center text-xs text-muted-foreground border border-transparent rounded-md">
                            {t("pricing.freePlanName", "Free")}
                          </div>
                          <Button
                            variant="outline"
                            className="w-full"
                            size="sm"
                            onClick={() => cancelMutation.mutate()}
                            disabled={cancelMutation.isPending}
                            data-testid="button-downgrade"
                          >
                            <XCircle size={14} className="mr-2" />
                            {cancelMutation.isPending ? t("pricing.processing", "처리 중...") : t("pricing.cancelSubscription", "구독 해지")}
                          </Button>
                        </div>
                        <p className="text-xs text-muted-foreground text-center">
                          {t("pricing.freePlanNote", "Free 플랜은 언제든지 다시 선택할 수 있습니다.")}
                        </p>
                      </div>
                    )}
                  </div>
                </Card>

                {PAID_PLAN_ORDER.map((id) => renderPaidCard(id))}
              </div>
            </>
          )}

          <Dialog open={bankModalOpen} onOpenChange={setBankModalOpen}>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>{bankTitleForPlan(selectedPlanId)}</DialogTitle>
              </DialogHeader>
              {bankRequestResult ? (
                <div className="space-y-4" key={i18n.language}>
                  <p className="text-sm text-muted-foreground">
                    {t(
                      "pricing.bankRequestSuccessMessage",
                      "입금 신청이 등록되었습니다. 위 계좌로 입금해 주시면 즉시 확인 후 프리미엄이 적용됩니다.",
                    )}
                  </p>
                  <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-2 text-sm">
                    <p>
                      <span className="font-medium">{t("pricing.bankName", "은행")}:</span> {bankRequestResult.bankInfo.bankName}
                    </p>
                    <p>
                      <span className="font-medium">{t("pricing.accountNumber", "계좌번호")}:</span> {bankRequestResult.bankInfo.bankAccount}
                    </p>
                    <p>
                      <span className="font-medium">{t("pricing.accountHolder", "예금주")}:</span> {bankRequestResult.bankInfo.bankHolder}
                    </p>
                    <p>
                      <span className="font-medium">{t("pricing.amount", "입금액")}:</span> {bankRequestResult.amount.toLocaleString("ko-KR")}
                      {t("pricing.won", "원")} (
                      {bankRequestResult.billingPeriod === "monthly" ? t("pricing.monthly", "월간") : t("pricing.yearly", "연간")})
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {t("pricing.orderId", "신청 번호")}: {bankRequestResult.orderId}
                    </p>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <p className="text-sm text-muted-foreground">
                    {t("pricing.bankModalInstruction", "{{period}} 부가세 포함 {{amount}}원을 아래 계좌로 입금해 주시면 확인 후 적용됩니다.", {
                      period: billingPeriod === "monthly" ? t("pricing.monthly", "월간") : t("pricing.yearly", "연간"),
                      amount: subscriptionPayAmount.toLocaleString("ko-KR"),
                    })}
                  </p>
                  {bankInfo && (
                    <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-2 text-sm">
                      <p>
                        <span className="font-medium">{t("pricing.bankName", "은행")}:</span> {bankInfo.bankName}
                      </p>
                      <p>
                        <span className="font-medium">{t("pricing.accountNumber", "계좌번호")}:</span> {bankInfo.bankAccount}
                      </p>
                      <p>
                        <span className="font-medium">{t("pricing.accountHolder", "예금주")}:</span> {bankInfo.bankHolder}
                      </p>
                      <p>
                        <span className="font-medium">{t("pricing.amount", "입금액")}:</span> {subscriptionPayAmount.toLocaleString("ko-KR")}
                        {t("pricing.won", "원")}
                      </p>
                    </div>
                  )}
                  <Button className="w-full" onClick={handleBankRequestSubmit} disabled={requestBankMutation.isPending}>
                    {requestBankMutation.isPending ? t("pricing.processing", "처리 중...") : t("pricing.submitBankRequest", "입금 신청하기")}
                  </Button>
                </div>
              )}
            </DialogContent>
          </Dialog>

          <div className="mt-16 text-center">
            <h2 className="text-2xl font-bold mb-6">{t("pricing.faqTitle", "자주 묻는 질문")}</h2>
            <div className="grid md:grid-cols-2 gap-6 max-w-4xl mx-auto text-left">
              <Card className="p-6">
                <h3 className="font-semibold mb-2">{t("pricing.faq1Title", "언제든지 해지할 수 있나요?")}</h3>
                <p className="text-sm text-muted-foreground">{t("pricing.faq1Answer", "네, 언제든지 구독을 해지할 수 있습니다. 해지 후에도 결제 기간이 끝날 때까지 프리미엄 기능을 이용할 수 있습니다.")}</p>
              </Card>
              <Card className="p-6">
                <h3 className="font-semibold mb-2">{t("pricing.faq2Title", "결제 방법은 무엇인가요?")}</h3>
                <p className="text-sm text-muted-foreground">{t("pricing.faq2Answer", "계좌이체(무통장 입금)로 결제할 수 있습니다. 구독하기에서 입금 신청 후 안내된 계좌로 입금해 주시면 1~2일 내 확인 후 프리미엄이 적용됩니다.")}</p>
              </Card>
              <Card className="p-6">
                <h3 className="font-semibold mb-2">{t("pricing.faq3Title", "연간 플랜은 어떤 혜택이 있나요?")}</h3>
                <p className="text-sm text-muted-foreground">{t("pricing.faq3Answer", "연간 플랜은 월간 플랜 대비 약 10% 할인된 가격으로 이용할 수 있습니다.")}</p>
              </Card>
              <Card className="p-6">
                <h3 className="font-semibold mb-2">{t("pricing.faq4Title", "환불 정책은 어떻게 되나요?")}</h3>
                <p className="text-sm text-muted-foreground">
                  {t("pricing.faq4Answer", "구독 후 7일 이내에 환불 요청이 가능합니다. 사이트 하단의 [환불정책] 탭을 참조해 주세요.")
                    .split("[")
                    .map((part, i) => {
                      const [linkText, rest] = part.split("]");
                      if (rest === undefined) return <span key={i}>{part}</span>;
                      return (
                        <span key={i}>
                          <Link href="/refund-policy" className="underline hover:text-foreground">
                            {linkText}
                          </Link>
                          {rest}
                        </span>
                      );
                    })}
                </p>
              </Card>
            </div>
          </div>
        </div>
        <Footer />
      </div>
    </PageTransition>
  );
}
