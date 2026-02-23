import { Navigation } from "@/components/Navigation";
import { Footer } from "@/components/Footer";
import { useEffect } from "react";
import { PageTransition } from "@/components/PageTransition";
import { useTranslation } from "react-i18next";

const LEGAL_ARTICLE_KEYS = [
  "article1", "article2", "article3", "article4", "article5", "article6",
  "article7", "article8", "article9", "article10", "article11", "article12",
  "article13", "article14", "article15", "article16", "article17", "article18",
  "article19", "article20", "article21", "article22", "article23", "article24",
];

export default function Legal() {
  const { t } = useTranslation();
  useEffect(() => { window.scrollTo(0, 0); }, []);

  return (
    <PageTransition>
      <div className="min-h-screen bg-background flex flex-col pb-24">
        <Navigation />
        <div className="container max-w-3xl px-4 py-12">
          <h1 className="text-3xl font-display font-bold mb-2" data-testid="text-legal-title">
            {t("legal.title")}
          </h1>
          <p className="text-sm text-muted-foreground mb-8">{t("legal.intro")}</p>

          <div className="space-y-8 text-muted-foreground">
            {LEGAL_ARTICLE_KEYS.map((key) => {
              const content = t(`legal.${key}Content`);
              if (!content || content === `legal.${key}Content`) return null;
              return (
                <section key={key}>
                  <h2 className="text-xl font-bold text-foreground mb-3">{t(`legal.${key}`)}</h2>
                  <div className="whitespace-pre-line">{content}</div>
                </section>
              );
            })}

            <div className="border-t border-white/5 pt-6 text-sm">
              <p>{t("legal.effectiveDate")}</p>
              <p className="mt-2">{t("legal.contact")}</p>
            </div>
          </div>
        </div>
        <Footer />
      </div>
    </PageTransition>
  );
}
