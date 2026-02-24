import { useTranslation } from "react-i18next";

const BADGE_CONFIG = {
  seed:      { emoji: "🌱", color: "bg-green-600/20 text-green-400 border-green-500/30" },
  sprout:    { emoji: "🌿", color: "bg-emerald-600/20 text-emerald-400 border-emerald-500/30" },
  supporter: { emoji: "⭐", color: "bg-blue-600/20 text-blue-400 border-blue-500/30" },
  sponsor:   { emoji: "💎", color: "bg-purple-600/20 text-purple-400 border-purple-500/30" },
} as const;

type BadgeKey = keyof typeof BADGE_CONFIG;

interface DonationBadgeProps {
  badge: string;
  showLabel?: boolean;
  size?: "sm" | "md";
}

export function DonationBadge({ badge, showLabel = true, size = "md" }: DonationBadgeProps) {
  const { t } = useTranslation();
  const config = BADGE_CONFIG[badge as BadgeKey];
  if (!config) return null;

  const label = t(`donationBadge.${badge}`, badge);
  const textSize = size === "sm" ? "text-[10px]" : "text-xs";
  const padding = size === "sm" ? "px-1.5 py-0.5" : "px-2 py-0.5";

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border font-medium ${config.color} ${textSize} ${padding}`}
      title={t(`donationBadge.${badge}Desc`, "")}
    >
      <span>{config.emoji}</span>
      {showLabel && <span>{label}</span>}
    </span>
  );
}
