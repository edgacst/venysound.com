import { Navigation } from "@/components/Navigation";
import { Footer } from "@/components/Footer";
import { useEffect } from "react";
import { PageTransition } from "@/components/PageTransition";
import { useTranslation } from "react-i18next";

export default function PrivacyPolicy() {
  const { t } = useTranslation();
  useEffect(() => { window.scrollTo(0, 0); }, []);

  const sections: { key: string; contentKey: string }[] = [
    { key: "privacy.purposeTitle", contentKey: "privacy.purposeContent" },
    { key: "privacy.itemsTitle", contentKey: "privacy.itemsContent" },
    { key: "privacy.retentionTitle", contentKey: "privacy.retentionContent" },
    { key: "privacy.destructionTitle", contentKey: "privacy.destructionContent" },
    { key: "privacy.safetyTitle", contentKey: "privacy.safetyContent" },
    { key: "privacy.rightsTitle", contentKey: "privacy.rightsContent" },
    { key: "privacy.officerTitle", contentKey: "privacy.officerContent" },
    { key: "privacy.accessTitle", contentKey: "privacy.accessContent" },
    { key: "privacy.reliefTitle", contentKey: "privacy.reliefContent" },
    { key: "privacy.changesTitle", contentKey: "privacy.changesContent" },
  ];

  return (
    <PageTransition>
      <div className="min-h-screen bg-background flex flex-col pb-24">
        <Navigation />
        <div className="container max-w-3xl px-4 py-12">
          <h1 className="text-3xl font-display font-bold mb-2" data-testid="text-privacy-title">
            {t("privacy.title")}
          </h1>
          <p className="text-sm text-muted-foreground mb-8">{t("privacy.intro")}</p>

          <div className="space-y-8 text-muted-foreground">
            {sections.map(({ key, contentKey }) => (
              <section key={key}>
                <h2 className="text-xl font-bold text-foreground mb-3">{t(key)}</h2>
                <div className="whitespace-pre-line">{t(contentKey)}</div>
              </section>
            ))}

            <div className="border-t border-white/5 pt-6 text-sm">
              <p>{t("privacy.effectiveDate")}</p>
              <p className="mt-2">{t("privacy.contact")}</p>
            </div>
          </div>
        </div>
        <Footer />
      </div>
    </PageTransition>
  );
}
