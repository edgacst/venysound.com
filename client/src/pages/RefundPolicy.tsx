import { Navigation } from "@/components/Navigation";
import { Footer } from "@/components/Footer";
import { useEffect } from "react";
import { PageTransition } from "@/components/PageTransition";
import { useTranslation } from "react-i18next";

const SECTIONS = [
  { titleKey: "refundPolicy.s1Title", contentKey: "refundPolicy.s1Content" },
  { titleKey: "refundPolicy.s2Title", contentKey: "refundPolicy.s2Content" },
  { titleKey: "refundPolicy.s3Title", contentKey: "refundPolicy.s3Content" },
  { titleKey: "refundPolicy.s4Title", contentKey: "refundPolicy.s4Content" },
  { titleKey: "refundPolicy.s5Title", contentKey: "refundPolicy.s5Content" },
  { titleKey: "refundPolicy.s6Title", contentKey: "refundPolicy.s6Content" },
  { titleKey: "refundPolicy.s7Title", contentKey: "refundPolicy.s7Content" },
  { titleKey: "refundPolicy.s8Title", contentKey: "refundPolicy.s8Content" },
];

export default function RefundPolicy() {
  const { t } = useTranslation();

  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  return (
    <PageTransition>
      <div className="min-h-screen bg-background flex flex-col pb-24">
        <Navigation />
        <div className="container max-w-3xl px-4 py-12">
          <h1 className="text-3xl font-bold mb-2" data-testid="text-refund-policy-title">
            {t("refundPolicy.title")}
          </h1>
          <p className="text-sm text-muted-foreground mb-8">{t("refundPolicy.effectiveDate")}</p>

          <div className="space-y-8 text-muted-foreground">
            {SECTIONS.map(({ titleKey, contentKey }) => (
              <section key={titleKey}>
                <h2 className="text-lg font-bold text-foreground mb-3">{t(titleKey)}</h2>
                <div className="text-sm leading-relaxed whitespace-pre-line">{t(contentKey)}</div>
              </section>
            ))}

            <div className="border-t border-white/10 pt-6 text-sm space-y-1">
              <p className="font-medium text-foreground">{t("refundPolicy.contactTitle")}</p>
              <p>{t("refundPolicy.companyName")}</p>
              <p>{t("refundPolicy.contact")}</p>
              <p className="mt-3">{t("refundPolicy.effectiveDate")}</p>
            </div>
          </div>
        </div>
        <Footer />
      </div>
    </PageTransition>
  );
}
