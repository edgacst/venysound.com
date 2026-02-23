import { Link, useLocation } from "wouter";
import { useLoginModalStore } from "@/stores/login-modal";
import { useAuth } from "@/hooks/use-auth";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import logoImage from "@assets/image_3fb5572f_1771157735033.png";
import { 
  Home, 
  Music, 
  Users, 
  Upload, 
  User, 
  LogOut, 
  Bell,
  Search,
  Menu,
  X,
  TrendingUp,
  Info,
  ShieldCheck,
  Crown,
  Coins,
  BarChart3,
  MessageSquare,
  Globe,
  Download
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuTrigger,
  DropdownMenuSeparator
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { useNotifications } from "@/hooks/use-user-profile";
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

export function Navigation() {
  const { t, i18n } = useTranslation();
  const { user, logout } = useAuth();
  const [location] = useLocation();
  const { data: notifications } = useNotifications();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const { data: adminCheck } = useQuery<{ isAdmin: boolean }>({
    queryKey: ["/api/admin/check"],
    enabled: !!user,
  });

  const { data: creditsData } = useQuery<{ credits: number }>({
    queryKey: ["/api/credits"],
    enabled: !!user,
  });

  const unreadCount = notifications?.filter(n => !n.isRead).length || 0;

  const openLoginModal = useLoginModalStore((s) => s.open);
  const { data: unreadMsgData } = useQuery<{ count: number }>({
    queryKey: ["/api/messages/unread-count"],
    enabled: !!user,
    refetchInterval: 15000,
  });
  const unreadMsgCount = unreadMsgData?.count || 0;

  const isActive = (path: string) => location === path;

  const NavLink = ({ href, icon: Icon, children }: { href: string; icon: any; children: React.ReactNode }) => (
    <Link href={href}>
      <div
        data-testid={`nav-link-${href.replace(/\//g, '') || 'home'}`}
        className={`
        flex items-center gap-2 px-4 py-2 rounded-full transition-all duration-200 cursor-pointer
        ${isActive(href) 
          ? "bg-primary text-primary-foreground shadow-lg shadow-primary/25 font-semibold" 
          : "text-muted-foreground hover:bg-secondary hover:text-foreground"
        }
      `}>
        <Icon size={18} />
        <span>{children}</span>
      </div>
    </Link>
  );

  return (
    <nav className="sticky top-0 z-40 w-full border-b border-white/5 bg-background/80 backdrop-blur-xl">
      <div className="container flex h-16 items-center justify-between gap-4 px-4">
        <Link href="/">
          <div className="relative flex items-center gap-2 cursor-pointer group" data-testid="nav-logo">
            <img src={logoImage} alt="Veny Sound" className="h-10 w-auto rounded-md bg-white/10 p-0.5" />
            <span className="text-xl font-display font-bold">
              <span className="bg-clip-text text-transparent bg-gradient-to-r from-purple-400 via-pink-500 to-purple-400">Veny</span>
              <span className="bg-clip-text text-transparent bg-gradient-to-r from-yellow-300 via-amber-400 to-orange-400">_Sound</span>
            </span>
            <div className="invisible group-hover:visible absolute top-full left-0 mt-2 z-50 p-2 bg-card border border-white/10 rounded-lg shadow-xl" data-testid="logo-preview-popup">
              <img src={logoImage} alt="Veny Sound Logo" className="w-48 h-48 object-contain rounded-md" />
            </div>
          </div>
        </Link>

        <div className="hidden md:flex items-center gap-1">
          <NavLink href="/" icon={Home}>{t('nav.home')}</NavLink>
          <NavLink href="/music" icon={Search}>{t('nav.musicList')}</NavLink>
          <NavLink href="/popular" icon={TrendingUp}>{t('nav.popular')}</NavLink>
          <NavLink href="/community" icon={Users}>{t('nav.community')}</NavLink>
          <NavLink href="/about" icon={Info}>{t('nav.about')}</NavLink>
          <NavLink href="/pricing" icon={Crown}>{t('nav.premium')}</NavLink>
        </div>

        <div className="hidden md:flex items-center gap-4">
          {user ? (
            <>
              <Link href="/upload">
                <Button size="sm" className="gap-2 bg-secondary text-foreground border border-white/10" data-testid="button-upload">
                  <Upload size={16} />
                  {t('nav.upload')}
                </Button>
              </Link>
              
              <Link href="/messages">
                <div className="relative p-2 rounded-full hover:bg-secondary/50 cursor-pointer transition-colors" data-testid="link-messages">
                  <MessageSquare size={20} className="text-muted-foreground" />
                  {unreadMsgCount > 0 && (
                    <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] flex items-center justify-center bg-primary text-white text-[10px] font-bold rounded-full px-1 border-2 border-background" data-testid="badge-unread-msg-count">
                      {unreadMsgCount > 99 ? "99+" : unreadMsgCount}
                    </span>
                  )}
                </div>
              </Link>

              <Link href="/notifications">
                <div className="relative p-2 rounded-full hover:bg-secondary/50 cursor-pointer transition-colors" data-testid="link-notifications">
                  <Bell size={20} className="text-muted-foreground" />
                  {unreadCount > 0 && (
                    <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] flex items-center justify-center bg-red-500 text-white text-[10px] font-bold rounded-full px-1 border-2 border-background" data-testid="badge-notification-count">
                      {unreadCount > 99 ? "99+" : unreadCount}
                    </span>
                  )}
                </div>
              </Link>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="sm" className="gap-1 text-muted-foreground" data-testid="button-language-toggle">
                    <Globe size={16} />
                    {i18n.language === 'ko' ? 'KO' : i18n.language === 'en' ? 'EN' : i18n.language === 'zh' ? 'ZH' : 'JA'}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => i18n.changeLanguage('ko')}>🇰🇷 {t('language.ko')}</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => i18n.changeLanguage('en')}>🇺🇸 {t('language.en')}</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => i18n.changeLanguage('zh')}>🇨🇳 {t('language.zh')}</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => i18n.changeLanguage('ja')}>🇯🇵 {t('language.ja')}</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Avatar className="cursor-pointer ring-2 ring-transparent hover:ring-primary transition-all" data-testid="button-user-menu">
                    <AvatarImage src={user.profileImageUrl || undefined} />
                    <AvatarFallback>{user.firstName?.[0] || "U"}</AvatarFallback>
                  </Avatar>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56 bg-card border-white/10">
                  <div className="flex items-center gap-2 p-2">
                    <div className="flex flex-col space-y-1">
                      <p className="text-sm font-medium leading-none flex items-center gap-1.5 flex-wrap">
                        {user.firstName || t('nav.user')}{t('nav.userSuffix')}
                        {(user as any).subscriptionTier === "premium" && (
                          <span className="inline-flex items-center text-[10px] px-1.5 py-0.5 rounded bg-yellow-600/20 text-yellow-400">
                            <Crown size={10} className="mr-0.5" />Premium
                          </span>
                        )}
                      </p>
                      <p className="text-xs leading-none text-muted-foreground">{user.email}</p>
                    </div>
                  </div>
                  <DropdownMenuSeparator className="bg-white/10" />
                  <DropdownMenuItem asChild>
                    <Link href={`/profile/${user.id}`}>
                      <div className="flex items-center gap-2 cursor-pointer w-full" data-testid="link-mypage">
                        <User size={16} /> {t('nav.myPage')}
                      </div>
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link href="/credits">
                      <div className="flex items-center justify-between cursor-pointer w-full" data-testid="link-credits">
                        <span className="flex items-center gap-2"><Coins size={16} /> {t('nav.credits')}</span>
                        <span className="text-xs font-medium text-primary" data-testid="text-nav-credits">{(creditsData?.credits || 0).toLocaleString()}C</span>
                      </div>
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link href="/my-library">
                      <div className="flex items-center gap-2 cursor-pointer w-full" data-testid="link-my-library">
                        <Download size={16} /> 내 라이브러리
                      </div>
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link href="/dashboard">
                      <div className="flex items-center gap-2 cursor-pointer w-full" data-testid="link-dashboard">
                        <BarChart3 size={16} /> {t('nav.dashboard')}
                      </div>
                    </Link>
                  </DropdownMenuItem>
                  {adminCheck?.isAdmin && (
                    <DropdownMenuItem asChild>
                      <Link href="/admin">
                        <div className="flex items-center gap-2 cursor-pointer w-full" data-testid="link-admin">
                          <ShieldCheck size={16} /> {t('nav.admin')}
                        </div>
                      </Link>
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuItem onClick={() => logout()} className="text-red-400 focus:text-red-400" data-testid="button-logout">
                    <LogOut size={16} className="mr-2" /> {t('nav.logout')}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </>
          ) : (
            <>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="sm" className="gap-1 text-muted-foreground" data-testid="button-language-toggle">
                    <Globe size={16} />
                    {i18n.language === 'ko' ? 'KO' : i18n.language === 'en' ? 'EN' : i18n.language === 'zh' ? 'ZH' : 'JA'}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => i18n.changeLanguage('ko')}>🇰🇷 {t('language.ko')}</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => i18n.changeLanguage('en')}>🇺🇸 {t('language.en')}</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => i18n.changeLanguage('zh')}>🇨🇳 {t('language.zh')}</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => i18n.changeLanguage('ja')}>🇯🇵 {t('language.ja')}</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              <Button onClick={openLoginModal} data-testid="button-login">{t('nav.login')}</Button>
            </>
          )}
        </div>

        <button 
          className="md:hidden p-2 text-muted-foreground hover:text-foreground"
          onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
          data-testid="button-mobile-menu"
        >
          {isMobileMenuOpen ? <X /> : <Menu />}
        </button>
      </div>

      <AnimatePresence>
        {isMobileMenuOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="md:hidden border-t border-white/10 bg-background"
          >
            <div className="flex flex-col p-4 gap-2">
              <NavLink href="/" icon={Home}>{t('nav.home')}</NavLink>
              <NavLink href="/music" icon={Search}>{t('nav.musicList')}</NavLink>
              <NavLink href="/popular" icon={TrendingUp}>{t('nav.popular')}</NavLink>
              <NavLink href="/community" icon={Users}>{t('nav.community')}</NavLink>
              <NavLink href="/about" icon={Info}>{t('nav.about')}</NavLink>
              <NavLink href="/pricing" icon={Crown}>{t('nav.premium')}</NavLink>
              {user && (
                <>
                  <NavLink href="/upload" icon={Upload}>{t('nav.upload')}</NavLink>
                  <Link href="/credits">
                    <div
                      data-testid="nav-link-credits-mobile"
                      className={`
                        flex items-center justify-between px-4 py-2 rounded-full transition-all duration-200 cursor-pointer
                        ${isActive("/credits") 
                          ? "bg-primary text-primary-foreground shadow-lg shadow-primary/25 font-semibold" 
                          : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                        }
                      `}>
                      <span className="flex items-center gap-2"><Coins size={18} /> {t('nav.credits')}</span>
                      <span className="text-xs font-medium text-primary" data-testid="text-mobile-credits">{(creditsData?.credits || 0).toLocaleString()}C</span>
                    </div>
                  </Link>
                  <Link href="/messages">
                    <div className="flex items-center justify-between px-4 py-2 text-muted-foreground cursor-pointer hover:bg-secondary hover:text-foreground rounded-full" data-testid="nav-link-mobile-messages">
                      <span className="flex items-center gap-2"><MessageSquare size={18} /> {t('nav.messages')}</span>
                      {unreadMsgCount > 0 && (
                        <Badge variant="default" className="text-xs min-w-5 h-5" data-testid="badge-mobile-unread-msg">{unreadMsgCount}</Badge>
                      )}
                    </div>
                  </Link>
                  <NavLink href={`/profile/${user.id}`} icon={User}>{t('nav.myPage')}</NavLink>
                  <NavLink href="/my-library" icon={Download}>내 라이브러리</NavLink>
                  <NavLink href="/dashboard" icon={BarChart3}>{t('nav.dashboard')}</NavLink>
                  {adminCheck?.isAdmin && (
                    <NavLink href="/admin" icon={ShieldCheck}>{t('nav.admin')}</NavLink>
                  )}
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="sm" className="gap-1 text-muted-foreground justify-start w-full" data-testid="button-language-toggle">
                        <Globe size={16} />
                        {t(`language.${['ko','ja','zh','en'].find(l => (i18n.language || '').startsWith(l)) || 'en'}`)}
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start">
                      <DropdownMenuItem onClick={() => i18n.changeLanguage('ko')}>🇰🇷 {t('language.ko')}</DropdownMenuItem>
                      <DropdownMenuItem onClick={() => i18n.changeLanguage('en')}>🇺🇸 {t('language.en')}</DropdownMenuItem>
                      <DropdownMenuItem onClick={() => i18n.changeLanguage('zh')}>🇨🇳 {t('language.zh')}</DropdownMenuItem>
                      <DropdownMenuItem onClick={() => i18n.changeLanguage('ja')}>🇯🇵 {t('language.ja')}</DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                  <div 
                    onClick={() => logout()} 
                    className="flex items-center gap-2 px-4 py-2 text-red-400 cursor-pointer"
                  >
                    <LogOut size={18} />
                    <span>{t('nav.logout')}</span>
                  </div>
                </>
              )}
              {!user && (
                <>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="sm" className="gap-1 text-muted-foreground justify-start w-full" data-testid="button-language-toggle-guest">
                        <Globe size={16} />
                        {t(`language.${['ko','ja','zh','en'].find(l => (i18n.language || '').startsWith(l)) || 'en'}`)}
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start">
                      <DropdownMenuItem onClick={() => i18n.changeLanguage('ko')}>🇰🇷 {t('language.ko')}</DropdownMenuItem>
                      <DropdownMenuItem onClick={() => i18n.changeLanguage('en')}>🇺🇸 {t('language.en')}</DropdownMenuItem>
                      <DropdownMenuItem onClick={() => i18n.changeLanguage('zh')}>🇨🇳 {t('language.zh')}</DropdownMenuItem>
                      <DropdownMenuItem onClick={() => i18n.changeLanguage('ja')}>🇯🇵 {t('language.ja')}</DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                  <div
                    onClick={openLoginModal}
                    className="flex items-center gap-2 px-4 py-2 text-primary cursor-pointer"
                  >
                    <User size={18} />
                    <span>{t('nav.login')}</span>
                  </div>
                </>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </nav>
  );
}
