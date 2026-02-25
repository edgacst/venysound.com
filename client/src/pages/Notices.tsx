import { useQuery } from "@tanstack/react-query";
import { Navigation } from "@/components/Navigation";
import { Footer } from "@/components/Footer";

type SiteAnnouncement = {
  id: number;
  content: string;
  imageUrl: string | null;
  startsAt: string;
  endsAt: string;
  createdAt: string;
};

export default function Notices() {
  const { data, isLoading } = useQuery<SiteAnnouncement[]>({
    queryKey: ["/api/announcements/site"],
    queryFn: async () => {
      const res = await fetch("/api/announcements/site");
      if (!res.ok) return [];
      return res.json();
    },
  });

  const now = new Date();
  const list = (data ?? []).map((a) => ({
    ...a,
    startsAtDate: new Date(a.startsAt),
    endsAtDate: new Date(a.endsAt),
  }));

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Navigation />
      <main className="container flex-1 px-4 py-10">
        <h1 className="text-2xl font-display font-bold mb-4">공지사항</h1>

        {isLoading ? (
          <p className="text-muted-foreground">불러오는 중입니다...</p>
        ) : list.length === 0 ? (
          <p className="text-muted-foreground">등록된 공지사항이 없습니다.</p>
        ) : (
          <div className="space-y-4">
            {list.map((a) => {
              const isActive = a.startsAtDate <= now && a.endsAtDate >= now;
              return (
                <article
                  key={a.id}
                  className="border border-border rounded-lg p-4 bg-card/60"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 space-y-2">
                      <p className="text-sm whitespace-pre-wrap text-foreground">
                        {a.content}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        게시일{" "}
                        {new Date(a.createdAt).toLocaleString("ko-KR", {
                          year: "numeric",
                          month: "numeric",
                          day: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                        {isActive && (
                          <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded-full bg-green-500/10 text-green-400 text-[11px]">
                            진행 중
                          </span>
                        )}
                      </p>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </main>
      <Footer />
    </div>
  );
}


