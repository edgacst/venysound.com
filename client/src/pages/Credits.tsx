import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { Coins, Plus, Gift, Download, Loader2, Clock, CreditCard, Landmark } from "lucide-react";
import { Link } from "wouter";
import { Navigation } from "@/components/Navigation";
import { Footer } from "@/components/Footer";
import { PageTransition } from "@/components/PageTransition";
import { useTranslation } from 'react-i18next';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { apiRequest } from "@/lib/queryClient";

const CREDIT_PACKAGES = [
  { amount: 1000, label: "1,000" },
  { amount: 3000, label: "3,000" },
  { amount: 5000, label: "5,000" },
  { amount: 10000, label: "10,000" },
  { amount: 30000, label: "30,000" },
  { amount: 50000, label: "50,000" },
];

/** 충전금 + 부가세 10% = 총결재금액 */
function totalWithVat(chargeAmount: number) {
  return Math.round(chargeAmount * 1.1);
}

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

  const { data: creditData, isLoading } = useQuery<{ credits: number }>({
    queryKey: ["/api/credits"],
    enabled: !!user,
  });

  const { data: transactions, isLoading: isLoadingTx } = useQuery<any[]>({
    queryKey: ["/api/credits/transactions"],
    enabled: !!user,
  });

  const { data: bankInfo } = useQuery<{ bankName: string; bankAccount: string; bankHolder: string }>({
    queryKey: ["/api/subscription/bank-info"],
    enabled: !!user || bankModalOpen,
  });

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
      case "purchase": return t('credits.typePurchase', '구매');
      default: return type;
    }
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case "charge": return <Plus size={14} className="text-green-400" />;
      case "tip_sent": return <Gift size={14} className="text-yellow-500" />;
      case "purchase": return <Download size={14} className="text-blue-400" />;
      default: return <Coins size={14} />;
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
          <Link href="/login">
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
          <p className="text-xs text-muted-foreground mt-1">{t('credits.vatNotice', '부가세 별도, 현금 영수증 발행')}</p>
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
              {t('credits.exchangeRate', '1 크레딧 = 1원')}
            </Badge>
          </div>
        </Card>

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
                  <p className="text-sm text-muted-foreground">{pkg.amount.toLocaleString()}{t('credits.won', '원')}</p>
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
                  {t('credits.totalPaymentLine', { charge: selectedPackage.toLocaleString(), total: totalWithVat(selectedPackage).toLocaleString(), defaultValue: `충전금 ${selectedPackage.toLocaleString()}원 + 부가세 10% = 총결재 ${totalWithVat(selectedPackage).toLocaleString()}원` })}
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
                  {t('credits.modalIntro', { charge: selectedPackage.toLocaleString("ko-KR"), total: totalWithVat(selectedPackage).toLocaleString("ko-KR"), defaultValue: `충전금 ${selectedPackage.toLocaleString("ko-KR")}원 + 부가세 10% = 총결재 ${totalWithVat(selectedPackage).toLocaleString("ko-KR")}원을 아래 계좌로 입금해 주시면 확인 후 크레딧이 충전됩니다.` })}
                </p>
                {bankInfo && (
                  <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-2 text-sm">
                    <p><span className="font-medium">{t('pricing.bankName', '은행')}:</span> {bankInfo.bankName}</p>
                    <p><span className="font-medium">{t('pricing.accountNumber', '계좌번호')}:</span> {bankInfo.bankAccount}</p>
                    <p><span className="font-medium">{t('pricing.accountHolder', '예금주')}:</span> {bankInfo.bankHolder}</p>
                    <p><span className="font-medium">{t('pricing.amount', '입금액')}:</span> {totalWithVat(selectedPackage).toLocaleString("ko-KR")}{t('pricing.won', '원')} ({t('credits.depositAmountWithVat', { total: totalWithVat(selectedPackage).toLocaleString("ko-KR"), charge: selectedPackage.toLocaleString("ko-KR"), defaultValue: `${selectedPackage.toLocaleString("ko-KR")}원 + 부가세 10%` })})</p>
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
          )}
        </div>
      </div>
      <Footer />
      </div>
    </PageTransition>
  );
}
