import { useTranslation } from "react-i18next";
import { ExternalLink, Headphones, Search } from "lucide-react";
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

export function InternationalReleaseCard({ item }: { item: InternationalReleaseItem }) {
  const { t } = useTranslation();
  const playMusic = usePlayerStore((s) => s.playMusic);
  const canPlayOnSite = item.siteMusicId != null && item.siteMusicId > 0;

  return (
    <div
      className="rounded-xl border border-white/10 bg-card/80 overflow-hidden flex flex-col h-full hover:border-primary/30 transition-colors"
      data-testid={`intl-release-${item.id}`}
    >
      <div className="aspect-square bg-muted/40 relative">
        {item.imageUrl ? (
          <img src={item.imageUrl} alt="" className="w-full h-full object-cover" loading="lazy" />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-muted-foreground text-sm font-medium">
            Spotify
          </div>
        )}
      </div>
      <div className="p-3 flex flex-col flex-1 gap-2 min-w-0">
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-sm leading-tight line-clamp-2" title={item.title}>
            {item.title}
          </p>
          <p className="text-xs text-muted-foreground mt-1 line-clamp-1" title={item.artists}>
            {item.artists}
          </p>
          {item.albumName ? (
            <p className="text-[11px] text-muted-foreground/80 mt-0.5 line-clamp-1" title={item.albumName}>
              {item.albumName}
            </p>
          ) : null}
        </div>
        <div className="flex flex-col gap-2 shrink-0 mt-auto w-full">
          <Button variant="outline" size="sm" className="w-full gap-1.5 border-white/10 min-h-9 justify-center" asChild>
            <a href={item.spotifyUrl} target="_blank" rel="noopener noreferrer">
              <ExternalLink size={14} className="shrink-0" />
              <span className="truncate">{t("explore.listenOnSpotify", "Spotify에서 듣기")}</span>
            </a>
          </Button>
          {canPlayOnSite ? (
            <Button
              type="button"
              variant="default"
              size="sm"
              className="w-full gap-1.5 min-h-9 justify-center"
              onClick={() => playMusic(item.siteMusicId!)}
              data-testid={`button-listen-site-${item.id}`}
            >
              <Headphones size={14} className="shrink-0" />
              <span className="truncate">{t("explore.listenOnSite")}</span>
            </Button>
          ) : (
            <Button variant="outline" size="sm" className="w-full gap-1.5 border-primary/30 bg-primary/5 hover:bg-primary/10 min-h-9 justify-center" asChild>
              <Link href={siteSearchHref(item)} data-testid={`link-search-site-${item.id}`}>
                <Search size={14} className="shrink-0" />
                <span className="truncate">{t("explore.findOnSite")}</span>
              </Link>
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
