import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "wouter";
import { Loader2, MessageCircle, Send, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

type HelpCandidate = {
  id: string;
  title: string;
  summary: string;
  href?: string;
  score: number;
};

type HelpSearchResponse = {
  query: string;
  candidates: HelpCandidate[];
};

/**
 * 로컬 `/api/help-search` 기반 사용 안내(외부 LLM 없음).
 * 하단 재생/라디오 바와 겹치지 않도록 여백을 둡니다.
 */
export function SiteHelpChatFab() {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [submitted, setSubmitted] = useState("");
  const [candidates, setCandidates] = useState<HelpCandidate[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const runSearch = useCallback(async () => {
    const trimmed = q.trim();
    if (!trimmed) {
      setSubmitted("");
      setCandidates([]);
      setError(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/help-search?q=${encodeURIComponent(trimmed)}`);
      if (!res.ok) {
        setError(t("siteHelpChat.errorLoad", "검색에 실패했습니다. 잠시 후 다시 시도해 주세요."));
        setCandidates([]);
        setSubmitted(trimmed);
        return;
      }
      const data = (await res.json()) as HelpSearchResponse;
      setSubmitted(typeof data.query === "string" ? data.query : trimmed);
      setCandidates(Array.isArray(data.candidates) ? data.candidates : []);
    } catch {
      setError(t("siteHelpChat.errorNetwork", "네트워크 오류입니다. 연결을 확인해 주세요."));
      setCandidates([]);
      setSubmitted(trimmed);
    } finally {
      setLoading(false);
    }
  }, [q, t]);

  return (
    <div
      className={cn(
        "fixed z-[70] flex flex-col items-end gap-2 pointer-events-none",
        "bottom-[calc(7rem+env(safe-area-inset-bottom))] right-4 max-[380px]:right-3",
        "md:bottom-[calc(7.5rem+env(safe-area-inset-bottom))] md:right-6",
      )}
    >
      {open && (
        <Card className="pointer-events-auto w-[min(100vw-1.5rem,26rem)] shadow-xl border-border/80">
          <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2 pt-4 px-4">
            <CardTitle className="text-base font-semibold leading-tight pr-2">
              {t("siteHelpChat.title", "사이트 사용 안내")}
            </CardTitle>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8 shrink-0 -mt-1 -mr-1"
              onClick={() => setOpen(false)}
              aria-label={t("siteHelpChat.close", "닫기")}
            >
              <X className="h-4 w-4" />
            </Button>
          </CardHeader>
          <CardContent className="space-y-3 px-4 pb-4">
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                void runSearch();
              }}
            >
              <Input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder={t("siteHelpChat.placeholder", "예: 음악 업로드는 어떻게 하나요?")}
                maxLength={500}
                className="text-sm"
                aria-label={t("siteHelpChat.placeholder", "예: 음악 업로드는 어떻게 하나요?")}
              />
              <Button type="submit" size="icon" disabled={loading} className="shrink-0" aria-label={t("siteHelpChat.search", "찾기")}>
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              </Button>
            </form>
            {error && <p className="text-xs text-destructive">{error}</p>}
            <ScrollArea className="h-[min(45vh,16rem)] pr-3">
              {!submitted && !loading && (
                <p className="text-xs text-muted-foreground leading-relaxed">
                  {t("siteHelpChat.empty", "질문을 입력하고 찾기를 눌러 주세요.")}
                </p>
              )}
              {submitted && !loading && candidates.length === 0 && !error && (
                <p className="text-xs text-muted-foreground leading-relaxed">
                  {t(
                    "siteHelpChat.noResults",
                    "비슷한 안내를 찾지 못했습니다. FAQ를 확인해 보세요.",
                  )}{" "}
                  <Link href="/faq" className="text-primary underline-offset-2 hover:underline">
                    FAQ
                  </Link>
                </p>
              )}
              <ul className="space-y-3">
                {candidates.map((c) => (
                  <li key={c.id} className="rounded-lg border border-border/60 bg-muted/30 p-3 text-sm">
                    <p className="font-medium text-foreground">{c.title}</p>
                    <p className="mt-1 text-xs text-muted-foreground leading-relaxed">{c.summary}</p>
                    {c.href ? (
                      <div className="mt-2">
                        <Link href={c.href}>
                          <Button variant="secondary" size="sm" className="h-8 text-xs">
                            {t("siteHelpChat.openLink", "페이지로 이동")}
                          </Button>
                        </Link>
                      </div>
                    ) : null}
                  </li>
                ))}
              </ul>
            </ScrollArea>
            <p className="text-[10px] text-muted-foreground leading-snug">
              {t("siteHelpChat.footnote", "AI가 아닌 저장된 안내만 검색합니다.")}
            </p>
          </CardContent>
        </Card>
      )}

      <Button
        type="button"
        size="icon"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "pointer-events-auto h-14 w-14 rounded-full shadow-lg",
          "bg-primary text-primary-foreground hover:bg-primary/90",
        )}
        aria-expanded={open}
        aria-label={t("siteHelpChat.fabAria", "사이트 사용 안내")}
      >
        {open ? <X className="h-6 w-6" /> : <MessageCircle className="h-6 w-6" />}
      </Button>
    </div>
  );
}
