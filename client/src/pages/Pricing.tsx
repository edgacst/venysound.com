import { useState } from "react";
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
  Landmark,
  XCircle,
  Calendar,
} from "lucide-react";
import { PageTransition } from "@/components/PageTransition";
import { useTranslation } from 'react-i18next';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export default function Pricing() {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [billingPeriod, setBillingPeriod] = useState<"monthly" | "yearly">("monthly");

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

  const [bankModalOpen, setBankModalOpen] = useState(false);
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
    queryKey: ["/api/toss/subscription"],
    enabled: !!user,
  });

  const { data: bankInfo } = useQuery<{
    bankName: string;
    bankAccount: string;
    bankHolder: string;
    amountMonthly: number;
    amountYearly: number;
  }>({
    queryKey: ["/api/subscription/bank-info"],
    enabled: bankModalOpen,
  });

  const requestBankMutation = useMutation({
    mutationFn: async (period: "monthly" | "yearly") => {
      const res = await apiRequest("POST", "/api/subscription/request-bank", { billingPeriod: period });
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
      toast({ title: t('pricing.bankRequestSubmitted', '입금 신청 완료'), description: data.message });
      queryClient.invalidateQueries({ queryKey: ["/api/toss/subscription"] });
    },
    onError: (error: Error) => {
      toast({ title: t('pricing.bankRequestFailed', '입금 신청 실패'), description: error.message, variant: "destructive" });
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

  const handleBankTransferClick = () => {
    if (!user) {
      toast({ title: t('pricing.loginRequired', '로그인이 필요합니다'), description: t('pricing.loginRequiredDesc', '프리미엄 구독을 위해 먼저 로그인해주세요'), variant: "destructive" });
      window.location.href = "/login";
      return;
    }
    setBankRequestResult(null);
    setBankModalOpen(true);
  };

  const handleBankRequestSubmit = () => {
    requestBankMutation.mutate(billingPeriod);
  };

  const isPremium = subscriptionData?.tier === "premium";
  const monthlyPrice = 5500;
  const yearlyRegularTotal = monthlyPrice * 12; // 66,000
  const yearlyPrice = Math.round(yearlyRegularTotal * 0.9); // 10% 할인 = 59,400
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
          <p className="text-sm text-muted-foreground max-w-2xl mx-auto mt-1 underline decoration-muted-foreground/50">
            {t('pricing.taxReceiptNote', '구독료에 대한 세금계산서, 현금 영수증 발행이 가능합니다.')}
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
                  <h3 className="text-xl font-bold mb-2">{t('pricing.freePlanName', 'Free')}</h3>
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
                    {t('pricing.premiumPlanName', 'Premium')}
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
                      {t('pricing.monthlyEquivalent', '월')} {Math.round(yearlyPrice / 12).toLocaleString("ko-KR")}{t('pricing.won', '원')} ({t('pricing.regularPrice', '정가')} {yearlyRegularTotal.toLocaleString("ko-KR")}{t('pricing.won', '원')})
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
                  <div>
                    <Button
                      className="w-full bg-primary"
                      onClick={handleBankTransferClick}
                      data-testid="button-bank-subscribe"
                    >
                      <Landmark size={16} className="mr-2" />
                      {t('pricing.bankTransferSubscribe', '계좌이체로 구독하기')}
                    </Button>
                    <p className="text-xs text-muted-foreground text-center mt-2">
                      {t('pricing.bankTransferOnlyNote', '당분간은 계좌 이체만 가능합니다')}
                    </p>
                  </div>
                )}
              </Card>
            </div>
          </>
        )}

        <Dialog open={bankModalOpen} onOpenChange={setBankModalOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>{t('pricing.bankTransferTitle', '계좌이체로 프리미엄 구독')}</DialogTitle>
            </DialogHeader>
            {bankRequestResult ? (
              <div className="space-y-4" key={i18n.language}>
                <p className="text-sm text-muted-foreground">{t('pricing.bankRequestSuccessMessage', '입금 신청이 등록되었습니다. 위 계좌로 입금해 주시면 즉시 확인 후 프리미엄이 적용됩니다.')}</p>
                <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-2 text-sm">
                  <p><span className="font-medium">{t('pricing.bankName', '은행')}:</span> {bankRequestResult.bankInfo.bankName}</p>
                  <p><span className="font-medium">{t('pricing.accountNumber', '계좌번호')}:</span> {bankRequestResult.bankInfo.bankAccount}</p>
                  <p><span className="font-medium">{t('pricing.accountHolder', '예금주')}:</span> {bankRequestResult.bankInfo.bankHolder}</p>
                  <p><span className="font-medium">{t('pricing.amount', '입금액')}:</span> {bankRequestResult.amount.toLocaleString("ko-KR")}{t('pricing.won', '원')} ({bankRequestResult.billingPeriod === "monthly" ? t('pricing.monthly', '월간') : t('pricing.yearly', '연간')})</p>
                  <p className="text-xs text-muted-foreground">{t('pricing.orderId', '신청 번호')}: {bankRequestResult.orderId}</p>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  {t('pricing.bankModalInstruction', '{{period}} {{amount}}원을 아래 계좌로 입금해 주시면 즉시 확인 후 프리미엄이 적용됩니다.', { period: billingPeriod === "monthly" ? t('pricing.monthly', '월간') : t('pricing.yearly', '연간'), amount: displayPrice.toLocaleString("ko-KR") })}
                </p>
                {bankInfo && (
                  <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-2 text-sm">
                    <p><span className="font-medium">{t('pricing.bankName', '은행')}:</span> {bankInfo.bankName}</p>
                    <p><span className="font-medium">{t('pricing.accountNumber', '계좌번호')}:</span> {bankInfo.bankAccount}</p>
                    <p><span className="font-medium">{t('pricing.accountHolder', '예금주')}:</span> {bankInfo.bankHolder}</p>
                    <p><span className="font-medium">{t('pricing.amount', '입금액')}:</span> {displayPrice.toLocaleString("ko-KR")}{t('pricing.won', '원')}</p>
                  </div>
                )}
                <Button
                  className="w-full"
                  onClick={handleBankRequestSubmit}
                  disabled={requestBankMutation.isPending}
                >
                  {requestBankMutation.isPending ? t('pricing.processing', '처리 중...') : t('pricing.submitBankRequest', '입금 신청하기')}
                </Button>
              </div>
            )}
          </DialogContent>
        </Dialog>

        <div className="mt-16 text-center">
          <h2 className="text-2xl font-bold mb-6">{t('pricing.faqTitle', '자주 묻는 질문')}</h2>
          <div className="grid md:grid-cols-2 gap-6 max-w-4xl mx-auto text-left">
            <Card className="p-6">
              <h3 className="font-semibold mb-2">{t('pricing.faq1Title', '언제든지 해지할 수 있나요?')}</h3>
              <p className="text-sm text-muted-foreground">{t('pricing.faq1Answer', '네, 언제든지 구독을 해지할 수 있습니다. 해지 후에도 결제 기간이 끝날 때까지 프리미엄 기능을 이용할 수 있습니다.')}</p>
            </Card>
            <Card className="p-6">
              <h3 className="font-semibold mb-2">{t('pricing.faq2Title', '결제 방법은 무엇인가요?')}</h3>
              <p className="text-sm text-muted-foreground">{t('pricing.faq2Answer', '계좌이체(무통장 입금)로 결제할 수 있습니다. 구독하기에서 입금 신청 후 안내된 계좌로 입금해 주시면 1~2일 내 확인 후 프리미엄이 적용됩니다.')}</p>
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
