import type { Request } from "express";

function escapeHtmlText(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function pathForRequest(req: Request): string {
  const raw = String(req.originalUrl || req.url || "/");
  const pathname = raw.split("?")[0].split("#")[0];
  let p = pathname.startsWith("/") ? pathname : "/";
  if (p.length > 1 && p.endsWith("/")) p = p.slice(0, -1);
  return p || "/";
}

type PageCopy = { title: string; lead: string; sections: { h3: string; p: string }[] };

/** 경로별 고유 본문 — AdSense가 여러 URL을 각각 “얇다”고 보지 않도록 */
function copyForPath(pathname: string): PageCopy {
  const commonLinks =
    '<nav aria-label="주요 페이지" style="display:flex;flex-wrap:wrap;gap:10px;font-size:13px;margin:14px 0;">' +
    '<a href="/" style="color:#c4b5fd;text-decoration:underline;">홈</a>' +
    '<a href="/about" style="color:#c4b5fd;text-decoration:underline;">서비스 소개</a>' +
    '<a href="/explore" style="color:#c4b5fd;text-decoration:underline;">음원 탐색</a>' +
    '<a href="/radio" style="color:#c4b5fd;text-decoration:underline;">라디오</a>' +
    '<a href="/community" style="color:#c4b5fd;text-decoration:underline;">커뮤니티</a>' +
    '<a href="/legal" style="color:#c4b5fd;text-decoration:underline;">이용약관</a>' +
    '<a href="/privacy" style="color:#c4b5fd;text-decoration:underline;">개인정보처리방침</a>' +
    "</nav>";

  const faq: { h3: string; p: string }[] = [
    {
      h3: "VenySound은 어떤 서비스인가요?",
      p: "베니사운드(VenySound)는 회원이 음악을 업로드·공유하고, AI 도구로 새 곡을 만들며, 테마 라디오 채널을 청취할 수 있는 음악 플랫폼입니다. 탐색·인기·커뮤니티·요금제 안내를 통해 콘텐츠를 발견할 수 있습니다.",
    },
    {
      h3: "로그인 없이 무엇을 볼 수 있나요?",
      p: "홈, 음원 탐색, 라디오 목록, 서비스 소개, 이용약관, 개인정보처리방침 등 공개 메뉴를 이용할 수 있습니다. 일부 기능(업로드, AI 생성, 마이페이지)은 회원 가입 후 이용합니다.",
    },
    {
      h3: "문의는 어디로 하나요?",
      p: "운영 관련 문의는 사이트 내 공지·커뮤니티 또는 이용약관·개인정보처리방침에 안내된 연락 경로를 이용해 주세요.",
    },
  ];

  const byPath: Record<string, PageCopy> = {
    "/": {
      title: "베니사운드 VenySound — 음악 공유·AI 음악·라디오",
      lead: "한국어 기반 음악 공유 플랫폼입니다. 공개 음원 목록과 테마 플레이리스트, 24시간 라디오 채널을 제공하며, 크리에이터는 AI 음악 생성·업로드 도구를 통해 작품을 게시할 수 있습니다.",
      sections: [
        {
          h3: "주요 기능",
          p: "음원 탐색 및 재생, 인기·신곡 목록, 라디오 청취, 커뮤니티, 멤버십·요금제, AI 음악 스튜디오(회원), 대량 업로드(회원) 등을 지원합니다.",
        },
        ...faq,
      ],
    },
    "/about": {
      title: "서비스 소개 — VenySound",
      lead: "베니사운드는 음악으로 연결되는 공간을 목표로 합니다. 로고와 브랜드 스토리, 서비스 가치, 이용 안내를 이 페이지에서 확인할 수 있습니다. (화면의 상세 소개는 앱 로딩 후 표시됩니다.)",
      sections: [
        {
          h3: "브랜드·운영 방향",
          p: "창작자와 청취자가 함께 성장하는 음악 생태계를 지향합니다. 공정한 이용 규칙과 개인정보 보호 정책을 공개합니다.",
        },
        ...faq,
      ],
    },
    "/explore": {
      title: "음원 탐색 — VenySound",
      lead: "사이트에 공개된 음원을 장르·인기·검색으로 탐색합니다. AI 표시가 있는 트랙은 AI 생성 음원이며, 해외 출시 필터 등으로 목록을 좁힐 수 있습니다.",
      sections: [
        {
          h3: "탐색 이용 안내",
          p: "검색창에 곡명·아티스트를 입력하거나 카드 목록에서 재생할 수 있습니다. 로그인 시 좋아요·댓글·플레이리스트 등 부가 기능을 사용할 수 있습니다.",
        },
        ...faq,
      ],
    },
    "/radio": {
      title: "라디오 — VenySound",
      lead: "테마별 라디오 채널과 플레이리스트 형식의 연속 재생을 제공합니다. 채널 소개·홈페이지 링크(등록된 경우)·실시간 청취가 가능합니다.",
      sections: [
        {
          h3: "라디오 이용 안내",
          p: "채널을 선택하면 스트리밍이 시작됩니다. 송출·운영 정책은 각 채널 및 서비스 약관을 따릅니다.",
        },
        ...faq,
      ],
    },
    "/community": {
      title: "커뮤니티 — VenySound",
      lead: "회원·방문자가 소식과 의견을 나누는 공간입니다. 공지와 게시글을 통해 서비스 업데이트·이벤트를 확인할 수 있습니다.",
      sections: faq,
    },
    "/legal": {
      title: "이용약관 — VenySound",
      lead: "서비스 이용 조건, 회원 의무, 콘텐츠 저작권·이용 제한, 결제·환불 관련 사항, 면책 및 분쟁 해결 절차를 규정합니다. 전문은 본 페이지 앱 화면 또는 PDF 형태로 제공됩니다.",
      sections: [
        {
          h3: "약관 확인 방법",
          p: "자바스크립트가 활성화된 브라우저에서 전체 조항을 스크롤하여 읽을 수 있습니다. 가입·결제 전 반드시 확인해 주세요.",
        },
        ...faq,
      ],
    },
    "/privacy": {
      title: "개인정보처리방침 — VenySound",
      lead: "수집하는 개인정보 항목, 이용 목적, 보관 기간, 제3자 제공·위탁, 이용자 권리(열람·정정·삭제), 쿠키·로그, 문의처를 안내합니다.",
      sections: [
        {
          h3: "개인정보 보호",
          p: "회원 가입·로그인(이메일·소셜), 서비스 이용 로그, 결제 시 필요한 정보 등은 목적에 맞게 처리하며, 관련 법령을 준수합니다.",
        },
        ...faq,
      ],
    },
  };

  const copy = byPath[pathname] ?? byPath["/"];
  return { ...copy, sections: [...copy.sections] };
}

function renderSections(sections: { h3: string; p: string }[]): string {
  return sections
    .map(
      (s) =>
        `    <h3 style="margin:16px 0 6px;font-size:15px;font-weight:600;">${escapeHtmlText(s.h3)}</h3>` +
        `    <p style="margin:0 0 8px;font-size:14px;opacity:.9;">${escapeHtmlText(s.p)}</p>`,
    )
    .join("\n");
}

/**
 * AdSense 심사(“가치가 별로 없는 콘텐츠”) 대응용: SPA HTML에 경로별 정적 본문을 주입한다.
 */
export function injectAdSenseReviewContent(html: string, req: Request): string {
  if (html.includes('data-venysound="adsense-review"')) return html;

  const path = pathForRequest(req);
  const copy = copyForPath(path);
  const nav =
    '<nav aria-label="주요 페이지" style="display:flex;flex-wrap:wrap;gap:10px;font-size:13px;margin:14px 0 4px;">' +
    '<a href="/" style="color:#c4b5fd;text-decoration:underline;">홈</a>' +
    '<a href="/about" style="color:#c4b5fd;text-decoration:underline;">서비스 소개</a>' +
    '<a href="/explore" style="color:#c4b5fd;text-decoration:underline;">음원 탐색</a>' +
    '<a href="/radio" style="color:#c4b5fd;text-decoration:underline;">라디오</a>' +
    '<a href="/community" style="color:#c4b5fd;text-decoration:underline;">커뮤니티</a>' +
    '<a href="/legal" style="color:#c4b5fd;text-decoration:underline;">이용약관</a>' +
    '<a href="/privacy" style="color:#c4b5fd;text-decoration:underline;">개인정보처리방침</a>' +
    "</nav>";

  const block = [
    "",
    '<article data-venysound="adsense-review" lang="ko" style="max-width:960px;margin:0 auto 32px;padding:24px 16px 40px;color:#e5e7eb;font-family:system-ui,-apple-system,Segoe UI,Roboto,Apple SD Gothic Neo,Noto Sans KR,Helvetica,Arial,sans-serif;line-height:1.7;">',
    `    <h1 style="margin:0 0 10px;font-size:22px;font-weight:700;">${escapeHtmlText(copy.title)}</h1>`,
    `    <p style="margin:0 0 12px;font-size:15px;opacity:.95;">${escapeHtmlText(copy.lead)}</p>`,
    `    <p style="margin:0 0 8px;font-size:13px;opacity:.8;">공개 URL: <code style="padding:2px 6px;border-radius:8px;background:rgba(0,0,0,.35);border:1px solid rgba(255,255,255,.12);">${escapeHtmlText(path)}</code></p>`,
    nav,
    renderSections(copy.sections),
    '    <p style="margin:20px 0 0;font-size:12px;opacity:.7;">© VenySound(베니사운드). 위 내용은 검색·접근성·서비스 안내를 위한 요약입니다.</p>',
    "</article>",
    "",
  ].join("\n");

  const i = html.toLowerCase().lastIndexOf("</body>");
  if (i >= 0) return html.slice(0, i) + block + html.slice(i);
  return html + block;
}
