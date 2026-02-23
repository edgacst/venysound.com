import { Navigation } from "@/components/Navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Link, useRoute } from "wouter";
import { useEffect } from "react";
import {
  Lightbulb,
  Users,
  Shield,
  ArrowLeft,
  Sparkles,
  Palette,
  Music,
  Heart,
  MessageSquare,
  Globe,
  Lock,
  Scale,
  Eye,
  type LucideIcon,
} from "lucide-react";
import { useTranslation } from 'react-i18next';

interface ValueData {
  title: string;
  subtitle: string;
  icon: LucideIcon;
  color: string;
  heroImage: string;
  description: string;
  details: { icon: LucideIcon; title: string; text: string }[];
  quote: string;
  quoteAuthor: string;
}

export default function ValueDetail() {
  const { t } = useTranslation();
  const [, params] = useRoute("/about/values/:slug");
  const slug = params?.slug || "";

  const VALUES: Record<string, ValueData> = {
    creativity: {
      title: t('valueDetail.creativity.title', '창의성'),
      subtitle: t('valueDetail.creativity.subtitle', '모든 음악적 시도를 존중합니다'),
      icon: Lightbulb,
      color: "text-primary",
      heroImage:
        "https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?ixlib=rb-4.0.3&auto=format&fit=crop&w=1200&q=80",
      description: t('valueDetail.creativity.description', 'Veny Sound는 창의성이 세상을 바꿀 수 있다고 믿습니다. 장르의 경계를 넘어, 기존의 틀을 깨는 새로운 시도를 응원하며, 모든 아티스트가 자유롭게 자신만의 음악 세계를 펼칠 수 있는 환경을 만들어갑니다.'),
      details: [
        {
          icon: Sparkles,
          title: t('valueDetail.creativity.detail1Title', '새로운 시도의 자유'),
          text: t('valueDetail.creativity.detail1Text', '실험적인 사운드, 크로스오버 장르, 독특한 프로덕션 — Veny Sound에서는 어떤 음악적 시도도 환영합니다. 우리는 다양한 표현이 음악 생태계를 더욱 풍요롭게 만든다고 생각합니다.'),
        },
        {
          icon: Palette,
          title: t('valueDetail.creativity.detail2Title', '아티스트를 위한 도구'),
          text: t('valueDetail.creativity.detail2Text', 'AI 커버 이미지 생성, 고음질 스트리밍, 세밀한 장르 분류 시스템 등 아티스트가 자신의 음악을 최상의 형태로 표현할 수 있는 도구를 제공합니다.'),
        },
        {
          icon: Music,
          title: t('valueDetail.creativity.detail3Title', '음악의 다양성'),
          text: t('valueDetail.creativity.detail3Text', '인디, 힙합, R&B, 일렉트로닉, 클래식, 월드뮤직까지 — Veny Sound는 모든 장르를 동등하게 지원하며, 리스너에게 새로운 음악을 발견할 기회를 제공합니다.'),
        },
      ],
      quote: t('valueDetail.creativity.quote', '음악은 한계가 없다. 한계가 있다면 그건 상상력의 한계일 뿐이다.'),
      quoteAuthor: t('valueDetail.creativity.quoteAuthor', 'Veny Sound 철학'),
    },
    community: {
      title: t('valueDetail.community.title', '커뮤니티'),
      subtitle: t('valueDetail.community.subtitle', '함께 나누는 음악의 아름다움'),
      icon: Users,
      color: "text-green-400",
      heroImage:
        "https://images.unsplash.com/photo-1524368535928-5b5e00ddc76b?ixlib=rb-4.0.3&auto=format&fit=crop&w=1200&q=80",
      description: t('valueDetail.community.description', '음악은 혼자 듣는 것보다 함께 나눌 때 더 큰 감동이 됩니다. Veny Sound 커뮤니티는 아티스트와 리스너가 서로 연결되고, 영감을 주고받으며, 함께 성장하는 공간입니다.'),
      details: [
        {
          icon: Heart,
          title: t('valueDetail.community.detail1Title', '진정한 소통'),
          text: t('valueDetail.community.detail1Text', '좋아요, 리뷰, 팔로우 시스템을 통해 아티스트와 리스너가 직접 소통할 수 있습니다. 단순한 숫자가 아닌, 진심 어린 피드백이 오가는 공간을 만듭니다.'),
        },
        {
          icon: MessageSquare,
          title: t('valueDetail.community.detail2Title', '열린 게시판'),
          text: t('valueDetail.community.detail2Text', '카테고리별 커뮤니티 게시판에서 음악에 대한 이야기를 자유롭게 나눌 수 있습니다. 신곡 추천, 콜라보 요청, 음악 토론 등 다양한 주제로 소통하세요.'),
        },
        {
          icon: Globe,
          title: t('valueDetail.community.detail3Title', '글로벌 연결'),
          text: t('valueDetail.community.detail3Text', '국경과 언어를 넘어 음악으로 하나 되는 경험. Veny Sound는 전 세계 음악 애호가들이 만나는 글로벌 플랫폼을 지향합니다.'),
        },
      ],
      quote: t('valueDetail.community.quote', '음악은 보편적인 언어다. 말이 끝나는 곳에서 음악이 시작된다.'),
      quoteAuthor: t('valueDetail.community.quoteAuthor', '하인리히 하이네'),
    },
    trust: {
      title: t('valueDetail.trust.title', '신뢰'),
      subtitle: t('valueDetail.trust.subtitle', '투명하고 공정한 플랫폼'),
      icon: Shield,
      color: "text-yellow-400",
      heroImage:
        "https://images.unsplash.com/photo-1507838153414-b4b713384a76?ixlib=rb-4.0.3&auto=format&fit=crop&w=1200&q=80",
      description: t('valueDetail.trust.description', '아티스트의 저작권을 보호하고, 투명하고 공정한 플랫폼 운영을 약속합니다. Veny Sound는 모든 창작자의 권리를 존중하며, 신뢰를 기반으로 한 건강한 음악 생태계를 구축합니다.'),
      details: [
        {
          icon: Lock,
          title: t('valueDetail.trust.detail1Title', '저작권 보호'),
          text: t('valueDetail.trust.detail1Text', '체계적인 저작권 신고 시스템을 통해 불법 복제와 무단 사용으로부터 아티스트의 창작물을 보호합니다. 신고 접수부터 처리까지 투명한 프로세스를 운영합니다.'),
        },
        {
          icon: Scale,
          title: t('valueDetail.trust.detail2Title', '공정한 운영'),
          text: t('valueDetail.trust.detail2Text', '명확한 이용약관과 공정한 정책을 바탕으로 모든 사용자에게 동일한 기준을 적용합니다. 관리자 대시보드를 통한 체계적인 관리로 건전한 플랫폼 환경을 유지합니다.'),
        },
        {
          icon: Eye,
          title: t('valueDetail.trust.detail3Title', '투명한 소통'),
          text: t('valueDetail.trust.detail3Text', '알림 시스템을 통해 저작권 신고 처리 현황, 커뮤니티 활동 등을 실시간으로 안내합니다. 사용자와의 열린 소통으로 신뢰를 쌓아갑니다.'),
        },
      ],
      quote: t('valueDetail.trust.quote', '신뢰는 하루아침에 만들어지지 않는다. 매일의 약속을 지키는 것에서 시작된다.'),
      quoteAuthor: t('valueDetail.trust.quoteAuthor', 'Veny Sound 철학'),
    },
  };

  const value = VALUES[slug];

  useEffect(() => { window.scrollTo(0, 0); }, [slug]);

  if (!value) {
    return (
      <div className="min-h-screen bg-background">
        <Navigation />
        <div className="container max-w-4xl px-4 py-20 text-center">
          <p className="text-muted-foreground mb-4">{t('valueDetail.notFound', '존재하지 않는 페이지입니다.')}</p>
          <Link href="/about">
            <Button variant="outline">
              <ArrowLeft size={16} className="mr-2" /> {t('valueDetail.backToAbout', '회사소개로 돌아가기')}
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  const Icon = value.icon;

  return (
    <div className="min-h-screen bg-background flex flex-col pb-24">
      <Navigation />

      <div className="relative h-64 md:h-80 overflow-hidden">
        <img
          src={value.heroImage}
          alt={value.title}
          className="w-full h-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/70 to-transparent" />
        <div className="absolute bottom-0 left-0 right-0 p-8">
          <div className="container max-w-4xl">
            <Link href="/about">
              <Button variant="outline" size="sm" className="mb-4 bg-background/30 backdrop-blur-sm" data-testid="button-back-about">
                <ArrowLeft size={14} className="mr-1.5" /> {t('valueDetail.aboutUs', '회사소개')}
              </Button>
            </Link>
            <div className="flex items-center gap-3">
              <Icon size={36} className={value.color} />
              <div>
                <Badge variant="secondary" className="mb-1 no-default-hover-elevate no-default-active-elevate">{value.title}</Badge>
                <h1 className="text-3xl md:text-4xl font-display font-bold" data-testid="text-value-title">
                  {value.subtitle}
                </h1>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="container max-w-4xl px-4 py-12">
        <p className="text-lg text-muted-foreground leading-relaxed mb-12" data-testid="text-value-description">
          {value.description}
        </p>

        <div className="grid gap-6 mb-12">
          {value.details.map((detail, i) => {
            const DetailIcon = detail.icon;
            return (
              <Card key={i} className="border-white/5" data-testid={`card-detail-${i}`}>
                <CardContent className="p-6 flex gap-5">
                  <div className="shrink-0 mt-1">
                    <div className={`w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center`}>
                      <DetailIcon size={20} className={value.color} />
                    </div>
                  </div>
                  <div>
                    <h3 className="font-bold text-lg mb-2">{detail.title}</h3>
                    <p className="text-muted-foreground leading-relaxed">{detail.text}</p>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>

        <Card className="border-white/5 bg-secondary/30">
          <CardContent className="p-8 text-center">
            <p className="text-lg italic text-muted-foreground mb-3">
              "{value.quote}"
            </p>
            <p className="text-sm text-muted-foreground">— {value.quoteAuthor}</p>
          </CardContent>
        </Card>

        <div className="flex justify-center gap-4 mt-12 flex-wrap">
          {Object.entries(VALUES)
            .filter(([key]) => key !== slug)
            .map(([key, v]) => {
              const NavIcon = v.icon;
              return (
                <Link key={key} href={`/about/values/${key}`}>
                  <Card className="hover-elevate border-white/5 cursor-pointer" data-testid={`link-value-${key}`}>
                    <CardContent className="p-5 flex items-center gap-3">
                      <NavIcon size={20} className={v.color} />
                      <div>
                        <p className="font-semibold text-sm">{v.title}</p>
                        <p className="text-xs text-muted-foreground">{v.subtitle}</p>
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              );
            })}
        </div>
      </div>
    </div>
  );
}
