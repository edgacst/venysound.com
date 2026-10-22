import { createRequire } from "node:module";

type PushSubscription = {
  endpoint: string;
  keys: { p256dh: string; auth: string };
};

type WebPushModule = {
  setVapidDetails(subject: string, publicKey: string, privateKey: string): void;
  sendNotification(
    subscription: PushSubscription,
    payload: string,
    options?: { TTL?: number; urgency?: "very-low" | "low" | "normal" | "high" },
  ): Promise<unknown>;
};

const require = createRequire(`${process.cwd()}/package.json`);
const webPush = require("web-push") as WebPushModule;

export function isPushConfigured(): boolean {
  return Boolean(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
}

export async function sendPushNotification(
  subscription: PushSubscription,
  payload: { title: string; body: string; url: string; actions?: { action: string; title: string }[] },
): Promise<void> {
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY?.replace(/\\n/g, "\n");

  if (!publicKey || !privateKey) {
    console.error("[push] VAPID 키가 설정되지 않아 알림을 보내지 못했습니다");
    return;
  }

  try {
    webPush.setVapidDetails(
      process.env.VAPID_SUBJECT || "https://venysound.com",
      publicKey,
      privateKey,
    );

    await webPush.sendNotification(
      subscription,
      JSON.stringify({
        title: payload.title,
        body: payload.body,
        url: payload.url,
        actions: payload.actions,
      }),
      { TTL: 60 * 60, urgency: "normal" },
    );

    console.log("[push] Web Push 전송 성공");
  } catch (error: any) {
    const statusCode = Number(error?.statusCode);
    console.error(
      "[push] Web Push 전송 실패:",
      Number.isFinite(statusCode) && statusCode > 0 ? statusCode : error?.message || error,
    );
  }
}
