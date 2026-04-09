/**
 * Simple email sending for "new music for you" notifications.
 * Set SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, MAIL_FROM to enable.
 */

const SMTP_HOST = process.env.SMTP_HOST;
const SMTP_PORT = parseInt(process.env.SMTP_PORT || "587", 10);
const SMTP_USER = process.env.SMTP_USER;
const SMTP_PASS = process.env.SMTP_PASS;
const MAIL_FROM = process.env.MAIL_FROM || process.env.SMTP_USER || "noreply@venysound.com";

export function isEmailConfigured(): boolean {
  return !!(SMTP_HOST && SMTP_USER && SMTP_PASS);
}

/** 발송용 수신 주소 (trim + 간단 형식 검사). 실패 시 null */
export function normalizeOutgoingEmailAddress(to: string | null | undefined): string | null {
  const s = String(to ?? "").trim();
  if (!s || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)) return null;
  return s;
}

function escapeHtml(s: string): string {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** 환영 메일 제목·본문 언어별 텍스트 */
const WELCOME_EMAIL: Record<string, { subject: string; greeting: string; body: string; cta: string }> = {
  ko: {
    subject: "[Venysound] 가입을 환영합니다",
    greeting: "님, 안녕하세요.",
    body: "", // ko는 getWelcomeContent에서 기능 안내 목록·서명을 별도 HTML로 구성
    cta: "Venysound 바로가기",
  },
  en: {
    subject: "[Venysound] Welcome",
    greeting: ", hello.",
    body: "On Venysound, create music, upload tracks, set up your own broadcast channel, and earn while DJing with real-time chat and a great community.",
    cta: "Go to Venysound",
  },
  ja: {
    subject: "[Venysound] ご登録ありがとうございます",
    greeting: "さん、こんにちは。",
    body: "ベニサウンドで音楽を作成・アップロードし、自分だけの放送チャンネルを作って、いい仲間とリアルタイムチャットやDJ放送を楽しみながら収益を得ましょう。",
    cta: "Venysoundへ",
  },
  zh: {
    subject: "[Venysound] 欢迎加入",
    greeting: "，您好。",
    body: "在Venysound，您可以创作音乐、上传作品、创建自己的广播频道，与志同道合的人实时聊天、进行DJ直播并获取收益。",
    cta: "前往 Venysound",
  },
};

function getWelcomeContent(locale: string, username: string): { subject: string; html: string } {
  const lang = locale?.toLowerCase().slice(0, 2) || "ko";
  const t = WELCOME_EMAIL[lang] || WELCOME_EMAIL.ko;
  const siteUrl = process.env.PUBLIC_SITE_URL || "https://venysound.com";
  const safeName = escapeHtml(username);

  if (lang === "ko") {
    const html = `
    <p>${safeName}${t.greeting}</p>
    <ul style="margin:16px 0;padding-left:20px;line-height:1.6;">
      <li style="margin-bottom:8px;">음원 업로드·스트리밍: 내 곡을 올리고 누구나 재생·탐색할 수 있습니다.</li>
      <li style="margin-bottom:8px;">라디오(베니방송): 채널 개설, 청취, 채팅 등 방송형 경험을 제공합니다.</li>
      <li style="margin-bottom:8px;">연속 재생: 페이지를 이동해도 재생이 끊기지 않도록 글로벌 플레이어로 이어집니다.</li>
      <li style="margin-bottom:8px;">AI 음악 생성: 프롬프트·가사 기반으로 곡을 만들고, 원하면 사이트에 공개할 수 있습니다.</li>
      <li style="margin-bottom:8px;">후원·지갑·플랜: 아티스트 후원, 유료 다운로드·구독 혜택 등(정책·플랜에 따름)을 지원합니다.</li>
    </ul>
    <p style="margin-top:20px;">베니사운드 드림</p>
    <p><a href="${siteUrl}">${t.cta}</a></p>
  `;
    return { subject: t.subject, html };
  }

  const html = `
    <p>${safeName}${t.greeting}</p>
    <p>${t.body}</p>
    <p><a href="${siteUrl}">${t.cta}</a></p>
    <p>— Venysound</p>
  `;
  return { subject: t.subject, html };
}

/** 회원가입 환영 메일. locale(ko|en|ja|zh)에 따라 언어별 발송. */
export async function sendWelcomeEmail(to: string, params: { username: string; locale?: string }): Promise<void> {
  if (!isEmailConfigured()) return;
  const recipient = normalizeOutgoingEmailAddress(to);
  if (!recipient) {
    console.warn("[email] sendWelcomeEmail: invalid or empty recipient, skipped");
    return;
  }
  try {
    const nodemailer = await import("nodemailer");
    const transporter = nodemailer.default.createTransport({
      host: SMTP_HOST,
      port: SMTP_PORT,
      secure: SMTP_PORT === 465,
      auth: { user: SMTP_USER, pass: SMTP_PASS },
    });
    const { subject, html } = getWelcomeContent(params.locale || "ko", params.username);
    const fromAddr = String(MAIL_FROM).trim();
    await transporter.sendMail({
      from: MAIL_FROM,
      to: recipient,
      envelope: {
        from: fromAddr,
        to: [recipient],
      },
      subject,
      html,
    });
    if (String(process.env.SMTP_LOG_RECIPIENT || "").trim() === "1") {
      console.log("[email] sendWelcomeEmail delivered envelope to:", recipient);
    }
  } catch (err) {
    console.error("[email] sendWelcomeEmail error:", err);
  }
}

export async function sendNewMusicNotificationEmail(to: string, params: { userName: string; musicTitle: string; artist: string; musicUrl: string }): Promise<void> {
  if (!isEmailConfigured()) return;
  try {
    const nodemailer = await import("nodemailer");
    const transporter = nodemailer.default.createTransport({
      host: SMTP_HOST,
      port: SMTP_PORT,
      secure: SMTP_PORT === 465,
      auth: { user: SMTP_USER, pass: SMTP_PASS },
    });
    const subject = `[Venysound] ${params.userName}님이 좋아할 만한 신곡이 등록되었어요`;
    const html = `
      <p>${params.userName}님, 안녕하세요.</p>
      <p>좋아하실 만한 음악이 신곡으로 등록되었습니다.</p>
      <p><strong>${params.musicTitle}</strong> - ${params.artist}</p>
      <p><a href="${params.musicUrl}">곡 들으러 가기</a></p>
      <p>— Venysound</p>
    `;
    await transporter.sendMail({
      from: MAIL_FROM,
      to,
      subject,
      html,
    });
  } catch (err) {
    console.error("[email] sendNewMusicNotificationEmail error:", err);
  }
}

/** 음원 리뷰·스토리 댓글·게시글 댓글·팔로·좋아요·쪽지 (추천 신곡은 sendNewMusicNotificationEmail 사용) */
export type ActivityEmailKind = "review" | "story_comment" | "post_comment" | "follow" | "like" | "dm";

const ACTIVITY_SUBJECT: Record<ActivityEmailKind, string> = {
  review: "[Venysound] 내 음원에 새 리뷰가 달렸습니다",
  story_comment: "[Venysound] 창작 히스토리에 새 댓글이 있습니다",
  post_comment: "[Venysound] 내 게시글에 새 댓글이 있습니다",
  follow: "[Venysound] 새 팔로워가 있습니다",
  like: "[Venysound] 내 음원에 좋아요가 눌렸습니다",
  dm: "[Venysound] 새 쪽지가 도착했습니다",
};

export async function sendSocialActivityEmail(
  to: string,
  kind: ActivityEmailKind,
  params: {
    recipientName: string;
    actorName: string;
    musicTitle?: string;
    postTitle?: string;
    snippet?: string;
    /** 사이트 경로 (예: /music/1) 또는 전체 URL */
    actionPath: string;
  },
): Promise<void> {
  if (!isEmailConfigured()) return;
  const siteUrl = (process.env.PUBLIC_SITE_URL || process.env.SITE_URL || "https://venysound.com").replace(/\/$/, "");
  const href = params.actionPath.startsWith("http")
    ? params.actionPath
    : `${siteUrl}${params.actionPath.startsWith("/") ? "" : "/"}${params.actionPath}`;

  let bodyLines: string[] = [`<p>${params.recipientName}님, 안녕하세요.</p>`];
  switch (kind) {
    case "review":
      bodyLines.push(`<p><strong>${params.actorName}</strong>님이 회원님의 음원 <strong>${params.musicTitle ?? ""}</strong>에 리뷰를 남겼습니다.</p>`);
      if (params.snippet) bodyLines.push(`<p style="color:#666;">${escapeHtml(params.snippet)}</p>`);
      break;
    case "story_comment":
      bodyLines.push(`<p><strong>${params.actorName}</strong>님이 창작 히스토리에 댓글을 남겼습니다.</p>`);
      if (params.snippet) bodyLines.push(`<p style="color:#666;">${escapeHtml(params.snippet)}</p>`);
      break;
    case "post_comment":
      bodyLines.push(`<p><strong>${params.actorName}</strong>님이 게시글 <strong>${params.postTitle ?? ""}</strong>에 댓글을 남겼습니다.</p>`);
      if (params.snippet) bodyLines.push(`<p style="color:#666;">${escapeHtml(params.snippet)}</p>`);
      break;
    case "follow":
      bodyLines.push(`<p><strong>${params.actorName}</strong>님이 회원님을 팔로우하기 시작했습니다.</p>`);
      break;
    case "like":
      bodyLines.push(
        `<p><strong>${params.actorName}</strong>님이 음원 <strong>${params.musicTitle ?? ""}</strong>에 좋아요를 눌렀습니다.</p>`,
      );
      break;
    case "dm":
      bodyLines.push(`<p><strong>${params.actorName}</strong>님이 쪽지를 보냈습니다.</p>`);
      if (params.snippet) bodyLines.push(`<p style="color:#666;border-left:3px solid #ccc;padding-left:8px;">${escapeHtml(params.snippet)}</p>`);
      break;
  }
  bodyLines.push(`<p><a href="${href}">Venysound에서 확인하기</a></p><p>— Venysound</p>`);
  const html = bodyLines.join("\n");

  try {
    const nodemailer = await import("nodemailer");
    const transporter = nodemailer.default.createTransport({
      host: SMTP_HOST,
      port: SMTP_PORT,
      secure: SMTP_PORT === 465,
      auth: { user: SMTP_USER, pass: SMTP_PASS },
    });
    await transporter.sendMail({
      from: MAIL_FROM,
      to,
      subject: ACTIVITY_SUBJECT[kind],
      html,
    });
  } catch (err) {
    console.error("[email] sendSocialActivityEmail error:", err);
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export type SensitiveOtpEmailKind = "credit_refund" | "account_email";

/** 크레딧 환불·계정 이메일 등록 등 민감 작업용 6자리 OTP 메일 */
export async function sendSensitiveOtpEmail(
  to: string,
  params: { code: string; kind: SensitiveOtpEmailKind }
): Promise<void> {
  if (!isEmailConfigured()) return;
  const subject =
    params.kind === "credit_refund"
      ? "[Venysound] 크레딧 환불 본인확인 인증 코드"
      : params.kind === "account_email"
        ? "[Venysound] 계정 이메일 인증 코드"
        : "[Venysound] 인증 코드";
  const intro =
    params.kind === "credit_refund"
      ? "크레딧 환불 신청을 위한 본인확인 코드입니다. 타인에게 공유하지 마세요."
      : params.kind === "account_email"
        ? "계정에 등록할 이메일 주소 확인을 위한 인증 코드입니다. 타인에게 공유하지 마세요."
        : "요청하신 본인확인 코드입니다. 타인에게 공유하지 마세요.";
  const html = `
    <p>${escapeHtml(intro)}</p>
    <p style="font-size:22px;font-weight:bold;letter-spacing:4px;">${escapeHtml(params.code)}</p>
    <p>유효 시간: 약 10분</p>
    <p>— Venysound</p>
  `;
  try {
    const nodemailer = await import("nodemailer");
    const transporter = nodemailer.default.createTransport({
      host: SMTP_HOST,
      port: SMTP_PORT,
      secure: SMTP_PORT === 465,
      auth: { user: SMTP_USER, pass: SMTP_PASS },
    });
    await transporter.sendMail({
      from: MAIL_FROM,
      to,
      subject,
      html,
    });
  } catch (err) {
    console.error("[email] sendSensitiveOtpEmail error:", err);
    throw err;
  }
}

export type SubscriptionEmailKind = "started" | "renewed" | "cancelled";

const SUBSCRIPTION_PLAN_LABEL: Record<string, string> = {
  starter: "Starter",
  basic: "Basic",
  pro: "Pro",
  premium: "Premium",
};

function subscriptionPlanDisplayName(planId: string | null | undefined): string {
  if (!planId) return "Pro";
  return SUBSCRIPTION_PLAN_LABEL[planId] ?? planId;
}

/** 구독 시작·갱신·즉시 해지 안내 메일 (SMTP 미설정 시 생략, 실패해도 throw 하지 않음) */
export async function sendSubscriptionEmail(
  to: string | null | undefined,
  params: {
    kind: SubscriptionEmailKind;
    /** 표시용 플랜 id: pro, premium, … */
    planId?: string | null;
    billingPeriod?: "monthly" | "yearly" | null;
    expiresAt?: Date | null;
    amountWon?: number | null;
    recipientName?: string | null;
  },
): Promise<void> {
  if (!to || !String(to).trim()) return;
  if (!isEmailConfigured()) return;

  const planName = subscriptionPlanDisplayName(params.planId ?? "pro");
  const cycle =
    params.billingPeriod === "monthly" ? "월간" : params.billingPeriod === "yearly" ? "연간" : "";
  const siteUrl = (process.env.PUBLIC_SITE_URL || process.env.SITE_URL || "https://venysound.com").replace(/\/$/, "");
  const expStr =
    params.expiresAt instanceof Date && !isNaN(params.expiresAt.getTime())
      ? params.expiresAt.toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })
      : null;
  const amountStr =
    params.amountWon != null && Number.isFinite(Number(params.amountWon))
      ? `${Number(params.amountWon).toLocaleString("ko-KR")}원`
      : null;

  let subject: string;
  let bodyLines: string[];

  const greet = params.recipientName?.trim()
    ? `<p>${escapeHtml(params.recipientName.trim())}님, 안녕하세요.</p>`
    : `<p>안녕하세요.</p>`;

  switch (params.kind) {
    case "started":
      subject = `[Venysound] ${planName} 구독이 완료되었습니다`;
      bodyLines = [
        greet,
        `<p><strong>${escapeHtml(planName)}</strong> 구독 결제가 완료되었습니다.${cycle ? ` (${escapeHtml(cycle)})` : ""}</p>`,
      ];
      if (amountStr) bodyLines.push(`<p>결제 금액: ${escapeHtml(amountStr)}</p>`);
      if (expStr) bodyLines.push(`<p>이용 만료 예정: ${escapeHtml(expStr)} (KST)</p>`);
      bodyLines.push(`<p>이용 내역·플랜 안내는 사이트에서 확인하실 수 있습니다.</p>`);
      bodyLines.push(`<p><a href="${siteUrl}/pricing">플랜 및 혜택 보기</a></p>`);
      break;
    case "renewed":
      subject = `[Venysound] ${planName} 구독이 갱신되었습니다`;
      bodyLines = [
        greet,
        `<p><strong>${escapeHtml(planName)}</strong> 정기 결제가 완료되어 구독이 갱신되었습니다.${cycle ? ` (${escapeHtml(cycle)})` : ""}</p>`,
      ];
      if (amountStr) bodyLines.push(`<p>결제 금액: ${escapeHtml(amountStr)}</p>`);
      if (expStr) bodyLines.push(`<p>갱신 후 이용 만료 예정: ${escapeHtml(expStr)} (KST)</p>`);
      bodyLines.push(`<p><a href="${siteUrl}/pricing">구독 정보 확인</a></p>`);
      break;
    case "cancelled":
      subject = `[Venysound] 구독이 해지되었습니다`;
      bodyLines = [
        greet,
        `<p>요청하신 대로 <strong>${escapeHtml(planName)}</strong> 구독이 해지되었습니다.</p>`,
        `<p>카드 정기 결제는 더 이상 이루어지지 않으며, 혜택은 해지 시점 기준으로 종료됩니다.</p>`,
        `<p><a href="${siteUrl}/pricing">플랜 안내</a></p>`,
      ];
      break;
    default:
      return;
  }

  const html = `${bodyLines.join("\n")}\n<p>— Venysound</p>`;

  try {
    const nodemailer = await import("nodemailer");
    const transporter = nodemailer.default.createTransport({
      host: SMTP_HOST,
      port: SMTP_PORT,
      secure: SMTP_PORT === 465,
      auth: { user: SMTP_USER, pass: SMTP_PASS },
    });
    await transporter.sendMail({
      from: MAIL_FROM,
      to: String(to).trim(),
      subject,
      html,
    });
  } catch (err) {
    console.error("[email] sendSubscriptionEmail error:", err);
  }
}