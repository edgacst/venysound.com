import { Navigation } from "@/components/Navigation";
import { Footer } from "@/components/Footer";
import { Card, CardContent } from "@/components/ui/card";
import {
  Lightbulb,
  Users,
  Shield,
  Mail,
  Phone,
  MapPin,
  ArrowRight,
  Sparkles,
  Music2,
  BarChart3,
  Type,
} from "lucide-react";
import { Link } from "wouter";
import logoImage from "@assets/image_3fb5572f_1771157735033.png";
import { PageTransition } from "@/components/PageTransition";
import { useTranslation } from 'react-i18next';

export default function About() {
  const { t } = useTranslation();

  return (
    <PageTransition>
      <div className="min-h-screen bg-background flex flex-col pb-24">
        <Navigation />

        <div className="container max-w-4xl px-4 py-12">
        <div className="text-center mb-12">
          <h1
            className="text-4xl font-display font-bold mb-3"
            data-testid="text-about-title"
          >
            {t('about.title')}
          </h1>
          <p className="text-lg text-muted-foreground">
            {t('about.subtitle')}
          </p>
        </div>

        <div className="flex flex-col items-center mb-12">
          <img
            src={logoImage}
            alt={t('about.logoAlt')}
            className="w-72 h-auto mb-6 rounded-xl"
            data-testid="img-about-logo"
          />
          <p className="text-center text-lg text-primary font-semibold italic">
            {t('about.logoSlogan')}
          </p>
        </div>

        <Card className="border-white/5 bg-card/50 mb-12">
          <CardContent className="p-8">
            <h2 className="text-2xl font-bold mb-6 text-center">
              {t('about.logoStory')}
            </h2>
            <p className="text-muted-foreground mb-8">
              {t('about.logoDesc')}
            </p>

            <div className="space-y-8">
              <div className="flex gap-4">
                <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-gradient-to-tr from-blue-500 to-orange-400 flex items-center justify-center">
                  <Sparkles className="text-white" size={20} />
                </div>
                <div>
                  <h3 className="text-lg font-bold mb-2">
                    {t('about.symbol1Title')}
                  </h3>
                  <p className="text-muted-foreground mb-2">
                    <span className="text-foreground font-medium">
                      {t('about.symbol1Desc1')}
                    </span>{" "}
                    {t('about.symbol1Text1')}
                  </p>
                  <p className="text-muted-foreground">
                    <span className="text-foreground font-medium">
                      {t('about.symbol1Desc2')}
                    </span>{" "}
                    {t('about.symbol1Text2')}
                  </p>
                </div>
              </div>

              <div className="flex gap-4">
                <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-gradient-to-tr from-purple-500 to-pink-400 flex items-center justify-center">
                  <Music2 className="text-white" size={20} />
                </div>
                <div>
                  <h3 className="text-lg font-bold mb-2">
                    {t('about.symbol2Title')}
                  </h3>
                  <p className="text-muted-foreground mb-2">
                    <span className="text-foreground font-medium">
                      {t('about.symbol2Desc1')}
                    </span>{" "}
                    {t('about.symbol2Text1')}
                  </p>
                  <p className="text-muted-foreground">
                    <span className="text-foreground font-medium">
                      {t('about.symbol2Desc2')}
                    </span>{" "}
                    {t('about.symbol2Text2')}
                  </p>
                </div>
              </div>

              <div className="flex gap-4">
                <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-gradient-to-tr from-cyan-400 to-blue-500 flex items-center justify-center">
                  <BarChart3 className="text-white" size={20} />
                </div>
                <div>
                  <h3 className="text-lg font-bold mb-2">
                    {t('about.symbol3Title')}
                  </h3>
                  <p className="text-muted-foreground mb-2">
                    <span className="text-foreground font-medium">
                      {t('about.symbol3Desc1')}
                    </span>{" "}
                    {t('about.symbol3Text1')}
                  </p>
                  <p className="text-muted-foreground">
                    <span className="text-foreground font-medium">
                      {t('about.symbol3Desc2')}
                    </span>{" "}
                    {t('about.symbol3Text2')}
                  </p>
                </div>
              </div>

              <div className="flex gap-4">
                <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-gradient-to-tr from-pink-500 to-orange-400 flex items-center justify-center">
                  <Type className="text-white" size={20} />
                </div>
                <div>
                  <h3 className="text-lg font-bold mb-2">
                    {t('about.symbol4Title')}
                  </h3>
                  <p className="text-muted-foreground">
                    <span className="text-foreground font-medium">
                      {t('about.symbol4Desc')}
                    </span>{" "}
                    {t('about.symbol4Text')}
                  </p>
                </div>
              </div>
            </div>

            <div className="mt-8 p-4 rounded-lg bg-primary/10 border border-primary/20 text-center">
              <p className="text-muted-foreground">
                {t('about.logoSummary')}
              </p>
            </div>
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-12 items-center">
          <div className="rounded-xl overflow-hidden">
            <img
              src="https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?ixlib=rb-4.0.3&auto=format&fit=crop&w=1000&q=80"
              alt="Music Studio"
              className="w-full h-64 object-cover"
            />
          </div>
          <div>
            <h2 className="text-2xl font-bold mb-3 text-primary">
              {t('about.mission')}
            </h2>
            <p className="text-lg text-muted-foreground mb-4 italic">
              {t('about.missionQuote')}
            </p>
            <p className="text-muted-foreground mb-6">
              {t('about.missionDesc')}
            </p>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <h3 className="text-2xl font-bold">10K+</h3>
                <p className="text-muted-foreground text-sm">{t('about.registeredArtists')}</p>
              </div>
              <div>
                <h3 className="text-2xl font-bold">50K+</h3>
                <p className="text-muted-foreground text-sm">{t('about.sharedTracks')}</p>
              </div>
            </div>
          </div>
        </div>

        <div className="border-t border-white/5 my-12" />

        <div className="text-center mb-8">
          <h2 className="text-2xl font-bold mb-8">{t('about.coreValues')}</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <Link href="/about/values/creativity">
              <Card
                className="border-white/5 bg-card/50 hover-elevate cursor-pointer h-full"
                data-testid="link-value-creativity"
              >
                <CardContent className="p-6 text-center">
                  <Lightbulb className="mx-auto mb-3 text-primary" size={32} />
                  <h4 className="font-bold text-lg mb-2">{t('about.creativity')}</h4>
                  <p className="text-sm text-muted-foreground mb-3">
                    {t('about.creativityDesc')}
                  </p>
                  <span className="inline-flex items-center gap-1 text-xs text-primary">
                    {t('about.learnMore')} <ArrowRight size={12} />
                  </span>
                </CardContent>
              </Card>
            </Link>
            <Link href="/about/values/community">
              <Card
                className="border-white/5 bg-card/50 hover-elevate cursor-pointer h-full"
                data-testid="link-value-community"
              >
                <CardContent className="p-6 text-center">
                  <Users className="mx-auto mb-3 text-green-400" size={32} />
                  <h4 className="font-bold text-lg mb-2">{t('about.communityValue')}</h4>
                  <p className="text-sm text-muted-foreground mb-3">
                    {t('about.communityDesc')}
                  </p>
                  <span className="inline-flex items-center gap-1 text-xs text-green-400">
                    {t('about.learnMore')} <ArrowRight size={12} />
                  </span>
                </CardContent>
              </Card>
            </Link>
            <Link href="/about/values/trust">
              <Card
                className="border-white/5 bg-card/50 hover-elevate cursor-pointer h-full"
                data-testid="link-value-trust"
              >
                <CardContent className="p-6 text-center">
                  <Shield className="mx-auto mb-3 text-yellow-400" size={32} />
                  <h4 className="font-bold text-lg mb-2">{t('about.trust')}</h4>
                  <p className="text-sm text-muted-foreground mb-3">
                    {t('about.trustDesc')}
                  </p>
                  <span className="inline-flex items-center gap-1 text-xs text-yellow-400">
                    {t('about.learnMore')} <ArrowRight size={12} />
                  </span>
                </CardContent>
              </Card>
            </Link>
          </div>
        </div>

        <Card className="border-white/5 bg-secondary/30 mt-12">
          <CardContent className="p-8 text-center">
            <h2 className="text-2xl font-bold mb-3">{t('about.contactUs')}</h2>
            <p className="text-muted-foreground mb-6">
              {t('about.contactDesc')}
            </p>
            <div className="flex flex-col md:flex-row justify-center gap-6 text-sm text-muted-foreground">
              <div className="flex items-center gap-2 justify-center">
                <Mail size={16} className="text-primary" /> freecompr@naver.com
              </div>
              <div className="flex items-center gap-2 justify-center">
                <Phone size={16} className="text-primary" /> 010-8447-9973
              </div>
              <div className="flex items-center gap-2 justify-center">
                <MapPin size={16} className="text-primary" /> 경기도 부천시 상동
                457
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
      <Footer />
      </div>
    </PageTransition>
  );
}
