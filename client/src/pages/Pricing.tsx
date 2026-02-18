import { useState, useEffect, useCallback } from "react";
import { Navigation } from "@/components/Navigation";
import { Footer } from "@/components/Footer";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import {
  Check,
  Crown,
  Music,
  Headphones,
  Sparkles,
  Shield,
  Loader2,
  Zap,
  CreditCard,
  XCircle,
  Calendar,
} from "lucide-react";
import { PageTransition } from "@/components/PageTransition";
import { useTranslation } from 'react-i18next';

export default function Pricing() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [billingPeriod, setBillingPeriod] = useState<"monthly" | "yearly">("monthly");
  const [isRegistering, setIsRegistering] = useState(false);

  const FREE_FEATURES = [
    { icon: Music, text: t('pricing.freeFeature1', '기본 음원 스트리밍') },
    { icon: Headphones, text: t('pricing.freeFeature2', '일일 100곡 스트리밍') },
    { icon: Music, text: t('pricing.freeFeature3', '음원 업로드 (월 10곡)') },
    { icon: Shield, text: t('pricing.freeFeature4', '커뮤니티 참여') },
  ];

  const PREMIUM_FEATURES = [
    { icon: Headphones, text: t('pricing.premiumFeature1', '무제한 스트리밍') },
    { icon: Music, text: t('pricing.premiumFeature2', '무제한 음원 업로드') },
    { icon: Sparkles, text: t('pricing.premiumFeature3', 'AI 커버 이미지 생성') },
    { icon: Zap, text: t('pricing.premiumFeature4', '고음질 스트리밍') },
    { icon: Shield, text: t('pricing.premiumFeature5', '광고 없음') },
    { icon: Crown, text: t('pricing.premiumFeature6', '프리미엄 배지') },
  ];

  const searchParams = new URLSearchParams(window.location.search);
  const billingSuccess = searchParams.get("billing");
  const authKeyParam = searchParams.get("authKey");
  const customerKeyParam = searchParams.get("customerKey");

  const { data: subscriptionData, isLoading: loadingSub } = useQuery<{
    tier: string;
    plan?: string;
    expiresAt?: string;
    hasBillingKey?: boolean;
  }>({
    queryKey: ["/api/toss/subscription"],
    enabled: !!user,
  });

  const { data: clientKeyData } = useQuery<{ clientKey: string }>({
    queryKey: ["/api/toss/client-key"],
  });

  const handleBillingSuccess = useCallback(async () => {
    if (billingSuccess === "true" && authKeyParam && customerKeyParam && user) {
      try {
        const res = await fetch(
          `/api/toss/billing/success?authKey=${encodeURIComponent(authKeyParam)}&customerKey=${encodeURIComponent(customerKeyParam)}`,
          { credentials: "include" }
        );
        const data = await res.json();
        if (res.ok && data.success) {
          toast({ title: t('pricing.cardRegistered', '카드 등록 완료!'), description: t('pricing.cardRegisteredDesc', '이제 구독을 시작할 수 있습니다') });
          queryClient.invalidateQueries({ queryKey: ["/api/toss/subscription"] });
        } else {
          toast({ title: t('pricing.cardRegisterFailed', '카드 등록 실패'), description: data.message, variant: "destructive" });
        }
      } catch {
        toast({ title: t('pricing.cardRegisterError', '카드 등록 오류'), variant: "destructive" });
      }
      window.history.replaceState({}, "", "/pricing");
    }
  }, [billingSuccess, authKeyParam, customerKeyParam, user]);

  useEffect(() => {
    handleBillingSuccess();
  }, [handleBillingSuccess]);

  const subscribeMutation = useMutation({
    mutationFn: async (period: string) => {
      const res = await apiRequest("POST", "/api/toss/subscribe", { billingPeriod: period });
      return res.json();
    },
    onSuccess: (data) => {
      toast({ title: t('pricing.subscribeSuccess', '구독 완료!'), description: `Veny Sound Premium ${data.plan === 'monthly' ? t('pricing.monthly', '월간') : t('pricing.yearly', '연간')} ${t('pricing.subscriptionStarted', '구독이 시작되었습니다')}` });
      queryClient.invalidateQueries({ queryKey: ["/api/toss/subscription"] });
      queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
    },
    onError: (error: Error) => {
      toast({ title: t('pricing.subscribeFailed', '구독 실패'), description: error.message, variant: "destructive" });
    },
  });

  const cancelMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/toss/cancel-subscription");
      return res.json();
    },
    onSuccess: (data) => {
      toast({ title: t('pricing.cancelSuccess', '구독 해지'), description: data.message });
      queryClient.invalidateQueries({ queryKey: ["/api/toss/subscription"] });
      queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
    },
    onError: (error: Error) => {
      toast({ title: t('pricing.cancelFailed', '해지 실패'), description: error.message, variant: "destructive" });
    },
  });

  const handleRegisterCard = async () => {
    if (!user) {
      toast({ title: t('pricing.loginRequired', '로그인이 필요합니다'), description: t('pricing.loginRequiredDesc', '프리미엄 구독을 위해 먼저 로그인해주세요'), variant: "destructive" });
      return;
    }

    if (!clientKeyData?.clientKey) {
      toast({ title: t('pricing.paymentServiceError', '결제 서비스 오류'), description: t('pricing.paymentServiceErrorDesc', '결제 서비스에 연결할 수 없습니다'), variant: "destructive" });
      return;
    }

    setIsRegistering(true);
    try {
      const customerKey = `cust_${user.id.replace(/[^a-zA-Z0-9_\-=.@]/g, '_').substring(0, 50)}`;
      const baseUrl = window.location.origin;

      const { loadTossPayments } = await import("@tosspayments/tosspayments-sdk");
      const tossPayments = await loadTossPayments(clientKeyData.clientKey);
      if (!tossPayments) throw new Error(t('pricing.tossLoadFailed', '토스페이먼츠 로드 실패'));
      const billing = tossPayments.payment({ customerKey });

      await billing.requestBillingAuth({
        method: "CARD",
        successUrl: `${baseUrl}/pricing?billing=true`,
        failUrl: `${baseUrl}/pricing?billing=fail`,
      });
    } catch (err: any) {
      if (err?.code !== "USER_CANCEL") {
        toast({ title: t('pricing.cardRegisterError', '카드 등록 오류'), description: err?.message || t('pricing.tryAgain', '다시 시도해주세요'), variant: "destructive" });
      }
    } finally {
      setIsRegistering(false);
    }
  };

  const handleSubscribe = () => {
    if (!user) {
      toast({ title: t('pricing.loginRequired', '로그인이 필요합니다'), variant: "destructive" });
      return;
    }
    if (!subscriptionData?.hasBillingKey) {
      handleRegisterCard();
      return;
    }
    subscribeMutation.mutate(billingPeriod);
  };

  const isPremium = subscriptionData?.tier === "premium";
  const monthlyPrice = 6600;
  const yearlyPrice = 60000;
  const displayPrice = billingPeriod === "monthly" ? monthlyPrice : yearlyPrice;

  return (
    <PageTransition>
      <div className="min-h-screen bg-background flex flex-col">
        <Navigation />
        <div className="container max-w-5xl mx-auto px-4 py-12">
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold mb-4" data-testid="text-pricing-title">
            <Crown className="inline-block mr-2 text-yellow-500" size={36} />
            {t('pricing.title', 'Veny Sound 멤버십')}
          </h1>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            {t('pricing.subtitle', '프리미엄 멤버십으로 무제한 스트리밍, AI 커버 생성 등 모든 기능을 즐겨보세요')}
          </p>
        </div>

        {loadingSub ? (
          <div className="flex justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : (
          <>
            <div className="flex justify-center mb-8">
              <div className="inline-flex rounded-lg border border-border p-1 bg-card">
                <button
                  onClick={() => setBillingPeriod("monthly")}
                  className={`px-6 py-2 rounded-md text-sm font-medium transition-colors ${
                    billingPeriod === "monthly" ? "bg-primary text-primary-foreground" : "text-muted-foreground"
                  }`}
                  data-testid="button-monthly"
                >
                  {t('pricing.monthly', '월간')}
                </button>
                <button
                  onClick={() => setBillingPeriod("yearly")}
                  className={`px-6 py-2 rounded-md text-sm font-medium transition-colors ${
                    billingPeriod === "yearly" ? "bg-primary text-primary-foreground" : "text-muted-foreground"
                  }`}
                  data-testid="button-yearly"
                >
                  {t('pricing.yearly', '연간')}
                  <Badge variant="secondary" className="ml-2 text-xs bg-green-600/20 text-green-400 no-default-hover-elevate no-default-active-elevate">{t('pricing.discount', '10% 할인')}</Badge>
                </button>
              </div>
            </div>

            <div className="grid md:grid-cols-2 gap-8 max-w-4xl mx-auto">
              <Card className="p-8 relative" data-testid="card-free-plan">
                <div className="mb-6">
                  <h3 className="text-xl font-bold mb-2">Free</h3>
                  <p className="text-muted-foreground text-sm">{t('pricing.freeDescription', '기본적인 음악 스트리밍')}</p>
                </div>
                <div className="mb-6">
                  <span className="text-4xl font-bold">0{t('pricing.won', '원')}</span>
                  <span className="text-muted-foreground">/{t('pricing.perMonth', '월')}</span>
                </div>
                <div className="space-y-3 mb-8">
                  {FREE_FEATURES.map((feature, i) => (
                    <div key={i} className="flex items-center gap-3">
                      <Check size={16} className="text-muted-foreground shrink-0" />
                      <span className="text-sm">{feature.text}</span>
                    </div>
                  ))}
                </div>
                {!isPremium ? (
                  <Button variant="outline" className="w-full" disabled data-testid="button-current-free">
                    {t('pricing.currentPlan', '현재 플랜')}
                  </Button>
                ) : (
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={() => cancelMutation.mutate()}
                    disabled={cancelMutation.isPending}
                    data-testid="button-downgrade"
                  >
                    <XCircle size={16} className="mr-2" />
                    {cancelMutation.isPending ? t('pricing.processing', '처리 중...') : t('pricing.cancelSubscription', '구독 해지')}
                  </Button>
                )}
              </Card>

              <Card className="p-8 relative border-primary/50 shadow-lg shadow-primary/10" data-testid="card-premium-plan">
                <Badge variant="default" className="absolute -top-3 left-1/2 -translate-x-1/2 bg-primary px-4 no-default-hover-elevate no-default-active-elevate">
                  {t('pricing.popular', '인기')}
                </Badge>
                <div className="mb-6">
                  <h3 className="text-xl font-bold mb-2 flex items-center gap-2">
                    <Crown size={20} className="text-yellow-500" />
                    Premium
                  </h3>
                  <p className="text-muted-foreground text-sm">{t('pricing.premiumDescription', '모든 기능을 무제한으로')}</p>
                </div>
                <div className="mb-6">
                  <span className="text-4xl font-bold" data-testid="text-premium-price">
                    {displayPrice.toLocaleString("ko-KR")}{t('pricing.won', '원')}
                  </span>
                  <span className="text-muted-foreground">
                    /{billingPeriod === "monthly" ? t('pricing.perMonth', '월') : t('pricing.perYear', '년')}
                  </span>
                  {billingPeriod === "yearly" && (
                    <div className="text-sm text-muted-foreground mt-1">
                      {t('pricing.monthlyEquivalent', '월')} {Math.round(yearlyPrice / 12).toLocaleString("ko-KR")}{t('pricing.won', '원')} ({t('pricing.regularPrice', '정가')} {yearlyPrice.toLocaleString("ko-KR")}{t('pricing.won', '원')})
                    </div>
                  )}
                </div>
                <div className="space-y-3 mb-8">
                  {PREMIUM_FEATURES.map((feature, i) => (
                    <div key={i} className="flex items-center gap-3">
                      <Check size={16} className="text-primary shrink-0" />
                      <span className="text-sm">{feature.text}</span>
                    </div>
                  ))}
                </div>
                {isPremium ? (
                  <div className="space-y-3">
                    <Button className="w-full" disabled data-testid="button-current-premium">
                      <Crown size={16} className="mr-2" /> {t('pricing.currentPlan', '현재 플랜')}
                    </Button>
                    {subscriptionData?.expiresAt && (
                      <p className="text-xs text-muted-foreground text-center flex items-center justify-center gap-1">
                        <Calendar size={12} />
                        {t('pricing.subscriptionExpires', '구독 만료:')} {new Date(subscriptionData.expiresAt).toLocaleDateString("ko-KR")}
                      </p>
                    )}
                    <Button
                      variant="outline"
                      className="w-full"
                      onClick={() => cancelMutation.mutate()}
                      disabled={cancelMutation.isPending}
                      data-testid="button-cancel-subscription"
                    >
                      <XCircle size={16} className="mr-2" />
                      {cancelMutation.isPending ? t('pricing.processing', '처리 중...') : t('pricing.cancelSubscription', '구독 해지')}
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {subscriptionData?.hasBillingKey ? (
                      <Button
                        className="w-full bg-primary"
                        onClick={handleSubscribe}
                        disabled={subscribeMutation.isPending}
                        data-testid="button-subscribe"
                      >
                        <Zap size={16} className="mr-2" />
                        {subscribeMutation.isPending ? t('pricing.paymentProcessing', '결제 진행 중...') : t('pricing.startPremium', '프리미엄 시작하기')}
                      </Button>
                    ) : (
                      <Button
                        className="w-full bg-primary"
                        onClick={handleRegisterCard}
                        disabled={isRegistering}
                        data-testid="button-register-card"
                      >
                        <CreditCard size={16} className="mr-2" />
                        {isRegistering ? t('pricing.openingCardRegister', '카드 등록 창 열기...') : t('pricing.registerAndSubscribe', '카드 등록 후 구독하기')}
                      </Button>
                    )}
                  </div>
                )}
              </Card>
            </div>
          </>
        )}

        <div className="mt-16 text-center">
          <h2 className="text-2xl font-bold mb-6">{t('pricing.faqTitle', '자주 묻는 질문')}</h2>
          <div className="grid md:grid-cols-2 gap-6 max-w-4xl mx-auto text-left">
            <Card className="p-6">
              <h3 className="font-semibold mb-2">{t('pricing.faq1Title', '언제든지 해지할 수 있나요?')}</h3>
              <p className="text-sm text-muted-foreground">{t('pricing.faq1Answer', '네, 언제든지 구독을 해지할 수 있습니다. 해지 후에도 결제 기간이 끝날 때까지 프리미엄 기능을 이용할 수 있습니다.')}</p>
            </Card>
            <Card className="p-6">
              <h3 className="font-semibold mb-2">{t('pricing.faq2Title', '결제 방법은 무엇인가요?')}</h3>
              <p className="text-sm text-muted-foreground">{t('pricing.faq2Answer', '토스페이먼츠를 통한 안전한 카드 결제를 지원합니다. 국내 모든 신용/체크카드를 사용할 수 있습니다.')}</p>
            </Card>
            <Card className="p-6">
              <h3 className="font-semibold mb-2">{t('pricing.faq3Title', '연간 플랜은 어떤 혜택이 있나요?')}</h3>
              <p className="text-sm text-muted-foreground">{t('pricing.faq3Answer', '연간 플랜은 월간 플랜 대비 약 17% 할인된 가격으로 이용할 수 있습니다.')}</p>
            </Card>
            <Card className="p-6">
              <h3 className="font-semibold mb-2">{t('pricing.faq4Title', '환불 정책은 어떻게 되나요?')}</h3>
              <p className="text-sm text-muted-foreground">{t('pricing.faq4Answer', '구독 후 7일 이내에 환불 요청이 가능합니다. 고객센터로 문의해주세요.')}</p>
            </Card>
          </div>
        </div>
      </div>
      <Footer />
      </div>
    </PageTransition>
  );
}
