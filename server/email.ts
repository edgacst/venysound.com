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
