import { useEffect, useState, useCallback } from "react";
import { useLocation } from "wouter";
import { useTranslation } from "react-i18next";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const EXIT_GUARD = "venyExitTrap";

function isInstalledDisplayMode(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return (
      window.matchMedia("(display-mode: standalone)").matches ||
      window.matchMedia("(display-mode: fullscreen)").matches ||
      window.matchMedia("(display-mode: minimal-ui)").matches
    );
  } catch {
    return false;
  }
}

/**
 * 홈(/)에서 시스템/브라우저 뒤로가기로 앱을 빠져나가려 할 때 확인 (PWA·TWA 설치형).
 * 일반 브라우저 탭에서는 동작하지 않습니다.
 */
export function ExitAppConfirm() {
  const { t } = useTranslation();
  const [pathname] = useLocation();
  const [open, setOpen] = useState(false);

  const ensureTrap = useCallback(() => {
    if (typeof window === "undefined") return;
    const st = window.history.state;
    if (st?.[EXIT_GUARD] === true) return;
    window.history.pushState({ [EXIT_GUARD]: true }, "", window.location.href);
  }, []);

  useEffect(() => {
    if (!isInstalledDisplayMode()) return;
    if (pathname !== "/") return;
    const tmr = window.setTimeout(() => ensureTrap(), 0);
    return () => window.clearTimeout(tmr);
  }, [pathname, ensureTrap]);

  useEffect(() => {
    if (!isInstalledDisplayMode()) return;

    const onPop = () => {
      if (window.location.pathname !== "/") return;
      setOpen(true);
      window.history.pushState({ [EXIT_GUARD]: true }, "", window.location.href);
    };

    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const handleConfirmExit = () => {
    setOpen(false);
    try {
      window.close();
    } catch {
      /* ignore */
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogContent className="border-zinc-700 bg-zinc-900 text-white sm:rounded-xl">
        <AlertDialogHeader>
          <AlertDialogTitle>{t("exitApp.title", "앱을 종료할까요?")}</AlertDialogTitle>
          <AlertDialogDescription className="text-zinc-400">
            {t("exitApp.description", "Veny Sound를 닫으려면 종료를 누르세요.")}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel className="border-zinc-600 bg-zinc-800 text-white hover:bg-zinc-700">
            {t("exitApp.cancel", "취소")}
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => {
              e.preventDefault();
              handleConfirmExit();
            }}
            className="bg-red-600 text-white hover:bg-red-700"
          >
            {t("exitApp.confirm", "종료")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
