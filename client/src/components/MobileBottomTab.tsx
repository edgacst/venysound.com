import { Link, useLocation } from "wouter";
import { Home, Radio, Search, User, Wand2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/hooks/use-auth";

function BottomTab({ href, icon: Icon, label }: { href: string; icon: typeof Home; label: string }) {
  const [location] = useLocation();
  const active = location === href || (href === "/music" && location === "/explore");

  return (
    <Link
      href={href}
      aria-label={label}
      title={label}
      className="relative flex h-full min-w-0 flex-1 items-center justify-center py-1 text-slate-500 transition-colors"
    >
      <span className={`flex h-9 w-9 items-center justify-center transition-colors ${active ? "text-teal-600" : "text-slate-400"}`}>
        <Icon className="h-[21px] w-[21px] stroke-[2.15]" />
      </span>
      {active ? <span className="absolute bottom-1.5 h-1 w-1 rounded-full bg-teal-600" /> : null}
    </Link>
  );
}

export function MobileBottomTab() {
  const { user } = useAuth();
  const { t } = useTranslation();

  return (
    <nav className="fixed inset-x-0 bottom-0 z-[60] flex h-14 items-center gap-0 border-t border-slate-200/80 bg-white/95 px-1 pb-[env(safe-area-inset-bottom)] shadow-[0_-10px_30px_-24px_rgba(15,23,42,0.55)] backdrop-blur-xl md:hidden">
      <BottomTab href="/" icon={Home} label={t("nav.home", "홈")} />
      <BottomTab href="/music" icon={Search} label={t("nav.musicList", "탐색")} />
      <BottomTab href="/create-music" icon={Wand2} label={t("nav.createMusic", "AI")} />
      <BottomTab href="/radio/channels" icon={Radio} label={t("mobileHome.broadcast", "방송")} />
      <BottomTab href={user ? `/profile/${user.id}` : "/login"} icon={User} label={t("nav.myPage", "MY")} />
    </nav>
  );
}
