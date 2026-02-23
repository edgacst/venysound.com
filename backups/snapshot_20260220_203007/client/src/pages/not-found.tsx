import { Navigation } from "@/components/Navigation";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import { Home } from "lucide-react";
import { useTranslation } from 'react-i18next';

export default function NotFound() {
  const { t } = useTranslation();

  return (
    <div className="min-h-screen bg-background">
      <Navigation />
      <div className="flex flex-col items-center justify-center py-32 px-4">
        <h1 className="text-6xl font-display font-bold text-primary mb-4">404</h1>
        <p className="text-xl text-muted-foreground mb-8">{t('common.notFound')}</p>
        <Link href="/">
          <Button className="gap-2" data-testid="button-go-home">
            <Home size={18} />
            {t('common.goHome')}
          </Button>
        </Link>
      </div>
    </div>
  );
}
