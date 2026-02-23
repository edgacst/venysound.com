import { Navigation } from "@/components/Navigation";
import { Footer } from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useQuery } from "@tanstack/react-query";
import { Music, FileWarning, CheckCircle } from "lucide-react";

export default function FileGuide() {
  const { data, isLoading } = useQuery({
    queryKey: ["/api/music/missing-files"],
    queryFn: () => fetch("/api/music/missing-files").then((r) => r.json()),
  });

  return (
    <div className="min-h-screen bg-background">
      <Navigation />
      <main className="container max-w-3xl mx-auto px-4 py-8">
        <Card className="border-white/10 bg-card/80">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Music className="w-6 h-6" />
              기존 음원 파일 연결 가이드
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-muted-foreground">
              DB에 등록된 곡 중 로컬에 파일이 없는 곡 목록입니다. 기존에 보관한 음원 파일을
              <code className="mx-1 px-1.5 py-0.5 rounded bg-muted">local-uploads/uploads/</code>
              폴더에 넣어주세요.
            </p>

            {isLoading ? (
              <p>불러오는 중...</p>
            ) : data?.missing === 0 ? (
              <div className="flex items-center gap-2 text-green-500">
                <CheckCircle size={20} />
                모든 음원 파일이 존재합니다.
              </div>
            ) : (
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">
                  총 {data?.total}곡 중 {data?.missing}곡이 파일이 없습니다.
                </p>
                <div className="max-h-80 overflow-y-auto rounded-md border border-white/10">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/50 sticky top-0">
                      <tr>
                        <th className="px-3 py-2 text-left">곡</th>
                        <th className="px-3 py-2 text-left">아티스트</th>
                        <th className="px-3 py-2 text-left">저장할 파일명</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data?.list?.map((m: any) => (
                        <tr key={m.id} className="border-t border-white/5">
                          <td className="px-3 py-2">{m.title}</td>
                          <td className="px-3 py-2">{m.artist}</td>
                          <td className="px-3 py-2 font-mono text-xs">
                            {m.saveAs || "(확인 필요)"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  위 표의 파일명으로 프로젝트 폴더의 <code>local-uploads/uploads/</code> 에 저장하세요.
                </p>
              </div>
            )}

            <div className="pt-4 border-t border-white/10">
              <h4 className="font-medium mb-2 flex items-center gap-2">
                <FileWarning size={18} />
                파일 연결 방법
              </h4>
              <ol className="list-decimal list-inside text-sm text-muted-foreground space-y-1">
                <li>위 표의 파일명으로 저장된 MP3/WAV/OGG 파일 준비</li>
                <li>프로젝트 폴더의 <code>local-uploads/uploads/</code> 에 복사</li>
                <li>파일명을 표와 동일하게 저장 (예: abc123-uuid.mp3)</li>
              </ol>
            </div>
          </CardContent>
        </Card>
      </main>
      <Footer />
    </div>
  );
}
