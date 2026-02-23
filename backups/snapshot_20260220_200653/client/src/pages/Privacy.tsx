import { Navigation } from "@/components/Navigation";
import { Footer } from "@/components/Footer";
import { useEffect } from "react";
import { PageTransition } from "@/components/PageTransition";
import { useSearch } from "wouter";

export default function Privacy() {
  const search = useSearch();
  const params = new URLSearchParams(search);
  const deletionCode = params.get("deletion");

  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  return (
    <PageTransition>
      <div className="min-h-screen bg-background flex flex-col pb-24">
        <Navigation />
        <div className="container max-w-3xl px-4 py-12">
          <h1 className="text-3xl font-display font-bold mb-8" data-testid="text-privacy-title">
            개인정보 및 데이터 삭제 안내
          </h1>

          {deletionCode && (
            <div className="mb-8 p-4 rounded-lg bg-green-500/10 border border-green-500/30 text-green-200">
              <p className="font-medium">데이터 삭제 요청이 접수되었습니다.</p>
              <p className="text-sm mt-1">확인 코드: {deletionCode}</p>
              <p className="text-sm mt-2 text-white/80">
                요청하신 계정 데이터는 처리되었습니다. 문의 사항이 있으시면 아래 연락처로 연락해 주세요.
              </p>
            </div>
          )}

          <div className="space-y-8 text-muted-foreground">
            <section>
              <h2 className="text-xl font-bold text-foreground mb-3">개인정보 처리</h2>
              <p>
                Veny Sound는 서비스 이용 시 수집되는 개인정보를 안전하게 관리하며, 이용 목적이 달성된 후에는 지체 없이 파기합니다.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-bold text-foreground mb-3">사용자 데이터 삭제 요청</h2>
              <p className="mb-3">
                회원님의 데이터를 삭제하고 싶으시면 아래 방법 중 하나로 요청하실 수 있습니다.
              </p>
              <ul className="list-disc list-inside space-y-2 ml-2">
                <li>
                  <strong>소셜 로그인(Facebook, Google, 네이버, 카카오)으로 가입한 경우:</strong> 해당 서비스의 앱/웹사이트 연결 해제 메뉴에서
                  &quot;데이터 삭제 요청&quot; 또는 &quot;앱 연결 해제&quot;를 진행하시면, 당사에 삭제 요청이 전달되어 계정 및 관련 데이터가 삭제 처리됩니다.
                </li>
                <li>
                  <strong>이메일 가입 또는 로그인 계정이 있는 경우:</strong> 로그인 후 설정 또는 고객문의를 통해 계정 삭제를 요청해 주시면
                  동일하게 처리해 드립니다.
                </li>
              </ul>
              <p className="mt-3 text-sm">
                삭제 처리 후 이 페이지에 안내된 확인 코드와 함께 상태 확인 URL이 제공될 수 있습니다.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-bold text-foreground mb-3">문의</h2>
              <p>
                개인정보 및 데이터 삭제 관련 문의는 서비스 내 고객문의 또는 운영자에게 연락해 주세요.
              </p>
            </section>

            <div className="border-t border-white/5 pt-6 text-sm">
              <p>최종 업데이트: 2025년</p>
            </div>
          </div>
        </div>
        <Footer />
      </div>
    </PageTransition>
  );
}
