import { Navigation } from "@/components/Navigation";
import { Footer } from "@/components/Footer";
import { PageTransition } from "@/components/PageTransition";
import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import {
  Upload,
  Music,
  Heart,
  DollarSign,
  Users,
  Search,
  Play,
  Crown,
  Gift,
  Download,
  Bell,
  ListPlus,
  TrendingUp,
  Shield,
  Headphones,
  Mic2,
  ArrowLeft,
} from "lucide-react";
import { motion } from "framer-motion";
import { useTranslation } from 'react-i18next';
import { useQuery } from "@tanstack/react-query";

export default function Guide() {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<"artist" | "listener" | "video">("listener");

  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  const container = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: { staggerChildren: 0.06 }
    }
  };

  const item = {
    hidden: { opacity: 0, y: 16 },
    show: { opacity: 1, y: 0 }
  };

  const { data: videoGuides } = useQuery<
    { id: number; title: string; description: string | null; youtubeUrl: string; sortOrder: number | null; createdAt: string }[]
  >({
    queryKey: ["/api/guide-videos"],
    queryFn: async () => {
      const res = await fetch("/api/guide-videos");
      if (!res.ok) return [];
      return res.json();
    },
  });

  const parseYoutubeId = (url: string) => {
    try {
      // 단순 ID만 들어온 경우
      if (!url.includes("http")) return url.trim();
      const u = new URL(url);
      if (u.hostname.includes("youtu.be")) {
        return u.pathname.replace("/", "");
      }
      if (u.searchParams.get("v")) {
        return u.searchParams.get("v") as string;
      }
      return url.trim();
    } catch {
      return url.trim();
    }
  };

  return (
    <PageTransition>
      <div className="min-h-screen bg-background flex flex-col pb-24">
        <Navigation />

        <div className="container max-w-4xl px-4 py-8">
          <Link href="/">
            <div className="flex items-center gap-2 text-muted-foreground hover:text-foreground cursor-pointer mb-6 transition-colors" data-testid="link-guide-back">
              <ArrowLeft size={16} />
              <span className="text-sm">{t('guide.backToHome', '홈으로 돌아가기')}</span>
            </div>
          </Link>

          <div className="text-center mb-8">
            <h1 className="text-3xl md:text-4xl font-display font-bold mb-3" data-testid="text-guide-title">
              {t('guide.title', 'Veny_Sound 시작 가이드')}
            </h1>
            <p className="text-muted-foreground text-lg">
              {t('guide.subtitle', 'Veny_Sound를 100% 활용하는 방법을 알아보세요')}
            </p>
          </div>

          <div className="flex justify-center gap-2 mb-10">
            <Button
              variant={activeTab === "listener" ? "default" : "outline"}
              onClick={() => setActiveTab("listener")}
              className="gap-2 rounded-full px-6"
              data-testid="tab-listener"
            >
              <Headphones size={16} />
              {t('guide.listenerGuide', '리스너 가이드')}
            </Button>
            <Button
              variant={activeTab === "artist" ? "default" : "outline"}
              onClick={() => setActiveTab("artist")}
              className="gap-2 rounded-full px-6"
              data-testid="tab-artist"
            >
              <Mic2 size={16} />
              {t('guide.artistGuide', '아티스트 가이드')}
            </Button>
            <Button
              variant={activeTab === "video" ? "default" : "outline"}
              onClick={() => setActiveTab("video")}
              className="gap-2 rounded-full px-6"
              data-testid="tab-video"
            >
              <Play size={16} />
              {t("guide.videoGuide", "동영상 가이드")}
            </Button>
          </div>

          {activeTab === "listener" && (
            <motion.div
              variants={container}
              initial="hidden"
              animate="show"
              className="space-y-6"
              data-testid="section-listener-guide"
            >
              <motion.div variants={item}>
                <h2 className="text-2xl font-bold mb-4 flex items-center gap-2">
                  <Headphones className="text-primary" size={24} />
                  {t('guide.forListeners', '리스너를 위한 가이드')}
                </h2>
                <p className="text-muted-foreground mb-6">
                  {t('guide.forListenersDesc', 'Veny_Sound에서 음악을 발견하고, 좋아하는 아티스트를 응원하는 방법을 소개합니다.')}
                </p>
              </motion.div>

              <motion.div variants={item}>
                <Card className="p-5 border-white/10">
                  <div className="flex items-start gap-4">
                    <div className="p-3 rounded-lg bg-primary/10 shrink-0">
                      <Search className="text-primary" size={22} />
                    </div>
                    <div>
                      <h3 className="font-semibold text-lg mb-1">{t('guide.browseMusic', '음원 탐색')}</h3>
                      <p className="text-muted-foreground text-sm leading-relaxed">
                        {t('guide.browseMusicDesc', '음원 목록 페이지에서 모든 등록된 음악을 탐색할 수 있습니다. 상단 검색창에 아티스트 이름이나 곡 제목을 입력하여 원하는 음악을 빠르게 찾아보세요. 장르 필터를 사용하면 팝뮤직, 국내가요, 월드뮤직, 경음악 등 카테고리별로 음악을 분류하여 들을 수 있습니다.')}
                      </p>
                    </div>
                  </div>
                </Card>
              </motion.div>

              <motion.div variants={item}>
                <Card className="p-5 border-white/10">
                  <div className="flex items-start gap-4">
                    <div className="p-3 rounded-lg bg-green-500/10 shrink-0">
                      <Play className="text-green-400" size={22} />
                    </div>
                    <div>
                      <h3 className="font-semibold text-lg mb-1">{t('guide.playMusic', '음악 재생')}</h3>
                      <p className="text-muted-foreground text-sm leading-relaxed">
                        {t('guide.playMusicDesc', '음원 카드의 재생 버튼을 클릭하면 화면 하단에 글로벌 플레이어가 나타납니다. 페이지를 이동해도 재생이 계속되며, 이전/다음 트랙 버튼으로 곡을 넘길 수 있습니다. 전체재생 기능을 사용하면 목록의 모든 곡을 연속 재생합니다. 재생 시간은 자동으로 기록되어 마이페이지에서 총 스트리밍 시간을 확인할 수 있습니다.')}
                      </p>
                    </div>
                  </div>
                </Card>
              </motion.div>

              <motion.div variants={item}>
                <Card className="p-5 border-white/10">
                  <div className="flex items-start gap-4">
                    <div className="p-3 rounded-lg bg-red-500/10 shrink-0">
                      <Heart className="text-red-400" size={22} />
                    </div>
                    <div>
                      <h3 className="font-semibold text-lg mb-1">{t('guide.likeAndFollow', '좋아요 & 팔로우')}</h3>
                      <p className="text-muted-foreground text-sm leading-relaxed">
                        {t('guide.likeAndFollowDesc', '마음에 드는 음원에 하트 버튼을 눌러 좋아요를 표시하세요. 좋아요한 곡은 마이페이지에서 모아볼 수 있습니다. 좋아하는 아티스트를 팔로우하면 새로운 음원이 업로드될 때 알림을 받을 수 있습니다.')}
                      </p>
                    </div>
                  </div>
                </Card>
              </motion.div>

              <motion.div variants={item}>
                <Card className="p-5 border-white/10">
                  <div className="flex items-start gap-4">
                    <div className="p-3 rounded-lg bg-blue-500/10 shrink-0">
                      <ListPlus className="text-blue-400" size={22} />
                    </div>
                    <div>
                      <h3 className="font-semibold text-lg mb-1">{t('guide.playlists', '플레이리스트')}</h3>
                      <p className="text-muted-foreground text-sm leading-relaxed">
                        {t('guide.playlistsDesc', '나만의 플레이리스트를 만들어 좋아하는 곡들을 모아보세요. 음원 카드의 메뉴에서 "플레이리스트에 추가"를 선택하면 원하는 플레이리스트에 곡을 추가할 수 있습니다. 마이페이지에서 플레이리스트를 생성, 관리, 삭제할 수 있습니다.')}
                      </p>
                    </div>
                  </div>
                </Card>
              </motion.div>

              <motion.div variants={item}>
                <Card className="p-5 border-white/10">
                  <div className="flex items-start gap-4">
                    <div className="p-3 rounded-lg bg-yellow-500/10 shrink-0">
                      <Gift className="text-yellow-400" size={22} />
                    </div>
                    <div>
                      <h3 className="font-semibold text-lg mb-1">{t('guide.tipAndPurchase', '후원 & 음원 구매')}</h3>
                      <p className="text-muted-foreground text-sm leading-relaxed">
                        {t('guide.tipAndPurchaseDesc', '좋아하는 아티스트에게 크레딧으로 후원할 수 있습니다. 최소 100원부터 자유롭게 후원 금액을 선택하고 응원 메시지를 남겨보세요. 유료 다운로드가 설정된 음원은 크레딧으로 구매하여 다운로드할 수 있습니다. 크레딧은 크레딧 충전 페이지에서 구매할 수 있습니다.')}
                      </p>
                    </div>
                  </div>
                </Card>
              </motion.div>

              <motion.div variants={item}>
                <Card className="p-5 border-white/10">
                  <div className="flex items-start gap-4">
                    <div className="p-3 rounded-lg bg-purple-500/10 shrink-0">
                      <Users className="text-purple-400" size={22} />
                    </div>
                    <div>
                      <h3 className="font-semibold text-lg mb-1">{t('guide.community', '커뮤니티')}</h3>
                      <p className="text-muted-foreground text-sm leading-relaxed">
                        {t('guide.communityDesc', '커뮤니티 게시판에서 다른 사용자들과 소통하세요. 자유게시판, 음악추천, 콜라보레이션, 정보공유 등 다양한 카테고리에서 글을 작성할 수 있습니다. 댓글과 대댓글(답글) 기능으로 활발한 토론에 참여해보세요.')}
                      </p>
                    </div>
                  </div>
                </Card>
              </motion.div>

              <motion.div variants={item}>
                <Card className="p-5 border-white/10">
                  <div className="flex items-start gap-4">
                    <div className="p-3 rounded-lg bg-amber-500/10 shrink-0">
                      <TrendingUp className="text-amber-400" size={22} />
                    </div>
                    <div>
                      <h3 className="font-semibold text-lg mb-1">{t('guide.popularAndNotifications', '인기 음원 & 알림')}</h3>
                      <p className="text-muted-foreground text-sm leading-relaxed">
                        {t('guide.popularAndNotificationsDesc', '인기 음원 페이지에서 가장 많은 좋아요를 받은 TOP 10 음원을 확인할 수 있습니다. 알림 기능을 통해 팔로우한 아티스트의 새 곡, 후원 알림, 저작권 신고 처리 결과 등을 실시간으로 받아보세요.')}
                      </p>
                    </div>
                  </div>
                </Card>
              </motion.div>

              <motion.div variants={item}>
                <Card className="p-5 border-white/10">
                  <div className="flex items-start gap-4">
                    <div className="p-3 rounded-lg bg-pink-500/10 shrink-0">
                      <Crown className="text-pink-400" size={22} />
                    </div>
                    <div>
                      <h3 className="font-semibold text-lg mb-1">{t('guide.premiumMembership', '프리미엄 멤버십')}</h3>
                      <p className="text-muted-foreground text-sm leading-relaxed">
                        {t('guide.premiumMembershipDesc', '프리미엄 구독을 통해 AI 커버 이미지 자동 생성 등 특별한 기능을 이용할 수 있습니다. 월간(9,900원) 또는 연간(99,000원) 플랜을 선택하여 구독하세요. 토스페이먼츠를 통한 안전한 결제를 지원합니다.')}
                      </p>
                    </div>
                  </div>
                </Card>
              </motion.div>
            </motion.div>
          )}

          {activeTab === "artist" && (
            <motion.div
              variants={container}
              initial="hidden"
              animate="show"
              className="space-y-6"
              data-testid="section-artist-guide"
            >
              <motion.div variants={item}>
                <h2 className="text-2xl font-bold mb-4 flex items-center gap-2">
                  <Mic2 className="text-primary" size={24} />
                  {t('guide.forArtists', '아티스트를 위한 가이드')}
                </h2>
                <p className="text-muted-foreground mb-6">
                  {t('guide.forArtistsDesc', 'Veny_Sound에서 음원을 업로드하고, 팬들과 소통하며, 수익을 창출하는 방법을 알아보세요.')}
                </p>
              </motion.div>

              <motion.div variants={item}>
                <Card className="p-5 border-white/10">
                  <div className="flex items-start gap-4">
                    <div className="p-3 rounded-lg bg-primary/10 shrink-0">
                      <Upload className="text-primary" size={22} />
                    </div>
                    <div>
                      <h3 className="font-semibold text-lg mb-1">{t('guide.uploadMusic', '음원 업로드')}</h3>
                      <p className="text-muted-foreground text-sm leading-relaxed">
                        {t('guide.uploadMusicDesc', '업로드 페이지에서 MP3, WAV, OGG 형식의 음원을 업로드할 수 있습니다. 제목, 아티스트명, 장르(대분류/소분류), 태그를 설정하고 앨범 커버를 직접 올리거나 랜덤 커버 가져오기로 자동으로 이미지를 설정할 수 있습니다. AI로 만든 음원은 "AI 음원" 체크를 해주세요.')}
                      </p>
                    </div>
                  </div>
                </Card>
              </motion.div>

              <motion.div variants={item}>
                <Card className="p-5 border-white/10">
                  <div className="flex items-start gap-4">
                    <div className="p-3 rounded-lg bg-indigo-500/10 shrink-0">
                      <Music className="text-indigo-400" size={22} />
                    </div>
                    <div>
                      <h3 className="font-semibold text-lg mb-1">{t('guide.bulkUpload', '대량 업로드')}</h3>
                      <p className="text-muted-foreground text-sm leading-relaxed">
                        {t('guide.bulkUploadDesc', '여러 곡을 한번에 올리고 싶다면 대량 업로드 기능을 이용하세요. 파일을 여러 개 선택한 후, 일괄 설정으로 아티스트, 장르, AI 여부를 한번에 적용할 수 있습니다. 각 트랙별로 제목, 태그, 랜덤 커버를 개별 설정할 수도 있습니다.')}
                      </p>
                    </div>
                  </div>
                </Card>
              </motion.div>

              <motion.div variants={item}>
                <Card className="p-5 border-white/10">
                  <div className="flex items-start gap-4">
                    <div className="p-3 rounded-lg bg-green-500/10 shrink-0">
                      <DollarSign className="text-green-400" size={22} />
                    </div>
                    <div>
                      <h3 className="font-semibold text-lg mb-1">{t('guide.monetization', '수익창출(프리미엄 구독자만 수익활동가능)')}</h3>
                      <p className="text-muted-foreground text-sm leading-relaxed">
                        {t('guide.monetizationDesc', '업로드 시 유료 다운로드를 설정하면 리스너가 크레딧으로 음원을 구매할 수 있습니다. 최소 100원부터 가격을 설정할 수 있으며, 리스너가 보내는 후원(팁)도 수익으로 연결됩니다. 마이페이지의 수익 탭에서 잔액, 후원 내역, 판매 내역을 확인하고 출금 요청을 할 수 있습니다. 출금 시 수수료 15%(부가세 별도)가 공제됩니다.')}
                      </p>
                    </div>
                  </div>
                </Card>
              </motion.div>

              <motion.div variants={item}>
                <Card className="p-5 border-white/10">
                  <div className="flex items-start gap-4">
                    <div className="p-3 rounded-lg bg-orange-500/10 shrink-0">
                      <Download className="text-orange-400" size={22} />
                    </div>
                    <div>
                      <h3 className="font-semibold text-lg mb-1">{t('guide.manageMusic', '음원 관리')}</h3>
                      <p className="text-muted-foreground text-sm leading-relaxed">
                        {t('guide.manageMusicDesc', '업로드한 음원은 언제든지 수정할 수 있습니다. 제목, 아티스트, 장르, 태그, AI 여부를 변경하고 랜덤 커버 가져오기로 커버 이미지도 교체할 수 있습니다. 필요한 경우 음원을 삭제할 수도 있습니다.')}
                      </p>
                    </div>
                  </div>
                </Card>
              </motion.div>

              <motion.div variants={item}>
                <Card className="p-5 border-white/10">
                  <div className="flex items-start gap-4">
                    <div className="p-3 rounded-lg bg-cyan-500/10 shrink-0">
                      <Bell className="text-cyan-400" size={22} />
                    </div>
                    <div>
                      <h3 className="font-semibold text-lg mb-1">{t('guide.fanCommunication', '팬 소통')}</h3>
                      <p className="text-muted-foreground text-sm leading-relaxed">
                        {t('guide.fanCommunicationDesc', '팔로워들은 새 음원 업로드 시 알림을 받습니다. 커뮤니티 게시판에서 팬들과 직접 소통하고, 콜라보레이션 파트너를 찾아보세요. 마이페이지에서 팔로워/팔로잉 목록을 확인할 수 있습니다.')}
                      </p>
                    </div>
                  </div>
                </Card>
              </motion.div>

              <motion.div variants={item}>
                <Card className="p-5 border-white/10">
                  <div className="flex items-start gap-4">
                    <div className="p-3 rounded-lg bg-rose-500/10 shrink-0">
                      <Shield className="text-rose-400" size={22} />
                    </div>
                    <div>
                      <h3 className="font-semibold text-lg mb-1">{t('guide.copyrightProtection', '저작권 보호')}</h3>
                      <p className="text-muted-foreground text-sm leading-relaxed">
                        {t('guide.copyrightProtectionDesc', 'Veny_Sound는 저작권 신고 시스템을 운영합니다. 무단 사용, 표절, 허위 아티스트 표기 등을 발견하면 신고할 수 있으며, 관리자가 검토 후 적절한 조치를 취합니다. 신고 처리 결과는 알림으로 안내됩니다. 마이페이지에서 내가 접수한 신고의 처리 상태를 확인할 수 있습니다.')}
                      </p>
                    </div>
                  </div>
                </Card>
              </motion.div>

              <motion.div variants={item}>
                <Card className="p-5 border-white/10">
                  <div className="flex items-start gap-4">
                    <div className="p-3 rounded-lg bg-violet-500/10 shrink-0">
                      <Crown className="text-violet-400" size={22} />
                    </div>
                    <div>
                      <h3 className="font-semibold text-lg mb-1">{t('guide.premiumBenefits', '프리미엄 혜택')}</h3>
                      <p className="text-muted-foreground text-sm leading-relaxed">
                        {t('guide.premiumBenefitsDesc', '프리미엄 구독자는 업로드 시 AI 커버 이미지 자동 생성 기능을 이용할 수 있습니다. 프로필에 Premium 배지가 표시되어 아티스트로서의 신뢰도를 높여줍니다.')}
                      </p>
                    </div>
                  </div>
                </Card>
              </motion.div>
            </motion.div>
          )}

          {activeTab === "video" && (
            <motion.div
              variants={container}
              initial="hidden"
              animate="show"
              className="space-y-6"
              data-testid="section-video-guide"
            >
              <motion.div variants={item}>
                <h2 className="text-2xl font-bold mb-4 flex items-center gap-2">
                  <Play className="text-primary" size={24} />
                  {t("guide.videoGuideTitle", "동영상 가이드")}
                </h2>
                <p className="text-muted-foreground mb-6">
                  {t(
                    "guide.videoGuideIntro",
                    "서비스 사용법을 영상으로 보고 싶을 때 아래 가이드를 참고하세요. 유튜브 영상 ID만 교체하면 언제든 내용을 바꿀 수 있습니다."
                  )}
                </p>
              </motion.div>

              <motion.div
                variants={item}
                className="grid grid-cols-1 md:grid-cols-2 gap-6"
              >
                {(videoGuides ?? []).length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    등록된 동영상 가이드가 없습니다. 관리자 페이지에서 유튜브 링크를 추가해 주세요.
                  </p>
                ) : (
                  (videoGuides ?? []).map((v) => (
                    <Card
                      key={v.id}
                      className="overflow-hidden border-white/10 w-full md:w-1/2 mx-auto"
                    >
                      <div className="aspect-video w-full bg-black">
                        <iframe
                          className="w-full h-full"
                          src={`https://www.youtube.com/embed/${parseYoutubeId(v.youtubeUrl)}`}
                          title={v.title}
                          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                          allowFullScreen
                        />
                      </div>
                      <div className="p-4 space-y-2">
                        <h3 className="font-semibold text-base">{v.title}</h3>
                        <p className="text-sm text-muted-foreground">
                          {v.description}
                        </p>
                      </div>
                    </Card>
                  ))
                )}
              </motion.div>
            </motion.div>
          )}
        </div>
        <Footer />
      </div>
    </PageTransition>
  );
}
