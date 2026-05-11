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
  return pathname.startsWith("/") ? pathname : "/";
}

/**
 * AdSense 심사(“가치가 별로 없는 콘텐츠”) 대응용: SPA HTML에 정적 본문을 주입한다.
 * - JS 실행 전에도 “페이지 소스 보기”에서 텍스트가 충분히 보이도록
 * - UI를 크게 해치지 않도록 하단 소개/가이드 섹션 형태로 제한
 */
export function injectAdSenseReviewContent(html: string, req: Request): string {
  // 이미 주입된 경우(캐시 템플릿 재사용) 중복 삽입 방지
  if (html.includes('data-venysound="adsense-review"')) return html;

  const here = escapeHtmlText(pathForRequest(req));
  const block = [
    "",
    '<section data-venysound="adsense-review" style="max-width:960px;margin:56px auto 24px;padding:0 16px;color:#e5e7eb;font-family:system-ui,-apple-system,Segoe UI,Roboto,Apple SD Gothic Neo,Noto Sans KR,Helvetica,Arial,sans-serif;">',
    '  <div style="border:1px solid rgba(255,255,255,.12);border-radius:16px;background:rgba(255,255,255,.04);padding:18px 18px 16px;line-height:1.65;">',
    '    <h2 style="margin:0 0 8px;font-size:18px;font-weight:700;">VenySound(베니사운드) 소개</h2>',
    '    <p style="margin:0 0 10px;font-size:14px;opacity:.92;">VenySound는 음악 공유·AI 음악 생성·라디오 청취를 한 곳에서 제공하는 서비스입니다. 공개된 음악/라디오 콘텐츠를 탐색하고, 관심 아티스트를 팔로우하거나 플레이리스트를 만들어 감상할 수 있습니다.</p>',
    '    <p style="margin:0 0 12px;font-size:13px;opacity:.85;">현재 페이지 경로: <code style="padding:2px 6px;border-radius:8px;background:rgba(0,0,0,.35);border:1px solid rgba(255,255,255,.12);">' +
      here +
      "</code></p>",
    '    <div style="display:flex;flex-wrap:wrap;gap:10px;font-size:13px;">',
    '      <a href="/about" style="color:#c4b5fd;text-decoration:underline;">서비스 소개</a>',
    '      <a href="/explore" style="color:#c4b5fd;text-decoration:underline;">음원 탐색</a>',
    '      <a href="/radio" style="color:#c4b5fd;text-decoration:underline;">라디오</a>',
    '      <a href="/community" style="color:#c4b5fd;text-decoration:underline;">커뮤니티</a>',
    '      <a href="/legal" style="color:#c4b5fd;text-decoration:underline;">이용약관</a>',
    '      <a href="/privacy" style="color:#c4b5fd;text-decoration:underline;">개인정보처리방침</a>',
    "    </div>",
    '    <p style="margin:12px 0 0;font-size:12px;opacity:.72;">문의: 사이트 내 공지/문의 안내 또는 운영 정책 페이지를 참고해 주세요.</p>',
    "  </div>",
    "</section>",
    "",
  ].join("\n");

  const i = html.toLowerCase().lastIndexOf("</body>");
  if (i >= 0) {
    return html.slice(0, i) + block + html.slice(i);
  }
  return html + block;
}

