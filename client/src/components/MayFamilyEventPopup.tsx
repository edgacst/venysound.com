import { useCallback, useEffect, useState } from "react";
import { Link } from "wouter";
import { useTranslation } from "react-i18next";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";

/** `client/public/may-family-event-popup.png` — 가정의 달·이벤트 배너 */
const POPUP_IMAGE_SRC = "/may-family-event-popup.png";

const SESSION_DISMISS_KEY = "venysound_may_family_popup_sess_v1";
const NEVER_SHOW_KEY = "venysound_may_family_popup_never_v1";

/** 홈 5월 배너와 동일: 한국시간 2026-05-01 ~ 2026-05-31 */
function isMay2026EventPopupWindow(nowMs: number): boolean {
  const start = Date.parse("2026-04-30T15:00:00.000Z");
  const end = Date.parse("2026-05-31T15:00:00.000Z");
  return nowMs >= start && nowMs < end;
}

/**
 * 홈 진입 시 5월 이벤트 기간에만 이미지 팝업.
 * - 닫기 시「다시 안 보기」체크: 이 브라우저에서는 재노출 안 함
 * - 체크 없이 닫기: 이 탭 세션 동안만 숨김(sessionStorage) — 새 탭이면 다시 표시될 수 있음
 */
export function MayFamilyEventPopup() {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [neverShowChecked, setNeverShowChecked] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!isMay2026EventPopupWindow(Date.now())) return;
    try {
      if (sessionStorage.getItem(SESSION_DISMISS_KEY) === "1") return;
      if (localStorage.getItem(NEVER_SHOW_KEY) === "1") return;
    } catch {
      /* private mode 등 */
    }
    setOpen(true);
  }, []);

  useEffect(() => {
    if (open) setNeverShowChecked(false);
  }, [open]);

  const dismissPopup = useCallback(() => {
    setOpen(false);
    try {
      sessionStorage.setItem(SESSION_DISMISS_KEY, "1");
      if (neverShowChecked) {
        localStorage.setItem(NEVER_SHOW_KEY, "1");
      }
    } catch {
      /* ignore */
    }
  }, [neverShowChecked]);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) dismissPopup();
      }}
    >
      <DialogContent
        className={cn(
          "max-w-[min(92vw,26rem)] gap-0 border-0 bg-transparent p-0 shadow-none sm:max-w-[min(92vw,26rem)]",
          "[&>button]:right-2 [&>button]:top-2 [&>button]:z-20 [&>button]:rounded-full [&>button]:bg-white/90 [&>button]:shadow-sm [&>button]:hover:bg-white",
        )}
      >
        <DialogTitle className="sr-only">
          {t("home.mayFamilyEventPopupAriaTitle", "이벤트 안내")}
        </DialogTitle>
        <DialogDescription className="sr-only">
          {t("home.mayFamilyEventPopupDesc", "가정의 달 프로모션 안내 이미지입니다. 상세는 이벤트 페이지로 이동합니다.")}
        </DialogDescription>
        <div className="relative max-h-[90vh] overflow-hidden rounded-xl bg-white shadow-xl">
          <Link
            href="/events/may-2026"
            className="block outline-none focus-visible:ring-2 focus-visible:ring-violet-500/60 rounded-t-xl"
            onClick={() => dismissPopup()}
          >
            <img
              src={POPUP_IMAGE_SRC}
              alt=""
              width={720}
              height={1280}
              className="w-full h-auto max-h-[min(78vh,720px)] object-contain object-top"
              loading="eager"
              decoding="async"
            />
          </Link>
          <div className="flex flex-col gap-2.5 border-t border-slate-200 bg-white px-3 py-2.5">
            <label
              htmlFor="may-family-event-popup-never-show"
              className="flex cursor-pointer items-center gap-2.5 text-left text-xs text-slate-700 leading-snug select-none"
            >
              <Checkbox
                id="may-family-event-popup-never-show"
                checked={neverShowChecked}
                onCheckedChange={(v) => setNeverShowChecked(v === true)}
                className="border-slate-400 data-[state=checked]:bg-violet-600 data-[state=checked]:border-violet-600"
              />
              <span>{t("home.mayFamilyEventPopupNeverShow", "다시 안 보기")}</span>
            </label>
            <div className="flex justify-center">
              <Button type="button" variant="outline" size="sm" className="min-w-[5.5rem]" onClick={() => dismissPopup()}>
                {t("home.mayFamilyEventPopupClose", "닫기")}
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
