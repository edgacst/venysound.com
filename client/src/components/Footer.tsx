import { Link } from "wouter";
import { useTranslation } from "react-i18next";
import logoImage from "@assets/image_3fb5572f_1771157735033.png";
export function Footer() {
  const { t } = useTranslation();
  return (
    <footer className="border-t border-white/5 bg-card mt-auto text-[11px] text-muted-foreground leading-4">
      <div className="container px-4 py-5">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          <div>
            <div className="flex items-center gap-1.5 mb-1.5">
              <img src={logoImage} alt="Veny Sound" className="h-4 w-auto rounded bg-white/10 p-0.5" />
              <span className="font-bold">
                <span className="bg-clip-text text-transparent bg-gradient-to-r from-purple-400 via-pink-500 to-purple-400">Veny</span>
                <span className="bg-clip-text text-transparent bg-gradient-to-r from-yellow-300 via-amber-400 to-orange-400">_Sound</span>
              </span>
            </div>
            <ul className="space-y-0">
              <li>{t('footer.company')}</li>
              <li>{t('footer.businessNumber')}</li>
              <li>{t('footer.ceo')}</li>
              <li>온라인음악서비스 제2026-000001호</li>
            </ul>
          </div>
          <div>
            <p className="font-semibold mb-1">{t('footer.quickLinks')}</p>
            <ul className="space-y-0">
              <li><Link href="/legal"><span className="hover:text-foreground cursor-pointer">{t('footer.terms')}</span></Link></li>
              <li><Link href="/privacy"><span className="hover:text-foreground cursor-pointer">{t('footer.privacy')}</span></Link></li>
              <li><Link href="/refund-policy"><span className="hover:text-foreground cursor-pointer">{t('footer.refundPolicy')}</span></Link></li>
              <li><Link href="/guide"><span className="hover:text-foreground cursor-pointer">{t('nav.guide', '이용안내')}</span></Link></li>
            </ul>
          </div>
          <div>
            <p className="font-semibold mb-1">{t('footer.support')}</p>
            <ul className="space-y-0">
              <li><Link href="/faq"><span className="hover:text-foreground cursor-pointer">FAQ</span></Link></li>
              <li>freecompr@naver.com</li>
              <li className="whitespace-normal break-words">{t("footer.devInquiry")}</li>
              <li>{t('footer.address')} {t('footer.address2')}</li>
            </ul>
          </div>
        </div>
        <div className="border-t border-white/5 mt-4 pt-3 text-center">
          &copy; 2026 Veny_Sound. All rights reserved.
        </div>
      </div>
    </footer>
  );
}
