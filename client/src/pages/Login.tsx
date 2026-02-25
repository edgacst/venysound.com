import { Music, CheckCircle, User, Eye, EyeOff, Lock } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useLocation, Link } from "wouter";
import { useEffect, useState } from "react";
import { useTranslation } from 'react-i18next';
import { useQuery } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

export default function Login() {
  const { t } = useTranslation();
  const { user, isLoading } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const [localForm, setLocalForm] = useState({ username: "", password: "" });
  const [showPw, setShowPw] = useState(false);
  const [localLoading, setLocalLoading] = useState(false);
  const [devLoggingIn, setDevLoggingIn] = useState(false);

  const { data: loginOptions } = useQuery({
    queryKey: ["/api/auth/login-options"],
    queryFn: () => fetch("/api/auth/login-options").then((r) => r.json()),
  });

  const optionsLoaded = !!loginOptions;
  const hasAnyOAuth = loginOptions && (loginOptions.hasGoogle || loginOptions.hasNaver || loginOptions.hasKakao || loginOptions.hasFacebook || loginOptions.hasTikTok);

  useEffect(() => {
    if (!isLoading && user) setLocation("/");
  }, [isLoading, user, setLocation]);

  const handleDevLogin = async () => {
    setDevLoggingIn(true);
    try {
      const res = await fetch("/api/auth/dev-login", { method: "POST", credentials: "include" });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.success) {
        toast({ title: t("login.loginSuccess", "로그인되었습니다") });
        setTimeout(() => { window.location.href = "/"; }, 800);
      } else {
        toast({ title: t("login.loginFailed", "로그인 실패"), description: data.error, variant: "destructive" });
        setDevLoggingIn(false);
      }
    } catch {
      setDevLoggingIn(false);
    }
  };

  const handleLocalLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!localForm.username || !localForm.password) {
      toast({ title: t("login.inputError", "입력 오류"), description: t("login.inputErrorDesc", "아이디와 비밀번호를 입력해주세요."), variant: "destructive" });
      return;
    }
    setLocalLoading(true);
    try {
      const res = await fetch("/api/auth/local-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(localForm),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        toast({ title: t("login.loginSuccess", "로그인되었습니다") });
        setTimeout(() => { window.location.href = "/"; }, 800);
      } else {
        toast({ title: t("login.loginFailed", "로그인 실패"), description: data.error || t("login.loginFailedDesc", "아이디 또는 비밀번호가 올바르지 않습니다."), variant: "destructive" });
      }
    } catch {
      toast({ title: t("login.serverError", "오류"), description: t("login.serverErrorDesc", "서버에 연결할 수 없습니다."), variant: "destructive" });
    } finally {
      setLocalLoading(false);
    }
  };

  const socialBtn = "w-full flex items-center justify-center gap-3 py-5 text-base rounded-lg bg-[#2d2d2d] border border-[#555] text-white hover:bg-[#3d3d3d] transition-colors";
  const inputClass = "w-full bg-zinc-800 border border-zinc-600 rounded-lg px-4 py-3 text-white placeholder-zinc-500 focus:outline-none focus:border-purple-500 text-sm";

  return (
    <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center px-4 py-12">
      <div className="w-full max-w-md space-y-6">
        {/* 브랜드 */}
        <div className="flex flex-col items-center text-center">
          <div className="w-14 h-14 rounded-xl bg-[#7c3aed] flex items-center justify-center mb-3">
            <Music className="text-white" size={28} />
          </div>
          <h1 className="text-2xl font-bold text-white" data-testid="text-login-title">Veny Sound</h1>
          <p className="text-sm text-white/70 mt-1">{t("login.subtitle", "음악으로 연결되는 우리만의 공간")}</p>
        </div>

        {/* 소셜 로그인 */}
        <div className="space-y-3">
          {optionsLoaded && !hasAnyOAuth && (
            <button
              type="button"
              onClick={handleDevLogin}
              disabled={devLoggingIn}
              className="w-full flex items-center justify-center gap-3 py-5 text-base rounded-lg bg-[#7c3aed] text-white hover:bg-[#6d28d9] disabled:opacity-70"
            >
              <User size={20} />
              {devLoggingIn ? t("login.loggingIn", "로그인 중...") : t("login.devLogin", "개발용 로그인 (로컬 테스트)")}
            </button>
          )}
          {loginOptions?.hasGoogle && (
            <a href="/api/auth/google" className="block" data-testid="link-google-login">
              <button type="button" className={socialBtn} data-testid="button-login-google">
                <svg width="20" height="20" viewBox="0 0 24 24">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                </svg>
                {t("login.continueWithGoogle", "Google로 계속하기")}
              </button>
            </a>
          )}
          {loginOptions?.hasNaver && (
            <a href="/api/auth/naver" className="block" data-testid="link-naver-login">
              <button type="button" className={socialBtn} data-testid="button-login-naver">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                  <rect width="24" height="24" rx="4" fill="#03C75A" />
                  <path d="M13.5 12.6L10.2 7.5H7.5v9h3.3v-5.1l3.3 5.1H16.5v-9h-3v5.1z" fill="white" />
                </svg>
                {t("login.continueWithNaver", "네이버로 계속하기")}
              </button>
            </a>
          )}
          {loginOptions?.hasKakao && (
            <a href="/api/auth/kakao" className="block" data-testid="link-kakao-login">
              <button type="button" className={socialBtn} data-testid="button-login-kakao">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                  <rect width="24" height="24" rx="4" fill="#FEE500" />
                  <path d="M12 6C8.13 6 5 8.52 5 11.6c0 1.96 1.3 3.68 3.26 4.65l-.83 3.04c-.07.25.22.45.44.31l3.55-2.36c.19.01.38.03.58.03 3.87 0 7-2.52 7-5.63S15.87 6 12 6z" fill="#3C1E1E" />
                </svg>
                {t("login.continueWithKakao", "카카오로 계속하기")}
              </button>
            </a>
          )}
          {loginOptions?.hasFacebook && (
            <a href="/api/auth/facebook" className="block" data-testid="link-facebook-login">
              <button type="button" className={socialBtn} data-testid="button-login-facebook">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                  <rect width="24" height="24" rx="4" fill="#1877F2" />
                  <path d="M16.67 15.13l.55-3.57h-3.43V9.38c0-.98.48-1.93 2.01-1.93h1.56V4.56s-1.41-.24-2.76-.24c-2.82 0-4.66 1.71-4.66 4.81v2.72H7v3.57h2.94v8.62c.59.09 1.19.14 1.81.14s1.22-.05 1.81-.14v-8.62h2.47l.64.01z" fill="white" />
                </svg>
                {t("login.continueWithFacebook", "Facebook으로 계속하기")}
              </button>
            </a>
          )}
          {loginOptions?.hasTikTok && (
            <a href="/api/auth/tiktok" className="block" data-testid="link-tiktok-login">
              <button type="button" className={socialBtn} data-testid="button-login-tiktok">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                  <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-1-.05A6.33 6.33 0 0 0 5 20.1a6.34 6.34 0 0 0 10.86-4.43v-7a8.16 8.16 0 0 0 4.77 1.52v-3.4a4.85 4.85 0 0 1-1-.1z" fill="currentColor"/>
                </svg>
                {t("login.continueWithTikTok", "TikTok으로 계속하기")}
              </button>
            </a>
          )}
        </div>

        {/* 로컬 로그인 구분선 */}
        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <span className="w-full border-t border-zinc-700" />
          </div>
          <div className="relative flex justify-center">
            <span className="bg-zinc-950 px-3 text-xs text-zinc-500">{t("login.orLoginWithId", "또는 아이디로 로그인")}</span>
          </div>
        </div>

        {/* 아이디/비밀번호 로그인 폼 */}
        <form onSubmit={handleLocalLogin} className="space-y-3">
          <div className="relative">
            <User className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" size={16} />
            <input
              type="text"
              placeholder={t("login.usernamePlaceholder", "아이디 또는 이메일")}
              value={localForm.username}
              onChange={(e) => setLocalForm({ ...localForm, username: e.target.value })}
              className={`${inputClass} pl-9`}
            />
          </div>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" size={16} />
            <input
              type={showPw ? "text" : "password"}
              placeholder={t("login.passwordPlaceholder", "비밀번호")}
              value={localForm.password}
              onChange={(e) => setLocalForm({ ...localForm, password: e.target.value })}
              className={`${inputClass} pl-9 pr-10`}
            />
            <button type="button" onClick={() => setShowPw(!showPw)} className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300">
              {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
          <button
            type="submit"
            disabled={localLoading}
            className="w-full bg-[#7c3aed] hover:bg-[#6d28d9] text-white font-semibold py-3 rounded-lg transition-colors disabled:opacity-60"
          >
            {localLoading ? t("login.loggingIn", "로그인 중...") : t("login.loginButton", "로그인")}
          </button>
        </form>

        {/* 회원가입 링크 */}
        <p className="text-center text-sm text-zinc-500">
          {t("login.noAccount", "계정이 없으신가요?")}{" "}
          <Link href="/register" className="text-purple-400 hover:text-purple-300 font-medium">
            {t("login.register", "회원가입")}
          </Link>
        </p>

        {/* 혜택 */}
        <div className="space-y-2 pt-2">
          <div className="flex items-center gap-2.5 text-sm text-white">
            <CheckCircle className="text-[#a78bfa] shrink-0" size={18} />
            {t("login.feature1", "소셜 계정으로 간편하게 시작")}
          </div>
          <div className="flex items-center gap-2.5 text-sm text-white">
            <CheckCircle className="text-[#a78bfa] shrink-0" size={18} />
            {t("login.feature2", "음원 업로드 및 스트리밍 기능 무료 이용")}
          </div>
          <div className="flex items-center gap-2.5 text-sm text-white">
            <CheckCircle className="text-[#a78bfa] shrink-0" size={18} />
            {t("login.feature3", "커뮤니티 참여 및 다른 아티스트와 소통")}
          </div>
        </div>

        {/* 통계 */}
        <div className="grid grid-cols-3 gap-4 pt-4 border-t border-white/10 text-center">
          <div>
            <p className="text-lg font-bold text-white">10K+</p>
            <p className="text-xs text-white/60 mt-0.5">{t("login.statArtists", "아티스트")}</p>
          </div>
          <div>
            <p className="text-lg font-bold text-white">50K+</p>
            <p className="text-xs text-white/60 mt-0.5">{t("login.statTracks", "음원")}</p>
          </div>
          <div>
            <p className="text-lg font-bold text-white">100K+</p>
            <p className="text-xs text-white/60 mt-0.5">{t("login.statListeners", "리스너")}</p>
          </div>
        </div>

        {/* 약관 */}
        <p className="text-center text-xs text-white/60">
          {t("login.agreementPrefix", "로그인/회원가입 시")}{" "}
          <Link href="/legal" className="underline hover:text-white" data-testid="link-terms">
            {t("login.terms", "이용약관")}
          </Link>{" "}
          {t("login.and", "및")}{" "}
          <Link href="/legal" className="underline hover:text-white" data-testid="link-privacy">
            {t("login.privacy", "개인정보처리방침")}
          </Link>
          {t("login.agreementSuffix", "에 동의합니다.")}
        </p>
      </div>
    </div>
  );
}
