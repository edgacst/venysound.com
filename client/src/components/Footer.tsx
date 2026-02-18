import { Link } from "wouter";
import { useTranslation } from "react-i18next";
import logoImage from "@assets/image_3fb5572f_1771157735033.png";

export function Footer() {
  const { t } = useTranslation();
  return (
    <footer className="border-t border-white/5 bg-card mt-auto">
      <div className="container px-4 py-12">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          <div>
            <h5 className="font-bold text-lg mb-3 flex items-center gap-2">
              <img src={logoImage} alt="Veny Sound" className="h-7 w-auto rounded bg-white/10 p-0.5" />
              <span className="font-display font-bold">
                <span className="bg-clip-text text-transparent bg-gradient-to-r from-purple-400 via-pink-500 to-purple-400">Veny</span>
                <span className="bg-clip-text text-transparent bg-gradient-to-r from-yellow-300 via-amber-400 to-orange-400">_Sound</span>
              </span>
            </h5>
            <p className="text-sm text-muted-foreground">{t('footer.tagline')}<br/>{t('footer.tagline2')}</p>
            <p className="text-sm text-muted-foreground mt-1">{t('footer.company')}</p>
            <p className="text-sm text-muted-foreground">{t('footer.ceo')}</p>
          </div>
          <div>
            <h5 className="font-bold mb-3">{t('footer.quickLinks')}</h5>
            <ul className="space-y-1 text-sm text-muted-foreground">
              <li><Link href="/about"><span className="hover:text-foreground cursor-pointer">{t('nav.about')}</span></Link></li>
              <li><Link href="/music"><span className="hover:text-foreground cursor-pointer">{t('nav.musicList')}</span></Link></li>
              <li><Link href="/popular"><span className="hover:text-foreground cursor-pointer">{t('nav.popular')}</span></Link></li>
              <li><Link href="/legal"><span className="hover:text-foreground cursor-pointer">{t('footer.termsAndPrivacy')}</span></Link></li>
            </ul>
          </div>
          <div>
            <h5 className="font-bold mb-3">{t('footer.support')}</h5>
            <ul className="space-y-1 text-sm text-muted-foreground">
              <li><Link href="/faq"><span className="hover:text-foreground cursor-pointer">FAQ</span></Link></li>
              <li>freecompr@naver.com</li>
              <li>010-8447-9973</li>
              <li>{t('footer.address')}</li>
            </ul>
          </div>
        </div>
        <div className="border-t border-white/5 mt-8 pt-6 text-center text-sm text-muted-foreground">
          &copy; 2026 Veny_Sound. All rights reserved.
        </div>
      </div>
    </footer>
  );
}
