import { useState, Fragment, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Navigation } from "@/components/Navigation";
import { Footer } from "@/components/Footer";
import { Card } from "@/components/ui/card";
import { ChevronDown, ChevronUp, Eye } from "lucide-react";

type SiteAnnouncement = {
  id: number;
  content: string;
  imageUrl: string | null;
  showAsPopup?: boolean;
  viewCount?: number;
  startsAt: string;
  endsAt: string;
  createdAt: string;
};

/** 목록용 짧은 제목: 첫 줄만, 앞 # 제거, 최대 길이 제한 */
function listTitle(content: string, maxLen = 40) {
  const firstLine = content.split(/\r?\n/)[0]?.replace(/^#+\s*/, "").replace(/\s+/g, " ").trim() ?? "";
  return firstLine.length <= maxLen ? firstLine : firstLine.slice(0, maxLen) + "…";
}

export default function Notices() {
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const locale = i18n.language === "ja" ? "ja-JP" : i18n.language === "en" ? "en-US" : i18n.language === "zh" ? "zh-CN" : "ko-KR";
  const { data, isLoading } = useQuery<SiteAnnouncement[]>({
    queryKey: ["/api/announcements/site"],
    queryFn: async () => {
      const res = await fetch("/api/announcements/site");
      if (!res.ok) return [];
      return res.json();
    },
  });

  const recordView = useCallback(
    (id: number) => {
      fetch(`/api/announcements/site/${id}/view`, { method: "POST", credentials: "include" })
        .then((res) => res.ok && res.json())
        .then((body) => {
          if (body?.viewCount != null) {
            queryClient.setQueryData<SiteAnnouncement[]>(["/api/announcements/site"], (prev) =>
              prev?.map((a) => (a.id === id ? { ...a, viewCount: body.viewCount } : a)) ?? []
            );
          }
        })
        .catch(() => {});
    },
    [queryClient]
  );

  const toggleExpand = useCallback(
    (id: number) => {
      setExpandedId((prev) => {
        const next = prev === id ? null : id;
        if (next === id) recordView(id);
        return next;
      });
    },
    [recordView]
  );

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
        <h1 className="text-2xl font-display font-bold mb-2">{t("noticesPage.title")}</h1>
        <p className="text-sm text-muted-foreground mb-6">{t("noticesPage.subtitle")}</p>

        {isLoading ? (
          <p className="text-muted-foreground">{t("noticesPage.loading")}</p>
        ) : list.length === 0 ? (
          <p className="text-muted-foreground">{t("noticesPage.empty")}</p>
        ) : (
          <Card className="overflow-hidden">
            {/* 모바일: 카드 목록 */}
            <div className="block md:hidden divide-y divide-border">
              {list.map((a, idx) => {
                const isActive = a.startsAtDate <= now && a.endsAtDate >= now;
                const isExpanded = expandedId === a.id;
                return (
                  <div
                    key={a.id}
                    className="p-4 active:bg-muted/20"
                    onClick={() => toggleExpand(a.id)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => e.key === "Enter" && toggleExpand(a.id)}
                  >
                    <div className="flex items-start gap-2">
                      <span className="text-muted-foreground text-xs shrink-0 w-6">{list.length - idx}</span>
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-foreground line-clamp-1">{listTitle(a.content)}</p>
                        <div className="flex items-center gap-2 mt-1 flex-wrap">
                          <span className="text-xs text-muted-foreground">
                            {new Date(a.createdAt).toLocaleDateString(locale, { year: "numeric", month: "short", day: "numeric" })}
                          </span>
                          {typeof a.viewCount === "number" && (
                            <span className="text-xs text-muted-foreground inline-flex items-center gap-0.5">
                              <Eye size={12} />
                              {a.viewCount.toLocaleString()}
                            </span>
                          )}
                          {isActive ? (
                            <span className="inline-flex px-2 py-0.5 rounded-full bg-green-500/10 text-green-400 text-xs">{t("noticesPage.statusActive")}</span>
                          ) : (
                            <span className="text-muted-foreground text-xs">{t("noticesPage.statusEnded")}</span>
                          )}
                        </div>
                      </div>
                      {isExpanded ? <ChevronUp size={18} className="text-muted-foreground shrink-0" /> : <ChevronDown size={18} className="text-muted-foreground shrink-0" />}
                    </div>
                    {isExpanded && (
                      <div className="mt-4 pt-3 border-t border-border/50">
                        <div className="whitespace-pre-wrap text-foreground text-sm mb-3">{a.content}</div>
                        {a.imageUrl && (
                          <img src={a.imageUrl.startsWith("http") ? a.imageUrl : (typeof window !== "undefined" ? window.location.origin : "") + a.imageUrl} alt="" className="max-w-full rounded-lg max-h-64 object-contain mt-2" />
                        )}
                        <p className="text-xs text-muted-foreground">
                          {t("noticesPage.exposurePeriod")}: {a.startsAtDate.toLocaleString(locale)} ~ {a.endsAtDate.toLocaleString(locale)}
                        </p>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* 데스크톱: 테이블 */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/40">
                    <th className="text-left p-3 font-medium w-12 whitespace-nowrap">{t("noticesPage.no")}</th>
                    <th className="text-left p-3 font-medium max-w-[280px]">{t("noticesPage.subject")}</th>
                    <th className="text-left p-3 font-medium whitespace-nowrap min-w-[7.5rem]">{t("noticesPage.date")}</th>
                    <th className="text-center p-3 font-medium whitespace-nowrap">{t("noticesPage.viewCount", "조회수")}</th>
                    <th className="text-center p-3 font-medium whitespace-nowrap">{t("noticesPage.status")}</th>
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
                          className="border-b border-border/50 hover:bg-muted/20 cursor-pointer"
                          onClick={() => toggleExpand(a.id)}
                        >
                          <td className="p-3 text-muted-foreground">{list.length - idx}</td>
                          <td className="p-3 font-medium max-w-[280px]">
                            <span className="line-clamp-1 block" title={listTitle(a.content, 200)}>{listTitle(a.content)}</span>
                          </td>
                          <td className="p-3 text-muted-foreground whitespace-nowrap">
                            {new Date(a.createdAt).toLocaleDateString(locale, { year: "numeric", month: "short", day: "numeric" })}
                          </td>
                          <td className="p-3 text-center whitespace-nowrap text-muted-foreground">
                            {typeof a.viewCount === "number" ? (
                              <span className="inline-flex items-center justify-center gap-1">
                                <Eye size={14} />
                                {a.viewCount.toLocaleString()}
                              </span>
                            ) : (
                              "-"
                            )}
                          </td>
                          <td className="p-3 text-center whitespace-nowrap">
                            {isActive ? (
                              <span className="inline-flex px-2 py-0.5 rounded-full bg-green-500/10 text-green-400 text-xs">{t("noticesPage.statusActive")}</span>
                            ) : (
                              <span className="text-muted-foreground text-xs">{t("noticesPage.statusEnded")}</span>
                            )}
                          </td>
                          <td className="p-3">{isExpanded ? <ChevronUp size={16} className="text-muted-foreground" /> : <ChevronDown size={16} className="text-muted-foreground" />}</td>
                        </tr>
                        {isExpanded && (
                          <tr className="bg-muted/10">
                            <td colSpan={6} className="p-4">
                              <div className="whitespace-pre-wrap text-foreground mb-3">{a.content}</div>
                              {a.imageUrl && (
                                <img src={a.imageUrl.startsWith("http") ? a.imageUrl : (typeof window !== "undefined" ? window.location.origin : "") + a.imageUrl} alt="" className="max-w-full rounded-lg max-h-64 object-contain mt-2" />
                              )}
                              <p className="text-xs text-muted-foreground">
                                {t("noticesPage.exposurePeriod")}: {a.startsAtDate.toLocaleString(locale)} ~ {a.endsAtDate.toLocaleString(locale)}
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


