import { Link } from "wouter";
import { Navigation } from "@/components/Navigation";
import { Footer } from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { PageTransition } from "@/components/PageTransition";
import { Wand2, Music, Mic2, Sliders, ChevronRight, Sparkles, Copy, Check } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

const PROMPTS = [
  "upbeat k-pop song, female vocalist, catchy chorus, bright synths, 120 BPM, dreamy lyrics about summer love",
  "peaceful solo piano, slow tempo, emotional, cinematic, rainy day mood, no lyrics, lofi aesthetic",
  "Korean hip-hop, male rapper, trap beat, 808 bass, dark atmosphere, storytelling lyrics about city life",
  "energetic EDM, progressive house, build-up and drop, festival vibes, 128 BPM, euphoric melody",
  "Korean ballad, emotional male vocal, acoustic guitar and strings, heartbreak theme, slow tempo, melancholic",
  "smooth jazz, saxophone and piano, cozy cafe atmosphere, bossa nova influence, gentle swing rhythm",
];

const EXAMPLE_ICONS = ["🎤", "🎹", "🎧", "⚡", "💔", "☕"];
const EXAMPLE_COLORS = [
  "from-pink-500 to-purple-600",
  "from-blue-400 to-cyan-500",
  "from-yellow-400 to-orange-500",
  "from-green-400 to-emerald-500",
  "from-red-400 to-pink-500",
  "from-amber-500 to-yellow-600",
];
const STEP_ICONS = [
  <Wand2 className="w-5 h-5" key="0" />,
  <Wand2 className="w-5 h-5" key="1" />,
  <Mic2 className="w-5 h-5" key="2" />,
  <Sliders className="w-5 h-5" key="3" />,
  <Music className="w-5 h-5" key="4" />,
];

function CopyButton({ text }: { text: string }) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => {
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }}
      className="flex items-center gap-1 text-xs px-2 py-1 rounded bg-white/10 hover:bg-white/20 transition-colors"
    >
      {copied ? <Check className="w-3 h-3 text-green-400" /> : <Copy className="w-3 h-3" />}
      {copied ? t("sunoGuide.copied") : t("sunoGuide.copy")}
    </button>
  );
}

export default function SunoGuide() {
  const { t } = useTranslation();
  const steps = t("sunoGuide.steps", { returnObjects: true }) as { title: string; desc: string }[];
  const examples = t("sunoGuide.examples", { returnObjects: true }) as { category: string; result: string; tip: string }[];
  const tipsList = t("sunoGuide.tipsList", { returnObjects: true }) as string[];
  const heroCredit = t("sunoGuide.heroCredit");

  return (
    <PageTransition>
      <div className="min-h-screen bg-background flex flex-col">
        <Navigation />

        {/* 히어로 */}
        <section className="relative overflow-hidden py-20 px-4">
          <div className="absolute inset-0 bg-gradient-to-br from-purple-900/40 via-background to-pink-900/20 pointer-events-none" />
          <div className="container max-w-4xl mx-auto text-center relative z-10">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-purple-500/20 border border-purple-500/30 text-purple-300 text-sm mb-6">
              <Sparkles className="w-4 h-4" />
              {t("sunoGuide.badge")}
            </div>
            <h1 className="text-4xl md:text-5xl font-bold mb-4">
              {t("sunoGuide.heroTitle1")}{" "}
              <span className="bg-clip-text text-transparent bg-gradient-to-r from-purple-400 to-pink-400">
                {t("sunoGuide.heroTitle2")}
              </span>
            </h1>
            <p className="text-lg text-muted-foreground mb-8 max-w-2xl mx-auto"
              dangerouslySetInnerHTML={{ __html: t("sunoGuide.heroDesc") }}
            />
            <div className="flex flex-col items-center gap-2">
              <Link href="/create-music">
                <Button size="lg" className="rounded-full px-8 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white shadow-lg shadow-purple-500/25">
                  <Wand2 className="w-5 h-5 mr-2" />
                  {t("sunoGuide.heroCta")}
                </Button>
              </Link>
              {heroCredit && (
                <p className="text-blue-400 text-sm font-medium">{heroCredit}</p>
              )}
            </div>
          </div>
        </section>

        {/* 사용 방법 */}
        <section className="container max-w-4xl mx-auto px-4 py-12">
          <h2 className="text-2xl font-bold mb-8 flex items-center gap-2">
            <span className="w-8 h-8 rounded-full bg-primary/20 text-primary flex items-center justify-center text-sm font-bold">?</span>
            {t("sunoGuide.howToUse")}
          </h2>
          <div className="grid gap-4">
            {steps.map((step, i) => (
              <div key={i} className="flex items-start gap-4 p-4 rounded-xl bg-muted/30 border border-border/50 hover:border-primary/30 transition-colors">
                <div className="flex-shrink-0 w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center text-primary">
                  {STEP_ICONS[i]}
                </div>
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs text-primary font-mono font-bold">STEP {String(i + 1).padStart(2, "0")}</span>
                    <h3 className="font-semibold">{step.title}</h3>
                  </div>
                  <p className="text-sm text-muted-foreground">{step.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* 프롬프트 예시 */}
        <section className="container max-w-4xl mx-auto px-4 py-12">
          <h2 className="text-2xl font-bold mb-2 flex items-center gap-2">
            <Sparkles className="w-6 h-6 text-yellow-400" />
            {t("sunoGuide.promptExamples")}
          </h2>
          <p className="text-muted-foreground mb-8 text-sm">{t("sunoGuide.promptDesc")}</p>

          <div className="grid gap-6">
            {examples.map((ex, i) => (
              <div key={i} className="rounded-2xl border border-border/60 overflow-hidden bg-muted/20">
                <div className={`bg-gradient-to-r ${EXAMPLE_COLORS[i]} px-5 py-3 flex items-center gap-3`}>
                  <span className="text-2xl">{EXAMPLE_ICONS[i]}</span>
                  <h3 className="font-bold text-white text-lg">{ex.category}</h3>
                </div>
                <div className="p-5">
                  <div className="mb-3">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs text-muted-foreground font-medium uppercase tracking-wide">{t("sunoGuide.promptLabel")}</span>
                      <CopyButton text={PROMPTS[i]} />
                    </div>
                    <div className="bg-black/30 rounded-lg px-4 py-3 font-mono text-sm text-green-300 border border-green-900/30">
                      {PROMPTS[i]}
                    </div>
                  </div>
                  <div className="mb-3">
                    <span className="text-xs text-muted-foreground font-medium uppercase tracking-wide block mb-1">{t("sunoGuide.resultLabel")}</span>
                    <p className="text-sm text-foreground">{ex.result}</p>
                  </div>
                  <div className="flex items-start gap-2 bg-yellow-500/10 border border-yellow-500/20 rounded-lg px-3 py-2">
                    <span className="text-yellow-400 text-xs mt-0.5">💡</span>
                    <p className="text-xs text-yellow-200/80">{ex.tip}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* 팁 섹션 */}
        <section className="container max-w-4xl mx-auto px-4 py-12">
          <div className="rounded-2xl bg-gradient-to-r from-purple-900/40 to-pink-900/30 border border-purple-500/30 p-8">
            <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-purple-400" />
              {t("sunoGuide.tipsTitle")}
            </h2>
            <ul className="space-y-3 text-sm">
              {tipsList.map((tip, i) => (
                <li key={i} className="flex items-start gap-2">
                  <ChevronRight className="w-4 h-4 text-purple-400 mt-0.5 flex-shrink-0" />
                  <span className="text-muted-foreground">{tip}</span>
                </li>
              ))}
            </ul>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link href="/create-music">
                <Button className="rounded-full bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white">
                  <Wand2 className="w-4 h-4 mr-2" />
                  {t("sunoGuide.makeMusicCta")}
                </Button>
              </Link>
              <Link href="/upload">
                <Button variant="outline" className="rounded-full">
                  <Music className="w-4 h-4 mr-2" />
                  {t("sunoGuide.uploadCta")}
                </Button>
              </Link>
            </div>
          </div>
        </section>

        <Footer />
      </div>
    </PageTransition>
  );
}
