import { Navigation } from "@/components/Navigation";
import { Footer } from "@/components/Footer";
import { useEffect } from "react";
import { PageTransition } from "@/components/PageTransition";
import { useTranslation } from "react-i18next";
export default function About() {
  const { t } = useTranslation();
  useEffect(() => { window.scrollTo(0, 0); }, []);
  return (
    <PageTransition>
      <div className="min-h-screen bg-background flex flex-col pb-24">
        <Navigation />
        <div className="container max-w-3xl px-4 py-12">
          <h1 className="text-3xl font-display font-bold mb-6">{t("about.title", "About")}</h1>
          <p className="text-muted-foreground whitespace-pre-line">{t("about.content", "About Veny Sound.")}</p>
        </div>
        <Footer />
      </div>
    </PageTransition>
  );
}
