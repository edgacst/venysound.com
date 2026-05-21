import { Navigation } from "@/components/Navigation";
import { Footer } from "@/components/Footer";
import { PageTransition } from "@/components/PageTransition";
import { Link } from "wouter";

const PREVIEW_IMAGE = "/playlist-studio-preview.png";

export default function PlaylistStudio() {
  return (
    <PageTransition>
      <div className="min-h-screen bg-background flex flex-col pb-24">
        <Navigation />
        <main className="container max-w-6xl px-4 py-10 space-y-8">
          <header className="space-y-3 text-center sm:text-left">
            <p className="text-sm text-muted-foreground">venysound.com · Audio visual studio</p>
            <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold leading-tight">
              YouTube Playlist Studio
            </h1>
            <p className="text-sm text-muted-foreground max-w-2xl">
              오디오를 시각 콘텐츠로 만드는 캔버스. 플레이리스트·파형·캔버스 설정을 한 화면에서 미리 볼 수 있는
              스튜디오 UI입니다.
            </p>
          </header>

          <figure className="rounded-xl border border-border/70 overflow-hidden bg-card/30 shadow-lg">
            <img
              src={PREVIEW_IMAGE}
              alt="YouTube Playlist Studio — 오디오 비주얼 스튜디오 화면 미리보기"
              className="w-full h-auto block"
              loading="lazy"
              decoding="async"
            />
            <figcaption className="px-4 py-3 text-xs text-muted-foreground border-t border-border/60">
              Playlist Studio 화면 구성: 라이선스·오디오 업로드, 재생 프리뷰, 파형·캔버스 프리셋
            </figcaption>
          </figure>

          <section
            className="rounded-xl border border-border/70 bg-card/40 px-5 py-5 sm:px-6"
            aria-label="신청 및 문의 안내"
          >
            <ol className="list-decimal space-y-3 pl-5 text-sm leading-relaxed text-foreground/90 sm:text-base">
              <li>
                신청은{" "}
                <Link
                  href="/community"
                  className="font-medium text-primary underline underline-offset-2 hover:opacity-90"
                >
                  커뮤니티 자유게시판
                </Link>
                에 신청하시면 회원가입시 이메일로 보내드립니다.
              </li>
              <li>
                사용 방법에 대해 궁금하신 사항은{" "}
                <Link
                  href="/community"
                  className="font-medium text-primary underline underline-offset-2 hover:opacity-90"
                >
                  게시판
                </Link>
                에 문의 바랍니다.
              </li>
            </ol>
          </section>
        </main>
        <Footer />
      </div>
    </PageTransition>
  );
}
