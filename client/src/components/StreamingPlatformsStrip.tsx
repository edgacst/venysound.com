import { useState } from "react";
import { useTranslation } from "react-i18next";

type PlatformDef = {
  slug?: string;
  color: string;
  name: string;
  url: string;
};

/**
 * 배포·해외 출시 안내용 플랫폼 행 (21개).
 * 아이콘: https://simpleicons.org/ CDN — 실패 시 이니셜 폴백.
 */
const PLATFORMS: PlatformDef[] = [
  { slug: "spotify", color: "1ED760", name: "Spotify", url: "https://open.spotify.com/" },
  { slug: "instagram", color: "E4405F", name: "Instagram", url: "https://www.instagram.com/" },
  { slug: "tiktok", color: "000000", name: "TikTok", url: "https://www.tiktok.com/" },
  { slug: "youtubemusic", color: "FF0000", name: "YouTube Music", url: "https://music.youtube.com/" },
  { slug: "amazonmusic", color: "46C2EB", name: "Amazon Music", url: "https://music.amazon.com/" },
  { slug: "pandora", color: "3668FF", name: "Pandora", url: "https://www.pandora.com/" },
  { slug: "deezer", color: "FEAA2D", name: "Deezer", url: "https://www.deezer.com/" },
  { slug: "tidal", color: "000000", name: "Tidal", url: "https://tidal.com/" },
  { slug: "iheartradio", color: "C6002B", name: "iHeartRadio", url: "https://www.iheart.com/" },
  { slug: "qobuz", color: "2986CC", name: "Qobuz", url: "https://www.qobuz.com/" },
  { slug: "line", color: "00B900", name: "LINE Music", url: "https://music.line.me/" },
  { color: "1A1A2E", name: "Boomplay", url: "https://www.boomplay.com/" },
  { slug: "neteasecloudmusic", color: "E60026", name: "NetEase Cloud Music", url: "https://music.163.com/" },
  { slug: "anghami", color: "A21D42", name: "Anghami", url: "https://www.anghami.com/" },
  { slug: "tencentqq", color: "12B7F5", name: "Tencent Music", url: "https://y.qq.com/" },
  { slug: "jiosaavn", color: "1CB251", name: "JioSaavn", url: "https://www.jiosaavn.com/" },
  { color: "00CD3C", name: "Melon", url: "https://www.melon.com/" },
  { color: "FF6B35", name: "Genie", url: "https://www.genie.co.kr/" },
  { color: "F5C400", name: "Adaptr", url: "https://www.adaptr.com/" },
  { color: "3B82F6", name: "FLO", url: "https://www.musicflo.com/" },
  { color: "E31E24", name: "Bugs", url: "https://music.bugs.co.kr/" },
];

function InitialBadge({ name, bg }: { name: string; bg: string }) {
  const initial = name.replace(/\s+/g, "").toUpperCase().slice(0, 2) || "?";
  return (
    <span
      className="flex size-9 shrink-0 items-center justify-center rounded-lg text-[10px] font-bold text-white shadow-sm ring-1 ring-white/10"
      style={{ backgroundColor: `#${bg}` }}
      aria-hidden
    >
      {initial || "?"}
    </span>
  );
}

function PlatformTile({ def }: { def: PlatformDef }) {
  const [broken, setBroken] = useState(false);
  const showImg = def.slug && !broken;

  return (
    <a
      href={def.url}
      target="_blank"
      rel="noopener noreferrer"
      className="flex shrink-0 flex-col items-center gap-0.5 rounded-lg outline-none ring-offset-background transition-opacity hover:opacity-90 focus-visible:ring-2 focus-visible:ring-primary"
      title={def.name}
      role="listitem"
      aria-label={def.name}
    >
      {showImg ? (
        <img
          src={`https://cdn.simpleicons.org/${def.slug}/${def.color}`}
          alt=""
          width={36}
          height={36}
          className="size-9 rounded-lg object-contain shadow-sm ring-1 ring-black/5 dark:ring-white/10 bg-white"
          loading="lazy"
          decoding="async"
          onError={() => setBroken(true)}
        />
      ) : (
        <InitialBadge name={def.name} bg={def.color} />
      )}
    </a>
  );
}

export function StreamingPlatformsStrip() {
  const { t } = useTranslation();

  return (
    <div className="space-y-0.5" data-testid="streaming-platforms-strip">
      <p className="text-[11px] sm:text-xs text-muted-foreground leading-tight">
        {t("explore.internationalPlatformsStrip")}
      </p>
      <div
        className="flex flex-wrap gap-1 sm:flex-nowrap sm:overflow-x-auto scrollbar-hide items-center"
        role="list"
        aria-label={t("explore.internationalPlatformsAria")}
      >
        {PLATFORMS.map((def) => (
          <PlatformTile key={def.name} def={def} />
        ))}
      </div>
    </div>
  );
}
