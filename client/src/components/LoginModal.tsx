import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Music, CheckCircle, User, Eye, EyeOff, Loader2 } from "lucide-react";
import { Link } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { useLoginModalStore } from "@/stores/login-modal";
import { useToast } from "@/hooks/use-toast";

export function LoginModal() {
  const { t } = useTranslation();
  const { user, isLoading } = useAuth();
  const { isOpen, close } = useLoginModalStore();
  const { toast } = useToast();
  const [devLoggingIn, setDevLoggingIn] = useState(false);
  const [form, setForm] = useState({ username: "", password: "" });
  const [showPw, setShowPw] = useState(false);
  const [localLoading, setLocalLoading] = useState(false);

  const { data: loginOptions } = useQuery({
    queryKey: ["/api/auth/login-options"],
    queryFn: () => fetch("/api/auth/login-options").then((r) => r.json()),
    enabled: isOpen,
  });

  const optionsLoaded = !!loginOptions;
  const hasAnyOAuth = loginOptions && (loginOptions.hasGoogle || loginOptions.hasNaver || loginOptions.hasKakao || loginOptions.hasFacebook || loginOptions.hasTikTok);

  useEffect(() => {
    if (!isLoading && user) close();
  }, [isLoading, user, close]);

  // 모달 닫히면 폼 초기화
  useEffect(() => {
    if (!isOpen) {
      setForm({ username: "", password: "" });
      setShowPw(false);
    }
  }, [isOpen]);

  const handleDevLogin = async () => {
    setDevLoggingIn(true);
    try {
      const res = await fetch("/api/auth/dev-login", { method: "POST", credentials: "include" });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.success) {
        toast({ title: t("login.loginSuccess", "로그인되었습니다") });
        setTimeout(() => { window.location.href = "/"; }, 800);
      } else {
        toast({ title: t("login.loginFailed", "로그인 실패"), description: data.error || t("login.loginFailedDesc"), variant: "destructive" });
        setDevLoggingIn(false);
      }
    } catch {
      setDevLoggingIn(false);
    }
  };

  const handleLocalLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.username || !form.password) {
      toast({ title: t("login.inputError", "입력 오류"), description: t("login.inputErrorDesc", "아이디와 비밀번호를 입력해주세요."), variant: "destructive" });
      return;
    }
    setLocalLoading(true);
    try {
      const res = await fetch("/api/auth/local-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ username: form.username, password: form.password }),
      });
      const data = await res.json().catch(() => ({}));
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

  const socialBtn =
    "w-full flex items-center justify-center gap-3 py-3 text-sm rounded-lg bg-[#2d2d2d] border border-[#555] text-white hover:bg-[#3d3d3d] min-h-[44px] transition-colors";

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && close()}>
      <DialogContent
        className="max-w-[420px] w-[calc(100%-2rem)] !gap-0 !border-[#333] !bg-[#1a1a1a] !p-6 !text-white sm:rounded-xl [&>button]:hidden overflow-y-auto max-h-[90vh]"
        aria-describedby={undefined}
      >
        <div className="flex flex-col items-center w-full">
          {/* 로고 */}
          <div className="flex flex-col items-center text-center mb-5">
            <div className="w-12 h-12 rounded-xl bg-[#7c3aed] flex items-center justify-center mb-2">
              <Music className="text-white" size={24} strokeWidth={2} />
            </div>
            <h2 className="text-xl font-bold text-white" data-testid="text-login-title">
              Veny Sound
            </h2>
            <p className="text-xs text-white/70 mt-1">
              {t("login.subtitle", "음악으로 연결되는 우리만의 공간")}
            </p>
          </div>

          {/* 아이디/비번 로그인 폼 */}
          <form onSubmit={handleLocalLogin} className="w-full space-y-2.5 mb-4">
            <div>
              <input
                type="text"
                placeholder={t("login.usernamePlaceholder", "아이디 또는 이메일")}
                value={form.username}
                onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))}
                autoComplete="username"
                className="w-full bg-[#2d2d2d] border border-[#555] text-white placeholder-white/40 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-[#7c3aed] transition-colors"
                data-testid="input-modal-username"
              />
            </div>
            <div className="relative">
              <input
                type={showPw ? "text" : "password"}
                placeholder={t("login.passwordPlaceholder", "비밀번호")}
                value={form.password}
                onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                autoComplete="current-password"
                className="w-full bg-[#2d2d2d] border border-[#555] text-white placeholder-white/40 rounded-lg px-4 py-2.5 pr-10 text-sm focus:outline-none focus:border-[#7c3aed] transition-colors"
                data-testid="input-modal-password"
              />
              <button
                type="button"
                onClick={() => setShowPw((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white/70"
              >
                {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
            <button
              type="submit"
              disabled={localLoading}
              className="w-full flex items-center justify-center gap-2 py-2.5 text-sm rounded-lg bg-[#7c3aed] text-white hover:bg-[#6d28d9] disabled:opacity-70 transition-colors font-medium"
              data-testid="button-modal-local-login"
            >
              {localLoading ? <Loader2 size={16} className="animate-spin" /> : null}
              {localLoading ? t("login.loggingIn", "로그인 중...") : t("login.loginButton", "로그인")}
            </button>
          </form>

          {/* 구분선 */}
          <div className="relative w-full my-3">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t border-white/20" />
            </div>
            <div className="relative flex justify-center">
              <span className="bg-[#1a1a1a] px-3 text-xs text-white/50">{t("login.socialLogin", "소셜 로그인")}</span>
            </div>
          </div>

          {/* 소셜 로그인 버튼 */}
          <div className="w-full space-y-2">
            {optionsLoaded && !hasAnyOAuth && (
              <button
                type="button"
                onClick={handleDevLogin}
                disabled={devLoggingIn}
                className="w-full flex items-center justify-center gap-3 py-3 text-sm rounded-lg bg-[#7c3aed] text-white hover:bg-[#6d28d9] min-h-[44px] disabled:opacity-70 transition-colors"
              >
                <User size={18} />
                {devLoggingIn ? t("login.loggingIn", "로그인 중...") : t("login.devLogin", "개발용 로그인 (로컬 테스트)")}
              </button>
            )}
            {loginOptions?.hasGoogle && (
              <a href="/api/auth/google" className="block" data-testid="link-google-login">
                <button type="button" className={socialBtn} data-testid="button-login-google">
                  <svg width="18" height="18" viewBox="0 0 24 24">
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
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
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
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
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
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
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
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                    <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-1-.05A6.33 6.33 0 0 0 5 20.1a6.34 6.34 0 0 0 10.86-4.43v-7a8.16 8.16 0 0 0 4.77 1.52v-3.4a4.85 4.85 0 0 1-1-.1z" fill="currentColor"/>
                  </svg>
                  {t("login.continueWithTikTok", "TikTok으로 계속하기")}
                </button>
              </a>
            )}
          </div>

          {/* 회원가입 링크 */}
          <div className="w-full mt-4 pt-4 border-t border-white/10 flex items-center justify-center gap-2 text-sm">
            <span className="text-white/50">{t("login.noAccount", "계정이 없으신가요?")}</span>
            <Link
              href="/register"
              onClick={close}
              className="text-[#a78bfa] hover:text-white font-medium transition-colors"
              data-testid="link-modal-register"
            >
              {t("login.register", "회원가입")}
            </Link>
          </div>

          {/* 약관 */}
          <p className="text-center text-xs text-white/40 mt-3 leading-relaxed">
            {t("login.agreementPrefix", "로그인/회원가입 시")}{" "}
            <a href="/legal" className="underline hover:text-white/70">
              {t("login.terms", "이용약관")}
            </a>{" "}
            {t("login.and", "및")}{" "}
            <a href="/legal" className="underline hover:text-white/70">
              {t("login.privacy", "개인정보처리방침")}
            </a>
            {t("login.agreementSuffix", "에 동의합니다.")}
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
