import { useTranslation } from "react-i18next";
import { ExternalLink, Headphones, Play, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { usePlayerStore } from "@/components/AudioPlayer";
import { Link } from "wouter";

export type InternationalReleaseItem = {
  id: string;
  title: string;
  artists: string;
  albumName?: string | null;
  imageUrl?: string | null;
  spotifyUrl: string;
  previewUrl?: string | null;
  releaseDate?: string | null;
  /** 사이트 `music.id` — Spotify 앨범 id 또는 제목·아티스트로 매칭되면 채워짐 */
  siteMusicId?: number | null;
};

function siteSearchHref(item: InternationalReleaseItem): string {
  const q = `${item.title} ${item.artists}`.trim();
  return `/music?q=${encodeURIComponent(q)}`;
}

function formatReleaseMeta(item: InternationalReleaseItem): string | null {
  const parts: string[] = [];
  if (item.albumName?.trim()) parts.push(item.albumName.trim());
  if (item.releaseDate?.trim()) {
    const d = item.releaseDate.trim();
    parts.push(d.length >= 10 ? d.slice(0, 10) : d);
  }
  return parts.length ? parts.join(" · ") : null;
}

export function InternationalReleaseCard({ item }: { item: InternationalReleaseItem }) {
  const { t } = useTranslation();
  const playMusic = usePlayerStore((s) => s.playMusic);
  const canPlayOnSite = item.siteMusicId != null && item.siteMusicId > 0;
  const metaLine = formatReleaseMeta(item);

  return (
    <div
      className="group rounded-xl border border-white/10 bg-card/80 hover:border-primary/25 transition-colors flex flex-row items-center gap-2 sm:gap-3 px-2 py-2 sm:px-3 sm:py-2.5 min-h-[4.5rem] w-full"
      data-testid={`intl-release-${item.id}`}
    >
      <div className="relative h-12 w-12 sm:h-14 sm:w-14 shrink-0 rounded-md overflow-hidden bg-muted/40">
        {item.imageUrl ? (
          <img src={item.imageUrl} alt="" className="w-full h-full object-cover" loading="lazy" />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-[10px] text-muted-foreground font-medium">
            Spotify
          </div>
        )}
      </div>

      {canPlayOnSite ? (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="shrink-0 h-9 w-9 rounded-full text-foreground hover:bg-white/10"
          onClick={() => playMusic(item.siteMusicId!)}
          title={t("explore.listenOnSite")}
          aria-label={t("explore.listenOnSite")}
          data-testid={`button-listen-site-${item.id}`}
        >
          <Play className="h-4 w-4 fill-current" />
        </Button>
      ) : (
        <Button variant="ghost" size="icon" className="shrink-0 h-9 w-9 rounded-full text-muted-foreground hover:bg-white/10" asChild>
          <a
            href={item.spotifyUrl}
            target="_blank"
            rel="noopener noreferrer"
            title={t("explore.listenOnSpotify", "Spotify에서 듣기")}
            aria-label={t("explore.listenOnSpotify", "Spotify에서 듣기")}
          >
            <Play className="h-4 w-4 fill-current" />
          </a>
        </Button>
      )}

      <div className="min-w-0 flex-1 flex flex-col justify-center gap-0.5 pr-1">
        <p className="font-semibold text-sm leading-snug line-clamp-1" title={item.title}>
          {item.title}
        </p>
        <p className="text-xs text-muted-foreground line-clamp-1" title={item.artists}>
          {item.artists}
        </p>
      </div>

      {metaLine ? (
        <p
          className="hidden md:block text-xs text-muted-foreground/90 truncate max-w-[28%] lg:max-w-[32%] shrink min-w-0"
          title={metaLine}
        >
          {metaLine}
        </p>
      ) : (
        <div className="hidden md:block flex-1 min-w-0" aria-hidden />
      )}

      <div className="hidden sm:block flex-1 min-w-[1rem]" aria-hidden />

      <div className="flex items-center gap-0.5 shrink-0">
        <Button variant="ghost" size="icon" className="h-9 w-9 text-muted-foreground hover:text-foreground" asChild>
          <a
            href={item.spotifyUrl}
            target="_blank"
            rel="noopener noreferrer"
            title={t("explore.listenOnSpotify", "Spotify에서 듣기")}
            aria-label={t("explore.listenOnSpotify", "Spotify에서 듣기")}
          >
            <ExternalLink className="h-4 w-4" />
          </a>
        </Button>
        {canPlayOnSite ? (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-9 w-9 text-muted-foreground hover:text-foreground"
            onClick={() => playMusic(item.siteMusicId!)}
            title={t("explore.listenOnSite")}
            aria-label={t("explore.listenOnSite")}
          >
            <Headphones className="h-4 w-4" />
          </Button>
        ) : (
          <Button variant="ghost" size="icon" className="h-9 w-9 text-muted-foreground hover:text-foreground" asChild>
            <Link href={siteSearchHref(item)} title={t("explore.findOnSite")} data-testid={`link-search-site-${item.id}`}>
              <Search className="h-4 w-4" />
            </Link>
          </Button>
        )}
      </div>
    </div>
  );
}
