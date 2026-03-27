import { useTranslation } from "react-i18next";
import { ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";

export type InternationalReleaseItem = {
  id: string;
  title: string;
  artists: string;
  albumName?: string | null;
  imageUrl?: string | null;
  spotifyUrl: string;
  previewUrl?: string | null;
  releaseDate?: string | null;
};

export function InternationalReleaseCard({ item }: { item: InternationalReleaseItem }) {
  const { t } = useTranslation();

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
        <Button variant="outline" size="sm" className="w-full gap-1.5 border-white/10 shrink-0" asChild>
          <a href={item.spotifyUrl} target="_blank" rel="noopener noreferrer">
            <ExternalLink size={14} />
            {t("explore.listenOnSpotify", "Spotify에서 듣기")}
          </a>
        </Button>
      </div>
    </div>
  );
}
