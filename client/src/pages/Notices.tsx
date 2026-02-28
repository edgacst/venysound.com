import { useState, Fragment } from "react";
import { useQuery } from "@tanstack/react-query";
import { Navigation } from "@/components/Navigation";
import { Footer } from "@/components/Footer";
import { Card } from "@/components/ui/card";
import { ChevronDown, ChevronUp } from "lucide-react";

type SiteAnnouncement = {
  id: number;
  content: string;
  imageUrl: string | null;
  showAsPopup?: boolean;
  startsAt: string;
  endsAt: string;
  createdAt: string;
};

function excerpt(text: string, maxLen = 80) {
  const one = text.replace(/\s+/g, " ").trim();
  return one.length <= maxLen ? one : one.slice(0, maxLen) + "…";
}

export default function Notices() {
  const [expandedId, setExpandedId] = useState<number | null>(null);
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
        <h1 className="text-2xl font-display font-bold mb-2">공지사항</h1>
        <p className="text-sm text-muted-foreground mb-6">업데이트 소식과 공지를 확인하세요.</p>

        {isLoading ? (
          <p className="text-muted-foreground">불러오는 중입니다...</p>
        ) : list.length === 0 ? (
          <p className="text-muted-foreground">등록된 공지사항이 없습니다.</p>
        ) : (
          <Card className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/40">
                    <th className="text-left p-3 font-medium w-12">번호</th>
                    <th className="text-left p-3 font-medium">제목</th>
                    <th className="text-left p-3 font-medium w-28">게시일</th>
                    <th className="text-center p-3 font-medium w-20">상태</th>
                    <th className="w-10" />
                  </tr>
                </thead>
                <tbody>
                  {list.map((a, idx) => {
                    const isActive = a.startsAtDate <= now && a.endsAtDate >= now;
                    const isExpanded = expandedId === a.id;
                    return (
                      <Fragment key={a.id}>
                        <tr
                          key={a.id}
                          className="border-b border-border/50 hover:bg-muted/20 cursor-pointer"
                          onClick={() => setExpandedId(isExpanded ? null : a.id)}
                        >
                          <td className="p-3 text-muted-foreground">{list.length - idx}</td>
                          <td className="p-3 font-medium">{excerpt(a.content)}</td>
                          <td className="p-3 text-muted-foreground">
                            {new Date(a.createdAt).toLocaleDateString("ko-KR", { year: "numeric", month: "short", day: "numeric" })}
                          </td>
                          <td className="p-3 text-center">
                            {isActive ? (
                              <span className="inline-flex px-2 py-0.5 rounded-full bg-green-500/10 text-green-400 text-xs">진행 중</span>
                            ) : (
                              <span className="text-muted-foreground text-xs">종료</span>
                            )}
                          </td>
                          <td className="p-3">{isExpanded ? <ChevronUp size={16} className="text-muted-foreground" /> : <ChevronDown size={16} className="text-muted-foreground" />}</td>
                        </tr>
                        {isExpanded && (
                          <tr className="bg-muted/10">
                            <td colSpan={5} className="p-4">
                              <div className="whitespace-pre-wrap text-foreground mb-3">{a.content}</div>
                              {a.imageUrl && (
                                <img src={a.imageUrl.startsWith("http") ? a.imageUrl : (typeof window !== "undefined" ? window.location.origin : "") + a.imageUrl} alt="" className="max-w-full rounded-lg max-h-64 object-contain mt-2" />
                              )}
                              <p className="text-xs text-muted-foreground">
                                노출 기간: {a.startsAtDate.toLocaleString("ko-KR")} ~ {a.endsAtDate.toLocaleString("ko-KR")}
                              </p>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        )}
      </main>
      <Footer />
    </div>
  );
}


