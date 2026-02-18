import { Navigation } from "@/components/Navigation";
import { Footer } from "@/components/Footer";
import { useEffect } from "react";
import { PageTransition } from "@/components/PageTransition";
import { useTranslation } from 'react-i18next';

export default function Legal() {
  const { t } = useTranslation();
  useEffect(() => { window.scrollTo(0, 0); }, []);
  return (
    <PageTransition>
      <div className="min-h-screen bg-background flex flex-col pb-24">
        <Navigation />
        <div className="container max-w-3xl px-4 py-12">
        <h1 className="text-3xl font-display font-bold mb-8" data-testid="text-legal-title">{t('legal.title')}</h1>
        
        <div className="space-y-8 text-muted-foreground">
          <section>
            <h2 className="text-xl font-bold text-foreground mb-3">{t('legal.article1')}</h2>
            <p>{t('legal.article1Content')}</p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-foreground mb-3">{t('legal.article2')}</h2>
            <p>{t('legal.article2Content')}</p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-foreground mb-3">{t('legal.article3')}</h2>
            <p>{t('legal.article3Content')}</p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-foreground mb-3">{t('legal.article4')}</h2>
            <p>{t('legal.article4Content')}</p>
          </section>

          <div className="border-t border-white/5 pt-6 text-sm">
            <p>{t('legal.effectiveDate')}</p>
            <p className="mt-2">{t('legal.contact')}</p>
          </div>
        </div>
      </div>
      <Footer />
      </div>
    </PageTransition>
  );
}
