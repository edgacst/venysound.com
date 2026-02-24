import { Navigation } from "@/components/Navigation";
import { Footer } from "@/components/Footer";
import { useEffect } from "react";
import { PageTransition } from "@/components/PageTransition";
import { useTranslation } from 'react-i18next';

export default function Legal() {
  const { t } = useTranslation();
  useEffect(() => { window.scrollTo(0, 0); }, []);

  const articles = [
    { key: "article1", title: t('legal.article1') },
    { key: "article2", title: t('legal.article2') },
    { key: "article3", title: t('legal.article3') },
    { key: "article4", title: t('legal.article4') },
    { key: "article5", title: t('legal.article5') },
    { key: "article6", title: t('legal.article6') },
    { key: "article7", title: t('legal.article7') },
    { key: "article8", title: t('legal.article8') },
    { key: "article9", title: t('legal.article9') },
    { key: "article10", title: t('legal.article10') },
    { key: "article11", title: t('legal.article11') },
    { key: "article12", title: t('legal.article12') },
    { key: "article13", title: t('legal.article13') },
    { key: "article14", title: t('legal.article14') },
    { key: "article15", title: t('legal.article15') },
    { key: "article16", title: t('legal.article16') },
    { key: "article17", title: t('legal.article17') },
    { key: "article18", title: t('legal.article18') },
    { key: "article19", title: t('legal.article19') },
    { key: "article20", title: t('legal.article20') },
  ];

  return (
    <PageTransition>
      <div className="min-h-screen bg-background flex flex-col pb-24">
        <Navigation />
        <div className="container max-w-3xl px-4 py-12">
          <h1 className="text-3xl font-bold mb-2" data-testid="text-legal-title">
            {t('legal.title')}
          </h1>
          <p className="text-sm text-muted-foreground mb-8">{t('legal.effectiveDate')}</p>

          {/* 목차 */}
          <div className="bg-white/5 rounded-xl p-5 mb-10 border border-white/10">
            <h2 className="text-sm font-semibold text-foreground mb-3">{t('legal.tableOfContents')}</h2>
            <ul className="grid grid-cols-1 sm:grid-cols-2 gap-1 text-sm text-muted-foreground">
              {articles.map((a) => (
                <li key={a.key}>
                  <a href={`#${a.key}`} className="hover:text-foreground transition-colors">
                    {a.title}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          {/* 조항 본문 */}
          <div className="space-y-10 text-muted-foreground">
            {articles.map((a) => (
              <section key={a.key} id={a.key}>
                <h2 className="text-lg font-bold text-foreground mb-3">{a.title}</h2>
                <div className="text-sm leading-relaxed whitespace-pre-line">
                  {t(`legal.${a.key}Content`)}
                </div>
              </section>
            ))}

            <div className="border-t border-white/10 pt-6 text-sm space-y-1">
              <p className="font-medium text-foreground">{t('legal.companyInfo')}</p>
              <p>{t('legal.companyName')}</p>
              <p>{t('legal.ceo')}</p>
              <p>{t('legal.contact')}</p>
              <p className="mt-3 text-muted-foreground">{t('legal.effectiveDate')}</p>
            </div>
          </div>
        </div>
        <Footer />
      </div>
    </PageTransition>
  );
}
