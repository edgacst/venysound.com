import { useCallback, useEffect, useState } from "react";
import { Link } from "wouter";
import { useTranslation } from "react-i18next";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";

const POPUP_IMAGE_SRC = "/ai-singer-promo.png";
const SESSION_DISMISS_KEY = "venysound_ai_singer_popup_sess_v1";
const NEVER_SHOW_KEY = "venysound_ai_singer_popup_never_v1";

export function AiSingerPromoPopup() {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [neverShowChecked, setNeverShowChecked] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      if (sessionStorage.getItem(SESSION_DISMISS_KEY) === "1") return;
      if (localStorage.getItem(NEVER_SHOW_KEY) === "1") return;
    } catch {
      /* private mode */
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
          {t("home.aiSingerPopupTitle", "내 음성으로 나만의 곡 만들기")}
        </DialogTitle>
        <DialogDescription className="sr-only">
          {t("home.aiSingerPopupDesc", "AI 싱어 크리에이터 안내 이미지입니다. 상세 페이지로 이동합니다.")}
        </DialogDescription>
        <div className="relative max-h-[90vh] overflow-hidden rounded-xl bg-white shadow-xl">
          <Link
            href="/ai-singer-guide"
            className="block outline-none focus-visible:ring-2 focus-visible:ring-violet-500/60 rounded-t-xl"
            onClick={() => dismissPopup()}
          >
            <img
              src={POPUP_IMAGE_SRC}
              alt="내 음성으로 직접 노래를 만들어 가수가 되어 보세요"
              width={720}
              height={900}
              className="w-full h-auto max-h-[min(78vh,720px)] object-contain object-top"
              loading="eager"
              decoding="async"
            />
          </Link>
          <div className="flex flex-col gap-2.5 border-t border-slate-200 bg-white px-3 py-2.5">
            <label
              htmlFor="ai-singer-popup-never-show"
              className="flex cursor-pointer items-center gap-2.5 text-left text-xs text-slate-700 leading-snug select-none"
            >
              <Checkbox
                id="ai-singer-popup-never-show"
                checked={neverShowChecked}
                onCheckedChange={(v) => setNeverShowChecked(v === true)}
                className="border-slate-400 data-[state=checked]:bg-violet-600 data-[state=checked]:border-violet-600"
              />
              <span>{t("home.aiSingerPopupNeverShow", "다시 안 보기")}</span>
            </label>
            <div className="flex justify-center">
              <Button type="button" variant="outline" size="sm" className="min-w-[5.5rem]" onClick={() => dismissPopup()}>
                {t("home.aiSingerPopupClose", "닫기")}
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
