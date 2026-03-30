import { useState } from "react";
import { useTranslation } from "react-i18next";

type PlatformDef = {
  /** simpleicons.org CDN slug — 없으면 이니셜 배지 */
  slug?: string;
  color: string;
  name: string;
};

/**
 * 배포·해외 출시 안내용 플랫폼 행 (21개).
 * 아이콘: https://simpleicons.org/ CDN — 실패 시 이니셜 폴백.
 */
const PLATFORMS: PlatformDef[] = [
  { slug: "spotify", color: "1ED760", name: "Spotify" },
  { slug: "instagram", color: "E4405F", name: "Instagram" },
  { slug: "tiktok", color: "000000", name: "TikTok" },
  { slug: "youtubemusic", color: "FF0000", name: "YouTube Music" },
  { slug: "amazonmusic", color: "46C2EB", name: "Amazon Music" },
  { slug: "pandora", color: "3668FF", name: "Pandora" },
  { slug: "deezer", color: "FEAA2D", name: "Deezer" },
  { slug: "tidal", color: "000000", name: "Tidal" },
  { slug: "iheartradio", color: "C6002B", name: "iHeartRadio" },
  { slug: "qobuz", color: "2986CC", name: "Qobuz" },
  { slug: "line", color: "00B900", name: "LINE Music" },
  { color: "1A1A2E", name: "Boomplay" },
  { slug: "neteasecloudmusic", color: "E60026", name: "NetEase Cloud Music" },
  { slug: "anghami", color: "A21D42", name: "Anghami" },
  { slug: "tencentqq", color: "12B7F5", name: "Tencent Music" },
  { slug: "jiosaavn", color: "1CB251", name: "JioSaavn" },
  { color: "00CD3C", name: "Melon" },
  { color: "FF6B35", name: "Genie" },
  { color: "F5C400", name: "Adaptr" },
  { color: "3B82F6", name: "FLO" },
  { color: "E31E24", name: "Bugs" },
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
    <div
      className="flex shrink-0 flex-col items-center gap-0.5"
      title={def.name}
      role="listitem"
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
    </div>
  );
}

export function StreamingPlatformsStrip() {
  const { t } = useTranslation();

  return (
    <div className="space-y-2 pt-0.5" data-testid="streaming-platforms-strip">
      <p className="text-xs sm:text-sm text-muted-foreground leading-snug">
        {t("explore.internationalPlatformsStrip")}
      </p>
      <div
        className="flex flex-wrap gap-2 sm:flex-nowrap sm:overflow-x-auto sm:pb-1 scrollbar-hide items-center -mx-0.5 px-0.5"
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
