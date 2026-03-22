import { Navigation } from "@/components/Navigation";
import { Footer } from "@/components/Footer";
import { useEffect } from "react";
import { PageTransition } from "@/components/PageTransition";
import { useSearch } from "wouter";
import { useTranslation } from "react-i18next";

const SECTIONS = [
  { titleKey: "privacy.s1Title", contentKey: "privacy.s1Content" },
  { titleKey: "privacy.s2Title", contentKey: "privacy.s2Content" },
  { titleKey: "privacy.s3Title", contentKey: "privacy.s3Content" },
  { titleKey: "privacy.s4Title", contentKey: "privacy.s4Content" },
  { titleKey: "privacy.s5Title", contentKey: "privacy.s5Content" },
  { titleKey: "privacy.s6Title", contentKey: "privacy.s6Content" },
  { titleKey: "privacy.s7Title", contentKey: "privacy.s7Content" },
  { titleKey: "privacy.s9Title", contentKey: "privacy.s9Content" },
  { titleKey: "privacy.deletionTitle", contentKey: "privacy.deletionContent" },
];

export default function Privacy() {
  const { t } = useTranslation();
  const search = useSearch();
  const params = new URLSearchParams(search);
  const deletionCode = params.get("deletion");

  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  return (
    <PageTransition>
      <div className="min-h-screen bg-background flex flex-col pb-24">
        <Navigation />
        <div className="container max-w-3xl px-4 py-12">
          <h1 className="text-3xl font-bold mb-2" data-testid="text-privacy-title">
            {t("privacy.title")}
          </h1>
          <p className="text-sm text-foreground leading-relaxed mb-4">{t("privacy.scopeIntro")}</p>
          <p className="text-sm text-muted-foreground mb-8">{t("privacy.effectiveDate")}</p>

          {deletionCode && (
            <div className="mb-8 p-4 rounded-lg bg-green-500/10 border border-green-500/30 text-green-200">
              <p className="font-medium">{t("privacy.deletionReceived")}</p>
              <p className="text-sm mt-1">{t("privacy.deletionCodeLabel")}: {deletionCode}</p>
              <p className="text-sm mt-2 text-white/80">{t("privacy.deletionReceivedDesc")}</p>
            </div>
          )}

          <div className="space-y-8 text-muted-foreground">
            {SECTIONS.map(({ titleKey, contentKey }) => (
              <section key={titleKey}>
                <h2 className="text-lg font-bold text-foreground mb-3">{t(titleKey)}</h2>
                <div className="text-sm leading-relaxed whitespace-pre-line">{t(contentKey)}</div>
              </section>
            ))}

            <div className="border-t border-white/10 pt-6 text-sm space-y-1">
              <p className="font-medium text-foreground">{t("privacy.s8Title")}</p>
              <p>{t("privacy.companyName")}</p>
              <p>{t("privacy.ceo")}</p>
              <p>{t("privacy.contact")}</p>
              <p className="mt-3">{t("privacy.effectiveDate")}</p>
            </div>
          </div>
        </div>
        <Footer />
      </div>
    </PageTransition>
  );
}
