import { useState } from "react";
import { Link, useLocation } from "wouter";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { Music, Eye, EyeOff, User, Mail, Lock } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";

export default function Register() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const [form, setForm] = useState({ username: "", email: "", password: "", confirmPassword: "" });
  const [agreeTerms, setAgreeTerms] = useState(false);
  const [agreePrivacy, setAgreePrivacy] = useState(false);
  const [showPw, setShowPw] = useState(false);
  const [showPw2, setShowPw2] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const { data: loginOptions } = useQuery({
    queryKey: ["/api/auth/login-options"],
    queryFn: () => fetch("/api/auth/login-options").then((r) => r.json()),
  });

  if (user) {
    setLocation("/");
    return null;
  }

  const validate = () => {
    const e: Record<string, string> = {};
    if (!form.username) e.username = t("register.errUsernameRequired", "아이디를 입력해주세요.");
    else if (form.username.length < 3) e.username = t("register.errUsernameShort", "아이디는 3자 이상이어야 합니다.");
    if (!form.email) e.email = t("register.errEmailRequired", "이메일을 입력해주세요.");
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) e.email = t("register.errEmailInvalid", "올바른 이메일 형식이 아닙니다.");
    if (!form.password) e.password = t("register.errPasswordRequired", "비밀번호를 입력해주세요.");
    else if (form.password.length < 6) e.password = t("register.errPasswordShort", "비밀번호는 6자 이상이어야 합니다.");
    if (!form.confirmPassword) e.confirmPassword = t("register.errConfirmRequired", "비밀번호를 한 번 더 입력해주세요.");
    else if (form.password !== form.confirmPassword) e.confirmPassword = t("register.errPasswordMismatch", "비밀번호가 일치하지 않습니다.");
    if (!agreeTerms) e.agreeTerms = t("register.errAgreeTerms", "이용약관에 동의해 주세요.");
    if (!agreePrivacy) e.agreePrivacy = t("register.errAgreePrivacy", "개인정보처리방침에 동의해 주세요.");
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    setLoading(true);
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        toast({ title: t("register.successTitle", "회원가입 완료!"), description: t("register.successDesc", "환영합니다! 로그인되었습니다.") });
        window.location.href = "/";
      } else {
        toast({ title: t("register.failTitle", "회원가입 실패"), description: data.error || t("login.tryAgain", "다시 시도해주세요."), variant: "destructive" });
      }
    } catch {
      toast({ title: t("login.serverError", "오류"), description: t("login.serverErrorDesc", "서버에 연결할 수 없습니다."), variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const inputClass = "w-full bg-zinc-800 border border-zinc-600 rounded-lg px-4 py-3 text-white placeholder-zinc-500 focus:outline-none focus:border-purple-500 text-sm";
  const socialBtn = "w-full flex items-center justify-center gap-3 py-4 text-sm rounded-lg bg-zinc-800 border border-zinc-600 text-white hover:bg-zinc-700 transition-colors";

  return (
    <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center px-4 py-10">
      <div className="w-full max-w-md">
        {/* 브랜드 */}
        <div className="flex flex-col items-center text-center mb-8">
          <Link href="/">
            <div className="w-14 h-14 rounded-xl bg-[#7c3aed] flex items-center justify-center mb-3 cursor-pointer">
              <Music className="text-white" size={28} />
            </div>
          </Link>
          <h1 className="text-2xl font-bold text-white">Veny Sound</h1>
          <p className="text-sm text-zinc-400 mt-1">{t("register.createAccount", "새 계정 만들기")}</p>
        </div>

        {/* 소셜 로그인 */}
        <div className="space-y-3 mb-6">
          {loginOptions?.hasGoogle && (
            <a href="/api/auth/google" className="block">
              <button type="button" className={socialBtn}>
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
            <a href="/api/auth/naver" className="block">
              <button type="button" className={socialBtn}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                  <rect width="24" height="24" rx="4" fill="#03C75A" />
                  <path d="M13.5 12.6L10.2 7.5H7.5v9h3.3v-5.1l3.3 5.1H16.5v-9h-3v5.1z" fill="white" />
                </svg>
                {t("login.continueWithNaver", "네이버로 계속하기")}
              </button>
            </a>
          )}
          {loginOptions?.hasKakao && (
            <a href="/api/auth/kakao" className="block">
              <button type="button" className={socialBtn}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                  <rect width="24" height="24" rx="4" fill="#FEE500" />
                  <path d="M12 6C8.13 6 5 8.52 5 11.6c0 1.96 1.3 3.68 3.26 4.65l-.83 3.04c-.07.25.22.45.44.31l3.55-2.36c.19.01.38.03.58.03 3.87 0 7-2.52 7-5.63S15.87 6 12 6z" fill="#3C1E1E" />
                </svg>
                {t("login.continueWithKakao", "카카오로 계속하기")}
              </button>
            </a>
          )}
          {loginOptions?.hasFacebook && (
            <a href="/api/auth/facebook" className="block">
              <button type="button" className={socialBtn}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                  <rect width="24" height="24" rx="4" fill="#1877F2" />
                  <path d="M16.67 15.13l.55-3.57h-3.43V9.38c0-.98.48-1.93 2.01-1.93h1.56V4.56s-1.41-.24-2.76-.24c-2.82 0-4.66 1.71-4.66 4.81v2.72H7v3.57h2.94v8.62c.59.09 1.19.14 1.81.14s1.22-.05 1.81-.14v-8.62h2.47l.64.01z" fill="white" />
                </svg>
                {t("login.continueWithFacebook", "Facebook으로 계속하기")}
              </button>
            </a>
          )}
        </div>

        {/* 구분선 */}
        <div className="relative mb-6">
          <div className="absolute inset-0 flex items-center">
            <span className="w-full border-t border-zinc-700" />
          </div>
          <div className="relative flex justify-center">
            <span className="bg-zinc-950 px-3 text-xs text-zinc-500">{t("register.orSignUpWithEmail", "또는 이메일로 가입")}</span>
          </div>
        </div>

        {/* 회원가입 폼 */}
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* 아이디 */}
          <div>
            <label className="block text-sm text-zinc-400 mb-1.5">{t("register.usernameLabel", "아이디")}</label>
            <div className="relative">
              <User className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" size={16} />
              <input
                type="text"
                placeholder={t("register.usernamePlaceholder", "사용할 아이디 입력 (3자 이상)")}
                value={form.username}
                onChange={(e) => setForm({ ...form, username: e.target.value })}
                className={`${inputClass} pl-9`}
              />
            </div>
            {errors.username && <p className="text-red-400 text-xs mt-1">{errors.username}</p>}
          </div>

          {/* 이메일 */}
          <div>
            <label className="block text-sm text-zinc-400 mb-1.5">{t("register.emailLabel", "이메일")}</label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" size={16} />
              <input
                type="email"
                placeholder={t("register.emailPlaceholder", "이메일 주소 입력")}
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                className={`${inputClass} pl-9`}
              />
            </div>
            {errors.email && <p className="text-red-400 text-xs mt-1">{errors.email}</p>}
          </div>

          {/* 비밀번호 */}
          <div>
            <label className="block text-sm text-zinc-400 mb-1.5">{t("login.passwordPlaceholder", "비밀번호")}</label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" size={16} />
              <input
                type={showPw ? "text" : "password"}
                placeholder={t("register.passwordPlaceholder", "비밀번호 입력 (6자 이상)")}
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                className={`${inputClass} pl-9 pr-10`}
              />
              <button type="button" onClick={() => setShowPw(!showPw)} className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300">
                {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
            {errors.password && <p className="text-red-400 text-xs mt-1">{errors.password}</p>}
          </div>

          {/* 비밀번호 확인 */}
          <div>
            <label className="block text-sm text-zinc-400 mb-1.5">{t("register.confirmPasswordLabel", "비밀번호 확인")}</label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" size={16} />
              <input
                type={showPw2 ? "text" : "password"}
                placeholder={t("register.confirmPasswordPlaceholder", "비밀번호 다시 입력")}
                value={form.confirmPassword}
                onChange={(e) => setForm({ ...form, confirmPassword: e.target.value })}
                className={`${inputClass} pl-9 pr-10`}
              />
              <button type="button" onClick={() => setShowPw2(!showPw2)} className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300">
                {showPw2 ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
            {errors.confirmPassword && <p className="text-red-400 text-xs mt-1">{errors.confirmPassword}</p>}
          </div>

          {/* 약관 동의 */}
          <div className="space-y-3 pt-1">
            <label className="flex items-start gap-3 cursor-pointer text-sm text-zinc-400">
              <input
                type="checkbox"
                checked={agreeTerms}
                onChange={(e) => setAgreeTerms(e.target.checked)}
                className="mt-1 rounded border-zinc-600 bg-zinc-800 text-purple-500 focus:ring-purple-500"
              />
              <span>
                <Link href="/legal" target="_blank" rel="noopener noreferrer" className="underline hover:text-zinc-300">{t("footer.terms")}</Link>
                {t("register.agreeRequired", "에 동의합니다 (필수)")}
              </span>
            </label>
            {errors.agreeTerms && <p className="text-red-400 text-xs">{errors.agreeTerms}</p>}
            <label className="flex items-start gap-3 cursor-pointer text-sm text-zinc-400">
              <input
                type="checkbox"
                checked={agreePrivacy}
                onChange={(e) => setAgreePrivacy(e.target.checked)}
                className="mt-1 rounded border-zinc-600 bg-zinc-800 text-purple-500 focus:ring-purple-500"
              />
              <span>
                <Link href="/privacy" target="_blank" rel="noopener noreferrer" className="underline hover:text-zinc-300">{t("footer.privacy")}</Link>
                {t("register.agreeRequired", "에 동의합니다 (필수)")}
              </span>
            </label>
            {errors.agreePrivacy && <p className="text-red-400 text-xs">{errors.agreePrivacy}</p>}
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-[#7c3aed] hover:bg-[#6d28d9] text-white font-semibold py-3 rounded-lg transition-colors disabled:opacity-60 mt-2"
          >
            {loading ? t("register.registering", "가입 중...") : t("login.register", "회원가입")}
          </button>
        </form>

        {/* 로그인 링크 */}
        <p className="text-center text-sm text-zinc-500 mt-6">
          {t("register.alreadyHaveAccount", "이미 계정이 있으신가요?")}{" "}
          <Link href="/login" className="text-purple-400 hover:text-purple-300 font-medium">
            {t("login.loginButton", "로그인")}
          </Link>
        </p>

        {/* 약관 */}
        <p className="text-center text-xs text-zinc-600 mt-4">
          {t("login.agreementPrefix", "로그인/회원가입 시")}{" "}
          <Link href="/legal" className="underline hover:text-zinc-400">{t("login.terms", "이용약관")}</Link>
          {" "}{t("login.and", "및")}{" "}
          <Link href="/privacy" className="underline hover:text-zinc-400">{t("login.privacy", "개인정보처리방침")}</Link>
          {t("login.agreementSuffix", "에 동의합니다.")}
        </p>
      </div>
    </div>
  );
}
