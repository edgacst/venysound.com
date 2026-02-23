import { Navigation } from "@/components/Navigation";
import { Footer } from "@/components/Footer";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { useEffect } from "react";
import { PageTransition } from "@/components/PageTransition";
import { useTranslation } from 'react-i18next';

const faqKeys = [1, 2, 3, 4, 5, 6, 7];

export default function FAQ() {
  const { t } = useTranslation();
  useEffect(() => { window.scrollTo(0, 0); }, []);
  return (
    <PageTransition>
      <div className="min-h-screen bg-background flex flex-col pb-24">
        <Navigation />
        <div className="container max-w-3xl px-4 py-12">
        <h1 className="text-3xl font-display font-bold mb-8" data-testid="text-faq-title">{t('faq.title')}</h1>
        
        <Accordion type="single" collapsible className="space-y-2">
          {faqKeys.map((num, index) => (
            <AccordionItem key={index} value={`item-${index}`} className="border border-white/5 rounded-lg px-4 bg-card/50">
              <AccordionTrigger className="text-left" data-testid={`faq-question-${index}`}>
                {t(`faq.q${num}`)}
              </AccordionTrigger>
              <AccordionContent className="text-muted-foreground">
                {t(`faq.a${num}`)}
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </div>
      <Footer />
      </div>
    </PageTransition>
  );
}
