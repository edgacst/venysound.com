import { useEffect, useState } from "react";
import { Sparkles, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/hooks/use-auth";
import { useLoginModalStore } from "@/stores/login-modal";

const SESSION_DISMISS_KEY = "guest_signup_nudge_dismissed";
const SHOW_DELAY_MS = 3000;

export function GuestSignupNudge() {
  const { t } = useTranslation();
  const { user, isLoading } = useAuth();
  const openRegister = useLoginModalStore((s) => s.openRegister);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (isLoading || user) {
      setVisible(false);
      return;
    }
    if (sessionStorage.getItem(SESSION_DISMISS_KEY) === "1") return;

    const timer = window.setTimeout(() => setVisible(true), SHOW_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [isLoading, user]);

  if (!visible || isLoading || user) return null;

  const dismiss = () => {
    sessionStorage.setItem(SESSION_DISMISS_KEY, "1");
    setVisible(false);
  };

  return (
    <div className="fixed inset-x-3 bottom-4 z-40 mx-auto flex max-w-md items-center gap-2 rounded-full border border-violet-300/35 bg-zinc-950/92 px-3 py-2 text-white shadow-2xl shadow-black/30 backdrop-blur-md sm:bottom-5 sm:right-5 sm:left-auto sm:mx-0 sm:max-w-none">
      <button
        type="button"
        onClick={() => {
          dismiss();
          openRegister();
        }}
        className="flex min-w-0 flex-1 items-center gap-2 text-left"
        data-testid="button-guest-signup-nudge"
      >
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-violet-500 text-white">
          <Sparkles className="h-4 w-4" aria-hidden />
        </span>
        <span className="min-w-0 text-sm font-semibold leading-snug">
          {t("guestSignupNudge.message", "3초 가입하고 무료 AI 음악을 만들어보세요")}
        </span>
      </button>
      <button
        type="button"
        onClick={dismiss}
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-white/55 transition-colors hover:bg-white/10 hover:text-white"
        aria-label={t("common.close", "닫기")}
        data-testid="button-guest-signup-nudge-close"
      >
        <X className="h-4 w-4" aria-hidden />
      </button>
    </div>
  );
}
