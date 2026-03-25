import { Navigation } from "@/components/Navigation";
import { Footer } from "@/components/Footer";
import { PageTransition } from "@/components/PageTransition";
import { Link } from "wouter";

export default function GlobalDistributionGuide() {
  return (
    <PageTransition>
      <div className="min-h-screen bg-background flex flex-col pb-24">
        <Navigation />
        <main className="container max-w-4xl px-4 py-10 space-y-8">
          <header className="space-y-3">
            <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold leading-tight break-words">
              글로벌 음원출시로 수익방법
            </h1>
            <p className="text-sm text-muted-foreground">
              글로벌 배포의 기본 구조, 구독 조건, 수익 분배, 신청 절차, 법적 고지사항을 한 번에 확인할 수 있는 안내 페이지입니다.
            </p>
          </header>

          <section className="rounded-xl border border-border/70 p-5 space-y-2">
            <h2 className="text-xl font-semibold">1) 배포 가능한 플랫폼</h2>
            <p className="text-sm leading-relaxed text-muted-foreground">
              글로벌 음원 배포는 DistroKid를 포함한(약20여개) 해외 음원 파트너 플랫폼을 통해 진행됩니다. 실제 반영 스토어와 노출 시점은
              각 플랫폼의 심사/정책/지역 지원 여부에 따라 달라질 수 있습니다.
            </p>
          </section>

          <section className="rounded-xl border border-border/70 p-5 space-y-2">
            <h2 className="text-xl font-semibold">2) 이용 가능 구독자</h2>
            <p className="text-sm leading-relaxed text-muted-foreground">
              글로벌 출시 신청은 Pro, Premium 구독자를 대상으로 제공합니다. 신청 시점 및 승인 시점에 구독 상태가 유효해야
              하며, 정책 변경 시 적용 조건이 업데이트될 수 있습니다.
            </p>
          </section>

          <section className="rounded-xl border border-border/70 p-5 space-y-2">
            <h2 className="text-xl font-semibold">3) 수익 분배 구조</h2>
            <p className="text-sm leading-relaxed text-muted-foreground">
              글로벌 출시로 발생하는 순수익(플랫폼 수수료/세금/원천징수 등 공제 후 정산 기준)은 기본적으로 아티스트 85%,
              회사 15% 비율로 분배됩니다. 상세 정산 기준은 대시보드 정산 화면의 월별 내역을 우선 기준으로 합니다.
            </p>
          </section>

          <section className="rounded-xl border border-border/70 p-5 space-y-3">
            <h2 className="text-xl font-semibold">4) 글로벌 출시 신청 방법 · 과정 · 기간</h2>
            <ol className="list-decimal pl-5 space-y-2 text-sm text-muted-foreground leading-relaxed">
              <li>대시보드에서 배포할 음원을 선택하고 릴리즈 정보를 입력합니다.</li>
              <li>권리 보유 확인 체크 후 유통 초안을 생성하고 제출합니다.</li>
              <li>내부 검수(QC) 및 운영 검토를 거쳐 승인/보완/반려 상태가 결정됩니다.</li>
              <li>승인 후 외부 배포사 연동이 진행되며, 플랫폼별 노출 시점이 순차 반영됩니다.</li>
              <li>일반적으로 제출 후 라이브 반영까지 수일~수주가 소요될 수 있습니다.</li>
            </ol>
          </section>

          <section className="rounded-xl border border-border/70 p-5 space-y-2">
            <h2 className="text-xl font-semibold">5) 고지 사항 및 법적 유의점</h2>
            <ul className="list-disc pl-5 space-y-2 text-sm text-muted-foreground leading-relaxed">
              <li>신청자는 음원, 아트워크, 메타데이터에 대한 배포 권리를 보유하거나 적법한 허락을 받아야 합니다.</li>
              <li>타인의 저작권/초상권/상표권 등을 침해한 경우 신청자에게 법적 책임이 발생할 수 있습니다.</li>
              <li>스토어 승인, 반영 시점, 국가별 서비스 여부, 로열티 보고 주기는 각 플랫폼 정책을 따릅니다.</li>
              <li>정책 위반, 권리 분쟁, 사기 의심, 품질 미달 사유가 확인되면 배포가 거절/중단/회수될 수 있습니다.</li>
              <li>세무 처리(원천징수, 조세조약 적용 등)는 국가/계정 상태에 따라 달라질 수 있습니다.</li>
            </ul>
            <p className="text-xs text-muted-foreground pt-1">
              본 페이지는 안내 목적이며, 구체적 법률/세무 판단은 전문가 자문을 권장합니다.
            </p>
          </section>

          <div className="pt-2">
            <Link href="/dashboard#global-distribution-management" className="text-sm text-primary underline underline-offset-2">
              대시보드에서 글로벌 출시 신청하기
            </Link>
          </div>
        </main>
        <Footer />
      </div>
    </PageTransition>
  );
}
