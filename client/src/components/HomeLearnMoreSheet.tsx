import { useTranslation } from "react-i18next";
import { Link } from "wouter";
import { Wand2, Upload, Globe } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type HomeLearnMoreSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

function StepBlock({
  icon: Icon,
  title,
  body,
  className,
}: {
  icon: typeof Wand2;
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

export function HomeLearnMoreSheet({ open, onOpenChange }: HomeLearnMoreSheetProps) {
  const { t } = useTranslation();

  const close = () => onOpenChange(false);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex h-full w-full flex-col gap-0 overflow-hidden border-l border-border/70 p-0 sm:max-w-lg"
        data-testid="sheet-home-learn-more"
      >
        <SheetHeader className="space-y-2 border-b border-border/60 px-6 py-6 pr-14 text-left">
          <SheetTitle className="text-xl font-bold leading-tight sm:text-2xl">
            {t("home.learnMoreSheetTitle", "베니사운드에서 만든 음악, 세계까지")}
          </SheetTitle>
          <SheetDescription className="text-left text-sm leading-relaxed">
            {t(
              "home.learnMoreSheetSubtitle",
              "음악 생성부터 사이트 배포, 해외 스토어 출시까지의 흐름을 한눈에 정리했습니다.",
            )}
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-6 py-6">
          <div className="space-y-4">
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
          </div>
        </div>

        <div className="flex flex-col gap-2 border-t border-border/60 bg-muted/20 px-4 py-4">
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
        </div>
      </SheetContent>
    </Sheet>
  );
}
