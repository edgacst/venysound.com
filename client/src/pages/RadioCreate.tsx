import { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { useTranslation } from "react-i18next";
import { Navigation } from "@/components/Navigation";
import { Footer } from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { ArrowLeft, Loader2, Mic2 } from "lucide-react";
import { PageTransition } from "@/components/PageTransition";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";

function slugFromName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9가-힣\s-_]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    || "channel";
}

export default function RadioCreate() {
  const { t } = useTranslation();
  const { user, isLoading: isAuthLoading } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [description, setDescription] = useState("");
  const [coverUrl, setCoverUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (name && !slug) setSlug(slugFromName(name));
  }, [name]);

  if (!isAuthLoading && !user) {
    setLocation("/login");
    return null;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!name.trim()) {
      setError(t("radio.createErrName", "채널 이름을 입력하세요."));
      return;
    }
    const finalSlug = slug.trim() || slugFromName(name);
    if (!finalSlug) {
      setError(t("radio.createErrSlug", "슬러그를 입력하세요."));
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/radio/channels", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          name: name.trim(),
          slug: finalSlug,
          description: description.trim() || null,
          // coverFilename는 서버에서 S3/스토리지에 저장된 파일 경로를 기대하지만,
          // 우선은 사용자가 입력한 이미지 URL/경로를 그대로 전달한다.
          coverFilename: coverUrl.trim() || null,
        }),
      });
      const data = await res.json();
      if (res.ok && data.slug) {
        toast({
          title: t("radio.createSuccess", "채널이 생성되었습니다!"),
          description: t("radio.createSuccessDesc", "이제 방송 스튜디오에서 송출을 시작할 수 있습니다."),
        });
        setLocation("/radio");
      } else {
        setError(data.message || t("radio.createFailed", "채널 생성에 실패했습니다."));
      }
    } catch {
      setError(t("radio.createFailed", "채널 생성에 실패했습니다."));
    } finally {
      setLoading(false);
    }
  };

  return (
    <PageTransition>
      <div className="min-h-screen bg-background flex flex-col pb-24">
        <Navigation />
        <div className="container px-4 py-10 max-w-lg mx-auto">
          <Link href="/radio">
            <Button variant="ghost" size="sm" className="mb-4 gap-2 text-muted-foreground">
              <ArrowLeft size={16} />
              {t("radio.backToRadio", "방송국으로")}
            </Button>
          </Link>
          <Card className="border-white/5 bg-card/50">
            <CardHeader className="flex flex-row items-center gap-3">
              <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                <Mic2 className="text-primary" size={24} />
              </div>
              <div>
                <h1 className="text-xl font-semibold">
                  {t("radio.createYourChannel", "내 방송 채널 만들기")}
                </h1>
                <p className="text-sm text-muted-foreground">
                  {t("radio.createFormDesc", "채널 이름과 주소(슬러그)를 정해 주세요. 한 계정당 하나의 채널만 만들 수 있습니다.")}
                </p>
              </div>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="text-sm font-medium mb-1 block">{t("radio.channelName", "채널 이름")}</label>
                  <Input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder={t("radio.channelNamePlaceholder", "예: OOO의 음악방")}
                    className="bg-background border-white/10"
                    maxLength={50}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium mb-1 block">{t("radio.channelSlug", "채널 주소 (영문/숫자)")}</label>
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground text-sm">/radio/</span>
                    <Input
                      value={slug}
                      onChange={(e) => setSlug(e.target.value.replace(/[^a-z0-9-_]/g, ""))}
                      placeholder="my-channel"
                      className="bg-background border-white/10 flex-1"
                      maxLength={50}
                    />
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {t("radio.slugHint", "채널 페이지 주소에 사용됩니다. 영문 소문자, 숫자, 하이픈만 가능.")}
                  </p>
                </div>
                <div>
                  <label className="text-sm font-medium mb-1 block">
                    {t("radio.channelDescription", "한 줄 소개")} ({t("common.optional", "선택")})
                  </label>
                  <Input
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder={t("radio.descriptionPlaceholder", "예: 편하게 들을 수 있는 음악방")}
                    className="bg-background border-white/10"
                    maxLength={200}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium mb-1 block">
                    {t("radio.channelCover", "배경 이미지 URL")} ({t("common.optional", "선택")})
                  </label>
                  <Input
                    value={coverUrl}
                    onChange={(e) => setCoverUrl(e.target.value)}
                    placeholder={t("radio.channelCoverPlaceholder", "예: /objects/cover.jpg 또는 https://...")}
                    className="bg-background border-white/10"
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    {t(
                      "radio.channelCoverHint",
                      "이미 업로드된 이미지의 주소를 입력하면 채널 카드와 상세 페이지 배경으로 사용됩니다.",
                    )}
                  </p>
                </div>
                {error && (
                  <p className="text-sm text-destructive">{error}</p>
                )}
                <Button type="submit" className="w-full gap-2" disabled={loading}>
                  {loading ? <Loader2 size={18} className="animate-spin" /> : null}
                  {loading ? t("radio.creating", "생성 중...") : t("radio.createChannel", "채널 만들기")}
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>
        {/* 이 페이지에서는 푸터를 숨김 */}
      </div>
    </PageTransition>
  );
}
