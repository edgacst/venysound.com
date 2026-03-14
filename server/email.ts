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

/** 환영 메일 제목·본문 언어별 텍스트 */
const WELCOME_EMAIL: Record<string, { subject: string; greeting: string; body: string; cta: string }> = {
  ko: {
    subject: "[Venysound] 가입을 환영합니다",
    greeting: "님, 안녕하세요.",
    body: "베니사운드에서 이제 음악을 만들고, 업로드하고, 나만의 방송채널을 생성하여 좋은 사람들과 실시간 채팅과 함께 DJ방송도 하면서 수익을 만들어 보세요.",
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
  const html = `
    <p>${username}${t.greeting}</p>
    <p>${t.body}</p>
    <p><a href="${siteUrl}">${t.cta}</a></p>
    <p>— Venysound</p>
  `;
  return { subject: t.subject, html };
}

/** 회원가입 환영 메일. locale(ko|en|ja|zh)에 따라 언어별 발송. */
export async function sendWelcomeEmail(to: string, params: { username: string; locale?: string }): Promise<void> {
  if (!isEmailConfigured()) return;
  try {
    const nodemailer = await import("nodemailer");
    const transporter = nodemailer.default.createTransport({
      host: SMTP_HOST,
      port: SMTP_PORT,
      secure: SMTP_PORT === 465,
      auth: { user: SMTP_USER, pass: SMTP_PASS },
    });
    const { subject, html } = getWelcomeContent(params.locale || "ko", params.username);
    await transporter.sendMail({
      from: MAIL_FROM,
      to,
      subject,
      html,
    });
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
