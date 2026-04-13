import { useState, useCallback, useRef, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Sparkles, Copy, Download, ImageIcon } from "lucide-react";

type PromoKit = {
  titleIdeas: string[];
  descriptionKo: string;
  descriptionEn: string;
  videoTags: string;
  hashtagsLine: string;
  pinnedCommentKo: string;
  pinnedCommentEn: string;
};

type Props = {
  musicId: number;
  coverUrl: string;
  title: string;
  artist: string;
};

const CANVAS_W = 1280;
const CANVAS_H = 720;

/** 공백 없는 한글 제목 등도 줄바꿈되도록 글자 단위로 폭 맞춤 */
function wrapTextToWidth(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, maxLines: number): string[] {
  const t = text.trim();
  if (!t) return [];
  const lines: string[] = [];
  let i = 0;
  while (i < t.length && lines.length < maxLines) {
    let lo = i + 1;
    let hi = t.length;
    let best = i + 1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      const sub = t.slice(i, mid);
      if (ctx.measureText(sub).width <= maxWidth) {
        best = mid;
        lo = mid + 1;
      } else {
        hi = mid - 1;
      }
    }
    if (best <= i) best = Math.min(i + 1, t.length);
    const slice = t.slice(i, best).trim();
    lines.push(slice.length > 0 ? slice : t.slice(i, i + 1));
    i = best;
  }
  return lines;
}

export function OwnerPromoTools({ musicId, coverUrl, title, artist }: Props) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [kit, setKit] = useState<PromoKit | null>(null);
  const [loadingKit, setLoadingKit] = useState(false);
  const [thumbBusy, setThumbBusy] = useState(false);

  const copy = useCallback(
    (label: string, value: string) => {
      void navigator.clipboard.writeText(value);
      toast({ title: t("musicDetail.promoCopied", "{{label}} 복사됨", { label }) });
    },
    [toast, t],
  );

  const generateKit = useCallback(async () => {
    setLoadingKit(true);
    setKit(null);
    try {
      const res = await fetch(`/api/music/${musicId}/promo-social-kit`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast({
          title: t("musicDetail.promoKitFailed", "문구 생성에 실패했습니다"),
          description: typeof data.message === "string" ? data.message : undefined,
          variant: "destructive",
        });
        return;
      }
      setKit(data as PromoKit);
      toast({ title: t("musicDetail.promoKitReady", "홍보 문구가 준비되었습니다") });
    } catch {
      toast({ title: t("musicDetail.promoKitFailed", "문구 생성에 실패했습니다"), variant: "destructive" });
    } finally {
      setLoadingKit(false);
    }
  }, [musicId, toast, t]);

  const drawThumbnail = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    setThumbBusy(true);
    canvas.width = CANVAS_W;
    canvas.height = CANVAS_H;

    const img = new Image();
    img.crossOrigin = "anonymous";
    const finishDraw = () => {
      const grd = ctx.createLinearGradient(0, CANVAS_H * 0.35, 0, CANVAS_H);
      grd.addColorStop(0, "rgba(0,0,0,0.1)");
      grd.addColorStop(0.55, "rgba(0,0,0,0.55)");
      grd.addColorStop(1, "rgba(0,0,0,0.92)");
      ctx.fillStyle = grd;
      ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 56px system-ui, sans-serif";
      const titleLines = wrapTextToWidth(ctx, title || "Untitled", CANVAS_W - 120, 2);
      let y = CANVAS_H - 200;
      for (const line of titleLines) {
        ctx.fillText(line, 60, y);
        y += 64;
      }
      ctx.font = "32px system-ui, sans-serif";
      ctx.fillStyle = "rgba(255,255,255,0.9)";
      ctx.fillText(artist || "", 60, CANVAS_H - 100);
      ctx.font = "22px system-ui, sans-serif";
      ctx.fillStyle = "rgba(255,255,255,0.65)";
      const origin = typeof window !== "undefined" ? window.location.origin : "";
      ctx.fillText(origin.replace(/^https?:\/\//, ""), 60, CANVAS_H - 48);
      setThumbBusy(false);
    };

    const drawImageCover = () => {
      const iw = img.naturalWidth || 1;
      const ih = img.naturalHeight || 1;
      const scale = Math.max(CANVAS_W / iw, CANVAS_H / ih);
      const dw = iw * scale;
      const dh = ih * scale;
      const dx = (CANVAS_W - dw) / 2;
      const dy = (CANVAS_H - dh) / 2;
      ctx.drawImage(img, dx, dy, dw, dh);
      finishDraw();
    };

    img.onload = () => {
      try {
        drawImageCover();
      } catch {
        ctx.fillStyle = "#1a1a2e";
        ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
        finishDraw();
      }
    };
    img.onerror = () => {
      ctx.fillStyle = "#1a1a2e";
      ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
      finishDraw();
    };
    img.src = coverUrl;
  }, [artist, coverUrl, title]);

  useEffect(() => {
    drawThumbnail();
  }, [drawThumbnail]);

  const downloadPng = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    try {
      const a = document.createElement("a");
      a.href = canvas.toDataURL("image/png");
      a.download = `${(title || "cover").replace(/[/\\?%*:|"<>]/g, "_").slice(0, 80)}_16x9.png`;
      a.click();
      toast({ title: t("musicDetail.promoThumbDownloaded", "썸네일 PNG를 저장했습니다") });
    } catch {
      toast({
        title: t("musicDetail.promoThumbCanvasError", "이 표지 URL은 보안 정책 때문에 저장이 막힐 수 있습니다"),
        variant: "destructive",
      });
    }
  }, [title, toast, t]);

  return (
    <Card className="p-5 bg-black/40 border-white/10 backdrop-blur-sm space-y-4" data-testid="card-owner-promo-tools">
      <div className="flex items-center gap-2">
        <Sparkles className="text-primary shrink-0" size={18} />
        <h3 className="font-semibold text-sm">{t("musicDetail.promoToolsTitle", "홍보 도구 (업로더 전용)")}</h3>
      </div>
      <p className="text-xs text-muted-foreground leading-relaxed">
        {t(
          "musicDetail.promoToolsHint",
          "동영상 플랫폼용 제목·설명·태그·고정댓글 초안과 영문 설명을 생성하고, 1280×720 썸네일 PNG를 내려받을 수 있습니다. 실제 업로드와 정책(예: AI 표시)은 본인이 확인해 주세요.",
        )}
      </p>

      <div className="space-y-2">
        <div className="flex items-center gap-2 flex-wrap">
          <ImageIcon size={16} className="text-muted-foreground" />
          <span className="text-xs font-medium">{t("musicDetail.promoThumbSection", "16:9 썸네일 미리보기")}</span>
          <Button type="button" size="sm" variant="secondary" className="gap-1 h-8" disabled={thumbBusy} onClick={() => drawThumbnail()}>
            {thumbBusy ? <Loader2 className="animate-spin size-4" /> : null}
            {t("musicDetail.promoThumbRedraw", "다시 그리기")}
          </Button>
          <Button type="button" size="sm" variant="default" className="gap-1 h-8" onClick={downloadPng}>
            <Download size={14} />
            {t("musicDetail.promoThumbDownload", "PNG 저장")}
          </Button>
        </div>
        <div className="rounded-md border border-white/10 overflow-hidden bg-black/50 flex justify-center">
          <canvas ref={canvasRef} className="max-w-full h-auto w-full max-h-[200px] object-contain" width={CANVAS_W} height={CANVAS_H} />
        </div>
      </div>

      <div className="space-y-2">
        <Button type="button" className="w-full gap-2" disabled={loadingKit} onClick={() => void generateKit()}>
          {loadingKit ? <Loader2 className="animate-spin size-4" /> : <Sparkles size={16} />}
          {t("musicDetail.promoGenerateKit", "홍보 문구 자동 생성 (AI)")}
        </Button>
      </div>

      {kit && (
        <div className="space-y-4 text-xs">
          <div>
            <div className="flex items-center justify-between mb-1">
              <span className="font-medium text-foreground">{t("musicDetail.promoTitleIdeas", "제목 후보")}</span>
            </div>
            <ul className="list-decimal pl-4 space-y-1 text-muted-foreground">
              {kit.titleIdeas.map((line, i) => (
                <li key={i} className="flex gap-2 items-start">
                  <span className="flex-1">{line}</span>
                  <Button type="button" size="icon" variant="ghost" className="h-7 w-7 shrink-0" onClick={() => copy(t("musicDetail.promoTitleIdeas", "제목 후보"), line)}>
                    <Copy size={14} />
                  </Button>
                </li>
              ))}
            </ul>
          </div>

          {[
            { key: "descriptionKo", label: t("musicDetail.promoDescKo", "설명 (한국어)"), value: kit.descriptionKo, rows: 6 },
            { key: "descriptionEn", label: t("musicDetail.promoDescEn", "설명 (English)"), value: kit.descriptionEn, rows: 6 },
            { key: "videoTags", label: t("musicDetail.promoVideoTags", "검색용 태그(쉼표)"), value: kit.videoTags, rows: 2 },
            { key: "hashtagsLine", label: t("musicDetail.promoHashtags", "해시태그 한 줄"), value: kit.hashtagsLine, rows: 2 },
            { key: "pinnedCommentKo", label: t("musicDetail.promoPinKo", "고정 댓글 (한국어)"), value: kit.pinnedCommentKo, rows: 3 },
            { key: "pinnedCommentEn", label: t("musicDetail.promoPinEn", "고정 댓글 (English)"), value: kit.pinnedCommentEn, rows: 3 },
          ].map((row) => (
            <div key={row.key}>
              <div className="flex items-center justify-between mb-1">
                <span className="font-medium text-foreground">{row.label}</span>
                <Button type="button" size="sm" variant="ghost" className="h-7 gap-1" onClick={() => copy(row.label, row.value)}>
                  <Copy size={14} />
                  {t("musicDetail.promoCopy", "복사")}
                </Button>
              </div>
              <Textarea readOnly value={row.value} rows={row.rows} className="text-xs bg-white/5 border-white/10 resize-y min-h-0" />
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
