import { useTranslation } from "react-i18next";
import { Link } from "wouter";
import type { LucideIcon } from "lucide-react";
import { Wand2, Upload, Globe, Building2, Radio } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type HomeLearnMoreSheetMode = "creator" | "business";

type HomeLearnMoreSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 기본 creator — 매장·비즈니스 탭용 안내 */
  mode?: HomeLearnMoreSheetMode;
};

function StepBlock({
  icon: Icon,
  title,
  body,
  className,
}: {
  icon: LucideIcon;
  title: string;
  body: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex gap-4 rounded-xl border border-border/60 bg-muted/25 p-4 dark:bg-muted/15",
        className,
      )}
    >
      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-primary">
        <Icon className="h-5 w-5" aria-hidden />
      </div>
      <div className="min-w-0 space-y-1.5">
        <h3 className="text-base font-semibold leading-snug text-foreground">{title}</h3>
        <p className="text-sm leading-relaxed text-muted-foreground">{body}</p>
      </div>
    </div>
  );
}

export function HomeLearnMoreSheet({
  open,
  onOpenChange,
  mode = "creator",
}: HomeLearnMoreSheetProps) {
  const { t } = useTranslation();

  const close = () => onOpenChange(false);
  const isBusiness = mode === "business";

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex h-full w-full flex-col gap-0 overflow-hidden border-l border-border/70 p-0 sm:max-w-lg"
        data-testid={isBusiness ? "sheet-home-learn-more-business" : "sheet-home-learn-more"}
      >
        <SheetHeader className="space-y-2 border-b border-border/60 px-6 py-6 pr-14 text-left">
          <SheetTitle className="text-xl font-bold leading-tight sm:text-2xl">
            {isBusiness
              ? t("home.learnMoreBizSheetTitle", "매장·브랜드용 음악과 방송")
              : t("home.learnMoreSheetTitle", "베니사운드에서 만든 음악, 세계까지")}
          </SheetTitle>
          <SheetDescription className="text-left text-sm leading-relaxed">
            {isBusiness
              ? t(
                  "home.learnMoreBizSheetSubtitle",
                  "로고송·매장 송출·웹 라디오, 글로벌 발매까지 조건과 흐름을 한눈에 정리했습니다.",
                )
              : t(
                  "home.learnMoreSheetSubtitle",
                  "음악 생성부터 사이트 배포, 해외 스토어 출시까지의 흐름을 한눈에 정리했습니다.",
                )}
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-6 py-6">
          <div className="space-y-4">
            {isBusiness ? (
              <>
                <StepBlock
                  icon={Building2}
                  title={t("home.learnMoreBizSheetStep1Title", "1. 브랜드·매장 사운드")}
                  body={t(
                    "home.learnMoreBizSheetStep1Body",
                    "매장·영상·캠페인에 맞는 전용 브랜드 사운드·로고송 등 음원을 활용할 수 있습니다. 범위는 플랜·권리 조건에 따릅니다.",
                  )}
                />
                <StepBlock
                  icon={Radio}
                  title={t("home.learnMoreBizSheetStep2Title", "2. 웹 라디오·채널")}
                  body={t(
                    "home.learnMoreBizSheetStep2Body",
                    "베니방송국으로 웹에 바로 연결되는 라디오 채널·페이지를 만들고, 실시간 송출·청취 경험을 제공할 수 있습니다.",
                  )}
                />
                <StepBlock
                  icon={Globe}
                  title={t("home.learnMoreBizSheetStep3Title", "3. 글로벌 스트리밍 발매")}
                  body={t(
                    "home.learnMoreBizSheetStep3Body",
                    "구독·플랜에 따라 해외 스토어 배포 신청이 가능합니다. 로고송·채널·유통은 항목별 조건이 다르므로 요금제와 가이드를 확인해 주세요.",
                  )}
                />
              </>
            ) : (
              <>
                <StepBlock
                  icon={Wand2}
                  title={t("home.learnMoreSheetStep1Title", "1. 음악 만들기")}
                  body={t(
                    "home.learnMoreSheetStep1Body",
                    "AI 음악 생성으로 프롬프트만으로도 곡을 만들거나, 직접 작업한 트랙을 준비합니다.",
                  )}
                />
                <StepBlock
                  icon={Upload}
                  title={t("home.learnMoreSheetStep2Title", "2. 베니사운드에 배포")}
                  body={t(
                    "home.learnMoreSheetStep2Body",
                    "업로드하면 VenySound에서 스트리밍·공유되고, 프로필·라이브러리에 모입니다. 방송국·커뮤니티와도 연결할 수 있어요.",
                  )}
                />
                <StepBlock
                  icon={Globe}
                  title={t("home.learnMoreSheetStep3Title", "3. 전 세계 스토어 출시")}
                  body={t(
                    "home.learnMoreSheetStep3Body",
                    "구독·플랜 조건에 따라 Spotify, YouTube Music 등 글로벌 플랫폼 배포를 신청할 수 있습니다. 심사·반영 시점은 플랫폼마다 달라질 수 있어요.",
                  )}
                />
              </>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-2 border-t border-border/60 bg-muted/20 px-4 py-4">
          {isBusiness ? (
            <>
              <Link href="/pricing" className="w-full" onClick={close}>
                <Button variant="default" className="w-full" data-testid="button-learn-more-biz-pricing">
                  {t("home.heroCtaPricing", "요금제 보기")}
                </Button>
              </Link>
              <Link href="/global-distribution-guide" className="w-full" onClick={close}>
                <Button variant="outline" className="w-full" data-testid="button-learn-more-biz-guide">
                  {t("home.learnMoreSheetCtaGuide", "글로벌 발매 가이드 전체 보기")}
                </Button>
              </Link>
              <Link href="/radio/channels" className="w-full" onClick={close}>
                <Button variant="outline" className="w-full" data-testid="button-learn-more-biz-radio">
                  {t("home.learnMoreBizSheetCtaRadio", "방송국 둘러보기")}
                </Button>
              </Link>
            </>
          ) : (
            <>
              <Link href="/global-distribution-guide" className="w-full" onClick={close}>
                <Button variant="default" className="w-full" data-testid="button-learn-more-open-guide">
                  {t("home.learnMoreSheetCtaGuide", "글로벌 발매 가이드 전체 보기")}
                </Button>
              </Link>
              <Link href="/create-music" className="w-full" onClick={close}>
                <Button variant="outline" className="w-full" data-testid="button-learn-more-create">
                  {t("home.learnMoreSheetCtaCreate", "무료 가입하고 음악 만들러 가기")}
                </Button>
              </Link>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
