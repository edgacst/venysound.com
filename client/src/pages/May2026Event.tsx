import { Navigation } from "@/components/Navigation";
import { Footer } from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { Loader2 } from "lucide-react";
import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";

type May2026Public = {
  signupWindowStart: string;
  signupWindowEndExclusive: string;
  /** 승인 시 지급되는 무료 AI 출력 트랙 수(1회 생성이 보통 2곡이면 2곡씩 차감) */
  promoGrantTracks: number;
  promoWalletExpiresAt: string;
  approvedMemberCap?: number;
  approvedMemberCount?: number;
};

type May2026Me = {
  eligibleSignup: boolean;
  application: {
    id: number;
    status: string;
    applicantMessage: string | null;
    adminNote: string | null;
    createdAt: string;
    reviewedAt: string | null;
  } | null;
  promoAiCreditsWon: number;
  promoAiCreditsExpiresAt: string | null;
};

function formatRangeKo(startIso: string, endExclusiveIso: string) {
  try {
    const a = new Date(startIso);
    const b = new Date(endExclusiveIso);
    const fmt = (d: Date) =>
      d.toLocaleDateString("ko-KR", { year: "numeric", month: "long", day: "numeric", timeZone: "Asia/Seoul" });
    return `${fmt(a)} ~ ${fmt(new Date(b.getTime() - 1))} 가입분`;
  } catch {
    return "2026년 5월 가입분";
  }
}

export default function May2026Event() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [applyMessage, setApplyMessage] = useState("");

  const { data: pub } = useQuery<May2026Public>({
    queryKey: ["/api/events/may-2026/public"],
    queryFn: async () => {
      const res = await fetch("/api/events/may-2026/public");
      if (!res.ok) throw new Error("public");
      return res.json();
    },
    staleTime: 60_000,
  });

  const { data: me, isLoading: meLoading } = useQuery<May2026Me>({
    queryKey: ["/api/events/may-2026/me"],
    queryFn: async () => {
      const res = await fetch("/api/events/may-2026/me", { credentials: "include" });
      if (!res.ok) throw new Error("me");
      return res.json();
    },
    enabled: !!user,
  });

  /** 승인·전용 잔액 반영 후 AI 만들기 페이지 한도 카드가 바로 갱신되도록 */
  useEffect(() => {
    if (!user || !me) return;
    const approved = me.application?.status === "approved";
    const hasPromo = (me.promoAiCreditsWon ?? 0) > 0;
    if (approved || hasPromo) {
      void qc.invalidateQueries({ queryKey: ["/api/ai-music/usage"] });
    }
  }, [user, me, qc]);

  const applyMutation = useMutation({
    mutationFn: async (message: string) => {
      const res = await fetch("/api/events/may-2026/apply", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(typeof data.message === "string" ? data.message : "신청 실패");
    },
    onSuccess: () => {
      toast({ title: "신청이 접수되었습니다. 관리자 승인 후 안내드립니다." });
      setApplyMessage("");
      void qc.invalidateQueries({ queryKey: ["/api/events/may-2026/me"] });
      void qc.invalidateQueries({ queryKey: ["/api/events/may-2026/public"] });
    },
    onError: (e: Error) => {
      toast({ title: e.message, variant: "destructive" });
    },
  });

  const grantTracks = pub?.promoGrantTracks ?? 40;
  const rangeLabel =
    pub?.signupWindowStart && pub?.signupWindowEndExclusive
      ? formatRangeKo(pub.signupWindowStart, pub.signupWindowEndExclusive)
      : "2026년 5월 가입분";
  const cap = Math.max(1, Number(pub?.approvedMemberCap ?? 100));
  const approvedCount = Math.max(0, Math.floor(Number(pub?.approvedMemberCount ?? 0)));
  const capFull = approvedCount >= cap;

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Navigation />
      <main className="flex-1 container max-w-3xl mx-auto px-4 py-10 pb-24">
        <p className="text-xs font-medium text-violet-300 mb-2">이벤트</p>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight mb-2 text-foreground">2026년 5월 신규가입 이벤트</h1>
        <p className="text-sm text-zinc-300 mb-3">{rangeLabel}</p>
        <div className="mb-8" />

        {/* 앱은 :root가 어두운 테마인데 html에 .dark 클래스가 없어 dark: 미적용 → prose-slate만 쓰면 본문이 어두운 색으로 남음. prose-invert로 본문 대비 확보 */}
        <div className="prose prose-invert prose-sm max-w-none space-y-8 text-sm leading-relaxed text-zinc-100 prose-headings:text-foreground prose-p:text-zinc-200 prose-strong:text-white prose-li:text-zinc-200 prose-a:text-violet-300">
          <section className="rounded-xl border border-border bg-card p-5 space-y-3 not-prose">
            <h2 className="text-base font-semibold text-foreground">요약</h2>
            <ul className="list-disc pl-5 space-y-1 text-zinc-200">
              <li>
                {t("may2026Page.capSummary", "이벤트 전용 잔액은 관리자 승인을 받은 회원에게만 지급되며, 승인 인원은 선착순 최대 {{max}}명입니다.", {
                  max: cap,
                })}
              </li>
              <li>
                대상 회원에게 관리자 승인 후{" "}
                <strong className="text-white">무료 AI 음원 출력 {grantTracks.toLocaleString("ko-KR")}곡분</strong>(보통 1회 생성당 2곡 차감)이
                지급됩니다.
              </li>
              <li>
                이 혜택은 <strong className="text-white">출금·환불 신청 대상이 아니며</strong>, 일반 지갑 충전분과 별도로{" "}
                <strong className="text-white">AI 생성 완료 시에만</strong> 차감됩니다.
              </li>
              <li>
                <strong className="text-white">2026년 5월 안에</strong> 사용하지 않은 전용 잔액은{" "}
                <strong className="text-white">별도 안내 없이 소멸</strong>될 수 있습니다. (만료 시각은 이벤트 페이지 상단 공지와 동일 기준)
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold mb-2 text-foreground">이벤트로 만든 곡의 수익·활동 제한</h2>
            <p>
              이벤트 혜택으로 생성·사이트에 공개된 AI 곡은, 플랫폼 정책에 따라 <strong>후원·유료 다운로드·벨소리 등 일부 수익 활동이 제한</strong>될 수
              있습니다. (기존 &quot;무료 플랜 AI 사이트 공개&quot; 제한과 동일한 플래그로 관리됩니다.)
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold mb-2 text-foreground">사이트 공개 및 다운로드</h2>
            <p>
              생성이 완료되면{" "}
              <Link href="/create-music" className="text-violet-300 underline underline-offset-2 hover:text-violet-200">
                AI 음악 만들기
              </Link>
              에서 각 곡을 <strong>사이트에 공개</strong>할 수 있습니다. 같은 생성으로 나온 여러 클립이 있으면{" "}
              <strong>모두 공개된 뒤</strong> 라이브러리에서 파일 다운로드가 가능합니다. 이벤트 승인 회원이 공개한 곡은{" "}
              <strong>마이페이지·음원 상세</strong>에서 <strong>본인 다운로드</strong>를 이용할 수 있도록 설정됩니다. (타인에게 유료 판매용 다운로드와는
              별개입니다.)
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold mb-2 text-foreground">회원 탈퇴 후에도 공개된 음원</h2>
            <p>
              한 번 사이트에 공개되어 저장된 음원은 <strong>회원 탈퇴 후에도 자동으로 삭제되지 않을 수 있습니다.</strong> 삭제·비공개가 필요하면 운영
              정책에 따라 별도 요청이 필요할 수 있습니다.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold mb-2 text-foreground">가입 신청 절차</h2>
            <ol className="list-decimal pl-5 space-y-2">
              <li>회원가입 후 이 페이지에서 「이벤트 가입 신청」을 제출합니다.</li>
              <li>관리자가 관리자 페이지에서 신청을 확인한 뒤 승인하면 무료 AI 곡분이 충전됩니다.</li>
              <li>승인 시 <strong>알림</strong>으로 충전 사실을 안내합니다.</li>
            </ol>
          </section>

          <section>
            <h2 className="text-lg font-semibold mb-2 text-foreground">추가 안내</h2>
            <ul className="list-disc pl-5 space-y-1">
              <li>부정 가입·어뷰징이 의심되는 경우 승인이 거절될 수 있습니다.</li>
              <li>이벤트 내용·기간·지급액은 운영 사정에 따라 사전 고지 후 변경될 수 있습니다.</li>
              <li>문의: 사이트 고객센터·공지 채널을 이용해 주세요.</li>
            </ul>
          </section>

          {user ? (
            <section className="rounded-xl border border-violet-500/35 bg-violet-950/50 p-5 not-prose space-y-4 text-zinc-100">
              <h2 className="text-base font-semibold text-white">내 상태</h2>
              {meLoading ? (
                <Loader2 className="h-5 w-5 animate-spin text-violet-200/80" />
              ) : me ? (
                <>
                  <p className="text-sm text-zinc-200">
                    이벤트 가입 대상(5월 신규가입):{" "}
                    <strong className="text-white">{me.eligibleSignup ? "예" : "아니오"}</strong>
                  </p>
                  <p className="text-sm text-zinc-200">
                    이벤트 무료 AI 곡(남은 출력 트랙):{" "}
                    <strong className="text-white tabular-nums">{(me.promoAiCreditsWon ?? 0).toLocaleString("ko-KR")}곡</strong>
                    {me.promoAiCreditsExpiresAt ? (
                      <span className="block mt-1 text-xs text-zinc-300">
                        만료 기준 시각(UTC 기준 저장): {new Date(me.promoAiCreditsExpiresAt).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })} (한국시간
                        해석)
                      </span>
                    ) : null}
                  </p>
                  {me.application ? (
                    <p className="text-sm text-zinc-200">
                      신청 상태: <strong className="text-white">{me.application.status}</strong>
                      {me.application.adminNote ? (
                        <span className="block mt-1 text-zinc-300">관리자 메모: {me.application.adminNote}</span>
                      ) : null}
                    </p>
                  ) : (
                    <p className="text-sm text-zinc-300">아직 신청 이력이 없습니다.</p>
                  )}

                  {me.eligibleSignup && (!me.application || me.application.status === "rejected") ? (
                    <div className="space-y-2">
                      {capFull ? (
                        <p className="text-sm text-amber-200">{t("may2026Page.capFullNotice", "승인 인원이 마감되어 새 신청을 받지 않습니다.")}</p>
                      ) : null}
                      <label className="text-sm font-medium text-white">이벤트 가입 신청 (선택 메모)</label>
                      <Textarea
                        value={applyMessage}
                        onChange={(e) => setApplyMessage(e.target.value)}
                        placeholder="닉네임·연락 가능한 시간 등 운영 참고용으로 짧게 적어 주셔도 됩니다."
                        rows={3}
                        maxLength={2000}
                        className="resize-y"
                        disabled={capFull}
                      />
                      <Button
                        type="button"
                        disabled={applyMutation.isPending || capFull}
                        onClick={() => applyMutation.mutate(applyMessage.trim())}
                        className="gap-2"
                        title={capFull ? t("may2026Page.applyDisabledCap", "승인 인원 마감") : undefined}
                      >
                        {applyMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                        {capFull ? t("may2026Page.applyDisabledCap", "승인 인원 마감") : "이벤트 가입 신청"}
                      </Button>
                    </div>
                  ) : null}

                  {me.application?.status === "pending" ? (
                    <p className="text-sm font-medium text-amber-200">관리자 검토 중입니다.</p>
                  ) : null}
                </>
              ) : null}
            </section>
          ) : (
            <section className="rounded-xl border border-border bg-card p-5 not-prose">
              <p className="text-sm mb-3 text-zinc-200">신청하려면 로그인이 필요합니다.</p>
              <Link href="/login">
                <Button variant="default" size="sm">
                  로그인
                </Button>
              </Link>
            </section>
          )}
        </div>

        <div className="mt-10">
          <Link href="/">
            <Button variant="outline" size="sm">
              홈으로
            </Button>
          </Link>
        </div>
      </main>
      <Footer />
    </div>
  );
}
