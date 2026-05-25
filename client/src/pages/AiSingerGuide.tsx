import { Navigation } from "@/components/Navigation";
import { Footer } from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { PageTransition } from "@/components/PageTransition";
import { Mic, Music, CheckCircle2, Sparkles } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useLoginModalStore } from "@/stores/login-modal";
import { Link } from "wouter";

const PROMO_IMAGE_SRC = "/ai-singer-promo.png";

const STEPS = [
  {
    num: 1,
    icon: <Music className="w-5 h-5" />,
    title: "음악생성 페이지에 접속",
    desc: "VenySound에서 AI 음악 생성 페이지로 이동합니다.",
  },
  {
    num: 2,
    icon: <Mic className="w-5 h-5" />,
    title: "생성방식 — 내 보이스 등록",
    desc: "음악 생성 옵션에서 「내 보이스 등록」을 선택합니다.",
  },
  {
    num: 3,
    icon: <Mic className="w-5 h-5" />,
    title: "약 20초 녹음하고 등록",
    desc: "내 음성으로 흥얼거리듯 또는 가상의 노래를 약 20초 녹음하여 등록합니다.",
  },
  {
    num: 4,
    icon: <Mic className="w-5 h-5" />,
    title: "검증 문구 녹음",
    desc: "화면에 뜨는 문구를 다시 노래하듯 녹음하여 등록합니다.",
  },
  {
    num: 5,
    icon: <Sparkles className="w-5 h-5" />,
    title: "음악 생성",
    desc: "등록이 완료되면 기존 음악 생성하듯 가사·스타일을 입력합니다.",
  },
  {
    num: 6,
    icon: <CheckCircle2 className="w-5 h-5" />,
    title: "내 보이스로 노래 생성 체크",
    desc: "「등록한 내 보이스로 노래 생성」을 체크하고 생성하면, 녹음한 내 목소리가 반영된 음악이 만들어집니다!",
  },
];

export default function AiSingerGuide() {
  const { user } = useAuth();
  const openLoginModal = useLoginModalStore((s) => s.open);

  return (
    <PageTransition>
      <div className="min-h-screen bg-gradient-to-b from-slate-950 via-violet-950/30 to-slate-950 text-white">
        <Navigation />

        <div className="container mx-auto px-4 pt-10 pb-20 max-w-3xl">
          {/* Hero */}
          <div className="flex flex-col items-center text-center mb-12">
            <div className="relative rounded-2xl overflow-hidden shadow-2xl shadow-violet-500/20 max-w-sm mx-auto mb-8">
              <img
                src={PROMO_IMAGE_SRC}
                alt="내 음성으로 직접 노래를 만들어 가수가 되어 보세요"
                className="w-full h-auto"
                loading="eager"
              />
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold bg-gradient-to-r from-violet-300 via-fuchsia-300 to-pink-300 bg-clip-text text-transparent mb-3">
              내 음성으로 나만의 곡을 만들기
            </h1>
            <p className="text-slate-400 text-sm sm:text-base max-w-md leading-relaxed">
              AI가 내 목소리를 학습하여, 세상에 하나뿐인 나만의 노래를 만들어 줍니다.
            </p>
          </div>

          {/* Steps */}
          <div className="space-y-4 mb-14">
            {STEPS.map((step) => (
              <div
                key={step.num}
                className="flex items-start gap-4 rounded-xl bg-white/5 border border-white/10 p-4 sm:p-5 backdrop-blur-sm"
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-violet-600 text-sm font-bold">
                  {step.num}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-violet-400">{step.icon}</span>
                    <h3 className="font-semibold text-sm sm:text-base">{step.title}</h3>
                  </div>
                  <p className="text-slate-400 text-xs sm:text-sm leading-relaxed">{step.desc}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Result highlight */}
          <div className="rounded-2xl bg-gradient-to-r from-violet-600/20 via-fuchsia-600/20 to-pink-600/20 border border-violet-500/30 p-6 sm:p-8 text-center mb-12">
            <Sparkles className="w-8 h-8 text-fuchsia-400 mx-auto mb-3" />
            <p className="text-lg sm:text-xl font-semibold text-white leading-relaxed">
              녹음한 <span className="text-fuchsia-300">내 목소리</span>가 반영된
              <br className="sm:hidden" /> 목소리로 음악이 만들어집니다.
            </p>
          </div>

          {/* CTA */}
          <div className="flex flex-col items-center gap-4">
            {user ? (
              <Link href="/create-music">
                <Button size="lg" className="rounded-full gap-2 bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:from-violet-500 hover:to-fuchsia-500 text-white px-8 text-base shadow-lg shadow-violet-500/25">
                  <Mic className="w-5 h-5" />
                  지금 내 보이스로 만들기
                </Button>
              </Link>
            ) : (
              <Button
                size="lg"
                className="rounded-full gap-2 bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:from-violet-500 hover:to-fuchsia-500 text-white px-8 text-base shadow-lg shadow-violet-500/25"
                onClick={openLoginModal}
              >
                <Mic className="w-5 h-5" />
                무료가입하고 만들어보기
              </Button>
            )}
            <Link href="/create-music">
              <Button variant="ghost" className="text-slate-400 hover:text-white text-sm">
                음악 생성 페이지 바로가기 →
              </Button>
            </Link>
          </div>
        </div>

        <Footer />
      </div>
    </PageTransition>
  );
}
