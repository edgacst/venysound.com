import { Navigation } from "@/components/Navigation";
import { Footer } from "@/components/Footer";
import { MusicCard } from "@/components/MusicCard";
import { usePlayerStore } from "@/components/AudioPlayer";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, Play, TrendingUp, Clock, Heart } from "lucide-react";
import { PageTransition } from "@/components/PageTransition";
import { useAuth } from "@/hooks/use-auth";
import { useTranslation } from 'react-i18next';

function formatTime(seconds: number, t: any): string {
  if (seconds < 60) return t('popular.seconds', { count: seconds });
  const m = Math.floor(seconds / 60);
  if (m < 60) return t('popular.minutes', { count: m });
  const h = Math.floor(m / 60);
  return t('popular.hours', { h, m: m % 60 });
}

export default function Popular() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { data: popularList, isLoading } = useQuery<any[]>({
    queryKey: ["/api/music/popular"],
  });
  const { playMusic } = usePlayerStore();

  return (
    <PageTransition>
      <div className="min-h-screen bg-background flex flex-col pb-24">
        <Navigation />
      
        <div className="container px-4 py-6 md:py-8">
        <div className="mb-6 flex flex-col items-start justify-between gap-4 md:mb-8 md:flex-row md:items-center md:flex-wrap">
          <div className="flex items-center gap-3">
            <TrendingUp className="text-red-400" size={24} />
            <h1 className="text-2xl font-display font-bold leading-tight text-slate-950 dark:text-foreground md:text-3xl" data-testid="text-popular-title">{t('popular.title')}</h1>
          </div>
          {user && popularList && popularList.length > 0 && (
            <Button 
              variant="outline"
              className="h-10 gap-2 border-slate-200 bg-white text-slate-950 shadow-sm dark:border-white/10 dark:bg-transparent dark:text-foreground"
              onClick={() => {
                if (popularList[0]) playMusic(popularList[0].id);
              }}
              data-testid="button-play-all-popular"
            >
              <Play size={16} />
              {t('popular.playAll')}
            </Button>
          )}
        </div>

        <div className="mb-5 flex items-center gap-2 overflow-x-auto whitespace-nowrap text-xs font-semibold text-muted-foreground md:mb-6 md:gap-4 md:text-sm">
          <span className="flex items-center gap-1"><Heart size={14} className="text-red-400" /> {t('popular.likes')}</span>
          <span>+</span>
          <span className="flex items-center gap-1"><Clock size={14} className="text-primary" /> {t('popular.streamTime')}</span>
          <span>{t('popular.sortBy')}</span>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-20">
            <Loader2 className="animate-spin text-primary" size={40} />
          </div>
        ) : !popularList || popularList.length === 0 ? (
          <div className="text-center py-20 text-muted-foreground bg-secondary/30 rounded-lg" data-testid="text-no-popular">
            {t('popular.noPopular')}
          </div>
        ) : (
          <div className="music-grid grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3 md:gap-6 lg:grid-cols-4 xl:grid-cols-5">
            {popularList.map((music, index) => (
              <div key={music.id} className="relative" data-testid={`card-popular-${music.id}`}>
                {index < 3 && (
                  <Badge className="absolute -top-2 -left-2 z-10 bg-red-500 text-white border-none text-xs px-2">
                    TOP {index + 1}
                  </Badge>
                )}
                {index >= 3 && index < 10 && (
                  <Badge variant="secondary" className="absolute -top-2 -left-2 z-10 text-xs px-2">
                    {index + 1}
                  </Badge>
                )}
                <MusicCard music={music} />
                <div className="mt-1 flex items-center justify-between px-1 text-xs text-muted-foreground md:mt-2">
                  <span className="flex items-center gap-1" data-testid={`text-likes-${music.id}`}>
                    <Heart size={10} className="text-red-400" /> {music.likeCount}
                  </span>
                  <span className="flex items-center gap-1" data-testid={`text-streams-${music.id}`}>
                    <Clock size={10} className="text-primary" /> {formatTime(music.streamSeconds, t)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      <Footer />
      </div>
    </PageTransition>
  );
}
