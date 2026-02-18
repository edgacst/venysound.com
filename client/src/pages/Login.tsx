import { Navigation } from "@/components/Navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Music, CheckCircle } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useLocation } from "wouter";
import { useEffect } from "react";
import { useTranslation } from 'react-i18next';

export default function Login() {
  const { t } = useTranslation();
  const { user, isLoading } = useAuth();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (!isLoading && user) {
      setLocation("/");
    }
  }, [isLoading, user, setLocation]);

  return (
    <div className="min-h-screen bg-background">
      <Navigation />

      <div className="flex items-center justify-center px-4" style={{ minHeight: "calc(100vh - 4rem)" }}>
        <Card className="w-full max-w-md border-white/10 bg-card/80 backdrop-blur-sm">
          <CardContent className="p-8">
            <div className="text-center mb-6">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-tr from-primary to-purple-400 mb-4">
                <Music className="text-white" size={32} />
              </div>
              <h1 className="text-3xl font-display font-bold mb-2" data-testid="text-login-title">Veny Sound</h1>
              <p className="text-muted-foreground">{t('login.subtitle', '음악으로 연결되는 우리만의 공간')}</p>
            </div>

            <div className="space-y-3">
              <a href="/api/auth/google" data-testid="link-google-login">
                <Button
                  variant="outline"
                  className="w-full gap-3 py-6 text-base border-white/10"
                  size="lg"
                  data-testid="button-login-google"
                >
                  <svg width="20" height="20" viewBox="0 0 24 24">
                    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
                    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                  </svg>
                  {t('login.continueWithGoogle', 'Google로 계속하기')}
                </Button>
              </a>

              <a href="/api/auth/naver" data-testid="link-naver-login">
                <Button
                  variant="outline"
                  className="w-full gap-3 py-6 text-base border-white/10"
                  size="lg"
                  data-testid="button-login-naver"
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                    <rect width="24" height="24" rx="4" fill="#03C75A"/>
                    <path d="M13.5 12.6L10.2 7.5H7.5v9h3.3v-5.1l3.3 5.1H16.5v-9h-3v5.1z" fill="white"/>
                  </svg>
                  {t('login.continueWithNaver', '네이버로 계속하기')}
                </Button>
              </a>

              <a href="/api/auth/kakao" data-testid="link-kakao-login">
                <Button
                  variant="outline"
                  className="w-full gap-3 py-6 text-base border-white/10"
                  size="lg"
                  data-testid="button-login-kakao"
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                    <rect width="24" height="24" rx="4" fill="#FEE500"/>
                    <path d="M12 6C8.13 6 5 8.52 5 11.6c0 1.96 1.3 3.68 3.26 4.65l-.83 3.04c-.07.25.22.45.44.31l3.55-2.36c.19.01.38.03.58.03 3.87 0 7-2.52 7-5.63S15.87 6 12 6z" fill="#3C1E1E"/>
                  </svg>
                  {t('login.continueWithKakao', '카카오로 계속하기')}
                </Button>
              </a>

              <div className="relative my-4">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t border-white/10" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-card px-2 text-muted-foreground">{t('login.additionalOptions', '추가 로그인 옵션 (준비중)')}</span>
                </div>
              </div>

              <Button
                variant="outline"
                className="w-full gap-3 py-6 text-base border-white/10 opacity-50 cursor-not-allowed"
                size="lg"
                disabled
                data-testid="button-login-facebook"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                  <rect width="24" height="24" rx="4" fill="#1877F2"/>
                  <path d="M16.67 15.13l.55-3.57h-3.43V9.38c0-.98.48-1.93 2.01-1.93h1.56V4.56s-1.41-.24-2.76-.24c-2.82 0-4.66 1.71-4.66 4.81v2.72H7v3.57h2.94v8.62c.59.09 1.19.14 1.81.14s1.22-.05 1.81-.14v-8.62h2.47l.64.01z" fill="white"/>
                </svg>
                {t('login.continueWithFacebook', 'Facebook으로 계속하기')}
              </Button>
            </div>

            <div className="mt-6 space-y-3 text-sm text-muted-foreground">
              <div className="flex items-start gap-3">
                <CheckCircle size={16} className="text-primary mt-0.5 shrink-0" />
                <span>{t('login.feature1', '소셜 계정으로 간편하게 시작')}</span>
              </div>
              <div className="flex items-start gap-3">
                <CheckCircle size={16} className="text-primary mt-0.5 shrink-0" />
                <span>{t('login.feature2', '음원 업로드 및 스트리밍 기능 무료 이용')}</span>
              </div>
              <div className="flex items-start gap-3">
                <CheckCircle size={16} className="text-primary mt-0.5 shrink-0" />
                <span>{t('login.feature3', '커뮤니티 참여 및 다른 아티스트와 소통')}</span>
              </div>
            </div>

            <div className="mt-6 pt-6 border-t border-white/10">
              <div className="grid grid-cols-3 gap-4 text-center text-sm text-muted-foreground">
                <div>
                  <p className="text-lg font-bold text-foreground">10K+</p>
                  <p>{t('login.statArtists', '아티스트')}</p>
                </div>
                <div>
                  <p className="text-lg font-bold text-foreground">50K+</p>
                  <p>{t('login.statTracks', '음원')}</p>
                </div>
                <div>
                  <p className="text-lg font-bold text-foreground">100K+</p>
                  <p>{t('login.statListeners', '리스너')}</p>
                </div>
              </div>
            </div>

            <p className="text-center text-xs text-muted-foreground mt-6">
              {t('login.agreementPrefix', '로그인/회원가입 시')} <a href="/legal" className="underline hover:text-foreground" data-testid="link-terms">{t('login.terms', '이용약관')}</a> {t('login.and', '및')} <a href="/legal" className="underline hover:text-foreground" data-testid="link-privacy">{t('login.privacy', '개인정보처리방침')}</a>{t('login.agreementSuffix', '에 동의합니다.')}
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
